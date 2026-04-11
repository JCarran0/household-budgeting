/**
 * Auto-Categorization Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AutoCategorizeService } from '../services/autoCategorizeService';
import { dataService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';
import { z } from 'zod';

const router = Router();
const autoCategorizeService = new AutoCategorizeService(dataService);

// Extended Request with user
interface AuthRequest extends Request {
  user?: { userId: string; username: string; familyId: string };
}

// Input validation schemas
const createRuleSchema = z.object({
  description: z.string().min(1).max(200),
  patterns: z.array(z.string().min(1).max(100)).min(1).max(5),
  categoryId: z.string().min(1),
  categoryName: z.string().optional(),
  userDescription: z.string().max(200).optional(),
  isActive: z.boolean().optional(),
});

const updateRuleSchema = z.object({
  description: z.string().min(1).max(200).optional(),
  patterns: z.array(z.string().min(1).max(100)).min(1).max(5).optional(),
  categoryId: z.string().min(1).optional(),
  categoryName: z.string().optional(),
  userDescription: z.string().max(200).optional(),
  isActive: z.boolean().optional(),
});

const reorderRulesSchema = z.object({
  ruleIds: z.array(z.string()).min(1),
});

/**
 * GET /api/v1/autocategorize/rules
 * Get all auto-categorization rules
 */
router.get('/rules', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const rules = await autoCategorizeService.getRules(req.user.familyId);
    res.json({ success: true, rules });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/autocategorize/rules
 * Create a new auto-categorization rule
 */
router.post('/rules', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = createRuleSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const result = await autoCategorizeService.createRule(
      req.user.familyId,
      validation.data
    );

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, rule: result.rule });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/autocategorize/rules/reorder
 * Reorder rules by priority
 * NOTE: This route must come before /rules/:ruleId to avoid being caught by the param route
 */
router.put('/rules/reorder', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = reorderRulesSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const result = await autoCategorizeService.reorderRules(
      req.user.familyId,
      validation.data.ruleIds
    );

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/autocategorize/rules/:ruleId/move-up
 * Move a rule up in priority
 */
router.put('/rules/:ruleId/move-up', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const { ruleId } = req.params;
    const result = await autoCategorizeService.moveRuleUp(
      req.user.familyId,
      ruleId
    );

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/autocategorize/rules/:ruleId/move-down
 * Move a rule down in priority
 */
router.put('/rules/:ruleId/move-down', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const { ruleId } = req.params;
    const result = await autoCategorizeService.moveRuleDown(
      req.user.familyId,
      ruleId
    );

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/autocategorize/rules/:ruleId
 * Update an existing rule
 * NOTE: This route must come after specific routes like /rules/reorder to avoid catching them
 */
router.put('/rules/:ruleId', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = updateRuleSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { ruleId } = req.params;
    const result = await autoCategorizeService.updateRule(
      req.user.familyId,
      ruleId,
      validation.data
    );

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'DUPLICATE' ? 409 : 400;
      res.status(status).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/autocategorize/rules/:ruleId
 * Delete a rule
 */
router.delete('/rules/:ruleId', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const { ruleId } = req.params;
    const result = await autoCategorizeService.deleteRule(
      req.user.familyId,
      ruleId
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/autocategorize/preview
 * Preview what would be categorized without applying changes
 */
router.post('/preview', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const { forceRecategorize = false } = req.body;
    const result = await autoCategorizeService.previewCategorization(req.user.familyId, forceRecategorize);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      wouldCategorize: result.wouldCategorize || 0,
      wouldRecategorize: result.wouldRecategorize || 0,
      total: result.total || 0,
      changes: result.changes || [],
      message: forceRecategorize
        ? `Would categorize ${result.wouldCategorize || 0} new and recategorize ${result.wouldRecategorize || 0} existing transactions`
        : `Would categorize ${result.wouldCategorize || 0} of ${result.total || 0} uncategorized transactions`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/autocategorize/apply
 * Apply auto-categorization rules to all transactions
 */
router.post('/apply', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const { forceRecategorize = false, transactionIds } = req.body;
    const result = await autoCategorizeService.applyRulesToAllTransactions(req.user.familyId, forceRecategorize, transactionIds);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      categorized: result.categorized || 0,
      recategorized: result.recategorized || 0,
      total: result.total || 0,
      message: forceRecategorize
        ? `Categorized ${result.categorized || 0} new and recategorized ${result.recategorized || 0} existing transactions`
        : `Categorized ${result.categorized || 0} of ${result.total || 0} transactions`
    });
  } catch (error) {
    next(error);
  }
});

export default router;