/**
 * LedgerService — the household's write paths into the ledger (plan L5, L8)
 *
 * Every write here is made on behalf of a person: the Household page's form,
 * a confirmed chat card, or a "done" click. Source is decided here, never by
 * the caller (SEC-H001):
 *
 *   - user facts (`via: 'form' | 'card'`) — created, edited and deleted only by
 *     this service; document facts are read-only and are corrected by override
 *   - app facts (`marked_handled`) — written when a person marks an occurrence
 *     done; withdrawn, not deleted, when they undo it
 *
 * Document facts enter only through the maintainer's import tooling (L3).
 */

import { randomUUID } from 'crypto';
import type { LedgerDocumentRef, LedgerFact, LedgerHandledEvent, LedgerUserPrefs, LedgerView } from '../shared/types';
import { etDateString } from '../shared/utils/easternTime';
import {
  computeHeadsUp,
  effectiveFacts,
  handledKeys,
  occurrenceKey,
  occurrencesOf,
  resolveDate,
} from '../shared/utils/ledgerDates';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';
import type { LedgerStore } from './ledgerStore';
import type { LedgerFactInput } from '../validators/ledgerValidators';

/** Resolves a cited library document for display. Absent or invalid documents resolve to null. */
export type LedgerDocumentLookup = (familyId: string, docId: string) => Promise<LedgerDocumentRef | null>;

const MAX_TITLE = 160;

function newFactId(): string {
  return `f_${randomUUID()}`;
}

/**
 * A single-occurrence fact a person enters is tracked from its own date when
 * that is earlier than today: someone typing in a deadline that already passed
 * wants to see it overdue, not have it vanish. A recurrence is tracked from
 * today so entering "annual inspection since 2019" raises no backlog.
 */
function trackFromFor(input: LedgerFactInput, today: string): string {
  const s = input.schedule;
  const single =
    s.kind === 'deadline' || s.kind === 'expiration' ? resolveDate(s.due) : s.kind === 'window' ? resolveDate(s.closes) : null;
  return single && single < today ? single : today;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The rule for marking an occurrence handled, shared by the service and the
 * chat action's pre-execution check (SEC-P030) so the two cannot disagree.
 * Returns the fact; throws a user-facing error otherwise.
 */
export function assertHandleable(facts: LedgerFact[], factId: string, occurrenceDate: string): LedgerFact {
  const target = effectiveFacts(facts).find(f => f.id === factId && !f.handles);
  if (!target) throw new NotFoundError('Fact not found, withdrawn, or replaced by a correction');
  if (target.schedule.kind === 'note' || target.schedule.kind === 'expiration') {
    throw new ValidationError('Only deadlines, windows and recurring items can be marked handled');
  }
  const key = occurrenceKey(factId, occurrenceDate);
  if (!occurrencesOf(target, occurrenceDate).some(o => o.occurrenceKey === key)) {
    throw new ValidationError(`"${target.title}" has no occurrence on ${occurrenceDate}`);
  }
  if (handledKeys(facts).has(key)) throw new ConflictError(`"${target.title}" is already marked handled`, 'ALREADY_HANDLED');
  return target;
}

export class LedgerService {
  constructor(
    private readonly store: LedgerStore,
    private readonly lookupDocument: LedgerDocumentLookup = async () => null,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private today(): string {
    return etDateString(this.clock());
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }

  async view(familyId: string, userId: string): Promise<LedgerView> {
    const [{ facts }, prefs] = await Promise.all([this.store.read(familyId), this.store.userPrefs(familyId, userId)]);
    const today = this.today();
    const docIds = [...new Set(facts.flatMap(f => (f.source.kind === 'document' ? [f.source.docId] : [])))];
    const documents: Record<string, LedgerDocumentRef> = {};
    await Promise.all(
      docIds.map(async id => {
        documents[id] = (await this.lookupDocument(familyId, id)) ?? { title: id, sourceUrl: null };
      }),
    );
    return { today, facts, headsUp: computeHeadsUp(facts, today, prefs), prefs, documents };
  }

  async createFact(
    familyId: string,
    userId: string,
    input: LedgerFactInput,
    via: 'form' | 'card',
  ): Promise<LedgerFact> {
    const fact: LedgerFact = {
      id: newFactId(),
      ...input,
      source: { kind: 'user', userId, via },
      trackFrom: trackFromFor(input, this.today()),
      status: 'active',
      createdAt: this.nowIso(),
      createdBy: userId,
    };
    return this.store.addFact(familyId, fact);
  }

  /** Correct a document fact (REQ-H020). The original stays; the correction is what counts. */
  async correctFact(familyId: string, userId: string, targetId: string, input: LedgerFactInput): Promise<LedgerFact> {
    const id = newFactId();
    const file = await this.store.update(familyId, facts => {
      const target = facts.find(f => f.id === targetId);
      if (!target) throw new NotFoundError('Fact not found');
      if (target.source.kind !== 'document') {
        throw new ValidationError('Only a fact from a document is corrected; edit your own facts directly');
      }
      const existing = facts.find(f => f.overrides === targetId && f.status === 'active');
      if (existing) throw new ConflictError('This fact already has a correction; edit that instead', 'ALREADY_CORRECTED');
      return [
        ...facts,
        {
          id,
          ...input,
          overrides: targetId,
          source: { kind: 'user', userId, via: 'form' },
          trackFrom: target.trackFrom,
          status: 'active',
          createdAt: this.nowIso(),
          createdBy: userId,
        },
      ];
    });
    return file.facts.find(f => f.id === id)!;
  }

  /** Edit a user fact. Document and app facts are not editable (REQ-H021). */
  async updateFact(familyId: string, id: string, input: LedgerFactInput): Promise<LedgerFact> {
    const file = await this.store.update(familyId, facts => {
      const target = facts.find(f => f.id === id);
      if (!target) throw new NotFoundError('Fact not found');
      if (target.source.kind !== 'user') throw new ForbiddenError('Only facts a person entered can be edited');
      // The input replaces every editable field, so an omitted optional field is cleared.
      const next: LedgerFact = {
        id: target.id,
        ...input,
        ...(target.overrides ? { overrides: target.overrides } : {}),
        source: target.source,
        trackFrom: target.trackFrom,
        status: target.status,
        createdAt: target.createdAt,
        createdBy: target.createdBy,
        updatedAt: this.nowIso(),
      };
      return facts.map(f => (f.id === id ? next : f));
    });
    return file.facts.find(f => f.id === id)!;
  }

  /**
   * Delete a user fact, and any handled marks on it (they mean nothing
   * without it). Deleting a correction restores the original fact.
   */
  async deleteFact(familyId: string, id: string): Promise<void> {
    await this.store.update(familyId, facts => {
      const target = facts.find(f => f.id === id);
      if (!target) throw new NotFoundError('Fact not found');
      if (target.source.kind !== 'user') throw new ForbiddenError('Only facts a person entered can be deleted');
      return facts.filter(f => f.id !== id && f.handles?.factId !== id);
    });
  }

  /** Mark one occurrence handled, for the whole household (REQ-H022, D-H06). */
  async markHandled(
    familyId: string,
    userId: string,
    factId: string,
    occurrenceDate: string,
    note?: string,
    event: LedgerHandledEvent = 'marked_handled',
  ): Promise<LedgerFact> {
    const id = newFactId();
    const file = await this.store.update(familyId, facts => {
      const target = assertHandleable(facts, factId, occurrenceDate);
      return [
        ...facts,
        {
          id,
          subject: target.subject,
          title: clip(`${event === 'declined' ? 'Declined' : 'Handled'}: ${target.title}`, MAX_TITLE),
          ...(note ? { detail: note } : {}),
          schedule: { kind: 'note' },
          handles: { factId, occurrenceDate },
          source: { kind: 'app', event, userId },
          trackFrom: this.today(),
          status: 'active',
          createdAt: this.nowIso(),
          createdBy: userId,
        },
      ];
    });
    return file.facts.find(f => f.id === id)!;
  }

  /**
   * REQ-H034: a task made from a Heads-up item was completed. Best effort — the
   * occurrence may already be handled, or the fact corrected or withdrawn since
   * the task was made; none of that should fail a task completion.
   */
  async markHandledFromTask(familyId: string, userId: string, task: { title: string; ledgerLink?: { factId: string; occurrenceDate: string } }): Promise<LedgerFact | null> {
    if (!task.ledgerLink) return null;
    try {
      return await this.markHandled(familyId, userId, task.ledgerLink.factId, task.ledgerLink.occurrenceDate, `Task completed: ${clip(task.title, 200)}`, 'task_completed');
    } catch (err) {
      if (err instanceof ConflictError || err instanceof NotFoundError || err instanceof ValidationError) return null;
      throw err;
    }
  }

  /** Undo a handled mark. Withdrawn, not deleted: who marked what stays on record. */
  async unmarkHandled(familyId: string, markId: string): Promise<void> {
    await this.store.update(familyId, facts => {
      const mark = facts.find(f => f.id === markId);
      if (!mark || !mark.handles || mark.status !== 'active') throw new NotFoundError('Handled mark not found');
      return facts.map(f => (f.id === markId ? { ...f, status: 'withdrawn' as const, updatedAt: this.nowIso() } : f));
    });
  }

  /** Per-person snooze (REQ-H040). Expired snoozes are pruned on every write. */
  async snooze(familyId: string, userId: string, key: string, until: string): Promise<LedgerUserPrefs> {
    const today = this.today();
    if (until <= today) throw new ValidationError('Snooze until a future date');
    return this.store.updateUserPrefs(familyId, userId, p => ({
      ...p,
      snoozes: [...p.snoozes.filter(s => s.occurrenceKey !== key && s.until > today), { occurrenceKey: key, until }],
    }));
  }

  async unsnooze(familyId: string, userId: string, key: string): Promise<LedgerUserPrefs> {
    const today = this.today();
    return this.store.updateUserPrefs(familyId, userId, p => ({
      ...p,
      snoozes: p.snoozes.filter(s => s.occurrenceKey !== key && s.until > today),
    }));
  }

  /** Mute a subject's notifications for one person (REQ-H041). The Heads-up list is unaffected. */
  async setMuted(familyId: string, userId: string, subject: string, muted: boolean): Promise<LedgerUserPrefs> {
    return this.store.updateUserPrefs(familyId, userId, p => ({
      ...p,
      mutedSubjects: muted
        ? Array.from(new Set([...p.mutedSubjects, subject]))
        : p.mutedSubjects.filter(s => s !== subject),
    }));
  }
}
