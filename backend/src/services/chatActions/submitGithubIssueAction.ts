/**
 * submit_github_issue Chat Action
 *
 * Migrated from the bespoke issue_confirmation path onto the generic chat
 * action-card registry per AI-CHAT-ACTIONS-BRD D-15. The LLM proposes the
 * action via propose_action; the user confirms through the same nonce-based
 * flow as every other action card. The fetch to the GitHub API now lives
 * inside the action handler rather than a dedicated chatbotService method.
 *
 * SECURITY (SEC-A001, SEC-A002): Handler receives userId and familyId from
 * ChatActionHandlerContext (populated from JWT), never from LLM output or
 * request body. The GITHUB_ISSUES_PAT is read from env at registration time.
 *
 * SECURITY (SEC-A003, SEC-A004): params re-validated via Zod schema before
 * the GitHub API call fires.
 */

import { z } from 'zod';
import { registerChatAction } from './registry';
import { config } from '../../config';
import type { GitHubIssueDraft } from '../../shared/types';

const githubIssueSchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().min(1).max(65536),
  labels: z.array(z.enum(['bug', 'enhancement'])).min(1),
}) satisfies z.ZodType<GitHubIssueDraft>;

const GITHUB_REPO = 'JCarran0/household-budgeting';

registerChatAction<GitHubIssueDraft>({
  actionId: 'submit_github_issue',
  label: 'Report an issue',
  paramsSchema: githubIssueSchema,
  async execute(params) {
    const pat = config.ai.githubIssuesPat;
    if (!pat) {
      throw new Error('GITHUB_ISSUES_PAT not configured');
    }

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: params.title,
          body: params.body,
          labels: params.labels,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as { html_url: string; number: number };

    return {
      type: 'github_issue',
      id: String(data.number),
      url: data.html_url,
      label: params.title,
    };
  },
});
