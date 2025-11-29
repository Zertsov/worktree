/**
 * Stack sync detection and execution
 */

import { GitOperations } from '../git/operations.js';
import { StackManager, type BranchStackMetadata } from './manager.js';
import {
  StackResult,
  StackErrors,
  stackOk,
  stackErr,
} from './errors.js';

/**
 * Sync status for a single branch
 */
export interface BranchSyncStatus {
  branch: string;
  parent: string;
  baseCommit: string;
  parentHead: string;
  status: 'synced' | 'behind' | 'diverged' | 'error';
  commitsBehind: number;
  commitsAhead: number; // Commits in branch not in parent
  error?: string;
}

/**
 * Sync status for an entire stack
 */
export interface StackSyncStatus {
  stackName: string;
  trunk: string;
  branches: BranchSyncStatus[];
  needsSync: boolean;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  branch: string;
  success: boolean;
  newBase?: string;
  error?: string;
  conflictFiles?: string[];
}

/**
 * Sync manager for detecting and executing sync operations
 */
export class SyncManager {
  private manager: StackManager;

  constructor(private readonly repoRoot: string) {
    this.manager = new StackManager(repoRoot);
  }

  /**
   * Get sync status for all branches in a stack
   */
  async getStackSyncStatus(stackName: string): Promise<StackResult<StackSyncStatus>> {
    const stackMeta = await this.manager.getStackMetadata(stackName);
    if (stackMeta.isErr()) {
      return stackMeta;
    }

    const branchesResult = await this.manager.getStackBranches(stackName);
    if (branchesResult.isErr()) {
      return branchesResult;
    }

    const branches = branchesResult.value;
    const statuses: BranchSyncStatus[] = [];

    // Get status for each branch in order (root first)
    const orderedBranches = this.orderBranchesByDepth(branches, stackMeta.value.trunk);

    for (const branchName of orderedBranches) {
      const meta = branches.get(branchName);
      if (!meta) continue;

      const status = await this.getBranchSyncStatus(branchName, meta);
      statuses.push(status);
    }

    const needsSync = statuses.some(s => s.status === 'behind' || s.status === 'diverged');

    return stackOk({
      stackName,
      trunk: stackMeta.value.trunk,
      branches: statuses,
      needsSync,
    });
  }

  /**
   * Get sync status for a single branch
   */
  async getBranchSyncStatus(
    branchName: string,
    meta: BranchStackMetadata
  ): Promise<BranchSyncStatus> {
    const baseStatus: BranchSyncStatus = {
      branch: branchName,
      parent: meta.parent,
      baseCommit: meta.baseCommit,
      parentHead: '',
      status: 'synced',
      commitsBehind: 0,
      commitsAhead: 0,
    };

    try {
      // Get current HEAD of parent branch
      const parentHead = await GitOperations.execOrThrow(
        ['rev-parse', meta.parent],
        this.repoRoot
      );
      baseStatus.parentHead = parentHead;

      // If base commit matches parent HEAD, we're synced
      if (meta.baseCommit === parentHead) {
        return baseStatus;
      }

      // Check if base commit is an ancestor of parent HEAD
      const isAncestor = await this.isAncestor(meta.baseCommit, parentHead);
      
      if (isAncestor) {
        // Parent has moved forward, we're behind
        const commitsBehind = await this.countCommits(meta.baseCommit, parentHead);
        return {
          ...baseStatus,
          status: 'behind',
          commitsBehind,
        };
      }

      // Check if we've diverged (rebased, force-pushed, etc.)
      const mergeBase = await GitOperations.getMergeBase(branchName, meta.parent, this.repoRoot);
      if (mergeBase && mergeBase !== meta.baseCommit) {
        const commitsBehind = await this.countCommits(mergeBase, parentHead);
        const commitsAhead = await this.countCommits(mergeBase, branchName);
        return {
          ...baseStatus,
          status: 'diverged',
          commitsBehind,
          commitsAhead,
        };
      }

      return baseStatus;
    } catch (e) {
      return {
        ...baseStatus,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * Sync a branch with its parent via rebase
   */
  async syncBranch(
    branchName: string,
    options: { merge?: boolean; force?: boolean } = {}
  ): Promise<StackResult<SyncResult>> {
    const branchMeta = await this.manager.getBranchStack(branchName);
    if (branchMeta.isErr()) {
      return branchMeta;
    }

    const meta = branchMeta.value;

    // Check for uncommitted changes
    const hasChanges = await this.hasUncommittedChanges(branchName);
    if (hasChanges && !options.force) {
      return StackErrors.uncommittedChanges(branchName);
    }

    // Get current branch to restore later
    const currentBranch = await GitOperations.getCurrentBranch(this.repoRoot);

    try {
      // Checkout the branch to sync
      await GitOperations.execOrThrow(['checkout', branchName], this.repoRoot);

      if (options.merge) {
        // Merge mode
        const mergeResult = await this.mergeBranch(branchName, meta.parent);
        if (mergeResult.isErr()) {
          // Restore original branch on failure
          if (currentBranch && currentBranch !== branchName) {
            await GitOperations.exec(['checkout', currentBranch], this.repoRoot);
          }
          return mergeResult;
        }
      } else {
        // Rebase mode (default)
        const rebaseResult = await this.rebaseBranch(branchName, meta.parent);
        if (rebaseResult.isErr()) {
          // Restore original branch on failure
          if (currentBranch && currentBranch !== branchName) {
            await GitOperations.exec(['checkout', currentBranch], this.repoRoot);
          }
          return rebaseResult;
        }
      }

      // Get new parent HEAD and update base commit
      const newBase = await GitOperations.execOrThrow(
        ['rev-parse', meta.parent],
        this.repoRoot
      );

      await this.manager.updateBranchBase(branchName, newBase);

      // Restore original branch if different
      if (currentBranch && currentBranch !== branchName) {
        await GitOperations.exec(['checkout', currentBranch], this.repoRoot);
      }

      return stackOk({
        branch: branchName,
        success: true,
        newBase,
      });
    } catch (e) {
      // Try to restore original branch
      if (currentBranch) {
        await GitOperations.exec(['checkout', currentBranch], this.repoRoot);
      }

      return stackErr(
        'GIT_ERROR',
        `Failed to sync ${branchName}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  /**
   * Sync all branches in a stack that need syncing
   */
  async syncStack(
    stackName: string,
    options: { merge?: boolean; force?: boolean } = {}
  ): Promise<StackResult<SyncResult[]>> {
    const statusResult = await this.getStackSyncStatus(stackName);
    if (statusResult.isErr()) {
      return statusResult;
    }

    const status = statusResult.value;
    const results: SyncResult[] = [];

    // Sync branches in order (root first, then children)
    for (const branchStatus of status.branches) {
      if (branchStatus.status === 'synced') {
        results.push({
          branch: branchStatus.branch,
          success: true,
        });
        continue;
      }

      if (branchStatus.status === 'error') {
        results.push({
          branch: branchStatus.branch,
          success: false,
          error: branchStatus.error,
        });
        continue;
      }

      const syncResult = await this.syncBranch(branchStatus.branch, options);
      if (syncResult.isErr()) {
        results.push({
          branch: branchStatus.branch,
          success: false,
          error: syncResult.error.message,
          conflictFiles: syncResult.error.details?.files as string[] | undefined,
        });
        // Stop on first failure
        break;
      }

      results.push(syncResult.value);
    }

    return stackOk(results);
  }

  /**
   * Update all base commits to current state (after manual operations)
   */
  async restackBranches(stackName: string): Promise<StackResult<void>> {
    const branchesResult = await this.manager.getStackBranches(stackName);
    if (branchesResult.isErr()) {
      return branchesResult;
    }

    for (const [branchName, meta] of branchesResult.value) {
      const parentHead = await GitOperations.execOrThrow(
        ['rev-parse', meta.parent],
        this.repoRoot
      );
      await this.manager.updateBranchBase(branchName, parentHead);
    }

    return stackOk(undefined);
  }

  // ============ Private Helpers ============

  /**
   * Order branches by depth (parents before children)
   */
  private orderBranchesByDepth(
    branches: Map<string, BranchStackMetadata>,
    trunk: string
  ): string[] {
    const ordered: string[] = [];
    const visited = new Set<string>();

    const visit = (parent: string) => {
      for (const [branch, meta] of branches) {
        if (meta.parent === parent && !visited.has(branch)) {
          visited.add(branch);
          ordered.push(branch);
          visit(branch);
        }
      }
    };

    visit(trunk);
    return ordered;
  }

  /**
   * Check if commit A is an ancestor of commit B
   */
  private async isAncestor(commitA: string, commitB: string): Promise<boolean> {
    const result = await GitOperations.exec(
      ['merge-base', '--is-ancestor', commitA, commitB],
      this.repoRoot
    );
    return result.exitCode === 0;
  }

  /**
   * Count commits between two refs
   */
  private async countCommits(from: string, to: string): Promise<number> {
    try {
      const result = await GitOperations.execOrThrow(
        ['rev-list', '--count', `${from}..${to}`],
        this.repoRoot
      );
      return parseInt(result, 10);
    } catch {
      return 0;
    }
  }

  /**
   * Check if a branch has uncommitted changes
   */
  private async hasUncommittedChanges(branch: string): Promise<boolean> {
    try {
      // Get the worktree path for this branch if it exists
      const result = await GitOperations.exec(
        ['worktree', 'list', '--porcelain'],
        this.repoRoot
      );

      // For now, just check the main repo's status
      // TODO: handle worktrees properly
      const status = await GitOperations.exec(
        ['status', '--porcelain'],
        this.repoRoot
      );

      return status.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Rebase a branch onto its parent
   */
  private async rebaseBranch(
    branch: string,
    parent: string
  ): Promise<StackResult<void>> {
    const result = await GitOperations.exec(
      ['rebase', parent],
      this.repoRoot
    );

    if (result.exitCode !== 0) {
      // Check if there are conflicts
      const statusResult = await GitOperations.exec(
        ['status', '--porcelain'],
        this.repoRoot
      );

      const conflictLines = statusResult.stdout
        .split('\n')
        .filter(line => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DD'));

      if (conflictLines.length > 0) {
        const conflictFiles = conflictLines.map(line => line.slice(3));
        
        // Abort the rebase so we don't leave things in a bad state
        await GitOperations.exec(['rebase', '--abort'], this.repoRoot);
        
        return StackErrors.syncConflict(branch, conflictFiles);
      }

      return StackErrors.gitError('rebase', result.stderr);
    }

    return stackOk(undefined);
  }

  /**
   * Merge parent into a branch
   */
  private async mergeBranch(
    branch: string,
    parent: string
  ): Promise<StackResult<void>> {
    const result = await GitOperations.exec(
      ['merge', parent, '--no-edit'],
      this.repoRoot
    );

    if (result.exitCode !== 0) {
      // Check if there are conflicts
      const statusResult = await GitOperations.exec(
        ['status', '--porcelain'],
        this.repoRoot
      );

      const conflictLines = statusResult.stdout
        .split('\n')
        .filter(line => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DD'));

      if (conflictLines.length > 0) {
        const conflictFiles = conflictLines.map(line => line.slice(3));
        
        // Abort the merge
        await GitOperations.exec(['merge', '--abort'], this.repoRoot);
        
        return StackErrors.syncConflict(branch, conflictFiles);
      }

      return StackErrors.gitError('merge', result.stderr);
    }

    return stackOk(undefined);
  }
}

