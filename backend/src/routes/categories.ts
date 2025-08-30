import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CategoryService } from '../services/categoryService';
import { JSONDataService } from '../services/dataService';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Validation schemas
const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().nullable(),
  plaidCategory: z.string().nullable(),
  isHidden: z.boolean(),
  isSavings: z.boolean()
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  plaidCategory: z.string().nullable().optional(),
  isHidden: z.boolean().optional(),
  isSavings: z.boolean().optional()
});

// Initialize service
const dataService = new JSONDataService();
const categoryService = new CategoryService(dataService);

// All routes require authentication
router.use(authMiddleware);

// GET /api/categories - Get all categories
router.get('/', async (_req: Request, res: Response) => {
  try {
    const categories = await categoryService.getAllCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/categories/tree - Get categories in tree structure
router.get('/tree', async (_req: Request, res: Response) => {
  try {
    const tree = await categoryService.getCategoryTree();
    res.json(tree);
  } catch (error) {
    console.error('Error fetching category tree:', error);
    res.status(500).json({ error: 'Failed to fetch category tree' });
  }
});

// GET /api/categories/parents - Get all parent categories
router.get('/parents', async (_req: Request, res: Response) => {
  try {
    const parents = await categoryService.getParentCategories();
    res.json(parents);
  } catch (error) {
    console.error('Error fetching parent categories:', error);
    res.status(500).json({ error: 'Failed to fetch parent categories' });
  }
});

// GET /api/categories/hidden - Get hidden categories
router.get('/hidden', async (_req: Request, res: Response) => {
  try {
    const hidden = await categoryService.getHiddenCategories();
    res.json(hidden);
  } catch (error) {
    console.error('Error fetching hidden categories:', error);
    res.status(500).json({ error: 'Failed to fetch hidden categories' });
  }
});

// GET /api/categories/savings - Get savings categories
router.get('/savings', async (_req: Request, res: Response) => {
  try {
    const savings = await categoryService.getSavingsCategories();
    res.json(savings);
  } catch (error) {
    console.error('Error fetching savings categories:', error);
    res.status(500).json({ error: 'Failed to fetch savings categories' });
  }
});

// GET /api/categories/:id - Get a specific category
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const category = await categoryService.getCategoryById(req.params.id);
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
    const subcategories = await categoryService.getSubcategories(req.params.id);
    res.json(subcategories);
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    res.status(500).json({ error: 'Failed to fetch subcategories' });
  }
});

// POST /api/categories - Create a new category
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = createCategorySchema.parse(req.body);
    const category = await categoryService.createCategory(validatedData);
    res.status(201).json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error) {
      if (error.message.includes('Parent category not found') || 
          error.message.includes('Cannot create subcategory')) {
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
    const validatedData = updateCategorySchema.parse(req.body);
    const category = await categoryService.updateCategory(req.params.id, validatedData);
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
    await categoryService.deleteCategory(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// POST /api/categories/initialize - Initialize default categories
router.post('/initialize', async (_req: Request, res: Response) => {
  try {
    await categoryService.initializeDefaultCategories();
    const categories = await categoryService.getAllCategories();
    res.json({ message: 'Default categories initialized', categories });
  } catch (error) {
    console.error('Error initializing default categories:', error);
    res.status(500).json({ error: 'Failed to initialize default categories' });
  }
});

export default router;