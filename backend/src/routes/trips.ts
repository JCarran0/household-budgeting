import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { tripService, categoryService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Validation schemas

const createTripSchema = z
  .object({
    name: z.string().min(1).max(100),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD'),
    totalBudget: z.number().positive().nullable().optional(),
    categoryBudgets: z
      .array(
        z.object({
          categoryId: z.string().min(1),
          amount: z.number().positive()
        })
      )
      .optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    notes: z.string().max(2000).optional()
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate']
  })
  .refine((data) => {
    const categorySum = (data.categoryBudgets ?? []).reduce((sum, cb) => sum + cb.amount, 0);
    if (categorySum === 0) return true;
    if (data.totalBudget == null) return false;
    return data.totalBudget >= categorySum;
  }, {
    message: 'Total budget is required and must be at least the sum of category budgets',
    path: ['totalBudget']
  });

const updateTripSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').optional(),
    totalBudget: z.number().positive().nullable().optional(),
    categoryBudgets: z
      .array(
        z.object({
          categoryId: z.string().min(1),
          amount: z.number().positive()
        })
      )
      .optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    notes: z.string().max(2000).optional()
  })
  .refine(
    (data) => {
      if (data.startDate !== undefined && data.endDate !== undefined) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'endDate must be on or after startDate',
      path: ['endDate']
    }
  )
  .refine((data) => {
    if (data.categoryBudgets === undefined) return true;
    const categorySum = data.categoryBudgets.reduce((sum, cb) => sum + cb.amount, 0);
    if (categorySum === 0) return true;
    if (data.totalBudget === undefined) return true; // not updating totalBudget in this request
    if (data.totalBudget == null) return false;
    return data.totalBudget >= categorySum;
  }, {
    message: 'Total budget is required and must be at least the sum of category budgets',
    path: ['totalBudget']
  });

// All routes require authentication
router.use(authMiddleware);

// POST /api/v1/trips - Create trip
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const validatedData = createTripSchema.parse(req.body);
    const trip = await tripService.createTrip(validatedData, userId);
    res.status(201).json(trip);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error && error.message === 'A trip with this tag already exists') {
      res.status(409).json({ error: error.message });
      return;
    }
    console.error('Error creating trip:', error);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

// GET /api/v1/trips - List all trips
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const trips = await tripService.getAllTrips(userId, year);
    res.json(trips);
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

// GET /api/v1/trips/summaries - Get all trip summaries (for card grid)
router.get('/summaries', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const categories = await categoryService.getAllCategories(userId);
    const categoryInfo = categories.map((c) => ({ id: c.id, name: c.name }));
    const summaries = await tripService.getTripsSummaries(userId, year, categoryInfo);
    res.json(summaries);
  } catch (error) {
    console.error('Error fetching trip summaries:', error);
    res.status(500).json({ error: 'Failed to fetch trip summaries' });
  }
});

// GET /api/v1/trips/:id - Get single trip
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const trip = await tripService.getTrip(req.params.id, userId);
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    res.json(trip);
  } catch (error) {
    console.error('Error fetching trip:', error);
    res.status(500).json({ error: 'Failed to fetch trip' });
  }
});

// GET /api/v1/trips/:id/summary - Get trip with spending breakdown
router.get('/:id/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const categories = await categoryService.getAllCategories(userId);
    const categoryInfo = categories.map((c) => ({ id: c.id, name: c.name }));
    const summary = await tripService.getTripSummary(req.params.id, userId, categoryInfo);
    if (!summary) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    res.json(summary);
  } catch (error) {
    if (error instanceof Error && error.message === 'Trip not found') {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    console.error('Error fetching trip summary:', error);
    res.status(500).json({ error: 'Failed to fetch trip summary' });
  }
});

// PUT /api/v1/trips/:id - Update trip
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const validatedData = updateTripSchema.parse(req.body);
    const trip = await tripService.updateTrip(req.params.id, validatedData, userId);
    res.json(trip);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error && error.message === 'Trip not found') {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    if (error instanceof Error && error.message === 'A trip with this tag already exists') {
      res.status(409).json({ error: error.message });
      return;
    }
    console.error('Error updating trip:', error);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

// DELETE /api/v1/trips/:id - Delete trip
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    await tripService.deleteTrip(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === 'Trip not found') {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    console.error('Error deleting trip:', error);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

export default router;
