/**
 * Household Ledger routes (HOUSEHOLD-LEDGER-BRD §3.3, plan L5)
 *
 * Personal workspace only (D-H07). The assistant reads the ledger, so the
 * routes sit behind the same refuseBusinessWorkspace guard as every AI route:
 * a token minted in the business workspace is refused whatever the client shows.
 *
 * Document facts are read-only here. They are corrected (POST /facts/:id/correct)
 * and never edited, so the quoted source and the household's view of it stay
 * separate and both visible.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ledgerService, ledgerStore, taskService } from '../services';
import { assertHandleable } from '../services/ledgerService';
import { authMiddleware } from '../middleware/authMiddleware';
import { refuseBusinessWorkspace } from '../middleware/refuseBusinessWorkspace';
import { AuthorizationError, ConflictError } from '../errors';
import {
  ledgerFactIdSchema,
  ledgerFactInputSchema,
  ledgerMarkHandledSchema,
  ledgerMuteSchema,
  ledgerSnoozeSchema,
} from '../validators/ledgerValidators';

const router = Router();
router.use(authMiddleware);
router.use(refuseBusinessWorkspace);

function who(req: Request): { familyId: string; userId: string } {
  const familyId = req.user?.familyId;
  const userId = req.user?.userId;
  if (!familyId || !userId) throw new AuthorizationError();
  return { familyId, userId };
}

type Handler = (req: Request, res: Response) => Promise<void>;

/** Zod failures are 400s; everything else goes to the error middleware. */
function handle(fn: Handler) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request data', details: error.format() });
        return;
      }
      next(error);
    }
  };
}

const factId = (req: Request): string => ledgerFactIdSchema.parse(req.params.id);

// GET /api/v1/ledger — facts, this person's Heads-up list and prefs
router.get('/', handle(async (req, res) => {
  const { familyId, userId } = who(req);
  res.json(await ledgerService.view(familyId, userId));
}));

router.post('/facts', handle(async (req, res) => {
  const { familyId, userId } = who(req);
  const input = ledgerFactInputSchema.parse(req.body);
  res.status(201).json(await ledgerService.createFact(familyId, userId, input, 'form'));
}));

router.put('/facts/:id', handle(async (req, res) => {
  const { familyId } = who(req);
  const input = ledgerFactInputSchema.parse(req.body);
  res.json(await ledgerService.updateFact(familyId, factId(req), input));
}));

router.delete('/facts/:id', handle(async (req, res) => {
  const { familyId } = who(req);
  await ledgerService.deleteFact(familyId, factId(req));
  res.status(204).send();
}));

router.post('/facts/:id/correct', handle(async (req, res) => {
  const { familyId, userId } = who(req);
  const input = ledgerFactInputSchema.parse(req.body);
  res.status(201).json(await ledgerService.correctFact(familyId, userId, factId(req), input));
}));

router.post('/facts/:id/handled', handle(async (req, res) => {
  const { familyId, userId } = who(req);
  const { occurrenceDate, note, outcome } = ledgerMarkHandledSchema.parse(req.body ?? {});
  const event = outcome === 'declined' ? 'declined' : 'marked_handled';
  res.status(201).json(await ledgerService.markHandled(familyId, userId, factId(req), occurrenceDate, note, event));
}));

// POST /api/v1/ledger/facts/:id/task — make an ordinary task for one occurrence (REQ-H034).
// Ownership lives in tasks; completing it marks the occurrence handled.
router.post('/facts/:id/task', handle(async (req, res) => {
  const { familyId, userId } = who(req);
  const id = factId(req);
  const { occurrenceDate } = ledgerMarkHandledSchema.pick({ occurrenceDate: true }).strict().parse(req.body ?? {});
  const fact = assertHandleable((await ledgerStore.read(familyId)).facts, id, occurrenceDate);
  const open = (await taskService.getAllTasks(familyId)).find(
    t => t.ledgerLink?.factId === id && t.ledgerLink.occurrenceDate === occurrenceDate && t.status !== 'done' && t.status !== 'cancelled',
  );
  if (open) throw new ConflictError(`A task already exists for this: "${open.title}"`, 'TASK_EXISTS');
  const task = await taskService.createTask(
    {
      title: fact.title.slice(0, 200),
      description: `From the Household Ledger (${fact.subject}). Completing this task marks it handled.`,
      dueDate: occurrenceDate,
      ledgerLink: { factId: id, occurrenceDate },
    },
    userId,
    familyId,
  );
  res.status(201).json(task);
}));

// DELETE /api/v1/ledger/handled/:id — undo a handled mark (id of the mark)
router.delete('/handled/:id', handle(async (req, res) => {
  const { familyId } = who(req);
  await ledgerService.unmarkHandled(familyId, factId(req));
  res.status(204).send();
}));

router.post('/snoozes', handle(async (req, res) => {
  const { familyId, userId } = who(req);
  const { occurrenceKey, until } = ledgerSnoozeSchema.parse(req.body);
  res.json(await ledgerService.snooze(familyId, userId, occurrenceKey, until));
}));

router.delete('/snoozes', handle(async (req, res) => {
  const { familyId, userId } = who(req);
  const { occurrenceKey } = z.object({ occurrenceKey: z.string().min(3).max(200) }).strict().parse(req.body ?? {});
  res.json(await ledgerService.unsnooze(familyId, userId, occurrenceKey));
}));

router.put('/mutes', handle(async (req, res) => {
  const { familyId, userId } = who(req);
  const { subject, muted } = ledgerMuteSchema.parse(req.body);
  res.json(await ledgerService.setMuted(familyId, userId, subject, muted));
}));

export default router;
