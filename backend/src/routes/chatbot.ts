/**
 * Chatbot API Routes
 *
 * POST /message                — Send a chat message (text-only JSON or multipart with attachment)
 * GET  /usage                  — Get current monthly cost usage
 * POST /classify-transactions  — AI bulk categorization
 * POST /suggest-rules          — Suggest auto-categorization rules
 * POST /actions/confirm        — Confirm a pending chat action card
 *                                (GitHub-issue submission now flows through this
 *                                 path via the submit_github_issue action; D-15)
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
import { rateLimitChatbot } from '../middleware/rateLimit';
import { chatbotService, categorizationService, familyService } from '../services';
import { childLogger } from '../utils/logger';

const log = childLogger('chatbot');
import {
  uploadChatAttachment,
  validateAttachmentMagicBytes,
  enforcePdfPageLimit,
  countPdfPages,
} from '../middleware/chatAttachmentUpload';
import { getChatAction, consumeProposal, executeChatAction } from '../services/chatActions';
import { logAuditSuccess, logAuditRejection } from '../services/chatActions/auditLog';
import { chatRequestSchema, classifyTransactionsSchema, suggestRulesSchema } from '../validators/chatbotValidators';
import type {
  ChatRequest,
  ActionConfirmErrorCode,
  ActionResource,
  ActionRowResult,
  ChatActionId,
} from '../shared/types';
import type { ChatAttachmentMimeType } from '../middleware/chatAttachmentUpload';

const router = Router();

// Per-user rate limiting for chatbot (SEC-016): 5 requests per minute,
// persisted across restarts via the shared rate-limit store (TD-005).
// Applies to text chat, attachment uploads (SEC-A015), and action confirms.

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


/**
 * REQ-P016 / BRD §3.3, §11 — the Business Workspace is excluded from AI
 * entirely, reads included. It holds Amazon royalties held in trust for a
 * client; that money is not the family's, and a chatbot that can read it is a
 * fiduciary problem, not a privacy preference.
 *
 * Enforced here rather than by hiding the chat button: the JWT carries the
 * active familyId, so a token minted in the business workspace must be refused
 * at the route no matter what the client renders. Mirrors
 * requireBusinessWorkspace in routes/businessStatements.ts, inverted.
 */
async function refuseBusinessWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const family = await familyService.getFamily(familyId);
    if (family?.workspaceType === 'business') {
      log.warn({ familyId }, 'AI request refused in business workspace (REQ-P016)');
      res.status(403).json({
        success: false,
        error: 'Helper Bot is not available in the business workspace.',
        code: 'AI_NOT_AVAILABLE_IN_WORKSPACE',
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

router.post(
  '/message',
  authenticate,
  refuseBusinessWorkspace,
  rateLimitChatbot,
  conditionalAttachmentUpload,
  validateBody(chatRequestSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId, userId } = req.user!;
      const chatRequest = req.body as ChatRequest;

      // Require either text or an attachment (empty text is allowed when
      // the user sends only an attachment; both empty is nonsense).
      if (chatRequest.message.trim().length === 0 && !req.file) {
        res.status(400).json({
          success: false,
          error: 'Message or attachment is required',
        });
        return;
      }

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
        log.info(
          {
            event: 'chat_attachment_received',
            userId,
            familyId,
            mimeType: attachment.mimeType,
            sizeBytes: req.file.size,
            pageCount,
          },
          'chat attachment received',
        );
      }

      res.json({ success: true, ...response });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// GET /usage — Get current monthly cost usage for this workspace
// =============================================================================
router.get(
  '/usage',
  authenticate,
  refuseBusinessWorkspace,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      // familyId scopes the usage bucket — each workspace has its own cap (REQ-007 / D11).
      const usage = await chatbotService.getUsage(familyId);
      res.json({ success: true, ...usage });
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
  refuseBusinessWorkspace,
  rateLimitChatbot,
  validateBody(classifyTransactionsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const { transactionIds } = req.body as { transactionIds?: string[] };

      log.info({ familyId }, 'classify-transactions: starting');
      const result = await categorizationService.classifyTransactions(familyId, transactionIds);
      log.info({ familyId, totalClassified: result.totalClassified, buckets: result.buckets.length }, 'classify-transactions: done');

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
  refuseBusinessWorkspace,
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

// REQ-P021: `rows` is the plan-card form — the user's checked rows, each with
// its (possibly edited) params. `confirmedParams` is the single-row shorthand,
// kept for existing callers; it is refused on a multi-row card, where "which
// row did you mean?" has no safe default.
const confirmActionSchema = z
  .object({
    proposalId: z.string().uuid('proposalId must be a UUID'),
    rows: z
      .array(
        z.object({
          rowId: z.string().min(1),
          params: z.record(z.string(), z.unknown()),
        }),
      )
      .optional(),
    confirmedParams: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(b => b.rows !== undefined || b.confirmedParams !== undefined, {
    message: 'Provide either rows or confirmedParams',
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
  refuseBusinessWorkspace,
  rateLimitChatbot,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.user!;

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
          traceId: null, // nonce unresolved — no trace to correlate with
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

      const { stored, grants } = consumed;
      const proposalRows = stored.proposal.rows;

      // ---- Resolve which rows the user actually checked (REQ-P021) ----
      let selection: Array<{ rowId: string; params: Record<string, unknown> }>;
      if (body.rows !== undefined) {
        selection = body.rows;
      } else if (proposalRows.length === 1) {
        selection = [{ rowId: proposalRows[0].rowId, params: body.confirmedParams! }];
      } else {
        selection = [];
      }

      const rejectBatch = (
        statusCode: number,
        errorCode: ActionConfirmErrorCode,
        message: string,
        failedRowId?: string,
      ): void => {
        logAuditRejection({
          traceId: stored.traceId,
          userId,
          actionId: failedRowId
            ? proposalRows.find(r => r.rowId === failedRowId)?.actionId ?? 'unknown'
            : 'unknown',
          proposalId: body.proposalId,
          errorCode,
          ...(errorCode === 'validation_failed' ? { validationError: message } : {}),
        });
        res.status(statusCode).json({
          success: false,
          error: message,
          errorCode,
          ...(failedRowId ? { failedRowId } : {}),
        });
      };

      if (selection.length === 0) {
        rejectBatch(
          400,
          'validation_failed',
          proposalRows.length === 1
            ? 'Nothing was selected to confirm.'
            : 'Select at least one row, or send `rows` explicitly for a multi-row proposal.',
        );
        return;
      }

      // ---- Validate EVERY checked row before executing ANY of them ----
      //
      // REQ-P023 asks for all-or-nothing. Validating the whole batch up front is
      // the part that is achievable without undo: a row the server would reject
      // stops the batch before a single write lands. What it does NOT cover is a
      // storage failure partway through execution, which can still leave the
      // earlier rows applied. That gap closes in Phase 4, when confirmed batches
      // produce a durable undo handle (REQ-P025). Until then the failure is
      // reported with the row that failed rather than silently swallowed.
      const plan: Array<{
        rowId: string;
        actionId: ChatActionId;
        def: NonNullable<ReturnType<typeof getChatAction>>;
        params: unknown;
        grant: NonNullable<ReturnType<typeof grants.get>>;
      }> = [];
      const seenRowIds = new Set<string>();

      for (const checked of selection) {
        const row = proposalRows.find(r => r.rowId === checked.rowId);
        if (!row) {
          rejectBatch(400, 'validation_failed', `Unknown row: ${checked.rowId}`);
          return;
        }
        if (seenRowIds.has(checked.rowId)) {
          // A duplicated rowId would execute the same row twice under one
          // confirmation the user read once.
          rejectBatch(400, 'validation_failed', `Duplicate row: ${checked.rowId}`, checked.rowId);
          return;
        }
        seenRowIds.add(checked.rowId);

        // Verify action is still in registry (guards against hot-reload / config drift)
        const actionDef = getChatAction(row.actionId);
        if (!actionDef) {
          rejectBatch(400, 'action_not_allowed', humanReadableError('action_not_allowed'), row.rowId);
          return;
        }

        // SEC-A004 / REQ-P024: every row re-validated independently. A row the
        // user edited is validated as edited.
        const paramsResult = actionDef.paramsSchema.safeParse(checked.params);
        if (!paramsResult.success) {
          rejectBatch(400, 'validation_failed', paramsResult.error.message, row.rowId);
          return;
        }

        const grant = grants.get(row.rowId);
        if (!grant) {
          rejectBatch(400, 'action_not_allowed', humanReadableError('action_not_allowed'), row.rowId);
          return;
        }

        plan.push({ rowId: row.rowId, actionId: row.actionId, def: actionDef, params: paramsResult.data, grant });
      }

      // ---- Resolve identifiers against live data (SEC-P030) ----
      // A SEPARATE PASS, deliberately. Every row has parsed; none has written.
      // Folding this into the execute loop below would let row 1 write before
      // row 3's bad categoryId was discovered, which is the partial-application
      // state REQ-P023 exists to prevent. Folding it into the parse loop above
      // would be equivalent today but couples "is it well-formed" to "does it
      // exist", and only the second needs data access.
      for (const step of plan) {
        try {
          await step.def.validateSemantics?.(step.params, {
            userId: step.grant.userId,
            familyId: step.grant.familyId,
          });
        } catch (semanticError) {
          const message =
            semanticError instanceof Error ? semanticError.message : 'Could not resolve a referenced record';
          log.warn(
            { proposalId: body.proposalId, rowId: step.rowId, actionId: step.actionId },
            'chat action batch rejected by semantic validation',
          );
          rejectBatch(400, 'validation_failed', message, step.rowId);
          return;
        }
      }

      // ---- Execute, in the order the rows were displayed (REQ-P022) ----
      const results: ActionRowResult[] = [];
      for (const step of plan) {
        let resource: ActionResource;
        try {
          // Execute through the platform, which verifies the grant against the
          // action's tier before the handler runs (REQ-P002). Identity comes
          // from the grant, which came from the JWT (SEC-A001, SEC-A002).
          resource = await executeChatAction(step.def, step.params, step.grant);
        } catch (execError) {
          log.error(
            { err: execError, proposalId: body.proposalId, rowId: step.rowId, applied: results.length },
            'chat action batch failed mid-execution',
          );
          rejectBatch(
            500,
            'internal_error',
            results.length === 0
              ? 'This change could not be applied. Nothing was saved.'
              : `Stopped after applying ${results.length} of ${plan.length} changes. ` +
                `The rest were not applied.`,
            step.rowId,
          );
          return;
        }

        logAuditSuccess({
          traceId: stored.traceId,
          userId,
          // The grant's familyId, not the JWT's. They differ if the user
          // switched workspaces between proposal and confirm, and the write
          // goes where the GRANT says — an audit entry naming the other one
          // would misdirect exactly the investigation it exists for.
          familyId: step.grant.familyId,
          actionId: step.actionId,
          proposalId: body.proposalId,
          confirmedParams: step.params as Record<string, unknown>,
          resource,
        });

        results.push({ rowId: step.rowId, actionId: step.actionId, resource });
      }

      // `resource` is the first result, so single-row callers read the response
      // exactly as they did before plan cards existed.
      res.json({ success: true, results, resource: results[0].resource });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
