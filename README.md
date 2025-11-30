# Stacks CLI

A modern CLI for managing stacked diffs with git, inspired by Graphite CLI.

## Features

- **Stack Management**: Initialize, create, and track branches in logical stacks
- **Sync Detection**: Know when branches need rebasing with visual status indicators
- **Automatic Rebasing**: Sync entire stacks with a single command
- **GitHub PR Integration**: Create PRs with stack navigation links
- **Worktree Support**: Optionally create worktrees for stack branches
- **Beautiful UI**: Color-coded stacks with intuitive tree visualization

## Installation

### Via Homebrew (Recommended)

```bash
# Add the tap
brew tap Zertsov/stacks

# Install stacks
brew install stacks

# Or install in one command
brew install Zertsov/stacks/stacks
```

### From Source

Requires [Bun](https://bun.sh) to be installed.

```bash
git clone https://github.com/Zertsov/stacks.git
cd stacks
bun install
bun run build:prod

# Add to your PATH or create a symlink
ln -s $(pwd)/dist/stacks /usr/local/bin/stacks
```

### From Release Binary

Download the latest release for your platform from the [releases page](https://github.com/Zertsov/stacks/releases):

```bash
# Example for macOS ARM64
curl -LO https://github.com/Zertsov/stacks/releases/latest/download/stacks-macos-arm64.tar.gz
tar -xzf stacks-macos-arm64.tar.gz
chmod +x stacks-macos-arm64
sudo mv stacks-macos-arm64 /usr/local/bin/stacks
```

## Quick Start

```bash
# 1. Checkout your feature branch
git checkout -b feature/auth

# 2. Initialize a stack targeting main
stacks init main

# 3. Create child branches
stacks new feature/login
stacks new feature/oauth

# 4. Check sync status
stacks status

# 5. Sync all branches
stacks sync

# 6. Create PRs with stack navigation
stacks pr --link
```

## Usage

```bash
stacks list             # Show all managed stacks
stacks init <trunk>     # Initialize a stack from current branch
stacks new <name>       # Create a child branch in the stack
stacks status           # Show sync status for branches
stacks sync             # Sync branches with their parents
stacks restack          # Re-record base commits after manual ops
stacks pr               # Create GitHub PRs for stack branches
```

### Stack Commands

#### `stacks list` / `stacks ls`
Show all managed stacks with their branch hierarchies.

- `-a, --all` Also show detected (non-managed) branch relationships
- `-v, --verbose` Show detailed information
- `-h, --help` Show command-specific usage

#### `stacks init <trunk>`
Initialize a new stack from the current branch.

- `-t, --trunk <branch>` Trunk branch (can also be positional argument)
- `-n, --name <name>` Custom stack name (auto-generated if not provided)
- `-h, --help` Show command-specific usage

**Example:**
```bash
stacks init main                  # Initialize stack targeting main
stacks init -t develop -n auth    # Custom stack name
```

#### `stacks new <name>` / `stacks branch <name>`
Create a child branch in the current stack.

- `-w, --worktree` Also create a worktree for the new branch
- `-p, --path <path>` Custom path for worktree (implies --worktree)
- `-h, --help` Show command-specific usage

**Example:**
```bash
stacks new feature/login          # Create child branch
stacks new feature/oauth -w       # With worktree
```

#### `stacks status` / `stacks st`
Show sync status for all branches in the current stack.

- `-v, --verbose` Show detailed status information
- `-h, --help` Show command-specific usage

**Status indicators:**
- ✓ Branch is synced with parent
- ⚠ +N commits - Parent has N new commits
- ⚠ diverged - Branch has diverged from parent
- ✗ Error checking status

#### `stacks sync`
Sync branches with their parents by rebasing (or merging).

- `-m, --merge` Use merge instead of rebase
- `-f, --force` Proceed even with uncommitted changes
- `-p, --push` Push branches after syncing
- `-h, --help` Show command-specific usage

**Example:**
```bash
stacks sync                       # Rebase mode (default)
stacks sync --merge               # Merge mode
stacks sync --push                # Push after syncing
```

#### `stacks restack`
Re-record base commits after manual git operations (rebases, cherry-picks, etc.).

- `-f, --force` Skip confirmation prompt
- `-h, --help` Show command-specific usage

#### `stacks pr`
Create GitHub PRs for branches in the current stack.

- `-y, --yes` Headless mode (create all PRs without prompts)
- `-l, --link` Add stack navigation to PR descriptions
- `-u, --update-existing` Update existing PRs with navigation
- `-h, --help` Show command-specific usage

**Example:**
```bash
stacks pr                         # Interactive mode
stacks pr -y --link               # Create all with navigation
stacks pr --link -u               # Update existing PRs
```

## GitHub PR Integration

The `stacks pr` command creates pull requests with proper base branches and optional stack navigation.

### Setup

To use the PR feature, you need a GitHub Personal Access Token (PAT) with the following permissions:

1. **Pull Requests** (Read and write)
2. **Contents** (Read-only)

#### Creating a GitHub PAT:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Under "Repository access", select "All repositories"
4. Add the following permissions for repositories:
   - `Pull requests` (Read and write)
   - `Contents` (Read-only)
5. Generate and copy the token
6. The CLI will use the token via:
   - GitHub CLI (`gh`) if authenticated
   - `GITHUB_TOKEN` or `GH_TOKEN` environment variable
   - Interactive prompt if neither is available

### Stack Navigation

When using `--link`, PRs include a navigation table showing the stack structure:

| | Branch | PR |
|---|--------|-----|
| ⬆️ | parent-branch | #101 |
| → | current-branch | this PR |
| ⬇️ | child-branch | #103 |

This makes it easy for reviewers to navigate between related PRs in the stack.

## Development

```bash
bun install
bun run dev -- list
bun run test
```

### Building

```bash
# Development build
bun run build

# Production binary
bun run build:prod

# All platforms
bun run build:all
```
