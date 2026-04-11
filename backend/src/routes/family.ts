import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, validateBody } from '../middleware/authMiddleware';
import { familyService } from '../services';
import { AuthorizationError } from '../errors';
import { z } from 'zod';

const router = Router();

const updateFamilyNameSchema = z.object({
  name: z.string().min(1, 'Family name is required').max(100, 'Family name must be less than 100 characters'),
});

/**
 * @route GET /api/v1/family
 * @desc Get current user's family and members
 * @access Private
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      const { familyId } = req.user;
      const family = await familyService.getFamily(familyId);

      if (!family) {
        res.status(404).json({
          success: false,
          error: 'Family not found',
        });
        return;
      }

      res.json({
        success: true,
        family,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/v1/family/name
 * @desc Update family name
 * @access Private
 */
router.put(
  '/name',
  authenticate,
  validateBody(updateFamilyNameSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      const { familyId } = req.user;
      const { name } = req.body;

      const family = await familyService.updateFamilyName(familyId, name);

      res.json({
        success: true,
        family,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/family/invite
 * @desc Generate a join code for inviting a new family member
 * @access Private
 */
router.post(
  '/invite',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      const { familyId, userId } = req.user;
      const invitation = familyService.createInvitation(familyId, userId);

      res.status(201).json({
        success: true,
        invitation,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/family/members/:id
 * @desc Remove a member from the family
 * @access Private
 */
router.delete(
  '/members/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      const { familyId } = req.user;
      const targetUserId = req.params.id;

      const family = await familyService.removeMember(familyId, targetUserId);

      res.json({
        success: true,
        family,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
