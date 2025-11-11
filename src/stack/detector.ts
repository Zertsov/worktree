/**
 * Stack detection - auto-detect parent-child relationships
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
    const stacks = this.groupIntoStacks(relationships, worktrees);
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
      const config = await this.configManager.load();
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

    // Third pass: build children lists
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
    const result = await GitOperations.execOrThrow(
      ['rev-parse', ref],
      this.repoRoot
    );
    this.revParseCache.set(ref, result.trim());
    return result.trim();
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

        // Skip if current branch is not ahead of the merge-base
        if (!distanceFromBase || distanceFromBase === 0) {
          return null;
        }

        // Early termination: if we find an exact match, return immediately
        if (isExactMatch) {
          return {
            branch: candidate,
            mergeBase,
            distance: distanceFromBase,
            isExactMatch: true,
            priority: 0, // Highest priority
          };
        }

        // Check distance from merge-base to candidate
        const distanceToCandidate = await this.getCommitDistanceCached(mergeBase, candidate);

        // Only consider as parent if distance from merge-base to candidate is small
        if (distanceToCandidate !== null && distanceToCandidate <= 10) {
          return {
            branch: candidate,
            mergeBase,
            distance: distanceFromBase,
            isExactMatch: false,
            priority: 1,
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
    try {
      const result = await GitOperations.execOrThrow(
        ['rev-list', '--count', `${from}..${to}`],
        this.repoRoot
      );
      return parseInt(result.trim(), 10);
    } catch {
      return null;
    }
  }

  /**
   * Group branches into stacks based on relationships
   */
  private groupIntoStacks(
    relationships: Map<string, BranchRelationship>,
    worktrees: Worktree[]
  ): Map<string, Stack> {
    const stacks = new Map<string, Stack>();
    const branchToRoot = new Map<string, string>();

    // Find all root branches (branches without parents)
    const roots = Array.from(relationships.values())
      .filter((rel) => !rel.parent)
      .map((rel) => rel.branch);

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

        // Add children to queue
        queue.push(...rel.children);
      }

      stacks.set(root, stack);
    }

    // Build stack nodes with depth information
    for (const [root, stack] of stacks.entries()) {
      this.buildStackNodes(stack, relationships, worktrees);
    }

    return stacks;
  }

  /**
   * Build detailed node information for a stack
   */
  private buildStackNodes(
    stack: Stack,
    relationships: Map<string, BranchRelationship>,
    worktrees: Worktree[]
  ): void {
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
      };
      stack.nodes.set(branch, node);
    }
  }

  /**
   * Get all branches for a repository
   */
  async getAllBranches(): Promise<Branch[]> {
    const output = await GitOperations.listBranches(this.repoRoot);
    const branches = GitParser.parseBranches(output);

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
    const output = await GitOperations.listWorktrees(this.repoRoot);
    return GitParser.parseWorktrees(output);
  }
}

