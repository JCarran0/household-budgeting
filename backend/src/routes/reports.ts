/**
 * Reporting Routes
 */

import { Router, Request, Response } from 'express';
import { reportService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { z } from 'zod';

const router = Router();

// Extended Request with user
interface AuthRequest extends Request {
  user?: { userId: string; username: string };
}

// Input validation schemas
const spendingTrendsSchema = z.object({
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  endMonth: z.string().regex(/^\d{4}-\d{2}$/),
  categoryIds: z.array(z.string()).optional(),
});

const categoryBreakdownSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  includeSubcategories: z.boolean().optional(),
});

const cashFlowSchema = z.object({
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  endMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

const projectionsSchema = z.object({
  monthsToProject: z.number().min(1).max(12).optional(),
});

/**
 * GET /api/v1/reports/spending-trends
 * Get spending trends by category over time
 */
router.get('/spending-trends', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const validation = spendingTrendsSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid parameters',
        details: validation.error.format(),
      });
      return;
    }

    const { startMonth, endMonth, categoryIds } = validation.data;

    const result = await reportService.getSpendingTrends(
      req.user.userId,
      startMonth,
      endMonth,
      categoryIds
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      trends: result.trends,
    });
  } catch (error) {
    console.error('Error getting spending trends:', error);
    res.status(500).json({ success: false, error: 'Failed to get spending trends' });
  }
});

/**
 * GET /api/v1/reports/category-breakdown
 * Get category breakdown for a period
 */
router.get('/category-breakdown', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const validation = categoryBreakdownSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid parameters',
        details: validation.error.format(),
      });
      return;
    }

    const { startDate, endDate, includeSubcategories = true } = validation.data;

    const result = await reportService.getCategoryBreakdown(
      req.user.userId,
      startDate,
      endDate,
      includeSubcategories
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      breakdown: result.breakdown,
      total: result.total,
    });
  } catch (error) {
    console.error('Error getting category breakdown:', error);
    res.status(500).json({ success: false, error: 'Failed to get category breakdown' });
  }
});

/**
 * GET /api/v1/reports/cash-flow
 * Get cash flow summary
 */
router.get('/cash-flow', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const validation = cashFlowSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid parameters',
        details: validation.error.format(),
      });
      return;
    }

    const { startMonth, endMonth } = validation.data;

    const result = await reportService.getCashFlowSummary(
      req.user.userId,
      startMonth,
      endMonth
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      summary: result.summary,
    });
  } catch (error) {
    console.error('Error getting cash flow summary:', error);
    res.status(500).json({ success: false, error: 'Failed to get cash flow summary' });
  }
});

/**
 * GET /api/v1/reports/projections
 * Generate cash flow projections
 */
router.get('/projections', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const validation = projectionsSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid parameters',
        details: validation.error.format(),
      });
      return;
    }

    const { monthsToProject = 6 } = validation.data;

    const result = await reportService.generateProjections(
      req.user.userId,
      monthsToProject
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      projections: result.projections,
    });
  } catch (error) {
    console.error('Error generating projections:', error);
    res.status(500).json({ success: false, error: 'Failed to generate projections' });
  }
});

/**
 * GET /api/v1/reports/year-to-date
 * Get year-to-date summary
 */
router.get('/year-to-date', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await reportService.getYearToDateSummary(req.user.userId);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      summary: result.summary,
    });
  } catch (error) {
    console.error('Error getting YTD summary:', error);
    res.status(500).json({ success: false, error: 'Failed to get YTD summary' });
  }
});

export default router;