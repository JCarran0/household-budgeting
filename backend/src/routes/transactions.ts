/**
 * Transaction Management Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { transactionService, accountService, importService, pushNotificationService, budgetService, dataService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';
import { z } from 'zod';
import type { StoredTransaction } from '../services/transactionService';

import { childLogger } from '../utils/logger';

const log = childLogger('transactions');

const router = Router();

// ---------------------------------------------------------------------------
// Notification helpers — all fire-and-forget (non-blocking)
// ---------------------------------------------------------------------------

/**
 * Fire large-transaction push notifications for newly synced transactions.
 * Checks user preferences; skips silently if disabled or threshold not met.
 * Never throws — errors are logged but do not interrupt the caller.
 */
async function fireLargeTransactionNotifications(
  userId: string,
  familyId: string,
  newTransactions: StoredTransaction[],
): Promise<void> {
  try {
    const prefs = await pushNotificationService.getUserPreferences(userId);
    if (!prefs.largeTransactions || newTransactions.length === 0) return;

    // Build account name lookup once
    const accountsResult = await accountService.getUserAccounts(familyId);
    const accountNameMap = new Map<string, string>();
    if (accountsResult.success && accountsResult.accounts) {
      for (const acct of accountsResult.accounts) {
        const displayName = acct.nickname ?? acct.accountName;
        accountNameMap.set(acct.id, displayName);
      }
    }

    for (const txn of newTransactions) {
      // Amount is positive = debit (expense). Check absolute value against threshold.
      if (Math.abs(txn.amount) < prefs.largeTransactionThreshold) continue;

      const accountName = accountNameMap.get(txn.accountId) ?? 'your account';

      await pushNotificationService.sendNotification(userId, {
        type: 'large_transaction',
        title: 'Large transaction posted',
        body: `A large transaction was posted to ${accountName}`,
        url: '/transactions?sort=amount&order=desc',
        tag: `large-txn-${txn.id}`,
      });
    }
  } catch (err) {
    log.error({ err: err }, '[notifications] Failed to send large transaction notifications');
  }
}

/**
 * Fire a budget-alert push notification after a transaction is categorized.
 * Checks user preferences and budget threshold; skips silently if not applicable.
 * Never throws — errors are logged but do not interrupt the caller.
 */
async function fireBudgetAlertNotification(
  userId: string,
  familyId: string,
  transaction: StoredTransaction,
): Promise<void> {
  try {
    if (!transaction.categoryId) return;

    const prefs = await pushNotificationService.getUserPreferences(userId);
    if (!prefs.budgetAlerts) return;

    // Derive the month (YYYY-MM) from the transaction date
    const month = transaction.date.slice(0, 7);

    // Get the budget for this category/month — skip if no budget is set
    const budget = await budgetService.getBudget(transaction.categoryId, month, familyId);
    if (!budget || budget.amount <= 0) return;

    // Sum all non-hidden, non-removed transactions for this category+month
    const txnResult = await transactionService.getTransactions(familyId, {
      startDate: `${month}-01`,
      endDate: `${month}-31`,
      categoryIds: [transaction.categoryId],
      includeHidden: false,
    });

    if (!txnResult.success || !txnResult.transactions) return;

    const actual = txnResult.transactions
      .filter(t => t.status !== 'removed' && !t.isHidden && !t.parentTransactionId)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const percentUsed = (actual / budget.amount) * 100;

    // Only fire when spending first crosses the user's configured threshold
    if (percentUsed < prefs.budgetAlertThreshold) return;

    // Use threshold band as part of tag to allow one notification per 10% band crossing
    const thresholdBand = Math.floor(percentUsed / 10) * 10;

    // Get category name for the notification
    const categories = await dataService.getCategories(familyId);
    const category = categories.find(c => c.id === transaction.categoryId);
    const categoryName = category?.name ?? transaction.categoryId;

    const pctRounded = Math.round(percentUsed);

    await pushNotificationService.sendNotification(userId, {
      type: 'budget_alert',
      title: `Budget alert: ${categoryName}`,
      body: `${categoryName} is at ${pctRounded}% of budget`,
      url: `/budget?month=${month}`,
      tag: `budget-alert-${transaction.categoryId}-${month}-${thresholdBand}`,
    });
  } catch (err) {
    log.error({ err: err }, '[notifications] Failed to send budget alert notification');
  }
}

// Extended Request with user
interface AuthRequest extends Request {
  user?: { userId: string; username: string; familyId: string };
}

// Input validation schemas
const transactionFilterSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accountId: z.string().optional(), // Single accountId for simple filtering
  accountIds: z.array(z.string()).optional(),
  categoryIds: z.union([z.array(z.string()), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return [val];
    return val;
  }),
  tags: z.union([z.array(z.string()), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return [val];
    return val;
  }),
  searchQuery: z.string().optional(),
  includePending: z.union([z.boolean(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return val === 'true';
    return val;
  }),
  includeHidden: z.union([z.boolean(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return val === 'true';
    return val;
  }),
  onlyUncategorized: z.union([z.boolean(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return val === 'true';
    return val;
  }),
  onlyFlagged: z.union([z.boolean(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return val === 'true';
    return val;
  }),
  minAmount: z.union([z.number(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return parseFloat(val);
    return val;
  }),
  maxAmount: z.union([z.number(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return parseFloat(val);
    return val;
  }),
  exactAmount: z.union([z.number(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return parseFloat(val);
    return val;
  }),
  amountTolerance: z.union([z.number(), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return parseFloat(val);
    return val;
  }),
  transactionType: z.enum(['income', 'expense', 'transfer', 'all']).optional(),
});

const updateCategorySchema = z.object({
  categoryId: z.union([z.string().min(1), z.null()]),
});

const addTagsSchema = z.object({
  tags: z.array(z.string().min(1)),
});

const updateDescriptionSchema = z.object({
  description: z.string().nullable(),
});

const updateHiddenSchema = z.object({
  isHidden: z.boolean(),
});

const updateFlaggedSchema = z.object({
  isFlagged: z.boolean(),
});

const splitTransactionSchema = z.object({
  splits: z.array(z.object({
    amount: z.number().positive(),
    categoryId: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })).min(2),
});

const syncAllSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const bulkUpdateSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1).max(100),
  updates: z.object({
    categoryId: z.union([z.string().min(1), z.null()]).optional(),
    userDescription: z.union([z.string(), z.null()]).optional(),
    isHidden: z.boolean().optional(),
    isFlagged: z.boolean().optional(),
    tagsToAdd: z.array(z.string().min(1)).optional(),
    tagsToRemove: z.array(z.string().min(1)).optional(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one update field must be provided',
  }),
});

/**
 * GET /api/v1/transactions/uncategorized/count
 * Get count of uncategorized transactions
 */
router.get('/uncategorized/count', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const { count, total } = await transactionService.getUncategorizedCount(req.user.familyId);

    res.json({
      success: true,
      count,
      total,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/transactions
 * Get transactions with filtering
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = transactionFilterSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid filter parameters',
        details: validation.error.format(),
      });
      return;
    }

    // Transform single accountId to accountIds array for the service
    const filterData = {
      ...validation.data,
      accountIds: validation.data.accountId
        ? [validation.data.accountId]
        : validation.data.accountIds
    };

    const result = await transactionService.getTransactions(
      req.user.familyId,
      filterData
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      transactions: result.transactions || [],
      totalCount: result.totalCount,
      total: result.unfilteredTotal || result.totalCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/transactions/sync
 * Sync all transactions for all user accounts
 */
router.post('/sync', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = syncAllSchema.safeParse(req.body ?? {});
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
    const accountsResult = await accountService.getUserAccounts(req.user.familyId);
    if (!accountsResult.success || !accountsResult.accounts || accountsResult.accounts.length === 0) {
      res.status(404).json({ success: false, error: 'No accounts to sync' });
      return;
    }

    // Sync transactions for all accounts
    const result = await transactionService.syncTransactions(
      req.user.familyId,
      accountsResult.accounts,
      startDate
    );

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    // Also sync account balances
    await accountService.syncAccountBalances(req.user.familyId);

    // Fire large-transaction notifications (non-blocking)
    if (result.newTransactions && result.newTransactions.length > 0) {
      void fireLargeTransactionNotifications(
        req.user.userId,
        req.user.familyId,
        result.newTransactions,
      );
    }

    res.json({
      success: true,
      added: result.added,
      modified: result.modified,
      removed: result.removed,
      warning: result.warning,  // Include warning if some accounts failed
    });
  } catch (error) {
    // Check for specific error types and provide helpful messages
    if (error instanceof Error && error.message.includes('reconnect your bank account')) {
      res.status(400).json({
        success: false,
        error: error.message,
        requiresReconnect: true,
      });
      return;
    }
    next(error);
  }
});

/**
 * PUT /api/v1/transactions/:transactionId/category
 * Update transaction category
 */
router.put('/:transactionId/category', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

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

    // Fetch the transaction before updating so we have its metadata for budget alerts
    const txnResult = await transactionService.getTransactions(req.user.familyId);
    const transaction = txnResult.success && txnResult.transactions
      ? txnResult.transactions.find(t => t.id === transactionId)
      : undefined;

    const result = await transactionService.updateTransactionCategory(
      req.user.familyId,
      transactionId,
      categoryId
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    // Fire budget alert notification if a category was assigned (non-blocking)
    if (categoryId && transaction) {
      void fireBudgetAlertNotification(
        req.user.userId,
        req.user.familyId,
        { ...transaction, categoryId },
      );
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/transactions/:transactionId/description
 * Update transaction description
 */
router.put('/:transactionId/description', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = updateDescriptionSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { transactionId } = req.params;
    const { description } = validation.data;

    const result = await transactionService.updateTransactionDescription(
      req.user.familyId,
      transactionId,
      description
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/transactions/:transactionId/hidden
 * Update transaction hidden status
 */
router.put('/:transactionId/hidden', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = updateHiddenSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { transactionId } = req.params;
    const { isHidden } = validation.data;

    const result = await transactionService.updateTransactionHidden(
      req.user.familyId,
      transactionId,
      isHidden
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/transactions/:transactionId/flagged
 * Update transaction flagged status
 */
router.put('/:transactionId/flagged', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = updateFlaggedSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { transactionId } = req.params;
    const { isFlagged } = validation.data;

    const result = await transactionService.updateTransactionFlagged(
      req.user.familyId,
      transactionId,
      isFlagged
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/transactions/:transactionId/tags
 * Add tags to a transaction
 */
router.post('/:transactionId/tags', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

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
      req.user.familyId,
      transactionId,
      tags
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/transactions/:transactionId/split
 * Split a transaction into multiple parts
 */
router.post('/:transactionId/split', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = splitTransactionSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { transactionId } = req.params;
    const { splits } = validation.data;

    const result = await transactionService.splitTransaction(
      req.user.familyId,
      transactionId,
      splits
    );

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, splitTransactions: result.splitTransactions });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/transactions/bulk
 * Bulk update multiple transactions
 */
router.put('/bulk', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const validation = bulkUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.format(),
      });
      return;
    }

    const { transactionIds, updates } = validation.data;

    const { updated, failed, errors } = await transactionService.bulkUpdate(
      req.user.familyId,
      transactionIds,
      updates
    );

    res.json({
      success: true,
      updated,
      failed,
      errors,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/transactions/summary
 * Get transaction summary/statistics
 */
router.get('/summary', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthorizationError();

    const summary = await transactionService.getMonthlySummary(req.user.familyId);

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    next(error);
  }
});

// Transaction import schema
const transactionImportSchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required'),
  preview: z.boolean().optional().default(false),
  skipDuplicates: z.boolean().optional().default(true),
  updateCategoriesOnly: z.boolean().optional().default(false),
});

/**
 * Import transactions from CSV/TSV
 * POST /api/v1/transactions/import-csv
 */
router.post('/import-csv', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.familyId) throw new AuthorizationError();

    // Set a longer timeout for this import endpoint
    res.setTimeout(5 * 60 * 1000); // 5 minutes

    // Validate request body
    const validationResult = transactionImportSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { csvContent, preview, skipDuplicates, updateCategoriesOnly } = validationResult.data;

    // Import transactions via ImportService
    const result = await importService.importCSV(
      req.user.familyId,
      'transactions',
      csvContent,
      {
        dryRun: preview,
        skipDuplicates,
        updateCategoriesOnly
      }
    );

    // Return result
    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
        data: {
          imported: result.imported || 0,
          skipped: result.skipped || 0,
          errors: result.errors || [],
          warnings: result.warnings || []
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message,
        details: result.errors || []
      });
    }
  } catch (error) {
    next(error);
    return;
  }
});

export default router;