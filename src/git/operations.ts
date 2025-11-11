/**
 * Low-level git command wrappers
 */

import { spawn } from 'bun';
import { GitError, type Repository } from './types.js';

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
   * Execute a git command and throw on error
   */
  static async execOrThrow(args: string[], cwd?: string): Promise<string> {
    const result = await this.exec(args, cwd);
    if (result.exitCode !== 0) {
      throw new GitError(
        result.stderr || 'Git command failed',
        `git ${args.join(' ')}`,
        result.exitCode
      );
    }
    return result.stdout.trim();
  }

  /**
   * Check if we're in a git repository
   */
  static async isGitRepository(cwd?: string): Promise<boolean> {
    try {
      await this.execOrThrow(['rev-parse', '--git-dir'], cwd);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get repository root and name
   */
  static async getRepository(cwd?: string): Promise<Repository> {
    const root = await this.execOrThrow(
      ['rev-parse', '--show-toplevel'],
      cwd
    );
    const name = root.split('/').pop() || 'unknown';
    return { root, name };
  }

  /**
   * List all worktrees in porcelain format
   */
  static async listWorktrees(cwd?: string): Promise<string> {
    return await this.execOrThrow(['worktree', 'list', '--porcelain'], cwd);
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
  ): Promise<void> {
    const args = ['worktree', 'add'];

    if (options.createBranch && options.baseBranch) {
      args.push('-b', branch, path, options.baseBranch);
    } else if (options.track && options.baseBranch) {
      args.push('--track', '-b', branch, path, options.baseBranch);
    } else {
      args.push(path, branch);
    }

    await this.execOrThrow(args, cwd);
  }

  /**
   * Remove a worktree
   */
  static async removeWorktree(path: string, force = false, cwd?: string): Promise<void> {
    const args = ['worktree', 'remove', path];
    if (force) {
      args.push('--force');
    }
    await this.execOrThrow(args, cwd);
  }

  /**
   * Prune worktree information
   */
  static async pruneWorktrees(dryRun = false, cwd?: string): Promise<string> {
    const args = ['worktree', 'prune', '-v'];
    if (dryRun) {
      args.push('--dry-run');
    }
    return await this.execOrThrow(args, cwd);
  }

  /**
   * Check if a branch exists locally
   */
  static async branchExists(branch: string, cwd?: string): Promise<boolean> {
    try {
      await this.execOrThrow(
        ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
        cwd
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a branch exists on remote
   */
  static async remoteBranchExists(
    branch: string,
    remote = 'origin',
    cwd?: string
  ): Promise<boolean> {
    try {
      await this.execOrThrow(
        ['show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`],
        cwd
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all branches with their tracking information
   */
  static async listBranches(cwd?: string): Promise<string> {
    return await this.execOrThrow(
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
    try {
      const parent = await this.execOrThrow(
        ['config', '--get', `branch.${branch}.parent`],
        cwd
      );
      return parent || null;
    } catch {
      return null;
    }
  }

  /**
   * Set the parent branch in git config
   */
  static async setBranchParent(
    branch: string,
    parent: string,
    cwd?: string
  ): Promise<void> {
    await this.execOrThrow(
      ['config', `branch.${branch}.parent`, parent],
      cwd
    );
  }

  /**
   * Get merge-base between two branches
   */
  static async getMergeBase(
    branch1: string,
    branch2: string,
    cwd?: string
  ): Promise<string | null> {
    try {
      return await this.execOrThrow(['merge-base', branch1, branch2], cwd);
    } catch {
      return null;
    }
  }

  /**
   * Get current branch name
   */
  static async getCurrentBranch(cwd?: string): Promise<string | null> {
    try {
      return await this.execOrThrow(
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        cwd
      );
    } catch {
      return null;
    }
  }

  /**
   * Get status of a worktree
   */
  static async getStatus(cwd: string): Promise<string> {
    return await this.execOrThrow(['status', '--porcelain=v1'], cwd);
  }

  /**
   * Delete a branch
   */
  static async deleteBranch(
    branch: string,
    force = false,
    cwd?: string
  ): Promise<void> {
    const flag = force ? '-D' : '-d';
    await this.execOrThrow(['branch', flag, branch], cwd);
  }
}

