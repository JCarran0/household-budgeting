/**
 * Reporting Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { reportService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';
import { z } from 'zod';

const router = Router();

// Extended Request with user
interface AuthRequest extends Request {
  user?: { userId: string; username: string; familyId: string };
}

// Input validation schemas
const spendingTrendsSchema = z.object({
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  endMonth: z.string().regex(/^\d{4}-\d{2}$/),
  categoryIds: z.union([z.array(z.string()), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return [val];
    return val;
  }),
});

const categoryBreakdownSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  includeSubcategories: z.union([z.boolean(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return val === 'true';
    return val;
  }),
});

const cashFlowSchema = z.object({
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  endMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

const projectionsSchema = z.object({
  monthsToProject: z.union([z.number(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return parseInt(val);
    return val;
  }),
});

/**
 * GET /api/v1/reports/spending-trends
 * Get spending trends by category over time
 */
router.get('/spending-trends', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

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
      req.user.familyId,
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
    next(error);
  }
});

/**
 * GET /api/v1/reports/category-breakdown
 * Get category breakdown for a period
 */
router.get('/category-breakdown', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

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
      req.user.familyId,
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
    next(error);
  }
});

/**
 * GET /api/v1/reports/cash-flow
 * Get cash flow summary
 */
router.get('/cash-flow', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

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
      req.user.familyId,
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
    next(error);
  }
});

/**
 * GET /api/v1/reports/projections
 * Generate cash flow projections
 */
router.get('/projections', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

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

    const result = await reportService.generateCashFlowProjections(
      req.user.familyId,
      monthsToProject
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      projections: result.projections,
      hasPriorYearData: result.hasPriorYearData,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/reports/income-breakdown
 * Get income category breakdown for a period
 */
router.get('/income-breakdown', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

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

    const result = await reportService.getIncomeCategoryBreakdown(
      req.user.familyId,
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
    next(error);
  }
});

/**
 * GET /api/v1/reports/savings-breakdown
 * Get savings category breakdown for a period
 */
router.get('/savings-breakdown', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = categoryBreakdownSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid parameters',
        details: validation.error.format(),
      });
      return;
    }

    const { startDate, endDate } = validation.data;

    const result = await reportService.getSavingsCategoryBreakdown(
      req.user.familyId,
      startDate,
      endDate
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
    next(error);
  }
});

/**
 * GET /api/v1/reports/year-to-date
 * Get year-to-date summary
 */
router.get('/year-to-date', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const result = await reportService.getYearToDateSummary(req.user.familyId);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      summary: result.summary,
    });
  } catch (error) {
    next(error);
  }
});

export default router;