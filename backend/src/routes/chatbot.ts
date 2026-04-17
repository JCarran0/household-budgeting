/**
 * Chatbot API Routes
 *
 * POST /message                — Send a chat message (text-only JSON or multipart with attachment)
 * GET  /usage                  — Get current monthly cost usage
 * POST /confirm-issue          — Execute a GitHub issue after user confirmation (D13)
 * POST /classify-transactions  — AI bulk categorization
 * POST /suggest-rules          — Suggest auto-categorization rules
 * POST /actions/confirm        — Confirm a pending chat action card (NEW)
 *
 * SECURITY: This endpoint accepts multipart uploads for attachments.
 * Auth MUST come from the Authorization header (JWT), not cookies.
 * If auth ever moves to cookies, add CSRF token validation before
 * allowing multipart POSTs. (SEC-A013, SEC-A015)
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, validateBody } from '../middleware/authMiddleware';
import { chatbotService, categorizationService } from '../services';
import {
  uploadChatAttachment,
  validateAttachmentMagicBytes,
  enforcePdfPageLimit,
  countPdfPages,
} from '../middleware/chatAttachmentUpload';
import { getChatAction, consumeProposal } from '../services/chatActions';
import { logAuditSuccess, logAuditRejection } from '../services/chatActions/auditLog';
import { chatRequestSchema, confirmIssueSchema, classifyTransactionsSchema, suggestRulesSchema } from '../validators/chatbotValidators';
import type { ChatRequest, GitHubIssueDraft } from '../shared/types';
import type { ChatAttachmentMimeType } from '../middleware/chatAttachmentUpload';

const router = Router();

// =============================================================================
// Per-user rate limiting for chatbot (SEC-016): 5 requests per minute
// Applies to both text chat and attachment uploads (SEC-A015).
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
//
// Dual-mode: Content-Type: application/json (text-only, unchanged) OR
//            Content-Type: multipart/form-data (text + optional attachment)
//
// SECURITY (SEC-A020): Cost-cap check happens inside chatbotService.chat()
//   BEFORE the Claude call — if cap is reached, uploads are rejected without
//   incurring LLM tokens.
// =============================================================================

/** Conditional attachment middleware — only runs for multipart requests */
const conditionalAttachmentUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('multipart/form-data')) {
    next();
    return;
  }

  // Multipart path: run multer, then validate
  uploadChatAttachment(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        res.status(400).json({
          success: false,
          error:
            err.code === 'LIMIT_FILE_SIZE'
              ? 'File too large (max 10 MB)'
              : `Upload error: ${err.message}`,
        });
        return;
      }
      res.status(400).json({ success: false, error: err.message });
      return;
    }

    if (req.file) {
      try {
        validateAttachmentMagicBytes(req.file);
        enforcePdfPageLimit(req.file);
      } catch (e) {
        res.status(400).json({
          success: false,
          error: e instanceof Error ? e.message : 'Invalid file',
        });
        return;
      }
    }

    // Parse JSON-encoded fields from multipart form
    try {
      if (typeof req.body.conversationHistory === 'string') {
        req.body.conversationHistory = JSON.parse(req.body.conversationHistory) as unknown;
      }
      if (typeof req.body.pageContext === 'string') {
        req.body.pageContext = JSON.parse(req.body.pageContext) as unknown;
      }
    } catch {
      res.status(400).json({ success: false, error: 'Invalid JSON fields in form data' });
      return;
    }

    next();
  });
};

router.post(
  '/message',
  authenticate,
  rateLimitChatbot,
  conditionalAttachmentUpload,
  validateBody(chatRequestSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId, userId } = req.user!;
      const chatRequest = req.body as ChatRequest;

      // Build attachment object if a file was uploaded
      let attachment: { buffer: Buffer; mimeType: ChatAttachmentMimeType; filename: string } | undefined;
      if (req.file) {
        attachment = {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype as ChatAttachmentMimeType,
          filename: req.file.originalname,
        };
      }

      const response = await chatbotService.chat(familyId, chatRequest, userId, attachment);

      // Observability logging for attachment requests (REQ-023, SEC-A016)
      // SECURITY: Only metadata logged — never attachment content
      if (req.file && attachment) {
        const pageCount = countPdfPages(req.file);
        console.log(JSON.stringify({
          event: 'chat_attachment_received',
          timestamp: new Date().toISOString(),
          userId,
          familyId,
          mimeType: attachment.mimeType,
          sizeBytes: req.file.size,
          pageCount,
        }));
      }

      res.json({ success: true, ...response });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// GET /usage — Get current monthly cost usage
// =============================================================================
router.get(
  '/usage',
  authenticate,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const usage = await chatbotService.getUsage();
      res.json({ success: true, ...usage });
    } catch (error) {
      next(error);
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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { draft } = req.body as { draft: GitHubIssueDraft };

      const result = await chatbotService.submitGitHubIssue(draft);

      res.status(201).json({ success: true, issueUrl: result.issueUrl });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// POST /classify-transactions — AI bulk categorization
// =============================================================================
router.post(
  '/classify-transactions',
  authenticate,
  rateLimitChatbot,
  validateBody(classifyTransactionsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const { transactionIds } = req.body as { transactionIds?: string[] };

      console.log(`[Chatbot] classify-transactions: starting for family ${familyId}`);
      const result = await categorizationService.classifyTransactions(familyId, transactionIds);
      console.log(`[Chatbot] classify-transactions: done, ${result.totalClassified} classified, ${result.buckets.length} buckets`);

      res.json({ success: true, ...result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Classification failed';
      if (msg.includes('budget cap')) {
        res.status(429).json({ success: false, error: msg });
        return;
      }
      next(error);
    }
  },
);

// =============================================================================
// POST /suggest-rules — Suggest auto-categorization rules
// =============================================================================
router.post(
  '/suggest-rules',
  authenticate,
  validateBody(suggestRulesSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const { categorizations } = req.body as { categorizations: { transactionId: string; categoryId: string }[] };

      const result = await categorizationService.suggestRules(familyId, categorizations);

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// POST /actions/confirm — Confirm a pending chat action card
//
// This is the ONLY path that executes an action. The LLM never reaches this.
//
// SECURITY (SEC-A001): Identity from JWT only — never from request body.
// SECURITY (SEC-A004): confirmedParams re-validated by Zod schema on confirm.
// SECURITY (SEC-A005): Nonce is single-use; second attempt returns 409.
// SECURITY (SEC-A017, SEC-A018): All outcomes (success and rejection) are
//   structured-log audited.
// =============================================================================

const confirmActionSchema = z.object({
  proposalId: z.string().uuid('proposalId must be a UUID'),
  confirmedParams: z.record(z.string(), z.unknown()),
});

function humanReadableError(errorCode: string): string {
  switch (errorCode) {
    case 'nonce_not_found':  return 'Proposal not found or already expired.';
    case 'nonce_expired':    return 'This proposal has expired. Ask me again to create a new one.';
    case 'nonce_already_used': return 'This proposal was already confirmed or superseded.';
    case 'validation_failed': return 'The action parameters are invalid.';
    case 'action_not_allowed': return 'This action is no longer available.';
    default: return 'An unexpected error occurred.';
  }
}

router.post(
  '/actions/confirm',
  authenticate,
  rateLimitChatbot,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, familyId } = req.user!;

      // Validate request body
      const bodyResult = confirmActionSchema.safeParse(req.body);
      if (!bodyResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request',
          details: bodyResult.error.format(),
        });
        return;
      }
      const body = bodyResult.data;

      // Consume nonce (ownership check + expiry + replay prevention)
      const consumed = consumeProposal({ nonce: body.proposalId, userId });
      if (!consumed.ok) {
        logAuditRejection({
          userId,
          actionId: 'unknown',
          proposalId: body.proposalId,
          errorCode: consumed.errorCode,
        });
        const statusCode =
          consumed.errorCode === 'nonce_not_found'    ? 404 :
          consumed.errorCode === 'nonce_expired'      ? 410 :
          consumed.errorCode === 'nonce_already_used' ? 409 : 400;

        res.status(statusCode).json({
          success: false,
          error: humanReadableError(consumed.errorCode),
          errorCode: consumed.errorCode,
        });
        return;
      }

      const { stored } = consumed;
      const actionId = stored.proposal.actionId;

      // Verify action is still in registry (guards against hot-reload / config drift)
      const actionDef = getChatAction(actionId);
      if (!actionDef) {
        logAuditRejection({
          userId,
          actionId,
          proposalId: body.proposalId,
          errorCode: 'action_not_allowed',
        });
        res.status(400).json({
          success: false,
          error: humanReadableError('action_not_allowed'),
          errorCode: 'action_not_allowed',
        });
        return;
      }

      // SEC-A004: Re-validate confirmedParams (may differ from original if user used Edit)
      const paramsResult = actionDef.paramsSchema.safeParse(body.confirmedParams);
      if (!paramsResult.success) {
        logAuditRejection({
          userId,
          actionId,
          proposalId: body.proposalId,
          errorCode: 'validation_failed',
          validationError: paramsResult.error.message,
        });
        res.status(400).json({
          success: false,
          error: paramsResult.error.message,
          errorCode: 'validation_failed',
        });
        return;
      }

      // Execute the action with the authenticated user's identity (SEC-A001)
      const resource = await actionDef.execute(paramsResult.data, { userId, familyId });

      logAuditSuccess({
        userId,
        familyId,
        actionId,
        proposalId: body.proposalId,
        confirmedParams: paramsResult.data,
        resource,
      });

      res.json({ success: true, resource });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
