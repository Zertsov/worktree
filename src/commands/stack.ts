/**
 * Stack command - display full stack visualization
 */

import * as clack from '@clack/prompts';
import { GitOperations } from '../git/operations.js';
import { StackDetector } from '../stack/detector.js';
import { StackVisualizer } from '../stack/visualizer.js';
import { ColorManager } from '../stack/colors.js';

export interface StackOptions {
  verbose?: boolean;
}

export async function stackCommand(options: StackOptions = {}): Promise<void> {
  const spinner = clack.spinner();

  try {
    // Check if we're in a git repository
    const isRepo = await GitOperations.isGitRepository();
    if (!isRepo) {
      clack.cancel('Not a git repository');
      process.exit(1);
    }

    spinner.start('Analyzing branch relationships...');

    const repo = await GitOperations.getRepository();
    const detector = new StackDetector(repo.root);

    const [branches, worktrees] = await Promise.all([
      detector.getAllBranches(),
      detector.getAllWorktrees(),
    ]);

    const currentBranch = await GitOperations.getCurrentBranch();

    // Detect stacks
    const stacks = await detector.detectStacks(branches, worktrees);

    spinner.stop('Analysis complete');

    if (stacks.size === 0) {
      clack.log.info('No branch stacks found');
      return;
    }

    // Visualize stacks
    const colorManager = new ColorManager();
    const visualizer = new StackVisualizer(colorManager);

    // Update stack colors
    for (const [root, stack] of stacks.entries()) {
      stack.color = colorManager.getColorName(root);
    }

    console.log('');
    console.log(`Found ${stacks.size} stack${stacks.size !== 1 ? 's' : ''}:`);
    console.log('');

    const lines = visualizer.visualizeStacks(stacks, currentBranch, {
      showPaths: options.verbose,
      highlightCurrent: true,
    });

    for (const line of lines) {
      console.log(line);
    }

    console.log('');

    // Show statistics
    let totalBranches = 0;
    let totalWorktrees = 0;
    for (const stack of stacks.values()) {
      totalBranches += stack.branches.length;
      totalWorktrees += Array.from(stack.nodes.values()).filter(
        (n) => n.worktree
      ).length;
    }

    clack.log.info(
      `Total: ${totalBranches} branches, ${totalWorktrees} worktrees`
    );
  } catch (error) {
    spinner.stop('Failed');
    clack.cancel(
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

