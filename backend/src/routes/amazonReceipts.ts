/**
 * Amazon Receipt Matching API Routes
 *
 * POST   /upload              — Upload 1–2 Amazon receipts (PDF or photo), parse via Claude vision
 * POST   /:sessionId/match    — Match parsed orders against bank transactions
 * POST   /:sessionId/resolve-ambiguous — Manually resolve ambiguous matches
 * POST   /:sessionId/categorize — Get category & split recommendations
 * POST   /:sessionId/apply    — Apply approved categorizations and splits
 * POST   /:sessionId/suggest-rules — Suggest auto-categorization rules
 * GET    /sessions            — List user's receipt matching sessions
 * DELETE /:sessionId          — Delete a session
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, validateBody } from '../middleware/authMiddleware';
import { uploadPdfs, validatePdfMagicBytes, handleMulterError, type SupportedUploadMimeType } from '../middleware/pdfUpload';
import { ValidationError } from '../errors';
import {
  resolveAmbiguousSchema,
  categorizeRequestSchema,
  applyActionsSchema,
} from '../validators/amazonReceiptValidators';

const router = Router();

// =============================================================================
// Per-user rate limiting (separate limits by endpoint cost)
// =============================================================================

function createRateLimiter(maxRequests: number, windowMs: number) {
  const limits = new Map<string, { count: number; resetTime: Date }>();

  return (req: Request, res: Response, next: NextFunction): void => {
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
    const entry = limits.get(userId);

    if (entry) {
      if (now > entry.resetTime) {
        limits.set(userId, { count: 1, resetTime: new Date(now.getTime() + windowMs) });
      } else if (entry.count >= maxRequests) {
        res.status(429).json({
          success: false,
          error: 'Too many requests. Please wait before trying again.',
        });
        return;
      } else {
        entry.count++;
      }
    } else {
      limits.set(userId, { count: 1, resetTime: new Date(now.getTime() + windowMs) });
    }

    next();
  };
}

// Upload is expensive (Claude vision) — tight limit
const rateLimitUpload = createRateLimiter(3, 60_000);
// Categorize calls Claude — moderate limit
const rateLimitCategorize = createRateLimiter(5, 60_000);
// Match/apply/rules/delete — lighter limit
const rateLimitStandard = createRateLimiter(10, 60_000);

// =============================================================================
// POST /upload — Upload and parse Amazon PDFs
// =============================================================================
router.post(
  '/upload',
  authenticate,
  rateLimitUpload,
  // Multer middleware — handles multipart parsing, file size, MIME check
  (req: Request, res: Response, next: NextFunction) => {
    uploadPdfs(req, res, (err?: unknown) => {
      if (err) {
        handleMulterError(err as Error, req, res, next);
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        throw new ValidationError('At least one file is required (PDF or photo).');
      }

      // SEC-007: Validate actual file content (magic bytes), not just MIME
      validatePdfMagicBytes(files);

      // Lazy-import service to avoid circular dependency at module load time.
      // The service singleton is created in services/index.ts after all
      // dependencies are wired up.
      const { amazonReceiptService } = await import('../services');

      const result = await amazonReceiptService.parseAndCreateSession(
        familyId,
        files.map(f => ({ buffer: f.buffer, mimeType: f.mimetype as SupportedUploadMimeType })),
      );

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// POST /:sessionId/match — Match parsed orders against transactions
// =============================================================================
router.post(
  '/:sessionId/match',
  authenticate,
  rateLimitStandard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const { sessionId } = req.params;
      const { amazonReceiptService } = await import('../services');

      const result = await amazonReceiptService.matchOrders(familyId, sessionId);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// POST /:sessionId/resolve-ambiguous — Manually resolve ambiguous matches
// =============================================================================
router.post(
  '/:sessionId/resolve-ambiguous',
  authenticate,
  rateLimitStandard,
  validateBody(resolveAmbiguousSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const { sessionId } = req.params;
      const { resolutions } = req.body;
      const { amazonReceiptService } = await import('../services');

      await amazonReceiptService.resolveAmbiguous(familyId, sessionId, resolutions);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// POST /:sessionId/categorize — Get category & split recommendations
// =============================================================================
router.post(
  '/:sessionId/categorize',
  authenticate,
  rateLimitCategorize,
  validateBody(categorizeRequestSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const { sessionId } = req.params;
      const { matchIds } = req.body;
      const { amazonReceiptService } = await import('../services');

      const result = await amazonReceiptService.categorizeMatches(familyId, sessionId, matchIds);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// POST /:sessionId/apply — Apply approved categorizations and splits
// =============================================================================
router.post(
  '/:sessionId/apply',
  authenticate,
  rateLimitStandard,
  validateBody(applyActionsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const { sessionId } = req.params;
      const { actions } = req.body;
      const { amazonReceiptService } = await import('../services');

      const result = await amazonReceiptService.applyActions(familyId, sessionId, actions);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// POST /:sessionId/suggest-rules — Suggest auto-categorization rules
// =============================================================================
router.post(
  '/:sessionId/suggest-rules',
  authenticate,
  rateLimitStandard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const { sessionId } = req.params;
      const { amazonReceiptService } = await import('../services');

      const result = await amazonReceiptService.suggestRules(familyId, sessionId);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// GET /sessions — List user's receipt matching sessions
// =============================================================================
router.get(
  '/sessions',
  authenticate,
  rateLimitStandard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const { amazonReceiptService } = await import('../services');

      const sessions = await amazonReceiptService.getSessions(familyId);
      res.json({ success: true, sessions });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// DELETE /sessions/all — Delete all sessions (must be before :sessionId route)
// =============================================================================
router.delete(
  '/sessions/all',
  authenticate,
  rateLimitStandard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const { amazonReceiptService } = await import('../services');

      const result = await amazonReceiptService.deleteAllSessions(familyId);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// DELETE /:sessionId — Delete a session
// =============================================================================
router.delete(
  '/:sessionId',
  authenticate,
  rateLimitStandard,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const { sessionId } = req.params;
      const { amazonReceiptService } = await import('../services');

      await amazonReceiptService.deleteSession(familyId, sessionId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
