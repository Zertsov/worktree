/**
 * Stack branch command - Create a new branch as a child in the current stack
 * Uses neverthrow Result types for error handling
 */

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { GitOperations } from '../../git/operations.js';
import { StackManager } from '../../stack/manager.js';

export interface StackBranchOptions {
  worktree?: boolean;
  path?: string;
}

export async function stackBranchCommand(
  branchName: string,
  options: StackBranchOptions = {}
): Promise<void> {
  const spinner = clack.spinner();

  // Check if we're in a git repository
  const isRepo = await GitOperations.isGitRepository();
  if (!isRepo) {
    clack.cancel('Not a git repository');
    process.exit(1);
  }

  const repoResult = await GitOperations.getRepository();
  if (repoResult.isErr()) {
    clack.cancel(repoResult.error.message);
    process.exit(1);
  }

  const repo = repoResult.value;
  const currentBranch = await GitOperations.getCurrentBranch(repo.root);

  if (!currentBranch) {
    clack.cancel('Could not determine current branch');
    process.exit(1);
  }

  const manager = new StackManager(repo.root);

  // Check if current branch is in a stack
  const currentStackResult = await manager.getBranchStack(currentBranch);
  if (currentStackResult.isErr()) {
    clack.cancel(
      `Current branch '${currentBranch}' is not part of a stack.\n\n` +
        `Initialize a stack first with: ${pc.cyan('stacks init <trunk>')}`
    );
    process.exit(1);
  }

  const stackName = currentStackResult.value.stackName;

  // Check if the new branch already exists
  const branchExists = await GitOperations.branchExists(branchName, repo.root);
  if (branchExists) {
    clack.cancel(
      `Branch '${branchName}' already exists.\n\n` +
        `To add an existing branch to the stack, use: ${pc.cyan(`stacks adopt ${branchName}`)}`
    );
    process.exit(1);
  }

  spinner.start('Creating branch...');

  // Create the new branch from current HEAD
  const checkoutResult = await GitOperations.checkoutNewBranch(branchName, repo.root);
  if (checkoutResult.isErr()) {
    spinner.stop('Failed');
    clack.cancel(`Failed to create branch: ${checkoutResult.error.message}`);
    process.exit(1);
  }

  // Add branch to stack
  const addResult = await manager.addBranch(branchName, currentBranch, stackName);
  if (addResult.isErr()) {
    spinner.stop('Failed');
    // Try to clean up by switching back and deleting the branch
    await GitOperations.checkout(currentBranch, repo.root);
    await GitOperations.deleteBranch(branchName, true, repo.root);
    clack.cancel(addResult.error.format());
    process.exit(1);
  }

  spinner.stop('Branch created');

  // Optionally create worktree
  if (options.worktree) {
    const worktreePath = options.path || await generateWorktreePath(repo.root, branchName);

    spinner.start('Creating worktree...');
    // Switch back to parent first since we need to create worktree for the new branch
    await GitOperations.checkout(currentBranch, repo.root);
    const worktreeResult = await GitOperations.addWorktree(worktreePath, branchName, {}, repo.root);

    if (worktreeResult.isErr()) {
      spinner.stop('Worktree creation failed');
      clack.log.warn(`Could not create worktree: ${worktreeResult.error.message}`);
    } else {
      spinner.stop('Worktree created');
      console.log('');
      console.log(pc.dim(`Worktree created at: ${worktreePath}`));
    }
  }

  // Get short commit for display
  const shortCommit = await GitOperations.getShortCommit(repo.root);

  console.log('');
  console.log(pc.green('✓') + ' Created branch ' + pc.cyan(pc.bold(branchName)));
  console.log('');
  console.log('  ' + pc.dim('Parent:') + '      ' + pc.yellow(currentBranch));
  console.log('  ' + pc.dim('Stack:') + '       ' + pc.cyan(stackName));
  console.log('  ' + pc.dim('Base commit:') + ' ' + pc.dim(shortCommit));
  console.log('');

  // Show visual representation of the stack position
  await showStackPosition(manager, stackName, branchName);
}

/**
 * Show a visual representation of where the new branch is in the stack
 */
async function showStackPosition(
  manager: StackManager,
  stackName: string,
  newBranch: string
): Promise<void> {
  const stackResult = await manager.getStackMetadata(stackName);
  if (stackResult.isErr()) return;

  const branchesResult = await manager.getStackBranches(stackName);
  if (branchesResult.isErr()) return;

  const stack = stackResult.value;
  const branches = branchesResult.value;

  // Build tree structure
  const childrenMap = new Map<string, string[]>();
  childrenMap.set(stack.trunk, []);

  for (const [branch, meta] of branches) {
    const parent = meta.parent;
    if (!childrenMap.has(parent)) {
      childrenMap.set(parent, []);
    }
    childrenMap.get(parent)!.push(branch);
    if (!childrenMap.has(branch)) {
      childrenMap.set(branch, []);
    }
  }

  console.log(pc.dim('Stack:'));

  // Print trunk
  console.log('  ' + pc.yellow(stack.trunk) + pc.dim(' (trunk)'));

  // Recursively print children
  printTree(stack.trunk, childrenMap, '  ', newBranch);

  console.log('');
}

function printTree(
  branch: string,
  childrenMap: Map<string, string[]>,
  prefix: string,
  highlight: string,
  visited: Set<string> = new Set()
): void {
  const children = childrenMap.get(branch) || [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    
    // Prevent infinite recursion from circular parent references
    if (visited.has(child)) {
      console.log(prefix + pc.red('└── ') + pc.red(`${child} (circular reference)`));
      continue;
    }
    
    const isLast = i === children.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');

    const branchDisplay = child === highlight
      ? pc.cyan(pc.bold(child)) + ' ' + pc.green('◀ you are here')
      : pc.cyan(child);

    console.log(prefix + pc.dim(connector) + branchDisplay);
    
    visited.add(child);
    printTree(child, childrenMap, childPrefix, highlight, visited);
  }
}

/**
 * Generate a worktree path for a branch
 */
async function generateWorktreePath(repoRoot: string, branchName: string): Promise<string> {
  const repoName = repoRoot.split('/').pop() || 'repo';
  const safeBranchName = branchName.replace(/\//g, '-');
  return `${repoRoot}/../${repoName}-${safeBranchName}`;
}
