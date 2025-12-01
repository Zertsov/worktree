/**
 * GitHub API client for PR operations using neverthrow Result types
 */

import { spawn } from 'bun';
import { Result, ok, err } from 'neverthrow';
import * as clack from '@clack/prompts';
import { GitOperations } from '../git/operations.js';
import type {
  GitHubRepo,
  GitHubPR,
  CreatePRRequest,
  GitHubAuth,
} from './types.js';
import { GitHubError } from './types.js';

export type GitHubResult<T> = Result<T, GitHubError>;

export class GitHubAPI {
  private auth: GitHubAuth | null = null;
  private repo: GitHubRepo | null = null;

  /**
   * Authenticate with GitHub
   * Try gh CLI first, then env var, then prompt
   */
  async authenticate(): Promise<GitHubResult<GitHubAuth>> {
    if (this.auth) {
      return ok(this.auth);
    }

    // Try gh CLI first
    const ghToken = await this.getGHToken();
    if (ghToken) {
      this.auth = { token: ghToken, source: 'gh-cli' };
      return ok(this.auth);
    }

    // Try environment variable
    const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (envToken) {
      this.auth = { token: envToken, source: 'env' };
      return ok(this.auth);
    }

    // Prompt user for token
    const token = await clack.text({
      message: 'GitHub Personal Access Token:',
      placeholder: 'ghp_...',
      validate: (value) => {
        if (!value) return 'Token is required';
        if (!value.startsWith('ghp_') && !value.startsWith('github_pat_')) {
          return 'Invalid token format';
        }
      },
    });

    if (clack.isCancel(token)) {
      return err(new GitHubError('Authentication cancelled'));
    }

    this.auth = { token: token as string, source: 'prompt' };
    return ok(this.auth);
  }

  /**
   * Try to get token from gh CLI
   */
  private async getGHToken(): Promise<string | null> {
    const proc = spawn({
      cmd: ['gh', 'auth', 'token'],
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 0 && stdout.trim()) {
      return stdout.trim();
    }
    return null;
  }

  /**
   * Get repository info from git remote
   */
  async getRepoInfo(cwd?: string): Promise<GitHubResult<GitHubRepo>> {
    if (this.repo) {
      return ok(this.repo);
    }

    const remoteResult = await GitOperations.execResult(
      ['config', '--get', 'remote.origin.url'],
      cwd
    );

    if (remoteResult.isErr()) {
      return err(new GitHubError('Could not get remote URL: ' + remoteResult.error.message));
    }

    const repo = this.parseGitHubUrl(remoteResult.value);
    if (!repo) {
      return err(
        new GitHubError(
          'Could not parse GitHub repository from remote URL: ' + remoteResult.value
        )
      );
    }

    this.repo = repo;
    return ok(repo);
  }

  /**
   * Parse GitHub URL to extract owner/repo
   */
  private parseGitHubUrl(url: string): GitHubRepo | null {
    // Remove trailing whitespace and .git
    url = url.trim().replace(/\.git$/, '');

    // HTTPS format: https://github.com/owner/repo
    const httpsMatch = url.match(/https?:\/\/([^\/]+)\/([^\/]+)\/([^\/]+)/);
    if (httpsMatch) {
      return {
        host: httpsMatch[1],
        owner: httpsMatch[2],
        repo: httpsMatch[3],
      };
    }

    // SSH format: git@github.com:owner/repo
    const sshMatch = url.match(/git@([^:]+):([^\/]+)\/(.+)/);
    if (sshMatch) {
      return {
        host: sshMatch[1],
        owner: sshMatch[2],
        repo: sshMatch[3],
      };
    }

    return null;
  }

  /**
   * Get GitHub API base URL
   */
  private getAPIBaseUrl(host: string): string {
    if (host === 'github.com') {
      return 'https://api.github.com';
    }
    // GitHub Enterprise
    return `https://${host}/api/v3`;
  }

  /**
   * Make authenticated API request
   */
  private async apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<GitHubResult<T>> {
    const authResult = await this.authenticate();
    if (authResult.isErr()) {
      return err(authResult.error);
    }

    const repoResult = await this.getRepoInfo();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    const auth = authResult.value;
    const repo = repoResult.value;
    const baseUrl = this.getAPIBaseUrl(repo.host);

    const url = `${baseUrl}${endpoint}`;
    const headers = {
      Authorization: `Bearer ${auth.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = `GitHub API error: ${response.status} ${response.statusText}`;

      const parseResult = Result.fromThrowable(
        () => JSON.parse(errorBody),
        () => null
      )();

      if (parseResult.isOk() && parseResult.value) {
        const errorJson = parseResult.value;
        if (errorJson.message) {
          errorMessage = errorJson.message;

          // Include detailed errors if available
          if (errorJson.errors && Array.isArray(errorJson.errors)) {
            const details = errorJson.errors
              .map((e: any) => {
                if (typeof e === 'string') return e;
                if (e.message) return e.message;
                if (e.resource && e.field)
                  return `${e.resource}.${e.field}: ${e.code || 'invalid'}`;
                return JSON.stringify(e);
              })
              .join('; ');
            errorMessage += ` (${details})`;
          }
        }
      }

      return err(new GitHubError(errorMessage, response.status, errorBody));
    }

    const data = (await response.json()) as T;
    return ok(data);
  }

  /**
   * Create a pull request
   */
  async createPR(request: CreatePRRequest): Promise<GitHubResult<GitHubPR>> {
    const repoResult = await this.getRepoInfo();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    const repo = repoResult.value;

    return this.apiRequest<GitHubPR>(
      `/repos/${repo.owner}/${repo.repo}/pulls`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: request.title,
          head: request.head,
          base: request.base,
          body: request.body || '',
          draft: request.draft || false,
        }),
      }
    );
  }

  /**
   * Get existing PR for a branch
   */
  async getPRForBranch(branch: string): Promise<GitHubPR | null> {
    const repoResult = await this.getRepoInfo();
    if (repoResult.isErr()) {
      return null;
    }

    const repo = repoResult.value;
    const prsResult = await this.apiRequest<GitHubPR[]>(
      `/repos/${repo.owner}/${repo.repo}/pulls?head=${repo.owner}:${branch}&state=open`
    );

    if (prsResult.isErr()) {
      return null;
    }

    return prsResult.value.length > 0 ? prsResult.value[0] : null;
  }

  /**
   * Check if a branch exists on remote
   */
  async remoteBranchExists(branch: string): Promise<boolean> {
    const repoResult = await this.getRepoInfo();
    if (repoResult.isErr()) {
      return false;
    }

    const repo = repoResult.value;
    const result = await this.apiRequest(
      `/repos/${repo.owner}/${repo.repo}/branches/${branch}`
    );

    return result.isOk();
  }

  /**
   * Update a PR (title, body, etc.)
   */
  async updatePR(
    prNumber: number,
    updates: { title?: string; body?: string }
  ): Promise<GitHubResult<GitHubPR>> {
    const repoResult = await this.getRepoInfo();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    const repo = repoResult.value;

    return this.apiRequest<GitHubPR>(
      `/repos/${repo.owner}/${repo.repo}/pulls/${prNumber}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
  }

  /**
   * Get all open PRs for the repository
   */
  async getAllOpenPRs(): Promise<GitHubResult<GitHubPR[]>> {
    const repoResult = await this.getRepoInfo();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    const repo = repoResult.value;

    return this.apiRequest<GitHubPR[]>(
      `/repos/${repo.owner}/${repo.repo}/pulls?state=open&per_page=100`
    );
  }
}
