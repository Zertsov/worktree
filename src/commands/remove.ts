/**
 * Remove command - remove a worktree by path or branch name
 */

import * as clack from '@clack/prompts';
import { join, dirname } from 'path';
import { GitOperations } from '../git/operations.js';
import { GitParser } from '../git/parser.js';

export interface RemoveOptions {
  force?: boolean;
}

export async function removeCommand(
  input: string,
  options: RemoveOptions = {}
): Promise<void> {
  const spinner = clack.spinner();

  try {
    // Check if we're in a git repository
    const isRepo = await GitOperations.isGitRepository();
    if (!isRepo) {
      clack.cancel('Not a git repository');
      process.exit(1);
    }

    const repo = await GitOperations.getRepository();

    // Try to resolve the input to a worktree path
    spinner.start('Resolving worktree path...');
    
    let targetPath: string | null = null;

    // Check if input is a valid directory path
    try {
      const stats = await Bun.file(input).exists();
      if (stats) {
        targetPath = input;
      }
    } catch {
      // Not a valid path, try other methods
    }

    // If not a path, try to find by branch name
    if (!targetPath) {
      const output = await GitOperations.listWorktrees();
      const worktrees = GitParser.parseWorktrees(output);

      const worktree = worktrees.find((wt) => wt.branch === input);
      if (worktree) {
        targetPath = worktree.path;
      }
    }

    // Try sanitized branch name path guess
    if (!targetPath) {
      const sanitized = GitParser.sanitizeBranchName(input);
      const guessPath = join(dirname(repo.root), `${repo.name}-${sanitized}`);
      
      try {
        const stats = await Bun.file(guessPath).exists();
        if (stats) {
          targetPath = guessPath;
        }
      } catch {
        // Guess was wrong
      }
    }

    spinner.stop('Resolved');

    if (!targetPath) {
      clack.cancel(`Unable to resolve worktree for '${input}'`);
      process.exit(1);
    }

    clack.log.info(`Found worktree at: ${targetPath}`);

    // Confirm removal
    if (!options.force) {
      const confirmed = await clack.confirm({
        message: `Remove worktree at ${targetPath}?`,
        initialValue: false,
      });

      if (!confirmed || clack.isCancel(confirmed)) {
        clack.cancel('Operation cancelled');
        process.exit(0);
      }
    }

    // Remove worktree
    spinner.start('Removing worktree...');
    await GitOperations.removeWorktree(targetPath, options.force);
    spinner.stop('Removed');

    clack.outro(`✓ Worktree removed: ${targetPath}`);
  } catch (error) {
    spinner.stop('Failed');
    clack.cancel(
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

