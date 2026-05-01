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
import type { ChatbotDataService } from '../chatbotDataService';
import type { ChatbotCostTracker } from '../chatbotCostTracker';
import {
  AMAZON_CATEGORIZATION_SYSTEM_PROMPT,
  AMAZON_CATEGORIZATION_TOOL,
} from '../amazonReceiptPrompt';
import { CUSTOM_AMAZON_CATEGORY } from './amazonMatcher';
import { childLogger } from '../../utils/logger';

const log = childLogger('amazonCategorizerAdapter');

import type {
  AmazonTransactionMatch,
  AmazonCategoryRecommendation,
  AmazonSplitRecommendation,
  Category,
  Transaction,
} from '../../shared/types';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8192;
const MAX_EXAMPLES_PER_CATEGORY = 5;
const MAX_EXAMPLE_CATEGORIES = 20;

export interface CategorizerResult {
  recommendations: AmazonCategoryRecommendation[];
  splitRecommendations: AmazonSplitRecommendation[];
  costUsed: number;
}

interface ClaudeCategorizeOutput {
  categorizations: Array<{
    matchId: string;
    suggestedCategoryId: string;
    confidence: number;
    reasoning: string;
    itemName: string;
  }>;
  splitRecommendations: Array<{
    matchId: string;
    splits: Array<{
      itemName: string;
      estimatedAmount: number;
      suggestedCategoryId: string;
      confidence: number;
      isEstimatedPrice: boolean;
    }>;
  }>;
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
  ): Promise<CategorizerResult> {
    const categories = await this.chatbotDataService.getCategories(familyId);
    const categoryContext = buildCategoryContext(categories);
    const examples = await this.buildExamples(familyId, categories);

    const allTransactions = await this.chatbotDataService.queryTransactions(familyId, {});
    const txMap = new Map(allTransactions.map(t => [t.id, t]));
    const catMap = new Map(categories.map(c => [c.id, c]));

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

    const userMessage = `Categorize these Amazon order items:

MATCHED ORDERS:
${JSON.stringify(matchData)}

CATEGORY HIERARCHY:
${categoryContext}

EXAMPLES OF PREVIOUSLY CATEGORIZED TRANSACTIONS:
${examples}`;

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: AMAZON_CATEGORIZATION_SYSTEM_PROMPT,
      tools: [AMAZON_CATEGORIZATION_TOOL],
      messages: [{ role: 'user', content: userMessage }],
    });

    const costResult = await this.costTracker.recordUsage(
      familyId, 'sonnet', response.usage.input_tokens, response.usage.output_tokens,
    );

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === 'categorize_amazon_items',
    );

    if (!toolUse) {
      log.warn('[AmazonCategorizerAdapter] No tool_use in categorization response');
      return { recommendations: [], splitRecommendations: [], costUsed: costResult.estimatedCost };
    }

    const output = toolUse.input as ClaudeCategorizeOutput;

    const recommendations = buildRecommendations(output, matches, txMap, catMap);
    const splitRecommendations = buildSplitRecommendations(output, matches, txMap, catMap);

    return {
      recommendations: recommendations.sort((a, b) => b.confidence - a.confidence),
      splitRecommendations,
      costUsed: costResult.estimatedCost,
    };
  }

  private async buildExamples(
    familyId: string,
    categories: Category[],
  ): Promise<string> {
    const sample = await this.chatbotDataService.queryTransactions(familyId, { limit: 500 });
    return buildExamplesFromTransactions(sample, categories);
  }
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
