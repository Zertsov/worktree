/**
 * Core type definitions for git operations
 */

export interface Worktree {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
}

export interface Branch {
  name: string;
  remote: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  current: boolean;
  parent: string | null;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
}

export interface Repository {
  root: string;
  name: string;
}

export class GitError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode: number
  ) {
    super(message);
    this.name = 'GitError';
  }
}

