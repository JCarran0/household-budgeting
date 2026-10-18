/**
 * Household Ledger — Zod Validators (HOUSEHOLD-LEDGER-BRD §3)
 *
 * The ledger is the one store the assistant both reads and (through confirmed
 * cards) writes, which is safe only because every write is human-gated or
 * deterministic (SEC-H001). This schema is where the gates that do not depend
 * on a person are enforced:
 *
 *   - a fact's id, source and allowed links agree (a document fact cannot
 *     claim to handle a deadline; an app fact must say what it handled)
 *   - every date is a real calendar date, and every rule is one code can
 *     compute (REQ-H004) — no zero-interval recurrences, no window that closes
 *     before it opens
 *   - every document fact's quotes appear verbatim on the cited pages of the
 *     stored document, and every date it relies on is printed in those quotes
 *     (verifyDocumentFact, REQ-H010 / SEC-H002)
 *
 * Storage keys:
 *   ledger_{familyId}        facts (LedgerFile)
 *   ledger_prefs_{familyId}  per-person snoozes and mutes (LedgerPrefsFile)
 *   ledger_sent_{familyId}   reminder idempotency log (plan L7)
 */

import { z } from 'zod';
import type { LedgerFact, LedgerFile, LedgerPrefsFile, LedgerSchedule } from '../shared/types';
import { isCalendarDate, resolveDate } from '../shared/utils/ledgerDates';
import { libraryDocIdSchema, pageText, type LibraryDocument } from './libraryValidators';

export const LEDGER_FORMAT_VERSION = 1;
export const LEDGER_MAX_FACTS = 5000;

const ledgerDate = z.string().refine(isCalendarDate, 'must be a calendar date (YYYY-MM-DD)');

export const ledgerOffsetSchema = z
  .object({
    years: z.number().int().min(-100).max(100).optional(),
    months: z.number().int().min(-1200).max(1200).optional(),
    days: z.number().int().min(-36_500).max(36_500).optional(),
  })
  .strict();

const dateSpecSchema = z.union([
  z.object({ date: ledgerDate }).strict(),
  z.object({ anchor: ledgerDate, offset: ledgerOffsetSchema }).strict(),
]);

export const ledgerScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note') }).strict(),
  z.object({ kind: z.literal('deadline'), due: dateSpecSchema }).strict(),
  z.object({ kind: z.literal('expiration'), due: dateSpecSchema }).strict(),
  z
    .object({ kind: z.literal('recurring'), first: dateSpecSchema, every: ledgerOffsetSchema, until: dateSpecSchema.optional() })
    .strict(),
  z.object({ kind: z.literal('window'), opens: dateSpecSchema, closes: dateSpecSchema }).strict(),
]);

/** A rule code can actually compute. Kept out of the union so each kind stays a plain object. */
function scheduleProblem(s: LedgerSchedule): string | null {
  try {
    if (s.kind === 'recurring') {
      const { years = 0, months = 0, days = 0 } = s.every;
      if (years < 0 || months < 0 || days < 0 || years + months + days === 0) {
        return 'recurring interval must be positive';
      }
      if (s.until && resolveDate(s.until) < resolveDate(s.first)) return 'recurrence ends before it starts';
    }
    if (s.kind === 'window' && resolveDate(s.closes) < resolveDate(s.opens)) {
      return 'window closes before it opens';
    }
    if (s.kind === 'deadline' || s.kind === 'expiration') resolveDate(s.due);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'date rule cannot be computed';
  }
}

export const ledgerQuoteSchema = z
  .object({
    page: z.number().int().min(1).max(1000),
    text: z.string().min(10).max(600),
  })
  .strict();

const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('document'), docId: libraryDocIdSchema, quotes: z.array(ledgerQuoteSchema).min(1).max(4) }).strict(),
  z.object({ kind: z.literal('user'), userId: z.string().min(1).max(100), via: z.enum(['card', 'form']) }).strict(),
  z
    .object({
      kind: z.literal('app'),
      event: z.enum(['marked_handled', 'task_completed']),
      userId: z.string().min(1).max(100).nullable(),
    })
    .strict(),
]);

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
/** `{docId}:{slug}` for document facts, `f_{uuid}` for everything else. */
const FACT_ID = new RegExp(`^(?:${SLUG}:${SLUG}|f_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`);
export const ledgerFactIdSchema = z.string().max(140).regex(FACT_ID, 'must be {docId}:{slug} or f_{uuid}');

export const ledgerFactSchema = z
  .object({
    id: ledgerFactIdSchema,
    subject: z.string().trim().min(2).max(120),
    title: z.string().trim().min(3).max(160),
    detail: z.string().max(2000).optional(),
    amount: z.string().trim().min(1).max(60).optional(),
    schedule: ledgerScheduleSchema,
    leadDays: z.array(z.number().int().min(0).max(730)).min(1).max(4).optional(),
    handles: z.object({ factId: ledgerFactIdSchema, occurrenceDate: ledgerDate }).strict().optional(),
    overrides: ledgerFactIdSchema.optional(),
    source: sourceSchema,
    trackFrom: ledgerDate,
    status: z.enum(['active', 'withdrawn']),
    createdAt: z.iso.datetime({ offset: true }),
    createdBy: z.string().min(1).max(100),
    updatedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    const problem = scheduleProblem(f.schedule);
    if (problem) ctx.addIssue({ code: 'custom', path: ['schedule'], message: problem });

    const isDoc = f.source.kind === 'document';
    if (isDoc && f.source.kind === 'document' && !f.id.startsWith(`${f.source.docId}:`)) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: 'a document fact id must start with its docId' });
    }
    if (!isDoc && !f.id.startsWith('f_')) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: 'only document facts use a {docId}: id' });
    }
    // Handling and correcting are things people (or code acting on a person's
    // click) do. A document cannot close a deadline or overrule another fact.
    if (f.handles && isDoc) {
      ctx.addIssue({ code: 'custom', path: ['handles'], message: 'a document fact cannot handle a deadline' });
    }
    if (f.overrides && f.source.kind !== 'user') {
      ctx.addIssue({ code: 'custom', path: ['overrides'], message: 'only a user fact can correct another fact' });
    }
    if (f.source.kind === 'app' && !f.handles) {
      ctx.addIssue({ code: 'custom', path: ['handles'], message: 'an app fact must say what it handled' });
    }
    if (f.handles?.factId === f.id || f.overrides === f.id) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: 'a fact cannot handle or override itself' });
    }
    if (f.leadDays && f.schedule.kind === 'note') {
      ctx.addIssue({ code: 'custom', path: ['leadDays'], message: 'an undated note has no warnings' });
    }
  });

export const ledgerFileSchema = z
  .object({
    formatVersion: z.literal(LEDGER_FORMAT_VERSION),
    facts: z.array(ledgerFactSchema).max(LEDGER_MAX_FACTS),
  })
  .strict()
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    file.facts.forEach((f, i) => {
      if (ids.has(f.id)) ctx.addIssue({ code: 'custom', path: ['facts', i, 'id'], message: `duplicate id ${f.id}` });
      ids.add(f.id);
    });
    file.facts.forEach((f, i) => {
      if (f.handles && !ids.has(f.handles.factId)) {
        ctx.addIssue({ code: 'custom', path: ['facts', i, 'handles'], message: `handles unknown fact ${f.handles.factId}` });
      }
      if (f.overrides && !ids.has(f.overrides)) {
        ctx.addIssue({ code: 'custom', path: ['facts', i, 'overrides'], message: `overrides unknown fact ${f.overrides}` });
      }
    });
    // An override cycle would leave no effective fact and no way to tell which was meant.
    const overrideOf = new Map(file.facts.filter(f => f.overrides).map(f => [f.id, f.overrides!]));
    for (const start of overrideOf.keys()) {
      const seen = new Set<string>([start]);
      let next = overrideOf.get(start);
      while (next) {
        if (seen.has(next)) {
          ctx.addIssue({ code: 'custom', path: ['facts'], message: `override cycle through ${start}` });
          break;
        }
        seen.add(next);
        next = overrideOf.get(next);
      }
    }
  });

const userPrefsSchema = z
  .object({
    snoozes: z.array(z.object({ occurrenceKey: z.string().min(3).max(200), until: ledgerDate }).strict()).max(500),
    mutedSubjects: z.array(z.string().min(2).max(120)).max(50),
  })
  .strict();

export const ledgerPrefsFileSchema = z
  .object({
    formatVersion: z.literal(LEDGER_FORMAT_VERSION),
    users: z.record(z.string().min(1).max(100), userPrefsSchema),
  })
  .strict();

// The schema is the contract; shared/types is what the frontend types against.
// Fail the build if they drift.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const factTypesAgree: Equals<z.infer<typeof ledgerFactSchema>, LedgerFact> = true;
const fileTypesAgree: Equals<z.infer<typeof ledgerFileSchema>, LedgerFile> = true;
const prefsTypesAgree: Equals<z.infer<typeof ledgerPrefsFileSchema>, LedgerPrefsFile> = true;
void factTypesAgree;
void fileTypesAgree;
void prefsTypesAgree;

export function ledgerKey(familyId: string): string {
  return `ledger_${familyId}`;
}
export function ledgerPrefsKey(familyId: string): string {
  return `ledger_prefs_${familyId}`;
}
export function ledgerSentKey(familyId: string): string {
  return `ledger_sent_${familyId}`;
}

// ---------------------------------------------------------------------------
// Document fact verification (REQ-H010, SEC-H002)
// ---------------------------------------------------------------------------

/** Verbatim modulo line wrapping: whitespace runs compare as one space. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The ways a contract prints a date: 10/17/2026, 10/06/2026, Oct 06, 2026, October 6, 2026, 2026-10-17 … */
export function printedForms(date: string): string[] {
  const [y, m, d] = date.split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const yy = String(y).slice(2);
  const full = MONTHS[m - 1];
  const short = full.slice(0, 3);
  const forms = [
    date,
    `${m}/${d}/${y}`, `${mm}/${dd}/${y}`, `${m}/${d}/${yy}`, `${mm}/${dd}/${yy}`,
    `${full} ${d}, ${y}`, `${full} ${dd}, ${y}`, `${short} ${d}, ${y}`, `${short} ${dd}, ${y}`,
    `${short}. ${d}, ${y}`, `${d} ${full} ${y}`,
  ];
  return Array.from(new Set(forms));
}

/** Every printed date a schedule relies on: literal dates and rule anchors. */
function scheduleDates(s: LedgerSchedule): string[] {
  const specs =
    s.kind === 'note' ? []
      : s.kind === 'recurring' ? [s.first, ...(s.until ? [s.until] : [])]
        : s.kind === 'window' ? [s.opens, s.closes]
          : [s.due];
  return specs.map(spec => ('date' in spec ? spec.date : spec.anchor));
}

/**
 * Check a document fact against the stored document. Returns every problem
 * found; an empty array means it verifies.
 *
 * What this proves: the quoted text is really on the cited pages, and every
 * date the schedule starts from is printed in those quotes. What it cannot
 * prove: that the offset was read correctly ("within 60 days") or that nothing
 * important was missed. Those are the two-model extraction and the
 * maintainer's review (REQ-H011).
 */
export function verifyDocumentFact(fact: LedgerFact, doc: LibraryDocument): string[] {
  if (fact.source.kind !== 'document') return ['not a document fact'];
  const problems: string[] = [];
  if (fact.source.docId !== doc.docId) problems.push(`source docId ${fact.source.docId} is not ${doc.docId}`);

  const quoted: string[] = [];
  fact.source.quotes.forEach((q, i) => {
    const page = pageText(doc.body, q.page);
    if (page === null) {
      problems.push(`quote ${i + 1}: page ${q.page} does not exist (document has ${doc.pageCount})`);
      return;
    }
    const needle = normalize(q.text);
    if (!normalize(page).includes(needle)) {
      problems.push(`quote ${i + 1}: not found verbatim on page ${q.page}`);
      return;
    }
    quoted.push(needle);
  });

  const allQuoted = quoted.join(' ‖ ');
  for (const date of scheduleDates(fact.schedule)) {
    if (!printedForms(date).some(form => allQuoted.includes(form))) {
      problems.push(`date ${date} is not printed in any quote — quote the line that states it`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Route and chat-action inputs (plan L5, L8)
//
// Inputs never carry an id, a source, a status or a timestamp: the service
// assigns those, so a caller cannot claim to be a document or an app event.
// ---------------------------------------------------------------------------

export const ledgerFactInputSchema = z
  .object({
    subject: z.string().trim().min(2).max(120),
    title: z.string().trim().min(3).max(160),
    detail: z.string().trim().max(2000).optional(),
    amount: z.string().trim().min(1).max(60).optional(),
    schedule: ledgerScheduleSchema,
    leadDays: z.array(z.number().int().min(0).max(730)).min(1).max(4).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const problem = scheduleProblem(input.schedule);
    if (problem) ctx.addIssue({ code: 'custom', path: ['schedule'], message: problem });
    if (input.leadDays && input.schedule.kind === 'note') {
      ctx.addIssue({ code: 'custom', path: ['leadDays'], message: 'an undated note has no warnings' });
    }
  });
export type LedgerFactInput = z.infer<typeof ledgerFactInputSchema>;

export const ledgerMarkHandledSchema = z
  .object({
    occurrenceDate: ledgerDate,
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const ledgerSnoozeSchema = z
  .object({
    occurrenceKey: z.string().min(3).max(200),
    until: ledgerDate,
  })
  .strict();

export const ledgerMuteSchema = z.object({ subject: z.string().trim().min(2).max(120), muted: z.boolean() }).strict();
