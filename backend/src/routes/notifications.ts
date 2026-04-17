/**
 * Push Notification Routes
 *
 * POST   /subscribe        — Register a push subscription (auth required)
 * DELETE /subscribe        — Remove a push subscription (auth required)
 * GET    /preferences      — Get notification preferences (auth required)
 * PUT    /preferences      — Update notification preferences (auth required)
 * GET    /vapid-public-key — Get VAPID public key (no auth — needed before login)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware';
import { pushNotificationService, dataService } from '../services';
import type { NotificationPreferences } from '../shared/types';

const router = Router();

// Extended Request with guaranteed user (set by authMiddleware)
interface AuthRequest extends Request {
  user: { userId: string; username: string; familyId: string };
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const subscribeBodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  expirationTime: z.union([z.number(), z.null()]).optional(),
});

const unsubscribeBodySchema = z.object({
  endpoint: z.string().url(),
});

const preferencesBodySchema = z.object({
  syncFailures: z.boolean(),
  budgetAlerts: z.boolean(),
  budgetAlertThreshold: z.number().int().min(1).max(100),
  largeTransactions: z.boolean(),
  largeTransactionThreshold: z.number().min(0),
  billReminders: z.boolean(),
});

const DEFAULT_PREFERENCES: NotificationPreferences = {
  syncFailures: false,
  budgetAlerts: false,
  budgetAlertThreshold: 80,
  largeTransactions: false,
  largeTransactionThreshold: 500,
  billReminders: false,
};

const PREFERENCES_KEY_PREFIX = 'push_preferences_';

// ---------------------------------------------------------------------------
// GET /vapid-public-key — No auth required (needed during SW registration)
// ---------------------------------------------------------------------------

router.get('/vapid-public-key', (_req: Request, res: Response): void => {
  const publicKey = pushNotificationService.getVapidPublicKey();

  if (!publicKey) {
    res.status(503).json({
      success: false,
      error: 'Push notifications are not configured on this server.',
    });
    return;
  }

  res.json({ success: true, publicKey });
});

// ---------------------------------------------------------------------------
// POST /subscribe — Register a device subscription
// ---------------------------------------------------------------------------

router.post('/subscribe', authMiddleware, (req: Request, res: Response): void => {
  void (async () => {
    const parsed = subscribeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid subscription payload.',
        details: parsed.error.format(),
      });
      return;
    }

    const { userId } = (req as AuthRequest).user;

    try {
      await pushNotificationService.registerSubscription(userId, parsed.data);
      res.status(201).json({ success: true });
    } catch (error) {
      console.error('[notifications] Failed to register subscription:', error);
      res.status(500).json({ success: false, error: 'Failed to register subscription.' });
    }
  })();
});

// ---------------------------------------------------------------------------
// DELETE /subscribe — Remove a device subscription
// ---------------------------------------------------------------------------

router.delete('/subscribe', authMiddleware, (req: Request, res: Response): void => {
  void (async () => {
    const parsed = unsubscribeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid unsubscribe payload.',
        details: parsed.error.format(),
      });
      return;
    }

    const { userId } = (req as AuthRequest).user;

    try {
      await pushNotificationService.removeSubscription(userId, parsed.data.endpoint);
      res.json({ success: true });
    } catch (error) {
      console.error('[notifications] Failed to remove subscription:', error);
      res.status(500).json({ success: false, error: 'Failed to remove subscription.' });
    }
  })();
});

// ---------------------------------------------------------------------------
// GET /preferences — Get notification preferences
// ---------------------------------------------------------------------------

router.get('/preferences', authMiddleware, (req: Request, res: Response): void => {
  void (async () => {
    const { userId } = (req as AuthRequest).user;

    try {
      const stored = await dataService.getData<NotificationPreferences>(
        `${PREFERENCES_KEY_PREFIX}${userId}`,
      );

      // Merge stored prefs over defaults so new fields are always present
      const preferences: NotificationPreferences = { ...DEFAULT_PREFERENCES, ...stored };
      res.json({ success: true, preferences });
    } catch (error) {
      console.error('[notifications] Failed to get preferences:', error);
      res.status(500).json({ success: false, error: 'Failed to get notification preferences.' });
    }
  })();
});

// ---------------------------------------------------------------------------
// PUT /preferences — Update notification preferences
// ---------------------------------------------------------------------------

router.put('/preferences', authMiddleware, (req: Request, res: Response): void => {
  void (async () => {
    const parsed = preferencesBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid preferences payload.',
        details: parsed.error.format(),
      });
      return;
    }

    const { userId } = (req as AuthRequest).user;

    try {
      await dataService.saveData(`${PREFERENCES_KEY_PREFIX}${userId}`, parsed.data);
      res.json({ success: true, preferences: parsed.data });
    } catch (error) {
      console.error('[notifications] Failed to update preferences:', error);
      res.status(500).json({ success: false, error: 'Failed to update notification preferences.' });
    }
  })();
});

export default router;
