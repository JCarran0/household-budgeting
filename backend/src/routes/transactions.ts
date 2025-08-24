/**
 * Transaction Management Routes
 */

import { Router, Request, Response } from 'express';
import { transactionService, accountService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { z } from 'zod';

const router = Router();

// Extended Request with user
interface AuthRequest extends Request {
  user?: { userId: string; username: string };
}

// Input validation schemas
const transactionFilterSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accountIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  searchQuery: z.string().optional(),
  includePending: z.boolean().optional(),
  includeHidden: z.boolean().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
});

const updateCategorySchema = z.object({
  categoryId: z.string().min(1),
});

const addTagsSchema = z.object({
  tags: z.array(z.string().min(1)),
});

const syncAllSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * GET /api/v1/transactions
 * Get transactions with filtering
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const validation = transactionFilterSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid filter parameters',
        details: validation.error.format(),
      });
      return;
    }

    const result = await transactionService.getTransactions(
      req.user.userId,
      validation.data
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      transactions: result.transactions,
      totalCount: result.totalCount,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});

/**
 * POST /api/v1/transactions/sync
 * Sync all transactions for all user accounts
 */
router.post('/sync', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const validation = syncAllSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { startDate = '2025-01-01' } = validation.data;

    // Get all user accounts
    const accountsResult = await accountService.getUserAccounts(req.user.userId);
    if (!accountsResult.success || !accountsResult.accounts || accountsResult.accounts.length === 0) {
      res.status(404).json({ success: false, error: 'No accounts to sync' });
      return;
    }

    // Sync transactions for all accounts
    const result = await transactionService.syncTransactions(
      req.user.userId,
      accountsResult.accounts,
      startDate
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    // Also sync account balances
    await accountService.syncAccountBalances(req.user.userId);

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
 * PUT /api/v1/transactions/:transactionId/category
 * Update transaction category
 */
router.put('/:transactionId/category', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const validation = updateCategorySchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { transactionId } = req.params;
    const { categoryId } = validation.data;

    const result = await transactionService.updateTransactionCategory(
      req.user.userId,
      transactionId,
      categoryId
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ success: false, error: 'Failed to update category' });
  }
});

/**
 * POST /api/v1/transactions/:transactionId/tags
 * Add tags to a transaction
 */
router.post('/:transactionId/tags', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const validation = addTagsSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { transactionId } = req.params;
    const { tags } = validation.data;

    const result = await transactionService.addTransactionTags(
      req.user.userId,
      transactionId,
      tags
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error adding tags:', error);
    res.status(500).json({ success: false, error: 'Failed to add tags' });
  }
});

/**
 * GET /api/v1/transactions/summary
 * Get transaction summary/statistics
 */
router.get('/summary', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // Get this month's transactions
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const result = await transactionService.getTransactions(req.user.userId, {
      startDate: startOfMonth,
      endDate: endOfMonth,
      includePending: false,
    });

    if (!result.success || !result.transactions) {
      res.status(500).json({ success: false, error: 'Failed to calculate summary' });
      return;
    }

    // Calculate summary
    let totalIncome = 0;
    let totalExpenses = 0;
    
    for (const txn of result.transactions) {
      if (txn.amount < 0) {
        totalIncome += Math.abs(txn.amount);
      } else {
        totalExpenses += txn.amount;
      }
    }

    res.json({
      success: true,
      summary: {
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        totalIncome,
        totalExpenses,
        netIncome: totalIncome - totalExpenses,
        transactionCount: result.transactions.length,
      },
    });
  } catch (error) {
    console.error('Error calculating summary:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate summary' });
  }
});

export default router;