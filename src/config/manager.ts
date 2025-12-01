/**
 * Configuration management - reads from git config and .worktree-config.json
 * Uses neverthrow Result types for error handling
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { Result, ok, err } from 'neverthrow';
import { GitOperations } from '../git/operations.js';
import {
  type WorktreeConfig,
  DEFAULT_CONFIG,
  validateConfig,
  mergeConfigs,
} from './schema.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type ConfigResult<T> = Result<T, ConfigError>;

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
  async load(): Promise<ConfigResult<WorktreeConfig>> {
    const gitConfigResult = await this.loadFromGitConfig();
    const fileConfigResult = await this.loadFromFile();

    // Both return successful results (even if with defaults), so merge them
    const gitConfig = gitConfigResult.isOk() ? gitConfigResult.value : DEFAULT_CONFIG;
    const fileConfig = fileConfigResult.isOk() ? fileConfigResult.value : DEFAULT_CONFIG;

    // Merge configs: file config overrides git config
    return ok(mergeConfigs(gitConfig, fileConfig));
  }

  /**
   * Load configuration from git config
   */
  private async loadFromGitConfig(): Promise<ConfigResult<WorktreeConfig>> {
    const config: WorktreeConfig = {
      stacks: {},
      branchParents: {},
      colors: {},
    };

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

    return ok(config);
  }

  /**
   * Load configuration from .worktree-config.json
   */
  private async loadFromFile(): Promise<ConfigResult<WorktreeConfig>> {
    if (!existsSync(this.configPath)) {
      return ok(DEFAULT_CONFIG);
    }

    const file = Bun.file(this.configPath);
    const parseResult = await Result.fromThrowable(
      async () => await file.json(),
      (e) => new ConfigError(`Failed to parse config: ${e instanceof Error ? e.message : String(e)}`)
    )();

    if (parseResult.isErr()) {
      console.warn('Failed to read .worktree-config.json, using defaults');
      return ok(DEFAULT_CONFIG);
    }

    const content = parseResult.value;

    if (validateConfig(content)) {
      return ok(content);
    }

    console.warn('Invalid .worktree-config.json format, using defaults');
    return ok(DEFAULT_CONFIG);
  }

  /**
   * Save configuration to .worktree-config.json
   */
  async save(config: WorktreeConfig): Promise<ConfigResult<void>> {
    const writeResult = await Result.fromThrowable(
      async () => await Bun.write(this.configPath, JSON.stringify(config, null, 2)),
      (e) => new ConfigError(`Failed to save configuration: ${e instanceof Error ? e.message : String(e)}`)
    )();

    return writeResult.map(() => undefined);
  }

  /**
   * Set branch parent in git config
   */
  async setBranchParent(branch: string, parent: string): Promise<ConfigResult<void>> {
    const result = await GitOperations.setBranchParent(branch, parent, this.repoRoot);
    return result.mapErr((e) => new ConfigError(e.message));
  }

  /**
   * Get branch parent from merged config
   */
  async getBranchParent(branch: string): Promise<string | null> {
    const configResult = await this.load();
    if (configResult.isErr()) {
      return null;
    }
    return configResult.value.branchParents?.[branch] || null;
  }

  /**
   * Set stack color in config file
   */
  async setStackColor(stackRoot: string, color: string): Promise<ConfigResult<void>> {
    const configResult = await this.load();
    if (configResult.isErr()) {
      return err(configResult.error);
    }

    const config = configResult.value;
    if (!config.colors) {
      config.colors = {};
    }
    config.colors[stackRoot] = color;
    return this.save(config);
  }

  /**
   * Get stack color from config
   */
  async getStackColor(stackRoot: string): Promise<string | null> {
    const configResult = await this.load();
    if (configResult.isErr()) {
      return null;
    }
    return configResult.value.colors?.[stackRoot] || null;
  }

  /**
   * Add branch to stack in config
   */
  async addBranchToStack(stackName: string, branch: string): Promise<ConfigResult<void>> {
    const configResult = await this.load();
    if (configResult.isErr()) {
      return err(configResult.error);
    }

    const config = configResult.value;
    if (!config.stacks) {
      config.stacks = {};
    }
    if (!config.stacks[stackName]) {
      config.stacks[stackName] = { branches: [] };
    }
    if (!config.stacks[stackName].branches.includes(branch)) {
      config.stacks[stackName].branches.push(branch);
    }
    return this.save(config);
  }

  /**
   * Remove branch from stack in config
   */
  async removeBranchFromStack(stackName: string, branch: string): Promise<ConfigResult<void>> {
    const configResult = await this.load();
    if (configResult.isErr()) {
      return err(configResult.error);
    }

    const config = configResult.value;
    if (config.stacks?.[stackName]) {
      config.stacks[stackName].branches = config.stacks[stackName].branches.filter(
        (b) => b !== branch
      );
      if (config.stacks[stackName].branches.length === 0) {
        delete config.stacks[stackName];
      }
      return this.save(config);
    }
    return ok(undefined);
  }
}
