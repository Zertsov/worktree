/**
 * Configuration management - reads from git config and .worktree-config.json
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { GitOperations } from '../git/operations.js';
import {
  type WorktreeConfig,
  DEFAULT_CONFIG,
  validateConfig,
  mergeConfigs,
} from './schema.js';

export class ConfigManager {
  private repoRoot: string;
  private configPath: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.configPath = join(repoRoot, '.worktree-config.json');
  }

  /**
   * Load configuration from both git config and JSON file
   */
  async load(): Promise<WorktreeConfig> {
    const gitConfig = await this.loadFromGitConfig();
    const fileConfig = await this.loadFromFile();

    // Merge configs: file config overrides git config
    return mergeConfigs(gitConfig, fileConfig);
  }

  /**
   * Load configuration from git config
   */
  private async loadFromGitConfig(): Promise<WorktreeConfig> {
    const config: WorktreeConfig = {
      stacks: {},
      branchParents: {},
      colors: {},
    };

    try {
      // Get all branch.*.parent configs
      const result = await GitOperations.exec(
        ['config', '--get-regexp', '^branch\\..*\\.parent$'],
        this.repoRoot
      );

      if (result.exitCode === 0 && result.stdout) {
        const lines = result.stdout.trim().split('\n');
        for (const line of lines) {
          const match = line.match(/^branch\.(.+?)\.parent\s+(.+)$/);
          if (match) {
            const [, branch, parent] = match;
            if (config.branchParents) {
              config.branchParents[branch] = parent;
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors - config may not exist
    }

    return config;
  }

  /**
   * Load configuration from .worktree-config.json
   */
  private async loadFromFile(): Promise<WorktreeConfig> {
    if (!existsSync(this.configPath)) {
      return DEFAULT_CONFIG;
    }

    try {
      const file = Bun.file(this.configPath);
      const content = await file.json();

      if (validateConfig(content)) {
        return content;
      }

      console.warn(
        'Invalid .worktree-config.json format, using defaults'
      );
      return DEFAULT_CONFIG;
    } catch (error) {
      console.warn(
        'Failed to read .worktree-config.json, using defaults:',
        error
      );
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Save configuration to .worktree-config.json
   */
  async save(config: WorktreeConfig): Promise<void> {
    try {
      await Bun.write(
        this.configPath,
        JSON.stringify(config, null, 2)
      );
    } catch (error) {
      throw new Error(
        `Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Set branch parent in git config
   */
  async setBranchParent(branch: string, parent: string): Promise<void> {
    await GitOperations.setBranchParent(branch, parent, this.repoRoot);
  }

  /**
   * Get branch parent from merged config
   */
  async getBranchParent(branch: string): Promise<string | null> {
    const config = await this.load();
    return config.branchParents?.[branch] || null;
  }

  /**
   * Set stack color in config file
   */
  async setStackColor(stackRoot: string, color: string): Promise<void> {
    const config = await this.load();
    if (!config.colors) {
      config.colors = {};
    }
    config.colors[stackRoot] = color;
    await this.save(config);
  }

  /**
   * Get stack color from config
   */
  async getStackColor(stackRoot: string): Promise<string | null> {
    const config = await this.load();
    return config.colors?.[stackRoot] || null;
  }

  /**
   * Add branch to stack in config
   */
  async addBranchToStack(stackName: string, branch: string): Promise<void> {
    const config = await this.load();
    if (!config.stacks) {
      config.stacks = {};
    }
    if (!config.stacks[stackName]) {
      config.stacks[stackName] = { branches: [] };
    }
    if (!config.stacks[stackName].branches.includes(branch)) {
      config.stacks[stackName].branches.push(branch);
    }
    await this.save(config);
  }

  /**
   * Remove branch from stack in config
   */
  async removeBranchFromStack(stackName: string, branch: string): Promise<void> {
    const config = await this.load();
    if (config.stacks?.[stackName]) {
      config.stacks[stackName].branches = config.stacks[
        stackName
      ].branches.filter((b) => b !== branch);
      if (config.stacks[stackName].branches.length === 0) {
        delete config.stacks[stackName];
      }
      await this.save(config);
    }
  }
}

