/**
 * Account Management Routes
 */

import { Router, Request, Response } from 'express';
import { accountService, transactionService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { z } from 'zod';

const router = Router();

// Extended Request with user
interface AuthRequest extends Request {
  user?: { userId: string; username: string };
}

// Input validation schemas
const connectAccountSchema = z.object({
  publicToken: z.string().min(1),
  institutionId: z.string().min(1),
  institutionName: z.string().min(1),
});

const syncTransactionsSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * POST /api/v1/accounts/connect
 * Connect a new bank account after Plaid Link
 */
router.post('/connect', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const validation = connectAccountSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { publicToken, institutionId, institutionName } = validation.data;

    const result = await accountService.connectAccount(
      req.user.userId,
      publicToken,
      institutionId,
      institutionName
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    // Note: We don't sync transactions immediately after connection
    // because Plaid needs time (10-60 seconds) to prepare transaction data.
    // Users should manually sync transactions after connecting their account.

    res.json({
      success: true,
      account: result.account,
    });
  } catch (error) {
    console.error('Error connecting account:', error);
    res.status(500).json({ success: false, error: 'Failed to connect account' });
  }
});

/**
 * GET /api/v1/accounts
 * Get all user's connected accounts
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await accountService.getUserAccounts(req.user.userId);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    // Map institutionName to institution to match PlaidAccount interface
    const mappedAccounts = result.accounts?.map(account => ({
      ...account,
      institution: account.institutionName, // Map institutionName to institution
    })) || [];

    res.json({
      success: true,
      accounts: mappedAccounts,
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch accounts' });
  }
});

/**
 * POST /api/v1/accounts/sync
 * Sync account balances from Plaid
 */
router.post('/sync', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await accountService.syncAccountBalances(req.user.userId);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      accountsUpdated: result.accountsUpdated,
    });
  } catch (error) {
    console.error('Error syncing accounts:', error);
    res.status(500).json({ success: false, error: 'Failed to sync accounts' });
  }
});

/**
 * POST /api/v1/accounts/:accountId/sync-transactions
 * Sync transactions for specific account
 */
router.post('/:accountId/sync-transactions', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const validation = syncTransactionsSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { accountId } = req.params;
    const { startDate = '2025-01-01' } = validation.data;

    // Get the account
    const account = await accountService.getAccount(req.user.userId, accountId);
    if (!account) {
      res.status(404).json({ success: false, error: 'Account not found' });
      return;
    }

    // Sync transactions
    const result = await transactionService.syncTransactions(
      req.user.userId,
      [account],
      startDate
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      added: result.added,
      modified: result.modified,
      removed: result.removed,
    });
  } catch (error) {
    console.error('Error syncing transactions:', error);
    res.status(500).json({ success: false, error: 'Failed to sync transactions' });
  }
});

/**
 * PUT /api/v1/accounts/:accountId
 * Update account details (currently only nickname)
 */
router.put('/:accountId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { accountId } = req.params;
    
    // Validate input
    const updateSchema = z.object({
      nickname: z.string().max(50).nullable().optional(),
    });

    const validation = updateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { nickname } = validation.data;
    
    if (nickname !== undefined) {
      const result = await accountService.updateAccountNickname(req.user.userId, accountId, nickname);
      
      if (!result.success) {
        res.status(result.error === 'Account not found' ? 404 : 400).json({ 
          success: false, 
          error: result.error 
        });
        return;
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ success: false, error: 'Failed to update account' });
  }
});

/**
 * DELETE /api/v1/accounts/:accountId
 * Disconnect a bank account
 */
router.delete('/:accountId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { accountId } = req.params;

    const result = await accountService.disconnectAccount(req.user.userId, accountId);

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting account:', error);
    res.status(500).json({ success: false, error: 'Failed to disconnect account' });
  }
});

export default router;