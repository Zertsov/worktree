/**
 * GitHub API types
 */

export interface GitHubRepo {
  owner: string;
  repo: string;
  host: string; // e.g., "github.com" or GitHub Enterprise host
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
  state: 'open' | 'closed';
  draft: boolean;
}

export interface CreatePRRequest {
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

export interface GitHubAuth {
  token: string;
  source: 'gh-cli' | 'env' | 'prompt';
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

