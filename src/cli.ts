/**
 * CLI - stacks: A modern CLI for managing stacked diffs
 */

import * as clack from '@clack/prompts';
import pc from 'picocolors';

// Stack commands (primary)
import { stackCommand } from './commands/stack.js';
import { stackInitCommand } from './commands/stack/init.js';
import { stackBranchCommand } from './commands/stack/branch.js';
import { stackStatusCommand } from './commands/stack/status.js';
import { stackSyncCommand } from './commands/stack/sync.js';
import { stackRestackCommand } from './commands/stack/restack.js';
import { stackPRCommand } from './commands/stack/pr.js';

// Worktree commands (secondary)
import { listCommand } from './commands/list.js';
import { addCommand } from './commands/add.js';
import { removeCommand } from './commands/remove.js';
import { pruneCommand } from './commands/prune.js';

// Legacy PR command
import { prCommand } from './commands/pr.js';

export async function runCLI(args: string[]): Promise<void> {
  const [command, ...rest] = args;

  // Show help if no command
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
      // === Stack commands (primary) ===
      
      case 'list':
      case 'ls':
        // Default: show stacks
        await handleListCommand(rest);
        break;

      case 'init':
        await handleInitCommand(rest);
        break;

      case 'new':
      case 'branch':
        await handleNewCommand(rest);
        break;

      case 'status':
      case 'st':
        await handleStatusCommand(rest);
        break;

      case 'sync':
        await handleSyncCommand(rest);
        break;

      case 'restack':
        await handleRestackCommand(rest);
        break;

      case 'pr':
        await handlePRCommand(rest);
        break;

      // === Worktree commands (secondary) ===
      
      case 'wt':
      case 'worktree':
        await handleWorktreeCommand(rest);
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

// === Stack Command Handlers ===

async function handleListCommand(args: string[]): Promise<void> {
  const options: { verbose?: boolean; all?: boolean } = {};

  for (const arg of args) {
    switch (arg) {
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-a':
      case '--all':
        options.all = true;
        break;
      case '-h':
      case '--help':
        showListHelp();
        return;
    }
  }

  await stackCommand(options);
}

async function handleInitCommand(args: string[]): Promise<void> {
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
        showInitHelp();
        return;
      default:
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
    showInitHelp();
    process.exit(1);
  }

  await stackInitCommand({ trunk: options.trunk, name: options.name });
}

async function handleNewCommand(args: string[]): Promise<void> {
  const options: { worktree?: boolean; path?: string } = {};
  let branchName = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-w':
      case '--worktree':
        options.worktree = true;
        break;
      case '-p':
      case '--path':
        options.path = args[++i];
        options.worktree = true;
        break;
      case '-h':
      case '--help':
        showNewHelp();
        return;
      default:
        if (!branchName && !arg.startsWith('-')) {
          branchName = arg;
        } else {
          clack.log.error(`Unexpected argument: ${arg}`);
          process.exit(1);
        }
    }
  }

  if (!branchName) {
    clack.log.error('Branch name is required');
    showNewHelp();
    process.exit(1);
  }

  await stackBranchCommand(branchName, options);
}

async function handleStatusCommand(args: string[]): Promise<void> {
  const options: { verbose?: boolean } = {};

  for (const arg of args) {
    switch (arg) {
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-h':
      case '--help':
        showStatusHelp();
        return;
      default:
        clack.log.error(`Unexpected argument: ${arg}`);
        process.exit(1);
    }
  }

  await stackStatusCommand(options);
}

async function handleSyncCommand(args: string[]): Promise<void> {
  const options: { merge?: boolean; force?: boolean; push?: boolean } = {};

  for (const arg of args) {
    switch (arg) {
      case '-m':
      case '--merge':
        options.merge = true;
        break;
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '-p':
      case '--push':
        options.push = true;
        break;
      case '-h':
      case '--help':
        showSyncHelp();
        return;
      default:
        clack.log.error(`Unexpected argument: ${arg}`);
        process.exit(1);
    }
  }

  await stackSyncCommand(options);
}

async function handleRestackCommand(args: string[]): Promise<void> {
  const options: { force?: boolean } = {};

  for (const arg of args) {
    switch (arg) {
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '-h':
      case '--help':
        showRestackHelp();
        return;
      default:
        clack.log.error(`Unexpected argument: ${arg}`);
        process.exit(1);
    }
  }

  await stackRestackCommand(options);
}

async function handlePRCommand(args: string[]): Promise<void> {
  const options: { yes?: boolean; link?: boolean; updateExisting?: boolean } = {};

  for (const arg of args) {
    switch (arg) {
      case '-y':
      case '--yes':
        options.yes = true;
        break;
      case '-l':
      case '--link':
        options.link = true;
        break;
      case '-u':
      case '--update-existing':
        options.updateExisting = true;
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

  await stackPRCommand(options);
}

// === Worktree Command Handler ===

async function handleWorktreeCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    showWorktreeHelp();
    return;
  }

  switch (subcommand) {
    case 'list':
    case 'ls':
      await handleWtListCommand(rest);
      break;

    case 'add':
    case 'new':
      await handleWtAddCommand(rest);
      break;

    case 'remove':
    case 'rm':
      await handleWtRemoveCommand(rest);
      break;

    case 'prune':
      await handleWtPruneCommand(rest);
      break;

    default:
      clack.log.error(`Unknown worktree command: ${subcommand}`);
      showWorktreeHelp();
      process.exit(1);
  }
}

async function handleWtListCommand(args: string[]): Promise<void> {
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
        showWtListHelp();
        return;
    }
  }

  await listCommand(options);
}

async function handleWtAddCommand(args: string[]): Promise<void> {
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
        showWtAddHelp();
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
    showWtAddHelp();
    process.exit(1);
  }

  await addCommand(branch, options);
}

async function handleWtRemoveCommand(args: string[]): Promise<void> {
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
        showWtRemoveHelp();
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
    showWtRemoveHelp();
    process.exit(1);
  }

  await removeCommand(input, options);
}

async function handleWtPruneCommand(args: string[]): Promise<void> {
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
        showWtPruneHelp();
        return;
    }
  }

  await pruneCommand(options);
}

// === Help Functions ===

function showVersion(): void {
  console.log('stacks v0.1.0');
}

function showHelp(): void {
  console.log(`
${pc.bold('stacks')} - Manage stacked diffs with git

${pc.bold('Usage:')}
  stacks <command> [options]

${pc.bold('Stack Commands:')}
  ${pc.cyan('list, ls')}           Show all stacks
  ${pc.cyan('init')}               Initialize a new stack from current branch
  ${pc.cyan('new, branch')}        Create a child branch in the current stack
  ${pc.cyan('status, st')}         Show sync status for stack branches
  ${pc.cyan('sync')}               Sync branches with their parents
  ${pc.cyan('restack')}            Re-record base commits after manual operations
  ${pc.cyan('pr')}                 Create GitHub PRs for stack branches

${pc.bold('Worktree Commands:')}
  ${pc.cyan('wt list')}            Show worktrees
  ${pc.cyan('wt add')}             Add a new worktree
  ${pc.cyan('wt remove')}          Remove a worktree
  ${pc.cyan('wt prune')}           Clean up stale worktree references

${pc.bold('Options:')}
  -h, --help           Show help
  -v, --version        Show version

${pc.bold('Examples:')}
  stacks init main                  # Start a stack targeting main
  stacks new feature/login          # Create child branch
  stacks status                     # Check which branches need sync
  stacks sync                       # Rebase branches onto parents
  stacks pr --link                  # Create PRs with navigation

${pc.dim('Run')} ${pc.cyan('stacks <command> --help')} ${pc.dim('for more information on a command.')}
`);
}

function showListHelp(): void {
  console.log(`
${pc.bold('stacks list')} - Show all stacks

${pc.bold('Usage:')}
  stacks list [options]
  stacks ls [options]

${pc.bold('Options:')}
  -a, --all            Also show detected (non-managed) stacks
  -v, --verbose        Show detailed information
  -h, --help           Show help

${pc.bold('Examples:')}
  stacks list                       # Show managed stacks
  stacks ls --all                   # Include detected stacks
`);
}

function showInitHelp(): void {
  console.log(`
${pc.bold('stacks init')} - Initialize a new stack from current branch

${pc.bold('Usage:')}
  stacks init <trunk> [options]
  stacks init --trunk <branch> [options]

${pc.bold('Arguments:')}
  trunk                Target branch the stack will merge into

${pc.bold('Options:')}
  -t, --trunk <branch>   Trunk branch (required)
  -n, --name <name>      Stack name (auto-generated if not provided)
  -h, --help             Show help

${pc.bold('What this does:')}
  1. Marks current branch as the root of a new stack
  2. Records the trunk branch for PR targeting
  3. Tracks the current commit for sync detection

${pc.bold('Examples:')}
  stacks init main                  # Initialize stack targeting main
  stacks init -t develop -n auth    # Custom stack name
`);
}

function showNewHelp(): void {
  console.log(`
${pc.bold('stacks new')} - Create a child branch in the current stack

${pc.bold('Usage:')}
  stacks new <name> [options]
  stacks branch <name> [options]

${pc.bold('Arguments:')}
  name                 Name for the new branch (required)

${pc.bold('Options:')}
  -w, --worktree       Also create a worktree for the new branch
  -p, --path <path>    Custom path for worktree (implies --worktree)
  -h, --help           Show help

${pc.bold('What this does:')}
  1. Creates a new branch from current HEAD
  2. Records parent branch for sync detection
  3. Optionally creates a worktree

${pc.bold('Examples:')}
  stacks new feature/login          # Create child branch
  stacks new feature/oauth -w       # With worktree
`);
}

function showStatusHelp(): void {
  console.log(`
${pc.bold('stacks status')} - Show sync status for stack branches

${pc.bold('Usage:')}
  stacks status [options]
  stacks st [options]

${pc.bold('Options:')}
  -v, --verbose        Show detailed status information
  -h, --help           Show help

${pc.bold('Status indicators:')}
  ${pc.green('✓')}                  Branch is synced with parent
  ${pc.yellow('⚠ +N commits')}      Parent has N new commits
  ${pc.red('⚠ diverged')}        Branch has diverged from parent
  ${pc.red('✗')}                  Error checking status

${pc.bold('Examples:')}
  stacks status                     # Show sync status
  stacks st -v                      # Verbose details
`);
}

function showSyncHelp(): void {
  console.log(`
${pc.bold('stacks sync')} - Sync branches with their parents

${pc.bold('Usage:')}
  stacks sync [options]

${pc.bold('Options:')}
  -m, --merge          Use merge instead of rebase
  -f, --force          Proceed even with uncommitted changes
  -p, --push           Push branches after syncing
  -h, --help           Show help

${pc.bold('Behavior:')}
  1. Fetches latest from remote
  2. Rebases (or merges) each branch onto its parent
  3. Stops on conflict with resolution instructions

${pc.bold('Examples:')}
  stacks sync                       # Rebase mode (default)
  stacks sync --merge               # Merge mode
  stacks sync --push                # Push after syncing
`);
}

function showRestackHelp(): void {
  console.log(`
${pc.bold('stacks restack')} - Re-record base commits after manual operations

${pc.bold('Usage:')}
  stacks restack [options]

${pc.bold('Options:')}
  -f, --force          Skip confirmation prompt
  -h, --help           Show help

${pc.bold('When to use:')}
  After manual git operations:
  - Manual rebases
  - Force pushes
  - Interactive rebases
  - Cherry-picks

${pc.bold('Examples:')}
  stacks restack                    # Interactive mode
  stacks restack --force            # Skip confirmation
`);
}

function showPRHelp(): void {
  console.log(`
${pc.bold('stacks pr')} - Create GitHub PRs for stack branches

${pc.bold('Usage:')}
  stacks pr [options]

${pc.bold('Options:')}
  -y, --yes              Headless mode (create all PRs)
  -l, --link             Add stack navigation to PR descriptions
  -u, --update-existing  Update existing PRs with navigation
  -h, --help             Show help

${pc.bold('Stack navigation:')}
  When using --link, PRs include a navigation table:
  
  | | Branch | PR |
  |---|--------|-----|
  | ⬆️ | parent-branch | #101 |
  | → | current-branch | this PR |
  | ⬇️ | child-branch | #103 |

${pc.bold('Examples:')}
  stacks pr                         # Interactive mode
  stacks pr -y --link               # Create all with navigation
  stacks pr --link -u               # Update existing PRs
`);
}

function showWorktreeHelp(): void {
  console.log(`
${pc.bold('stacks wt')} - Manage git worktrees

${pc.bold('Usage:')}
  stacks wt <command> [options]

${pc.bold('Commands:')}
  ${pc.cyan('list, ls')}           Show worktrees
  ${pc.cyan('add, new')}           Add a new worktree
  ${pc.cyan('remove, rm')}         Remove a worktree
  ${pc.cyan('prune')}              Clean up stale worktree references

${pc.bold('Examples:')}
  stacks wt list                    # Show worktrees
  stacks wt add feature/test        # Add worktree
  stacks wt remove feature/test     # Remove worktree

${pc.dim('Run')} ${pc.cyan('stacks wt <command> --help')} ${pc.dim('for more information.')}
`);
}

function showWtListHelp(): void {
  console.log(`
${pc.bold('stacks wt list')} - Show worktrees

${pc.bold('Usage:')}
  stacks wt list [options]

${pc.bold('Options:')}
  -t, --tree           Show tree view with branch relationships
  -v, --verbose        Show detailed information
  -s, --simple         Show simple git output
  --no-stack           Skip stack detection (faster)
  -h, --help           Show help
`);
}

function showWtAddHelp(): void {
  console.log(`
${pc.bold('stacks wt add')} - Add a new worktree

${pc.bold('Usage:')}
  stacks wt add <branch> [path] [options]

${pc.bold('Options:')}
  -b, --base <branch>  Base branch for new branch
  -p, --path <path>    Target path
  -f, --force          Skip confirmation
  -h, --help           Show help
`);
}

function showWtRemoveHelp(): void {
  console.log(`
${pc.bold('stacks wt remove')} - Remove a worktree

${pc.bold('Usage:')}
  stacks wt remove <path|branch> [options]

${pc.bold('Options:')}
  -f, --force          Force removal
  -h, --help           Show help
`);
}

function showWtPruneHelp(): void {
  console.log(`
${pc.bold('stacks wt prune')} - Clean up stale worktree references

${pc.bold('Usage:')}
  stacks wt prune [options]

${pc.bold('Options:')}
  -n, --dry-run        Show what would be pruned
  -f, --force          Skip confirmation
  -h, --help           Show help
`);
}
