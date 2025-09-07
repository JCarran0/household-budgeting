import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { categoryService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Validation schemas
const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().nullable(),
  description: z.string().max(500).optional(),
  isHidden: z.boolean(),
  isRollover: z.boolean()
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isHidden: z.boolean().optional(),
  isRollover: z.boolean().optional()
});

// All routes require authentication
router.use(authMiddleware);

// GET /api/categories - Get all categories
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const categories = await categoryService.getAllCategories(userId);
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/categories/tree - Get categories in tree structure
router.get('/tree', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const tree = await categoryService.getCategoryTree(userId);
    res.json(tree);
  } catch (error) {
    console.error('Error fetching category tree:', error);
    res.status(500).json({ error: 'Failed to fetch category tree' });
  }
});

// GET /api/categories/parents - Get all parent categories
router.get('/parents', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const parents = await categoryService.getParentCategories(userId);
    res.json(parents);
  } catch (error) {
    console.error('Error fetching parent categories:', error);
    res.status(500).json({ error: 'Failed to fetch parent categories' });
  }
});

// GET /api/categories/hidden - Get hidden categories
router.get('/hidden', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const hidden = await categoryService.getHiddenCategories(userId);
    res.json(hidden);
  } catch (error) {
    console.error('Error fetching hidden categories:', error);
    res.status(500).json({ error: 'Failed to fetch hidden categories' });
  }
});

// GET /api/categories/savings - Get savings categories
router.get('/savings', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const rollover = await categoryService.getRolloverCategories(userId);
    res.json(rollover);
  } catch (error) {
    console.error('Error fetching rollover categories:', error);
    res.status(500).json({ error: 'Failed to fetch rollover categories' });
  }
});

// POST /api/categories/initialize - Initialize default categories
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    console.log('=== INITIALIZE CATEGORIES ENDPOINT CALLED ===');
    console.log('Request headers:', req.headers);
    console.log('Request user object:', req.user);
    
    const userId = req.user?.userId;
    if (!userId) {
      console.error('ERROR: No userId found in request. req.user is:', req.user);
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    console.log('Initializing categories for user:', userId);
    await categoryService.initializeDefaultCategories(userId);
    const categories = await categoryService.getAllCategories(userId);
    console.log('Categories initialized successfully:', categories.length);
    res.json({ message: 'Default categories initialized', categories });
  } catch (error) {
    console.error('ERROR in /categories/initialize:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ error: 'Failed to initialize default categories' });
  }
});

// POST /api/categories/import-csv - Import categories from CSV
router.post('/import-csv', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { csvContent } = req.body;
    
    if (!csvContent || typeof csvContent !== 'string') {
      res.status(400).json({ error: 'CSV content is required' });
      return;
    }

    // Set a longer timeout for this specific endpoint
    res.setTimeout(5 * 60 * 1000); // 5 minutes

    const result = await categoryService.importFromCSV(csvContent, userId);
    
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
    console.error('Error importing categories from CSV:', error);
    res.status(500).json({ 
      error: 'Failed to import categories',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/categories/:id - Get a specific category
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const category = await categoryService.getCategoryById(req.params.id, userId);
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// GET /api/categories/:id/subcategories - Get subcategories of a parent
router.get('/:id/subcategories', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const subcategories = await categoryService.getSubcategories(req.params.id, userId);
    res.json(subcategories);
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    res.status(500).json({ error: 'Failed to fetch subcategories' });
  }
});

// POST /api/categories - Create a new category
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const validatedData = createCategorySchema.parse(req.body);
    const category = await categoryService.createCategory(validatedData, userId);
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
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id - Update a category
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const validatedData = updateCategorySchema.parse(req.body);
    const category = await categoryService.updateCategory(req.params.id, validatedData, userId);
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
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id - Delete a category
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    await categoryService.deleteCategory(req.params.id, userId);
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
    // 500 only for unexpected server errors
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;