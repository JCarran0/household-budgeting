/**
 * Business Settings Routes — PR5 support (Task 1)
 *
 * Mounted at: GET /api/v1/business/settings
 *             PUT /api/v1/business/settings
 *
 * Stores and retrieves the per-workspace StatementHeader (business name/address,
 * client name/company/address) so the statement generator can snapshot the real
 * identity into each generated statement instead of using blank placeholders.
 *
 * Both routes are gated to business workspaces via requireBusinessWorkspace,
 * re-exported from businessStatements.ts (the original source of truth for that
 * guard). Personal-workspace tokens receive 403.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware';
import { businessSettingsService } from '../services';
import { AuthorizationError } from '../errors';
import { requireBusinessWorkspace } from './businessStatements';

const router = Router();

// ---------------------------------------------------------------------------
// Zod schema — StatementHeader (all five fields required; empty strings OK)
// ---------------------------------------------------------------------------

const statementHeaderSchema = z.object({
  businessName: z.string(),
  businessAddress: z.string(),
  clientName: z.string(),
  clientCompany: z.string(),
  clientAddress: z.string(),
});

const settingsSchema = z.object({
  header: statementHeaderSchema,
});

// ---------------------------------------------------------------------------
// All routes require auth + business workspace
// ---------------------------------------------------------------------------

router.use(authMiddleware);
router.use((req: Request, res: Response, next: NextFunction) => {
  void requireBusinessWorkspace(req, res, next);
});

// ---------------------------------------------------------------------------
// GET / — Load the per-workspace statement header config
// ---------------------------------------------------------------------------

/**
 * @route GET /api/v1/business/settings
 * @desc  Return the stored StatementHeader for this business workspace.
 *        All five fields are empty strings when no settings have been saved yet.
 * @returns 200 { success: true, header: StatementHeader }
 */
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    const settings = await businessSettingsService.getSettings(familyId);
    res.json({ success: true, header: settings.header });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PUT / — Persist the per-workspace statement header config
// ---------------------------------------------------------------------------

/**
 * @route PUT /api/v1/business/settings
 * @desc  Persist the StatementHeader for this business workspace. All five
 *        string fields are required and may each be an empty string.
 * @body  { header: StatementHeader }
 * @returns 200 { success: true, header: StatementHeader }
 */
router.put('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    let body: z.infer<typeof settingsSchema>;
    try {
      body = settingsSchema.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: err.format() });
        return;
      }
      throw err;
    }

    const saved = await businessSettingsService.saveSettings(familyId, {
      header: body.header,
    });
    res.json({ success: true, header: saved.header });
  } catch (error) {
    next(error);
  }
});

export default router;
