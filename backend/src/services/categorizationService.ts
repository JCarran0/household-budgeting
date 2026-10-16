/**
 * CategorizationService — AI-Powered Bulk Transaction Classification
 *
 * Classifies uncategorized transactions against the user's category hierarchy
 * using Claude. Shares cost tracking with the chatbot. Separate from
 * ChatbotService because the API pattern is different (batch classification
 * vs conversational tool_use loop).
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ChatbotDataService } from './chatbotDataService';
import { ChatbotCostTracker } from './chatbotCostTracker';
import { childLogger } from '../utils/logger';
import { ExternalServiceError } from '../errors';

const log = childLogger('categorizationService');

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
  ChatModel,
} from '../shared/types';

// Hard cap on transactions classified per request. Running many batches
// synchronously inside one HTTP request blows past nginx/ALB/browser timeouts.
// The frontend re-invokes classifyTransactions until remainingUncategorized
// hits 0.
const CLASSIFICATION_REQUEST_LIMIT = 50;
// Each request's transactions are split into batches that run concurrently,
// so wall-clock is one batch's latency rather than the sum — a single Opus
// call over all 50 with thinking risks nginx's 120s proxy ceiling.
const BATCH_SIZE = 25;
const MAX_EXAMPLES_PER_CATEGORY = 5;
const MAX_EXAMPLE_CATEGORIES = 20;
// REQ-P056 — reviewed 2026-10-15. Opus 5.5 cannot disable thinking, and
// thinking tokens count against max_tokens, so the ceiling is sized for
// thinking plus a full batch of classifications. Calls stream so a ceiling
// this large cannot trip the SDK's non-streaming timeout guard.
const MODEL = 'claude-opus-5-5';
const EFFORT = 'medium';
const MAX_TOKENS = 32000;
// Opus 5.5 is $4/$20 per MTok; the 'opus' tier is priced at Opus 5's $5/$25
// because the chatbot still runs Opus 5. Recording under it overstates this
// spend by 25% — the safe direction for a cap.
const COST_TIER: ChatModel = 'opus';

// Tool input is model output: validate it rather than casting (Critical Rule 3).
const classificationOutputSchema = z.object({
  classifications: z.array(z.object({
    transactionId: z.string(),
    suggestedCategoryId: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    reasoning: z.string(),
  })),
});

/**
 * What one classification call produced. Every transaction sent ends up in
 * exactly one of `results` or `failures` once reconciled — a run that reports
 * success with transactions silently missing is the bug this shape exists to
 * prevent (2026-10-15: 50 sent, output truncated at max_tokens, 0 returned,
 * UI showed "Categorization Complete").
 */
interface BatchOutcome {
  results: ClassificationResult[];
  /** transactionId → why the AI produced nothing usable for it. */
  failures: Map<string, string>;
  cost: number;
}

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
    // Check cost cap — scoped to this workspace (REQ-007 / D11).
    const budget = await this.costTracker.checkBudget(familyId);
    if (!budget.allowed) {
      throw new Error('Monthly AI budget cap reached. Try again next month.');
    }

    // Fetch data
    const [allUncategorized, categories] = await Promise.all([
      this.getUncategorizedTransactions(familyId, transactionIds),
      this.chatbotDataService.getCategories(familyId),
    ]);

    if (allUncategorized.length === 0) {
      log.info('no uncategorized transactions found');
      return {
        buckets: [],
        unsureBucket: this.emptyBucket(),
        totalClassified: 0,
        costUsed: 0,
        remainingUncategorized: 0,
      };
    }

    // Cap to a single batch per request — see CLASSIFICATION_REQUEST_LIMIT
    // comment. Newest transactions first so the user works the freshest
    // backlog as they re-run the flow.
    const sorted = [...allUncategorized].sort((a, b) => b.date.localeCompare(a.date));
    const uncategorized = sorted.slice(0, CLASSIFICATION_REQUEST_LIMIT);
    const remainingUncategorized = Math.max(0, allUncategorized.length - uncategorized.length);

    log.info(
      { batchCount: uncategorized.length, totalUncategorized: allUncategorized.length, remainingUncategorized },
      'classifying transactions',
    );

    // Build few-shot examples from previously categorized transactions
    const examples = await this.buildExamples(familyId, categories);

    // Build category hierarchy context
    const categoryContext = this.buildCategoryContext(categories);

    // Classify in concurrent batches
    const batches: Transaction[][] = [];
    for (let i = 0; i < uncategorized.length; i += BATCH_SIZE) {
      batches.push(uncategorized.slice(i, i + BATCH_SIZE));
    }
    const outcomes = await Promise.all(batches.map((batch, i) => {
      log.info({ batchNum: i + 1, totalBatches: batches.length, batchSize: batch.length }, 'classifying batch');
      return this.classifyBatch(familyId, batch, categoryContext, examples);
    }));
    const merged = mergeOutcomes(outcomes);

    const { results, failures } = this.reconcile(merged, uncategorized, categories);
    log.info(
      { classified: results.length, failed: failures.size, cost: Number(merged.cost.toFixed(4)) },
      'classification reconciled',
    );

    // Nothing usable at all: fail loudly rather than reporting a "complete"
    // run that categorized nothing. Spend has already been recorded.
    if (results.length === 0) {
      const reason = failures.values().next().value ?? 'no suggestions were returned';
      throw new ExternalServiceError(
        `AI categorization returned no usable suggestions for ${uncategorized.length} transactions: ${reason} No changes were made.`,
      );
    }

    const { buckets, unsureBucket } = this.groupIntoBuckets(results, failures, uncategorized, categories);
    log.info({ buckets: buckets.length, unsure: unsureBucket.transactions.length }, 'classification done');

    return {
      buckets,
      unsureBucket,
      totalClassified: results.length,
      costUsed: Math.round(merged.cost * 1_000_000) / 1_000_000,
      remainingUncategorized,
    };
  }

  /**
   * Suggest auto-categorization rules based on completed categorizations.
   */
  async suggestRules(
    familyId: string,
    categorizations: { transactionId: string; categoryId: string }[],
  ): Promise<SuggestRulesResponse> {
    const budget = await this.costTracker.checkBudget(familyId);
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
      const response = await this.client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        output_config: { effort: EFFORT },
        system: RULE_SUGGESTION_SYSTEM_PROMPT,
        tools: [RULE_SUGGESTION_TOOL],
        messages: [{
          role: 'user',
          content: JSON.stringify({
            categorizations: catData,
            existingRulePatterns: existingPatterns,
          }),
        }],
      }).finalMessage();

      // Record cost
      await this.costTracker.recordUsage(
        familyId, COST_TIER, response.usage.input_tokens, response.usage.output_tokens,
      );

      // Rule suggestions are optional — a truncated or declined response just
      // means no suggestions, but say so in the log instead of returning [] mutely.
      if (response.stop_reason === 'max_tokens' || response.stop_reason === 'refusal') {
        log.warn({ stopReason: response.stop_reason }, 'suggestRules: no usable response');
        return { suggestions: [] };
      }

      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'suggest_rules',
      );

      if (!toolUse) return { suggestions: [] };

      const output = toolUse.input as { suggestions: RuleSuggestion[] };
      return { suggestions: output.suggestions || [] };
    } catch (error) {
      log.error({ err: error }, 'suggestRules error');
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
    familyId: string,
    transactions: Transaction[],
    categoryContext: string,
    examples: string,
  ): Promise<BatchOutcome> {
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

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        output_config: { effort: EFFORT },
        system: CATEGORIZATION_SYSTEM_PROMPT,
        tools: [CATEGORIZATION_TOOL],
        messages: [{ role: 'user', content: userMessage }],
      }).finalMessage();
    } catch (error) {
      log.error({ err: error }, 'classifyBatch error');
      throw error;
    }

    const cost = ChatbotCostTracker.estimateCost(
      COST_TIER, response.usage.input_tokens, response.usage.output_tokens,
    );

    // Record cost against the workspace that incurred it, so classification
    // spend counts toward the same cap `classifyTransactions` checks (SA-03).
    await this.costTracker.recordUsage(
      familyId, COST_TIER, response.usage.input_tokens, response.usage.output_tokens,
    );

    log.info({
      batchSize: transactions.length,
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Number(cost.toFixed(4)),
    }, 'batch response');

    const failAll = (reason: string): BatchOutcome => ({
      results: [],
      failures: new Map(transactions.map(t => [t.id, reason])),
      cost,
    });

    // Truncated mid-output: the tool input is incomplete, so nothing in it can
    // be trusted. Halve and retry until a batch fits or a single transaction
    // still doesn't.
    if (response.stop_reason === 'max_tokens') {
      if (transactions.length === 1) {
        return failAll('The AI response was cut off before it finished.');
      }
      log.warn({ batchSize: transactions.length }, 'batch output truncated; splitting and retrying');
      const mid = Math.ceil(transactions.length / 2);
      const halves = await Promise.all([
        this.classifyBatch(familyId, transactions.slice(0, mid), categoryContext, examples),
        this.classifyBatch(familyId, transactions.slice(mid), categoryContext, examples),
      ]);
      const merged = mergeOutcomes(halves);
      return { ...merged, cost: merged.cost + cost };
    }

    if (response.stop_reason === 'refusal') {
      log.warn({ batchSize: transactions.length }, 'batch declined by the model');
      return failAll('The AI declined to classify this transaction.');
    }

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'classify_transactions',
    );
    if (!toolUse) {
      log.warn({ stopReason: response.stop_reason }, 'no classify_transactions call in response');
      return failAll('The AI did not return a classification.');
    }

    const parsed = classificationOutputSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      log.warn({ issues: parsed.error.issues.slice(0, 5) }, 'classification output failed validation');
      return failAll('The AI returned its classification in an unexpected format.');
    }

    return { results: parsed.data.classifications, failures: new Map(), cost };
  }

  /**
   * Give every transaction sent exactly one outcome. Drops results for ids that
   * were not in the request, and turns a suggestion naming a category the user
   * cannot see into a failure — written through, it would be an orphan
   * categoryId (see docs/features/ORPHAN-CATEGORYIDS-PLAN.yaml).
   */
  private reconcile(
    outcome: BatchOutcome,
    transactions: Transaction[],
    categories: Category[],
  ): { results: ClassificationResult[]; failures: Map<string, string> } {
    const offered = new Set(categories.filter(c => !c.isHidden).map(c => c.id));
    const byTxn = new Map<string, ClassificationResult>();
    for (const r of outcome.results) {
      if (!byTxn.has(r.transactionId)) byTxn.set(r.transactionId, r);
    }

    const results: ClassificationResult[] = [];
    const failures = new Map<string, string>();
    for (const t of transactions) {
      const r = byTxn.get(t.id);
      if (r && offered.has(r.suggestedCategoryId)) {
        results.push(r);
      } else if (r) {
        failures.set(t.id, 'The AI suggested a category that does not exist.');
      } else {
        failures.set(t.id, outcome.failures.get(t.id) ?? 'The AI skipped this transaction.');
      }
    }
    return { results, failures };
  }

  private groupIntoBuckets(
    results: ClassificationResult[],
    failures: Map<string, string>,
    transactions: Transaction[],
    categories: Category[],
  ): { buckets: ClassificationBucket[]; unsureBucket: ClassificationBucket } {
    const txMap = new Map(transactions.map(t => [t.id, t]));
    const catMap = new Map(categories.map(c => [c.id, c]));

    // Group by (categoryId, confidence)
    const groups = new Map<string, ClassifiedTransaction[]>();
    const unsure: ClassifiedTransaction[] = [];

    // Failed transactions go to Unsure with no preselected category, so
    // Apply skips them unless the user picks one.
    for (const [id, reason] of failures) {
      const tx = txMap.get(id);
      if (!tx) continue;
      unsure.push({
        id: tx.id,
        date: tx.date,
        name: tx.merchantName || tx.name,
        merchantName: tx.merchantName,
        amount: tx.amount,
        suggestedCategoryId: '',
        confidence: 'low',
        reasoning: reason,
        selectedCategoryId: '',
      });
    }

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

function mergeOutcomes(outcomes: BatchOutcome[]): BatchOutcome {
  return {
    results: outcomes.flatMap(o => o.results),
    failures: new Map(outcomes.flatMap(o => [...o.failures])),
    cost: outcomes.reduce((sum, o) => sum + o.cost, 0),
  };
}
