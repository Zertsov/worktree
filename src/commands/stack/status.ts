/**
 * Stack status command - Show sync status for stack branches
 * Uses neverthrow Result types for error handling
 */

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { GitOperations } from '../../git/operations.js';
import { StackManager } from '../../stack/manager.js';
import { SyncManager, type BranchSyncStatus, type StackSyncStatus } from '../../stack/sync.js';
import { ColorManager } from '../../stack/colors.js';

export interface StackStatusOptions {
  verbose?: boolean;
}

export async function stackStatusCommand(options: StackStatusOptions = {}): Promise<void> {
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
  const manager = new StackManager(repo.root);
  const syncManager = new SyncManager(repo.root);

  // Find the stack for the current branch
  let stackName: string | null = null;

  if (currentBranch) {
    const branchStack = await manager.getBranchStack(currentBranch);
    if (branchStack.isOk()) {
      stackName = branchStack.value.stackName;
    }
  }

  if (!stackName) {
    // Try to get any stack
    const allStacks = await manager.getAllStacks();
    if (allStacks.isErr() || allStacks.value.length === 0) {
      clack.cancel(
        'No stacks found.\n\n' +
          `Initialize a stack with: ${pc.cyan('stacks init <trunk>')}`
      );
      process.exit(1);
    }

    // If multiple stacks, show status for all
    if (allStacks.value.length > 1) {
      console.log('');
      console.log(pc.bold('Stack Status'));
      console.log('');

      for (const stack of allStacks.value) {
        await displayStackStatus(syncManager, stack.name, currentBranch, options);
      }
      return;
    }

    stackName = allStacks.value[0].name;
  }

  spinner.start('Checking sync status...');

  const statusResult = await syncManager.getStackSyncStatus(stackName);

  if (statusResult.isErr()) {
    spinner.stop('Failed');
    clack.cancel(statusResult.error.format());
    process.exit(1);
  }

  spinner.stop('Status checked');

  await displayStackStatus(syncManager, stackName, currentBranch, options, statusResult.value);
}

async function displayStackStatus(
  syncManager: SyncManager,
  stackName: string,
  currentBranch: string | null,
  options: StackStatusOptions,
  preloadedStatus?: StackSyncStatus
): Promise<void> {
  let status: StackSyncStatus;

  if (preloadedStatus) {
    status = preloadedStatus;
  } else {
    const statusResult = await syncManager.getStackSyncStatus(stackName);
    if (statusResult.isErr()) {
      console.log(pc.red(`  Error loading stack ${stackName}`));
      return;
    }
    status = statusResult.value;
  }

  const colorManager = new ColorManager();
  const colorFn = colorManager.getColorForStack(stackName);

  console.log('');
  console.log(colorFn('●') + ' ' + pc.bold(colorFn(stackName)));
  console.log(pc.dim(`  Trunk: ${status.trunk}`));
  console.log('');

  // Print trunk
  console.log('  ' + pc.yellow(status.trunk) + pc.dim(' (trunk)'));

  // Build tree and print with status
  const branchMap = new Map<string, BranchSyncStatus>();
  for (const branch of status.branches) {
    branchMap.set(branch.branch, branch);
  }

  // Build children map
  const childrenMap = new Map<string, string[]>();
  childrenMap.set(status.trunk, []);

  for (const branch of status.branches) {
    const parent = branch.parent;
    if (!childrenMap.has(parent)) {
      childrenMap.set(parent, []);
    }
    childrenMap.get(parent)!.push(branch.branch);
    if (!childrenMap.has(branch.branch)) {
      childrenMap.set(branch.branch, []);
    }
  }

  // Print tree with status
  printStatusTree(status.trunk, childrenMap, branchMap, '  ', currentBranch, colorFn, options);

  console.log('');

  // Summary
  if (status.needsSync) {
    const behindCount = status.branches.filter((b: BranchSyncStatus) => b.status === 'behind').length;
    const divergedCount = status.branches.filter((b: BranchSyncStatus) => b.status === 'diverged').length;

    console.log(pc.yellow('⚠') + ' ' + pc.bold('Sync needed'));
    if (behindCount > 0) {
      console.log(pc.dim(`  ${behindCount} branch${behindCount !== 1 ? 'es' : ''} behind parent`));
    }
    if (divergedCount > 0) {
      console.log(pc.dim(`  ${divergedCount} branch${divergedCount !== 1 ? 'es' : ''} diverged`));
    }
    console.log('');
    console.log(`Run ${pc.cyan('stacks sync')} to update branches.`);
  } else {
    console.log(pc.green('✓') + ' ' + pc.bold('All branches synced'));
  }

  console.log('');
}

function printStatusTree(
  branch: string,
  childrenMap: Map<string, string[]>,
  branchMap: Map<string, BranchSyncStatus>,
  prefix: string,
  currentBranch: string | null,
  colorFn: (text: string) => string,
  options: StackStatusOptions,
  visited: Set<string> = new Set()
): void {
  const children = childrenMap.get(branch) || [];
  const sortedChildren = [...children].sort();

  for (let i = 0; i < sortedChildren.length; i++) {
    const child = sortedChildren[i];
    
    // Prevent infinite recursion from circular parent references
    if (visited.has(child)) {
      console.log(prefix + pc.red('└── ') + pc.red(`${child} (circular reference)`));
      continue;
    }
    
    const isLast = i === sortedChildren.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');

    const branchStatus = branchMap.get(child);
    const isCurrent = child === currentBranch;

    let branchDisplay = colorFn(child);
    if (isCurrent) {
      branchDisplay = pc.bold(branchDisplay);
    }

    // Add status indicator
    let statusIndicator = '';
    let statusDetail = '';

    if (branchStatus) {
      switch (branchStatus.status) {
        case 'synced':
          statusIndicator = pc.green(' ✓');
          break;
        case 'behind':
          statusIndicator = pc.yellow(` ⚠`);
          statusDetail = pc.yellow(` +${branchStatus.commitsBehind} commit${branchStatus.commitsBehind !== 1 ? 's' : ''}`);
          break;
        case 'diverged':
          statusIndicator = pc.red(' ⚠');
          statusDetail = pc.red(` diverged`);
          if (options.verbose) {
            statusDetail += pc.dim(` (${branchStatus.commitsAhead} ahead, ${branchStatus.commitsBehind} behind)`);
          }
          break;
        case 'error':
          statusIndicator = pc.red(' ✗');
          if (options.verbose && branchStatus.error) {
            statusDetail = pc.dim(` ${branchStatus.error}`);
          }
          break;
      }
    }

    if (isCurrent) {
      branchDisplay += ' ' + pc.green('◀');
    }

    console.log(prefix + colorFn(connector) + branchDisplay + statusIndicator + statusDetail);
    
    visited.add(child);
    printStatusTree(child, childrenMap, branchMap, childPrefix, currentBranch, colorFn, options, visited);
  }
}
