/**
 * Workspace routes — Phase 1.5
 *
 * GET  /api/v1/workspaces        — list the caller's workspaces
 * POST /api/v1/workspaces        — create a new workspace (business; admin-only per D10)
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService, familyService } from '../services';
import { authenticate, validateBody } from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';

const router = Router();

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'name is required').max(100, 'name too long'),
  workspaceType: z.enum(['personal', 'business']),
});

/**
 * @route GET /api/v1/workspaces
 * @desc List all workspaces the authenticated user belongs to
 * @access Private
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      const workspaces = await authService.listWorkspaces(req.user.userId);
      res.json({ success: true, workspaces });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route POST /api/v1/workspaces
 * @desc Create a new workspace. Gated to admin users only (D10).
 * @access Private (admin)
 */
router.post(
  '/',
  authenticate,
  validateBody(createWorkspaceSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthorizationError();

      // D10: workspace creation is admin-only; reject non-admin callers
      const { dataService } = await import('../services');
      const user = await dataService.getUser(req.user.userId);
      if (!user?.isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Workspace creation is restricted to administrators.',
        });
        return;
      }

      const { name, workspaceType } = req.body as z.infer<typeof createWorkspaceSchema>;

      // In v1, only 'business' workspaces can be created via this endpoint
      if (workspaceType !== 'business') {
        res.status(400).json({
          success: false,
          error: 'Only business workspaces can be created via this endpoint.',
        });
        return;
      }

      const family = await familyService.createWorkspace(req.user.userId, name, workspaceType);
      res.status(201).json({ success: true, workspace: family });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
