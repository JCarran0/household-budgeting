/**
 * Amazon item history — AI-AMAZON-RECEIPT-BRD §17 (D-A2-1).
 *
 * Every item → category decision the family confirms, kept 24 months. This
 * is what the categorizer learns from: bank transactions grouped by merchant
 * say nothing about whether dog food goes to Pet Food, and the item names in
 * receipt sessions are erased when a session is pruned.
 *
 * Not reachable from the chatbot's ReadOnlyDataService (SEC-A202). Retention
 * is pruning on write, like the other per-family AI stores.
 */

import { Mutex } from 'async-mutex';
import type {
  AmazonApplyAction,
  AmazonCategorizationResponse,
  AmazonItemHistory,
  AmazonItemHistoryEntry,
  AmazonMatchItem,
  AmazonReceiptSession,
  AmazonTransactionMatch,
  Transaction,
} from '../../shared/types';
import type { DataService } from '../dataService';
import { isAmazonMerchant } from './amazonMatcher';

const RETENTION_MS = 730 * 24 * 60 * 60 * 1000; // 24 months
/** Distinct (item, category) pairs sent to the model (D-A2-2). */
export const MAX_PROMPT_ITEMS = 400;

function storageKey(familyId: string): string {
  return `amazon_item_history_${familyId}`;
}

export class AmazonItemHistoryStore {
  private readonly mutex = new Mutex();

  constructor(private readonly dataService: DataService) {}

  /**
   * The history, pre-filled on first use (REQ-A204). The sources are passed
   * in rather than read here so this store holds no handle to sessions or
   * transactions beyond what the caller already loaded.
   */
  async load(
    familyId: string,
    importSources: () => Promise<{ sessions: AmazonReceiptSession[]; transactions: Transaction[] }>,
  ): Promise<AmazonItemHistoryEntry[]> {
    const existing = await this.read(familyId);
    if (existing?.importedAt) return existing.entries;

    return this.mutex.runExclusive(async () => {
      // Re-check inside the lock: two first requests must not both import.
      const current = await this.read(familyId);
      if (current?.importedAt) return current.entries;

      const { sessions, transactions } = await importSources();
      const history: AmazonItemHistory = {
        importedAt: new Date().toISOString(),
        // Keep any rows appended before the import ran.
        entries: prune([...buildImport(sessions, transactions), ...(current?.entries ?? [])]),
      };
      await this.dataService.saveData(storageKey(familyId), history);
      return history.entries;
    });
  }

  /**
   * Rows written before the import has run are kept with `importedAt` left
   * empty, so the next load() still performs the import and merges them.
   */
  async append(familyId: string, entries: AmazonItemHistoryEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.mutex.runExclusive(async () => {
      const current = await this.read(familyId);
      await this.dataService.saveData(storageKey(familyId), {
        importedAt: current?.importedAt ?? '',
        entries: prune([...(current?.entries ?? []), ...entries]),
      } satisfies AmazonItemHistory);
    });
  }

  private read(familyId: string): Promise<AmazonItemHistory | null> {
    return this.dataService.getData<AmazonItemHistory>(storageKey(familyId));
  }
}

function prune(entries: AmazonItemHistoryEntry[]): AmazonItemHistoryEntry[] {
  const cutoff = Date.now() - RETENTION_MS;
  return entries.filter(e => Date.parse(e.recordedAt) >= cutoff);
}

/**
 * What survives today: categorized items in sessions not yet stripped, and the
 * children of Amazon splits. Split items come only from the child
 * transactions, never from sessions, so a split is not counted twice — a split child keeps the bank `name` and carries
 * the item name as its `userDescription`. Exported for tests.
 */
export function buildImport(
  sessions: AmazonReceiptSession[],
  transactions: Transaction[],
): AmazonItemHistoryEntry[] {
  const entries: AmazonItemHistoryEntry[] = [];

  for (const s of sessions) {
    for (const m of s.matches) {
      if (m.status !== 'categorized') continue;
      for (const item of m.items) {
        if (!item.appliedCategoryId) continue;
        entries.push({
          itemName: item.name,
          appliedCategoryId: item.appliedCategoryId,
          suggestedCategoryId: null,
          suggestedConfidence: null,
          orderNumber: m.orderNumber,
          transactionId: m.transactionId,
          source: 'import',
          recordedAt: s.uploadedAt,
        });
      }
    }
  }

  for (const t of transactions) {
    if (!t.parentTransactionId || !t.categoryId || !t.userDescription) continue;
    if (!isAmazonMerchant(t)) continue;
    entries.push({
      itemName: t.userDescription,
      appliedCategoryId: t.categoryId,
      suggestedCategoryId: null,
      suggestedConfidence: null,
      orderNumber: null,
      transactionId: t.id,
      source: 'import',
      // A split child's date is the purchase date — the best "when" we have.
      recordedAt: new Date(`${t.date}T12:00:00Z`).toISOString(),
    });
  }
  return entries;
}

/**
 * The model's view: distinct (item, category) pairs, most recent first,
 * capped. An item filed under more than one category appears once per
 * category with a count, so the model sees the split rather than a single
 * arbitrary answer (REQ-A206). Only applied categories, never suggestions.
 */
export function promptHistory(
  entries: AmazonItemHistoryEntry[],
  categoryName: (id: string) => string | undefined,
): { itemName: string; category: string; times: number }[] {
  const byPair = new Map<string, { itemName: string; category: string; times: number; last: string }>();
  for (const e of entries) {
    const category = categoryName(e.appliedCategoryId);
    if (!category) continue; // deleted or hidden since — not a valid answer now
    const key = `${normalize(e.itemName)}\u0000${e.appliedCategoryId}`;
    const prev = byPair.get(key);
    if (prev) {
      prev.times++;
      if (e.recordedAt > prev.last) prev.last = e.recordedAt;
    } else {
      byPair.set(key, { itemName: e.itemName, category, times: 1, last: e.recordedAt });
    }
  }
  return [...byPair.values()]
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, MAX_PROMPT_ITEMS)
    .map(({ itemName, category, times }) => ({ itemName, category, times }));
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Save the AI's recommendations onto the session's items at categorize time
 * (REQ-A203), so apply can record suggestion beside outcome. A split line is
 * matched to its item by name, falling back to position — the model is told
 * to use the item names it was given, but is not trusted to.
 */
export function recordSuggestions(
  matches: AmazonTransactionMatch[],
  result: Pick<AmazonCategorizationResponse, 'recommendations' | 'splitRecommendations'>,
): void {
  const byId = new Map(matches.map(m => [m.id, m]));
  for (const rec of result.recommendations) {
    for (const item of byId.get(rec.matchId)?.items ?? []) {
      item.suggestedCategoryId = rec.suggestedCategoryId;
      item.confidence = rec.confidence;
    }
  }
  for (const sr of result.splitRecommendations) {
    const match = byId.get(sr.matchId);
    if (!match) continue;
    sr.splits.forEach((line, i) => {
      const item = itemFor(match, line.itemName, i);
      if (item) {
        item.suggestedCategoryId = line.suggestedCategoryId;
        item.confidence = line.confidence;
      }
    });
  }
}

/**
 * History rows for one successfully applied action (REQ-A201/202). Also sets
 * `appliedCategoryId` on split items, which v1 never did — that left splits
 * invisible to the rule-suggestion step.
 */
export function historyEntriesForAction(
  match: AmazonTransactionMatch,
  action: AmazonApplyAction,
  recordedAt: string,
): AmazonItemHistoryEntry[] {
  const entry = (itemName: string, categoryId: string, item: AmazonMatchItem | undefined, source: 'categorize' | 'split'): AmazonItemHistoryEntry => ({
    itemName,
    appliedCategoryId: categoryId,
    suggestedCategoryId: item?.suggestedCategoryId ?? null,
    suggestedConfidence: item?.suggestedCategoryId ? item.confidence : null,
    orderNumber: match.orderNumber,
    transactionId: match.transactionId,
    source,
    recordedAt,
  });

  if (action.type === 'categorize' && action.categoryId) {
    return match.items.map(item => entry(item.name, action.categoryId!, item, 'categorize'));
  }
  if (action.type === 'split' && action.splits) {
    return action.splits.map((line, i) => {
      const item = itemFor(match, line.description, i);
      if (item) item.appliedCategoryId = line.categoryId;
      return entry(line.description || item?.name || 'Amazon item', line.categoryId, item, 'split');
    });
  }
  return [];
}

function itemFor(match: AmazonTransactionMatch, name: string | undefined, index: number): AmazonMatchItem | undefined {
  const wanted = name ? normalize(name) : null;
  return (wanted ? match.items.find(i => normalize(i.name) === wanted) : undefined) ?? match.items[index];
}
