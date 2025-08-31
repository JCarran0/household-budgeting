/**
 * Auto-Categorization Routes
 */

import { Router, Request, Response } from 'express';
import { AutoCategorizeService } from '../services/autoCategorizeService';
import { dataService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { z } from 'zod';

const router = Router();
const autoCategorizeService = new AutoCategorizeService(dataService);

// Extended Request with user
interface AuthRequest extends Request {
  user?: { userId: string; username: string };
}

// Input validation schemas
const createRuleSchema = z.object({
  description: z.string().min(1).max(200),
  pattern: z.string().min(1).max(100),
  categoryId: z.string().min(1),
  categoryName: z.string().optional(),
  userDescription: z.string().max(200).optional(),
  isActive: z.boolean().optional(),
});

const updateRuleSchema = z.object({
  description: z.string().min(1).max(200).optional(),
  pattern: z.string().min(1).max(100).optional(),
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
router.get('/rules', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const rules = await autoCategorizeService.getRules(req.user.userId);
    res.json({ success: true, rules });
  } catch (error) {
    console.error('Error fetching auto-categorize rules:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch rules' });
  }
});

/**
 * POST /api/v1/autocategorize/rules
 * Create a new auto-categorization rule
 */
router.post('/rules', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

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
      req.user.userId,
      validation.data
    );

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, rule: result.rule });
  } catch (error) {
    console.error('Error creating auto-categorize rule:', error);
    res.status(500).json({ success: false, error: 'Failed to create rule' });
  }
});

/**
 * PUT /api/v1/autocategorize/rules/:ruleId
 * Update an existing rule
 */
router.put('/rules/:ruleId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

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
      req.user.userId,
      ruleId,
      validation.data
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating auto-categorize rule:', error);
    res.status(500).json({ success: false, error: 'Failed to update rule' });
  }
});

/**
 * DELETE /api/v1/autocategorize/rules/:ruleId
 * Delete a rule
 */
router.delete('/rules/:ruleId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { ruleId } = req.params;
    const result = await autoCategorizeService.deleteRule(
      req.user.userId,
      ruleId
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting auto-categorize rule:', error);
    res.status(500).json({ success: false, error: 'Failed to delete rule' });
  }
});

/**
 * PUT /api/v1/autocategorize/rules/reorder
 * Reorder rules by priority
 */
router.put('/rules/reorder', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

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
      req.user.userId,
      validation.data.ruleIds
    );

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering auto-categorize rules:', error);
    res.status(500).json({ success: false, error: 'Failed to reorder rules' });
  }
});

/**
 * PUT /api/v1/autocategorize/rules/:ruleId/move-up
 * Move a rule up in priority
 */
router.put('/rules/:ruleId/move-up', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { ruleId } = req.params;
    const result = await autoCategorizeService.moveRuleUp(
      req.user.userId,
      ruleId
    );

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error moving rule up:', error);
    res.status(500).json({ success: false, error: 'Failed to move rule' });
  }
});

/**
 * PUT /api/v1/autocategorize/rules/:ruleId/move-down
 * Move a rule down in priority
 */
router.put('/rules/:ruleId/move-down', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { ruleId } = req.params;
    const result = await autoCategorizeService.moveRuleDown(
      req.user.userId,
      ruleId
    );

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error moving rule down:', error);
    res.status(500).json({ success: false, error: 'Failed to move rule' });
  }
});

/**
 * POST /api/v1/autocategorize/apply
 * Apply auto-categorization rules to all uncategorized transactions
 */
router.post('/apply', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await autoCategorizeService.applyRulesToAllTransactions(req.user.userId);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({ 
      success: true, 
      categorized: result.categorized,
      total: result.total,
      message: `Categorized ${result.categorized} of ${result.total} transactions`
    });
  } catch (error) {
    console.error('Error applying auto-categorization:', error);
    res.status(500).json({ success: false, error: 'Failed to apply rules' });
  }
});

export default router;