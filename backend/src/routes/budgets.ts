import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { budgetService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';

const router = Router();

// Validation schemas
const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month format. Use YYYY-MM'),
  amount: z.number().min(0, 'Budget amount must not be negative')
});

const batchUpdateBudgetsSchema = z.object({
  updates: z.array(createBudgetSchema)
});

// All routes require authentication
router.use(authMiddleware);

// GET /api/budgets - Get all budgets
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const budgets = await budgetService.getAllBudgets(familyId);
    res.json(budgets);
  } catch (error) {
    next(error);
  }
});

// GET /api/budgets/available-months - Get distinct months with budgets
router.get('/available-months', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const months = await budgetService.getDistinctBudgetMonths(familyId);
    res.json(months);
  } catch (error) {
    next(error);
  }
});

// GET /api/budgets/month/:month - Get budgets for a specific month
router.get('/month/:month', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const { month } = req.params;
    const budgets = await budgetService.getMonthlyBudgets(month, familyId);
    const totals = await budgetService.getMonthlyBudgetTotals(month, familyId);

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
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const { categoryId } = req.params;
    const budgets = await budgetService.getBudgetsByCategory(categoryId, familyId);
    res.json(budgets);
  } catch (error) {
    next(error);
  }
});

// GET /api/budgets/category/:categoryId/month/:month - Get specific budget
router.get('/category/:categoryId/month/:month', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const { categoryId, month } = req.params;
    const budget = await budgetService.getBudget(categoryId, month, familyId);

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
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const validatedData = createBudgetSchema.parse(req.body);
    const budget = await budgetService.createOrUpdateBudget(validatedData, familyId);
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

// GET /api/budgets/history/:categoryId - Get budget history for a category
router.get('/history/:categoryId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
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
      familyId
    );

    const average = await budgetService.getAverageBudget(
      categoryId,
      startMonth as string,
      endMonth as string,
      familyId
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
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    await budgetService.deleteBudget(req.params.id, familyId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// DELETE /api/budgets/category/:categoryId - Delete all budgets for a category
router.delete('/category/:categoryId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    await budgetService.deleteBudgetsByCategory(req.params.categoryId, familyId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// GET /api/budgets/year/:year - Get all budgets for a specific year
router.get('/year/:year', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    const year = parseInt(req.params.year, 10);
    if (isNaN(year)) {
      res.status(400).json({ error: 'Invalid year format. Year must be a number' });
      return;
    }

    const budgets = await budgetService.getYearlyBudgets(year, familyId);

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
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    const validatedData = batchUpdateBudgetsSchema.parse(req.body);
    const updatedBudgets = await budgetService.batchUpdateBudgets(validatedData.updates, familyId);

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