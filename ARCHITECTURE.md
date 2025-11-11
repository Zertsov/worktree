# Architecture Documentation

This document describes the architecture of the Worktree CLI tool for maintainers and contributors.

## Project Structure

```
src/
├── git/               # Git operations layer
│   ├── types.ts       # Type definitions
│   ├── operations.ts  # Git command wrappers
│   └── parser.ts      # Parse git output
├── stack/             # Stack detection & visualization
│   ├── types.ts       # Stack type definitions
│   ├── detector.ts    # Detect branch relationships
│   ├── visualizer.ts  # Generate tree visualizations
│   └── colors.ts      # Color management
├── config/            # Configuration management
│   ├── schema.ts      # Config schema & validation
│   └── manager.ts     # Read/write config
├── commands/          # CLI commands
│   ├── list.ts        # List worktrees
│   ├── add.ts         # Add worktree
│   ├── remove.ts      # Remove worktree
│   ├── prune.ts       # Prune worktrees
│   └── stack.ts       # Stack visualization
├── cli.ts             # CLI routing & help
└── index.ts           # Entry point
```

## Module Overview

### Git Operations (`src/git/`)

Low-level git command execution and parsing.

**Key classes:**
- `GitOperations`: Wrapper for git commands
- `GitParser`: Parse porcelain output into structured data

**Key functions:**
- `exec()`: Run git commands with error handling
- `listWorktrees()`: Get all worktrees
- `addWorktree()`: Create new worktree
- `getBranchParent()`: Get parent from config

### Stack Detection (`src/stack/`)

Detects and visualizes branch relationships.

**Key classes:**
- `StackDetector`: Build parent-child graph
- `StackVisualizer`: Generate tree output
- `ColorManager`: Assign colors to stacks

**Detection strategy:**
1. Check git config for explicit `branch.<name>.parent`
2. Check `.worktree-config.json` for overrides
3. Fallback to merge-base heuristics
4. Group branches into stacks by root

### Configuration (`src/config/`)

Manages configuration from multiple sources.

**Priority order:**
1. `.worktree-config.json` (highest)
2. Git config `branch.*.parent`
3. Auto-detection (lowest)

### Commands (`src/commands/`)

Each command is independent and follows this pattern:

```typescript
export async function commandName(
  args: Args,
  options: Options
): Promise<void> {
  // 1. Validate inputs
  // 2. Show spinner during operations
  // 3. Confirm destructive actions
  // 4. Execute operation
  // 5. Display results
}
```

### CLI Router (`src/cli.ts`)

Parses arguments and routes to appropriate command handler.

## Data Flow

### List Command Flow

```
CLI → ListCommand
  → StackDetector.getAllBranches()
  → StackDetector.getAllWorktrees()
  → StackDetector.detectStacks()
    → buildRelationships()
      → ConfigManager.getBranchParent()
      → detectParentBranch() [merge-base]
    → groupIntoStacks()
  → StackVisualizer.visualizeStacks()
  → Console output
```

### Add Command Flow

```
CLI → AddCommand
  → GitOperations.branchExists()
  → GitOperations.remoteBranchExists()
  → Clack.confirm()
  → GitOperations.addWorktree()
  → Success message
```

## Stack Detection Algorithm

### 1. Build Relationships

For each branch:
1. Try to get parent from config
2. If no config, try merge-base detection
3. Find merge-base with each potential parent
4. Select parent with closest merge-base

### 2. Group into Stacks

1. Find all root branches (no parent)
2. BFS from each root to collect children
3. Assign consistent colors to each stack

### 3. Visualization

1. Build node tree with depth info
2. Recursive traversal with tree characters
3. Color-code by stack
4. Highlight current branch

## Color Assignment

Colors are assigned using consistent hashing:

```typescript
hash = simpleHash(branchName)
colorIndex = hash % availableColors.length
```

This ensures the same branch always gets the same color.

## Extension Points

### Adding New Commands

1. Create `src/commands/newcommand.ts`
2. Export async function with standard signature
3. Add case to `src/cli.ts` router
4. Add help text to `src/cli.ts`

### Custom Stack Detection

Extend `StackDetector.detectParentBranch()` with custom logic:

```typescript
private async detectParentBranch(
  branch: string,
  allBranches: Branch[]
): Promise<string | null> {
  // Custom detection logic here
}
```

### Custom Visualizations

Create new methods in `StackVisualizer`:

```typescript
visualizeCustomFormat(
  stacks: Map<string, Stack>,
  options: Options
): string[] {
  // Custom visualization logic
}
```

## Testing Strategy

### Unit Tests

Test parsers and utilities:

```bash
bun test src/git/parser.test.ts
```

### Integration Tests

Test with actual git repositories:

```bash
# Create test repo
git init test-repo
cd test-repo
git commit --allow-empty -m "init"

# Run commands
worktree add test
```

### Manual Testing

Use the dev script for quick testing:

```bash
bun run dev -- list --tree
```

## Dependencies

- **@clack/prompts**: Interactive CLI prompts
- **picocolors**: Terminal colors
- **bun**: Runtime and bundler

## Build & Deploy

### Development

```bash
bun run dev -- <command>
```

### Production Build

```bash
bun run build
```

### Global Installation

```bash
bun link
```

## Future Enhancements

Planned features:

1. **Stack Management**
   - `worktree stack restack` - Interactive rebase
   - `worktree stack move` - Reorganize branches

2. **Worktree Switching**
   - `worktree switch` - Interactive worktree selector
   
3. **Cleanup**
   - `worktree clean` - Clean merged branches
   
4. **Shell Completion**
   - Bash/Zsh completion scripts

5. **Config Init**
   - `worktree init` - Initialize config with defaults

