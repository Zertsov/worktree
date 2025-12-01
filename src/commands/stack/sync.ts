/**
 * Stack sync command - Sync branches with their parents
 * Uses neverthrow Result types for error handling
 */

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { GitOperations } from '../../git/operations.js';
import { StackManager } from '../../stack/manager.js';
import { SyncManager } from '../../stack/sync.js';
import { ColorManager } from '../../stack/colors.js';

export interface StackSyncOptions {
  merge?: boolean;
  force?: boolean;
  push?: boolean;
}

export async function stackSyncCommand(options: StackSyncOptions = {}): Promise<void> {
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
    clack.cancel(
      'Current branch is not part of a stack.\n\n' +
        `Initialize a stack with: ${pc.cyan('stacks init <trunk>')}`
    );
    process.exit(1);
  }

  // Get stack status first
  spinner.start('Checking sync status...');

  const statusResult = await syncManager.getStackSyncStatus(stackName);
  if (statusResult.isErr()) {
    spinner.stop('Failed');
    clack.cancel(statusResult.error.format());
    process.exit(1);
  }

  const status = statusResult.value;

  if (!status.needsSync) {
    spinner.stop('Already synced');
    console.log('');
    console.log(pc.green('✓') + ' All branches are already synced');
    console.log('');
    return;
  }

  spinner.stop('Sync needed');

  const colorManager = new ColorManager();
  const colorFn = colorManager.getColorForStack(stackName);

  // Show what will be synced
  console.log('');
  console.log(pc.bold('Branches to sync:'));
  console.log('');

  const branchesToSync = status.branches.filter(b => b.status !== 'synced' && b.status !== 'error');
  for (const branch of branchesToSync) {
    const indicator = branch.status === 'behind'
      ? pc.yellow(`+${branch.commitsBehind}`)
      : pc.red('diverged');
    console.log(`  ${colorFn('●')} ${colorFn(branch.branch)} ${pc.dim('→')} ${branch.parent} ${pc.dim(`(${indicator})`)}`);
  }
  console.log('');

  // Confirm
  const confirmed = await clack.confirm({
    message: `Sync ${branchesToSync.length} branch${branchesToSync.length !== 1 ? 'es' : ''} using ${options.merge ? 'merge' : 'rebase'}?`,
  });

  if (clack.isCancel(confirmed) || !confirmed) {
    clack.cancel('Sync cancelled');
    process.exit(0);
  }

  // Fetch latest from remote first
  spinner.start('Fetching from remote...');
  const fetchResult = await GitOperations.fetch('--all', repo.root);
  if (fetchResult.isErr()) {
    spinner.stop('Fetch failed (continuing anyway)');
    clack.log.warn(`Could not fetch: ${fetchResult.error.message}`);
  } else {
    spinner.stop('Fetched');
  }

  // Sync the stack
  console.log('');

  const syncResult = await syncManager.syncStack(stackName, {
    merge: options.merge,
    force: options.force,
  });

  if (syncResult.isErr()) {
    clack.cancel(syncResult.error.format());
    process.exit(1);
  }

  const results = syncResult.value;

  // Show results
  let hasFailures = false;
  for (const result of results) {
    if (result.success) {
      if (result.newBase) {
        console.log(pc.green('✓') + ` ${colorFn(result.branch)} synced`);
      }
    } else {
      hasFailures = true;
      console.log(pc.red('✗') + ` ${colorFn(result.branch)} failed`);

      if (result.conflictFiles && result.conflictFiles.length > 0) {
        console.log('');
        console.log(pc.yellow('  Conflicts in:'));
        for (const file of result.conflictFiles) {
          console.log(`    ${pc.dim('•')} ${file}`);
        }
        console.log('');
        console.log(pc.dim('  To resolve:'));
        console.log(`    1. ${pc.dim('cd')} ${repo.root}`);
        console.log(`    2. ${pc.dim('git checkout')} ${result.branch}`);
        console.log(`    3. ${pc.dim('git')} ${options.merge ? 'merge' : 'rebase'} ${branchesToSync.find(b => b.branch === result.branch)?.parent || 'parent'}`);
        console.log(`    4. Resolve conflicts`);
        console.log(`    5. ${pc.dim('git add')} <files>`);
        console.log(`    6. ${pc.dim('git')} ${options.merge ? 'commit' : 'rebase --continue'}`);
        console.log(`    7. ${pc.cyan('stacks sync')} to continue`);
      } else if (result.error) {
        console.log(pc.dim(`  Error: ${result.error}`));
      }
    }
  }

  console.log('');

  if (hasFailures) {
    clack.log.warn('Sync incomplete - resolve conflicts and run sync again');
  } else {
    console.log(pc.green('✓') + ' ' + pc.bold('Stack synced successfully!'));

    if (options.push) {
      console.log('');
      spinner.start('Pushing to remote...');

      for (const result of results) {
        if (result.success && result.newBase) {
          const pushResult = await GitOperations.pushForce(result.branch, 'origin', repo.root);
          if (pushResult.isErr()) {
            spinner.stop('Push failed');
            clack.log.warn(`Could not push ${result.branch}: ${pushResult.error.message}`);
          }
        }
      }

      spinner.stop('Pushed');
    }
  }

  console.log('');
}
