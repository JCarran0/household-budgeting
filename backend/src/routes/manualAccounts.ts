import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { manualAccountService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';

const router = Router();

const manualAccountCategoryEnum = z.enum([
  'real_estate',
  'vehicle',
  'retirement',
  'brokerage',
  'cash',
  'crypto',
  'other_asset',
  'mortgage',
  'auto_loan',
  'student_loan',
  'personal_loan',
  'other_liability',
]);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  category: manualAccountCategoryEnum,
  isAsset: z.boolean(),
  currentBalance: z.number().min(0),
  notes: z.string().max(500).nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  category: manualAccountCategoryEnum.optional(),
  isAsset: z.boolean().optional(),
  currentBalance: z.number().min(0).optional(),
  notes: z.string().max(500).nullable().optional(),
});

router.use(authMiddleware);

// GET /api/v1/manual-accounts
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const accounts = await manualAccountService.getAll(userId);
    res.json(accounts);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/manual-accounts
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const data = createSchema.parse(req.body);
    const account = await manualAccountService.create(userId, data);
    res.status(201).json(account);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    next(error);
  }
});

// PUT /api/v1/manual-accounts/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const data = updateSchema.parse(req.body);
    const account = await manualAccountService.update(userId, req.params.id, data);
    res.json(account);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error && error.message === 'Manual account not found') {
      res.status(404).json({ error: 'Manual account not found' });
      return;
    }
    next(error);
  }
});

// DELETE /api/v1/manual-accounts/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    await manualAccountService.delete(userId, req.params.id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === 'Manual account not found') {
      res.status(404).json({ error: 'Manual account not found' });
      return;
    }
    next(error);
  }
});

export default router;
