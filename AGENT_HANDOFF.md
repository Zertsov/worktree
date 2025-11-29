# Agent Handoff: Stacks CLI Development

This document summarizes the work done to create the `stacks` CLI for managing stacked diffs with git. It provides context for another agent to continue development.

## Project Overview

**Location:** `/home/mitch/git/worktree`  
**CLI Name:** `stacks`  
**Purpose:** Manage stacked diffs (chains of branches that build on each other) with easy sync detection, rebasing, and PR creation.

## Branch Structure

```
main
└── stacks (Phase 1-3 complete)
    └── rename (CLI restructured from 'worktree' to 'stacks')
        └── testing (current branch - test infrastructure added)
```

## Work Completed

### Phase 1: Core Stack Management ✅
- `stacks init <trunk>` - Initialize a stack from current branch
- `stacks new <name>` - Create child branch in stack  
- `stacks list` - Show all managed stacks

### Phase 2: Sync Detection & Execution ✅
- `stacks status` - Show which branches need syncing
- `stacks sync` - Rebase/merge branches onto updated parents
- `stacks restack` - Re-record base commits after manual git operations

### Phase 3: Enhanced PR Workflow ✅
- `stacks pr` - Create GitHub PRs for stack branches
- `--link` flag adds navigation tables to PR descriptions
- `--update-existing` updates existing PRs with navigation

### Phase 4: CLI Rename ✅
Refactored from `worktree` CLI to `stacks` CLI:
- Primary commands are stack-focused (init, new, status, sync, etc.)
- Worktree management moved to `stacks wt <command>` subcommand
- Git config keys changed from `worktree.stack.*` to `stacks.*`

### Testing Infrastructure ✅
- 52 tests across 3 test files
- Mock git operations via dependency injection
- Tests for: pr-formatter, StackManager, error types

## Architecture

### Key Files

```
src/
├── cli.ts                    # Command routing and help
├── commands/
│   ├── stack.ts              # 'stacks list' command
│   └── stack/
│       ├── init.ts           # 'stacks init'
│       ├── branch.ts         # 'stacks new'
│       ├── status.ts         # 'stacks status'
│       ├── sync.ts           # 'stacks sync'
│       ├── restack.ts        # 'stacks restack'
│       └── pr.ts             # 'stacks pr'
├── stack/
│   ├── manager.ts            # Stack CRUD operations (git config)
│   ├── sync.ts               # Sync detection and execution
│   ├── errors.ts             # Error types (neverthrow)
│   ├── types.ts              # Type definitions
│   ├── detector.ts           # Heuristic stack detection
│   ├── visualizer.ts         # Tree visualization
│   └── colors.ts             # Color management
├── git/
│   ├── operations.ts         # Git command wrappers
│   ├── interface.ts          # IGitOperations for DI/mocking
│   └── types.ts              # Git types
├── github/
│   ├── api.ts                # GitHub API client
│   ├── pr-formatter.ts       # PR description formatting
│   └── types.ts              # GitHub types
└── __tests__/
    ├── pr-formatter.test.ts  # 15 tests
    ├── stack-manager.test.ts # 19 tests
    └── errors.test.ts        # 18 tests
```

### Data Storage

Stack metadata stored in git config:
```bash
# Stack config
stacks.<stackname>.trunk = "main"
stacks.<stackname>.root = "feature/auth"
stacks.<stackname>.created = "2024-01-01T00:00:00Z"

# Branch config
branch.<name>.stackname = "mystack"
branch.<name>.stackparent = "main"
branch.<name>.stackbase = "abc123def"  # Commit branched from
```

### Error Handling

Uses `neverthrow` for Result types:
```typescript
import { StackResult, stackOk, stackErr, StackErrors } from './stack/errors.js';

async function doThing(): Promise<StackResult<Thing>> {
  if (error) {
    return StackErrors.branchNotFound(branch);
  }
  return stackOk(result);
}
```

## What's NOT Tested (and Why)

### 1. CLI Handlers (`src/cli.ts`)
**Why:** These are thin wrappers that parse args and call commands. Testing would be integration tests that verify arg parsing, better done with e2e tests.

### 2. Actual Git Operations (`src/git/operations.ts`)
**Why:** These are thin wrappers around `git` commands. Testing requires a real git repo. Better tested via integration tests.

### 3. GitHub API (`src/github/api.ts`)
**Why:** Requires network calls or extensive HTTP mocking. Would need fixtures or a mock server. Low value given the API is straightforward.

### 4. SyncManager (`src/stack/sync.ts`)
**Why:** Heavily dependent on git operations (rebase, merge, fetch). Would require extensive mocking similar to StackManager. The logic is straightforward - it's mostly orchestration.

### 5. Command implementations (`src/commands/stack/*.ts`)
**Why:** These are orchestration code that calls StackManager/SyncManager and formats output. Testing the underlying managers covers the business logic.

### 6. Stack Detector (`src/stack/detector.ts`)
**Why:** Uses merge-base heuristics that require a real git repo with branch history. Would need git fixtures.

## Remaining Work (Phase 4 from original plan)

From `STACKS_PLAN.md`:

1. **`stacks adopt <branch>`** - Add an existing branch to a stack
2. **`stacks remove <branch>`** - Remove a branch from a stack
3. **Handle orphaned branches** - When a parent is deleted
4. **Handle trunk changes** - When trunk branch is updated
5. **Error message improvements** - Add more helpful suggestions

## Commands Reference

```bash
# Stack management
stacks init main                    # Start stack targeting main
stacks new feature/login            # Create child branch
stacks list                         # Show all stacks
stacks status                       # Check sync status
stacks sync                         # Rebase onto parents
stacks sync --merge                 # Merge instead of rebase
stacks restack                      # Re-record base commits

# PR management  
stacks pr                           # Interactive PR creation
stacks pr -y --link                 # Auto-create with navigation

# Worktree management
stacks wt list                      # Show worktrees
stacks wt add <branch>              # Add worktree
stacks wt remove <path>             # Remove worktree
```

## Running Tests

```bash
bun test              # Run all tests
bun test --watch      # Watch mode
```

## Building

```bash
bun run build:prod           # Build binary
bun run build:linux-x64      # Linux build
bun run build:macos-arm64    # macOS ARM build
```

## Dependencies

- `@clack/prompts` - CLI prompts and spinners
- `picocolors` - Terminal colors
- `neverthrow` - Result types for error handling
- `bun` - Runtime and bundler

## Notes for Continuation

1. The `SyncManager` should also be updated to use dependency injection like `StackManager` if tests are needed for it.

2. The git config prefix was changed from `worktree.stack.*` to `stacks.*` - this is a breaking change for any existing users.

3. The `stacks wt` commands still use the old worktree-focused code. They work but could be better integrated.

4. The PR navigation feature (`--link`) creates markdown tables in PR descriptions with links to parent/child PRs in the stack.

5. Consider adding `stacks push` command to push all branches in a stack.

