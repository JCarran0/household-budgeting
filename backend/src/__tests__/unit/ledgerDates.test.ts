/**
 * Household Ledger date engine — HOUSEHOLD-LEDGER-BRD §3.1, §3.4, §3.5
 *
 * The engine is the single answer to "what is due", shared by the Heads-up
 * card, the API and the reminder job. These tests pin the calendar arithmetic
 * a model is never allowed to do, and the visibility rules that decide whether
 * a deadline is shown, sent, or quietly forgotten.
 */

import {
  addOffset,
  computeHeadsUp,
  daysBetween,
  isCalendarDate,
  occurrencesOf,
  pendingWarnings,
  resolveDate,
  warningKey,
} from '../../shared/utils/ledgerDates';
import type { LedgerUserPrefs } from '../../shared/types';
import { docFact, handledFact, userFact } from '../helpers/ledgerFixtures';

const NO_PREFS: LedgerUserPrefs = { snoozes: [], mutedSubjects: [] };

describe('calendar arithmetic', () => {
  it('rejects dates that do not exist', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-1-01')).toBe(false);
  });

  it('clamps a month step to the end of the target month', () => {
    expect(addOffset('2026-01-31', { months: 1 })).toBe('2026-02-28');
    expect(addOffset('2028-01-31', { months: 1 })).toBe('2028-02-29');
    expect(addOffset('2026-03-31', { months: -1 })).toBe('2026-02-28');
    expect(addOffset('2028-02-29', { years: 1 })).toBe('2029-02-28');
  });

  it('applies years and months before days, so "through the 6th year" is {years: 6, days: -1}', () => {
    expect(addOffset('2026-10-17', { years: 6, days: -1 })).toBe('2032-10-16');
    expect(addOffset('2026-03-01', { years: 0, days: -1 })).toBe('2026-02-28');
    expect(addOffset('2026-12-20', { days: 15 })).toBe('2027-01-04');
  });

  it('counts days across a leap day', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-10-17', '2026-10-10')).toBe(-7);
  });

  it('resolves a literal date and refuses a non-date', () => {
    expect(resolveDate({ date: '2026-12-16' })).toBe('2026-12-16');
    expect(resolveDate({ anchor: '2026-10-17', offset: { days: 60 } })).toBe('2026-12-16');
    expect(() => resolveDate({ date: '2026-02-30' })).toThrow(/calendar date/);
  });
});

describe('occurrencesOf', () => {
  it('steps a monthly recurrence from the first date, so month-end clamping does not drift', () => {
    const fact = docFact('payment', { kind: 'recurring', first: { date: '2026-01-31' }, every: { months: 1 } });
    expect(occurrencesOf(fact, '2026-05-31').map(o => o.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });

  it('stops at until and drops occurrences before trackFrom', () => {
    const fact = docFact(
      'audit',
      { kind: 'recurring', first: { date: '2023-05-01' }, every: { years: 1 }, until: { date: '2028-05-01' } },
      { trackFrom: '2026-10-17' },
    );
    expect(occurrencesOf(fact, '2040-01-01').map(o => o.dueDate)).toEqual(['2027-05-01', '2028-05-01']);
  });

  it('gives a window one occurrence keyed on its closing date, with an opening warning', () => {
    const fact = docFact('refund', { kind: 'window', opens: { date: '2026-11-01' }, closes: { date: '2026-12-16' } });
    const [occ] = occurrencesOf(fact, '2027-01-01');
    expect(occ.occurrenceKey).toBe('rivian-care:refund@2026-12-16');
    expect(occ.opensDate).toBe('2026-11-01');
    expect(occ.warnings).toEqual([
      { date: '2026-11-01', leadDays: 0, milestone: 'opens' },
      { date: '2026-11-16', leadDays: 30, milestone: 'due' },
    ]);
  });

  it('uses per-fact lead days in place of the kind default', () => {
    const fact = docFact('opt-out', { kind: 'deadline', due: { date: '2026-11-05' } }, { leadDays: [14, 3, 3] });
    expect(occurrencesOf(fact, '2027-01-01')[0].warnings.map(w => w.leadDays)).toEqual([14, 3]);
  });

  it('refuses a zero interval rather than looping', () => {
    const fact = docFact('bad', { kind: 'recurring', first: { date: '2026-01-01' }, every: {} });
    expect(() => occurrencesOf(fact, '2027-01-01')).toThrow(/zero interval/);
  });

  it('gives a note no occurrences', () => {
    expect(occurrencesOf(docFact('fee', { kind: 'note' }), '2030-01-01')).toEqual([]);
  });
});

describe('computeHeadsUp', () => {
  const phaseOn = (facts: Parameters<typeof computeHeadsUp>[0], today: string, prefs?: LedgerUserPrefs) =>
    computeHeadsUp(facts, today, prefs).map(i => `${i.factId}:${i.phase}`);

  it('shows a window when it opens, goes quiet, and returns at the closing warning', () => {
    const facts = [docFact('refund', { kind: 'window', opens: { date: '2026-11-01' }, closes: { date: '2026-12-16' } })];
    expect(phaseOn(facts, '2026-10-31')).toEqual([]);
    expect(phaseOn(facts, '2026-11-01')).toEqual(['rivian-care:refund:open']);
    expect(phaseOn(facts, '2026-11-14')).toEqual(['rivian-care:refund:open']);
    expect(phaseOn(facts, '2026-11-15')).toEqual([]);
    expect(phaseOn(facts, '2026-11-16')).toEqual(['rivian-care:refund:open']);
    expect(phaseOn(facts, '2026-12-16')).toEqual(['rivian-care:refund:open']);
    expect(phaseOn(facts, '2026-12-17')).toEqual([]);
  });

  it('shows an expiration from its first warning and for 14 days after it passes', () => {
    const facts = [docFact('coverage', { kind: 'expiration', due: { date: '2026-12-31' } })];
    expect(phaseOn(facts, '2026-10-01')).toEqual([]);
    expect(phaseOn(facts, '2026-10-02')).toEqual(['rivian-care:coverage:upcoming']);
    expect(phaseOn(facts, '2027-01-14')).toEqual(['rivian-care:coverage:expired']);
    expect(phaseOn(facts, '2027-01-15')).toEqual([]);
  });

  it('keeps a deadline overdue until someone marks it handled, for the whole household', () => {
    const deadline = docFact('opt-out', { kind: 'deadline', due: { date: '2026-10-01' } });
    expect(phaseOn([deadline], '2027-06-01')).toEqual(['rivian-care:opt-out:overdue']);
    const handled = handledFact(deadline, '2026-10-01');
    expect(phaseOn([deadline, handled], '2027-06-01')).toEqual([]);
    expect(phaseOn([deadline, { ...handled, status: 'withdrawn' }], '2027-06-01')).toEqual([
      'rivian-care:opt-out:overdue',
    ]);
  });

  it('handles each recurring occurrence separately', () => {
    const fact = docFact('audit', { kind: 'recurring', first: { date: '2026-05-01' }, every: { years: 1 } });
    const items = computeHeadsUp([fact, handledFact(fact, '2026-05-01')], '2027-04-01');
    expect(items.map(i => [i.dueDate, i.phase])).toEqual([['2027-05-01', 'upcoming']]);
  });

  it('applies one person’s snooze without hiding the item from the other', () => {
    const fact = docFact('opt-out', { kind: 'deadline', due: { date: '2026-11-05' } });
    const key = 'rivian-care:opt-out@2026-11-05';
    const mine: LedgerUserPrefs = { snoozes: [{ occurrenceKey: key, until: '2026-10-20' }], mutedSubjects: [] };
    expect(phaseOn([fact], '2026-10-17', mine)).toEqual([]);
    expect(phaseOn([fact], '2026-10-17', NO_PREFS)).toEqual(['rivian-care:opt-out:upcoming']);
    expect(phaseOn([fact], '2026-10-20', mine)).toEqual(['rivian-care:opt-out:upcoming']);
  });

  it('ignores mute: muting stops notifications, not the list', () => {
    const fact = docFact('opt-out', { kind: 'deadline', due: { date: '2026-11-05' } });
    const muted: LedgerUserPrefs = { snoozes: [], mutedSubjects: ['2026 Rivian R2'] };
    expect(phaseOn([fact], '2026-10-17', muted)).toEqual(['rivian-care:opt-out:upcoming']);
  });

  it('shows a correction in place of the fact it overrides', () => {
    const original = docFact('opt-out', { kind: 'deadline', due: { date: '2026-11-05' } });
    const fix = userFact({ kind: 'deadline', due: { date: '2026-11-07' } }, { overrides: original.id });
    expect(computeHeadsUp([original, fix], '2026-10-17').map(i => i.factId)).toEqual([fix.id]);
    expect(computeHeadsUp([original, { ...fix, status: 'withdrawn' }], '2026-10-17').map(i => i.factId)).toEqual([
      original.id,
    ]);
  });

  it('orders overdue items first, then by due date', () => {
    const late = docFact('late', { kind: 'deadline', due: { date: '2026-10-01' } });
    const soon = docFact('soon', { kind: 'deadline', due: { date: '2026-10-20' } });
    const later = docFact('later', { kind: 'deadline', due: { date: '2026-11-10' } });
    expect(computeHeadsUp([later, soon, late], '2026-10-17').map(i => [i.factId, i.daysUntilDue])).toEqual([
      ['rivian-care:late', -16],
      ['rivian-care:soon', 3],
      ['rivian-care:later', 24],
    ]);
  });
});

describe('pendingWarnings', () => {
  const deadline = docFact('opt-out', { kind: 'deadline', due: { date: '2026-11-10' } });
  const occ = 'rivian-care:opt-out@2026-11-10';

  it('sends the warning whose date has arrived', () => {
    const [w] = pendingWarnings([deadline], '2026-10-11', new Set());
    expect(w.key).toBe(warningKey(occ, 'due', 30));
    expect(w.supersededKeys).toEqual([]);
    expect(pendingWarnings([deadline], '2026-10-10', new Set())).toEqual([]);
  });

  it('catches up with only the latest missed warning and supersedes the rest', () => {
    const [w, ...rest] = pendingWarnings([deadline], '2026-11-05', new Set());
    expect(rest).toEqual([]);
    expect(w.key).toBe(warningKey(occ, 'due', 7));
    expect(w.supersededKeys).toEqual([warningKey(occ, 'due', 30)]);
  });

  it('sends nothing already sent, past due, handled, snoozed or muted', () => {
    const sent = new Set([warningKey(occ, 'due', 30), warningKey(occ, 'due', 7)]);
    expect(pendingWarnings([deadline], '2026-11-05', sent)).toEqual([]);
    expect(pendingWarnings([deadline], '2026-11-11', new Set())).toEqual([]);
    expect(pendingWarnings([deadline, handledFact(deadline, '2026-11-10')], '2026-11-05', new Set())).toEqual([]);
    const snoozed = { snoozes: [{ occurrenceKey: occ, until: '2026-11-06' }], mutedSubjects: [] };
    expect(pendingWarnings([deadline], '2026-11-05', new Set(), snoozed)).toEqual([]);
    const muted = { snoozes: [], mutedSubjects: ['2026 Rivian R2'] };
    expect(pendingWarnings([deadline], '2026-11-05', new Set(), muted)).toEqual([]);
  });

  it('announces a window opening on the day it opens', () => {
    const window = docFact('refund', { kind: 'window', opens: { date: '2026-11-01' }, closes: { date: '2026-12-16' } });
    const [w] = pendingWarnings([window], '2026-11-01', new Set());
    expect(w.warning).toEqual({ date: '2026-11-01', leadDays: 0, milestone: 'opens' });
  });
});
