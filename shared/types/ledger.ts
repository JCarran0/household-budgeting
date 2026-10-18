// =============================================================================
// Household Ledger — HOUSEHOLD-LEDGER-BRD §3
// =============================================================================
//
// The Zod schema in backend/src/validators/ledgerValidators.ts is the contract;
// these interfaces are what the frontend and shared/utils/ledgerDates.ts type
// against. The validator asserts at compile time that the two agree.

/** YYYY-MM-DD, a calendar date in the household time zone (America/New_York). */
export type LedgerDate = string;

/**
 * A calendar offset. Applied years, then months, then days. A month step that
 * lands past the end of a month clamps to its last day (Jan 31 + 1 month =
 * Feb 28/29), so "the 6th year" can be written {years: 6, days: -1}.
 */
export interface LedgerOffset {
  years?: number;
  months?: number;
  days?: number;
}

/**
 * Either a date printed in a source, or one derived from such a date.
 * REQ-H004: a model never does the arithmetic — it supplies the anchor and the
 * offset, and code computes the date.
 */
export type LedgerDateSpec =
  | { date: LedgerDate }
  | { anchor: LedgerDate; offset: LedgerOffset };

export type LedgerSchedule =
  /** Undated: a memory or a term ("transfer fee is $50"). Never produces a reminder. */
  | { kind: 'note' }
  /** Something must happen by `due`. Stays on the Heads-up list, overdue, until handled. */
  | { kind: 'deadline'; due: LedgerDateSpec }
  /** Coverage or a term ends on `due`. Nothing to handle; drops off after it passes. */
  | { kind: 'expiration'; due: LedgerDateSpec }
  /** Repeats every `every` from `first`, through `until` if set. Each occurrence is handled separately. */
  | { kind: 'recurring'; first: LedgerDateSpec; every: LedgerOffset; until?: LedgerDateSpec }
  /** Something becomes possible on `opens` and stops being possible after `closes`. */
  | { kind: 'window'; opens: LedgerDateSpec; closes: LedgerDateSpec };

export type LedgerKind = LedgerSchedule['kind'];

/** A verbatim excerpt of a library document, verified against the stored body. */
export interface LedgerQuote {
  page: number;
  text: string;
}

/** REQ-H010 – H013: how the fact was allowed in. Determines what may change it. */
export type LedgerSource =
  | {
      kind: 'document';
      docId: string;
      /** First quote is the clause itself; any further quotes support the date's anchor. */
      quotes: LedgerQuote[];
    }
  | { kind: 'user'; userId: string; via: 'card' | 'form' }
  | { kind: 'app'; event: 'marked_handled' | 'task_completed'; userId: string | null };

export interface LedgerFact {
  /** `{docId}:{slug}` for document facts (stable across re-import); `f_{uuid}` otherwise. */
  id: string;
  /** The asset or area — matches a library document's `subject` where one exists. */
  subject: string;
  title: string;
  detail?: string;
  /** REQ-H003: as printed ("$2,078.45"), never parsed. */
  amount?: string;
  schedule: LedgerSchedule;
  /** Warning lead times in days, replacing the kind's defaults (REQ-H031). */
  leadDays?: number[];
  /** REQ-H022: this fact closes one occurrence of another. */
  handles?: { factId: string; occurrenceDate: LedgerDate };
  /** REQ-H020: this fact corrects another, which is then shown as overridden. */
  overrides?: string;
  source: LedgerSource;
  /**
   * Occurrences due before this date are history, not overdue. Defaults to the
   * date the fact was created, so importing a 2023 contract does not raise
   * three years of "overdue" audits.
   */
  trackFrom: LedgerDate;
  /** `withdrawn` only when a re-import no longer finds a document fact. Handled/overridden are derived. */
  status: 'active' | 'withdrawn';
  createdAt: string;
  /** userId, or 'import' for document facts. */
  createdBy: string;
  updatedAt?: string;
}

export interface LedgerFile {
  formatVersion: 1;
  facts: LedgerFact[];
}

/** Per-person reminder state (REQ-H040/H041). Never shared — one member's snooze must not hide an item from the other. */
export interface LedgerUserPrefs {
  snoozes: Array<{ occurrenceKey: string; until: LedgerDate }>;
  mutedSubjects: string[];
}

export interface LedgerPrefsFile {
  formatVersion: 1;
  users: Record<string, LedgerUserPrefs>;
}

/** One instance of a dated obligation. */
export interface LedgerOccurrence {
  factId: string;
  /** `{factId}@{dueDate}` — what a handled mark and a snooze refer to. */
  occurrenceKey: string;
  /** The date that matters: due date, expiry, or a window's closing date. */
  dueDate: LedgerDate;
  /** Windows only. */
  opensDate: LedgerDate | null;
  /** Dates on which a warning is due, earliest first, each with its lead in days (0 = on the day). */
  warnings: Array<{ date: LedgerDate; leadDays: number; milestone: 'due' | 'opens' }>;
}

export type HeadsUpPhase =
  /** Inside a warning window, not yet due. */
  | 'upcoming'
  /** A window that is open now. */
  | 'open'
  /** A deadline or recurring occurrence past due and not handled. */
  | 'overdue'
  /** An expiration that passed within the last EXPIRED_VISIBLE_DAYS. */
  | 'expired';

export interface HeadsUpItem {
  factId: string;
  occurrenceKey: string;
  subject: string;
  title: string;
  kind: LedgerKind;
  dueDate: LedgerDate;
  opensDate: LedgerDate | null;
  /** Negative when past due. */
  daysUntilDue: number;
  phase: HeadsUpPhase;
}
