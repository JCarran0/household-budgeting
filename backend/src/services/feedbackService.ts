import { Octokit } from '@octokit/rest';
import type {
  FeedbackSubmission,
  FeedbackResponse,
  ApplicationState
} from '../../../shared/types';

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

export class FeedbackService {
  private octokit: Octokit;
  private config: GitHubConfig;

  constructor() {
    // Get configuration from environment variables
    this.config = {
      token: process.env.GITHUB_TOKEN || '',
      owner: process.env.GITHUB_OWNER || 'JCarran0',
      repo: process.env.GITHUB_REPO || 'household-budgeting',
    };

    if (!this.config.token) {
      console.warn('GITHUB_TOKEN not provided. Feedback submission will fail.');
    }

    this.octokit = new Octokit({
      auth: this.config.token,
    });
  }

  /**
   * Submit feedback by creating a GitHub issue
   */
  async submitFeedback(feedback: FeedbackSubmission): Promise<FeedbackResponse> {
    try {
      if (!this.config.token) {
        throw new Error('GitHub integration not configured. Please contact support.');
      }

      // Format the issue based on feedback type
      const { title, body, labels } = this.formatIssue(feedback);

      // Create the issue
      const response = await this.octokit.rest.issues.create({
        owner: this.config.owner,
        repo: this.config.repo,
        title,
        body,
        labels,
      });

      return {
        success: true,
        issueUrl: response.data.html_url,
      };
    } catch (error) {
      console.error('Failed to create GitHub issue:', error);

      return {
        success: false,
        error: error instanceof Error
          ? `Failed to submit feedback: ${error.message}`
          : 'Failed to submit feedback to GitHub',
      };
    }
  }

  /**
   * Format the feedback into GitHub issue format
   */
  private formatIssue(feedback: FeedbackSubmission): {
    title: string;
    body: string;
    labels: string[];
  } {
    const prefix = feedback.type === 'bug' ? '[BUG]' : '[FEATURE]';
    const title = `${prefix} ${feedback.title}`;
    const labels = feedback.type === 'bug' ? ['bug'] : ['enhancement'];

    let body = '';

    if (feedback.type === 'bug') {
      body = this.formatBugReport(feedback);
    } else {
      body = this.formatFeatureRequest(feedback);
    }

    // Add contact info if provided
    if (feedback.email) {
      body += `\n\n---\n**Contact:** ${feedback.email}`;
    }

    body += `\n\n---\n*Submitted via application feedback form*`;

    return { title, body, labels };
  }

  /**
   * Format bug report with application state
   */
  private formatBugReport(feedback: FeedbackSubmission): string {
    let body = `## Bug Report\n\n`;
    body += `${feedback.description}\n\n`;

    // Add application state if available
    if (feedback.applicationState) {
      body += `<details>\n<summary>Application State (Click to expand)</summary>\n\n`;
      body += this.formatApplicationState(feedback.applicationState);
      body += `\n</details>\n`;
    }

    return body;
  }

  /**
   * Format feature request
   */
  private formatFeatureRequest(feedback: FeedbackSubmission): string {
    let body = `## Feature Request\n\n`;
    body += `${feedback.description}\n\n`;

    return body;
  }

  /**
   * Format application state for inclusion in bug reports
   */
  private formatApplicationState(state: ApplicationState): string {
    let stateInfo = `### Application Context\n\n`;
    stateInfo += `**Page/Route:** \`${state.route}\`\n`;
    stateInfo += `**Timestamp:** ${new Date(state.timestamp).toLocaleString()}\n`;
    stateInfo += `**User:** ${state.username}\n`;
    stateInfo += `**Window Size:** ${state.windowSize.width} × ${state.windowSize.height}\n`;

    if (state.searchParams && state.searchParams.length > 0) {
      stateInfo += `**URL Parameters:** \`${state.searchParams}\`\n`;
    }

    if (state.filters && Object.keys(state.filters).length > 0) {
      stateInfo += `\n**Active Filters:**\n`;
      stateInfo += '```json\n';
      stateInfo += JSON.stringify(state.filters, null, 2);
      stateInfo += '\n```\n';
    }

    // Add browser info (truncated for readability)
    const userAgent = state.userAgent;
    const browserInfo = this.extractBrowserInfo(userAgent);
    stateInfo += `\n**Browser:** ${browserInfo}\n`;

    return stateInfo;
  }

  /**
   * Extract readable browser information from user agent
   */
  private extractBrowserInfo(userAgent: string): string {
    // Extract key browser info
    if (userAgent.includes('Chrome')) {
      const chromeMatch = userAgent.match(/Chrome\/([0-9.]+)/);
      const version = chromeMatch ? chromeMatch[1] : 'Unknown';
      return `Chrome ${version}`;
    } else if (userAgent.includes('Firefox')) {
      const firefoxMatch = userAgent.match(/Firefox\/([0-9.]+)/);
      const version = firefoxMatch ? firefoxMatch[1] : 'Unknown';
      return `Firefox ${version}`;
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      const safariMatch = userAgent.match(/Safari\/([0-9.]+)/);
      const version = safariMatch ? safariMatch[1] : 'Unknown';
      return `Safari ${version}`;
    } else if (userAgent.includes('Edge')) {
      const edgeMatch = userAgent.match(/Edge\/([0-9.]+)/);
      const version = edgeMatch ? edgeMatch[1] : 'Unknown';
      return `Edge ${version}`;
    } else {
      // Fallback to first 100 characters of user agent
      return userAgent.substring(0, 100) + (userAgent.length > 100 ? '...' : '');
    }
  }

  /**
   * Test the GitHub API connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.config.token) {
        throw new Error('GitHub token not configured');
      }

      // Test by getting repository info
      await this.octokit.rest.repos.get({
        owner: this.config.owner,
        repo: this.config.repo,
      });

      return { success: true };
    } catch (error) {
      console.error('GitHub API test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const feedbackService = new FeedbackService();