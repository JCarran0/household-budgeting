/**
 * Household Ledger date engine — HOUSEHOLD-LEDGER-BRD §3.1, §3.4, §3.5.
 *
 * The ONE place that decides what is due. The reminder job, the API and the
 * Heads-up card all call this; none of them may re-derive a date, a warning or
 * a phase on its own. Two implementations of "is this overdue?" is how one
 * screen says a deadline is handled while a push notification says it is not.
 *
 * Pure: no clock, no I/O. Callers pass `today` (use etDateString()), so every
 * rule here is testable at any date.
 *
 * Dates are calendar dates (YYYY-MM-DD) in the household time zone. All
 * arithmetic is done in UTC on those calendar dates, so a server running in
 * any zone computes the same answer.
 */

import type {
  HeadsUpItem,
  LedgerDate,
  LedgerDateSpec,
  LedgerFact,
  LedgerKind,
  LedgerOccurrence,
  LedgerOffset,
  LedgerUserPrefs,
} from '../types';

/** REQ-H031 default warning lead times, in days before the due date. */
export const DEFAULT_LEAD_DAYS: Record<Exclude<LedgerKind, 'note'>, readonly number[]> = {
  deadline: [30, 7],
  expiration: [90, 30],
  recurring: [60],
  window: [30],
};

/** How long a passed expiration stays on the Heads-up list. */
export const EXPIRED_VISIBLE_DAYS = 14;

/** How long a newly opened window stays on the list before going quiet until its closing warning. */
export const WINDOW_OPEN_VISIBLE_DAYS = 14;

/** Guard against a malformed recurrence expanding without bound. */
const MAX_OCCURRENCES = 500;

const DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const m = DATE_SHAPE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function parse(date: LedgerDate): { y: number; m: number; d: number } {
  const match = DATE_SHAPE.exec(date);
  if (!match || !isCalendarDate(date)) throw new Error(`not a calendar date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function format(y: number, m: number, d: number): LedgerDate {
  const dt = new Date(Date.UTC(y, m, d));
  const yy = String(dt.getUTCFullYear()).padStart(4, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/**
 * Apply an offset: years, then months, then days. A year or month step that
 * lands past the end of a month clamps to its last day, so Jan 31 + 1 month is
 * Feb 28 (or 29), never Mar 3.
 */
export function addOffset(date: LedgerDate, offset: LedgerOffset): LedgerDate {
  const { y, m, d } = parse(date);
  const totalMonths = y * 12 + m + (offset.years ?? 0) * 12 + (offset.months ?? 0);
  const ny = Math.floor(totalMonths / 12);
  const nm = totalMonths - ny * 12;
  const clamped = Math.min(d, daysInMonth(ny, nm));
  return format(ny, nm, clamped + (offset.days ?? 0));
}

/** `to - from` in whole days. */
export function daysBetween(from: LedgerDate, to: LedgerDate): number {
  const a = parse(from);
  const b = parse(to);
  return Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / 86_400_000);
}

export function resolveDate(spec: LedgerDateSpec): LedgerDate {
  if ('date' in spec) {
    parse(spec.date); // throws on a non-date, same as the anchor path
    return spec.date;
  }
  return addOffset(spec.anchor, spec.offset);
}

function isZeroOffset(o: LedgerOffset): boolean {
  return !(o.years || o.months || o.days);
}

export function occurrenceKey(factId: string, dueDate: LedgerDate): string {
  return `${factId}@${dueDate}`;
}

/** `{occurrenceKey}#{milestone}-{leadDays}` — the idempotency key for one warning. */
export function warningKey(occKey: string, milestone: 'due' | 'opens', leadDays: number): string {
  return `${occKey}#${milestone}-${leadDays}`;
}

function warningsFor(fact: LedgerFact, dueDate: LedgerDate, opensDate: LedgerDate | null): LedgerOccurrence['warnings'] {
  if (fact.schedule.kind === 'note') return [];
  const leads = fact.leadDays ?? DEFAULT_LEAD_DAYS[fact.schedule.kind];
  const out: LedgerOccurrence['warnings'] = Array.from(new Set(leads)).map(lead => ({
    date: addOffset(dueDate, { days: -lead }),
    leadDays: lead,
    milestone: 'due' as const,
  }));
  if (opensDate) out.push({ date: opensDate, leadDays: 0, milestone: 'opens' });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Every occurrence of a fact with a due date on or before `through`.
 * Notes have none. Occurrences before `trackFrom` are history and are dropped.
 */
export function occurrencesOf(fact: LedgerFact, through: LedgerDate): LedgerOccurrence[] {
  const s = fact.schedule;
  const build = (due: LedgerDate, opens: LedgerDate | null): LedgerOccurrence => ({
    factId: fact.id,
    occurrenceKey: occurrenceKey(fact.id, due),
    dueDate: due,
    opensDate: opens,
    warnings: warningsFor(fact, due, opens),
  });

  let all: LedgerOccurrence[];
  switch (s.kind) {
    case 'note':
      return [];
    case 'deadline':
    case 'expiration':
      all = [build(resolveDate(s.due), null)];
      break;
    case 'window':
      all = [build(resolveDate(s.closes), resolveDate(s.opens))];
      break;
    case 'recurring': {
      if (isZeroOffset(s.every)) throw new Error(`recurring fact ${fact.id} has a zero interval`);
      const first = resolveDate(s.first);
      const until = s.until ? resolveDate(s.until) : null;
      const end = until && until < through ? until : through;
      all = [];
      // Step from the first date by multiples of the interval rather than
      // chaining, so month-end clamping does not drift (Jan 31 → Feb 28 → Mar 28).
      for (let i = 0; i < MAX_OCCURRENCES; i++) {
        const due = addOffset(first, {
          years: (s.every.years ?? 0) * i,
          months: (s.every.months ?? 0) * i,
          days: (s.every.days ?? 0) * i,
        });
        if (due > end) break;
        all.push(build(due, null));
      }
      break;
    }
  }
  return all.filter(o => o.dueDate >= fact.trackFrom);
}

/**
 * Facts that count: active, and not overridden by another active fact
 * (REQ-H020). A correction fact replaces the original's schedule entirely.
 */
export function effectiveFacts(facts: LedgerFact[]): LedgerFact[] {
  const active = facts.filter(f => f.status === 'active');
  const overridden = new Set(active.map(f => f.overrides).filter((id): id is string => !!id));
  return active.filter(f => !overridden.has(f.id));
}

/** Occurrence keys closed by an active handling fact (REQ-H022). Shared across the household. */
export function handledKeys(facts: LedgerFact[]): Set<string> {
  return new Set(
    facts
      .filter(f => f.status === 'active' && f.handles)
      .map(f => occurrenceKey(f.handles!.factId, f.handles!.occurrenceDate)),
  );
}

export function isSnoozed(prefs: LedgerUserPrefs | undefined, occKey: string, today: LedgerDate): boolean {
  return !!prefs?.snoozes.some(s => s.occurrenceKey === occKey && s.until > today);
}

export function isMuted(prefs: LedgerUserPrefs | undefined, subject: string): boolean {
  return !!prefs?.mutedSubjects.includes(subject);
}

function maxLead(fact: LedgerFact): number {
  if (fact.schedule.kind === 'note') return 0;
  return Math.max(0, ...(fact.leadDays ?? DEFAULT_LEAD_DAYS[fact.schedule.kind]));
}

/**
 * The Heads-up list for one person on `today` (REQ-H033). Computed on read
 * from the same rules the reminder job uses, so it is right even when the job
 * has not run. `prefs` applies that person's snoozes; mute affects only
 * notifications (REQ-H041), never this list.
 *
 * Ordered overdue first, then by due date.
 */
export function computeHeadsUp(
  facts: LedgerFact[],
  today: LedgerDate,
  prefs?: LedgerUserPrefs,
): HeadsUpItem[] {
  const handled = handledKeys(facts);
  const items: HeadsUpItem[] = [];

  for (const fact of effectiveFacts(facts)) {
    if (fact.schedule.kind === 'note') continue;
    const kind = fact.schedule.kind;
    const horizon = addOffset(today, { days: maxLead(fact) + 1 });

    for (const occ of occurrencesOf(fact, horizon)) {
      if (handled.has(occ.occurrenceKey) || isSnoozed(prefs, occ.occurrenceKey, today)) continue;

      const daysUntilDue = daysBetween(today, occ.dueDate);
      const firstWarning = occ.warnings.find(w => w.milestone === 'due')?.date ?? occ.dueDate;
      let phase: HeadsUpItem['phase'] | null = null;

      if (kind === 'window') {
        const opens = occ.opensDate!;
        if (today > occ.dueDate || today < opens) phase = null;
        else if (daysBetween(opens, today) < WINDOW_OPEN_VISIBLE_DAYS || today >= firstWarning) phase = 'open';
      } else if (kind === 'expiration') {
        if (daysUntilDue < 0) phase = -daysUntilDue <= EXPIRED_VISIBLE_DAYS ? 'expired' : null;
        else if (today >= firstWarning) phase = 'upcoming';
      } else {
        // deadline, recurring: overdue until handled.
        if (daysUntilDue < 0) phase = 'overdue';
        else if (today >= firstWarning) phase = 'upcoming';
      }

      if (!phase) continue;
      items.push({
        factId: fact.id,
        occurrenceKey: occ.occurrenceKey,
        subject: fact.subject,
        title: fact.title,
        kind,
        dueDate: occ.dueDate,
        opensDate: occ.opensDate,
        daysUntilDue,
        phase,
      });
    }
  }

  const rank = (p: HeadsUpItem['phase']): number => (p === 'overdue' ? 0 : 1);
  return items.sort((a, b) => rank(a.phase) - rank(b.phase) || a.dueDate.localeCompare(b.dueDate));
}

export interface PendingWarning {
  fact: LedgerFact;
  occurrence: LedgerOccurrence;
  warning: LedgerOccurrence['warnings'][number];
  key: string;
  /**
   * Earlier warnings for the same occurrence that are also unsent — the server
   * was down, or the fact was added late. Only the latest is sent (REQ-H032
   * catch-up); these are marked sent with it so they never fire afterwards.
   */
  supersededKeys: string[];
}

/**
 * Warnings due to be sent on `today` for one person, given the keys already
 * sent to them. Applies that person's snoozes and subject mutes.
 *
 * Catch-up rule (REQ-H032): a warning whose date has passed is still sent
 * while its occurrence is live — but at most one per occurrence per run, the
 * most recent, so a restart never produces a burst of stale "30 days left"
 * notices. Once the due date (or a window's close) passes, nothing is sent;
 * the Heads-up list shows the item as overdue instead.
 */
export function pendingWarnings(
  facts: LedgerFact[],
  today: LedgerDate,
  sent: ReadonlySet<string>,
  prefs?: LedgerUserPrefs,
): PendingWarning[] {
  const handled = handledKeys(facts);
  const out: PendingWarning[] = [];

  for (const fact of effectiveFacts(facts)) {
    if (fact.schedule.kind === 'note' || isMuted(prefs, fact.subject)) continue;
    const horizon = addOffset(today, { days: maxLead(fact) + 1 });

    for (const occ of occurrencesOf(fact, horizon)) {
      if (today > occ.dueDate) continue;
      if (handled.has(occ.occurrenceKey) || isSnoozed(prefs, occ.occurrenceKey, today)) continue;

      const due = occ.warnings
        .filter(w => w.date <= today)
        .map(w => ({ w, key: warningKey(occ.occurrenceKey, w.milestone, w.leadDays) }))
        .filter(x => !sent.has(x.key));
      if (due.length === 0) continue;

      const latest = due[due.length - 1];
      out.push({
        fact,
        occurrence: occ,
        warning: latest.w,
        key: latest.key,
        supersededKeys: due.slice(0, -1).map(x => x.key),
      });
    }
  }
  return out;
}
