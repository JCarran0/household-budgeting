/**
 * Business Statement Routes — Phase 6.1
 *
 * Mounted at: GET/POST /api/v1/business/statements
 *             GET      /api/v1/business/statements/:id
 *
 * ALL routes are gated: the active workspace (req.user.familyId) must have
 * workspaceType === 'business'. Personal-workspace tokens receive 403.
 *
 * These routes are DARK-LAUNCHED — no UI calls them yet. They will be
 * connected in Phase 7 (PR5) when the business statement UI ships.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware';
import { statementService, familyService } from '../services';
import { AuthorizationError, NotFoundError } from '../errors';

const router = Router();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** YYYY-MM validated period month */
const periodMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'periodMonth must be YYYY-MM');

/** YYYY-MM-DD validated date */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'date must be YYYY-MM-DD');

const generateSchema = z.object({
  periodMonth: periodMonthSchema,
  paymentNumber: z.number().int().positive().optional(),
  paymentDate: isoDateSchema.optional(),
});

// ---------------------------------------------------------------------------
// Business-workspace guard middleware
// ---------------------------------------------------------------------------

/**
 * Reject the request with 403 if the active workspace is not a business
 * workspace. Loaded from familyService so it checks the real stored type.
 */
async function requireBusinessWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) {
      next(new AuthorizationError());
      return;
    }

    const family = await familyService.getFamily(familyId);
    if (!family || family.workspaceType !== 'business') {
      res.status(403).json({
        success: false,
        error: 'This endpoint is only available in a business workspace.',
        code: 'BUSINESS_WORKSPACE_REQUIRED',
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// All routes require auth + business workspace
// ---------------------------------------------------------------------------

router.use(authMiddleware);
router.use((req: Request, res: Response, next: NextFunction) => {
  void requireBusinessWorkspace(req, res, next);
});

// ---------------------------------------------------------------------------
// POST / — Generate a new statement
// ---------------------------------------------------------------------------

/**
 * @route POST /api/v1/business/statements
 * @desc  Generate and persist a royalty statement for the given period month.
 * @body  { periodMonth: string, paymentNumber?: number, paymentDate?: string }
 * @returns 201 { success: true, statement: BusinessStatement }
 */
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    let body: z.infer<typeof generateSchema>;
    try {
      body = generateSchema.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: err.format() });
        return;
      }
      throw err;
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const statement = await statementService.generateStatement(
      familyId,
      body.periodMonth,
      today,
      {
        paymentNumber: body.paymentNumber,
        paymentDate: body.paymentDate,
      },
    );

    res.status(201).json({ success: true, statement });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET / — List all statements
// ---------------------------------------------------------------------------

/**
 * @route GET /api/v1/business/statements
 * @desc  List all persisted statements for this workspace, desc by paymentNumber.
 * @returns 200 { success: true, statements: BusinessStatement[] }
 */
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    const statements = await statementService.listStatements(familyId);
    res.json({ success: true, statements });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /:id — Get one statement
// ---------------------------------------------------------------------------

/**
 * @route GET /api/v1/business/statements/:id
 * @desc  Retrieve a single statement by its UUID.
 * @returns 200 { success: true, statement: BusinessStatement } | 404
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    const statement = await statementService.getStatement(familyId, req.params.id);
    res.json({ success: true, statement });
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
});

export default router;
