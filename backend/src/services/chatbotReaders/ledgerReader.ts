/**
 * Chatbot Ledger Reader — HOUSEHOLD-LEDGER-BRD REQ-H060
 *
 * The assistant's view of the Household Ledger: the facts that count, with
 * every date already computed, every handled mark folded onto the occurrence
 * it closes, and every correction shown beside the fact it replaced.
 *
 * - Reads through ReadOnlyDataService (SEC-018). Writes reach the ledger only
 *   through the two confirmed chat actions (L8) and the Household page.
 * - Validated on read; a file that fails is reported `unreadable`, never as an
 *   empty ledger, because "nothing is due" is the one wrong answer that cannot
 *   be noticed.
 * - Per-person snoozes and mutes are not exposed: they are one member's
 *   reminder preferences, not household facts.
 * - Document facts carry their quotes and pages so the assistant can cite
 *   them; it reads the document itself for anything beyond the quote.
 */

import type { LedgerFact, LedgerSchedule } from '../../shared/types';
import { etDateString } from '../../shared/utils/easternTime';
import { addOffset, effectiveFacts, handledKeys, occurrencesOf, resolveDate } from '../../shared/utils/ledgerDates';
import { ledgerFileSchema, ledgerKey } from '../../validators/ledgerValidators';
import type { ReadOnlyDataService } from '../readOnlyDataService';

const FAMILY_ID_SHAPE = /^[A-Za-z0-9-]{1,64}$/;
const DEFAULT_HORIZON_DAYS = 365;
const MAX_HORIZON_DAYS = 3650;
const MAX_UPCOMING = 200;

export interface ReadLedgerInput {
  /** Only facts whose subject contains this text (case-insensitive). */
  subject?: string;
  /** List occurrences due on or before this date (YYYY-MM-DD). Default: a year from today. */
  through?: string;
}

interface LedgerFactView {
  id: string;
  subject: string;
  title: string;
  detail?: string;
  amount?: string;
  kind: LedgerSchedule['kind'];
  /** Computed dates. A rule's anchor and offset are shown so the assistant can explain the date. */
  dates: Record<string, string>;
  source:
    | { kind: 'document'; docId: string; quotes: Array<{ page: number; text: string }> }
    | { kind: 'user'; enteredOn: string }
    | { kind: 'app' };
  /** Present when a household member corrected a document fact; the correction is what counts. */
  corrects?: { id: string; title: string; source: 'document' };
  handled: Array<{ occurrenceDate: string; markedOn: string; note?: string }>;
}

interface UpcomingOccurrence {
  factId: string;
  subject: string;
  title: string;
  kind: LedgerSchedule['kind'];
  dueDate: string;
  opensDate: string | null;
  handled: boolean;
}

export type ReadLedgerResult =
  | { status: 'unreadable' }
  | {
      status: 'ok';
      today: string;
      through: string;
      facts: LedgerFactView[];
      upcoming: UpcomingOccurrence[];
      upcomingTruncated: boolean;
      rangeError?: string;
    };

function describeDates(s: LedgerSchedule): Record<string, string> {
  const spec = (name: string, d: Parameters<typeof resolveDate>[0]): Record<string, string> =>
    'date' in d
      ? { [name]: d.date }
      : { [name]: resolveDate(d), [`${name}Rule`]: `${JSON.stringify(d.offset)} from ${d.anchor}` };
  switch (s.kind) {
    case 'note': return {};
    case 'deadline':
    case 'expiration': return spec('due', s.due);
    case 'window': return { ...spec('opens', s.opens), ...spec('closes', s.closes) };
    case 'recurring':
      return { ...spec('first', s.first), every: JSON.stringify(s.every), ...(s.until ? spec('until', s.until) : {}) };
  }
}

export class ChatbotLedgerReader {
  constructor(private readonly data: ReadOnlyDataService) {}

  async readLedger(familyId: string, input: ReadLedgerInput = {}): Promise<ReadLedgerResult> {
    if (typeof familyId !== 'string' || !FAMILY_ID_SHAPE.test(familyId)) throw new Error('invalid familyId');
    const raw = await this.data.getData<unknown>(ledgerKey(familyId));
    const parsed = raw === null ? { success: true as const, data: { formatVersion: 1 as const, facts: [] } } : ledgerFileSchema.safeParse(raw);
    if (!parsed.success) return { status: 'unreadable' };

    const all = parsed.data.facts;
    const today = etDateString();
    let through = addOffset(today, { days: DEFAULT_HORIZON_DAYS });
    let rangeError: string | undefined;
    if (input.through !== undefined) {
      const max = addOffset(today, { days: MAX_HORIZON_DAYS });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.through)) rangeError = `through must be YYYY-MM-DD; used ${through}`;
      else if (input.through > max) { through = max; rangeError = `through capped at ${max}`; }
      else through = input.through;
    }

    const needle = input.subject?.trim().toLowerCase();
    const byId = new Map(all.map(f => [f.id, f]));
    const marks = all.filter(f => f.status === 'active' && f.handles);
    const facts = effectiveFacts(all).filter(f => !f.handles && (!needle || f.subject.toLowerCase().includes(needle)));

    const views: LedgerFactView[] = facts.map(f => {
      const original = f.overrides ? byId.get(f.overrides) : undefined;
      return {
        id: f.id,
        subject: f.subject,
        title: f.title,
        ...(f.detail ? { detail: f.detail } : {}),
        ...(f.amount ? { amount: f.amount } : {}),
        kind: f.schedule.kind,
        dates: describeDates(f.schedule),
        source: this.sourceView(f),
        ...(original ? { corrects: { id: original.id, title: original.title, source: 'document' as const } } : {}),
        handled: marks
          .filter(m => m.handles!.factId === f.id)
          .map(m => ({ occurrenceDate: m.handles!.occurrenceDate, markedOn: m.createdAt.slice(0, 10), ...(m.detail ? { note: m.detail } : {}) })),
      };
    });

    const handled = handledKeys(all);
    const upcoming: UpcomingOccurrence[] = [];
    for (const f of facts) {
      if (f.schedule.kind === 'note') continue;
      for (const occ of occurrencesOf(f, through)) {
        // Past occurrences matter only while open: an unhandled deadline is still owed.
        const isHandled = handled.has(occ.occurrenceKey);
        if (occ.dueDate < today && (isHandled || f.schedule.kind === 'expiration' || f.schedule.kind === 'window')) continue;
        upcoming.push({
          factId: f.id,
          subject: f.subject,
          title: f.title,
          kind: f.schedule.kind,
          dueDate: occ.dueDate,
          opensDate: occ.opensDate,
          handled: isHandled,
        });
      }
    }
    upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return {
      status: 'ok',
      today,
      through,
      facts: views,
      upcoming: upcoming.slice(0, MAX_UPCOMING),
      upcomingTruncated: upcoming.length > MAX_UPCOMING,
      ...(rangeError ? { rangeError } : {}),
    };
  }

  private sourceView(f: LedgerFact): LedgerFactView['source'] {
    if (f.source.kind === 'document') return { kind: 'document', docId: f.source.docId, quotes: f.source.quotes };
    if (f.source.kind === 'user') return { kind: 'user', enteredOn: f.createdAt.slice(0, 10) };
    return { kind: 'app' };
  }
}
