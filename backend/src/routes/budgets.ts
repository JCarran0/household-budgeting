import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { BudgetService } from '../services/budgetService';
import { JSONDataService } from '../services/dataService';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Validation schemas
const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month format. Use YYYY-MM'),
  amount: z.number().positive('Budget amount must be positive')
});

const copyBudgetsSchema = z.object({
  fromMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month format. Use YYYY-MM'),
  toMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month format. Use YYYY-MM')
});

const budgetVsActualSchema = z.object({
  actuals: z.record(z.string(), z.number())
});

// Initialize service
const dataService = new JSONDataService();
const budgetService = new BudgetService(dataService);

// All routes require authentication
router.use(authMiddleware);

// GET /api/budgets - Get all budgets
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const budgets = await budgetService.getAllBudgets();
    res.json(budgets);
  } catch (error) {
    console.error('Error fetching budgets:', error);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// GET /api/budgets/month/:month - Get budgets for a specific month
router.get('/month/:month', async (req: Request, res: Response): Promise<void> => {
  try {
    const { month } = req.params;
    const budgets = await budgetService.getMonthlyBudgets(month);
    const total = await budgetService.getTotalMonthlyBudget(month);
    
    res.json({
      month,
      budgets,
      total
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid month format')) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Error fetching monthly budgets:', error);
    res.status(500).json({ error: 'Failed to fetch monthly budgets' });
  }
});

// GET /api/budgets/category/:categoryId - Get all budgets for a category
router.get('/category/:categoryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId } = req.params;
    const budgets = await budgetService.getBudgetsByCategory(categoryId);
    res.json(budgets);
  } catch (error) {
    console.error('Error fetching category budgets:', error);
    res.status(500).json({ error: 'Failed to fetch category budgets' });
  }
});

// GET /api/budgets/category/:categoryId/month/:month - Get specific budget
router.get('/category/:categoryId/month/:month', async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId, month } = req.params;
    const budget = await budgetService.getBudget(categoryId, month);
    
    if (!budget) {
      return res.status(404).json({ error: 'Budget not found' });
    }
    
    res.json(budget);
  } catch (error) {
    console.error('Error fetching budget:', error);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

// POST /api/budgets - Create or update a budget
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = createBudgetSchema.parse(req.body);
    const budget = await budgetService.createOrUpdateBudget(validatedData);
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
    console.error('Error creating budget:', error);
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

// POST /api/budgets/copy - Copy budgets from one month to another
router.post('/copy', async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = copyBudgetsSchema.parse(req.body);
    const copiedBudgets = await budgetService.copyBudgets(
      validatedData.fromMonth,
      validatedData.toMonth
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
    console.error('Error copying budgets:', error);
    res.status(500).json({ error: 'Failed to copy budgets' });
  }
});

// GET /api/budgets/comparison/:month - Get budget vs actual for a month
router.post('/comparison/:month', async (req: Request, res: Response): Promise<void> => {
  try {
    const { month } = req.params;
    const validatedData = budgetVsActualSchema.parse(req.body);
    
    const actuals = new Map(Object.entries(validatedData.actuals));
    const comparisons = await budgetService.getMonthlyBudgetVsActual(month, actuals);
    
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
    console.error('Error calculating budget comparison:', error);
    res.status(500).json({ error: 'Failed to calculate budget comparison' });
  }
});

// GET /api/budgets/history/:categoryId - Get budget history for a category
router.get('/history/:categoryId', async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const { startMonth, endMonth } = req.query;
    
    if (!startMonth || !endMonth) {
      return res.status(400).json({ error: 'startMonth and endMonth query parameters are required' });
    }
    
    const history = await budgetService.getCategoryBudgetHistory(
      categoryId,
      startMonth as string,
      endMonth as string
    );
    
    const average = await budgetService.getAverageBudget(
      categoryId,
      startMonth as string,
      endMonth as string
    );
    
    res.json({
      categoryId,
      startMonth,
      endMonth,
      history,
      average,
      count: history.length
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid month format')) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Error fetching budget history:', error);
    res.status(500).json({ error: 'Failed to fetch budget history' });
  }
});

// DELETE /api/budgets/:id - Delete a specific budget
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await budgetService.deleteBudget(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting budget:', error);
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

// DELETE /api/budgets/category/:categoryId - Delete all budgets for a category
router.delete('/category/:categoryId', async (req: Request, res: Response) => {
  try {
    await budgetService.deleteBudgetsByCategory(req.params.categoryId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting category budgets:', error);
    res.status(500).json({ error: 'Failed to delete category budgets' });
  }
});

// POST /api/budgets/rollover - Calculate and apply rollover
router.post('/rollover', async (req: Request, res: Response) => {
  try {
    const { categoryId, fromMonth, toMonth, actualSpent } = req.body;
    
    if (!categoryId || !fromMonth || !toMonth || actualSpent === undefined) {
      return res.status(400).json({ 
        error: 'categoryId, fromMonth, toMonth, and actualSpent are required' 
      });
    }
    
    // Calculate rollover from previous month
    const rollover = await budgetService.calculateRollover(categoryId, fromMonth, actualSpent);
    
    if (rollover > 0) {
      // Apply rollover to next month
      const updatedBudget = await budgetService.applyRollover(categoryId, toMonth, rollover);
      
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
      return res.status(404).json({ error: error.message });
    }
    console.error('Error applying rollover:', error);
    res.status(500).json({ error: 'Failed to apply rollover' });
  }
});

export default router;