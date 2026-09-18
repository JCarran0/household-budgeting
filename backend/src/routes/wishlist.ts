import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { wishlistService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';
import {
  createWishlistItemSchema,
  updateWishlistItemSchema,
} from '../validators/wishlistValidators';

const router = Router();

// ---------------------------------------------------------------------------
// All routes require authentication
// ---------------------------------------------------------------------------
router.use(authMiddleware);

// POST /api/v1/wishlist — create item
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    const userId = req.user?.userId;
    if (!familyId || !userId) throw new AuthorizationError();

    const validatedData = createWishlistItemSchema.parse(req.body);
    const item = await wishlistService.createItem(validatedData, familyId, userId);
    res.status(201).json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    next(error);
  }
});

// GET /api/v1/wishlist — list all items for the family
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    const items = await wishlistService.listItems(familyId);
    res.json(items);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/wishlist/:id — update item
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    const validatedData = updateWishlistItemSchema.parse(req.body);
    const item = await wishlistService.updateItem(req.params.id, validatedData, familyId);
    res.json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    next(error);
  }
});

// DELETE /api/v1/wishlist/:id — delete item
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    await wishlistService.deleteItem(req.params.id, familyId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
