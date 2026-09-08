import { Router, Request, Response, NextFunction } from 'express';
import { plaidService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';
import { z } from 'zod';

const router = Router();

// Input validation schemas
const exchangeTokenSchema = z.object({
  publicToken: z.string().min(1, 'Public token is required'),
});

// Extended Request type with user (matching auth middleware)
interface AuthenticatedRequest extends Request {
  user?: { userId: string; username: string; familyId: string; workspaceIds: string[] };
}

/**
 * POST /api/v1/plaid/link-token
 * Create a link token for Plaid Link initialization
 */
router.post('/link-token', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const result = await plaidService.createLinkToken(req.user.userId);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({
      link_token: result.linkToken,
      expiration: result.expiration,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/plaid/exchange-token
 * Exchange public token for access token
 */
router.post('/exchange-token', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Validate input
    const validation = exchangeTokenSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Public token is required' });
      return;
    }

    const { publicToken } = validation.data;
    const result = await plaidService.exchangePublicToken(publicToken);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    // In a real app, we'd store the access token securely associated with the user
    // For now, we'll just return success and the itemId
    res.json({
      success: true,
      itemId: result.itemId,
    });
  } catch (error) {
    next(error);
  }
});

/*
 * Removed 2026-09-08 (SA-20): GET /plaid/accounts, GET /plaid/transactions and
 * POST /plaid/item/remove.
 *
 * All three were scaffolding that called plaidService with
 * `const accessToken = 'access-token-placeholder'`. They were authenticated but
 * functionally broken, and not exploitable as written.
 *
 * They were deleted rather than fixed because of the shape they invited: each
 * took `itemId` from the request rather than from the caller's own stored
 * accounts, so wiring in a real token lookup — the obvious next step for whoever
 * found them — would have produced an unscoped cross-family Plaid operation, and
 * `item/remove` is destructive. Dead code that looks live is worse than dead code
 * that looks dead.
 *
 * The real flows live in `routes/accounts.ts` → `accountService`, which scopes
 * every lookup by the caller's familyId.
 */

export default router;