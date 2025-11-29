/**
 * Stack PR command - Create GitHub PRs for explicit stack branches with navigation
 */

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { GitOperations } from '../../git/operations.js';
import { StackManager } from '../../stack/manager.js';
import { GitHubAPI } from '../../github/api.js';
import type { GitHubPR } from '../../github/types.js';
import {
  buildNavigationInfo,
  updatePRDescription,
} from '../../github/pr-formatter.js';
import { ColorManager } from '../../stack/colors.js';

export interface StackPROptions {
  yes?: boolean; // Headless mode
  link?: boolean; // Add stack navigation to PR descriptions
  updateExisting?: boolean; // Update existing PRs with navigation
}

interface PRResult {
  branch: string;
  success: boolean;
  pr?: GitHubPR;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
  updated?: boolean;
}

export async function stackPRCommand(options: StackPROptions = {}): Promise<void> {
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

  const manager = new StackManager(repo.root);

  // Check if current branch is in a stack
  const branchStack = await manager.getBranchStack(currentBranch);
  if (branchStack.isErr()) {
    clack.cancel(
      `Current branch '${currentBranch}' is not part of a stack.\n\n` +
        `Initialize a stack with: ${pc.cyan('stacks init <trunk>')}`
    );
    process.exit(1);
  }

  const stackName = branchStack.value.stackName;

  spinner.start('Analyzing stack...');

  // Get stack info
  const stackMeta = await manager.getStackMetadata(stackName);
  if (stackMeta.isErr()) {
    spinner.stop('Failed');
    clack.cancel(stackMeta.error.format());
    process.exit(1);
  }

  const branchesResult = await manager.getStackBranches(stackName);
  if (branchesResult.isErr()) {
    spinner.stop('Failed');
    clack.cancel(branchesResult.error.format());
    process.exit(1);
  }

  const branches = branchesResult.value;

  // Order branches for PR creation (root first)
  const orderedBranches = orderBranches(branches, stackMeta.value.trunk);

  spinner.stop('Stack analyzed');

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

  // Get existing PRs for all branches
  spinner.start('Checking existing PRs...');
  const prMap = new Map<string, GitHubPR>();
  
  try {
    const allPRs = await github.getAllOpenPRs();
    for (const pr of allPRs) {
      prMap.set(pr.head.ref, pr);
    }
  } catch (e) {
    // If we can't get all PRs, fall back to checking individual branches
    for (const branch of orderedBranches) {
      const pr = await github.getPRForBranch(branch);
      if (pr) {
        prMap.set(branch, pr);
      }
    }
  }
  spinner.stop('PRs checked');

  const colorManager = new ColorManager();
  const colorFn = colorManager.getColorForStack(stackName);

  // Show branches to process
  console.log('');
  console.log(pc.bold('Stack branches:'));
  console.log('');

  for (const branch of orderedBranches) {
    const meta = branches.get(branch)!;
    const existingPR = prMap.get(branch);
    const status = existingPR 
      ? pc.dim(`PR #${existingPR.number}`)
      : pc.yellow('no PR');
    console.log(`  ${colorFn('●')} ${colorFn(branch)} ${pc.dim('→')} ${meta.parent} ${pc.dim(`(${status})`)}`);
  }

  console.log('');

  // Branches that need PRs
  const branchesNeedingPR = orderedBranches.filter(b => !prMap.has(b));
  const branchesWithPR = orderedBranches.filter(b => prMap.has(b));

  if (branchesNeedingPR.length === 0 && !options.updateExisting) {
    console.log(pc.green('✓') + ' All branches already have PRs');
    
    if (options.link && branchesWithPR.length > 0) {
      console.log('');
      console.log(pc.dim('Use ') + pc.cyan('--update-existing') + pc.dim(' to update PR descriptions with stack navigation.'));
    }
    console.log('');
    return;
  }

  let results: PRResult[] = [];

  // Create new PRs
  if (branchesNeedingPR.length > 0) {
    if (options.yes) {
      results = await createPRsHeadless(
        github,
        branchesNeedingPR,
        branches,
        stackMeta.value,
        prMap,
        options,
        repo.root
      );
    } else {
      results = await createPRsInteractive(
        github,
        branchesNeedingPR,
        branches,
        stackMeta.value,
        prMap,
        options,
        repo.root
      );
    }

    // Update prMap with newly created PRs
    for (const result of results) {
      if (result.success && result.pr) {
        prMap.set(result.branch, result.pr);
      }
    }
  }

  // Update existing PRs with navigation if requested
  if (options.link && (options.updateExisting || branchesNeedingPR.length > 0)) {
    console.log('');
    spinner.start('Updating PR descriptions with stack navigation...');

    const updateResults = await updatePRsWithNavigation(
      github,
      orderedBranches,
      branches,
      stackMeta.value,
      prMap
    );

    spinner.stop('Updated');

    for (const result of updateResults) {
      if (result.updated) {
        console.log(pc.green('✓') + ` Updated PR #${result.pr?.number} for ${colorFn(result.branch)}`);
      }
    }
  }

  // Display summary
  console.log('');
  displaySummary(results, colorFn);
}

/**
 * Order branches by depth (parents first)
 */
function orderBranches(
  branches: Map<string, { parent: string }>,
  trunk: string
): string[] {
  const ordered: string[] = [];
  const visited = new Set<string>();

  const visit = (parent: string) => {
    for (const [branch, meta] of branches) {
      if (meta.parent === parent && !visited.has(branch)) {
        visited.add(branch);
        ordered.push(branch);
        visit(branch);
      }
    }
  };

  visit(trunk);
  return ordered;
}

/**
 * Create PRs in headless mode
 */
async function createPRsHeadless(
  github: GitHubAPI,
  branchesToCreate: string[],
  branches: Map<string, { parent: string; stackName: string; baseCommit: string }>,
  stackMeta: { name: string; trunk: string; root: string },
  prMap: Map<string, GitHubPR>,
  options: StackPROptions,
  repoRoot: string
): Promise<PRResult[]> {
  const spinner = clack.spinner();
  const results: PRResult[] = [];

  console.log('');
  clack.log.info(`Creating PRs for ${branchesToCreate.length} branch(es)...`);
  console.log('');

  for (const branch of branchesToCreate) {
    const meta = branches.get(branch)!;
    
    spinner.start(`Creating PR for ${branch}...`);

    // Check if branch exists on remote
    const exists = await github.remoteBranchExists(branch);
    if (!exists) {
      spinner.stop(`⊘ ${branch}`);
      clack.log.warn(`Branch '${branch}' not pushed to remote`);
      results.push({
        branch,
        success: false,
        skipped: true,
        skipReason: 'Not pushed to remote',
      });
      continue;
    }

    // Check if base branch exists on remote
    const baseExists = await github.remoteBranchExists(meta.parent);
    if (!baseExists) {
      spinner.stop(`⊘ ${branch}`);
      clack.log.warn(`Base branch '${meta.parent}' not pushed to remote`);
      results.push({
        branch,
        success: false,
        skipped: true,
        skipReason: 'Base branch not pushed to remote',
      });
      continue;
    }

    try {
      const title = generatePRTitle(branch);
      let body = '';

      if (options.link) {
        const navInfo = buildNavigationInfo(stackMeta, branches, branch, prMap);
        body = updatePRDescription('', navInfo);
      }

      const pr = await github.createPR({
        title,
        head: branch,
        base: meta.parent,
        body,
      });

      spinner.stop(`✓ ${branch}`);
      clack.log.success(`PR #${pr.number} created: ${pr.html_url}`);

      results.push({
        branch,
        success: true,
        pr,
      });
    } catch (e) {
      spinner.stop(`✗ ${branch}`);
      const error = e instanceof Error ? e.message : String(e);
      clack.log.error(`Failed: ${error}`);

      results.push({
        branch,
        success: false,
        error,
      });
    }
  }

  return results;
}

/**
 * Create PRs in interactive mode
 */
async function createPRsInteractive(
  github: GitHubAPI,
  branchesToCreate: string[],
  branches: Map<string, { parent: string; stackName: string; baseCommit: string }>,
  stackMeta: { name: string; trunk: string; root: string },
  prMap: Map<string, GitHubPR>,
  options: StackPROptions,
  repoRoot: string
): Promise<PRResult[]> {
  const results: PRResult[] = [];

  // Multi-select branches
  const branchOptions = branchesToCreate.map((branch) => {
    const meta = branches.get(branch)!;
    return {
      value: branch,
      label: `${branch} → ${meta.parent}`,
    };
  });

  const selectedBranches = await clack.multiselect({
    message: 'Select branches to create PRs for:',
    options: branchOptions,
    initialValues: branchesToCreate,
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

  for (const branch of selected) {
    const meta = branches.get(branch)!;

    // Check if branch exists on remote
    const exists = await github.remoteBranchExists(branch);
    if (!exists) {
      clack.log.warn(`Branch '${branch}' not pushed to remote - skipping`);
      results.push({
        branch,
        success: false,
        skipped: true,
        skipReason: 'Not pushed to remote',
      });
      continue;
    }

    // Generate default title
    const defaultTitle = generatePRTitle(branch);

    // Prompt for title
    const title = await clack.text({
      message: `PR title for ${branch}:`,
      placeholder: defaultTitle,
      defaultValue: defaultTitle,
    });

    if (clack.isCancel(title)) {
      clack.log.info(`Skipped ${branch}`);
      results.push({
        branch,
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
      defaultValue: '',
    });

    if (clack.isCancel(description)) {
      clack.log.info(`Skipped ${branch}`);
      results.push({
        branch,
        success: false,
        skipped: true,
        skipReason: 'User cancelled',
      });
      continue;
    }

    // Confirm creation
    const confirm = await clack.confirm({
      message: `Create PR: "${title}" (${branch} → ${meta.parent})?`,
    });

    if (clack.isCancel(confirm) || !confirm) {
      clack.log.info(`Skipped ${branch}`);
      results.push({
        branch,
        success: false,
        skipped: true,
        skipReason: 'User cancelled',
      });
      continue;
    }

    // Create PR
    const spinner = clack.spinner();
    spinner.start(`Creating PR for ${branch}...`);

    try {
      let body = description as string;

      if (options.link) {
        const navInfo = buildNavigationInfo(stackMeta, branches, branch, prMap);
        body = updatePRDescription(body, navInfo);
      }

      const pr = await github.createPR({
        title: title as string,
        head: branch,
        base: meta.parent,
        body,
      });

      spinner.stop(`✓ ${branch}`);
      clack.log.success(`PR #${pr.number} created: ${pr.html_url}`);

      results.push({
        branch,
        success: true,
        pr,
      });
    } catch (e) {
      spinner.stop(`✗ ${branch}`);
      const error = e instanceof Error ? e.message : String(e);
      clack.log.error(`Failed: ${error}`);

      results.push({
        branch,
        success: false,
        error,
      });
    }

    console.log('');
  }

  return results;
}

/**
 * Update existing PRs with stack navigation
 */
async function updatePRsWithNavigation(
  github: GitHubAPI,
  branches: string[],
  branchMeta: Map<string, { parent: string; stackName: string; baseCommit: string }>,
  stackMeta: { name: string; trunk: string; root: string },
  prMap: Map<string, GitHubPR>
): Promise<PRResult[]> {
  const results: PRResult[] = [];

  for (const branch of branches) {
    const pr = prMap.get(branch);
    if (!pr) continue;

    try {
      const navInfo = buildNavigationInfo(stackMeta, branchMeta, branch, prMap);
      const newBody = updatePRDescription(pr.body || '', navInfo);

      // Only update if body changed
      if (newBody !== (pr.body || '')) {
        await github.updatePR(pr.number, { body: newBody });
        results.push({
          branch,
          success: true,
          pr,
          updated: true,
        });
      } else {
        results.push({
          branch,
          success: true,
          pr,
          updated: false,
        });
      }
    } catch (e) {
      results.push({
        branch,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return results;
}

/**
 * Generate PR title from branch name
 */
function generatePRTitle(branch: string): string {
  let title = branch
    .replace(/^(feature|feat|bugfix|bug|hotfix|fix)\//i, '')
    .replace(/^(chore|docs|refactor|test|style)\//i, '');

  title = title.replace(/[-_\/]/g, ' ');
  title = title.replace(/\b\w/g, (c) => c.toUpperCase());

  return title;
}

/**
 * Display summary of PR creation results
 */
function displaySummary(results: PRResult[], colorFn: (text: string) => string): void {
  if (results.length === 0) return;

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
      console.log(`  • ${colorFn(result.branch)}: ${result.pr!.html_url}`);
    }
  }

  if (failed.length > 0) {
    console.log('');
    clack.log.error('Failed:');
    for (const result of failed) {
      console.log(`  • ${colorFn(result.branch)}: ${result.error}`);
    }
  }

  console.log('');
}

