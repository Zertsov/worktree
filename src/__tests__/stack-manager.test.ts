/**
 * Tests for StackManager
 * 
 * Uses a mock git operations interface for testing without real git calls.
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { ok, err } from 'neverthrow';
import { StackManager } from '../stack/manager.js';
import type { IGitOperations, GitExecResult, GitResult } from '../git/interface.js';
import { GitError } from '../git/types.js';

/**
 * Create a mock git operations object with configurable behavior
 */
function createMockGit(overrides: Partial<{
  configs: Record<string, string>;
  branches: string[];
  currentBranch: string | null;
  currentCommit: string;
}>= {}): IGitOperations {
  const {
    configs = {},
    branches = ['main'],
    currentBranch = 'main',
    currentCommit = 'abc123def456',
  } = overrides;

  // Mutable state for the mock
  const configStore = { ...configs };

  return {
    async exec(args: string[]): Promise<GitExecResult> {
      const cmd = args[0];

      if (cmd === 'config') {
        if (args[1] === '--get') {
          const key = args[2];
          if (key in configStore) {
            return { stdout: configStore[key] + '\n', stderr: '', exitCode: 0 };
          }
          return { stdout: '', stderr: '', exitCode: 1 };
        }

        if (args[1] === '--get-regexp') {
          const pattern = args[2];
          const regex = new RegExp(pattern.replace(/\\\\/g, '\\'));
          const matches: string[] = [];
          for (const [key, value] of Object.entries(configStore)) {
            if (regex.test(key)) {
              matches.push(`${key} ${value}`);
            }
          }
          if (matches.length > 0) {
            return { stdout: matches.join('\n') + '\n', stderr: '', exitCode: 0 };
          }
          return { stdout: '', stderr: '', exitCode: 1 };
        }

        if (args[1] === '--unset') {
          const key = args[2];
          delete configStore[key];
          return { stdout: '', stderr: '', exitCode: 0 };
        }

        // Set config: config <key> <value>
        if (args.length === 3) {
          const [, key, value] = args;
          configStore[key] = value;
          return { stdout: '', stderr: '', exitCode: 0 };
        }
      }

      return { stdout: '', stderr: 'Unknown command', exitCode: 1 };
    },

    async execOrThrow(args: string[]): Promise<string> {
      const cmd = args[0];

      if (cmd === 'rev-parse' && args[1] === 'HEAD') {
        return currentCommit;
      }

      if (cmd === 'config') {
        // Set config
        if (args.length === 3) {
          const [, key, value] = args;
          configStore[key] = value;
          return '';
        }
      }

      throw new Error(`Mock execOrThrow not implemented for: ${args.join(' ')}`);
    },

    async execResult(args: string[]): Promise<GitResult<string>> {
      const cmd = args[0];

      if (cmd === 'config') {
        // Set config: config <key> <value>
        if (args.length === 3) {
          const [, key, value] = args;
          configStore[key] = value;
          return ok('');
        }
      }

      return err(new GitError(`Mock execResult not implemented for: ${args.join(' ')}`, args.join(' '), 1));
    },

    async branchExists(branch: string): Promise<boolean> {
      return branches.includes(branch);
    },

    async getCurrentBranch(): Promise<string | null> {
      return currentBranch;
    },

    async getCommit(ref: string): Promise<GitResult<string>> {
      if (ref === 'HEAD') {
        return ok(currentCommit);
      }
      return err(new GitError(`Unknown ref: ${ref}`, `git rev-parse ${ref}`, 1));
    },
  };
}

describe('StackManager', () => {
  describe('initStack', () => {
    test('initializes a new stack successfully', async () => {
      const mockGit = createMockGit({
        branches: ['main', 'feature/auth'],
        currentBranch: 'feature/auth',
        currentCommit: 'abc123',
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.initStack('auth-feature', 'main', 'feature/auth');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.name).toBe('auth-feature');
        expect(result.value.trunk).toBe('main');
        expect(result.value.root).toBe('feature/auth');
      }
    });

    test('fails if trunk branch does not exist', async () => {
      const mockGit = createMockGit({
        branches: ['feature/auth'], // main doesn't exist
        currentBranch: 'feature/auth',
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.initStack('auth-feature', 'main', 'feature/auth');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_TRUNK');
      }
    });

    test('fails if stack already exists', async () => {
      const mockGit = createMockGit({
        branches: ['main', 'feature/auth'],
        currentBranch: 'feature/auth',
        configs: {
          'stacks.auth-feature.trunk': 'main',
          'stacks.auth-feature.root': 'feature/auth',
        },
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.initStack('auth-feature', 'main', 'feature/auth');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('STACK_EXISTS');
      }
    });

    test('fails if branch already in a stack', async () => {
      const mockGit = createMockGit({
        branches: ['main', 'feature/auth'],
        currentBranch: 'feature/auth',
        configs: {
          'branch.feature/auth.stackname': 'other-stack',
          'branch.feature/auth.stackparent': 'main',
          'branch.feature/auth.stackbase': 'abc123',
        },
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.initStack('new-stack', 'main', 'feature/auth');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('ALREADY_IN_STACK');
      }
    });
  });

  describe('addBranch', () => {
    test('adds a branch to an existing stack', async () => {
      const mockGit = createMockGit({
        branches: ['main', 'feature/auth', 'feature/login'],
        currentBranch: 'feature/login',
        currentCommit: 'def456',
        configs: {
          'stacks.auth-feature.trunk': 'main',
          'stacks.auth-feature.root': 'feature/auth',
          'branch.feature/auth.stackname': 'auth-feature',
          'branch.feature/auth.stackparent': 'main',
          'branch.feature/auth.stackbase': 'abc123',
        },
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.addBranch('feature/login', 'feature/auth', 'auth-feature');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.stackName).toBe('auth-feature');
        expect(result.value.parent).toBe('feature/auth');
        expect(result.value.baseCommit).toBe('def456');
      }
    });

    test('fails if stack does not exist', async () => {
      const mockGit = createMockGit({
        branches: ['main', 'feature/auth'],
        currentBranch: 'feature/auth',
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.addBranch('feature/login', 'feature/auth', 'nonexistent');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('STACK_NOT_FOUND');
      }
    });

    test('fails if parent is not in the stack', async () => {
      const mockGit = createMockGit({
        branches: ['main', 'feature/auth', 'feature/other'],
        currentBranch: 'feature/other',
        configs: {
          'stacks.auth-feature.trunk': 'main',
          'stacks.auth-feature.root': 'feature/auth',
          'branch.feature/auth.stackname': 'auth-feature',
          'branch.feature/auth.stackparent': 'main',
          'branch.feature/auth.stackbase': 'abc123',
        },
      });

      const manager = new StackManager('/test/repo', mockGit);
      // feature/unrelated is not in the stack
      const result = await manager.addBranch('feature/new', 'feature/unrelated', 'auth-feature');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_IN_STACK');
      }
    });
  });

  describe('getStackMetadata', () => {
    test('returns stack metadata', async () => {
      const mockGit = createMockGit({
        configs: {
          'stacks.my-stack.trunk': 'main',
          'stacks.my-stack.root': 'feature/root',
          'stacks.my-stack.created': '2024-01-01T00:00:00Z',
        },
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.getStackMetadata('my-stack');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.name).toBe('my-stack');
        expect(result.value.trunk).toBe('main');
        expect(result.value.root).toBe('feature/root');
        expect(result.value.createdAt).toBe('2024-01-01T00:00:00Z');
      }
    });

    test('returns error for nonexistent stack', async () => {
      const mockGit = createMockGit();
      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.getStackMetadata('nonexistent');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('STACK_NOT_FOUND');
      }
    });
  });

  describe('getBranchStack', () => {
    test('returns branch stack metadata', async () => {
      const mockGit = createMockGit({
        configs: {
          'branch.feature/auth.stackname': 'my-stack',
          'branch.feature/auth.stackparent': 'main',
          'branch.feature/auth.stackbase': 'abc123',
        },
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.getBranchStack('feature/auth');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.stackName).toBe('my-stack');
        expect(result.value.parent).toBe('main');
        expect(result.value.baseCommit).toBe('abc123');
      }
    });

    test('returns error for branch not in stack', async () => {
      const mockGit = createMockGit();
      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.getBranchStack('feature/random');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_IN_STACK');
      }
    });
  });

  describe('getAllStacks', () => {
    test('returns all stacks', async () => {
      const mockGit = createMockGit({
        configs: {
          'stacks.stack1.trunk': 'main',
          'stacks.stack1.root': 'feature/a',
          'stacks.stack2.trunk': 'develop',
          'stacks.stack2.root': 'feature/b',
        },
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.getAllStacks();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.length).toBe(2);
        expect(result.value.map(s => s.name).sort()).toEqual(['stack1', 'stack2']);
      }
    });

    test('returns empty array when no stacks', async () => {
      const mockGit = createMockGit();
      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.getAllStacks();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getStackBranches', () => {
    test('returns all branches in a stack', async () => {
      const mockGit = createMockGit({
        configs: {
          'stacks.my-stack.trunk': 'main',
          'stacks.my-stack.root': 'feature/a',
          'branch.feature/a.stackname': 'my-stack',
          'branch.feature/a.stackparent': 'main',
          'branch.feature/a.stackbase': 'abc123',
          'branch.feature/b.stackname': 'my-stack',
          'branch.feature/b.stackparent': 'feature/a',
          'branch.feature/b.stackbase': 'def456',
          'branch.feature/other.stackname': 'other-stack',
          'branch.feature/other.stackparent': 'main',
          'branch.feature/other.stackbase': 'ghi789',
        },
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.getStackBranches('my-stack');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.size).toBe(2);
        expect(result.value.has('feature/a')).toBe(true);
        expect(result.value.has('feature/b')).toBe(true);
        expect(result.value.has('feature/other')).toBe(false);
      }
    });
  });

  describe('updateBranchBase', () => {
    test('updates the base commit for a branch', async () => {
      const mockGit = createMockGit({
        configs: {
          'branch.feature/auth.stackname': 'my-stack',
          'branch.feature/auth.stackparent': 'main',
          'branch.feature/auth.stackbase': 'old-commit',
        },
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.updateBranchBase('feature/auth', 'new-commit');

      expect(result.isOk()).toBe(true);
    });
  });

  describe('removeBranch', () => {
    test('removes branch from stack', async () => {
      const mockGit = createMockGit({
        configs: {
          'branch.feature/auth.stackname': 'my-stack',
          'branch.feature/auth.stackparent': 'main',
          'branch.feature/auth.stackbase': 'abc123',
        },
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.removeBranch('feature/auth');

      expect(result.isOk()).toBe(true);
    });
  });

  describe('getCurrentBranchStack', () => {
    test('returns stack name for current branch', async () => {
      const mockGit = createMockGit({
        currentBranch: 'feature/auth',
        configs: {
          'branch.feature/auth.stackname': 'my-stack',
          'branch.feature/auth.stackparent': 'main',
          'branch.feature/auth.stackbase': 'abc123',
        },
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.getCurrentBranchStack();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('my-stack');
      }
    });

    test('returns error if current branch not in stack', async () => {
      const mockGit = createMockGit({
        currentBranch: 'feature/random',
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.getCurrentBranchStack();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_IN_STACK');
      }
    });

    test('returns error if not in a repo', async () => {
      const mockGit = createMockGit({
        currentBranch: null,
      });

      const manager = new StackManager('/test/repo', mockGit);
      const result = await manager.getCurrentBranchStack();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('NOT_IN_REPO');
      }
    });
  });
});

