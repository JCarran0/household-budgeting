/**
 * AI Activity Log & Undo — AI-CAPABILITY-PLATFORM-BRD §6.3, §5.4.
 *
 * GET  /activity          — every AI-originated write, newest first (REQ-P037)
 * POST /activity/:id/undo — reverse a batch or named rows (REQ-P026)
 * POST /activity/undo     — bulk undo across a time range (REQ-P038)
 *
 * WHY THIS IS A SEPARATE ROUTER FROM routes/chatbot.ts:
 * Partly size — chatbot.ts was near its budget. Mostly boundary: nothing here
 * talks to the model. These endpoints are operated by a human looking at a
 * list of changes, and keeping them out of the file that builds tool surfaces
 * and handles model output makes it harder to accidentally wire one to the
 * other.
 *
 * SECURITY:
 * - Behind the SAME refuseBusinessWorkspace guard as every other AI route
 *   (REQ-P016). Undo is a write path, so a business-workspace token reaching
 *   it would be worse than the read exposure that guard originally closed.
 * - Family-scoped from the JWT. An entryId from another household simply does
 *   not resolve, which is reported as not-found rather than forbidden so the
 *   endpoint does not confirm the id exists.
 * - There is deliberately NO chat action, tool, or propose_action path to any
 *   of this. Undo restores a value the user already approved changing; an
 *   agent-reachable undo would be a write primitive outside the proposal
 *   mechanism — the model could not choose the value, but it could choose the
 *   moment.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, validateBody } from '../middleware/authMiddleware';
import { refuseBusinessWorkspace } from '../middleware/refuseBusinessWorkspace';
import { actionActivityStore, actionUndoService } from '../services';

const router = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
});

const undoEntrySchema = z.object({
  /** Omitted means the whole batch — REQ-P026's "undo this batch" control. */
  rowIds: z.array(z.string().min(1)).min(1).optional(),
});

const undoRangeSchema = z.object({
  since: z.string().datetime(),
  until: z.string().datetime().optional(),
});

/**
 * REQ-P037. Returns what changed, when, under which conversation, and whether
 * each row can still be reversed.
 *
 * `before` values are stripped: the log shows what a row DID, and the prior
 * value is an implementation detail of undo. Shipping it would put a second
 * copy of task titles and transaction descriptions into a response that the
 * feature does not need, for no user-visible gain.
 */
router.get(
  '/activity',
  authenticate,
  refuseBusinessWorkspace,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { familyId } = req.user!;
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.message });
        return;
      }

      const entries = await actionActivityStore.list(familyId, parsed.data);
      res.json({
        success: true,
        entries: entries.map(entry => ({
          entryId: entry.entryId,
          createdAt: entry.createdAt,
          origin: entry.origin,
          conversationId: entry.conversationId,
          rows: entry.rows.map(row => ({
            rowId: row.rowId,
            actionId: row.actionId,
            displaySummary: row.displaySummary,
            resource: row.resource,
            undoable: row.undo.undoable && !row.undoneAt,
            undoUnavailableReason: row.undo.undoable ? undefined : row.undo.reason,
            undoneAt: row.undoneAt,
          })),
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/activity/:entryId/undo',
  authenticate,
  refuseBusinessWorkspace,
  validateBody(undoEntrySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, familyId } = req.user!;
      const body = req.body as z.infer<typeof undoEntrySchema>;

      const result = await actionUndoService.undoEntry(
        familyId,
        userId,
        req.params.entryId,
        body.rowIds,
      );
      if (!result) {
        // Family-scoped lookup, so an entry from another household is
        // indistinguishable from one that never existed.
        res.status(404).json({ success: false, error: 'That change could not be found.' });
        return;
      }

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

/** REQ-P038: bulk undo across a time range. */
router.post(
  '/activity/undo',
  authenticate,
  refuseBusinessWorkspace,
  validateBody(undoRangeSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, familyId } = req.user!;
      const body = req.body as z.infer<typeof undoRangeSchema>;
      const results = await actionUndoService.undoRange(familyId, userId, body);
      res.json({ success: true, results });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
