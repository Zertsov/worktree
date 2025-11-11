/**
 * Add command - add a new worktree with branch creation/tracking
 */

import * as clack from '@clack/prompts';
import { join, dirname } from 'path';
import { GitOperations } from '../git/operations.js';
import { GitParser } from '../git/parser.js';

export interface AddOptions {
  base?: string;
  path?: string;
  force?: boolean;
}

export async function addCommand(
  branch: string,
  options: AddOptions = {}
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

    // Determine target path
    let targetPath = options.path;
    if (!targetPath) {
      const sanitized = GitParser.sanitizeBranchName(branch);
      targetPath = join(dirname(repo.root), `${repo.name}-${sanitized}`);
    }

    // Make path absolute if relative
    if (!targetPath.startsWith('/')) {
      targetPath = join(process.cwd(), targetPath);
    }

    // Check if branch exists locally
    spinner.start('Checking branch status...');
    const localExists = await GitOperations.branchExists(branch);
    const remoteExists = await GitOperations.remoteBranchExists(branch);
    spinner.stop('Checked');

    let createBranch = false;
    let trackRemote = false;
    let baseBranch = options.base;

    if (localExists) {
      // Branch exists locally, just add worktree
      clack.log.info(`Branch ${branch} exists locally`);
    } else if (remoteExists) {
      // Branch exists on remote, track it
      clack.log.info(`Branch ${branch} exists on remote, will track it`);
      trackRemote = true;
      baseBranch = `origin/${branch}`;
    } else {
      // Branch doesn't exist, need to create it
      if (!baseBranch) {
        clack.cancel(
          `Branch '${branch}' not found. Use --base <existing-branch> to create it.`
        );
        process.exit(1);
      }
      clack.log.info(`Creating new branch ${branch} from ${baseBranch}`);
      createBranch = true;
    }

    // Confirm action
    if (!options.force) {
      const confirmed = await clack.confirm({
        message: `Add worktree for ${branch} at ${targetPath}?`,
        initialValue: true,
      });

      if (!confirmed || clack.isCancel(confirmed)) {
        clack.cancel('Operation cancelled');
        process.exit(0);
      }
    }

    // Add worktree
    spinner.start(`Adding worktree...`);
    
    await GitOperations.addWorktree(targetPath, branch, {
      createBranch,
      baseBranch,
      track: trackRemote,
    });

    spinner.stop('Worktree added');

    clack.outro(`✓ Worktree added at ${targetPath}`);
  } catch (error) {
    spinner.stop('Failed');
    clack.cancel(
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

