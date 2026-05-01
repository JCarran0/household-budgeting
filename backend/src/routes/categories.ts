import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { categoryService, transactionService, budgetService, autoCategorizeService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';

import { childLogger } from '../utils/logger';

const log = childLogger('categories');

const router = Router();

// Validation schemas
const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().nullable(),
  description: z.string().max(500).optional(),
  isHidden: z.boolean(),
  isRollover: z.boolean(),
  isSavings: z.boolean().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  parentId: z.string().nullable().optional(),
  isHidden: z.boolean().optional(),
  isRollover: z.boolean().optional(),
  isSavings: z.boolean().optional(),
  /**
   * Opt-in confirmation that the caller accepts unflagging conflicting
   * ancestors/descendants when setting isRollover=true. See
   * ROLLOVER-BUDGETS-BRD §3.2 and the frontend's two-step confirmation flow.
   */
  resolveRolloverConflicts: z.boolean().optional(),
});

// All routes require authentication
router.use(authMiddleware);

// GET /api/categories - Get all categories
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const categories = await categoryService.getAllCategories(familyId);
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/tree - Get categories in tree structure
router.get('/tree', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const tree = await categoryService.getCategoryTree(familyId);
    res.json(tree);
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/transaction-counts - Get transaction counts for all categories
router.get('/transaction-counts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const counts = await transactionService.getTransactionCountsByCategory(familyId);
    res.json(counts);
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/parents - Get all parent categories
router.get('/parents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const parents = await categoryService.getParentCategories(familyId);
    res.json(parents);
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/hidden - Get hidden categories
router.get('/hidden', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const hidden = await categoryService.getHiddenCategories(familyId);
    res.json(hidden);
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/savings - Get savings categories
router.get('/savings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const rollover = await categoryService.getRolloverCategories(familyId);
    res.json(rollover);
  } catch (error) {
    next(error);
  }
});

// POST /api/categories/initialize - Initialize default categories
router.post('/initialize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Do not log req.headers (Authorization bearer) or full req.user (JWT payload)
    // — tag the request with familyId/userId only.
    const familyId = req.user?.familyId;
    const userId = req.user?.userId;
    if (!familyId) {
      log.error({ userId, hasUser: !!req.user }, 'initialize categories: no familyId in request');
      throw new AuthorizationError();
    }

    log.info({ familyId, userId }, 'initializing default categories');
    await categoryService.initializeDefaultCategories(familyId);
    const categories = await categoryService.getAllCategories(familyId);
    log.info({ familyId, count: categories.length }, 'categories initialized');
    res.json({ message: 'Default categories initialized', categories });
  } catch (error) {
    next(error);
  }
});

// POST /api/categories/import-csv - Import categories from CSV
router.post('/import-csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    const { csvContent } = req.body;

    if (!csvContent || typeof csvContent !== 'string') {
      res.status(400).json({ error: 'CSV content is required' });
      return;
    }

    // Set a longer timeout for this specific endpoint
    res.setTimeout(5 * 60 * 1000); // 5 minutes

    const result = await categoryService.importFromCSV(csvContent, familyId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        importedCount: result.importedCount,
        errors: result.errors
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        errors: result.errors
      });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/:id - Get a specific category
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const category = await categoryService.getCategoryById(req.params.id, familyId);
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json(category);
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/:id/subcategories - Get subcategories of a parent
router.get('/:id/subcategories', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const subcategories = await categoryService.getSubcategories(req.params.id, familyId);
    res.json(subcategories);
  } catch (error) {
    next(error);
  }
});

// POST /api/categories - Create a new category
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const validatedData = createCategorySchema.parse(req.body);
    const category = await categoryService.createCategory(validatedData, familyId);
    res.status(201).json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error) {
      if (error.message.includes('Parent category not found') ||
          error.message.includes('Cannot create subcategory') ||
          error.message.includes('already exists') ||
          error.message.includes('name is required')) {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
});

// PUT /api/categories/:id - Update a category
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const validatedData = updateCategorySchema.parse(req.body);
    const category = await categoryService.updateCategory(req.params.id, validatedData, familyId);
    res.json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error && error.message === 'Category not found') {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    next(error);
  }
});

// POST /api/categories/:id/delete-budgets - Delete all budgets for a category
router.post('/:id/delete-budgets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const deletedCount = await budgetService.deleteBudgetsForCategory(req.params.id, familyId);
    res.json({ success: true, deleted: deletedCount });
  } catch (error) {
    next(error);
  }
});

// POST /api/categories/:id/delete-rules - Delete all auto-categorization rules for a category
router.post('/:id/delete-rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const deletedCount = await autoCategorizeService.deleteRulesForCategory(req.params.id, familyId);
    res.json({ success: true, deleted: deletedCount });
  } catch (error) {
    next(error);
  }
});

// POST /api/categories/:id/recategorize-transactions - Recategorize all transactions from one category to another
router.post('/:id/recategorize-transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    const { newCategoryId } = req.body;

    // Validate newCategoryId (can be null for uncategorized or a valid category ID string)
    if (newCategoryId !== null && typeof newCategoryId !== 'string') {
      res.status(400).json({ error: 'Invalid newCategoryId. Must be a string or null.' });
      return;
    }

    const updatedCount = await transactionService.bulkRecategorizeByCategory(
      req.params.id,
      newCategoryId,
      familyId
    );
    res.json({ success: true, updated: updatedCount });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/categories/:id - Delete a category
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    await categoryService.deleteCategory(req.params.id, familyId);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error) {
      // 404 for not found
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      // 400 for any validation error (dependencies preventing deletion)
      if (error.message.includes('Cannot delete category')) {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
});


export default router;