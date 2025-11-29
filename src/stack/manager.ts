/**
 * Stack management - CRUD operations for explicit stack tracking via git config
 */

import { Result } from 'neverthrow';
import { GitOperations } from '../git/operations.js';
import { type IGitOperations, defaultGitOps } from '../git/interface.js';
import {
  StackResult,
  StackErrors,
  stackOk,
  stackErr,
} from './errors.js';

/**
 * Metadata for a stack stored in git config
 */
export interface StackMetadata {
  name: string;
  trunk: string;
  root: string;
  createdAt: string;
}

/**
 * Metadata for a branch in a stack
 */
export interface BranchStackMetadata {
  stackName: string;
  parent: string;
  baseCommit: string; // The commit hash this branch was created from
}

/**
 * Full stack info including all branches
 */
export interface StackInfo {
  metadata: StackMetadata;
  branches: Map<string, BranchStackMetadata>;
}

/**
 * Manager for explicit stack operations
 * Stores metadata in git config with the following structure:
 *
 * Stack config:
 *   stacks.<name>.trunk = "main"
 *   stacks.<name>.root = "feature/auth"
 *   stacks.<name>.created = "2024-01-15T10:30:00Z"
 *
 * Branch config:
 *   branch.<name>.stackname = "mystack"
 *   branch.<name>.stackparent = "main"
 *   branch.<name>.stackbase = "abc123def"
 */
export class StackManager {
  private readonly git: IGitOperations;

  constructor(
    private readonly repoRoot: string,
    gitOps?: IGitOperations
  ) {
    this.git = gitOps || defaultGitOps;
  }

  /**
   * Initialize a new stack from the current branch
   */
  async initStack(
    stackName: string,
    trunk: string,
    rootBranch: string
  ): Promise<StackResult<StackMetadata>> {
    // Verify trunk branch exists
    const trunkExists = await this.git.branchExists(trunk, this.repoRoot);
    if (!trunkExists) {
      return StackErrors.invalidTrunk(trunk);
    }

    // Check if stack already exists
    const existingStack = await this.getStackMetadata(stackName);
    if (existingStack.isOk()) {
      return StackErrors.stackExists(stackName);
    }

    // Check if root branch is already in a stack
    const existingBranchStack = await this.getBranchStack(rootBranch);
    if (existingBranchStack.isOk()) {
      return StackErrors.alreadyInStack(rootBranch, existingBranchStack.value.stackName);
    }

    // Get current commit as base
    const baseCommit = await this.getCurrentCommit();
    if (baseCommit.isErr()) {
      return baseCommit;
    }

    const createdAt = new Date().toISOString();

    // Store stack metadata
    const stackConfigResult = await this.setGitConfig(
      `stacks.${stackName}.trunk`,
      trunk
    );
    if (stackConfigResult.isErr()) return stackConfigResult;

    const rootConfigResult = await this.setGitConfig(
      `stacks.${stackName}.root`,
      rootBranch
    );
    if (rootConfigResult.isErr()) return rootConfigResult;

    const createdConfigResult = await this.setGitConfig(
      `stacks.${stackName}.created`,
      createdAt
    );
    if (createdConfigResult.isErr()) return createdConfigResult;

    // Store branch metadata (root branch has trunk as parent)
    const branchResult = await this.setBranchStackMetadata(rootBranch, {
      stackName,
      parent: trunk,
      baseCommit: baseCommit.value,
    });
    if (branchResult.isErr()) return branchResult;

    return stackOk({
      name: stackName,
      trunk,
      root: rootBranch,
      createdAt,
    });
  }

  /**
   * Add a new branch to a stack
   */
  async addBranch(
    branchName: string,
    parentBranch: string,
    stackName: string
  ): Promise<StackResult<BranchStackMetadata>> {
    // Verify the stack exists
    const stackResult = await this.getStackMetadata(stackName);
    if (stackResult.isErr()) {
      return StackErrors.stackNotFound(stackName);
    }

    // Verify parent is in the same stack
    const parentStack = await this.getBranchStack(parentBranch);
    if (parentStack.isErr()) {
      return StackErrors.notInStack(parentBranch);
    }
    if (parentStack.value.stackName !== stackName) {
      return stackErr(
        'CONFIG_ERROR',
        `Parent branch '${parentBranch}' is in a different stack '${parentStack.value.stackName}'`
      );
    }

    // Check if branch is already in a stack
    const existingStack = await this.getBranchStack(branchName);
    if (existingStack.isOk()) {
      return StackErrors.alreadyInStack(branchName, existingStack.value.stackName);
    }

    // Get current commit as base
    const baseCommit = await this.getCurrentCommit();
    if (baseCommit.isErr()) {
      return baseCommit;
    }

    const metadata: BranchStackMetadata = {
      stackName,
      parent: parentBranch,
      baseCommit: baseCommit.value,
    };

    const result = await this.setBranchStackMetadata(branchName, metadata);
    if (result.isErr()) return result;

    return stackOk(metadata);
  }

  /**
   * Get stack metadata by name
   */
  async getStackMetadata(stackName: string): Promise<StackResult<StackMetadata>> {
    const trunk = await this.getGitConfig(`stacks.${stackName}.trunk`);
    if (trunk.isErr() || !trunk.value) {
      return StackErrors.stackNotFound(stackName);
    }

    const root = await this.getGitConfig(`stacks.${stackName}.root`);
    if (root.isErr() || !root.value) {
      return StackErrors.stackNotFound(stackName);
    }

    const createdAt = await this.getGitConfig(`stacks.${stackName}.created`);

    return stackOk({
      name: stackName,
      trunk: trunk.value,
      root: root.value,
      createdAt: createdAt.isOk() ? createdAt.value || '' : '',
    });
  }

  /**
   * Get stack metadata for a branch
   */
  async getBranchStack(branchName: string): Promise<StackResult<BranchStackMetadata>> {
    const stackName = await this.getGitConfig(`branch.${branchName}.stackname`);
    if (stackName.isErr() || !stackName.value) {
      return StackErrors.notInStack(branchName);
    }

    const parent = await this.getGitConfig(`branch.${branchName}.stackparent`);
    if (parent.isErr() || !parent.value) {
      return StackErrors.notInStack(branchName);
    }

    const baseCommit = await this.getGitConfig(`branch.${branchName}.stackbase`);

    return stackOk({
      stackName: stackName.value,
      parent: parent.value,
      baseCommit: baseCommit.isOk() ? baseCommit.value || '' : '',
    });
  }

  /**
   * Get all stacks in the repository
   */
  async getAllStacks(): Promise<StackResult<StackMetadata[]>> {
    const result = await this.git.exec(
      ['config', '--get-regexp', '^stacks\\..*\\.trunk$'],
      this.repoRoot
    );

    if (result.exitCode !== 0) {
      // No stacks configured - this is not an error
      return stackOk([]);
    }

    const stacks: StackMetadata[] = [];
    const lines = result.stdout.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      // Format: stacks.<name>.trunk <value>
      const match = line.match(/^stacks\.([^.]+)\.trunk\s+(.+)$/);
      if (match) {
        const [, name] = match;
        const metadata = await this.getStackMetadata(name);
        if (metadata.isOk()) {
          stacks.push(metadata.value);
        }
      }
    }

    return stackOk(stacks);
  }

  /**
   * Get all branches in a stack
   */
  async getStackBranches(stackName: string): Promise<StackResult<Map<string, BranchStackMetadata>>> {
    const result = await this.git.exec(
      ['config', '--get-regexp', `^branch\\..*\\.stackname$`],
      this.repoRoot
    );

    const branches = new Map<string, BranchStackMetadata>();

    if (result.exitCode !== 0) {
      // No branches configured
      return stackOk(branches);
    }

    const lines = result.stdout.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      // Format: branch.<name>.stackname <value>
      const match = line.match(/^branch\.([^.]+)\.stackname\s+(.+)$/);
      if (match) {
        const [, branchName, foundStackName] = match;
        if (foundStackName === stackName) {
          const metadata = await this.getBranchStack(branchName);
          if (metadata.isOk()) {
            branches.set(branchName, metadata.value);
          }
        }
      }
    }

    return stackOk(branches);
  }

  /**
   * Update the base commit for a branch (after sync)
   */
  async updateBranchBase(branchName: string, newBase: string): Promise<StackResult<void>> {
    return this.setGitConfig(`branch.${branchName}.stackbase`, newBase);
  }

  /**
   * Remove a branch from its stack
   */
  async removeBranch(branchName: string): Promise<StackResult<void>> {
    const unsetStackname = await this.unsetGitConfig(`branch.${branchName}.stackname`);
    if (unsetStackname.isErr()) return unsetStackname;

    const unsetParent = await this.unsetGitConfig(`branch.${branchName}.stackparent`);
    if (unsetParent.isErr()) return unsetParent;

    const unsetBase = await this.unsetGitConfig(`branch.${branchName}.stackbase`);
    if (unsetBase.isErr()) return unsetBase;

    return stackOk(undefined);
  }

  /**
   * Delete a stack and remove all branch associations
   */
  async deleteStack(stackName: string): Promise<StackResult<void>> {
    // Get all branches in the stack
    const branches = await this.getStackBranches(stackName);
    if (branches.isErr()) return branches;

    // Remove branch metadata
    for (const branchName of branches.value.keys()) {
      const result = await this.removeBranch(branchName);
      if (result.isErr()) return result;
    }

    // Remove stack metadata
    const unsetTrunk = await this.unsetGitConfig(`stacks.${stackName}.trunk`);
    if (unsetTrunk.isErr()) return unsetTrunk;

    const unsetRoot = await this.unsetGitConfig(`stacks.${stackName}.root`);
    if (unsetRoot.isErr()) return unsetRoot;

    const unsetCreated = await this.unsetGitConfig(`stacks.${stackName}.created`);
    if (unsetCreated.isErr()) return unsetCreated;

    return stackOk(undefined);
  }

  /**
   * Get full stack info including all branches
   */
  async getFullStackInfo(stackName: string): Promise<StackResult<StackInfo>> {
    const metadata = await this.getStackMetadata(stackName);
    if (metadata.isErr()) return metadata;

    const branches = await this.getStackBranches(stackName);
    if (branches.isErr()) return branches;

    return stackOk({
      metadata: metadata.value,
      branches: branches.value,
    });
  }

  /**
   * Get the stack name for the current branch
   */
  async getCurrentBranchStack(): Promise<StackResult<string>> {
    const currentBranch = await this.git.getCurrentBranch(this.repoRoot);
    if (!currentBranch) {
      return StackErrors.notInRepo();
    }

    const branchStack = await this.getBranchStack(currentBranch);
    if (branchStack.isErr()) {
      return branchStack;
    }

    return stackOk(branchStack.value.stackName);
  }

  // ============ Private Helpers ============

  private async getCurrentCommit(): Promise<StackResult<string>> {
    try {
      const commit = await this.git.execOrThrow(
        ['rev-parse', 'HEAD'],
        this.repoRoot
      );
      return stackOk(commit);
    } catch (e) {
      return StackErrors.gitError('rev-parse', e instanceof Error ? e.message : String(e));
    }
  }

  private async getGitConfig(key: string): Promise<StackResult<string | null>> {
    const result = await this.git.exec(
      ['config', '--get', key],
      this.repoRoot
    );

    if (result.exitCode !== 0) {
      // Config not found is not an error, just return null
      return stackOk(null);
    }

    return stackOk(result.stdout.trim() || null);
  }

  private async setGitConfig(key: string, value: string): Promise<StackResult<void>> {
    try {
      await this.git.execOrThrow(
        ['config', key, value],
        this.repoRoot
      );
      return stackOk(undefined);
    } catch (e) {
      return StackErrors.configError(e instanceof Error ? e.message : String(e));
    }
  }

  private async unsetGitConfig(key: string): Promise<StackResult<void>> {
    const result = await this.git.exec(
      ['config', '--unset', key],
      this.repoRoot
    );

    // Exit code 5 means the key doesn't exist, which is fine
    if (result.exitCode !== 0 && result.exitCode !== 5) {
      return StackErrors.configError(`Failed to unset ${key}: ${result.stderr}`);
    }

    return stackOk(undefined);
  }

  private async setBranchStackMetadata(
    branchName: string,
    metadata: BranchStackMetadata
  ): Promise<StackResult<void>> {
    const stacknameResult = await this.setGitConfig(
      `branch.${branchName}.stackname`,
      metadata.stackName
    );
    if (stacknameResult.isErr()) return stacknameResult;

    const parentResult = await this.setGitConfig(
      `branch.${branchName}.stackparent`,
      metadata.parent
    );
    if (parentResult.isErr()) return parentResult;

    const baseResult = await this.setGitConfig(
      `branch.${branchName}.stackbase`,
      metadata.baseCommit
    );
    if (baseResult.isErr()) return baseResult;

    return stackOk(undefined);
  }
}

