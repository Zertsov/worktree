/**
 * Git operations interface for dependency injection
 *
 * This interface allows mocking git operations in tests.
 */

import { Result, ok, err } from 'neverthrow';
import { GitError } from './types.js';

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type GitResult<T> = Result<T, GitError>;

export interface IGitOperations {
  exec(args: string[], cwd?: string): Promise<GitExecResult>;
  execOrThrow(args: string[], cwd?: string): Promise<string>;
  execResult(args: string[], cwd?: string): Promise<GitResult<string>>;
  branchExists(branch: string, cwd?: string): Promise<boolean>;
  getCurrentBranch(cwd?: string): Promise<string | null>;
  getCommit(ref: string, cwd?: string): Promise<GitResult<string>>;
}

/**
 * Default implementation using the real GitOperations
 */
import { GitOperations } from './operations.js';

export const defaultGitOps: IGitOperations = {
  exec: (args, cwd) => GitOperations.exec(args, cwd),
  execOrThrow: (args, cwd) => GitOperations.execOrThrow(args, cwd),
  execResult: (args, cwd) => GitOperations.execResult(args, cwd),
  branchExists: (branch, cwd) => GitOperations.branchExists(branch, cwd),
  getCurrentBranch: (cwd) => GitOperations.getCurrentBranch(cwd),
  getCommit: (ref, cwd) => GitOperations.getCommit(ref, cwd),
};
