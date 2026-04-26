import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware';
import { adminMiddleware } from '../middleware/adminMiddleware';
import { AuthorizationError } from '../errors';
import type { WrappedService } from '../services/wrappedService';
import type { UserService } from '../services/userService';

export function createWrappedRouter(
  wrappedService: WrappedService,
  userService: UserService,
): Router {
  const router = Router();

  // All wrapped routes require authentication.
  router.use(authMiddleware);

  // -------------------------------------------------------------------------
  // GET /today — daily Wrapped payload (204 when out-of-window or suppressed)
  // -------------------------------------------------------------------------

  router.get('/today', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AuthorizationError();
      const payload = await wrappedService.getDailyPayload(req.user.userId);
      if (!payload) {
        res.status(204).end();
        return;
      }
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  // -------------------------------------------------------------------------
  // GET /week — current week or latest archived weekly Wrapped (204 when none)
  // -------------------------------------------------------------------------

  router.get('/week', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AuthorizationError();
      const record = await wrappedService.getWeeklyRecord(req.user.userId);
      if (!record) {
        res.status(204).end();
        return;
      }
      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  // -------------------------------------------------------------------------
  // GET /archive — paginated weekly archive list
  // -------------------------------------------------------------------------

  const archiveQuerySchema = z.object({
    cursor: z.string().optional(),
  });

  router.get('/archive', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AuthorizationError();
      const { cursor } = archiveQuerySchema.parse(req.query);
      const result = await wrappedService.listArchive(req.user.userId, cursor);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // -------------------------------------------------------------------------
  // GET /archive/:weekStart — full record for a specific past week
  // -------------------------------------------------------------------------

  router.get('/archive/:weekStart', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AuthorizationError();
      const { weekStart } = req.params;
      const record = await wrappedService.getWeeklyRecord(req.user.userId, weekStart);
      if (!record) {
        res.status(404).json({ success: false, error: 'Weekly Wrapped not found for this week.' });
        return;
      }
      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  // -------------------------------------------------------------------------
  // POST /admin/enable — admin-only toggle of wrappedEnabled per user
  // -------------------------------------------------------------------------

  const enableBodySchema = z.object({
    userId: z.string().min(1),
    enabled: z.boolean(),
  });

  router.post(
    '/admin/enable',
    adminMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) throw new AuthorizationError();
        const body = enableBodySchema.parse(req.body);
        await wrappedService.setWrappedEnabled(body.userId, body.enabled, req.user.userId);
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /preferences/timezone — update calling user's IANA timezone
  // -------------------------------------------------------------------------

  const timezoneBodySchema = z.object({
    timezone: z.string().min(1),
  });

  router.patch('/preferences/timezone', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AuthorizationError();
      const { timezone } = timezoneBodySchema.parse(req.body);
      await userService.updateTimezone(req.user.userId, timezone);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
