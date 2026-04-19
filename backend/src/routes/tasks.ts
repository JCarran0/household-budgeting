import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { taskService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError, NotFoundError } from '../errors';

const router = Router();

// Validation schemas

const subTaskCreateSchema = z.object({
  title: z.string().min(1).max(200),
});

const subTaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  completed: z.boolean(),
});

// Exported so the chat action handler can re-use the same schema.
// SECURITY (SEC-A004): One source of truth — tightening this schema
// automatically applies to both the HTTP route and the chat action path.
export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scope: z.enum(['family', 'personal']).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  subTasks: z.array(subTaskCreateSchema).max(50).optional(),
  status: z.enum(['todo', 'started']).optional(),
  /**
   * Optional explicit sortOrder. When omitted the service assigns top-of-column.
   * Used by Checklist v2.1 quick entry to insert a new task directly below the
   * user's cursor position rather than at the top of the column.
   */
  sortOrder: z.number().finite().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  scope: z.enum(['family', 'personal']).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  subTasks: z.array(subTaskSchema).max(50).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['todo', 'started', 'done', 'cancelled']),
  startedAt: z.string().datetime().optional(),
});

const leaderboardQuerySchema = z.object({
  timezone: z.string().min(1),
});

const snoozeSchema = z.object({
  snoozedUntil: z
    .string()
    .datetime()
    .nullable()
    .refine(
      (val) => val === null || new Date(val).getTime() > Date.now(),
      'snoozedUntil must be in the future'
    ),
});

const reorderSchema = z.object({
  status: z.enum(['todo', 'started', 'done', 'cancelled']),
  sortOrder: z.number().finite(),
});

const boardQuerySchema = z.object({
  includeSnoozed: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

// All routes require authentication
router.use(authMiddleware);

// POST /api/v1/tasks - Create task
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    const userId = req.user?.userId;
    if (!familyId || !userId) throw new AuthorizationError();
    const validatedData = createTaskSchema.parse(req.body);
    const task = await taskService.createTask(validatedData, userId, familyId);
    res.status(201).json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    next(error);
  }
});

// GET /api/v1/tasks - Get all tasks (for history view)
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const tasks = await taskService.getAllTasks(familyId);
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/tasks/board - Get board tasks (excludes archived; hides snoozed by default)
router.get('/board', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const { includeSnoozed } = boardQuerySchema.parse(req.query);
    const tasks = await taskService.getBoardTasks(familyId, { includeSnoozed });
    res.json(tasks);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query', details: error.format() });
      return;
    }
    next(error);
  }
});

// GET /api/v1/tasks/leaderboard - Get leaderboard
router.get('/leaderboard', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const { timezone } = leaderboardQuerySchema.parse(req.query);
    const leaderboard = await taskService.getLeaderboard(familyId, timezone);
    res.json(leaderboard);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'timezone query parameter is required' });
      return;
    }
    next(error);
  }
});

// GET /api/v1/tasks/:id - Get single task
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const task = await taskService.getTask(req.params.id, familyId);
    if (!task) {
      next(new NotFoundError('Task not found'));
      return;
    }
    res.json(task);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/tasks/:id - Update task fields (not status)
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    const userId = req.user?.userId;
    if (!familyId || !userId) throw new AuthorizationError();
    const validatedData = updateTaskSchema.parse(req.body);
    const task = await taskService.updateTask(req.params.id, validatedData, userId, familyId);
    res.json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error && error.message === 'Task not found') {
      next(new NotFoundError('Task not found'));
      return;
    }
    next(error);
  }
});

// PATCH /api/v1/tasks/:id/status - Update task status
router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    const userId = req.user?.userId;
    if (!familyId || !userId) throw new AuthorizationError();
    const { status, startedAt } = updateStatusSchema.parse(req.body);
    const task = await taskService.updateTaskStatus(
      req.params.id,
      status,
      userId,
      familyId,
      startedAt ? { startedAt } : {}
    );
    res.json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error && error.message === 'Task not found') {
      next(new NotFoundError('Task not found'));
      return;
    }
    next(error);
  }
});

// POST /api/v1/tasks/:id/snooze - Set or clear snoozedUntil
router.post('/:id/snooze', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    const { snoozedUntil } = snoozeSchema.parse(req.body);
    const task = await taskService.snoozeTask(req.params.id, snoozedUntil, familyId);
    res.json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error) {
      if (error.message === 'Task not found') {
        next(new NotFoundError('Task not found'));
        return;
      }
      if (error.message === 'Cannot snooze a done or cancelled task') {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
});

// POST /api/v1/tasks/:id/reorder - Update sortOrder (and optionally status)
router.post('/:id/reorder', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    const userId = req.user?.userId;
    if (!familyId || !userId) throw new AuthorizationError();
    const { status, sortOrder } = reorderSchema.parse(req.body);
    const task = await taskService.reorderTask(
      req.params.id,
      status,
      sortOrder,
      userId,
      familyId
    );
    res.json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.format() });
      return;
    }
    if (error instanceof Error) {
      if (error.message === 'Task not found') {
        next(new NotFoundError('Task not found'));
        return;
      }
      if (error.message === 'Reorder not allowed for done or cancelled tasks') {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
});

// DELETE /api/v1/tasks/:id - Delete task
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();
    await taskService.deleteTask(req.params.id, familyId);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === 'Task not found') {
      next(new NotFoundError('Task not found'));
      return;
    }
    next(error);
  }
});

export default router;
