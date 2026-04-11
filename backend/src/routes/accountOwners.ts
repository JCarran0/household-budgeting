import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, validateBody } from '../middleware/authMiddleware';
import { accountOwnerMappingService } from '../services';
import { AuthorizationError } from '../errors';
import { z } from 'zod';

const router = Router();

const createMappingSchema = z.object({
  cardIdentifier: z.string().min(1, 'Card identifier is required').max(20),
  displayName: z.string().min(1, 'Display name is required').max(50),
  linkedUserId: z.string().uuid().optional(),
});

const updateMappingSchema = z.object({
  cardIdentifier: z.string().min(1).max(20).optional(),
  displayName: z.string().min(1).max(50).optional(),
  linkedUserId: z.string().uuid().nullable().optional(),
});

/**
 * @route GET /api/v1/account-owners
 * @desc List all account owner mappings for the family
 * @access Private
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      const mappings = await accountOwnerMappingService.getMappings(req.user.familyId);
      res.json({ success: true, mappings });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/account-owners
 * @desc Create a new account owner mapping
 * @access Private
 */
router.post(
  '/',
  authenticate,
  validateBody(createMappingSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      const mapping = await accountOwnerMappingService.createMapping(
        req.user.familyId,
        req.body,
      );
      res.status(201).json({ success: true, mapping });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/account-owners/:id
 * @desc Update an account owner mapping
 * @access Private
 */
router.put(
  '/:id',
  authenticate,
  validateBody(updateMappingSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      const mapping = await accountOwnerMappingService.updateMapping(
        req.user.familyId,
        req.params.id,
        req.body,
      );
      res.json({ success: true, mapping });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/account-owners/:id
 * @desc Delete an account owner mapping
 * @access Private
 */
router.delete(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      await accountOwnerMappingService.deleteMapping(req.user.familyId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
