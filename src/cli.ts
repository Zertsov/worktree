/**
 * CLI argument parsing and command routing
 */

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { listCommand } from './commands/list.js';
import { addCommand } from './commands/add.js';
import { removeCommand } from './commands/remove.js';
import { pruneCommand } from './commands/prune.js';
import { stackCommand } from './commands/stack.js';
import { stackInitCommand } from './commands/stack/init.js';
import { prCommand } from './commands/pr.js';

interface GlobalOptions {
  help?: boolean;
  version?: boolean;
}

export async function runCLI(args: string[]): Promise<void> {
  // Parse command and arguments
  const [command, ...rest] = args;

  // Show help if no command or --help flag
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  // Show version
  if (command === '--version' || command === '-v') {
    showVersion();
    return;
  }

  try {
    switch (command) {
      case 'list':
      case 'ls':
        await handleListCommand(rest);
        break;

      case 'add':
      case 'new':
        await handleAddCommand(rest);
        break;

      case 'remove':
      case 'rm':
        await handleRemoveCommand(rest);
        break;

      case 'prune':
        await handlePruneCommand(rest);
        break;

      case 'stack':
        await handleStackCommand(rest);
        break;

      case 'pr':
        await handlePRCommand(rest);
        break;

      default:
        clack.log.error(`Unknown command: ${command}`);
        console.log('');
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    clack.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function handleListCommand(args: string[]): Promise<void> {
  const options = {
    verbose: false,
    tree: false,
    simple: false,
    noStack: false,
  };

  for (const arg of args) {
    switch (arg) {
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-t':
      case '--tree':
        options.tree = true;
        break;
      case '-s':
      case '--simple':
        options.simple = true;
        break;
      case '--no-stack':
        options.noStack = true;
        break;
      case '-h':
      case '--help':
        showListHelp();
        return;
    }
  }

  await listCommand(options);
}

async function handleAddCommand(args: string[]): Promise<void> {
  const options: { base?: string; path?: string; force?: boolean } = {};
  let branch = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-b':
      case '--base':
        options.base = args[++i];
        break;
      case '-p':
      case '--path':
        options.path = args[++i];
        break;
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '-h':
      case '--help':
        showAddHelp();
        return;
      default:
        if (!branch) {
          branch = arg;
        } else if (!options.path) {
          options.path = arg;
        } else {
          clack.log.error(`Unexpected argument: ${arg}`);
          process.exit(1);
        }
    }
  }

  if (!branch) {
    clack.log.error('Branch name required');
    showAddHelp();
    process.exit(1);
  }

  await addCommand(branch, options);
}

async function handleRemoveCommand(args: string[]): Promise<void> {
  const options = { force: false };
  let input = '';

  for (const arg of args) {
    switch (arg) {
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '-h':
      case '--help':
        showRemoveHelp();
        return;
      default:
        if (!input) {
          input = arg;
        } else {
          clack.log.error(`Unexpected argument: ${arg}`);
          process.exit(1);
        }
    }
  }

  if (!input) {
    clack.log.error('Path or branch name required');
    showRemoveHelp();
    process.exit(1);
  }

  await removeCommand(input, options);
}

async function handlePruneCommand(args: string[]): Promise<void> {
  const options = { dryRun: false, force: false };

  for (const arg of args) {
    switch (arg) {
      case '-n':
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '-h':
      case '--help':
        showPruneHelp();
        return;
    }
  }

  await pruneCommand(options);
}

async function handleStackCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  // Handle subcommands
  switch (subcommand) {
    case 'init':
      await handleStackInitCommand(rest);
      return;

    case '-h':
    case '--help':
    case 'help':
      showStackHelp();
      return;
  }

  // Default behavior: show stacks (existing functionality)
  const options = { verbose: false };

  for (const arg of args) {
    switch (arg) {
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-h':
      case '--help':
        showStackHelp();
        return;
    }
  }

  await stackCommand(options);
}

async function handleStackInitCommand(args: string[]): Promise<void> {
  const options: { trunk?: string; name?: string } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-t':
      case '--trunk':
        options.trunk = args[++i];
        break;
      case '-n':
      case '--name':
        options.name = args[++i];
        break;
      case '-h':
      case '--help':
        showStackInitHelp();
        return;
      default:
        // First positional arg could be trunk
        if (!options.trunk && !arg.startsWith('-')) {
          options.trunk = arg;
        } else {
          clack.log.error(`Unexpected argument: ${arg}`);
          process.exit(1);
        }
    }
  }

  if (!options.trunk) {
    clack.log.error('Trunk branch is required');
    showStackInitHelp();
    process.exit(1);
  }

  await stackInitCommand({ trunk: options.trunk, name: options.name });
}

async function handlePRCommand(args: string[]): Promise<void> {
  const options: { yes?: boolean; title?: string; description?: string } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-y':
      case '--yes':
        options.yes = true;
        break;
      case '-t':
      case '--title':
        options.title = args[++i];
        break;
      case '-d':
      case '--description':
        options.description = args[++i];
        break;
      case '-h':
      case '--help':
        showPRHelp();
        return;
      default:
        clack.log.error(`Unexpected argument: ${arg}`);
        process.exit(1);
    }
  }

  await prCommand(options);
}

function showVersion(): void {
  console.log('worktree v0.1.0');
}

function showHelp(): void {
  console.log(`
${pc.bold('worktree')} - Modern git worktree management with stack visualization

${pc.bold('Usage:')}
  worktree <command> [options]

${pc.bold('Commands:')}
  ${pc.cyan('list, ls')}           Show worktrees with stack visualization
  ${pc.cyan('add, new')}           Add a new worktree
  ${pc.cyan('remove, rm')}         Remove a worktree
  ${pc.cyan('prune')}              Clean up stale worktree references
  ${pc.cyan('stack')}              Display full stack visualization
  ${pc.cyan('pr')}                 Create GitHub PRs for stack branches

${pc.bold('Options:')}
  -h, --help           Show help
  -v, --version        Show version

${pc.bold('Examples:')}
  worktree list --tree              # Show worktrees in tree view
  worktree add feature/login        # Add worktree for branch
  worktree add -b main feat/new     # Create new branch from main
  worktree remove feature/login     # Remove worktree by branch name
  worktree stack                    # Show all branch relationships
  worktree pr                       # Create PRs interactively
  worktree pr -y                    # Create PRs for all descendants

${pc.dim('Run')} ${pc.cyan('worktree <command> --help')} ${pc.dim('for more information on a command.')}
`);
}

function showListHelp(): void {
  console.log(`
${pc.bold('worktree list')} - Show worktrees with stack visualization

${pc.bold('Usage:')}
  worktree list [options]

${pc.bold('Options:')}
  -t, --tree           Show tree view with branch relationships
  -v, --verbose        Show detailed information
  -s, --simple         Show simple git output
  --no-stack           List worktrees without stack detection (faster)
  -h, --help           Show help

${pc.bold('Examples:')}
  worktree list                    # List all worktrees
  worktree list --tree             # Show tree view
  worktree list --tree --verbose   # Tree view with details
  worktree list --no-stack         # Fast listing without stack detection
`);
}

function showAddHelp(): void {
  console.log(`
${pc.bold('worktree add')} - Add a new worktree

${pc.bold('Usage:')}
  worktree add <branch> [path] [options]

${pc.bold('Arguments:')}
  branch               Branch name (required)
  path                 Target path (optional, defaults to ../<repo>-<branch>)

${pc.bold('Options:')}
  -b, --base <branch>  Base branch for new branch
  -p, --path <path>    Target path (alternative to positional arg)
  -f, --force          Skip confirmation prompt
  -h, --help           Show help

${pc.bold('Examples:')}
  worktree add feature/login                   # Add existing branch
  worktree add -b main feature/new             # Create new branch
  worktree add feature/test ../other-path      # Custom path
`);
}

function showRemoveHelp(): void {
  console.log(`
${pc.bold('worktree remove')} - Remove a worktree

${pc.bold('Usage:')}
  worktree remove <path|branch> [options]

${pc.bold('Arguments:')}
  path|branch          Worktree path or branch name (required)

${pc.bold('Options:')}
  -f, --force          Force removal (even with uncommitted changes)
  -h, --help           Show help

${pc.bold('Examples:')}
  worktree remove feature/login              # Remove by branch name
  worktree remove ../repo-feature-login      # Remove by path
`);
}

function showPruneHelp(): void {
  console.log(`
${pc.bold('worktree prune')} - Clean up stale worktree references

${pc.bold('Usage:')}
  worktree prune [options]

${pc.bold('Options:')}
  -n, --dry-run        Show what would be pruned
  -f, --force          Skip confirmation prompt
  -h, --help           Show help

${pc.bold('Examples:')}
  worktree prune --dry-run         # Show what would be pruned
  worktree prune                   # Prune with confirmation
`);
}

function showStackHelp(): void {
  console.log(`
${pc.bold('worktree stack')} - Manage stacked diffs

${pc.bold('Usage:')}
  worktree stack [subcommand] [options]

${pc.bold('Subcommands:')}
  ${pc.cyan('init')}               Initialize a new stack from current branch
  ${pc.cyan('branch')}             Create a child branch in the current stack
  ${pc.cyan('status')}             Show sync status for stack branches
  ${pc.cyan('sync')}               Sync branches with their parents
  ${pc.dim('(no subcommand)')}   Show all stacks

${pc.bold('Options:')}
  -v, --verbose        Show detailed information
  -h, --help           Show help

${pc.bold('Examples:')}
  worktree stack                        # Show all stacks
  worktree stack init --trunk main      # Start a new stack
  worktree stack branch feature/login   # Create child branch
  worktree stack status                 # Check sync status
  worktree stack sync                   # Sync all branches

${pc.dim('Run')} ${pc.cyan('worktree stack <subcommand> --help')} ${pc.dim('for more information.')}
`);
}

function showStackInitHelp(): void {
  console.log(`
${pc.bold('worktree stack init')} - Initialize a new stack from current branch

${pc.bold('Usage:')}
  worktree stack init --trunk <branch> [options]
  worktree stack init <trunk> [options]

${pc.bold('Arguments:')}
  trunk                Target branch the stack will eventually merge into

${pc.bold('Options:')}
  -t, --trunk <branch>   Trunk branch (required)
  -n, --name <name>      Stack name (auto-generated from branch if not provided)
  -h, --help             Show help

${pc.bold('What this does:')}
  1. Marks the current branch as the root of a new stack
  2. Records the trunk branch for PR targeting
  3. Tracks the current commit for sync detection

${pc.bold('Examples:')}
  worktree stack init --trunk main              # Initialize stack targeting main
  worktree stack init main                      # Same, positional argument
  worktree stack init -t develop -n my-feature  # Custom stack name
`);
}

function showPRHelp(): void {
  console.log(`
${pc.bold('worktree pr')} - Create GitHub PRs for stack branches

${pc.bold('Usage:')}
  worktree pr [options]

${pc.bold('Options:')}
  -y, --yes                    Headless mode (no prompts)
  -t, --title <template>       PR title template (use {branch} as placeholder)
  -d, --description <text>     PR description
  -h, --help                   Show help

${pc.bold('Behavior:')}
  Interactive mode (default):
    - Select which branches to create PRs for
    - Customize title and description for each PR
    - Confirm before creating each PR

  Headless mode (--yes):
    - Automatically creates PRs for current branch and all descendants
    - Uses auto-generated titles from branch names
    - Skips branches that already have PRs or aren't pushed

${pc.bold('Authentication:')}
  Uses GitHub CLI (gh) if available, otherwise prompts for token.
  You can also set GITHUB_TOKEN or GH_TOKEN environment variable.

${pc.bold('Examples:')}
  worktree pr                                  # Interactive mode
  worktree pr -y                               # Create PRs for all descendants
  worktree pr -y -t "feat: {branch}"           # Custom title template
  worktree pr -y -d "Auto-generated PR"        # Custom description
`);
}

