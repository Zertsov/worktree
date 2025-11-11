/**
 * Types for stack detection and visualization
 */

import type { Branch, Worktree } from '../git/types.js';

export interface StackNode {
  branch: string;
  parent: string | null;
  children: string[];
  worktree: Worktree | null;
  color: string;
  depth: number;
  commit?: string; // Commit hash this branch points to
}

export interface Stack {
  root: string;
  branches: string[];
  color: string;
  nodes: Map<string, StackNode>;
}

export interface BranchRelationship {
  branch: string;
  parent: string | null;
  children: string[];
}

