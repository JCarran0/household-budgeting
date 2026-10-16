/**
 * Amazon categorizer adapter — Claude call for category & split suggestions.
 *
 * Extracted from `amazonReceiptService.ts` (Sprint 5 / TD-010). Owns the
 * prompt construction, example sampling, Claude round-trip, cost recording,
 * and the post-processing pass that enriches recommendations and absorbs
 * split rounding. Orchestrator still handles session ownership + persistence
 * + cost-cap gating.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ChatbotDataService } from '../chatbotDataService';
import { ChatbotCostTracker } from '../chatbotCostTracker';
import { ExternalServiceError } from '../../errors';
import {
  AMAZON_CATEGORIZATION_SYSTEM_PROMPT,
  AMAZON_CATEGORIZATION_TOOL,
} from '../amazonReceiptPrompt';
import { CUSTOM_AMAZON_CATEGORY, isAmazonMerchant } from './amazonMatcher';
import { promptHistory } from './amazonItemHistoryStore';
import { childLogger } from '../../utils/logger';

const log = childLogger('amazonCategorizerAdapter');

import type {
  AmazonTransactionMatch,
  AmazonCategoryRecommendation,
  AmazonCategorizationFailure,
  AmazonItemHistoryEntry,
  AmazonSplitRecommendation,
  Category,
  ChatModel,
  Transaction,
} from '../../shared/types';

// REQ-P056 — reviewed 2026-10-15. Same settings and rationale as
// categorizationService.ts: Opus 5.5 always thinks, thinking counts against
// max_tokens, and streaming keeps a ceiling this large clear of the SDK's
// non-streaming timeout guard. On Sonnet 5 at 8192 a large session could be
// cut off mid-output and come back with recommendations silently missing.
const MODEL = 'claude-opus-5-5';
const EFFORT = 'medium';
const MAX_TOKENS = 32000;
// Opus 5.5 is $4/$20; the 'opus' tier is priced at Opus 5's $5/$25, so this
// overstates spend by 25% — the safe direction for a cap.
const COST_TIER: ChatModel = 'opus';
// Matches per call. Batches run concurrently, so wall-clock is one batch's
// latency, and a multi-item order produces far more output than a bank
// transaction does — hence smaller than the categorizer's 25.
const BATCH_SIZE = 15;
const MAX_EXAMPLES_PER_CATEGORY = 5;
const MAX_EXAMPLE_CATEGORIES = 20;

export interface CategorizerResult {
  recommendations: AmazonCategoryRecommendation[];
  splitRecommendations: AmazonSplitRecommendation[];
  failures: AmazonCategorizationFailure[];
  costUsed: number;
}

// Tool input is model output: validate it rather than casting (Critical Rule 3).
const categorizeOutputSchema = z.object({
  categorizations: z.array(z.object({
    matchId: z.string(),
    suggestedCategoryId: z.string(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    itemName: z.string(),
  })),
  splitRecommendations: z.array(z.object({
    matchId: z.string(),
    splits: z.array(z.object({
      itemName: z.string(),
      estimatedAmount: z.number().min(0),
      suggestedCategoryId: z.string(),
      confidence: z.number().min(0).max(1),
      isEstimatedPrice: z.boolean(),
    })).min(1),
  })),
});

type ClaudeCategorizeOutput = z.infer<typeof categorizeOutputSchema>;

/**
 * What one call produced. Once reconciled, every match sent ends up with a
 * recommendation (single or split) or a failure reason — never silently
 * missing (the 2026-10-15 categorization incident, same shape).
 */
export interface BatchOutcome {
  output: ClaudeCategorizeOutput;
  /** matchId → why the AI produced nothing usable for it. */
  failures: Map<string, string>;
  cost: number;
}

export class AmazonCategorizerAdapter {
  constructor(
    private readonly client: Anthropic,
    private readonly chatbotDataService: ChatbotDataService,
    private readonly costTracker: ChatbotCostTracker,
  ) {}

  /**
   * Ask Claude to categorize the given matches. Caller is responsible for
   * pre-filtering `matches` to those in status 'pending' and for the cost-cap
   * gate; this method unconditionally calls Claude and records usage.
   */
  async categorize(
    familyId: string,
    matches: AmazonTransactionMatch[],
    history: AmazonItemHistoryEntry[],
  ): Promise<CategorizerResult> {
    const categories = await this.chatbotDataService.getCategories(familyId);
    const allTransactions = await this.chatbotDataService.queryTransactions(familyId, {});
    const txMap = new Map(allTransactions.map(t => [t.id, t]));
    const catMap = new Map(categories.map(c => [c.id, c]));

    const offeredName = (id: string) => {
      const c = catMap.get(id);
      return c && !c.isHidden ? c.name : undefined;
    };
    const context = buildStableContext(
      buildCategoryContext(categories),
      promptHistory(history, offeredName),
      // Non-Amazon only (REQ-A208): every Amazon example reads "Amazon.com"
      // and says nothing about items; the item history covers Amazon.
      buildExamplesFromTransactions(allTransactions.filter(t => !isAmazonMerchant(t)).slice(0, 500), categories),
    );

    const batches: AmazonTransactionMatch[][] = [];
    for (let i = 0; i < matches.length; i += BATCH_SIZE) {
      batches.push(matches.slice(i, i + BATCH_SIZE));
    }
    // One batch: no cache marker, since a cache write costs more than plain
    // input and nothing would read it back. Several: the first call writes
    // the shared context to the cache and the rest, run in parallel after
    // it, read it at a tenth of the price (REQ-A207).
    const cache = batches.length > 1;
    const first = await this.categorizeBatch(familyId, batches[0], txMap, context, cache);
    const rest = await Promise.all(
      batches.slice(1).map(batch => this.categorizeBatch(familyId, batch, txMap, context, cache)),
    );
    const merged = mergeOutcomes([first, ...rest]);

    const { output, failures } = reconcile(merged, matches, categories);
    log.info({
      matches: matches.length,
      categorized: output.categorizations.length,
      splits: output.splitRecommendations.length,
      failed: failures.size,
      cost: Number(merged.cost.toFixed(4)),
    }, 'amazon categorization reconciled');

    // Nothing usable: fail loudly instead of a review step with nothing in
    // it. Spend has already been recorded.
    if (output.categorizations.length === 0 && output.splitRecommendations.length === 0) {
      const reason = failures.values().next().value ?? 'no recommendations were returned';
      throw new ExternalServiceError(
        `AI categorization returned no usable recommendations for ${matches.length} orders: ${reason} No changes were made.`,
      );
    }

    const recommendations = buildRecommendations(output, matches, txMap, catMap);
    const splitRecommendations = buildSplitRecommendations(output, matches, txMap, catMap);
    const itemNames = new Map(matches.map(m => [m.id, m.items.map(i => i.name).join(', ')]));

    return {
      recommendations: recommendations.sort((a, b) => b.confidence - a.confidence),
      splitRecommendations,
      failures: [...failures].map(([matchId, reason]) => ({
        matchId,
        itemName: itemNames.get(matchId) ?? '',
        reason,
      })),
      costUsed: Math.round(merged.cost * 1_000_000) / 1_000_000,
    };
  }

  private async categorizeBatch(
    familyId: string,
    matches: AmazonTransactionMatch[],
    txMap: Map<string, Transaction>,
    context: string,
    cache: boolean,
  ): Promise<BatchOutcome> {
    const matchData = matches.map(m => {
      const tx = txMap.get(m.transactionId);
      return {
        matchId: m.id,
        orderNumber: m.orderNumber,
        items: m.items.map(i => ({ name: i.name, estimatedPrice: i.estimatedPrice })),
        transactionAmount: tx ? Math.abs(tx.amount) : 0,
        currentCategoryId: tx?.categoryId ?? null,
        isSingleItem: m.items.length === 1,
      };
    });

    // SEC-A201: item names (from user-uploaded PDFs) and history travel as
    // data in the user turn, never in the system prompt. The shared context
    // comes first so it can be a cached prefix.
    const response = await this.client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: EFFORT },
      system: AMAZON_CATEGORIZATION_SYSTEM_PROMPT,
      tools: [AMAZON_CATEGORIZATION_TOOL],
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: context, ...(cache ? { cache_control: { type: 'ephemeral' as const } } : {}) },
          { type: 'text', text: `Categorize these Amazon order items:\n\nMATCHED ORDERS:\n${JSON.stringify(matchData)}` },
        ],
      }],
    }).finalMessage();

    // usage.input_tokens excludes cache reads and writes, which are billed;
    // pass them through so the cap counts them (see chatbotCostTracker).
    const cacheTokens = {
      writeTokens: response.usage.cache_creation_input_tokens ?? 0,
      readTokens: response.usage.cache_read_input_tokens ?? 0,
    };
    const cost = ChatbotCostTracker.estimateCost(
      COST_TIER, response.usage.input_tokens, response.usage.output_tokens, cacheTokens,
    );
    await this.costTracker.recordUsage(
      familyId, COST_TIER, response.usage.input_tokens, response.usage.output_tokens, 'interactive', cacheTokens,
    );
    log.info({
      batchSize: matches.length,
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      ...cacheTokens,
      cost: Number(cost.toFixed(4)),
    }, 'amazon batch response');

    const failAll = (reason: string): BatchOutcome => ({
      output: { categorizations: [], splitRecommendations: [] },
      failures: new Map(matches.map(m => [m.id, reason])),
      cost,
    });

    // Truncated: the tool input is incomplete and none of it can be trusted.
    // Halve and retry until a batch fits or a single order still doesn't.
    if (response.stop_reason === 'max_tokens') {
      if (matches.length === 1) return failAll('The AI response was cut off before it finished.');
      log.warn({ batchSize: matches.length }, 'amazon batch output truncated; splitting and retrying');
      const mid = Math.ceil(matches.length / 2);
      const halves = await Promise.all([
        this.categorizeBatch(familyId, matches.slice(0, mid), txMap, context, cache),
        this.categorizeBatch(familyId, matches.slice(mid), txMap, context, cache),
      ]);
      const merged = mergeOutcomes(halves);
      return { ...merged, cost: merged.cost + cost };
    }

    if (response.stop_reason === 'refusal') {
      log.warn({ batchSize: matches.length }, 'amazon batch declined by the model');
      return failAll('The AI declined to categorize this order.');
    }

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === 'categorize_amazon_items',
    );
    if (!toolUse) {
      log.warn({ stopReason: response.stop_reason }, 'no categorize_amazon_items call in response');
      return failAll('The AI did not return a categorization.');
    }

    const parsed = categorizeOutputSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      log.warn({ issues: parsed.error.issues.slice(0, 5) }, 'amazon categorization output failed validation');
      return failAll('The AI returned its categorization in an unexpected format.');
    }

    return { output: parsed.data, failures: new Map(), cost };
  }
}

/**
 * The part of the prompt every batch in a session shares: what the
 * categories are, what this family has filed each Amazon item under before,
 * and what the categories mean for their other spending. Exported for tests.
 */
export function buildStableContext(
  categoryContext: string,
  history: { itemName: string; category: string; times: number }[],
  examples: string,
): string {
  const historyBlock = history.length > 0
    ? history.map(h => JSON.stringify(h.times > 1 ? [h.itemName, h.category, h.times] : [h.itemName, h.category])).join('\n')
    : '(none yet)';
  return `CATEGORY HIERARCHY:
${categoryContext}

THIS FAMILY'S PAST AMAZON PURCHASES — [item, category] or [item, category, times], most recent first.
When an item was filed under more than one category, each appears with its count:
${historyBlock}

EXAMPLES OF THIS FAMILY'S OTHER (NON-AMAZON) CATEGORIZED SPENDING:
${examples}`;
}

/**
 * Render the category tree as a compact "Parent (id): Child (id), ..." block
 * for inclusion in the Claude prompt. Hidden categories are excluded.
 */
export function buildCategoryContext(categories: Category[]): string {
  const parents = categories.filter(c => !c.parentId && !c.isHidden);
  const childMap = new Map<string, Category[]>();
  for (const c of categories) {
    if (c.parentId && !c.isHidden) {
      if (!childMap.has(c.parentId)) childMap.set(c.parentId, []);
      childMap.get(c.parentId)!.push(c);
    }
  }
  const lines: string[] = [];
  for (const p of parents) {
    const children = childMap.get(p.id) || [];
    if (children.length > 0) {
      const childStr = children.map(c => `${c.name} (${c.id})`).join(', ');
      lines.push(`${p.name} (${p.id}): ${childStr}`);
    } else {
      lines.push(`${p.name} (${p.id})`);
    }
  }
  return lines.join('\n');
}

/**
 * Render few-shot examples from the user's own categorized transactions —
 * top MAX_EXAMPLE_CATEGORIES categories by count, up to
 * MAX_EXAMPLES_PER_CATEGORY examples each.
 */
export function buildExamplesFromTransactions(
  transactions: Transaction[],
  categories: Category[],
): string {
  const withCategory = transactions.filter(t => t.categoryId);
  const byCategory = new Map<string, Transaction[]>();
  for (const t of withCategory) {
    if (!byCategory.has(t.categoryId!)) byCategory.set(t.categoryId!, []);
    byCategory.get(t.categoryId!)!.push(t);
  }

  const catMap = new Map(categories.map(c => [c.id, c]));
  const lines: string[] = [];
  const sorted = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length);

  for (const [catId, txns] of sorted.slice(0, MAX_EXAMPLE_CATEGORIES)) {
    const cat = catMap.get(catId);
    if (!cat) continue;
    const examples = txns.slice(0, MAX_EXAMPLES_PER_CATEGORY);
    const txStrs = examples
      .map(t => `"${t.merchantName || t.name}" ($${Math.abs(t.amount).toFixed(2)})`)
      .join(', ');
    lines.push(`${cat.name} (${catId}): ${txStrs}`);
  }

  return lines.join('\n');
}

function mergeOutcomes(outcomes: BatchOutcome[]): BatchOutcome {
  return {
    output: {
      categorizations: outcomes.flatMap(o => o.output.categorizations),
      splitRecommendations: outcomes.flatMap(o => o.output.splitRecommendations),
    },
    failures: new Map(outcomes.flatMap(o => [...o.failures])),
    cost: outcomes.reduce((sum, o) => sum + o.cost, 0),
  };
}

/**
 * Give every match sent exactly one outcome. Drops results for match ids that
 * were not sent and duplicates, and turns any recommendation naming a category
 * the user cannot see into a failure: applied, it would write an orphan
 * categoryId (docs/features/ORPHAN-CATEGORYIDS-PLAN.yaml). A split is all or
 * nothing — one bad line fails the whole split, since applying the rest would
 * leave the amounts unbalanced.
 *
 * Exported for tests.
 */
export function reconcile(
  outcome: BatchOutcome,
  matches: AmazonTransactionMatch[],
  categories: Category[],
): { output: ClaudeCategorizeOutput; failures: Map<string, string> } {
  const offered = new Set(categories.filter(c => !c.isHidden).map(c => c.id));
  const sent = new Set(matches.map(m => m.id));
  const done = new Set<string>();
  const failures = new Map<string, string>();
  const unknownCategory = 'The AI suggested a category that does not exist.';

  // Splits first: when the model returns both shapes for one order, the
  // split is the more specific answer.
  const splitRecommendations: ClaudeCategorizeOutput['splitRecommendations'] = [];
  for (const sr of outcome.output.splitRecommendations) {
    if (!sent.has(sr.matchId) || done.has(sr.matchId)) continue;
    done.add(sr.matchId);
    if (sr.splits.every(sp => offered.has(sp.suggestedCategoryId))) {
      splitRecommendations.push(sr);
    } else {
      failures.set(sr.matchId, unknownCategory);
    }
  }

  const categorizations: ClaudeCategorizeOutput['categorizations'] = [];
  for (const c of outcome.output.categorizations) {
    if (!sent.has(c.matchId) || done.has(c.matchId)) continue;
    done.add(c.matchId);
    if (offered.has(c.suggestedCategoryId)) {
      categorizations.push(c);
    } else {
      failures.set(c.matchId, unknownCategory);
    }
  }

  for (const m of matches) {
    if (!done.has(m.id)) {
      failures.set(m.id, outcome.failures.get(m.id) ?? 'The AI skipped this order.');
    }
  }

  return { output: { categorizations, splitRecommendations }, failures };
}

function buildRecommendations(
  output: ClaudeCategorizeOutput,
  matches: AmazonTransactionMatch[],
  txMap: Map<string, Transaction>,
  catMap: Map<string, Category>,
): AmazonCategoryRecommendation[] {
  return (output.categorizations || []).map(c => {
    const match = matches.find(m => m.id === c.matchId);
    const tx = match ? txMap.get(match.transactionId) : null;
    const isAlreadyCategorized =
      !!tx?.categoryId && tx.categoryId !== CUSTOM_AMAZON_CATEGORY;
    return {
      matchId: c.matchId,
      transactionId: match?.transactionId ?? '',
      suggestedCategoryId: c.suggestedCategoryId,
      categoryName: catMap.get(c.suggestedCategoryId)?.name ?? 'Unknown',
      confidence: c.confidence,
      reasoning: c.reasoning,
      itemName: c.itemName,
      isAlreadyCategorized,
      currentCategoryId: tx?.categoryId ?? null,
    };
  });
}

/**
 * Claude returns per-item split amounts; rounding errors can leave the sum
 * slightly off the original tx amount. Absorb the delta into the last split
 * so applying the split produces exactly-balanced child transactions.
 */
export function buildSplitRecommendations(
  output: ClaudeCategorizeOutput,
  matches: AmazonTransactionMatch[],
  txMap: Map<string, Transaction>,
  catMap: Map<string, Category>,
): AmazonSplitRecommendation[] {
  return (output.splitRecommendations || []).map(sr => {
    const match = matches.find(m => m.id === sr.matchId);
    const tx = match ? txMap.get(match.transactionId) : null;
    const originalAmount = tx ? Math.abs(tx.amount) : 0;

    const splits = sr.splits.map(s => ({
      ...s,
      categoryName: catMap.get(s.suggestedCategoryId)?.name ?? 'Unknown',
    }));

    const splitsTotal = splits.reduce((sum, s) => sum + s.estimatedAmount, 0);
    if (splits.length > 0 && Math.abs(splitsTotal - originalAmount) > 0.005) {
      const lastSplit = splits[splits.length - 1];
      lastSplit.estimatedAmount = Math.round(
        (lastSplit.estimatedAmount + (originalAmount - splitsTotal)) * 100,
      ) / 100;
    }

    return {
      matchId: sr.matchId,
      transactionId: match?.transactionId ?? '',
      originalAmount,
      splits,
      totalMatchesOriginal: true,
    };
  });
}
