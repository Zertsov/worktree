/**
 * List command - enhanced worktree listing with stack visualization
 */

import * as clack from '@clack/prompts';
import { GitOperations } from '../git/operations.js';
import { StackDetector } from '../stack/detector.js';
import { StackVisualizer } from '../stack/visualizer.js';
import { ColorManager } from '../stack/colors.js';

export interface ListOptions {
  verbose?: boolean;
  tree?: boolean;
  simple?: boolean;
  noStack?: boolean;
}

export async function listCommand(options: ListOptions = {}): Promise<void> {
  const spinner = clack.spinner();

  try {
    // Check if we're in a git repository
    const isRepo = await GitOperations.isGitRepository();
    if (!isRepo) {
      clack.cancel('Not a git repository');
      process.exit(1);
    }

    // Simple mode: just list worktrees without formatting
    if (options.simple) {
      spinner.start('Loading worktrees...');
      const output = await GitOperations.listWorktrees();
      spinner.stop('Loaded');
      console.log(output);
      return;
    }

    // No-stack mode: list worktrees without stack detection
    if (options.noStack) {
      spinner.start('Loading worktrees...');
      const repo = await GitOperations.getRepository();
      const detector = new StackDetector(repo.root);
      const worktrees = await detector.getAllWorktrees();
      const currentPath = process.cwd();
      spinner.stop('Loaded');

      console.log(''); // Empty line for spacing

      if (worktrees.length === 0) {
        console.log('No worktrees found.');
      } else {
        for (const wt of worktrees) {
          const isCurrent = wt.path === currentPath;
          const marker = isCurrent ? '→' : ' ';
          const branch = wt.branch || '(detached)';
          console.log(`${marker} ${branch.padEnd(30)} ${wt.path}`);
        }
      }

      console.log(''); // Empty line for spacing
      return;
    }

    spinner.start('Loading worktrees and branches...');

    const repo = await GitOperations.getRepository();
    const detector = new StackDetector(repo.root);

    const [branches, worktrees] = await Promise.all([
      detector.getAllBranches(),
      detector.getAllWorktrees(),
    ]);

    const currentBranch = await GitOperations.getCurrentBranch();
    const currentPath = process.cwd();

    spinner.stop('Loaded');

    // Detect stacks
    const stacks = await detector.detectStacks(branches, worktrees);
    const colorManager = new ColorManager();
    const visualizer = new StackVisualizer(colorManager);

    // Update stack colors
    for (const [root, stack] of stacks.entries()) {
      stack.color = colorManager.getColorName(root);
    }

    console.log(''); // Empty line for spacing

    if (options.tree) {
      // Tree view showing full stack relationships
      const lines = visualizer.visualizeStacks(stacks, currentBranch, {
        showPaths: options.verbose,
        highlightCurrent: true,
      });

      for (const line of lines) {
        console.log(line);
      }
    } else {
      // List view showing worktrees grouped by stack
      const lines = visualizer.visualizeWorktreeList(
        worktrees,
        stacks,
        currentPath
      );

      if (lines.length === 0) {
        console.log('No worktrees found.');
      } else {
        for (const line of lines) {
          console.log(line);
        }
      }

      // Show stack summary if verbose
      if (options.verbose) {
        console.log('');
        console.log('Stacks:');
        const summary = visualizer.createStackSummary(stacks);
        for (const line of summary) {
          console.log('  ' + line);
        }
      }
    }

    console.log(''); // Empty line for spacing
  } catch (error) {
    spinner.stop('Failed');
    clack.cancel(
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

