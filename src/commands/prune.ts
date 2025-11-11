/**
 * Prune command - clean up stale worktree references
 */

import * as clack from '@clack/prompts';
import { GitOperations } from '../git/operations.js';

export interface PruneOptions {
  dryRun?: boolean;
  force?: boolean;
}

export async function pruneCommand(options: PruneOptions = {}): Promise<void> {
  const spinner = clack.spinner();

  try {
    // Check if we're in a git repository
    const isRepo = await GitOperations.isGitRepository();
    if (!isRepo) {
      clack.cancel('Not a git repository');
      process.exit(1);
    }

    // First, do a dry run to show what will be pruned
    spinner.start('Checking for prunable worktrees...');
    const dryRunOutput = await GitOperations.pruneWorktrees(true);
    spinner.stop('Checked');

    if (!dryRunOutput || dryRunOutput.trim() === '') {
      clack.log.info('No worktrees to prune');
      clack.outro('✓ Nothing to do');
      return;
    }

    console.log('\nWorktrees that will be pruned:');
    console.log(dryRunOutput);
    console.log('');

    if (options.dryRun) {
      clack.log.info('Dry run completed. Use without --dry-run to actually prune.');
      return;
    }

    // Confirm pruning
    if (!options.force) {
      const confirmed = await clack.confirm({
        message: 'Prune these worktrees?',
        initialValue: false,
      });

      if (!confirmed || clack.isCancel(confirmed)) {
        clack.cancel('Operation cancelled');
        process.exit(0);
      }
    }

    // Actually prune
    spinner.start('Pruning worktrees...');
    await GitOperations.pruneWorktrees(false);
    spinner.stop('Pruned');

    clack.outro('✓ Worktrees pruned');
  } catch (error) {
    spinner.stop('Failed');
    clack.cancel(
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

