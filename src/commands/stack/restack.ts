/**
 * Stack restack command - Re-record base commits after manual operations
 */

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { GitOperations } from '../../git/operations.js';
import { StackManager } from '../../stack/manager.js';
import { SyncManager } from '../../stack/sync.js';
import { ColorManager } from '../../stack/colors.js';

export interface StackRestackOptions {
  force?: boolean;
}

export async function stackRestackCommand(options: StackRestackOptions = {}): Promise<void> {
  const spinner = clack.spinner();

  // Check if we're in a git repository
  const isRepo = await GitOperations.isGitRepository();
  if (!isRepo) {
    clack.cancel('Not a git repository');
    process.exit(1);
  }

  const repo = await GitOperations.getRepository();
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
    clack.cancel(
      'Current branch is not part of a stack.\n\n' +
        `Initialize a stack with: ${pc.cyan('worktree stack init --trunk <branch>')}`
    );
    process.exit(1);
  }

  const colorManager = new ColorManager();
  const colorFn = colorManager.getColorForStack(stackName);

  // Get current stack info
  spinner.start('Analyzing stack...');

  const branchesResult = await manager.getStackBranches(stackName);
  if (branchesResult.isErr()) {
    spinner.stop('Failed');
    clack.cancel(branchesResult.error.format());
    process.exit(1);
  }

  spinner.stop('Stack analyzed');

  const branches = branchesResult.value;

  // Show what will be updated
  console.log('');
  console.log(pc.bold('This will update base commits for all branches in the stack.'));
  console.log(pc.dim('Use this after manual rebases or other git operations.'));
  console.log('');

  console.log(pc.bold('Branches to update:'));
  console.log('');

  for (const [branchName, meta] of branches) {
    console.log(`  ${colorFn('●')} ${colorFn(branchName)} ${pc.dim('→')} ${meta.parent}`);
  }

  console.log('');

  // Confirm unless force
  if (!options.force) {
    const confirmed = await clack.confirm({
      message: `Update base commits for ${branches.size} branch${branches.size !== 1 ? 'es' : ''}?`,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel('Restack cancelled');
      process.exit(0);
    }
  }

  // Update all base commits
  spinner.start('Updating base commits...');

  const result = await syncManager.restackBranches(stackName);

  if (result.isErr()) {
    spinner.stop('Failed');
    clack.cancel(result.error.format());
    process.exit(1);
  }

  spinner.stop('Base commits updated');

  console.log('');
  console.log(pc.green('✓') + ' ' + pc.bold('Stack restacked successfully!'));
  console.log('');
  console.log(pc.dim('Run ') + pc.cyan('worktree stack status') + pc.dim(' to verify sync status.'));
  console.log('');
}

