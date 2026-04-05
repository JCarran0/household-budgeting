/**
 * Chatbot API Routes
 *
 * POST /message       — Send a chat message, get Claude's response
 * GET  /usage         — Get current monthly cost usage
 * POST /confirm-issue — Execute a GitHub issue after user confirmation (D13)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, validateBody } from '../middleware/authMiddleware';
import { chatbotService } from '../services';
import { chatRequestSchema, confirmIssueSchema } from '../validators/chatbotValidators';
import type { ChatRequest, GitHubIssueDraft } from '../shared/types';

const router = Router();

// =============================================================================
// Per-user rate limiting for chatbot (SEC-016): 5 requests per minute
// =============================================================================
const CHATBOT_MAX_REQUESTS = 5;
const CHATBOT_WINDOW_MS = 60_000;
const chatbotRateLimits = new Map<string, { count: number; resetTime: Date }>();

const rateLimitChatbot = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }

  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const now = new Date();
  const entry = chatbotRateLimits.get(userId);

  if (entry) {
    if (now > entry.resetTime) {
      chatbotRateLimits.set(userId, { count: 1, resetTime: new Date(now.getTime() + CHATBOT_WINDOW_MS) });
    } else if (entry.count >= CHATBOT_MAX_REQUESTS) {
      res.status(429).json({
        success: false,
        error: 'Slow down! You can send up to 5 messages per minute.',
      });
      return;
    } else {
      entry.count++;
    }
  } else {
    chatbotRateLimits.set(userId, { count: 1, resetTime: new Date(now.getTime() + CHATBOT_WINDOW_MS) });
  }

  next();
};

// =============================================================================
// POST /message — Send a chat message
// =============================================================================
router.post(
  '/message',
  authenticate,
  rateLimitChatbot,
  validateBody(chatRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const chatRequest = req.body as ChatRequest;

      const response = await chatbotService.chat(userId, chatRequest);

      res.json({ success: true, ...response });
    } catch (error) {
      console.error('[Chatbot] POST /message error:', error instanceof Error ? error.message : error);
      res.status(500).json({
        success: false,
        error: 'Failed to process chat message',
      });
    }
  },
);

// =============================================================================
// GET /usage — Get current monthly cost usage
// =============================================================================
router.get(
  '/usage',
  authenticate,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const usage = await chatbotService.getUsage();
      res.json({ success: true, ...usage });
    } catch (error) {
      console.error('[Chatbot] GET /usage error:', error instanceof Error ? error.message : error);
      res.status(500).json({
        success: false,
        error: 'Failed to get usage data',
      });
    }
  },
);

// =============================================================================
// POST /confirm-issue — Execute GitHub issue after user confirmation (D13)
// This is the ONLY path to the GitHub API. The LLM cannot reach this.
// =============================================================================
router.post(
  '/confirm-issue',
  authenticate,
  validateBody(confirmIssueSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { draft } = req.body as { draft: GitHubIssueDraft };

      const result = await chatbotService.submitGitHubIssue(draft);

      res.status(201).json({ success: true, issueUrl: result.issueUrl });
    } catch (error) {
      console.error('[Chatbot] POST /confirm-issue error:', error instanceof Error ? error.message : error);
      res.status(500).json({
        success: false,
        error: 'Failed to create GitHub issue',
      });
    }
  },
);

export default router;
