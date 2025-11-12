# Worktree CLI

A modern CLI tool for managing git worktrees with stack visualization, inspired by Graphite CLI.

## Features

- Enhanced worktree management with beautiful UI
- Stack visualization showing branch relationships
- Color-coordinated display for multiple stacks
- Interactive prompts for safe operations
- Branch parent-child relationship tracking
- GitHub PR creation for stacks

## Installation

### Via Homebrew (Recommended)

```bash
# Add the tap
brew tap Zertsov/worktree

# Install worktree
brew install worktree

# Or install in one command
brew install Zertsov/worktree/worktree
```

### From Source

Requires [Bun](https://bun.sh) to be installed.

```bash
git clone https://github.com/Zertsov/worktree.git
cd wt
bun install
bun run build:prod

# Add to your PATH or create a symlink
ln -s $(pwd)/dist/worktree /usr/local/bin/worktree
```

### From Release Binary

Download the latest release for your platform from the [releases page](https://github.com/YOUR_USERNAME/wt/releases):

```bash
# Example for macOS ARM64
curl -LO https://github.com/Zertsov/wt/releases/latest/download/worktree-VERSION-macos-arm64.tar.gz
tar -xzf worktree-VERSION-macos-arm64.tar.gz
chmod +x worktree-macos-arm64
sudo mv worktree-macos-arm64 /usr/local/bin/worktree
```

### Releases
A binary is also available on the releases page. Download and add it to your PATH.

## Usage

```bash
worktree list           # Show all worktrees with stack info
worktree add <branch>   # Add a new worktree
worktree remove <path>  # Remove a worktree
worktree prune          # Clean up stale worktree references
worktree stack          # Display full stack visualization
worktree pr             # Create GitHub PRs for stack branches
```

## GitHub PR Integration

The `worktree pr` command allows you to create pull requests for branches in your stack.

### Setup

To use the PR feature, you need a GitHub Personal Access Token (PAT) with the following permissions:

1. **Pull Requests** (Read and write)
2. **Contents** (Read-only)

#### Creating a GitHub PAT:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Under "Repository access", select "All repositories":
4. Add the following permissions for repositories:
   - `Pull requests`
     - This will automatically add Metadata - this is fine
   - `Contents`
     - Without this, the PR creation will fail validation
5. Generate and copy the token
6. The CLI will use the token via:
   - GitHub CLI (`gh`) if authenticated
   - `GITHUB_TOKEN` or `GH_TOKEN` environment variable
   - Interactive prompt if neither is available

### Usage

```bash
# Interactive mode - select branches and customize PRs
worktree pr

# Headless mode - auto-create PRs for current branch + descendants
worktree pr -y

# With custom title template
worktree pr -y -t "feat: {branch}"

# With description
worktree pr -y -d "Auto-generated PR from stack"
```

## Development

```bash
bun install
bun run dev -- list
```

