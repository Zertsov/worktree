# Quick Start Guide

## Installation

### Option 1: Install globally with Bun

```bash
bun install
bun run build
bun link
```

After linking, you can use `worktree` anywhere:

```bash
worktree --help
```

### Option 2: Use directly from the repo

```bash
bun install
bun run build
./dist/index.js --help
```

Or create an alias:

```bash
alias worktree="/path/to/repo/dist/index.js"
```

### Option 3: Run with bun directly (dev mode)

```bash
bun run dev -- list
bun run dev -- add feature/test
```

## Usage Examples

### List worktrees

```bash
# Simple list view
worktree list

# Tree view showing branch relationships
worktree list --tree

# Verbose tree view with paths
worktree list --tree --verbose
```

### Add a worktree

```bash
# Add worktree for existing branch
worktree add feature/login

# Create new branch from main
worktree add -b main feature/new-feature

# Specify custom path
worktree add feature/test ../custom-path
```

### Remove a worktree

```bash
# Remove by branch name
worktree remove feature/login

# Remove by path
worktree remove ../repo-feature-login

# Force removal (skip confirmation)
worktree remove -f feature/old
```

### Prune stale worktrees

```bash
# Dry run (see what would be pruned)
worktree prune --dry-run

# Actually prune
worktree prune
```

### View stack relationships

```bash
# Show all stacks
worktree stack

# Show with paths
worktree stack --verbose
```

## Branch Parent Tracking

The CLI can track branch parent-child relationships in two ways:

### 1. Git Config (Recommended)

Set a parent for a branch:

```bash
git config branch.feature/child.parent feature/parent
```

### 2. Config File

Create `.worktree-config.json` in your repo root:

```json
{
  "branchParents": {
    "feature/child": "feature/parent",
    "feature/grandchild": "feature/child"
  },
  "colors": {
    "main": "cyan",
    "develop": "magenta"
  }
}
```

The config file takes precedence over git config.

## Features

- **Stack Visualization**: See branch relationships in a tree structure
- **Color Coding**: Different stacks get different colors
- **Auto-detection**: Attempts to detect parent branches using merge-base
- **Interactive**: Clack-powered prompts for safe operations
- **Smart Resolution**: Find worktrees by branch name or path

## Tips

1. Use `--tree` flag with `list` command to see full stack relationships
2. Set branch parents with git config for accurate stack tracking
3. Use tab completion by adding to your shell (see below)

## Shell Completion (Optional)

Add to your shell config:

### Bash/Zsh

```bash
# Add to ~/.bashrc or ~/.zshrc
eval "$(worktree completion)"
```

Note: Completion is not yet implemented, but the CLI is designed to support it in the future.

