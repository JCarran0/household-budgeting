/**
 * ActionActivityStore — the user-facing record of every AI-originated write.
 *
 * Implements AI-CAPABILITY-PLATFORM-BRD §6.3 (REQ-P037 – REQ-P040) and holds
 * the undo handles of §5.4 (REQ-P025 – REQ-P027).
 *
 * WHY IT EXISTS, AND WHAT IT SUPERSEDES
 * AI-CHAT-ACTIONS-BRD D-14 deliberately did NOT persist action outcomes: every
 * write required a click and stayed visible in the conversation, so the
 * conversation was the receipt. That reasoning was sound and does not survive
 * plan cards or unattended writes — forty rows approved in one click are not
 * forty things the user watched happen, and a page refresh takes the only
 * record with it. REQ-P040 supersedes D-14 for exactly that reason.
 *
 * WHY IT GATES THE UNATTENDED TIER
 * SEC-P001 makes "reversible in one click" a precondition for T2. Until undo
 * exists, that gate cannot be enforced, which is what REQ-P081 encodes and why
 * the T2 list is still empty despite T2-eligible actions being registered.
 *
 * SECURITY BOUNDARIES
 * - Family-scoped by storage key (`ai_activity_{familyId}`), same as traces.
 * - NOT reachable by the model. There is no activity tool, no undo action in
 *   the registry, and no propose_action path here. Undo restores a value the
 *   user already approved changing; an agent-reachable undo would be a write
 *   primitive that bypasses the proposal mechanism — the model could not
 *   choose the value, but it could choose the moment.
 * - Entries record parameters that were already displayed on the card the user
 *   confirmed (SEC-P010 guarantees every written param appeared there), so
 *   this introduces no data the user has not already seen.
 *
 * Receives the writable DataService because it must persist, but is a narrow
 * appender over one key namespace — the same shape as AgentTraceStore and
 * ChatbotCostTracker. The SEC-018 read-only boundary is untouched.
 */

import { Mutex } from 'async-mutex';
import { randomUUID } from 'crypto';
import type { DataService } from './dataService';
import type { ChatActionId } from '../shared/types';
import type { UndoRowStatus, UndoTargetKind } from './chatActions/undoSnapshot';
import { childLogger } from '../utils/logger';

const log = childLogger('actionActivity');

/**
 * Retention. Longer than the 30-day trace window on purpose: a trace answers
 * "why did it do that", which is a question asked within days, while the
 * activity log answers "what did it change", which is asked when someone
 * notices a number looks wrong — and that can be a quarter later.
 */
const RETENTION_DAYS = 180;
/** Bounds the file regardless of retention, same rationale as the trace cap. */
const MAX_ENTRIES_PER_FAMILY = 2000;

export interface ActivityRowRecord {
  rowId: string;
  actionId: ChatActionId;
  /** What the user saw on the card for this row. */
  displaySummary: string;
  /** Resolved resource, so the log can deep-link to what changed. */
  resource: { type: string; id: string; url?: string; label: string };
  undo:
    | {
        undoable: true;
        kind: UndoTargetKind;
        recordId: string;
        /** Prior state. `null` means the record did not exist — restore removes it. */
        before: unknown;
        /** REQ-P027: the record as it stood immediately after the AI write. */
        fingerprintAfter: string;
      }
    | {
        undoable: false;
        /** Why not, in words the user can act on. */
        reason: string;
      };
  /** Set once the row has been reversed, so undo is idempotent (REQ-P027). */
  undoneAt?: string;
  undoneBy?: string;
}

export interface ActivityEntry {
  entryId: string;
  familyId: string;
  /** Who confirmed the batch. Unattended entries will carry the automation id. */
  userId: string;
  /** REQ-P062: ties a write back to the reasoning that produced it. */
  traceId: string;
  proposalId: string;
  conversationId: string;
  createdAt: string;
  /** REQ-P039 will mark unattended writes in-place; T1 is always 'confirmed'. */
  origin: 'confirmed' | 'unattended';
  rows: ActivityRowRecord[];
}

function storageKey(familyId: string): string {
  return `ai_activity_${familyId}`;
}

export class ActionActivityStore {
  private readonly mutex = new Mutex();

  constructor(private readonly dataService: DataService) {}

  private async load(familyId: string): Promise<ActivityEntry[]> {
    return (await this.dataService.getData<ActivityEntry[]>(storageKey(familyId))) ?? [];
  }

  /**
   * Retention is applied on write rather than by a sweep, so the file cannot
   * grow unboundedly between maintenance windows on a deployment that has none.
   */
  private prune(entries: ActivityEntry[]): ActivityEntry[] {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const kept = entries.filter(e => new Date(e.createdAt).getTime() >= cutoff);
    if (kept.length <= MAX_ENTRIES_PER_FAMILY) return kept;
    // Newest first, then trim: an over-cap file loses its OLDEST entries, never
    // the change somebody is looking at right now.
    return [...kept]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, MAX_ENTRIES_PER_FAMILY);
  }

  /**
   * REQ-P037. Recording must never fail the write it is recording: by the time
   * this runs the change has already been applied, so throwing here would
   * report failure for something that succeeded and invite the user to redo it.
   * Failures are logged and swallowed.
   */
  async record(entry: Omit<ActivityEntry, 'entryId' | 'createdAt'>): Promise<string | null> {
    return this.mutex.runExclusive(async () => {
      try {
        const entries = await this.load(entry.familyId);
        const full: ActivityEntry = {
          ...entry,
          entryId: `act_${randomUUID()}`,
          createdAt: new Date().toISOString(),
        };
        entries.push(full);
        await this.dataService.saveData(storageKey(entry.familyId), this.prune(entries));
        return full.entryId;
      } catch (err) {
        log.error({ err, familyId: entry.familyId }, 'failed to record AI activity');
        return null;
      }
    });
  }

  /** Newest first. REQ-P038's time-range bulk undo reads from this. */
  async list(
    familyId: string,
    options: { limit?: number; since?: string; until?: string } = {},
  ): Promise<ActivityEntry[]> {
    const entries = await this.load(familyId);
    const filtered = entries.filter(e => {
      if (options.since && e.createdAt < options.since) return false;
      if (options.until && e.createdAt > options.until) return false;
      return true;
    });
    filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return typeof options.limit === 'number' ? filtered.slice(0, options.limit) : filtered;
  }

  async get(familyId: string, entryId: string): Promise<ActivityEntry | null> {
    const entries = await this.load(familyId);
    return entries.find(e => e.entryId === entryId) ?? null;
  }

  /**
   * Mark rows reversed. Separate from the undo execution itself so the restore
   * and the bookkeeping cannot interleave with another undo of the same entry.
   */
  async markUndone(
    familyId: string,
    entryId: string,
    userId: string,
    rowIds: string[],
  ): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const entries = await this.load(familyId);
      const entry = entries.find(e => e.entryId === entryId);
      if (!entry) return;
      const now = new Date().toISOString();
      const wanted = new Set(rowIds);
      for (const row of entry.rows) {
        if (!wanted.has(row.rowId)) continue;
        if (row.undoneAt) continue; // idempotent
        row.undoneAt = now;
        row.undoneBy = userId;
      }
      await this.dataService.saveData(storageKey(familyId), entries);
    });
  }
}

export type { UndoRowStatus };
