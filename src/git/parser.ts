/**
 * Parse git porcelain output into structured data
 */

import type { Worktree, Branch, GitStatus } from './types.js';

export class GitParser {
  /**
   * Parse git worktree list --porcelain output
   */
  static parseWorktrees(porcelainOutput: string): Worktree[] {
    const worktrees: Worktree[] = [];
    const lines = porcelainOutput.split('\n');

    let current: Partial<Worktree> = {};

    for (const line of lines) {
      if (!line.trim()) {
        if (current.path) {
          worktrees.push({
            path: current.path,
            head: current.head || '',
            branch: current.branch || null,
            bare: current.bare || false,
            detached: current.detached || false,
            locked: current.locked || false,
            prunable: current.prunable || false,
          });
          current = {};
        }
        continue;
      }

      const [key, ...valueParts] = line.split(' ');
      const value = valueParts.join(' ');

      switch (key) {
        case 'worktree':
          current.path = value;
          break;
        case 'HEAD':
          current.head = value;
          break;
        case 'branch':
          current.branch = value.replace('refs/heads/', '');
          break;
        case 'bare':
          current.bare = true;
          break;
        case 'detached':
          current.detached = true;
          break;
        case 'locked':
          current.locked = true;
          break;
        case 'prunable':
          current.prunable = true;
          break;
      }
    }

    // Handle last worktree if output doesn't end with blank line
    if (current.path) {
      worktrees.push({
        path: current.path,
        head: current.head || '',
        branch: current.branch || null,
        bare: current.bare || false,
        detached: current.detached || false,
        locked: current.locked || false,
        prunable: current.prunable || false,
      });
    }

    return worktrees;
  }

  /**
   * Parse git for-each-ref output for branches
   * Format: refname|upstream|track
   */
  static parseBranches(refOutput: string): Branch[] {
    const branches: Branch[] = [];
    const lines = refOutput.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const [name, upstream, track] = line.split('|');

      let ahead = 0;
      let behind = 0;

      if (track) {
        const aheadMatch = track.match(/ahead (\d+)/);
        const behindMatch = track.match(/behind (\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
        if (behindMatch) behind = parseInt(behindMatch[1], 10);
      }

      branches.push({
        name,
        remote: upstream ? upstream.split('/')[0] : null,
        upstream: upstream || null,
        ahead,
        behind,
        current: false,
        parent: null,
      });
    }

    return branches;
  }

  /**
   * Parse git status --porcelain output
   */
  static parseStatus(statusOutput: string, branch: string): GitStatus {
    const lines = statusOutput.split('\n').filter((l) => l.trim());

    let staged = 0;
    let unstaged = 0;
    let untracked = 0;

    for (const line of lines) {
      const x = line[0]; // Index status
      const y = line[1]; // Working tree status

      if (x === '?' && y === '?') {
        untracked++;
      } else {
        if (x !== ' ' && x !== '?') staged++;
        if (y !== ' ' && y !== '?') unstaged++;
      }
    }

    return {
      branch,
      ahead: 0,
      behind: 0,
      dirty: staged > 0 || unstaged > 0 || untracked > 0,
      staged,
      unstaged,
      untracked,
    };
  }

  /**
   * Extract branch name from refs/heads/ format
   */
  static normalizeBranchName(ref: string): string {
    return ref.replace(/^refs\/heads\//, '');
  }

  /**
   * Sanitize branch name for use in paths
   */
  static sanitizeBranchName(branch: string): string {
    return branch.replace(/\//g, '-');
  }
}

