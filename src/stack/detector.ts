/**
 * Stack detection - auto-detect parent-child relationships
 * Uses neverthrow Result types internally
 */

import { GitOperations } from '../git/operations.js';
import { GitParser } from '../git/parser.js';
import { ConfigManager } from '../config/manager.js';
import type { Branch, Worktree } from '../git/types.js';
import type { BranchRelationship, Stack, StackNode } from './types.js';

export class StackDetector {
  private repoRoot: string;
  private configManager: ConfigManager;
  private cachedBranchParents: Record<string, string> | null = null;

  // Memoization caches for git operations
  private mergeBaseCache = new Map<string, string | null>();
  private revParseCache = new Map<string, string>();
  private commitDistanceCache = new Map<string, number | null>();

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.configManager = new ConfigManager(repoRoot);
  }

  /**
   * Detect all stacks and their relationships
   */
  async detectStacks(
    branches: Branch[],
    worktrees: Worktree[]
  ): Promise<Map<string, Stack>> {
    const relationships = await this.buildRelationships(branches);
    const stacks = await this.groupIntoStacks(relationships, worktrees);
    return stacks;
  }

  /**
   * Build parent-child relationships for all branches
   */
  private async buildRelationships(
    branches: Branch[]
  ): Promise<Map<string, BranchRelationship>> {
    const relationships = new Map<string, BranchRelationship>();

    // Load config once for all branches
    if (!this.cachedBranchParents) {
      const configResult = await this.configManager.load();
      const config = configResult.isOk() ? configResult.value : { branchParents: {} };
      this.cachedBranchParents = config.branchParents || {};
    }

    // Initialize all branches
    for (const branch of branches) {
      relationships.set(branch.name, {
        branch: branch.name,
        parent: null,
        children: [],
      });
    }

    // First pass: get explicit parents from config
    for (const branch of branches) {
      const parent = this.cachedBranchParents[branch.name];
      if (parent && relationships.has(parent)) {
        const rel = relationships.get(branch.name)!;
        rel.parent = parent;
      }
    }

    // Second pass: try to detect parents from merge-base
    for (const branch of branches) {
      const rel = relationships.get(branch.name)!;
      if (rel.parent) continue; // Already has explicit parent

      // Try to find parent by checking merge-base with potential parents
      const parent = await this.detectParentBranch(branch.name, branches);
      if (parent) {
        rel.parent = parent;
      }
    }

    // Third pass: detect and break circular dependencies
    // If A→B and B→A, keep the relationship where the parent is more "root-like"
    for (const [branchName, rel] of relationships.entries()) {
      if (rel.parent) {
        const parentRel = relationships.get(rel.parent);
        if (parentRel?.parent === branchName) {
          // Circular dependency detected: branchName→parent and parent→branchName
          // Break the cycle by preferring common base branches as parents
          const commonBases = ['main', 'master', 'develop', 'dev'];
          const branchIsCommonBase = commonBases.includes(branchName);
          const parentIsCommonBase = commonBases.includes(rel.parent);

          if (parentIsCommonBase && !branchIsCommonBase) {
            // Keep parent as the parent, remove branchName as parent of parent
            parentRel.parent = null;
          } else if (branchIsCommonBase && !parentIsCommonBase) {
            // Keep branchName as root, remove its parent
            rel.parent = null;
          } else {
            // Both or neither are common bases - use alphabetical order
            if (branchName < rel.parent) {
              parentRel.parent = null;
            } else {
              rel.parent = null;
            }
          }
        }
      }
    }

    // Fourth pass: build children lists
    for (const [branchName, rel] of relationships.entries()) {
      if (rel.parent) {
        const parentRel = relationships.get(rel.parent);
        if (parentRel && !parentRel.children.includes(branchName)) {
          parentRel.children.push(branchName);
        }
      }
    }

    return relationships;
  }

  /**
   * Memoized getMergeBase
   */
  private async getMergeBaseCached(
    branch1: string,
    branch2: string
  ): Promise<string | null> {
    const key = `${branch1}:${branch2}`;
    if (this.mergeBaseCache.has(key)) {
      return this.mergeBaseCache.get(key)!;
    }
    const result = await GitOperations.getMergeBase(branch1, branch2, this.repoRoot);
    this.mergeBaseCache.set(key, result);
    return result;
  }

  /**
   * Memoized rev-parse
   */
  private async revParseCached(ref: string): Promise<string> {
    if (this.revParseCache.has(ref)) {
      return this.revParseCache.get(ref)!;
    }
    const result = await GitOperations.getCommit(ref, this.repoRoot);
    if (result.isErr()) {
      return '';
    }
    this.revParseCache.set(ref, result.value);
    return result.value;
  }

  /**
   * Memoized getCommitDistance
   */
  private async getCommitDistanceCached(
    from: string,
    to: string
  ): Promise<number | null> {
    const key = `${from}:${to}`;
    if (this.commitDistanceCache.has(key)) {
      return this.commitDistanceCache.get(key)!;
    }
    const result = await this.getCommitDistance(from, to);
    this.commitDistanceCache.set(key, result);
    return result;
  }

  /**
   * Detect parent branch using merge-base heuristic (optimized with parallelization)
   */
  private async detectParentBranch(
    branch: string,
    allBranches: Branch[]
  ): Promise<string | null> {
    // Common base branches to check first
    const commonBases = ['main', 'master', 'develop', 'dev'];
    const candidateBranches = [
      ...commonBases.filter((b) => allBranches.some((br) => br.name === b)),
      ...allBranches.map((b) => b.name).filter((b) => !commonBases.includes(b)),
    ];

    // Filter out the branch itself
    const candidates = candidateBranches.filter((c) => c !== branch);

    // Parallelize merge-base checks for all candidates
    const mergeBaseResults = await Promise.allSettled(
      candidates.map(async (candidate) => {
        const mergeBase = await this.getMergeBaseCached(branch, candidate);
        return { candidate, mergeBase };
      })
    );

    // Extract successful merge-base results
    const validMergeBases = mergeBaseResults
      .filter((r) => r.status === 'fulfilled' && r.value.mergeBase !== null)
      .map((r) => (r as PromiseFulfilledResult<{ candidate: string; mergeBase: string | null }>).value)
      .filter((v) => v.mergeBase !== null) as Array<{ candidate: string; mergeBase: string }>;

    if (validMergeBases.length === 0) {
      return null;
    }

    // Parallelize rev-parse for all candidates with valid merge-bases
    const candidateHeads = await Promise.allSettled(
      validMergeBases.map(async ({ candidate }) => {
        const head = await this.revParseCached(candidate);
        return { candidate, head };
      })
    );

    const candidateHeadMap = new Map<string, string>();
    candidateHeads
      .filter((r) => r.status === 'fulfilled')
      .forEach((r) => {
        const { candidate, head } = (r as PromiseFulfilledResult<{ candidate: string; head: string }>).value;
        candidateHeadMap.set(candidate, head);
      });

    // Process each candidate in parallel to check if it's a valid parent
    const potentialParentsResults = await Promise.allSettled(
      validMergeBases.map(async ({ candidate, mergeBase }) => {
        const candidateHead = candidateHeadMap.get(candidate);
        if (!candidateHead) return null;

        const isExactMatch = candidateHead === mergeBase.trim();

        // Calculate distance from merge-base to current branch
        const distanceFromBase = await this.getCommitDistanceCached(mergeBase, branch);

        // Skip if we couldn't calculate distance (error case)
        if (distanceFromBase === null) {
          return null;
        }

        // Allow distance of 0 only if candidate is at merge-base (freshly created branch)
        // Reject distance of 0 when candidate has diverged from merge-base
        if (distanceFromBase === 0 && !isExactMatch) {
          return null;
        }

        // Exact match: candidate is at merge-base (hasn't moved since child branched)
        if (isExactMatch) {
          return {
            branch: candidate,
            mergeBase,
            distance: distanceFromBase,
            isExactMatch: true,
            priority: 0, // Highest priority
          };
        }

        // Allow parent to have moved forward, but not too far
        // This handles the case where you branch off main, then main gets more commits
        const distanceToCandidate = await this.getCommitDistanceCached(mergeBase, candidate);

        if (distanceToCandidate !== null && distanceToCandidate <= 50) {
          // Prefer common base branches (main, master, develop) as parents
          const commonBasesLocal = ['main', 'master', 'develop', 'dev'];
          const isCommonBase = commonBasesLocal.includes(candidate);

          return {
            branch: candidate,
            mergeBase,
            distance: distanceFromBase,
            isExactMatch: false,
            priority: isCommonBase ? 1 : 2, // Common bases get higher priority
          };
        }

        return null;
      })
    );

    // Filter out null results and extract valid potential parents
    const potentialParents = potentialParentsResults
      .filter((r) => r.status === 'fulfilled' && r.value !== null)
      .map((r) => (r as PromiseFulfilledResult<{
        branch: string;
        mergeBase: string;
        distance: number;
        isExactMatch: boolean;
        priority: number;
      } | null>).value)
      .filter((v) => v !== null) as Array<{
        branch: string;
        mergeBase: string;
        distance: number;
        isExactMatch: boolean;
        priority: number;
      }>;

    if (potentialParents.length === 0) {
      return null;
    }

    // Sort by priority (exact matches first), then by distance
    potentialParents.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.distance - b.distance;
    });

    return potentialParents[0].branch;
  }

  /**
   * Get commit distance between two commits
   */
  private async getCommitDistance(
    from: string,
    to: string
  ): Promise<number | null> {
    const result = await GitOperations.execResult(
      ['rev-list', '--count', `${from}..${to}`],
      this.repoRoot
    );
    if (result.isErr()) {
      return null;
    }
    return parseInt(result.value.trim(), 10);
  }

  /**
   * Group branches into stacks based on relationships
   */
  private async groupIntoStacks(
    relationships: Map<string, BranchRelationship>,
    worktrees: Worktree[]
  ): Promise<Map<string, Stack>> {
    const stacks = new Map<string, Stack>();
    const branchToRoot = new Map<string, string>();

    // Find all stack roots:
    // 1. Branches without parents (traditional roots like main)
    // 2. Branches that have children (form their own sub-stacks)
    const roots = Array.from(relationships.values())
      .filter((rel) => !rel.parent || rel.children.length > 0)
      .map((rel) => rel.branch);

    // Identify which branches should be treated as sub-stack roots
    // (branches with both a parent AND children)
    const subStackRoots = new Set<string>(
      Array.from(relationships.values())
        .filter((rel) => rel.parent && rel.children.length > 0)
        .map((rel) => rel.branch)
    );

    // Build stacks from each root
    for (const root of roots) {
      const stack: Stack = {
        root,
        branches: [],
        color: '', // Will be set by color manager
        nodes: new Map(),
      };

      // BFS to collect all branches in this stack
      const queue = [root];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const rel = relationships.get(current);
        if (!rel) continue;

        stack.branches.push(current);
        branchToRoot.set(current, root);

        // Add children to queue, but skip those that are sub-stack roots
        // (unless we're currently building that sub-stack)
        for (const child of rel.children) {
          if (child !== root && subStackRoots.has(child)) {
            // This child is a sub-stack root, don't include it in parent's stack
            continue;
          }
          queue.push(child);
        }
      }

      stacks.set(root, stack);
    }

    // Build stack nodes with depth information
    for (const [_root, stack] of stacks.entries()) {
      await this.buildStackNodes(stack, relationships, worktrees);
    }

    return stacks;
  }

  /**
   * Build detailed node information for a stack
   */
  private async buildStackNodes(
    stack: Stack,
    relationships: Map<string, BranchRelationship>,
    worktrees: Worktree[]
  ): Promise<void> {
    const worktreeMap = new Map<string, Worktree>();
    for (const wt of worktrees) {
      if (wt.branch) {
        worktreeMap.set(wt.branch, wt);
      }
    }

    // Calculate depth for each branch using BFS
    const depths = new Map<string, number>();
    const queue: [string, number][] = [[stack.root, 0]];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const [branch, depth] = queue.shift()!;
      if (visited.has(branch)) continue;
      visited.add(branch);

      depths.set(branch, depth);

      const rel = relationships.get(branch);
      if (rel) {
        for (const child of rel.children) {
          queue.push([child, depth + 1]);
        }
      }
    }

    // Fetch commit hashes for all branches in parallel
    const commitHashes = await Promise.allSettled(
      stack.branches.map(async (branch) => {
        const commit = await this.revParseCached(branch);
        return { branch, commit };
      })
    );

    const commitMap = new Map<string, string>();
    commitHashes
      .filter((r) => r.status === 'fulfilled')
      .forEach((r) => {
        const { branch, commit } = (r as PromiseFulfilledResult<{ branch: string; commit: string }>).value;
        commitMap.set(branch, commit);
      });

    // Create nodes
    for (const branch of stack.branches) {
      const rel = relationships.get(branch)!;
      const node: StackNode = {
        branch,
        parent: rel.parent,
        children: rel.children,
        worktree: worktreeMap.get(branch) || null,
        color: stack.color,
        depth: depths.get(branch) || 0,
        commit: commitMap.get(branch),
      };
      stack.nodes.set(branch, node);
    }
  }

  /**
   * Get all branches for a repository
   */
  async getAllBranches(): Promise<Branch[]> {
    const outputResult = await GitOperations.listBranches(this.repoRoot);
    if (outputResult.isErr()) {
      return [];
    }

    const branches = GitParser.parseBranches(outputResult.value);

    // Mark current branch
    const currentBranch = await GitOperations.getCurrentBranch(this.repoRoot);
    if (currentBranch) {
      const branch = branches.find((b) => b.name === currentBranch);
      if (branch) {
        branch.current = true;
      }
    }

    return branches;
  }

  /**
   * Get all worktrees for a repository
   */
  async getAllWorktrees(): Promise<Worktree[]> {
    const outputResult = await GitOperations.listWorktrees(this.repoRoot);
    if (outputResult.isErr()) {
      return [];
    }
    return GitParser.parseWorktrees(outputResult.value);
  }
}
