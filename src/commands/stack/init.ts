/**
 * Stack init command - Initialize a new stack from the current branch
 */

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { GitOperations } from '../../git/operations.js';
import { StackManager } from '../../stack/manager.js';

export interface StackInitOptions {
  trunk: string;
  name?: string;
}

export async function stackInitCommand(options: StackInitOptions): Promise<void> {
  const spinner = clack.spinner();

  // Check if we're in a git repository
  const isRepo = await GitOperations.isGitRepository();
  if (!isRepo) {
    clack.cancel('Not a git repository');
    process.exit(1);
  }

  const repo = await GitOperations.getRepository();
  const currentBranch = await GitOperations.getCurrentBranch(repo.root);

  if (!currentBranch) {
    clack.cancel('Could not determine current branch');
    process.exit(1);
  }

  // Generate stack name from branch if not provided
  const stackName = options.name || generateStackName(currentBranch);

  spinner.start('Initializing stack...');

  const manager = new StackManager(repo.root);
  const result = await manager.initStack(stackName, options.trunk, currentBranch);

  if (result.isErr()) {
    spinner.stop('Failed');
    clack.cancel(result.error.format());
    process.exit(1);
  }

  const stack = result.value;
  spinner.stop('Stack initialized');

  console.log('');
  console.log(pc.green('✓') + ' Initialized stack ' + pc.cyan(pc.bold(stack.name)));
  console.log('');
  console.log('  ' + pc.dim('Stack root:') + '   ' + pc.cyan(stack.root));
  console.log('  ' + pc.dim('Trunk:') + '        ' + pc.yellow(stack.trunk));
  console.log('  ' + pc.dim('Base commit:') + '  ' + pc.dim(await getShortCommit(repo.root)));
  console.log('');
  console.log(pc.dim('Next steps:'));
  console.log(`  ${pc.dim('•')} Create child branches with: ${pc.cyan(`stacks new ${pc.dim('<name>')}`)}`);
  console.log(`  ${pc.dim('•')} View stack with: ${pc.cyan('stacks list')}`);
  console.log('');
}

/**
 * Generate a stack name from a branch name
 */
function generateStackName(branch: string): string {
  // Remove common prefixes
  let name = branch
    .replace(/^(feature|feat|bugfix|bug|hotfix|fix)\//i, '')
    .replace(/^(chore|docs|refactor|test|style)\//i, '');

  // Convert separators to dashes
  name = name.replace(/[\/\s]+/g, '-');

  // Remove any remaining special characters
  name = name.replace(/[^a-zA-Z0-9-]/g, '');

  // Ensure it starts with a letter
  if (!/^[a-zA-Z]/.test(name)) {
    name = 'stack-' + name;
  }

  return name.toLowerCase();
}

/**
 * Get short commit hash for display
 */
async function getShortCommit(repoRoot: string): Promise<string> {
  try {
    return await GitOperations.execOrThrow(
      ['rev-parse', '--short', 'HEAD'],
      repoRoot
    );
  } catch {
    return 'unknown';
  }
}

