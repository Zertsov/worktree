#!/usr/bin/env bun

/**
 * Worktree CLI - Entry point
 */

import { runCLI } from './cli.js';

// Get command line arguments (skip first two: bun and script path)
const args = process.argv.slice(2);

// Run the CLI
runCLI(args).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

