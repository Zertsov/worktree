/**
 * PR description formatter for stack navigation
 */

import type { StackMetadata, BranchStackMetadata } from '../stack/manager.js';
import type { GitHubPR } from './types.js';

/**
 * Stack navigation info for PR description
 */
export interface StackNavigationInfo {
  stackName: string;
  trunk: string;
  currentBranch: string;
  parent: {
    branch: string;
    prNumber?: number;
    prUrl?: string;
  } | null;
  children: Array<{
    branch: string;
    prNumber?: number;
    prUrl?: string;
  }>;
}

/**
 * Markers for identifying managed sections in PR description
 */
const STACK_SECTION_START = '<!-- worktree-stack-start -->';
const STACK_SECTION_END = '<!-- worktree-stack-end -->';

/**
 * Format stack navigation as markdown for PR description
 */
export function formatStackNavigation(info: StackNavigationInfo): string {
  const lines: string[] = [];

  lines.push(STACK_SECTION_START);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 📚 Stack');
  lines.push('');
  lines.push('| | Branch | PR |');
  lines.push('|---|--------|-----|');

  // Parent row (trunk or parent PR)
  if (info.parent) {
    const parentPrLink = info.parent.prNumber
      ? `[#${info.parent.prNumber}](${info.parent.prUrl})`
      : '—';
    const isTrunk = info.parent.branch === info.trunk;
    const icon = isTrunk ? '⬆️' : '⬆️';
    const label = isTrunk ? '(trunk)' : parentPrLink;
    lines.push(`| ${icon} | \`${info.parent.branch}\` | ${label} |`);
  }

  // Current branch row
  lines.push(`| → | **\`${info.currentBranch}\`** | **this PR** |`);

  // Children rows
  for (const child of info.children) {
    const childPrLink = child.prNumber
      ? `[#${child.prNumber}](${child.prUrl})`
      : '—';
    lines.push(`| ⬇️ | \`${child.branch}\` | ${childPrLink} |`);
  }

  lines.push('');
  lines.push(`<sub>Part of stack \`${info.stackName}\` · Managed by [worktree](https://github.com/Zertsov/worktree)</sub>`);
  lines.push('');
  lines.push(STACK_SECTION_END);

  return lines.join('\n');
}

/**
 * Add or update stack navigation in a PR description
 */
export function updatePRDescription(
  existingBody: string | undefined | null,
  navigation: StackNavigationInfo
): string {
  const body = existingBody || '';
  const navSection = formatStackNavigation(navigation);

  // Check if there's already a stack section
  const startIndex = body.indexOf(STACK_SECTION_START);
  const endIndex = body.indexOf(STACK_SECTION_END);

  if (startIndex !== -1 && endIndex !== -1) {
    // Replace existing section
    return (
      body.slice(0, startIndex) +
      navSection +
      body.slice(endIndex + STACK_SECTION_END.length)
    );
  }

  // Append new section
  if (body.trim()) {
    return body.trim() + '\n\n' + navSection;
  }

  return navSection;
}

/**
 * Remove stack navigation from a PR description
 */
export function removeStackNavigation(body: string): string {
  const startIndex = body.indexOf(STACK_SECTION_START);
  const endIndex = body.indexOf(STACK_SECTION_END);

  if (startIndex !== -1 && endIndex !== -1) {
    return (
      body.slice(0, startIndex).trim() +
      body.slice(endIndex + STACK_SECTION_END.length).trim()
    ).trim();
  }

  return body;
}

/**
 * Build navigation info from stack metadata and PR info
 */
export function buildNavigationInfo(
  stackMeta: StackMetadata,
  branches: Map<string, BranchStackMetadata>,
  currentBranch: string,
  prMap: Map<string, GitHubPR>
): StackNavigationInfo {
  const currentMeta = branches.get(currentBranch);
  const parent = currentMeta?.parent || stackMeta.trunk;

  // Find children (branches that have current as parent)
  const children: StackNavigationInfo['children'] = [];
  for (const [branch, meta] of branches) {
    if (meta.parent === currentBranch) {
      const pr = prMap.get(branch);
      children.push({
        branch,
        prNumber: pr?.number,
        prUrl: pr?.html_url,
      });
    }
  }

  // Sort children alphabetically
  children.sort((a, b) => a.branch.localeCompare(b.branch));

  const parentPr = prMap.get(parent);

  return {
    stackName: stackMeta.name,
    trunk: stackMeta.trunk,
    currentBranch,
    parent: {
      branch: parent,
      prNumber: parentPr?.number,
      prUrl: parentPr?.html_url,
    },
    children,
  };
}

