/**
 * Git operations interface for dependency injection
 * 
 * This interface allows mocking git operations in tests.
 */

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface IGitOperations {
  exec(args: string[], cwd?: string): Promise<GitExecResult>;
  execOrThrow(args: string[], cwd?: string): Promise<string>;
  branchExists(branch: string, cwd?: string): Promise<boolean>;
  getCurrentBranch(cwd?: string): Promise<string | null>;
}

/**
 * Default implementation using the real GitOperations
 */
import { GitOperations } from './operations.js';

export const defaultGitOps: IGitOperations = {
  exec: (args, cwd) => GitOperations.exec(args, cwd),
  execOrThrow: (args, cwd) => GitOperations.execOrThrow(args, cwd),
  branchExists: (branch, cwd) => GitOperations.branchExists(branch, cwd),
  getCurrentBranch: (cwd) => GitOperations.getCurrentBranch(cwd),
};

