/**
 * Display helpers for the Household Ledger. Presentation only: what is due,
 * and when, always comes from shared/utils/ledgerDates (or the server's
 * Heads-up list), never from arithmetic here.
 */

import type { HeadsUpItem, LedgerKind, LedgerOffset, LedgerSchedule } from '../../../../shared/types';
import { resolveDate } from '../../../../shared/utils/ledgerDates';

export function friendlyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

export const KIND_LABEL: Record<LedgerKind, string> = {
  note: 'Note',
  deadline: 'Deadline',
  expiration: 'Expiration',
  window: 'Window',
  recurring: 'Recurring',
};

export const KIND_COLOR: Record<LedgerKind, string> = {
  note: 'gray',
  deadline: 'red',
  expiration: 'orange',
  window: 'blue',
  recurring: 'grape',
};

function every(o: LedgerOffset): string {
  const parts = [
    o.years ? `${o.years} year${o.years === 1 ? '' : 's'}` : null,
    o.months ? `${o.months} month${o.months === 1 ? '' : 's'}` : null,
    o.days ? `${o.days} day${o.days === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return parts.join(' ') || '—';
}

/** One line: "Due Nov 5, 2026", "Open Oct 17 – Dec 16, 2026", "Every 2 years from May 1, 2027". */
export function describeSchedule(s: LedgerSchedule): string {
  switch (s.kind) {
    case 'note': return 'No date';
    case 'deadline': return `Due ${friendlyDate(resolveDate(s.due))}`;
    case 'expiration': return `Expires ${friendlyDate(resolveDate(s.due))}`;
    case 'window': return `Open ${friendlyDate(resolveDate(s.opens))} – ${friendlyDate(resolveDate(s.closes))}`;
    case 'recurring': {
      const until = s.until ? ` until ${friendlyDate(resolveDate(s.until))}` : '';
      return `Every ${every(s.every)} from ${friendlyDate(resolveDate(s.first))}${until}`;
    }
  }
}

/** How a derived date was computed, so a person can check it against the contract. */
export function describeRule(s: LedgerSchedule): string | null {
  const specs = s.kind === 'note' ? [] : s.kind === 'window' ? [s.opens, s.closes] : s.kind === 'recurring' ? [s.first] : [s.due];
  const rules = specs.flatMap(spec => ('anchor' in spec ? [`${every(spec.offset)} from ${friendlyDate(spec.anchor)}`] : []));
  return rules.length ? `Computed: ${rules.join('; ')}` : null;
}

export const PHASE_LABEL: Record<HeadsUpItem['phase'], string> = {
  upcoming: 'Coming up',
  open: 'Open now',
  overdue: 'Overdue',
  expired: 'Expired',
};

export const PHASE_COLOR: Record<HeadsUpItem['phase'], string> = {
  upcoming: 'yellow',
  open: 'blue',
  overdue: 'red',
  expired: 'gray',
};

export function whenText(item: HeadsUpItem): string {
  const d = item.daysUntilDue;
  const verb = item.kind === 'window' ? 'closes' : item.kind === 'expiration' ? 'expires' : 'due';
  if (d === 0) return `${verb} today`;
  if (d === 1) return `${verb} tomorrow`;
  if (d > 1) return `${verb} in ${d} days`;
  return item.kind === 'expiration' ? `expired ${-d} days ago` : `${-d} days overdue`;
}

/** Whether "done" makes sense: expirations and notes have nothing to handle. */
export function isHandleable(kind: LedgerKind): boolean {
  return kind === 'deadline' || kind === 'window' || kind === 'recurring';
}

/** Dated facts first, soonest first; undated notes after. */
export function scheduleSortKey(s: LedgerSchedule): string {
  if (s.kind === 'note') return '9999-99-99';
  if (s.kind === 'window') return resolveDate(s.closes);
  if (s.kind === 'recurring') return resolveDate(s.first);
  return resolveDate(s.due);
}
