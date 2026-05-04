import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { taskTemplateService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError, NotFoundError } from '../errors';

const router = Router();

// Validation schemas

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  defaultDescription: z.string().max(2000).optional(),
  defaultAssigneeId: z.string().nullable().optional(),
  defaultScope: z.enum(['family', 'personal']).optional(),
  defaultTags: z.array(z.string().min(1).max(50)).max(20).optional(),
  defaultSubTasks: z.array(z.string().min(1).max(200)).max(50).optional(),
  pinned: z.boolean().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  defaultDescription: z.string().max(2000).optional(),
  defaultAssigneeId: z.string().nullable().optional(),
  defaultScope: z.enum(['family', 'personal']).optional(),
  defaultTags: z.array(z.string().min(1).max(50)).max(20).optional(),
  defaultSubTasks: z.array(z.string().min(1).max(200)).max(50).optional(),
  sortOrder: z.number().int().positive().optional(),
  pinned: z.boolean().optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string()),
});

// All routes require authentication
router.use(authMiddleware);

// POST /api/v1/task-templates - Create template
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const validatedData = createTemplateSchema.parse(req.body);
    const template = await taskTemplateService.createTemplate(validatedData, familyId);
    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    next(error);
  }
});

// GET /api/v1/task-templates - List all templates (sorted)
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const templates = await taskTemplateService.getTemplates(familyId);
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/task-templates/reorder - Reorder templates
// NOTE: This must be above /:id to avoid matching "reorder" as an id
router.put('/reorder', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const { orderedIds } = reorderSchema.parse(req.body);
    const templates = await taskTemplateService.reorderTemplates(orderedIds, familyId);
    res.json(templates);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    next(error);
  }
});

// PUT /api/v1/task-templates/:id - Update template
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const validatedData = updateTemplateSchema.parse(req.body);
    const template = await taskTemplateService.updateTemplate(req.params.id, validatedData, familyId);
    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error && error.message === 'Template not found') {
      next(new NotFoundError('Template not found'));
      return;
    }
    next(error);
  }
});

// DELETE /api/v1/task-templates/:id - Delete template
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    await taskTemplateService.deleteTemplate(req.params.id, familyId);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === 'Template not found') {
      next(new NotFoundError('Template not found'));
      return;
    }
    next(error);
  }
});

export default router;
