import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { budgetService, categoryService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { getHiddenCategoryIds } from '../shared/utils/budgetCalculations';
import { AuthorizationError } from '../errors';

const router = Router();

// Validation schemas
const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month format. Use YYYY-MM'),
  amount: z.number().min(0, 'Budget amount must not be negative')
});

const copyBudgetsSchema = z.object({
  fromMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month format. Use YYYY-MM'),
  toMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month format. Use YYYY-MM')
});

const budgetVsActualSchema = z.object({
  actuals: z.record(z.string(), z.number())
});

const batchUpdateBudgetsSchema = z.object({
  updates: z.array(createBudgetSchema)
});

// All routes require authentication
router.use(authMiddleware);

// GET /api/budgets - Get all budgets
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const budgets = await budgetService.getAllBudgets(userId);
    res.json(budgets);
  } catch (error) {
    next(error);
  }
});

// GET /api/budgets/available-months - Get distinct months with budgets
router.get('/available-months', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const months = await budgetService.getDistinctBudgetMonths(userId);
    res.json(months);
  } catch (error) {
    next(error);
  }
});

// GET /api/budgets/month/:month - Get budgets for a specific month
router.get('/month/:month', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const { month } = req.params;
    const budgets = await budgetService.getMonthlyBudgets(month, userId);
    const totals = await budgetService.getMonthlyBudgetTotals(month, userId);

    res.json({
      month,
      budgets,
      total: totals.total,  // Keep backward compatibility
      totals              // New breakdown structure
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid month format')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

// GET /api/budgets/category/:categoryId - Get all budgets for a category
router.get('/category/:categoryId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const { categoryId } = req.params;
    const budgets = await budgetService.getBudgetsByCategory(categoryId, userId);
    res.json(budgets);
  } catch (error) {
    next(error);
  }
});

// GET /api/budgets/category/:categoryId/month/:month - Get specific budget
router.get('/category/:categoryId/month/:month', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const { categoryId, month } = req.params;
    const budget = await budgetService.getBudget(categoryId, month, userId);

    if (!budget) {
      res.status(404).json({ error: 'Budget not found' });
      return;
    }

    res.json(budget);
  } catch (error) {
    next(error);
  }
});

// POST /api/budgets - Create or update a budget
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const validatedData = createBudgetSchema.parse(req.body);
    const budget = await budgetService.createOrUpdateBudget(validatedData, userId);
    res.status(201).json(budget);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error &&
        (error.message.includes('Invalid month format') ||
         error.message.includes('must be positive'))) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

// POST /api/budgets/copy - Copy budgets from one month to another
router.post('/copy', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const validatedData = copyBudgetsSchema.parse(req.body);
    const copiedBudgets = await budgetService.copyBudgets(
      validatedData.fromMonth,
      validatedData.toMonth,
      userId
    );

    res.json({
      message: `Copied ${copiedBudgets.length} budgets from ${validatedData.fromMonth} to ${validatedData.toMonth}`,
      budgets: copiedBudgets
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error && error.message.includes('Invalid month format')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

// GET /api/budgets/comparison/:month - Get budget vs actual for a month
router.post('/comparison/:month', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const { month } = req.params;
    const validatedData = budgetVsActualSchema.parse(req.body);

    // Fetch categories and use shared utility to identify hidden ones
    const categories = await categoryService.getAllCategories(userId);
    const hiddenCategoryIds = getHiddenCategoryIds(categories);

    const actuals = new Map(Object.entries(validatedData.actuals));
    const comparisons = await budgetService.getMonthlyBudgetVsActual(month, actuals, userId, hiddenCategoryIds);

    // Calculate totals
    const totals = comparisons.reduce((acc, comp) => ({
      budgeted: acc.budgeted + comp.budgeted,
      actual: acc.actual + comp.actual,
      remaining: acc.remaining + comp.remaining
    }), { budgeted: 0, actual: 0, remaining: 0 });

    res.json({
      month,
      comparisons,
      totals: {
        ...totals,
        percentUsed: totals.budgeted > 0 ? Math.round((totals.actual / totals.budgeted) * 100) : 0,
        isOverBudget: totals.actual > totals.budgeted
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    next(error);
  }
});

// GET /api/budgets/history/:categoryId - Get budget history for a category
router.get('/history/:categoryId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const { categoryId } = req.params;
    const { startMonth, endMonth } = req.query;

    if (!startMonth || !endMonth) {
      res.status(400).json({ error: 'startMonth and endMonth query parameters are required' });
      return;
    }

    const history = await budgetService.getCategoryBudgetHistory(
      categoryId,
      startMonth as string,
      endMonth as string,
      userId
    );

    const average = await budgetService.getAverageBudget(
      categoryId,
      startMonth as string,
      endMonth as string,
      userId
    );

    res.json({
      categoryId,
      startMonth,
      endMonth,
      history,
      average,
      count: history.length
    });
    return;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid month format')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

// DELETE /api/budgets/:id - Delete a specific budget
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    await budgetService.deleteBudget(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// DELETE /api/budgets/category/:categoryId - Delete all budgets for a category
router.delete('/category/:categoryId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    await budgetService.deleteBudgetsByCategory(req.params.categoryId, userId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// POST /api/budgets/rollover - Calculate and apply rollover
router.post('/rollover', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const { categoryId, fromMonth, toMonth, actualSpent } = req.body;

    if (!categoryId || !fromMonth || !toMonth || actualSpent === undefined) {
      res.status(400).json({
        error: 'categoryId, fromMonth, toMonth, and actualSpent are required'
      });
      return;
    }

    // Calculate rollover from previous month
    const rollover = await budgetService.calculateRollover(categoryId, fromMonth, actualSpent, userId);

    if (rollover > 0) {
      // Apply rollover to next month
      const updatedBudget = await budgetService.applyRollover(categoryId, toMonth, rollover, userId);

      res.json({
        categoryId,
        fromMonth,
        toMonth,
        rolloverAmount: rollover,
        updatedBudget
      });
    } else {
      res.json({
        categoryId,
        fromMonth,
        toMonth,
        rolloverAmount: 0,
        message: 'No rollover available (category was overspent or has no budget)'
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Budget not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

// GET /api/budgets/year/:year - Get all budgets for a specific year
router.get('/year/:year', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();

    const year = parseInt(req.params.year, 10);
    if (isNaN(year)) {
      res.status(400).json({ error: 'Invalid year format. Year must be a number' });
      return;
    }

    const budgets = await budgetService.getYearlyBudgets(year, userId);

    res.json({
      year,
      budgets,
      count: budgets.length
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid year')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

// POST /api/budgets/batch - Batch update multiple budgets
router.post('/batch', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();

    const validatedData = batchUpdateBudgetsSchema.parse(req.body);
    const updatedBudgets = await budgetService.batchUpdateBudgets(validatedData.updates, userId);

    res.json({
      message: `Successfully updated ${updatedBudgets.length} budgets`,
      budgets: updatedBudgets,
      count: updatedBudgets.length
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error &&
        (error.message.includes('Invalid month format') ||
         error.message.includes('cannot be negative'))) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

export default router;