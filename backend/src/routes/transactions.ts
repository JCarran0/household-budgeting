/**
 * Transaction Management Routes
 */

import { Router, Request, Response } from 'express';
import { transactionService, accountService, importService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { z } from 'zod';
import { calculateIncome, calculateExpenses, calculateNetCashFlow } from '../shared/utils/transactionCalculations';

const router = Router();

// Extended Request with user
interface AuthRequest extends Request {
  user?: { userId: string; username: string };
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
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one update field must be provided',
  }),
});

/**
 * GET /api/v1/transactions/uncategorized/count
 * Get count of uncategorized transactions
 */
router.get('/uncategorized/count', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await transactionService.getTransactions(req.user.userId);
    
    if (!result.success || !result.transactions) {
      res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
      return;
    }

    // Count transactions without a category
    // Exclude hidden transactions and split child transactions
    const uncategorizedCount = result.transactions.filter(
      t => !t.categoryId && !t.isHidden && !t.parentTransactionId
    ).length;

    res.json({ 
      success: true,
      count: uncategorizedCount,
      total: result.transactions.filter(t => !t.isHidden && !t.parentTransactionId).length
    });
  } catch (error) {
    console.error('Error fetching uncategorized count:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch uncategorized count' });
  }
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

    // Transform single accountId to accountIds array for the service
    const filterData = {
      ...validation.data,
      accountIds: validation.data.accountId 
        ? [validation.data.accountId] 
        : validation.data.accountIds
    };
    
    const result = await transactionService.getTransactions(
      req.user.userId,
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
      warning: result.warning,  // Include warning if some accounts failed
    });
  } catch (error) {
    console.error('Error syncing transactions:', error);
    
    // Check for specific error types and provide helpful messages
    if (error instanceof Error) {
      if (error.message.includes('reconnect your bank account')) {
        res.status(400).json({ 
          success: false, 
          error: error.message,
          requiresReconnect: true 
        });
        return;
      }
    }
    
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
 * PUT /api/v1/transactions/:transactionId/description
 * Update transaction description
 */
router.put('/:transactionId/description', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

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
      req.user.userId,
      transactionId,
      description
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating description:', error);
    res.status(500).json({ success: false, error: 'Failed to update description' });
  }
});

/**
 * PUT /api/v1/transactions/:transactionId/hidden
 * Update transaction hidden status
 */
router.put('/:transactionId/hidden', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

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
      req.user.userId,
      transactionId,
      isHidden
    );

    if (!result.success) {
      res.status(404).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating hidden status:', error);
    res.status(500).json({ success: false, error: 'Failed to update hidden status' });
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
 * POST /api/v1/transactions/:transactionId/split
 * Split a transaction into multiple parts
 */
router.post('/:transactionId/split', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

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
      req.user.userId,
      transactionId,
      splits
    );

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, splitTransactions: result.splitTransactions });
  } catch (error) {
    console.error('Error splitting transaction:', error);
    res.status(500).json({ success: false, error: 'Failed to split transaction' });
  }
});

/**
 * PUT /api/v1/transactions/bulk
 * Bulk update multiple transactions
 */
router.put('/bulk', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

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
    
    // Update transactions in bulk
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    
    for (const transactionId of transactionIds) {
      try {
        // Update category if provided
        if (updates.categoryId !== undefined) {
          const result = await transactionService.updateTransactionCategory(
            req.user.userId,
            transactionId,
            updates.categoryId
          );
          if (!result.success) {
            failedCount++;
            errors.push(`Transaction ${transactionId}: ${result.error}`);
            continue;
          }
        }
        
        // Update description if provided
        if (updates.userDescription !== undefined) {
          const result = await transactionService.updateTransactionDescription(
            req.user.userId,
            transactionId,
            updates.userDescription
          );
          if (!result.success) {
            failedCount++;
            errors.push(`Transaction ${transactionId}: ${result.error}`);
            continue;
          }
        }
        
        // Update hidden status if provided
        if (updates.isHidden !== undefined) {
          const result = await transactionService.updateTransactionHidden(
            req.user.userId,
            transactionId,
            updates.isHidden
          );
          if (!result.success) {
            failedCount++;
            errors.push(`Transaction ${transactionId}: ${result.error}`);
            continue;
          }
        }
        
        successCount++;
      } catch (error) {
        failedCount++;
        errors.push(`Transaction ${transactionId}: Update failed`);
      }
    }
    
    res.json({ 
      success: true,
      updated: successCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error performing bulk update:', error);
    res.status(500).json({ success: false, error: 'Failed to perform bulk update' });
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

    // Calculate summary (excluding transfers)
    const totalIncome = calculateIncome(result.transactions);
    const totalExpenses = calculateExpenses(result.transactions);
    const netIncome = calculateNetCashFlow(result.transactions);

    res.json({
      success: true,
      summary: {
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        totalIncome,
        totalExpenses,
        netIncome,
        transactionCount: result.transactions.length,
      },
    });
  } catch (error) {
    console.error('Error calculating summary:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate summary' });
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
router.post('/import-csv', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

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
      req.user.userId,
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
    console.error('Error importing transactions:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to import transactions',
      details: [error instanceof Error ? error.message : 'Unknown error occurred']
    });
  }
});

export default router;