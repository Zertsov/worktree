/**
 * Tests for error types and error constructors
 */

import { describe, expect, test } from 'bun:test';
import {
  StackError,
  StackErrors,
  stackOk,
  stackErr,
} from '../stack/errors.js';

describe('StackError', () => {
  test('creates error with all properties', () => {
    const error = new StackError(
      'BRANCH_NOT_FOUND',
      'Branch not found',
      { branch: 'feature/test' },
      'Create the branch first'
    );

    expect(error.code).toBe('BRANCH_NOT_FOUND');
    expect(error.message).toBe('Branch not found');
    expect(error.details).toEqual({ branch: 'feature/test' });
    expect(error.suggestion).toBe('Create the branch first');
    expect(error.name).toBe('StackError');
  });

  test('format() includes message and suggestion', () => {
    const error = new StackError(
      'SYNC_CONFLICT',
      'Merge conflict detected',
      undefined,
      'Resolve conflicts manually'
    );

    const formatted = error.format();

    expect(formatted).toContain('Merge conflict detected');
    expect(formatted).toContain('Resolve conflicts manually');
  });

  test('format() works without suggestion', () => {
    const error = new StackError(
      'GIT_ERROR',
      'Git command failed'
    );

    const formatted = error.format();

    expect(formatted).toBe('Git command failed');
    expect(formatted).not.toContain('Suggestion');
  });
});

describe('stackOk', () => {
  test('creates successful result', () => {
    const result = stackOk({ value: 42 });

    expect(result.isOk()).toBe(true);
    expect(result.isErr()).toBe(false);
    if (result.isOk()) {
      expect(result.value).toEqual({ value: 42 });
    }
  });
});

describe('stackErr', () => {
  test('creates error result', () => {
    const result = stackErr('NOT_IN_REPO', 'Not in a repository');

    expect(result.isErr()).toBe(true);
    expect(result.isOk()).toBe(false);
    if (result.isErr()) {
      expect(result.error.code).toBe('NOT_IN_REPO');
      expect(result.error.message).toBe('Not in a repository');
    }
  });

  test('creates error result with details and suggestion', () => {
    const result = stackErr(
      'BRANCH_NOT_FOUND',
      'Branch not found',
      { branch: 'test' },
      'Create it first'
    );

    if (result.isErr()) {
      expect(result.error.details).toEqual({ branch: 'test' });
      expect(result.error.suggestion).toBe('Create it first');
    }
  });
});

describe('StackErrors factory', () => {
  test('notInRepo creates correct error', () => {
    const result = StackErrors.notInRepo();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('NOT_IN_REPO');
      expect(result.error.suggestion).toBeDefined();
    }
  });

  test('branchNotFound includes branch name', () => {
    const result = StackErrors.branchNotFound('feature/test');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('BRANCH_NOT_FOUND');
      expect(result.error.message).toContain('feature/test');
      expect(result.error.details).toEqual({ branch: 'feature/test' });
    }
  });

  test('stackNotFound with name includes stack name', () => {
    const result = StackErrors.stackNotFound('my-stack');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('STACK_NOT_FOUND');
      expect(result.error.message).toContain('my-stack');
    }
  });

  test('stackNotFound without name gives generic message', () => {
    const result = StackErrors.stackNotFound();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('STACK_NOT_FOUND');
      expect(result.error.message).toContain('not part of a stack');
    }
  });

  test('stackExists includes stack name', () => {
    const result = StackErrors.stackExists('existing-stack');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('STACK_EXISTS');
      expect(result.error.message).toContain('existing-stack');
    }
  });

  test('alreadyInStack includes branch and stack names', () => {
    const result = StackErrors.alreadyInStack('feature/test', 'other-stack');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('ALREADY_IN_STACK');
      expect(result.error.message).toContain('feature/test');
      expect(result.error.message).toContain('other-stack');
    }
  });

  test('notInStack includes branch name', () => {
    const result = StackErrors.notInStack('feature/random');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('NOT_IN_STACK');
      expect(result.error.message).toContain('feature/random');
    }
  });

  test('syncConflict includes files list', () => {
    const result = StackErrors.syncConflict('feature/test', ['file1.ts', 'file2.ts']);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('SYNC_CONFLICT');
      expect(result.error.details?.files).toEqual(['file1.ts', 'file2.ts']);
    }
  });

  test('uncommittedChanges includes branch name', () => {
    const result = StackErrors.uncommittedChanges('feature/dirty');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('UNCOMMITTED_CHANGES');
      expect(result.error.message).toContain('feature/dirty');
    }
  });

  test('invalidTrunk includes trunk name', () => {
    const result = StackErrors.invalidTrunk('nonexistent');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('INVALID_TRUNK');
      expect(result.error.message).toContain('nonexistent');
    }
  });

  test('gitError includes operation and message', () => {
    const result = StackErrors.gitError('rebase', 'conflict detected');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('GIT_ERROR');
      expect(result.error.message).toContain('rebase');
      expect(result.error.message).toContain('conflict detected');
    }
  });

  test('configError includes message', () => {
    const result = StackErrors.configError('failed to write');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_ERROR');
      expect(result.error.message).toContain('failed to write');
    }
  });
});

