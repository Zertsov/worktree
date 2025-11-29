/**
 * Tests for PR description formatter
 * 
 * These are pure functions that don't require any mocking.
 */

import { describe, expect, test } from 'bun:test';
import {
  formatStackNavigation,
  updatePRDescription,
  removeStackNavigation,
  buildNavigationInfo,
  type StackNavigationInfo,
} from '../github/pr-formatter.js';
import type { StackMetadata, BranchStackMetadata } from '../stack/manager.js';
import type { GitHubPR } from '../github/types.js';

describe('formatStackNavigation', () => {
  test('formats navigation with parent and children', () => {
    const info: StackNavigationInfo = {
      stackName: 'my-feature',
      trunk: 'main',
      currentBranch: 'feature/auth',
      parent: {
        branch: 'main',
        prNumber: undefined,
        prUrl: undefined,
      },
      children: [
        { branch: 'feature/login', prNumber: 102, prUrl: 'https://github.com/test/test/pull/102' },
      ],
    };

    const result = formatStackNavigation(info);

    expect(result).toContain('<!-- stacks-nav-start -->');
    expect(result).toContain('<!-- stacks-nav-end -->');
    expect(result).toContain('## 📚 Stack');
    expect(result).toContain('`main`');
    expect(result).toContain('**`feature/auth`**');
    expect(result).toContain('`feature/login`');
    expect(result).toContain('#102');
    expect(result).toContain('my-feature');
  });

  test('formats navigation with trunk as parent (no PR)', () => {
    const info: StackNavigationInfo = {
      stackName: 'auth-stack',
      trunk: 'main',
      currentBranch: 'feature/auth',
      parent: {
        branch: 'main',
      },
      children: [],
    };

    const result = formatStackNavigation(info);

    expect(result).toContain('(trunk)');
    expect(result).not.toContain('#undefined');
  });

  test('formats navigation with parent PR', () => {
    const info: StackNavigationInfo = {
      stackName: 'auth-stack',
      trunk: 'main',
      currentBranch: 'feature/login',
      parent: {
        branch: 'feature/auth',
        prNumber: 101,
        prUrl: 'https://github.com/test/test/pull/101',
      },
      children: [],
    };

    const result = formatStackNavigation(info);

    expect(result).toContain('[#101]');
    expect(result).toContain('https://github.com/test/test/pull/101');
  });

  test('formats navigation with multiple children', () => {
    const info: StackNavigationInfo = {
      stackName: 'auth-stack',
      trunk: 'main',
      currentBranch: 'feature/auth',
      parent: { branch: 'main' },
      children: [
        { branch: 'feature/login', prNumber: 102 },
        { branch: 'feature/oauth', prNumber: 103 },
        { branch: 'feature/2fa' }, // No PR yet
      ],
    };

    const result = formatStackNavigation(info);

    expect(result).toContain('feature/login');
    expect(result).toContain('feature/oauth');
    expect(result).toContain('feature/2fa');
    expect(result).toContain('#102');
    expect(result).toContain('#103');
    expect(result).toContain('—'); // No PR indicator
  });
});

describe('updatePRDescription', () => {
  const sampleNavInfo: StackNavigationInfo = {
    stackName: 'test-stack',
    trunk: 'main',
    currentBranch: 'feature/test',
    parent: { branch: 'main' },
    children: [],
  };

  test('adds navigation to empty body', () => {
    const result = updatePRDescription('', sampleNavInfo);

    expect(result).toContain('<!-- stacks-nav-start -->');
    expect(result).toContain('<!-- stacks-nav-end -->');
  });

  test('adds navigation to existing body', () => {
    const existingBody = 'This is my PR description.\n\nIt has multiple lines.';
    const result = updatePRDescription(existingBody, sampleNavInfo);

    expect(result).toContain('This is my PR description.');
    expect(result).toContain('It has multiple lines.');
    expect(result).toContain('<!-- stacks-nav-start -->');
  });

  test('replaces existing navigation section', () => {
    const existingBody = `Some description

<!-- stacks-nav-start -->
old navigation content
<!-- stacks-nav-end -->

More content after`;

    const result = updatePRDescription(existingBody, sampleNavInfo);

    // Should only have one start/end marker pair
    expect(result.match(/<!-- stacks-nav-start -->/g)?.length).toBe(1);
    expect(result.match(/<!-- stacks-nav-end -->/g)?.length).toBe(1);
    expect(result).not.toContain('old navigation content');
    expect(result).toContain('Some description');
    expect(result).toContain('More content after');
  });

  test('handles null body', () => {
    const result = updatePRDescription(null, sampleNavInfo);

    expect(result).toContain('<!-- stacks-nav-start -->');
  });

  test('handles undefined body', () => {
    const result = updatePRDescription(undefined, sampleNavInfo);

    expect(result).toContain('<!-- stacks-nav-start -->');
  });
});

describe('removeStackNavigation', () => {
  test('removes navigation section from body', () => {
    const body = `Description here

<!-- stacks-nav-start -->
navigation content
<!-- stacks-nav-end -->

Footer content`;

    const result = removeStackNavigation(body);

    expect(result).not.toContain('<!-- stacks-nav-start -->');
    expect(result).not.toContain('<!-- stacks-nav-end -->');
    expect(result).not.toContain('navigation content');
    expect(result).toContain('Description here');
    expect(result).toContain('Footer content');
  });

  test('returns body unchanged if no navigation section', () => {
    const body = 'Just a regular PR description';
    const result = removeStackNavigation(body);

    expect(result).toBe(body);
  });

  test('handles body with only navigation section', () => {
    const body = `<!-- stacks-nav-start -->
navigation only
<!-- stacks-nav-end -->`;

    const result = removeStackNavigation(body);

    expect(result).toBe('');
  });
});

describe('buildNavigationInfo', () => {
  test('builds navigation from stack metadata', () => {
    const stackMeta: StackMetadata = {
      name: 'my-stack',
      trunk: 'main',
      root: 'feature/root',
      createdAt: '2024-01-01',
    };

    const branches = new Map<string, BranchStackMetadata>([
      ['feature/root', { stackName: 'my-stack', parent: 'main', baseCommit: 'abc123' }],
      ['feature/child', { stackName: 'my-stack', parent: 'feature/root', baseCommit: 'def456' }],
    ]);

    const prMap = new Map<string, GitHubPR>([
      ['feature/root', {
        number: 101,
        title: 'Root PR',
        body: null,
        html_url: 'https://github.com/test/test/pull/101',
        head: { ref: 'feature/root' },
        base: { ref: 'main' },
        state: 'open',
        draft: false,
      }],
    ]);

    const result = buildNavigationInfo(stackMeta, branches, 'feature/root', prMap);

    expect(result.stackName).toBe('my-stack');
    expect(result.trunk).toBe('main');
    expect(result.currentBranch).toBe('feature/root');
    expect(result.parent?.branch).toBe('main');
    expect(result.children).toHaveLength(1);
    expect(result.children[0].branch).toBe('feature/child');
  });

  test('includes PR info for parent', () => {
    const stackMeta: StackMetadata = {
      name: 'my-stack',
      trunk: 'main',
      root: 'feature/root',
      createdAt: '2024-01-01',
    };

    const branches = new Map<string, BranchStackMetadata>([
      ['feature/root', { stackName: 'my-stack', parent: 'main', baseCommit: 'abc123' }],
      ['feature/child', { stackName: 'my-stack', parent: 'feature/root', baseCommit: 'def456' }],
    ]);

    const prMap = new Map<string, GitHubPR>([
      ['feature/root', {
        number: 101,
        title: 'Root PR',
        body: null,
        html_url: 'https://github.com/test/test/pull/101',
        head: { ref: 'feature/root' },
        base: { ref: 'main' },
        state: 'open',
        draft: false,
      }],
    ]);

    const result = buildNavigationInfo(stackMeta, branches, 'feature/child', prMap);

    expect(result.parent?.branch).toBe('feature/root');
    expect(result.parent?.prNumber).toBe(101);
    expect(result.parent?.prUrl).toBe('https://github.com/test/test/pull/101');
  });

  test('sorts children alphabetically', () => {
    const stackMeta: StackMetadata = {
      name: 'my-stack',
      trunk: 'main',
      root: 'feature/root',
      createdAt: '2024-01-01',
    };

    const branches = new Map<string, BranchStackMetadata>([
      ['feature/root', { stackName: 'my-stack', parent: 'main', baseCommit: 'abc123' }],
      ['feature/zebra', { stackName: 'my-stack', parent: 'feature/root', baseCommit: 'def456' }],
      ['feature/alpha', { stackName: 'my-stack', parent: 'feature/root', baseCommit: 'ghi789' }],
      ['feature/beta', { stackName: 'my-stack', parent: 'feature/root', baseCommit: 'jkl012' }],
    ]);

    const result = buildNavigationInfo(stackMeta, branches, 'feature/root', new Map());

    expect(result.children[0].branch).toBe('feature/alpha');
    expect(result.children[1].branch).toBe('feature/beta');
    expect(result.children[2].branch).toBe('feature/zebra');
  });
});

