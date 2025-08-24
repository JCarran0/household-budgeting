import { Router, Request, Response } from 'express';
import { plaidService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { z } from 'zod';

const router = Router();

// Input validation schemas
const exchangeTokenSchema = z.object({
  publicToken: z.string().min(1, 'Public token is required'),
});

const transactionQuerySchema = z.object({
  itemId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  includePending: z.string().optional(),
  offset: z.string().optional(),
  count: z.string().optional(),
});

const accountQuerySchema = z.object({
  itemId: z.string().min(1),
});

const removeItemSchema = z.object({
  itemId: z.string().min(1, 'itemId is required'),
});

// Extended Request type with user (matching auth middleware)
interface AuthenticatedRequest extends Request {
  user?: { userId: string; username: string };
}

/**
 * POST /api/v1/plaid/link-token
 * Create a link token for Plaid Link initialization
 */
router.post('/link-token', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await plaidService.createLinkToken(req.user.userId);
    
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({
      linkToken: result.linkToken,
      expiration: result.expiration,
    });
  } catch (error) {
    console.error('Error creating link token:', error);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

/**
 * POST /api/v1/plaid/exchange-token
 * Exchange public token for access token
 */
router.post('/exchange-token', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    console.error('Error exchanging token:', error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

/**
 * GET /api/v1/plaid/accounts
 * Get all accounts for a connected item
 */
router.get('/accounts', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Validate query parameters
    const validation = accountQuerySchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({ error: 'itemId is required' });
      return;
    }

    // In a real app, we'd fetch the access token from secure storage using itemId and userId
    // For now, we'll use a placeholder
    const accessToken = 'access-token-placeholder';
    
    const result = await plaidService.getAccounts(accessToken);
    
    if (!result.success) {
      // Handle reauthentication requirement
      if (result.requiresReauth) {
        res.status(401).json({ 
          error: result.error,
          requiresReauth: true,
        });
        return;
      }
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({
      accounts: result.accounts,
      itemId: result.itemId,
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

/**
 * GET /api/v1/plaid/transactions
 * Get transactions for a date range
 */
router.get('/transactions', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Validate query parameters
    const validation = transactionQuerySchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({ error: 'itemId, startDate, and endDate are required' });
      return;
    }

    const { startDate, endDate, includePending, offset, count } = validation.data;
    
    // In a real app, we'd fetch the access token from secure storage
    const accessToken = 'access-token-placeholder';
    
    const options = {
      includePending: includePending === 'true',
      offset: offset ? parseInt(offset, 10) : undefined,
      count: count ? parseInt(count, 10) : undefined,
    };
    
    const result = await plaidService.getTransactions(accessToken, startDate, endDate, options);
    
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({
      transactions: result.transactions,
      totalTransactions: result.totalTransactions,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * POST /api/v1/plaid/item/remove
 * Remove an item (disconnect bank account)
 */
router.post('/item/remove', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Validate input
    const validation = removeItemSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'itemId is required' });
      return;
    }

    // const { itemId } = validation.data;
    // In a real app, we'd fetch the access token from secure storage using itemId
    const accessToken = 'access-token-placeholder';
    
    const result = await plaidService.removeItem(accessToken);
    
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Error removing item:', error);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

export default router;