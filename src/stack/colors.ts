/**
 * Color coordination for stacks and worktrees
 */

import pc from 'picocolors';

// Available colors for stack visualization
const STACK_COLORS = [
  'cyan',
  'magenta',
  'yellow',
  'green',
  'blue',
  'red',
] as const;

type ColorName = (typeof STACK_COLORS)[number];

export class ColorManager {
  private stackColors = new Map<string, ColorName>();
  private usedColors = new Set<ColorName>();

  /**
   * Get color function for a stack root
   */
  getColorForStack(stackRoot: string): (text: string) => string {
    let colorName = this.stackColors.get(stackRoot);

    if (!colorName) {
      colorName = this.assignColor(stackRoot);
      this.stackColors.set(stackRoot, colorName);
    }

    return this.getColorFunction(colorName);
  }

  /**
   * Assign a color to a stack root using consistent hashing
   */
  private assignColor(stackRoot: string): ColorName {
    // Simple hash function for consistent color assignment
    const hash = this.hashString(stackRoot);
    const index = hash % STACK_COLORS.length;

    // Try to use the hashed color first
    let color = STACK_COLORS[index];
    if (!this.usedColors.has(color)) {
      this.usedColors.add(color);
      return color;
    }

    // If already used, find first available
    for (const c of STACK_COLORS) {
      if (!this.usedColors.has(c)) {
        this.usedColors.add(c);
        return c;
      }
    }

    // All colors used, cycle back
    return color;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get picocolors function for a color name
   */
  private getColorFunction(colorName: ColorName): (text: string) => string {
    switch (colorName) {
      case 'cyan':
        return pc.cyan;
      case 'magenta':
        return pc.magenta;
      case 'yellow':
        return pc.yellow;
      case 'green':
        return pc.green;
      case 'blue':
        return pc.blue;
      case 'red':
        return pc.red;
    }
  }

  /**
   * Get color name for a stack (for display purposes)
   */
  getColorName(stackRoot: string): string {
    return this.stackColors.get(stackRoot) || 'default';
  }

  /**
   * Reset all color assignments
   */
  reset(): void {
    this.stackColors.clear();
    this.usedColors.clear();
  }
}

/**
 * Utility functions for colored output
 */
export const colors = {
  dim: pc.dim,
  bold: pc.bold,
  cyan: pc.cyan,
  magenta: pc.magenta,
  yellow: pc.yellow,
  green: pc.green,
  blue: pc.blue,
  red: pc.red,
  gray: pc.gray,
  white: pc.white,
};

