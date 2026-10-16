/**
 * Categorization Run Store — AI-CATEGORIZATION-BRD §12.4.4
 *
 * One record per classification request: what the AI suggested for every
 * transaction it was sent, and what the user finally did with each. Serves
 * measurement now (acceptance rate, failures by reason) and learning and
 * chat-about-a-run later.
 *
 * Deliberately NOT reachable from the chatbot's ReadOnlyDataService (SEC-102):
 * the record holds user-typed notes, and a store the model can read is a
 * durable home for injected text. Making it readable is a v2.1 decision with
 * its own security review.
 *
 * Retention is enforced by pruning on write, like proposalStore — there is no
 * background sweep to have not run.
 */

import { Mutex } from 'async-mutex';
import type {
  ClassificationOutcomeInput,
  ClassificationOutcomeKind,
  ClassificationResult,
  ClassificationRun,
  ClassificationRunRow,
  Transaction,
} from '../shared/types';
import type { DataService } from './dataService';
import { redactSecretsInText } from '../utils/redaction';

const RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 12 months (D-V2-5)
export const MAX_NOTE_LENGTH = 200; // REQ-141

function storageKey(familyId: string): string {
  return `ai_categorization_runs_${familyId}`;
}

export type RecordOutcomesResult =
  | { ok: true; recorded: number }
  | { ok: false; reason: 'run_not_found' };

export class CategorizationRunStore {
  private readonly mutex = new Mutex();

  constructor(private readonly dataService: DataService) {}

  private async load(familyId: string): Promise<ClassificationRun[]> {
    return (await this.dataService.getData<ClassificationRun[]>(storageKey(familyId))) ?? [];
  }

  private prune(runs: ClassificationRun[]): ClassificationRun[] {
    const cutoff = Date.now() - RETENTION_MS;
    return runs.filter(r => Date.parse(r.createdAt) >= cutoff);
  }

  async createRun(run: ClassificationRun): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const runs = this.prune(await this.load(run.familyId));
      runs.push(run);
      await this.dataService.saveData(storageKey(run.familyId), runs);
    });
  }

  async getRun(familyId: string, runId: string): Promise<ClassificationRun | null> {
    const runs = await this.load(familyId);
    return runs.find(r => r.id === runId) ?? null;
  }

  async listRuns(familyId: string): Promise<ClassificationRun[]> {
    return this.load(familyId);
  }

  /**
   * Attach outcomes to a run's rows. Outcomes for transactions that were not
   * in the run are ignored rather than rejected: the client reports a whole
   * bucket at once, and one stray id should not lose the rest.
   *
   * Category validity is the caller's job (it needs the category list); this
   * store only guarantees an outcome lands on a row that exists.
   *
   * A later outcome for the same row replaces the earlier one — re-running
   * "Apply" after an error is a correction, not a second event.
   */
  async recordOutcomes(
    familyId: string,
    runId: string,
    outcomes: ClassificationOutcomeInput[],
  ): Promise<RecordOutcomesResult> {
    return this.mutex.runExclusive(async () => {
      const runs = this.prune(await this.load(familyId));
      const run = runs.find(r => r.id === runId);
      if (!run) return { ok: false, reason: 'run_not_found' } as const;

      const rows = new Map(run.rows.map(r => [r.transactionId, r]));
      const recordedAt = new Date().toISOString();
      let recorded = 0;
      for (const o of outcomes) {
        const row = rows.get(o.transactionId);
        if (!row) continue;
        const kind = outcomeKind(row.suggestedCategoryId, o.categoryId);
        row.outcome = {
          kind,
          categoryId: o.categoryId,
          // Only a changed row carries a note (REQ-140).
          note: kind === 'changed' ? sanitizeNote(o.note) : null,
          recordedAt,
        };
        recorded++;
      }

      await this.dataService.saveData(storageKey(familyId), runs);
      return { ok: true, recorded } as const;
    });
  }
}

/**
 * Derived on the server from the stored suggestion rather than trusted from
 * the client. Picking a category where the AI had none counts as changed: the
 * user supplied the answer.
 */
export function outcomeKind(
  suggestedCategoryId: string | null,
  appliedCategoryId: string | null,
): ClassificationOutcomeKind {
  if (appliedCategoryId === null) return 'skipped';
  return appliedCategoryId === suggestedCategoryId ? 'accepted' : 'changed';
}

/**
 * The run's rows: one per transaction sent, carrying either the AI's
 * suggestion or the reason it produced none. Every transaction sent appears
 * exactly once, mirroring reconcile().
 */
export function buildRunRows(
  transactions: Transaction[],
  results: ClassificationResult[],
  failures: Map<string, string>,
): ClassificationRunRow[] {
  const byTxn = new Map(results.map(r => [r.transactionId, r]));
  return transactions.map(t => {
    const r = byTxn.get(t.id);
    const [broad, detailed] = t.category ?? [];
    return {
      transactionId: t.id,
      name: t.name,
      merchantName: t.merchantName,
      amount: t.amount,
      date: t.date,
      plaidCategory: broad || detailed ? { broad: broad ?? null, detailed: detailed ?? null } : null,
      suggestedCategoryId: r?.suggestedCategoryId ?? null,
      confidence: r?.confidence ?? null,
      reasoning: r?.reasoning ?? null,
      failureReason: r ? null : (failures.get(t.id) ?? 'The AI skipped this transaction.'),
      outcome: null,
    };
  });
}

/**
 * Redact BEFORE truncating (SEC-101): slicing first can cut a credential in
 * half and leave a fragment the shape patterns no longer match.
 */
export function sanitizeNote(note: string | undefined): string | null {
  if (!note) return null;
  const trimmed = redactSecretsInText(note.trim()).slice(0, MAX_NOTE_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}
