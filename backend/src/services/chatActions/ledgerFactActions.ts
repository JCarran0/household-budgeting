/**
 * remember_fact and mark_fact_handled Chat Actions (T1) — HOUSEHOLD-LEDGER-BRD
 * REQ-H012, H014, H062, SEC-H001, SEC-H003
 *
 * WHY T1 AND NEVER T2:
 * The ledger is agent-readable. A store the agent can both read and write
 * unattended is prompt injection with durable storage (AI-AGENT-LEARNINGS
 * SEC-L006): text in a document or a receipt could plant a "fact" the
 * assistant would later repeat as the household's own. Every write therefore
 * passes a person, on a card that shows every field.
 *
 * WHY remember_fact IS NARROW:
 * It records what a household member SAID — "we sent the opt-out email",
 * "the registration renews March 3". It takes a literal date only (no anchor
 * and offset: the person reads the date on the card, so the card must show the
 * date that will be stored), and no window or recurrence shapes. Facts drawn
 * from document text are not this path; they come from the verified import
 * (REQ-H010). Corrections, recurrences and windows are made on the Household
 * page.
 *
 * Every param is a scalar so the card renders each one as written (SEC-P010).
 */

import { z } from 'zod';
import { registerChatAction } from './registry';
import { ledgerService, ledgerStore } from '../index';
import { assertHandleable } from '../ledgerService';
import { isCalendarDate } from '../../shared/utils/ledgerDates';
import { ledgerFactIdSchema, type LedgerFactInput } from '../../validators/ledgerValidators';

const calendarDate = z.string().refine(isCalendarDate, 'must be a calendar date (YYYY-MM-DD)');

const rememberFactParamsSchema = z
  .object({
    subject: z.string().trim().min(2).max(120),
    title: z.string().trim().min(3).max(160),
    detail: z.string().trim().min(1).max(1000).optional(),
    kind: z.enum(['note', 'deadline', 'expiration']),
    date: calendarDate.optional(),
  })
  .strict()
  .refine(p => (p.kind === 'note') === (p.date === undefined), {
    message: 'a note has no date; a deadline or expiration needs one',
    path: ['date'],
  });
type RememberFactParams = z.infer<typeof rememberFactParamsSchema>;

function toInput(p: RememberFactParams): LedgerFactInput {
  const base = { subject: p.subject, title: p.title, ...(p.detail ? { detail: p.detail } : {}) };
  if (p.kind === 'note') return { ...base, schedule: { kind: 'note' } };
  return { ...base, schedule: { kind: p.kind, due: { date: p.date! } } };
}

registerChatAction<RememberFactParams>({
  actionId: 'remember_fact',
  label: 'Remember this in the Household Ledger',
  tier: 'T1',
  dataClass: 'content',
  paramsSchema: rememberFactParamsSchema,

  async execute(params, ctx) {
    const fact = await ledgerService.createFact(ctx.familyId, ctx.userId, toInput(params), 'card');
    return { type: 'ledger_fact', id: fact.id, url: `/household?factId=${fact.id}`, label: fact.title };
  },
});

const markHandledParamsSchema = z
  .object({
    factId: ledgerFactIdSchema,
    occurrenceDate: calendarDate,
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
type MarkHandledParams = z.infer<typeof markHandledParamsSchema>;

registerChatAction<MarkHandledParams>({
  actionId: 'mark_fact_handled',
  label: 'Mark a ledger item handled',
  tier: 'T1',
  dataClass: 'content',
  paramsSchema: markHandledParamsSchema,

  /** SEC-P030: the same rule the service applies, before any row in the batch writes. */
  async validateSemantics(params, ctx) {
    const { facts } = await ledgerStore.read(ctx.familyId);
    assertHandleable(facts, params.factId, params.occurrenceDate);
  },

  /** SEC-P011: show which item and which occurrence, since two can share a title. */
  async describeCurrent(params, ctx) {
    const { facts } = await ledgerStore.read(ctx.familyId);
    const fact = facts.find(f => f.id === params.factId);
    if (!fact) return null;
    return [
      { key: 'factId', label: 'Item', value: `${fact.subject} — ${fact.title}`, editable: false, type: 'text' },
      { key: 'occurrenceDate', label: 'Currently', value: `Not handled (due ${params.occurrenceDate})`, editable: false, type: 'text' },
    ];
  },

  async execute(params, ctx) {
    const mark = await ledgerService.markHandled(ctx.familyId, ctx.userId, params.factId, params.occurrenceDate, params.note);
    return { type: 'ledger_fact', id: params.factId, url: `/household?factId=${params.factId}`, label: mark.title };
  },
});
