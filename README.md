# Worktree CLI

A modern CLI tool for managing git worktrees with stack visualization, inspired by Graphite CLI.

## Features

- Enhanced worktree management with beautiful UI
- Stack visualization showing branch relationships
- Color-coordinated display for multiple stacks
- Interactive prompts for safe operations
- Branch parent-child relationship tracking

## Installation

```bash
bun install
bun run build
```

## Usage

```bash
worktree list           # Show all worktrees with stack info
worktree add <branch>   # Add a new worktree
worktree remove <path>  # Remove a worktree
worktree prune          # Clean up stale worktree references
worktree stack          # Display full stack visualization
```

## Development

```bash
bun install
bun run dev -- list
```

