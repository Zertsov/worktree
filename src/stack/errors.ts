/**
 * Stack error types using neverthrow for Rust-style error handling
 */

import { err, ok, Result } from 'neverthrow';

/**
 * All possible error codes for stack operations
 */
export type StackErrorCode =
  | 'NOT_IN_REPO'
  | 'BRANCH_NOT_FOUND'
  | 'STACK_NOT_FOUND'
  | 'STACK_EXISTS'
  | 'ALREADY_IN_STACK'
  | 'NOT_IN_STACK'
  | 'SYNC_CONFLICT'
  | 'UNCOMMITTED_CHANGES'
  | 'REMOTE_NOT_FOUND'
  | 'PR_EXISTS'
  | 'GITHUB_ERROR'
  | 'CONFIG_ERROR'
  | 'GIT_ERROR'
  | 'INVALID_TRUNK';

/**
 * Structured error for stack operations
 */
export class StackError extends Error {
  constructor(
    public readonly code: StackErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly suggestion?: string
  ) {
    super(message);
    this.name = 'StackError';
  }

  /**
   * Format error for CLI display
   */
  format(): string {
    let output = this.message;
    if (this.suggestion) {
      output += `\n\nSuggestion: ${this.suggestion}`;
    }
    return output;
  }
}

/**
 * Result type alias for stack operations
 */
export type StackResult<T> = Result<T, StackError>;

/**
 * Helper to create a successful result
 */
export const stackOk = <T>(value: T): StackResult<T> => ok(value);

/**
 * Helper to create an error result
 */
export const stackErr = <T = never>(
  code: StackErrorCode,
  message: string,
  details?: Record<string, unknown>,
  suggestion?: string
): StackResult<T> => err(new StackError(code, message, details, suggestion));

/**
 * Common error constructors for consistent error messages
 */
export const StackErrors = {
  notInRepo: () =>
    stackErr(
      'NOT_IN_REPO',
      'Not in a git repository',
      undefined,
      'Run this command from within a git repository'
    ),

  branchNotFound: (branch: string) =>
    stackErr(
      'BRANCH_NOT_FOUND',
      `Branch '${branch}' not found`,
      { branch },
      `Create the branch first with 'git checkout -b ${branch}'`
    ),

  stackNotFound: (name?: string) =>
    stackErr(
      'STACK_NOT_FOUND',
      name ? `Stack '${name}' not found` : 'Current branch is not part of a stack',
      { name },
      "Initialize a stack with 'stacks init <trunk>'"
    ),

  stackExists: (name: string) =>
    stackErr(
      'STACK_EXISTS',
      `Stack '${name}' already exists`,
      { name },
      `Use a different name or remove the existing stack first`
    ),

  alreadyInStack: (branch: string, stack: string) =>
    stackErr(
      'ALREADY_IN_STACK',
      `Branch '${branch}' is already in stack '${stack}'`,
      { branch, stack },
      `Remove it from the stack first with 'stacks remove ${branch}'`
    ),

  notInStack: (branch: string) =>
    stackErr(
      'NOT_IN_STACK',
      `Branch '${branch}' is not part of any stack`,
      { branch },
      "Add it to a stack with 'stacks adopt' or create a new stack"
    ),

  syncConflict: (branch: string, files: string[]) =>
    stackErr(
      'SYNC_CONFLICT',
      `Conflict while syncing '${branch}'`,
      { branch, files },
      'Resolve the conflicts manually, then run sync again'
    ),

  uncommittedChanges: (branch: string) =>
    stackErr(
      'UNCOMMITTED_CHANGES',
      `Branch '${branch}' has uncommitted changes`,
      { branch },
      'Commit or stash your changes before syncing'
    ),

  invalidTrunk: (trunk: string) =>
    stackErr(
      'INVALID_TRUNK',
      `Trunk branch '${trunk}' does not exist`,
      { trunk },
      'Specify a valid branch as the trunk'
    ),

  gitError: (operation: string, message: string) =>
    stackErr('GIT_ERROR', `Git ${operation} failed: ${message}`, { operation }),

  configError: <T = never>(message: string): StackResult<T> =>
    stackErr('CONFIG_ERROR', `Configuration error: ${message}`),
};

