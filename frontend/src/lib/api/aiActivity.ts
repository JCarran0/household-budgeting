import type { AxiosInstance } from 'axios';

/**
 * AI activity log & undo — AI-CAPABILITY-PLATFORM-BRD §6.3, §5.4.
 *
 * Note what is NOT here: no way to create an entry. Entries are written
 * server-side when a plan card is confirmed. The client reads and reverses.
 */

export interface ActivityRow {
  rowId: string;
  actionId: string;
  displaySummary: string;
  resource: { type: string; id: string; url?: string; label: string };
  undoable: boolean;
  /** Present only when undoable is false and the row was never undone. */
  undoUnavailableReason?: string;
  undoneAt?: string;
}

export interface ActivityEntry {
  entryId: string;
  createdAt: string;
  origin: 'confirmed' | 'unattended';
  conversationId: string;
  rows: ActivityRow[];
}

export type UndoRowStatus =
  | 'undone'
  | 'skipped_modified'
  | 'skipped_missing'
  | 'not_undoable'
  | 'already_undone';

export interface UndoOutcome {
  rowId: string;
  status: UndoRowStatus;
  detail?: string;
}

export interface UndoResult {
  entryId: string;
  outcomes: UndoOutcome[];
  changed: boolean;
}

export function createAiActivityApi(client: AxiosInstance) {
  return {
    async getAiActivity(params: { limit?: number } = {}): Promise<ActivityEntry[]> {
      const res = await client.get<{ success: boolean; entries: ActivityEntry[] }>(
        '/ai/activity',
        { params },
      );
      return res.data.entries;
    },

    async undoAiActivityEntry(entryId: string, rowIds?: string[]): Promise<UndoResult> {
      const res = await client.post<{ success: boolean } & UndoResult>(
        `/ai/activity/${entryId}/undo`,
        rowIds ? { rowIds } : {},
      );
      return res.data;
    },
  };
}
