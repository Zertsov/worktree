/**
 * Stack command - display full stack visualization
 */

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { GitOperations } from '../git/operations.js';
import { StackDetector } from '../stack/detector.js';
import { StackVisualizer } from '../stack/visualizer.js';
import { ColorManager } from '../stack/colors.js';
import { StackManager } from '../stack/manager.js';

export interface StackOptions {
  verbose?: boolean;
  all?: boolean; // Show both explicit and detected stacks
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

    spinner.start('Analyzing stacks...');

    const repo = await GitOperations.getRepository();
    const manager = new StackManager(repo.root);
    const currentBranch = await GitOperations.getCurrentBranch(repo.root);

    // Get explicit stacks first
    const explicitStacksResult = await manager.getAllStacks();
    
    if (explicitStacksResult.isErr()) {
      spinner.stop('Failed');
      clack.cancel(explicitStacksResult.error.format());
      process.exit(1);
    }

    const explicitStacks = explicitStacksResult.value;
    
    spinner.stop('Analysis complete');

    // If we have explicit stacks, show them
    if (explicitStacks.length > 0) {
      console.log('');
      console.log(pc.bold(`Managed Stacks (${explicitStacks.length}):`));
      console.log('');

      for (const stackMeta of explicitStacks) {
        await displayExplicitStack(manager, stackMeta, currentBranch, options);
      }
    }

    // Optionally show detected stacks (for branches not in explicit stacks)
    if (options.all || explicitStacks.length === 0) {
      const detector = new StackDetector(repo.root);
      const [branches, worktrees] = await Promise.all([
        detector.getAllBranches(),
        detector.getAllWorktrees(),
      ]);

      const detectedStacks = await detector.detectStacks(branches, worktrees);

      // Filter out branches that are in explicit stacks
      const explicitBranches = new Set<string>();
      const explicitTrunks = new Set<string>();
      for (const stackMeta of explicitStacks) {
        explicitTrunks.add(stackMeta.trunk);
        const branchesResult = await manager.getStackBranches(stackMeta.name);
        if (branchesResult.isOk()) {
          for (const branch of branchesResult.value.keys()) {
            explicitBranches.add(branch);
          }
        }
      }

      // Remove stacks that overlap with explicit stacks
      for (const [root, stack] of detectedStacks.entries()) {
        // Remove if root is an explicit trunk or explicit branch
        if (explicitTrunks.has(root) || explicitBranches.has(root)) {
          detectedStacks.delete(root);
          continue;
        }
        // Remove if any branch in the stack is explicit
        const hasExplicit = stack.branches.some(b => explicitBranches.has(b));
        if (hasExplicit) {
          detectedStacks.delete(root);
        }
      }

      if (detectedStacks.size > 0) {
        if (explicitStacks.length > 0) {
          console.log('');
          console.log(pc.dim('─'.repeat(40)));
          console.log('');
          console.log(pc.bold(pc.dim(`Detected Stacks (${detectedStacks.size}):`)));
          console.log(pc.dim('These are branch relationships detected from git history.'));
          console.log(pc.dim(`Use ${pc.cyan('stacks init')} to manage them explicitly.`));
          console.log('');
        }

        const colorManager = new ColorManager();
        const visualizer = new StackVisualizer(colorManager);

        for (const [root, stack] of detectedStacks.entries()) {
          stack.color = colorManager.getColorName(root);
        }

        const lines = visualizer.visualizeStacks(detectedStacks, currentBranch, {
          showPaths: options.verbose,
          highlightCurrent: true,
        });

        for (const line of lines) {
          console.log(line);
        }
      }
    }

    // Show help if no stacks found
    if (explicitStacks.length === 0 && !options.all) {
      console.log('');
      clack.log.info('No managed stacks found.');
      console.log('');
      console.log(pc.dim('To create a stack:'));
      console.log(`  1. Checkout your feature branch`);
      console.log(`  2. Run ${pc.cyan('stacks init main')}`);
      console.log(`  3. Create child branches with ${pc.cyan('stacks new <name>')}`);
      console.log('');
      console.log(pc.dim(`Use ${pc.cyan('stacks list --all')} to see detected branch relationships.`));
    }

    console.log('');
  } catch (error) {
    spinner.stop('Failed');
    clack.cancel(
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

/**
 * Display an explicit stack with its branches
 */
async function displayExplicitStack(
  manager: StackManager,
  stackMeta: { name: string; trunk: string; root: string; createdAt: string },
  currentBranch: string | null,
  options: StackOptions
): Promise<void> {
  const branchesResult = await manager.getStackBranches(stackMeta.name);
  if (branchesResult.isErr()) {
    console.log(pc.red(`  Error loading stack ${stackMeta.name}`));
    return;
  }

  const branches = branchesResult.value;
  const colorManager = new ColorManager();
  const colorFn = colorManager.getColorForStack(stackMeta.name);

  // Print stack header
  console.log(colorFn('●') + ' ' + pc.bold(colorFn(stackMeta.name)));
  console.log(pc.dim(`  Trunk: ${stackMeta.trunk} · ${branches.size} branch${branches.size !== 1 ? 'es' : ''}`));
  console.log('');

  // Build tree structure
  const childrenMap = new Map<string, string[]>();
  childrenMap.set(stackMeta.trunk, []);

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

  // Print trunk
  console.log('  ' + pc.yellow(stackMeta.trunk) + pc.dim(' (trunk)'));

  // Print tree
  printStackTree(stackMeta.trunk, childrenMap, '  ', currentBranch, colorFn);
  console.log('');
}

function printStackTree(
  branch: string,
  childrenMap: Map<string, string[]>,
  prefix: string,
  currentBranch: string | null,
  colorFn: (text: string) => string
): void {
  const children = childrenMap.get(branch) || [];
  const sortedChildren = [...children].sort();

  for (let i = 0; i < sortedChildren.length; i++) {
    const child = sortedChildren[i];
    const isLast = i === sortedChildren.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');

    const isCurrent = child === currentBranch;
    let branchDisplay = colorFn(child);
    if (isCurrent) {
      branchDisplay = pc.bold(branchDisplay) + ' ' + pc.green('◀');
    }

    console.log(prefix + colorFn(connector) + branchDisplay);
    printStackTree(child, childrenMap, childPrefix, currentBranch, colorFn);
  }
}

