import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { projectService, categoryService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError, NotFoundError, ConflictError } from '../errors';

const router = Router();

// Validation schemas

const createProjectSchema = z
  .object({
    name: z.string().min(1).max(100),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD'),
    totalBudget: z.number().positive().nullable().optional(),
    categoryBudgets: z
      .array(
        z.object({
          categoryId: z.string().min(1),
          amount: z.number().positive()
        })
      )
      .optional(),
    notes: z.string().max(2000).optional()
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate']
  })
  .refine((data) => {
    const categorySum = (data.categoryBudgets ?? []).reduce((sum, cb) => sum + cb.amount, 0);
    if (categorySum === 0) return true;
    if (data.totalBudget == null) return false;
    return data.totalBudget >= categorySum;
  }, {
    message: 'Total budget is required and must be at least the sum of category budgets',
    path: ['totalBudget']
  });

const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').optional(),
    totalBudget: z.number().positive().nullable().optional(),
    categoryBudgets: z
      .array(
        z.object({
          categoryId: z.string().min(1),
          amount: z.number().positive()
        })
      )
      .optional(),
    notes: z.string().max(2000).optional()
  })
  .refine(
    (data) => {
      if (data.startDate !== undefined && data.endDate !== undefined) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'endDate must be on or after startDate',
      path: ['endDate']
    }
  )
  .refine((data) => {
    if (data.categoryBudgets === undefined) return true;
    const categorySum = data.categoryBudgets.reduce((sum, cb) => sum + cb.amount, 0);
    if (categorySum === 0) return true;
    if (data.totalBudget === undefined) return true; // not updating totalBudget in this request
    if (data.totalBudget == null) return false;
    return data.totalBudget >= categorySum;
  }, {
    message: 'Total budget is required and must be at least the sum of category budgets',
    path: ['totalBudget']
  });

// All routes require authentication
router.use(authMiddleware);

// POST /api/v1/projects - Create project
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const validatedData = createProjectSchema.parse(req.body);
    const project = await projectService.createProject(validatedData, userId);
    res.status(201).json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error && error.message === 'A project with this tag already exists') {
      next(new ConflictError(error.message));
      return;
    }
    next(error);
  }
});

// GET /api/v1/projects - List all projects
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const projects = await projectService.getAllProjects(userId, year);
    res.json(projects);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/projects/summaries - Get all project summaries (for card grid)
router.get('/summaries', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const categories = await categoryService.getAllCategories(userId);
    const categoryInfo = categories.map((c) => ({ id: c.id, name: c.name }));
    const summaries = await projectService.getProjectsSummaries(userId, year, categoryInfo);
    res.json(summaries);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/projects/:id - Get single project
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const project = await projectService.getProject(req.params.id, userId);
    if (!project) {
      next(new NotFoundError('Project not found'));
      return;
    }
    res.json(project);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/projects/:id/summary - Get project with spending breakdown
router.get('/:id/summary', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const categories = await categoryService.getAllCategories(userId);
    const categoryInfo = categories.map((c) => ({ id: c.id, name: c.name }));
    const summary = await projectService.getProjectSummary(req.params.id, userId, categoryInfo);
    if (!summary) {
      next(new NotFoundError('Project not found'));
      return;
    }
    res.json(summary);
  } catch (error) {
    if (error instanceof Error && error.message === 'Project not found') {
      next(new NotFoundError('Project not found'));
      return;
    }
    next(error);
  }
});

// PUT /api/v1/projects/:id - Update project
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    const validatedData = updateProjectSchema.parse(req.body);
    const project = await projectService.updateProject(req.params.id, validatedData, userId);
    res.json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error && error.message === 'Project not found') {
      next(new NotFoundError('Project not found'));
      return;
    }
    if (error instanceof Error && error.message === 'A project with this tag already exists') {
      next(new ConflictError(error.message));
      return;
    }
    next(error);
  }
});

// DELETE /api/v1/projects/:id - Delete project
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AuthorizationError();
    await projectService.deleteProject(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === 'Project not found') {
      next(new NotFoundError('Project not found'));
      return;
    }
    next(error);
  }
});

export default router;
