/**
 * ActionUndoService — reverses recorded AI writes.
 *
 * Implements AI-CAPABILITY-PLATFORM-BRD REQ-P026 / REQ-P027 and REQ-P038.
 *
 * THE RULE THAT MATTERS IS "SKIP, DO NOT CLOBBER":
 * REQ-P027 says undo must degrade safely — if a record was modified after the
 * AI batch, undo skips it and reports, rather than writing an older value over
 * a newer human edit. That check lives HERE rather than in each action, using
 * the fingerprint recorded at write time, so no action can implement it subtly
 * wrong and no future action can forget it. An action only has to say how to
 * read and restore its own record.
 *
 * Undo is idempotent (REQ-P027): a row already reversed reports
 * 'already_undone' and writes nothing. Re-undoing must not re-apply.
 *
 * SECURITY: not reachable by the model. See the ActionActivityStore docblock —
 * an agent-reachable undo would be a write primitive outside the proposal
 * mechanism.
 */

import { getChatAction } from './chatActions/registry';
import { fingerprint, type UndoRowOutcome } from './chatActions/undoSnapshot';
import type { ActionActivityStore, ActivityEntry } from './actionActivityStore';
import { childLogger } from '../utils/logger';

const log = childLogger('actionUndo');

export interface UndoResult {
  entryId: string;
  outcomes: UndoRowOutcome[];
  /** True when at least one row was actually reversed. */
  changed: boolean;
}

export class ActionUndoService {
  constructor(private readonly activity: ActionActivityStore) {}

  /**
   * Reverse some or all rows of one recorded batch.
   *
   * `rowIds` omitted means the whole batch — REQ-P026's "undo this batch"
   * control. Rows are reversed in REVERSE order of application, so a batch that
   * created a record and then modified it unwinds in the order that leaves no
   * intermediate state.
   */
  async undoEntry(
    familyId: string,
    userId: string,
    entryId: string,
    rowIds?: string[],
  ): Promise<UndoResult | null> {
    const entry = await this.activity.get(familyId, entryId);
    if (!entry) return null;

    const selected = rowIds
      ? entry.rows.filter(r => rowIds.includes(r.rowId))
      : entry.rows;

    const outcomes: UndoRowOutcome[] = [];
    const undone: string[] = [];

    for (const row of [...selected].reverse()) {
      outcomes.push(await this.undoRow(entry, row, familyId, userId, undone));
    }

    if (undone.length > 0) {
      await this.activity.markUndone(familyId, entryId, userId, undone);
    }

    // Restore display order — rows were processed in reverse.
    outcomes.reverse();
    return { entryId, outcomes, changed: undone.length > 0 };
  }

  private async undoRow(
    entry: ActivityEntry,
    row: ActivityEntry['rows'][number],
    familyId: string,
    userId: string,
    undone: string[],
  ): Promise<UndoRowOutcome> {
    if (row.undoneAt) {
      // Idempotent by design: re-undoing must not re-apply.
      return { rowId: row.rowId, status: 'already_undone' };
    }
    if (!row.undo.undoable) {
      return { rowId: row.rowId, status: 'not_undoable', detail: row.undo.reason };
    }

    const def = getChatAction(row.actionId);
    if (!def?.undo) {
      // The action was deregistered or lost its undo capability since the write.
      return {
        rowId: row.rowId,
        status: 'not_undoable',
        detail: 'This action can no longer be reversed automatically.',
      };
    }

    const ctx = { userId, familyId };

    try {
      const current = await def.undo.read(row.undo.recordId, ctx);
      if (current === null) {
        return {
          rowId: row.rowId,
          status: 'skipped_missing',
          detail: `"${row.resource.label}" no longer exists.`,
        };
      }

      // REQ-P027, the load-bearing check. A mismatch means a human edited the
      // record after the AI touched it; their edit wins.
      if (fingerprint(current) !== row.undo.fingerprintAfter) {
        return {
          rowId: row.rowId,
          status: 'skipped_modified',
          detail: `"${row.resource.label}" has changed since then, so it was left alone.`,
        };
      }

      await def.undo.restore(row.undo.recordId, row.undo.before, ctx);
      undone.push(row.rowId);
      return { rowId: row.rowId, status: 'undone' };
    } catch (err) {
      log.error(
        { err, entryId: entry.entryId, rowId: row.rowId, actionId: row.actionId },
        'undo failed for row',
      );
      return {
        rowId: row.rowId,
        status: 'skipped_missing',
        detail: 'Could not reverse this change.',
      };
    }
  }

  /**
   * REQ-P038: bulk undo across a time range. Newest entries first, so a range
   * that includes a create-then-edit sequence unwinds the edit before the create.
   */
  async undoRange(
    familyId: string,
    userId: string,
    range: { since: string; until?: string },
  ): Promise<UndoResult[]> {
    const entries = await this.activity.list(familyId, range);
    const results: UndoResult[] = [];
    for (const entry of entries) {
      const result = await this.undoEntry(familyId, userId, entry.entryId);
      if (result) results.push(result);
    }
    return results;
  }
}
