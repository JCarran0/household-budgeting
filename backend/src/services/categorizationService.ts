/**
 * CategorizationService — AI-Powered Bulk Transaction Classification
 *
 * Classifies uncategorized transactions against the user's category hierarchy
 * using Claude. Shares cost tracking with the chatbot. Separate from
 * ChatbotService because the API pattern is different (batch classification
 * vs conversational tool_use loop).
 */

import Anthropic from '@anthropic-ai/sdk';
import { ChatbotDataService } from './chatbotDataService';
import { ChatbotCostTracker } from './chatbotCostTracker';
import {
  CATEGORIZATION_SYSTEM_PROMPT,
  CATEGORIZATION_TOOL,
  RULE_SUGGESTION_SYSTEM_PROMPT,
  RULE_SUGGESTION_TOOL,
} from './categorizationPrompt';
import type {
  ClassificationResult,
  ClassificationBucket,
  ClassifiedTransaction,
  ClassifyTransactionsResponse,
  RuleSuggestion,
  SuggestRulesResponse,
  Transaction,
  Category,
  AutoCategorizeRule,
} from '../shared/types';

const BATCH_SIZE = 50;
const MAX_EXAMPLES_PER_CATEGORY = 5;
const MAX_EXAMPLE_CATEGORIES = 20;
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8192; // larger than chatbot — batch output is verbose

export class CategorizationService {
  private client: Anthropic;

  constructor(
    private readonly chatbotDataService: ChatbotDataService,
    private readonly costTracker: ChatbotCostTracker,
    anthropicApiKey: string,
  ) {
    this.client = new Anthropic({ apiKey: anthropicApiKey });
  }

  /**
   * Classify uncategorized transactions into category buckets.
   */
  async classifyTransactions(
    familyId: string,
    transactionIds?: string[],
  ): Promise<ClassifyTransactionsResponse> {
    // Check cost cap
    const budget = await this.costTracker.checkBudget();
    if (!budget.allowed) {
      throw new Error('Monthly AI budget cap reached. Try again next month.');
    }

    // Fetch data
    const [uncategorized, categories, existingRules] = await Promise.all([
      this.getUncategorizedTransactions(familyId, transactionIds),
      this.chatbotDataService.getCategories(familyId),
      this.chatbotDataService.getAutoCategorizeRules(familyId),
    ]);

    if (uncategorized.length === 0) {
      console.log('[CategorizationService] No uncategorized transactions found');
      return { buckets: [], unsureBucket: this.emptyBucket(), totalClassified: 0, costUsed: 0 };
    }

    console.log(`[CategorizationService] Classifying ${uncategorized.length} transactions`);

    // Build few-shot examples from previously categorized transactions
    const examples = await this.buildExamples(familyId, categories);

    // Build category hierarchy context
    const categoryContext = this.buildCategoryContext(categories);

    // Classify in batches
    const allResults: ClassificationResult[] = [];
    let totalCost = 0;
    const totalBatches = Math.ceil(uncategorized.length / BATCH_SIZE);

    for (let i = 0; i < uncategorized.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batch = uncategorized.slice(i, i + BATCH_SIZE);
      console.log(`[CategorizationService] Batch ${batchNum}/${totalBatches}: classifying ${batch.length} transactions...`);
      const { results, cost } = await this.classifyBatch(batch, categoryContext, examples, existingRules);
      console.log(`[CategorizationService] Batch ${batchNum}/${totalBatches}: got ${results.length} results, cost $${cost.toFixed(4)}`);
      allResults.push(...results);
      totalCost += cost;
    }

    // Group into buckets
    console.log(`[CategorizationService] Grouping ${allResults.length} results into buckets`);
    const { buckets, unsureBucket } = this.groupIntoBuckets(allResults, uncategorized, categories);
    console.log(`[CategorizationService] Done: ${buckets.length} buckets + ${unsureBucket.transactions.length} unsure`);

    return {
      buckets,
      unsureBucket,
      totalClassified: allResults.length,
      costUsed: Math.round(totalCost * 1_000_000) / 1_000_000,
    };
  }

  /**
   * Suggest auto-categorization rules based on completed categorizations.
   */
  async suggestRules(
    familyId: string,
    categorizations: { transactionId: string; categoryId: string }[],
  ): Promise<SuggestRulesResponse> {
    const budget = await this.costTracker.checkBudget();
    if (!budget.allowed) {
      return { suggestions: [] };
    }

    // Fetch the transactions that were categorized to get their names
    const allTransactions = await this.chatbotDataService.queryTransactions(familyId, {});
    const txMap = new Map(allTransactions.map(t => [t.id, t]));
    const categories = await this.chatbotDataService.getCategories(familyId);
    const catMap = new Map(categories.map(c => [c.id, c]));
    const existingRules = await this.chatbotDataService.getAutoCategorizeRules(familyId);

    // Build categorization data for Claude
    const catData = categorizations
      .map(c => {
        const tx = txMap.get(c.transactionId);
        const cat = catMap.get(c.categoryId);
        if (!tx || !cat) return null;
        return { name: tx.name, merchantName: tx.merchantName, categoryId: c.categoryId, categoryName: cat.name };
      })
      .filter(Boolean);

    if (catData.length < 2) {
      return { suggestions: [] };
    }

    const existingPatterns = existingRules.flatMap(r => r.patterns);

    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: RULE_SUGGESTION_SYSTEM_PROMPT,
        tools: [RULE_SUGGESTION_TOOL],
        messages: [{
          role: 'user',
          content: JSON.stringify({
            categorizations: catData,
            existingRulePatterns: existingPatterns,
          }),
        }],
      });

      // Record cost
      await this.costTracker.recordUsage(
        familyId, 'sonnet', response.usage.input_tokens, response.usage.output_tokens,
      );

      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'suggest_rules',
      );

      if (!toolUse) return { suggestions: [] };

      const output = toolUse.input as { suggestions: RuleSuggestion[] };
      return { suggestions: output.suggestions || [] };
    } catch (error) {
      console.error('[CategorizationService] suggestRules error:', error instanceof Error ? error.message : error);
      return { suggestions: [] };
    }
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private async getUncategorizedTransactions(
    familyId: string,
    transactionIds?: string[],
  ): Promise<Transaction[]> {
    if (transactionIds?.length) {
      const all = await this.chatbotDataService.queryTransactions(familyId, {});
      const idSet = new Set(transactionIds);
      return all.filter(t => idSet.has(t.id) && !t.categoryId);
    }
    return this.chatbotDataService.queryTransactions(familyId, { onlyUncategorized: true });
  }

  private async buildExamples(
    familyId: string,
    categories: Category[],
  ): Promise<string> {
    // Get recent categorized transactions as few-shot examples
    const categorized = await this.chatbotDataService.queryTransactions(familyId, { limit: 500 });
    const withCategory = categorized.filter(t => t.categoryId);

    // Group by category, take top N categories with up to M examples each
    const byCategory = new Map<string, Transaction[]>();
    for (const t of withCategory) {
      if (!byCategory.has(t.categoryId!)) byCategory.set(t.categoryId!, []);
      byCategory.get(t.categoryId!)!.push(t);
    }

    const catMap = new Map(categories.map(c => [c.id, c]));
    const lines: string[] = [];

    // Sort categories by number of transactions (most common first)
    const sorted = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length);

    for (const [catId, txns] of sorted.slice(0, MAX_EXAMPLE_CATEGORIES)) {
      const cat = catMap.get(catId);
      if (!cat) continue;
      const examples = txns.slice(0, MAX_EXAMPLES_PER_CATEGORY);
      const txStrs = examples.map(t => `"${t.merchantName || t.name}" ($${Math.abs(t.amount).toFixed(2)})`).join(', ');
      lines.push(`${cat.name} (${catId}): ${txStrs}`);
    }

    return lines.join('\n');
  }

  private buildCategoryContext(categories: Category[]): string {
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

  private async classifyBatch(
    transactions: Transaction[],
    categoryContext: string,
    examples: string,
    _existingRules: AutoCategorizeRule[],
  ): Promise<{ results: ClassificationResult[]; cost: number }> {
    const txData = transactions.map(t => ({
      id: t.id,
      name: t.name,
      merchantName: t.merchantName,
      amount: t.amount,
      date: t.date,
    }));

    const userMessage = `Classify these uncategorized transactions:

TRANSACTIONS:
${JSON.stringify(txData)}

CATEGORY HIERARCHY:
${categoryContext}

EXAMPLES OF PREVIOUSLY CATEGORIZED TRANSACTIONS:
${examples}`;

    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: CATEGORIZATION_SYSTEM_PROMPT,
        tools: [CATEGORIZATION_TOOL],
        messages: [{ role: 'user', content: userMessage }],
      });

      const cost = ChatbotCostTracker.estimateCost(
        'sonnet', response.usage.input_tokens, response.usage.output_tokens,
      );

      // Record cost
      await this.costTracker.recordUsage(
        'system', 'sonnet', response.usage.input_tokens, response.usage.output_tokens,
      );

      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'classify_transactions',
      );

      if (!toolUse) {
        console.warn('[CategorizationService] No tool_use in response, returning empty');
        return { results: [], cost };
      }

      const output = toolUse.input as { classifications: ClassificationResult[] };
      return { results: output.classifications || [], cost };
    } catch (error) {
      console.error('[CategorizationService] classifyBatch error:', error instanceof Error ? error.message : error);
      throw error;
    }
  }

  private groupIntoBuckets(
    results: ClassificationResult[],
    transactions: Transaction[],
    categories: Category[],
  ): { buckets: ClassificationBucket[]; unsureBucket: ClassificationBucket } {
    const txMap = new Map(transactions.map(t => [t.id, t]));
    const catMap = new Map(categories.map(c => [c.id, c]));

    // Group by (categoryId, confidence)
    const groups = new Map<string, ClassifiedTransaction[]>();
    const unsure: ClassifiedTransaction[] = [];

    for (const r of results) {
      const tx = txMap.get(r.transactionId);
      if (!tx) continue;

      const classified: ClassifiedTransaction = {
        id: tx.id,
        date: tx.date,
        name: tx.merchantName || tx.name,
        merchantName: tx.merchantName,
        amount: tx.amount,
        suggestedCategoryId: r.suggestedCategoryId,
        confidence: r.confidence,
        reasoning: r.reasoning,
        selectedCategoryId: r.suggestedCategoryId,
      };

      if (r.confidence === 'low') {
        unsure.push(classified);
      } else {
        const key = r.suggestedCategoryId;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(classified);
      }
    }

    // Build buckets sorted by confidence then size
    const buckets: ClassificationBucket[] = [];
    for (const [catId, txns] of groups) {
      const cat = catMap.get(catId);
      const confidence = txns[0].confidence; // all same category
      buckets.push({
        categoryId: catId,
        categoryName: cat?.name || 'Unknown',
        confidence,
        transactions: txns,
        totalAmount: Math.round(txns.reduce((sum, t) => sum + Math.abs(t.amount), 0) * 100) / 100,
      });
    }

    // Sort: high confidence first, then by transaction count descending
    buckets.sort((a, b) => {
      const confOrder = { high: 0, medium: 1, low: 2 };
      const confDiff = confOrder[a.confidence] - confOrder[b.confidence];
      if (confDiff !== 0) return confDiff;
      return b.transactions.length - a.transactions.length;
    });

    const unsureBucket: ClassificationBucket = {
      categoryId: '',
      categoryName: 'Unsure',
      confidence: 'low',
      transactions: unsure,
      totalAmount: Math.round(unsure.reduce((sum, t) => sum + Math.abs(t.amount), 0) * 100) / 100,
    };

    return { buckets, unsureBucket };
  }

  private emptyBucket(): ClassificationBucket {
    return { categoryId: '', categoryName: 'Unsure', confidence: 'low', transactions: [], totalAmount: 0 };
  }
}
