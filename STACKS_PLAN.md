# Stacked Diffs Feature Plan

## Overview

Extend the `worktree` CLI with explicit stack management for stacked diffs workflows. This allows developers to:

1. Explicitly designate branches as part of a stack (vs current heuristic detection)
2. Track the exact commit a branch was created from
3. Detect when parent branches have changed and children need to sync
4. Submit PRs with navigation links between stack members
5. Automatically rebase/merge when syncing (when no conflicts exist)

---

## Current State Analysis

### What `worktree` Already Has
- **Stack detection** (`src/stack/detector.ts`) - Uses merge-base heuristics to detect parent/child relationships
- **Stack visualization** (`src/stack/visualizer.ts`) - Beautiful tree rendering with colors
- **PR creation** (`src/commands/pr.ts`) - Creates PRs for branches, targets parent branch
- **Config management** (`src/config/manager.ts`) - Reads/writes `branch.<name>.parent` from git config
- **GitHub API** (`src/github/api.ts`) - Full PR creation, auth via `gh` CLI or tokens

### What's Missing
- Explicit stack initialization (marking a branch as stack root)
- Tracking the **base commit** (not just parent branch) for sync detection
- Sync status checking and automatic rebase/merge
- PR description with stack navigation links
- Configurable trunk branch per-stack

---

## Architecture

### Data Model

#### Git Config Storage (Source of Truth)
```bash
# Stack root configuration
git config worktree.stacks.mystack.trunk "main"           # Trunk branch for this stack
git config worktree.stacks.mystack.root "feature/auth"    # Root branch of the stack

# Per-branch metadata
git config branch.feature/auth.stackname "mystack"        # Which stack this belongs to
git config branch.feature/auth.stackparent "main"         # Parent branch in stack
git config branch.feature/auth.stackbase "abc123def"      # Commit hash we branched from

git config branch.feature/login.stackname "mystack"
git config branch.feature/login.stackparent "feature/auth"
git config branch.feature/login.stackbase "def456ghi"
```

#### Why Git Config?
1. **Already in use** - `worktree` uses `branch.<name>.parent` pattern
2. **Survives operations** - Rebases, merges don't lose the data
3. **Debuggable** - `git config --list | grep stack` to see all stack data
4. **Portable** - Could be pushed/shared if needed (via `.gitconfig` patterns)

### Result Type Pattern

Using `neverthrow` for Rust-style error handling:

```typescript
import { Result, ok, err } from 'neverthrow';

// Instead of:
async function doThing(): Promise<Thing> {
  try {
    // ...
  } catch (e) {
    throw new Error('Failed');
  }
}

// We do:
async function doThing(): Promise<Result<Thing, StackError>> {
  const result = await gitOperation();
  if (!result) {
    return err(new StackError('BRANCH_NOT_FOUND', 'Branch does not exist'));
  }
  return ok(result);
}
```

### Error Types

```typescript
type StackErrorCode =
  | 'NOT_IN_REPO'
  | 'BRANCH_NOT_FOUND'
  | 'STACK_NOT_FOUND'
  | 'ALREADY_IN_STACK'
  | 'SYNC_CONFLICT'
  | 'UNCOMMITTED_CHANGES'
  | 'REMOTE_NOT_FOUND'
  | 'PR_EXISTS'
  | 'GITHUB_ERROR';

interface StackError {
  code: StackErrorCode;
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;  // Actionable next step for user
}
```

---

## New Commands

### `worktree stack init`

Initialize a new stack from the current branch.

```bash
# On branch 'feature/auth', create a stack that merges into 'main'
worktree stack init --trunk main

# Or with explicit stack name
worktree stack init --trunk main --name auth-feature
```

**Behavior:**
1. Records current branch as stack root
2. Records trunk branch
3. Records current HEAD as the base commit
4. Updates git config

**Output:**
```
✓ Initialized stack 'auth-feature'
  
  Stack root: feature/auth
  Trunk: main
  Base commit: abc123d

  Next steps:
    • Create child branches with: worktree stack branch <name>
    • View stack with: worktree stack
```

---

### `worktree stack branch <name>`

Create a new branch as a child of the current branch in the stack.

```bash
# On 'feature/auth', create child branch
worktree stack branch feature/login
```

**Behavior:**
1. Verify current branch is in a stack
2. Create new branch from current HEAD
3. Record parent branch and base commit in git config
4. Optionally create worktree (`--worktree` flag)

**Output:**
```
✓ Created branch 'feature/login'
  
  Parent: feature/auth
  Base commit: def456g
  
  Stack:
  main (trunk)
  └── feature/auth
      └── feature/login ◀ you are here
```

---

### `worktree stack status`

Show sync status for all branches in current stack.

```bash
worktree stack status
```

**Output (all synced):**
```
Stack: auth-feature
Trunk: main

main (trunk)
└── feature/auth ✓ synced
    └── feature/login ✓ synced
        └── feature/oauth ✓ synced
```

**Output (needs sync):**
```
Stack: auth-feature  
Trunk: main

main (trunk)
└── feature/auth ⚠ parent updated (+3 commits)
    └── feature/login ✓ synced
        └── feature/oauth ⚠ parent updated (+1 commit)

Run 'worktree stack sync' to update branches.
```

---

### `worktree stack sync`

Sync branches with their parents via rebase (or merge with `--merge`).

```bash
# Rebase mode (default)
worktree stack sync

# Merge mode
worktree stack sync --merge

# Sync specific branch and its children
worktree stack sync feature/login

# Just pull, don't sync children
worktree stack sync --no-cascade
```

**Behavior:**
1. Fetch latest from remote
2. For each branch that needs sync (bottom-up order):
   - Stash uncommitted changes if any
   - Attempt rebase/merge onto parent
   - If conflict: stop, inform user, provide resolution steps
   - If success: update base commit in config, continue to next
   - Pop stash if we stashed

**Output (success):**
```
Syncing stack 'auth-feature'...

↓ Fetching from origin...
  
⟳ Rebasing feature/auth onto main...
  ✓ Successfully rebased (+3 commits)
  
⟳ Rebasing feature/oauth onto feature/login...
  ✓ Successfully rebased (+1 commit)

✓ Stack synced!

  main (trunk)
  └── feature/auth ✓
      └── feature/login ✓
          └── feature/oauth ✓
```

**Output (conflict):**
```
Syncing stack 'auth-feature'...

↓ Fetching from origin...
  
⟳ Rebasing feature/auth onto main...
  ✗ Conflict in src/auth.ts

  To resolve:
    1. cd /path/to/worktree
    2. Resolve conflicts in src/auth.ts
    3. git add src/auth.ts
    4. git rebase --continue
    5. worktree stack sync  (to continue syncing children)
```

---

### `worktree stack pr` (enhanced)

Create PRs with stack navigation in description.

```bash
# Interactive mode (existing)
worktree stack pr

# All branches in stack, with navigation links
worktree stack pr --yes --link
```

**PR Description (auto-generated):**
```markdown
## Description

<!-- User's description here -->

---

## 📚 Stack

| | Branch | PR |
|---|--------|-----|
| ⬆️ | `main` | (trunk) |
| → | `feature/auth` | **#101** |
| ⬇️ | `feature/login` | #102 |

<sub>Part of stack `auth-feature` · Managed by worktree</sub>
```

**Behavior:**
1. Create PR targeting parent branch (existing behavior)
2. After PR created, fetch PR numbers for related branches
3. Update PR description with stack navigation table
4. Optionally update sibling PRs to include this new PR (`--update-siblings`)

---

### `worktree stack adopt <branch>`

Add an existing branch to the current stack.

```bash
# Add existing branch as child of current branch
worktree stack adopt feature/existing-branch
```

---

### `worktree stack remove <branch>`

Remove a branch from the stack (doesn't delete the branch).

```bash
worktree stack remove feature/login

# Also delete the branch
worktree stack remove feature/login --delete
```

---

### `worktree stack restack`

Re-record base commits after manual operations.

```bash
# Update all base commits to current state
worktree stack restack
```

Useful after manual rebases or other git operations that change the commit graph.

---

## File Structure Changes

```
src/
├── cli.ts                    # Add new stack subcommands
├── commands/
│   ├── stack.ts              # Existing - enhance with subcommands
│   └── ...
├── stack/
│   ├── types.ts              # Add StackConfig, SyncStatus types
│   ├── detector.ts           # Existing - add explicit stack detection
│   ├── visualizer.ts         # Add sync status indicators
│   ├── colors.ts             # Existing
│   ├── manager.ts            # NEW: Stack CRUD operations
│   ├── sync.ts               # NEW: Sync detection and execution
│   └── errors.ts             # NEW: StackError types with neverthrow
├── git/
│   ├── operations.ts         # Add rebase/merge operations
│   └── ...
└── github/
    ├── api.ts                # Add PR description update
    ├── pr-formatter.ts       # NEW: Stack navigation formatting
    └── ...
```

---

## New Dependencies

```json
{
  "dependencies": {
    "@clack/prompts": "^0.7.0",
    "picocolors": "^1.0.0",
    "neverthrow": "^7.0.0"       // NEW: Result types
  }
}
```

---

## Implementation Phases

### Phase 1: Core Stack Management
- [ ] Add `neverthrow` and error types
- [ ] Implement `StackManager` class for git config operations
- [ ] `worktree stack init` command
- [ ] `worktree stack branch` command
- [ ] Update `worktree stack` to show explicit stacks
- [ ] Basic tests

### Phase 2: Sync Detection & Execution
- [ ] Implement sync status detection (compare base commits)
- [ ] `worktree stack status` command
- [ ] `worktree stack sync` command (rebase mode)
- [ ] `worktree stack sync --merge` option
- [ ] Conflict detection and user guidance
- [ ] `worktree stack restack` command

### Phase 3: Enhanced PR Workflow
- [ ] PR description formatter with stack navigation
- [ ] Update `worktree stack pr` to include navigation
- [ ] `--update-siblings` to update related PRs
- [ ] Handle PR number resolution across stack

### Phase 4: Polish & Edge Cases
- [ ] `worktree stack adopt` command
- [ ] `worktree stack remove` command
- [ ] Handle orphaned branches (parent deleted)
- [ ] Handle trunk branch changes
- [ ] Improve error messages with suggestions
- [ ] Documentation updates

---

## Example Workflow

```bash
# Start on main, create a feature stack
git checkout main
git checkout -b feature/auth
worktree stack init --trunk main --name auth-feature

# Create first child branch
worktree stack branch feature/login
# ... make commits ...

# Create second child
worktree stack branch feature/oauth
# ... make commits ...

# View the stack
worktree stack
# main (trunk)
# └── feature/auth
#     └── feature/login
#         └── feature/oauth ◀ you are here

# Someone merges to main, need to sync
worktree stack status
# feature/auth ⚠ parent updated (+5 commits)

worktree stack sync
# ✓ Rebased feature/auth onto main
# ✓ Rebased feature/login onto feature/auth  
# ✓ Rebased feature/oauth onto feature/login
# ✓ Stack synced!

# Create PRs with navigation links
worktree stack pr --yes --link
# ✓ Created PR #101 for feature/auth → main
# ✓ Created PR #102 for feature/login → feature/auth
# ✓ Created PR #103 for feature/oauth → feature/login
# ✓ Updated PR descriptions with stack navigation
```

---

## Open Questions

1. **Worktree integration**: Should `stack branch` automatically create a worktree? Current thinking: opt-in with `--worktree` flag.

2. **Multiple stacks**: Can a branch be in multiple stacks? Current thinking: No, one stack per branch for simplicity.

3. **Stack deletion**: What happens when you delete a stack? Current thinking: Just removes metadata, branches remain.

4. **Remote sync**: Should we push after successful local sync? Current thinking: No, user controls when to push.

---

## Success Criteria

- [ ] Developer can create a stack from any branch with one command
- [ ] Developer can see at a glance which branches need syncing
- [ ] Developer can sync entire stack with one command (when no conflicts)
- [ ] Conflicts are clearly explained with actionable resolution steps
- [ ] PRs include navigation to easily jump between stack members
- [ ] All operations provide clear, detailed error messages
- [ ] No try/catch - all errors use Result types

