/**
 * Every transaction sent for AI classification must end with a visible outcome.
 *
 * Regression for 2026-10-15: a 50-transaction batch hit max_tokens, the
 * truncated tool input parsed to nothing, and the run reported "Categorization
 * Complete — 0 transactions categorized" with no error. These tests pin the
 * paths that used to return an empty result silently.
 */

import { CategorizationService } from '../../services/categorizationService';
import { ExternalServiceError } from '../../errors';
import type { ChatbotDataService } from '../../services/chatbotDataService';
import type { ChatbotCostTracker } from '../../services/chatbotCostTracker';
import type { Category, Transaction } from '../../shared/types';

const FAMILY_ID = 'family-abc';

function txn(id: string): Transaction {
  return {
    id,
    name: `MERCHANT ${id}`,
    merchantName: null,
    amount: 10,
    date: '2026-10-01',
    categoryId: null,
  } as unknown as Transaction;
}

const categories: Category[] = [
  { id: 'cat-dining', name: 'Dining', parentId: null, isHidden: false } as unknown as Category,
  { id: 'cat-old', name: 'Old', parentId: null, isHidden: true } as unknown as Category,
];

interface StubClassification {
  transactionId: string;
  suggestedCategoryId: string;
  confidence?: 'high' | 'medium' | 'low';
}

function toolResponse(classifications: StubClassification[], stopReason = 'tool_use') {
  return {
    stop_reason: stopReason,
    usage: { input_tokens: 1000, output_tokens: 500 },
    content: [{
      type: 'tool_use',
      name: 'classify_transactions',
      input: {
        classifications: classifications.map(c => ({
          confidence: 'high',
          reasoning: 'Matches a past example.',
          ...c,
        })),
      },
    }],
  };
}

function truncatedResponse() {
  return {
    stop_reason: 'max_tokens',
    usage: { input_tokens: 1000, output_tokens: 32000 },
    content: [{ type: 'tool_use', name: 'classify_transactions', input: {} }],
  };
}

/** Builds a service whose Claude calls return `responses` in order. */
function buildService(transactions: Transaction[], responses: unknown[]) {
  const recordUsage = jest.fn().mockResolvedValue(undefined);
  const checkBudget = jest.fn().mockResolvedValue({ allowed: true });
  const costTracker = { recordUsage, checkBudget } as unknown as ChatbotCostTracker;

  const chatbotDataService = {
    queryTransactions: jest.fn().mockResolvedValue(transactions),
    getCategories: jest.fn().mockResolvedValue(categories),
    getAutoCategorizeRules: jest.fn().mockResolvedValue([]),
  } as unknown as ChatbotDataService;

  const service = new CategorizationService(chatbotDataService, costTracker, 'test-key');

  const queue = [...responses];
  const stream = jest.fn().mockImplementation(() => ({
    finalMessage: jest.fn().mockResolvedValue(queue.shift()),
  }));
  (service as unknown as { client: { messages: { stream: jest.Mock } } }).client = {
    messages: { stream },
  };

  return { service, stream, recordUsage };
}

describe('CategorizationService outcomes', () => {
  it('throws a visible error instead of reporting an empty success when output is truncated', async () => {
    const { service, recordUsage } = buildService([txn('t1')], [truncatedResponse()]);

    const error = await service.classifyTransactions(FAMILY_ID).catch((e: unknown) => e);
    // ExternalServiceError is what lets the message through to the UI in
    // production; a plain Error becomes "Internal server error".
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect((error as Error).message).toMatch(/cut off/);
    // The failed call still cost money and must count toward the cap.
    expect(recordUsage).toHaveBeenCalled();
  });

  it('splits a truncated batch in half and retries', async () => {
    const { service, stream } = buildService(
      [txn('t1'), txn('t2')],
      [
        truncatedResponse(),
        toolResponse([{ transactionId: 't1', suggestedCategoryId: 'cat-dining' }]),
        toolResponse([{ transactionId: 't2', suggestedCategoryId: 'cat-dining' }]),
      ],
    );

    const result = await service.classifyTransactions(FAMILY_ID);

    expect(stream).toHaveBeenCalledTimes(3);
    expect(result.totalClassified).toBe(2);
    expect(result.unsureBucket.transactions).toHaveLength(0);
  });

  it('puts a skipped transaction in Unsure with a reason and nothing preselected', async () => {
    const { service } = buildService(
      [txn('t1'), txn('t2')],
      [toolResponse([{ transactionId: 't1', suggestedCategoryId: 'cat-dining' }])],
    );

    const result = await service.classifyTransactions(FAMILY_ID);

    expect(result.totalClassified).toBe(1);
    const [skipped] = result.unsureBucket.transactions;
    expect(skipped.id).toBe('t2');
    expect(skipped.selectedCategoryId).toBe('');
    expect(skipped.reasoning).toMatch(/skipped/);
  });

  it('never preselects a category the user cannot see', async () => {
    const { service } = buildService(
      [txn('t1'), txn('t2'), txn('t3')],
      [toolResponse([
        { transactionId: 't1', suggestedCategoryId: 'cat-dining' },
        { transactionId: 't2', suggestedCategoryId: 'cat-invented' },
        { transactionId: 't3', suggestedCategoryId: 'cat-old' },
      ])],
    );

    const result = await service.classifyTransactions(FAMILY_ID);

    expect(result.buckets.map(b => b.categoryId)).toEqual(['cat-dining']);
    const unsureIds = result.unsureBucket.transactions.map(t => t.id).sort();
    expect(unsureIds).toEqual(['t2', 't3']);
    expect(result.unsureBucket.transactions.every(t => t.selectedCategoryId === '')).toBe(true);
  });

  it('ignores results for transactions that were not sent', async () => {
    const { service } = buildService(
      [txn('t1')],
      [toolResponse([
        { transactionId: 't1', suggestedCategoryId: 'cat-dining' },
        { transactionId: 'not-sent', suggestedCategoryId: 'cat-dining' },
      ])],
    );

    const result = await service.classifyTransactions(FAMILY_ID);

    expect(result.totalClassified).toBe(1);
    expect(result.buckets[0].transactions.map(t => t.id)).toEqual(['t1']);
  });

  it('treats malformed tool output as a failure, not as zero results', async () => {
    const malformed = {
      stop_reason: 'tool_use',
      usage: { input_tokens: 1000, output_tokens: 500 },
      content: [{ type: 'tool_use', name: 'classify_transactions', input: { classifications: 'oops' } }],
    };
    const { service } = buildService([txn('t1')], [malformed]);

    await expect(service.classifyTransactions(FAMILY_ID)).rejects.toThrow(/unexpected format/);
  });

  it('reports a refusal as a failure', async () => {
    const refusal = {
      stop_reason: 'refusal',
      usage: { input_tokens: 1000, output_tokens: 10 },
      content: [],
    };
    const { service } = buildService([txn('t1')], [refusal]);

    await expect(service.classifyTransactions(FAMILY_ID)).rejects.toThrow(/declined/);
  });
});
