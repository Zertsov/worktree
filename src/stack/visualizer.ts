/**
 * Generate tree structures for stack visualization
 */

import pc from 'picocolors';
import type { Stack, StackNode } from './types.js';
import type { Worktree } from '../git/types.js';
import { ColorManager, colors } from './colors.js';

export interface VisualizationOptions {
  showPaths?: boolean;
  showStatus?: boolean;
  highlightCurrent?: boolean;
  compact?: boolean;
}

export class StackVisualizer {
  private colorManager: ColorManager;

  constructor(colorManager?: ColorManager) {
    this.colorManager = colorManager || new ColorManager();
  }

  /**
   * Visualize all stacks as a tree
   */
  visualizeStacks(
    stacks: Map<string, Stack>,
    currentBranch: string | null,
    options: VisualizationOptions = {}
  ): string[] {
    const lines: string[] = [];
    const stackArray = Array.from(stacks.values());

    for (let i = 0; i < stackArray.length; i++) {
      const stack = stackArray[i];
      const isLast = i === stackArray.length - 1;

      lines.push(
        ...this.visualizeStack(stack, currentBranch, isLast, options)
      );

      if (!isLast && !options.compact) {
        lines.push(''); // Empty line between stacks
      }
    }

    return lines;
  }

  /**
   * Visualize a single stack as a tree
   */
  private visualizeStack(
    stack: Stack,
    currentBranch: string | null,
    isLastStack: boolean,
    options: VisualizationOptions
  ): string[] {
    const lines: string[] = [];
    const colorFn = this.colorManager.getColorForStack(stack.root);

    // Build tree structure starting from root
    const rootNode = stack.nodes.get(stack.root);
    if (!rootNode) return lines;

    this.buildTreeLines(
      rootNode,
      stack,
      '',
      true,
      currentBranch,
      colorFn,
      options,
      lines
    );

    return lines;
  }

  /**
   * Recursively build tree lines for a node and its children
   */
  private buildTreeLines(
    node: StackNode,
    stack: Stack,
    prefix: string,
    isLast: boolean,
    currentBranch: string | null,
    colorFn: (text: string) => string,
    options: VisualizationOptions,
    lines: string[]
  ): void {
    const isCurrent = node.branch === currentBranch;
    const connector = isLast ? '└──' : '├──';
    const branchPrefix = node.depth === 0 ? '' : colorFn(connector) + ' ';

    // Build the branch line
    let line = prefix + branchPrefix;

    // Branch name (highlighted if current)
    if (isCurrent && options.highlightCurrent) {
      line += pc.bold(colorFn(node.branch));
    } else {
      line += colorFn(node.branch);
    }

    // Add worktree path if available and requested
    if (options.showPaths && node.worktree) {
      line += colors.dim(` → ${node.worktree.path}`);
    }

    // Add worktree indicator
    if (node.worktree) {
      line += colors.dim(' [worktree]');
    }

    // Check if this branch shares the same commit with siblings
    if (node.parent && node.commit) {
      const parentNode = stack.nodes.get(node.parent);
      if (parentNode) {
        const siblings = parentNode.children
          .filter((sibling) => sibling !== node.branch)
          .map((sibling) => stack.nodes.get(sibling))
          .filter((s): s is StackNode => s !== undefined && s.commit === node.commit);
        
        if (siblings.length > 0) {
          const siblingNames = siblings.map((s) => s.branch).join(', ');
          line += colors.dim(` [same commit as ${siblingNames}]`);
        }
      }
    }

    lines.push(line);

    // Process children
    if (node.children.length > 0) {
      const childPrefix =
        prefix + (node.depth === 0 ? '' : isLast ? '    ' : colorFn('│') + '   ');

      const sortedChildren = [...node.children].sort();

      for (let i = 0; i < sortedChildren.length; i++) {
        const childBranch = sortedChildren[i];
        const childNode = stack.nodes.get(childBranch);
        if (!childNode) continue;

        const isLastChild = i === sortedChildren.length - 1;
        this.buildTreeLines(
          childNode,
          stack,
          childPrefix,
          isLastChild,
          currentBranch,
          colorFn,
          options,
          lines
        );
      }
    }
  }

  /**
   * Visualize worktrees in a simple list format
   */
  visualizeWorktreeList(
    worktrees: Worktree[],
    stacks: Map<string, Stack>,
    currentPath: string | null
  ): string[] {
    const lines: string[] = [];

    // Build a map of branch to stack root
    const branchToStack = new Map<string, string>();
    for (const [root, stack] of stacks.entries()) {
      for (const branch of stack.branches) {
        branchToStack.set(branch, root);
      }
    }

    for (const wt of worktrees) {
      const isCurrent = wt.path === currentPath;
      const stackRoot = wt.branch ? branchToStack.get(wt.branch) : null;
      const colorFn = stackRoot
        ? this.colorManager.getColorForStack(stackRoot)
        : (text: string) => text;

      let line = '';

      // Current indicator
      if (isCurrent) {
        line += pc.bold(pc.green('● '));
      } else {
        line += '  ';
      }

      // Branch name
      if (wt.branch) {
        line += colorFn(wt.branch);
      } else if (wt.detached) {
        line += colors.yellow('[detached]');
      } else {
        line += colors.gray('[bare]');
      }

      // Path
      line += colors.dim(` → ${wt.path}`);

      // Locked indicator
      if (wt.locked) {
        line += ' ' + colors.red('[locked]');
      }

      // Prunable indicator
      if (wt.prunable) {
        line += ' ' + colors.yellow('[prunable]');
      }

      lines.push(line);
    }

    return lines;
  }

  /**
   * Create a compact summary of stacks
   */
  createStackSummary(stacks: Map<string, Stack>): string[] {
    const lines: string[] = [];

    for (const [root, stack] of stacks.entries()) {
      const colorFn = this.colorManager.getColorForStack(root);
      const branchCount = stack.branches.length;
      const worktreeCount = Array.from(stack.nodes.values()).filter(
        (n) => n.worktree
      ).length;

      let line = colorFn('●') + ' ' + colorFn(pc.bold(root));
      line += colors.dim(
        ` (${branchCount} branch${branchCount !== 1 ? 'es' : ''}, ${worktreeCount} worktree${worktreeCount !== 1 ? 's' : ''})`
      );

      lines.push(line);
    }

    return lines;
  }

  /**
   * Format a simple branch tree without full stack context
   */
  formatBranchTree(
    branch: string,
    parent: string | null,
    children: string[],
    colorFn: (text: string) => string
  ): string[] {
    const lines: string[] = [];

    if (parent) {
      lines.push(colors.dim('  Parent: ') + colorFn(parent));
    }

    lines.push(colorFn('● ' + branch));

    if (children.length > 0) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const isLast = i === children.length - 1;
        const connector = isLast ? '└──' : '├──';
        lines.push(colorFn('  ' + connector) + ' ' + colorFn(child));
      }
    }

    return lines;
  }
}

