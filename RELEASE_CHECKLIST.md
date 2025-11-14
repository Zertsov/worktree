# Release Checklist

Quick reference for creating a new release.

## Prerequisites

- [ ] All changes committed and pushed to main
- [ ] Tests passing (if any)
- [ ] CHANGELOG updated with new version

## Release Steps

### 1. Update Version

```bash
# Edit package.json and update the version field
vim package.json

# Commit the version bump
git add package.json
git commit -m "chore: bump version to v0.X.Y"
git push
```

### 2. Create and Push Tag

```bash
# Create annotated tag
git tag -a v0.X.Y -m "Release v0.X.Y"

# Push tag (this triggers GitHub Actions)
git push origin v0.X.Y
```

### 3. Monitor GitHub Actions

- Go to: https://github.com/YOUR_USERNAME/wt/actions
- Watch the release workflow complete
- Verify all 3 binaries are built (macOS ARM64, macOS x64, Linux x64)

### 4. Download SHA256 Checksums

```bash
# Navigate to releases
cd ~/Downloads

# Download checksums
VERSION="0.X.Y"
curl -LO "https://github.com/YOUR_USERNAME/wt/releases/download/v${VERSION}/worktree-${VERSION}-macos-arm64.tar.gz.sha256"
curl -LO "https://github.com/YOUR_USERNAME/wt/releases/download/v${VERSION}/worktree-${VERSION}-macos-x64.tar.gz.sha256"
curl -LO "https://github.com/YOUR_USERNAME/wt/releases/download/v${VERSION}/worktree-${VERSION}-linux-x64.tar.gz.sha256"

# Extract just the hash (first column)
ARM64_SHA=$(cat worktree-${VERSION}-macos-arm64.tar.gz.sha256 | awk '{print $1}')
X64_SHA=$(cat worktree-${VERSION}-macos-x64.tar.gz.sha256 | awk '{print $1}')
LINUX_SHA=$(cat worktree-${VERSION}-linux-x64.tar.gz.sha256 | awk '{print $1}')

echo "macOS ARM64: $ARM64_SHA"
echo "macOS x64: $X64_SHA"
echo "Linux x64: $LINUX_SHA"
```

### 5. Update Homebrew Formula

```bash
# Navigate to your tap repository
cd ~/path/to/homebrew-worktree

# Update Formula/worktree.rb
vim Formula/worktree.rb

# Update these fields:
# - version = "0.X.Y"
# - ARM64 sha256
# - x64 sha256
# - Linux sha256

# Commit and push
git add Formula/worktree.rb
git commit -m "feat: update worktree to v0.X.Y"
git push
```

### 6. Test Installation

```bash
# Uninstall previous version
brew uninstall worktree

# Update tap
brew update

# Reinstall
brew install worktree

# Verify version
worktree --version  # or test with: worktree --help

# Test basic functionality
cd ~/some-git-repo
worktree list
worktree stack
```

### 7. Announce

- [ ] Update GitHub release notes with changelog
- [ ] Tweet/post about the release (optional)
- [ ] Update any documentation sites

## Troubleshooting

### Build Failed
- Check GitHub Actions logs
- Verify Bun version compatibility
- Ensure all dependencies are in package.json

### Formula Installation Failed
- Run `brew audit --strict Formula/worktree.rb`
- Verify SHA256 checksums match
- Check URL accessibility
- Test on a clean machine

### Binary Not Working
- Verify architecture: `file $(which worktree)`
- Check permissions: `ls -la $(which worktree)`
- Try running directly: `/usr/local/bin/worktree --help`

## Rollback

If something goes wrong:

```bash
# Delete the GitHub release
gh release delete v0.X.Y

# Delete the tag
git tag -d v0.X.Y
git push origin :refs/tags/v0.X.Y

# Revert Homebrew formula
cd ~/path/to/homebrew-worktree
git revert HEAD
git push
```

