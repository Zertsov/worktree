/**
 * PR command - create GitHub pull requests for stack branches
 */

import * as clack from '@clack/prompts';
import { GitOperations } from '../git/operations.js';
import { StackDetector } from '../stack/detector.js';
import { GitHubAPI } from '../github/api.js';
import type { Stack, StackNode } from '../stack/types.js';
import type { GitHubPR } from '../github/types.js';

export interface PROptions {
  yes?: boolean; // Headless mode
  title?: string; // Override title template
  description?: string; // Override description
}

interface PRResult {
  branch: string;
  success: boolean;
  pr?: GitHubPR;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export async function prCommand(options: PROptions = {}): Promise<void> {
  const spinner = clack.spinner();

  try {
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

    spinner.start('Analyzing branch stack...');

    const detector = new StackDetector(repo.root);
    const [branches, worktrees] = await Promise.all([
      detector.getAllBranches(),
      detector.getAllWorktrees(),
    ]);

    const stacks = await detector.detectStacks(branches, worktrees);

    // Find the stack containing the current branch
    let currentStack: Stack | null = null;
    for (const stack of stacks.values()) {
      if (stack.branches.includes(currentBranch)) {
        currentStack = stack;
        break;
      }
    }

    if (!currentStack) {
      spinner.stop('No stack found');
      clack.cancel(
        `Branch '${currentBranch}' is not part of a stack. Use 'worktree stack' to view all stacks.`
      );
      process.exit(1);
    }

    // Get current branch node
    const currentNode = currentStack.nodes.get(currentBranch);
    if (!currentNode) {
      spinner.stop('Failed');
      clack.cancel('Could not find current branch in stack');
      process.exit(1);
    }

    // Collect branches: current branch + all descendants
    const branchesToProcess = getBranchesForPR(currentNode, currentStack);

    spinner.stop('Stack analyzed');

    if (branchesToProcess.length === 0) {
      clack.log.info('No branches to create PRs for');
      return;
    }

    // Initialize GitHub API
    const github = new GitHubAPI();

    // Authenticate
    spinner.start('Authenticating with GitHub...');
    const auth = await github.authenticate();
    spinner.stop(`Authenticated via ${auth.source}`);

    // Get repo info
    const repoInfo = await github.getRepoInfo(repo.root);
    clack.log.info(
      `Repository: ${repoInfo.owner}/${repoInfo.repo} (${repoInfo.host})`
    );

    console.log('');

    let results: PRResult[];

    if (options.yes) {
      // Headless mode
      results = await createPRsHeadless(
        github,
        branchesToProcess,
        currentStack,
        options,
        repo.root
      );
    } else {
      // Interactive mode
      results = await createPRsInteractive(
        github,
        branchesToProcess,
        currentStack,
        options,
        repo.root
      );
    }

    // Display summary
    console.log('');
    displaySummary(results);
  } catch (error) {
    spinner.stop('Failed');
    clack.cancel(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Get branches to create PRs for (current + descendants)
 */
function getBranchesForPR(currentNode: StackNode, stack: Stack): StackNode[] {
  const branches: StackNode[] = [currentNode];
  const queue = [currentNode];
  const visited = new Set<string>([currentNode.branch]);

  while (queue.length > 0) {
    const node = queue.shift()!;

    for (const childBranch of node.children) {
      if (!visited.has(childBranch)) {
        visited.add(childBranch);
        const childNode = stack.nodes.get(childBranch);
        if (childNode) {
          branches.push(childNode);
          queue.push(childNode);
        }
      }
    }
  }

  return branches;
}

/**
 * Create PRs in headless mode
 */
async function createPRsHeadless(
  github: GitHubAPI,
  branches: StackNode[],
  stack: Stack,
  options: PROptions,
  repoRoot: string
): Promise<PRResult[]> {
  const spinner = clack.spinner();
  const results: PRResult[] = [];

  clack.log.info(`Creating PRs for ${branches.length} branch(es)...`);
  console.log('');

  for (const node of branches) {
    spinner.start(`Processing ${node.branch}...`);

    const result = await createPRForBranch(
      github,
      node,
      options,
      repoRoot,
      false // Not interactive
    );

    results.push(result);

    if (result.success && result.pr) {
      spinner.stop(`✓ ${node.branch}`);
      clack.log.success(`PR created: ${result.pr.html_url}`);
    } else if (result.skipped) {
      spinner.stop(`⊘ ${node.branch}`);
      clack.log.warn(result.skipReason || 'Skipped');
    } else {
      spinner.stop(`✗ ${node.branch}`);
      clack.log.error(result.error || 'Failed to create PR');
    }
  }

  return results;
}

/**
 * Create PRs in interactive mode
 */
async function createPRsInteractive(
  github: GitHubAPI,
  branches: StackNode[],
  stack: Stack,
  options: PROptions,
  repoRoot: string
): Promise<PRResult[]> {
  const results: PRResult[] = [];

  // Show available branches
  clack.log.info(`Found ${branches.length} branch(es) in current stack path:`);
  console.log('');
  for (const node of branches) {
    const parent = node.parent ? ` (→ ${node.parent})` : '';
    console.log(`  • ${node.branch}${parent}`);
  }
  console.log('');

  // Multi-select branches
  const branchOptions = branches.map((node) => ({
    value: node.branch,
    label: node.parent ? `${node.branch} → ${node.parent}` : node.branch,
  }));

  const selectedBranches = await clack.multiselect({
    message: 'Select branches to create PRs for:',
    options: branchOptions,
    initialValues: branches.map((n) => n.branch),
    required: false,
  });

  if (clack.isCancel(selectedBranches)) {
    clack.cancel('Operation cancelled');
    process.exit(0);
  }

  const selected = selectedBranches as string[];

  if (selected.length === 0) {
    clack.log.info('No branches selected');
    return results;
  }

  console.log('');

  // Process each selected branch
  for (const branchName of selected) {
    const node = branches.find((n) => n.branch === branchName);
    if (!node) continue;

    // Check if PR already exists
    const existingPR = await github.getPRForBranch(node.branch);
    if (existingPR) {
      clack.log.warn(
        `PR already exists for ${node.branch}: ${existingPR.html_url}`
      );
      results.push({
        branch: node.branch,
        success: false,
        skipped: true,
        skipReason: 'PR already exists',
      });
      continue;
    }

    // Generate default title
    const defaultTitle = generatePRTitle(node.branch, options.title);

    // Prompt for title
    const title = await clack.text({
      message: `PR title for ${node.branch}:`,
      placeholder: defaultTitle,
      defaultValue: defaultTitle,
    });

    if (clack.isCancel(title)) {
      clack.log.info(`Skipped ${node.branch}`);
      results.push({
        branch: node.branch,
        success: false,
        skipped: true,
        skipReason: 'User cancelled',
      });
      continue;
    }

    // Prompt for description
    const description = await clack.text({
      message: `PR description (optional):`,
      placeholder: 'Leave empty for no description',
      defaultValue: options.description || '',
    });

    if (clack.isCancel(description)) {
      clack.log.info(`Skipped ${node.branch}`);
      results.push({
        branch: node.branch,
        success: false,
        skipped: true,
        skipReason: 'User cancelled',
      });
      continue;
    }

    // Confirm creation
    const confirm = await clack.confirm({
      message: `Create PR: "${title}" (${node.branch} → ${node.parent})?`,
    });

    if (clack.isCancel(confirm) || !confirm) {
      clack.log.info(`Skipped ${node.branch}`);
      results.push({
        branch: node.branch,
        success: false,
        skipped: true,
        skipReason: 'User cancelled',
      });
      continue;
    }

    // Create PR
    const spinner = clack.spinner();
    spinner.start(`Creating PR for ${node.branch}...`);

    try {
      const pr = await github.createPR({
        title: title as string,
        head: node.branch,
        base: node.parent!,
        body: description as string,
      });

      spinner.stop(`✓ ${node.branch}`);
      clack.log.success(`PR created: ${pr.html_url}`);

      results.push({
        branch: node.branch,
        success: true,
        pr,
      });
    } catch (error) {
      spinner.stop(`✗ ${node.branch}`);
      const errorMsg = error instanceof Error ? error.message : String(error);
      clack.log.error(`Failed: ${errorMsg}`);

      results.push({
        branch: node.branch,
        success: false,
        error: errorMsg,
      });
    }

    console.log('');
  }

  return results;
}

/**
 * Create PR for a single branch (helper for both modes)
 */
async function createPRForBranch(
  github: GitHubAPI,
  node: StackNode,
  options: PROptions,
  repoRoot: string,
  interactive: boolean
): Promise<PRResult> {
  // Check if branch has parent
  if (!node.parent) {
    return {
      branch: node.branch,
      success: false,
      skipped: true,
      skipReason: 'No parent branch (root of stack)',
    };
  }

  // Check if PR already exists
  const existingPR = await github.getPRForBranch(node.branch);
  if (existingPR) {
    return {
      branch: node.branch,
      success: false,
      skipped: true,
      skipReason: 'PR already exists',
      pr: existingPR,
    };
  }

  // Check if branch exists on remote
  const branchExists = await github.remoteBranchExists(node.branch);
  if (!branchExists) {
    return {
      branch: node.branch,
      success: false,
      skipped: true,
      skipReason: 'Branch not pushed to remote',
    };
  }

  // Generate title
  const title = generatePRTitle(node.branch, options.title);

  try {
    const pr = await github.createPR({
      title,
      head: node.branch,
      base: node.parent,
      body: options.description || '',
    });

    return {
      branch: node.branch,
      success: true,
      pr,
    };
  } catch (error) {
    return {
      branch: node.branch,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generate PR title from branch name
 */
function generatePRTitle(branch: string, template?: string): string {
  if (template) {
    return template.replace('{branch}', branch);
  }

  // Remove common prefixes
  let title = branch
    .replace(/^(feature|feat|bugfix|bug|hotfix|fix)\//i, '')
    .replace(/^(chore|docs|refactor|test|style)\//i, '');

  // Convert separators to spaces
  title = title.replace(/[-_\/]/g, ' ');

  // Capitalize first letter of each word
  title = title.replace(/\b\w/g, (c) => c.toUpperCase());

  return title;
}

/**
 * Display summary of PR creation results
 */
function displaySummary(results: PRResult[]): void {
  const successful = results.filter((r) => r.success);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => !r.success && !r.skipped);

  clack.log.info('Summary:');
  console.log(`  • Created: ${successful.length}`);
  console.log(`  • Skipped: ${skipped.length}`);
  console.log(`  • Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log('');
    clack.log.success('Created PRs:');
    for (const result of successful) {
      console.log(`  • ${result.branch}: ${result.pr!.html_url}`);
    }
  }

  if (failed.length > 0) {
    console.log('');
    clack.log.error('Failed:');
    for (const result of failed) {
      console.log(`  • ${result.branch}: ${result.error}`);
    }
  }
}

