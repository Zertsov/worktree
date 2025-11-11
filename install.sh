#!/bin/bash
# Installation script for Worktree CLI

set -e

echo "🔧 Installing Worktree CLI..."
echo ""

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install Bun first:"
    echo "   curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Build the project
echo "🔨 Building project..."
bun run build

# Make executable
echo "🔑 Making executable..."
chmod +x dist/index.js

echo ""
echo "✅ Installation complete!"
echo ""
echo "To use globally, run:"
echo "   bun link"
echo ""
echo "Or add an alias to your shell config:"
echo "   alias worktree='$(pwd)/dist/index.js'"
echo ""
echo "Or run directly:"
echo "   $(pwd)/dist/index.js --help"
echo ""
echo "Quick test:"
echo "   bun run dev -- --help"
echo ""

