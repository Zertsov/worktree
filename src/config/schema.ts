/**
 * Configuration schema and validation
 */

export interface StackConfig {
  branches: string[];
  color?: string;
}

export interface WorktreeConfig {
  stacks?: {
    [name: string]: StackConfig;
  };
  branchParents?: {
    [branch: string]: string;
  };
  colors?: {
    [stackRoot: string]: string;
  };
}

export const DEFAULT_CONFIG: WorktreeConfig = {
  stacks: {},
  branchParents: {},
  colors: {},
};

/**
 * Validate configuration object
 */
export function validateConfig(config: unknown): config is WorktreeConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const c = config as WorktreeConfig;

  // Validate stacks
  if (c.stacks !== undefined) {
    if (typeof c.stacks !== 'object') return false;
    for (const [_, stack] of Object.entries(c.stacks)) {
      if (!Array.isArray(stack.branches)) return false;
      if (stack.color !== undefined && typeof stack.color !== 'string') {
        return false;
      }
    }
  }

  // Validate branchParents
  if (c.branchParents !== undefined) {
    if (typeof c.branchParents !== 'object') return false;
    for (const [_, parent] of Object.entries(c.branchParents)) {
      if (typeof parent !== 'string') return false;
    }
  }

  // Validate colors
  if (c.colors !== undefined) {
    if (typeof c.colors !== 'object') return false;
    for (const [_, color] of Object.entries(c.colors)) {
      if (typeof color !== 'string') return false;
    }
  }

  return true;
}

/**
 * Merge two configurations (right takes precedence)
 */
export function mergeConfigs(
  base: WorktreeConfig,
  override: WorktreeConfig
): WorktreeConfig {
  return {
    stacks: { ...base.stacks, ...override.stacks },
    branchParents: { ...base.branchParents, ...override.branchParents },
    colors: { ...base.colors, ...override.colors },
  };
}

