import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { actualsOverrideService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Validation schemas
const createActualsOverrideSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
  totalIncome: z.number().min(0, 'Total income must be non-negative'),
  totalExpenses: z.number().min(0, 'Total expenses must be non-negative'),
  notes: z.string().optional(),
});

// All routes require authentication
router.use(authMiddleware);

// GET /api/actuals-overrides - Get all overrides for user
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const result = await actualsOverrideService.getOverrides(userId);
    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, overrides: result.overrides || [] });
  } catch (error) {
    console.error('Error fetching actuals overrides:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch actuals overrides' });
  }
});

// GET /api/actuals-overrides/:month - Get override for specific month
router.get('/:month', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const { month } = req.params;

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ success: false, error: 'Month must be in YYYY-MM format' });
      return;
    }

    const result = await actualsOverrideService.getOverride(userId, month);

    if (!result.success || !result.override) {
      res.status(404).json({ success: false, error: result.error || 'Override not found' });
      return;
    }

    res.json({ success: true, override: result.override });
  } catch (error) {
    console.error('Error fetching actuals override:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch actuals override' });
  }
});

// POST /api/actuals-overrides - Create or update override
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    // Validate request body
    const validation = createActualsOverrideSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: validation.error.issues.map((e: { message: string }) => e.message).join(', ')
      });
      return;
    }

    const { month, totalIncome, totalExpenses, notes } = validation.data;

    const result = await actualsOverrideService.createOrUpdateOverride(userId, {
      month,
      totalIncome,
      totalExpenses,
      notes,
    });

    if (!result.success || !result.override) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.status(201).json({ success: true, override: result.override });
  } catch (error) {
    console.error('Error creating/updating actuals override:', error);
    res.status(500).json({ success: false, error: 'Failed to save actuals override' });
  }
});

// DELETE /api/actuals-overrides/:id - Delete override by ID
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const { id } = req.params;

    const result = await actualsOverrideService.deleteOverride(userId, id);

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error || 'Override not found' });
      return;
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting actuals override:', error);
    res.status(500).json({ success: false, error: 'Failed to delete actuals override' });
  }
});

// GET /api/actuals-overrides/range/:startMonth/:endMonth - Get overrides in date range
router.get('/range/:startMonth/:endMonth', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const { startMonth, endMonth } = req.params;

    // Validate month formats
    if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) {
      res.status(400).json({ success: false, error: 'Months must be in YYYY-MM format' });
      return;
    }

    const result = await actualsOverrideService.getOverridesForRange(userId, startMonth, endMonth);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, overrides: result.overrides || [] });
  } catch (error) {
    console.error('Error fetching actuals overrides in range:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch actuals overrides' });
  }
});

export default router;
