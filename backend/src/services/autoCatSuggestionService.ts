/**
 * Auto-Categorization Rule Suggestion Service
 *
 * Surfaces deterministic, on-demand rule suggestions by clustering active
 * transactions on a normalized merchant key. A cluster becomes a suggestion
 * when:
 *   - ≥ 3 categorized matches in the last 180 days
 *   - top category share ≥ 80%
 *   - ≥ 1 active uncategorized transaction matches the same key
 *   - no existing auto-cat rule already governs the cluster
 *
 * No LLM, no caching — synchronous per request. See AUTO-CAT-SUGGESTIONS-BRD
 * for the design rationale.
 */

import { DataService } from './dataService';
import { StoredTransaction } from './transactionService';
import { AutoCategorizeService } from './autoCategorizeService';
import { getActiveTransactions } from './transactionReader';
import {
  normalizeMerchantKey,
  normalizeRulePattern,
} from '../shared/utils/merchantNormalization';
import {
  AutoCatSuggestion,
  AutoCatSuggestionTxn,
  AutoCatSuggestionsResponse,
} from '../shared/types';
import { childLogger } from '../utils/logger';

const log = childLogger('autoCatSuggestionService');

const LOOKBACK_DAYS = 180;
const MIN_CLUSTER_SIZE = 3;
const MIN_AGREEMENT_PCT = 80;
const TOP_N_SUGGESTIONS = 10;
const SAMPLE_CATEGORIZED_CAP = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class AutoCatSuggestionService {
  constructor(
    private dataService: DataService,
    private autoCategorizeService: AutoCategorizeService,
  ) {}

  async getSuggestions(familyId: string): Promise<AutoCatSuggestionsResponse> {
    const startedAt = Date.now();

    const allActive = await getActiveTransactions<StoredTransaction>(
      this.dataService,
      familyId,
    );
    const categories = await this.dataService.getCategories(familyId);
    const categoryNameById = new Map(categories.map(c => [c.id, c.name]));
    const validCategoryIds = new Set(categories.map(c => c.id));

    const cutoffMs = Date.now() - LOOKBACK_DAYS * MS_PER_DAY;

    // Categorized: not pending, has a categoryId pointing at a known category,
    // within the lookback window. Stale categoryIds (orphaned references to
    // deleted categories) shouldn't poison the cluster's top-category tally.
    const categorized = allActive.filter(t => {
      if (t.pending) return false;
      if (!t.categoryId) return false;
      if (!validCategoryIds.has(t.categoryId)) return false;
      return new Date(t.date).getTime() >= cutoffMs;
    });

    // Uncategorized: not pending, no categoryId (or invalid id). No time bound
    // — old uncategorized transactions are exactly the cleanup target.
    const uncategorized = allActive.filter(t => {
      if (t.pending) return false;
      if (!t.categoryId) return true;
      return !validCategoryIds.has(t.categoryId);
    });

    const categorizedByKey = groupByNormalizedKey(categorized);
    const uncategorizedByKey = groupByNormalizedKey(uncategorized);

    // Pre-normalize existing rule patterns once; used for the dedup check.
    const rules = await this.autoCategorizeService.getRules(familyId);
    const normalizedRulePatterns: string[] = [];
    for (const rule of rules) {
      if (!rule.isActive) continue;
      for (const p of rule.patterns) {
        const np = normalizeRulePattern(p);
        if (np.length > 0) normalizedRulePatterns.push(np);
      }
    }

    const candidates: AutoCatSuggestion[] = [];

    for (const [normalizedKey, txns] of categorizedByKey) {
      if (txns.length < MIN_CLUSTER_SIZE) continue;

      // Tally category votes.
      const counts = new Map<string, number>();
      for (const t of txns) {
        const id = t.categoryId!;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      let topCategoryId = '';
      let topCategoryCount = 0;
      for (const [id, count] of counts) {
        if (count > topCategoryCount) {
          topCategoryId = id;
          topCategoryCount = count;
        }
      }
      const agreementPct = Math.round((topCategoryCount / txns.length) * 100);
      if (agreementPct < MIN_AGREEMENT_PCT) continue;

      const pendingTxns = uncategorizedByKey.get(normalizedKey) ?? [];
      if (pendingTxns.length === 0) continue;

      // Existing-rule dedup: drop if any rule's normalized pattern is a
      // substring of the cluster key (the rule already matches the cluster)
      // OR the cluster key is a substring of a rule's pattern (a stricter
      // existing rule covers a superset of the cluster).
      const coveredByRule = normalizedRulePatterns.some(
        np => normalizedKey.includes(np) || np.includes(normalizedKey),
      );
      if (coveredByRule) continue;

      const topCategoryName = categoryNameById.get(topCategoryId) ?? topCategoryId;
      const displayLabel = pickDisplayLabel(txns, normalizedKey);

      const sampleCategorized = txns.slice(0, SAMPLE_CATEGORIZED_CAP);
      candidates.push({
        normalizedKey,
        displayLabel,
        topCategoryId,
        topCategoryName,
        agreementPct,
        clusterSize: txns.length,
        topCategoryCount,
        pendingMatchCount: pendingTxns.length,
        sampleCategorizedTxnIds: sampleCategorized.map(t => t.id),
        pendingTxnIds: pendingTxns.map(t => t.id),
        sampleCategorizedTxns: sampleCategorized.map(toSummary),
        pendingTxns: pendingTxns.map(toSummary),
      });
    }

    candidates.sort((a, b) => {
      if (b.pendingMatchCount !== a.pendingMatchCount) {
        return b.pendingMatchCount - a.pendingMatchCount;
      }
      return b.clusterSize - a.clusterSize;
    });

    const totalSuggestions = candidates.length;
    const truncated = totalSuggestions > TOP_N_SUGGESTIONS;
    const suggestions = candidates.slice(0, TOP_N_SUGGESTIONS);

    const durationMs = Date.now() - startedAt;
    log.info(
      {
        familyId,
        totalCategorizedScanned: categorized.length,
        totalUncategorizedScanned: uncategorized.length,
        clustersFound: categorizedByKey.size,
        suggestionsReturned: suggestions.length,
        totalSuggestions,
        durationMs,
      },
      'auto_cat_suggestions.scan',
    );

    return { suggestions, truncated, totalSuggestions };
  }
}

function toSummary(t: StoredTransaction): AutoCatSuggestionTxn {
  return {
    id: t.id,
    date: t.date,
    description: t.userDescription || t.merchantName || t.name,
    amount: t.amount,
  };
}

function groupByNormalizedKey(
  txns: StoredTransaction[],
): Map<string, StoredTransaction[]> {
  const groups = new Map<string, StoredTransaction[]>();
  for (const t of txns) {
    const key = normalizeMerchantKey(t);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  return groups;
}

/**
 * Pick a human-friendly display label for the cluster card. Prefers the most
 * common non-empty `merchantName` among the cluster's transactions; falls back
 * to the most common `name`; finally to a title-cased version of the
 * normalized key.
 */
function pickDisplayLabel(
  txns: StoredTransaction[],
  normalizedKey: string,
): string {
  const merchantCounts = new Map<string, number>();
  const nameCounts = new Map<string, number>();
  for (const t of txns) {
    const m = (t.merchantName ?? '').trim();
    if (m) merchantCounts.set(m, (merchantCounts.get(m) ?? 0) + 1);
    const n = (t.name ?? '').trim();
    if (n) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  }

  const top = pickMostCommon(merchantCounts) ?? pickMostCommon(nameCounts);
  if (top) return toTitleCase(top);
  return toTitleCase(normalizedKey);
}

function pickMostCommon(counts: Map<string, number>): string | null {
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return bestKey;
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}
