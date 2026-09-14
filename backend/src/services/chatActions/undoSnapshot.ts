/**
 * Undo Snapshots — AI-CAPABILITY-PLATFORM-BRD §5.4 (REQ-P025 – REQ-P027).
 *
 * Every confirmed AI write records what the affected record looked like BEFORE
 * it changed, so the change can be reversed from the activity log (§6.3).
 *
 * WHY THIS IS A PREREQUISITE RATHER THAN A NICETY:
 * SEC-P001 gates the entire unattended tier on "reversible in one click". That
 * gate is unenforceable until one-click reversal exists, which is why REQ-P081
 * puts undo before T2 — and why the T2 list is still empty despite two
 * T2-eligible actions being registered.
 *
 * DESIGN: the snapshot holds the FULL prior record, not a diff. A diff has to
 * be interpreted at restore time against a record that may have moved on, and
 * interpreting it wrong writes a state that never existed. A full prior record
 * plus a fingerprint answers the only two questions that matter: what was it,
 * and has anyone touched it since.
 *
 * SECURITY — UNDO IS NOT A CAPABILITY:
 * Nothing in this file is reachable by the model. There is no undo tool, no
 * undo action in the registry, and no propose_action path to it. Undo is
 * user-initiated from the UI against a recorded snapshot, which means it can
 * only ever restore a value the user already approved being changed. An
 * agent-reachable undo would be a write primitive that bypasses the proposal
 * mechanism entirely — the model could not choose the value, but it could
 * choose the moment, and "revert the categorisation you just approved" is a
 * mutation nobody consented to.
 */

import { createHash } from 'crypto';

/** What a snapshot is capable of restoring. */
export type UndoTargetKind = 'task' | 'transaction' | 'trip_stop' | 'project';

/**
 * An action's undo capability, as three small functions rather than one.
 *
 * Splitting capture from read is what makes change detection work without every
 * action implementing it. The route captures prior state before the write,
 * re-reads the same record after the write to fingerprint it, and re-reads it
 * again at undo time. If the two fingerprints differ, somebody edited the
 * record in between and undo skips it (REQ-P027) — no action has to know that
 * rule, and none can get it subtly wrong.
 *
 * An action that omits `undo` entirely is irreversible, which is the safe
 * default: the activity log says "cannot be undone" rather than offering a
 * control that quietly does nothing. submit_github_issue is the standing
 * example — a posted issue cannot be unposted, and pretending otherwise would
 * be worse than admitting it.
 */
export interface UndoCapability<TParams> {
  kind: UndoTargetKind;
  /**
   * Prior state, captured immediately BEFORE execute.
   *
   * `recordId: null` means "the record this action is about to create" — the
   * id does not exist yet, and the route fills it in from the resource execute
   * returns. `before: null` means the record did not exist, so restoring it
   * means removing it again.
   */
  capture: (
    params: TParams,
    ctx: { userId: string; familyId: string },
  ) => Promise<{ recordId: string | null; before: unknown } | null>;
  /**
   * Read the record as it stands now. Returns null if it is gone.
   *
   * Must return the same SHAPE that `capture` puts in `before`, because the two
   * are fingerprint-compared. Returning a wider shape here than capture records
   * would make every undo look like a modified record and refuse to run.
   */
  read: (
    recordId: string,
    ctx: { userId: string; familyId: string },
  ) => Promise<unknown | null>;
  /** Put `before` back. Called only after the fingerprint check has passed. */
  restore: (
    recordId: string,
    before: unknown,
    ctx: { userId: string; familyId: string },
  ) => Promise<void>;
}

/**
 * Stable hash of a record for change detection.
 *
 * Key order is normalised because storage round-trips do not guarantee it, and
 * a fingerprint that changed when nothing did would make undo refuse to run on
 * records nobody touched — failing closed in a way that looks like data loss.
 */
export function fingerprint(record: unknown): string {
  return createHash('sha256').update(stableStringify(record)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  // Date survives a storage round-trip as an ISO string on some paths and a
  // Date on others; normalising keeps the two from reading as a change.
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Outcome of attempting to reverse one row. */
export type UndoRowStatus =
  | 'undone'
  /** REQ-P027: the record moved on. Skipped deliberately, never clobbered. */
  | 'skipped_modified'
  /** The record is gone entirely — deleted since the write. */
  | 'skipped_missing'
  /** The action declared itself irreversible. */
  | 'not_undoable'
  /** Already reversed. Undo is idempotent, so this is a success, not an error. */
  | 'already_undone';

export interface UndoRowOutcome {
  rowId: string;
  status: UndoRowStatus;
  detail?: string;
}
