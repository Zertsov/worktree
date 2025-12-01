/**
 * Low-level git command wrappers using neverthrow Result types
 */

import { spawn } from 'bun';
import { Result, ok, err } from 'neverthrow';
import { GitError, type Repository } from './types.js';

export type GitResult<T> = Result<T, GitError>;

export class GitOperations {
  /**
   * Execute a git command and return stdout
   */
  static async exec(
    args: string[],
    cwd?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const proc = spawn({
      cmd: ['git', ...args],
      cwd: cwd || process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return { stdout, stderr, exitCode };
  }

  /**
   * Execute a git command and return Result
   */
  static async execResult(args: string[], cwd?: string): Promise<GitResult<string>> {
    const result = await this.exec(args, cwd);
    if (result.exitCode !== 0) {
      return err(
        new GitError(
          result.stderr || 'Git command failed',
          `git ${args.join(' ')}`,
          result.exitCode
        )
      );
    }
    return ok(result.stdout.trim());
  }

  /**
   * Execute a git command and throw on error (legacy - prefer execResult)
   */
  static async execOrThrow(args: string[], cwd?: string): Promise<string> {
    const result = await this.execResult(args, cwd);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Check if we're in a git repository
   */
  static async isGitRepository(cwd?: string): Promise<boolean> {
    const result = await this.execResult(['rev-parse', '--git-dir'], cwd);
    return result.isOk();
  }

  /**
   * Get repository root and name
   */
  static async getRepository(cwd?: string): Promise<GitResult<Repository>> {
    const result = await this.execResult(['rev-parse', '--show-toplevel'], cwd);
    return result.map((root) => ({
      root,
      name: root.split('/').pop() || 'unknown',
    }));
  }

  /**
   * List all worktrees in porcelain format
   */
  static async listWorktrees(cwd?: string): Promise<GitResult<string>> {
    return this.execResult(['worktree', 'list', '--porcelain'], cwd);
  }

  /**
   * Add a new worktree
   */
  static async addWorktree(
    path: string,
    branch: string,
    options: {
      createBranch?: boolean;
      baseBranch?: string;
      track?: boolean;
    } = {},
    cwd?: string
  ): Promise<GitResult<void>> {
    const args = ['worktree', 'add'];

    if (options.createBranch && options.baseBranch) {
      args.push('-b', branch, path, options.baseBranch);
    } else if (options.track && options.baseBranch) {
      args.push('--track', '-b', branch, path, options.baseBranch);
    } else {
      args.push(path, branch);
    }

    const result = await this.execResult(args, cwd);
    return result.map(() => undefined);
  }

  /**
   * Remove a worktree
   */
  static async removeWorktree(path: string, force = false, cwd?: string): Promise<GitResult<void>> {
    const args = ['worktree', 'remove', path];
    if (force) {
      args.push('--force');
    }
    const result = await this.execResult(args, cwd);
    return result.map(() => undefined);
  }

  /**
   * Prune worktree information
   */
  static async pruneWorktrees(dryRun = false, cwd?: string): Promise<GitResult<string>> {
    const args = ['worktree', 'prune', '-v'];
    if (dryRun) {
      args.push('--dry-run');
    }
    return this.execResult(args, cwd);
  }

  /**
   * Check if a branch exists locally
   */
  static async branchExists(branch: string, cwd?: string): Promise<boolean> {
    const result = await this.execResult(
      ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
      cwd
    );
    return result.isOk();
  }

  /**
   * Check if a branch exists on remote
   */
  static async remoteBranchExists(
    branch: string,
    remote = 'origin',
    cwd?: string
  ): Promise<boolean> {
    const result = await this.execResult(
      ['show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`],
      cwd
    );
    return result.isOk();
  }

  /**
   * Get all branches with their tracking information
   */
  static async listBranches(cwd?: string): Promise<GitResult<string>> {
    return this.execResult(
      [
        'for-each-ref',
        '--format=%(refname:short)|%(upstream:short)|%(upstream:track)',
        'refs/heads',
      ],
      cwd
    );
  }

  /**
   * Get the parent branch from git config
   */
  static async getBranchParent(branch: string, cwd?: string): Promise<string | null> {
    const result = await this.execResult(
      ['config', '--get', `branch.${branch}.parent`],
      cwd
    );
    return result.isOk() && result.value ? result.value : null;
  }

  /**
   * Set the parent branch in git config
   */
  static async setBranchParent(
    branch: string,
    parent: string,
    cwd?: string
  ): Promise<GitResult<void>> {
    const result = await this.execResult(
      ['config', `branch.${branch}.parent`, parent],
      cwd
    );
    return result.map(() => undefined);
  }

  /**
   * Get merge-base between two branches
   */
  static async getMergeBase(
    branch1: string,
    branch2: string,
    cwd?: string
  ): Promise<string | null> {
    const result = await this.execResult(['merge-base', branch1, branch2], cwd);
    return result.isOk() ? result.value : null;
  }

  /**
   * Get current branch name
   */
  static async getCurrentBranch(cwd?: string): Promise<string | null> {
    const result = await this.execResult(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      cwd
    );
    return result.isOk() ? result.value : null;
  }

  /**
   * Get status of a worktree
   */
  static async getStatus(cwd: string): Promise<GitResult<string>> {
    return this.execResult(['status', '--porcelain=v1'], cwd);
  }

  /**
   * Delete a branch
   */
  static async deleteBranch(
    branch: string,
    force = false,
    cwd?: string
  ): Promise<GitResult<void>> {
    const flag = force ? '-D' : '-d';
    const result = await this.execResult(['branch', flag, branch], cwd);
    return result.map(() => undefined);
  }

  /**
   * Checkout a branch
   */
  static async checkout(branch: string, cwd?: string): Promise<GitResult<void>> {
    const result = await this.execResult(['checkout', branch], cwd);
    return result.map(() => undefined);
  }

  /**
   * Create a new branch and checkout
   */
  static async checkoutNewBranch(branch: string, cwd?: string): Promise<GitResult<void>> {
    const result = await this.execResult(['checkout', '-b', branch], cwd);
    return result.map(() => undefined);
  }

  /**
   * Fetch from remote
   */
  static async fetch(remote = '--all', cwd?: string): Promise<GitResult<void>> {
    const result = await this.execResult(['fetch', remote], cwd);
    return result.map(() => undefined);
  }

  /**
   * Push to remote with force-with-lease
   */
  static async pushForce(branch: string, remote = 'origin', cwd?: string): Promise<GitResult<void>> {
    const result = await this.execResult(
      ['push', '--force-with-lease', remote, branch],
      cwd
    );
    return result.map(() => undefined);
  }

  /**
   * Get short commit hash
   */
  static async getShortCommit(cwd?: string): Promise<string> {
    const result = await this.execResult(['rev-parse', '--short', 'HEAD'], cwd);
    return result.isOk() ? result.value : 'unknown';
  }

  /**
   * Get full commit hash
   */
  static async getCommit(ref = 'HEAD', cwd?: string): Promise<GitResult<string>> {
    return this.execResult(['rev-parse', ref], cwd);
  }
}
