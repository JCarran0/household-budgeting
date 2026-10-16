/**
 * Every Amazon order sent for categorization ends with a visible outcome.
 *
 * Same failure shape as the 2026-10-15 categorization incident: the adapter
 * ran one Sonnet call at 8192 max_tokens with no stop_reason check and cast
 * the tool input unvalidated, so a cut-off response produced a review step
 * silently missing orders — or none at all.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { AmazonCategorizerAdapter } from '../../services/amazon/amazonCategorizerAdapter';
import { AmazonPdfParser } from '../../services/amazon/amazonPdfParser';
import { ExternalServiceError, ValidationError } from '../../errors';
import type { ChatbotDataService } from '../../services/chatbotDataService';
import type { ChatbotCostTracker } from '../../services/chatbotCostTracker';
import type { AmazonTransactionMatch, Category, Transaction } from '../../shared/types';

const FAMILY_ID = 'family-abc';

const categories = [
  { id: 'cat-pets', name: 'Pet Food', parentId: null, isHidden: false },
  { id: 'cat-home', name: 'Household', parentId: null, isHidden: false },
  { id: 'cat-old', name: 'Old', parentId: null, isHidden: true },
] as unknown as Category[];

function match(id: string, items = ['Dog food']): AmazonTransactionMatch {
  return {
    id,
    orderNumber: `111-${id}`,
    transactionId: `tx-${id}`,
    items: items.map(name => ({ name, estimatedPrice: null, quantity: 1 })),
    status: 'pending',
  } as unknown as AmazonTransactionMatch;
}

function categorization(matchId: string, suggestedCategoryId = 'cat-pets') {
  return { matchId, suggestedCategoryId, confidence: 0.9, reasoning: 'Dog food.', itemName: 'Dog food' };
}

function toolResponse(input: unknown, stopReason = 'tool_use') {
  return {
    stop_reason: stopReason,
    usage: { input_tokens: 1000, output_tokens: 500 },
    content: [{ type: 'tool_use', name: 'categorize_amazon_items', input }],
  };
}

function ok(categorizations: unknown[], splitRecommendations: unknown[] = []) {
  return toolResponse({ categorizations, splitRecommendations });
}

const truncated = () => toolResponse({}, 'max_tokens');

function costTracker() {
  return {
    recordUsage: jest.fn().mockResolvedValue({ estimatedCost: 0.01 }),
  } as unknown as ChatbotCostTracker & { recordUsage: jest.Mock };
}

function clientReturning(responses: unknown[]) {
  const queue = [...responses];
  const stream = jest.fn().mockImplementation(() => ({
    finalMessage: jest.fn().mockResolvedValue(queue.shift()),
  }));
  return { client: { messages: { stream } } as unknown as Anthropic, stream };
}

function buildAdapter(matches: AmazonTransactionMatch[], responses: unknown[]) {
  const transactions = matches.map(m => ({ id: m.transactionId, amount: -20, categoryId: null })) as unknown as Transaction[];
  const data = {
    getCategories: jest.fn().mockResolvedValue(categories),
    queryTransactions: jest.fn().mockResolvedValue(transactions),
  } as unknown as ChatbotDataService;
  const tracker = costTracker();
  const { client, stream } = clientReturning(responses);
  return { adapter: new AmazonCategorizerAdapter(client, data, tracker), stream, tracker };
}

describe('AmazonCategorizerAdapter outcomes', () => {
  it('throws a visible error, and still records cost, when output is truncated', async () => {
    const { adapter, tracker } = buildAdapter([match('m1')], [truncated()]);

    const error = await adapter.categorize(FAMILY_ID, [match('m1')], []).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalServiceError);
    expect((error as Error).message).toMatch(/cut off/);
    expect(tracker.recordUsage).toHaveBeenCalledWith(FAMILY_ID, 'opus', 1000, 500, 'interactive', { writeTokens: 0, readTokens: 0 });
  });

  it('splits a truncated batch in half and retries', async () => {
    const matches = [match('m1'), match('m2')];
    const { adapter, stream } = buildAdapter(matches, [
      truncated(),
      ok([categorization('m1')]),
      ok([categorization('m2')]),
    ]);

    const result = await adapter.categorize(FAMILY_ID, matches, []);

    expect(stream).toHaveBeenCalledTimes(3);
    expect(result.recommendations).toHaveLength(2);
    expect(result.failures).toEqual([]);
  });

  it('reports a skipped order as a failure instead of dropping it', async () => {
    const matches = [match('m1'), match('m2', ['Paper towels', 'Sponges'])];
    const { adapter } = buildAdapter(matches, [ok([categorization('m1')])]);

    const result = await adapter.categorize(FAMILY_ID, matches, []);

    expect(result.failures).toEqual([
      { matchId: 'm2', itemName: 'Paper towels, Sponges', reason: expect.stringMatching(/skipped/) },
    ]);
  });

  it('never offers a category the user cannot see, in a categorization or any split line', async () => {
    const matches = [match('m1'), match('m2'), match('m3'), match('m4')];
    const split = (matchId: string, second: string) => ({
      matchId,
      splits: [
        { itemName: 'A', estimatedAmount: 10, suggestedCategoryId: 'cat-pets', confidence: 0.9, isEstimatedPrice: true },
        { itemName: 'B', estimatedAmount: 10, suggestedCategoryId: second, confidence: 0.9, isEstimatedPrice: true },
      ],
    });
    const { adapter } = buildAdapter(matches, [ok(
      [categorization('m1'), categorization('m2', 'cat-invented'), categorization('m3', 'cat-old')],
      [split('m4', 'cat-invented')],
    )]);

    const result = await adapter.categorize(FAMILY_ID, matches, []);

    expect(result.recommendations.map(r => r.matchId)).toEqual(['m1']);
    expect(result.splitRecommendations).toEqual([]);
    expect(result.failures.map(f => f.matchId).sort()).toEqual(['m2', 'm3', 'm4']);
  });

  it('ignores results for orders that were not sent, and duplicates', async () => {
    const { adapter } = buildAdapter([match('m1')], [ok([
      categorization('m1'),
      categorization('m1', 'cat-home'),
      categorization('not-sent'),
    ])]);

    const result = await adapter.categorize(FAMILY_ID, [match('m1')], []);

    expect(result.recommendations.map(r => [r.matchId, r.suggestedCategoryId])).toEqual([['m1', 'cat-pets']]);
  });

  it('treats malformed output and refusals as failures', async () => {
    const malformed = buildAdapter([match('m1')], [toolResponse({ categorizations: 'oops' })]);
    await expect(malformed.adapter.categorize(FAMILY_ID, [match('m1')], [])).rejects.toThrow(/unexpected format/);

    const refused = buildAdapter([match('m1')], [{ stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 1 }, content: [] }]);
    await expect(refused.adapter.categorize(FAMILY_ID, [match('m1')], [])).rejects.toThrow(/declined/);
  });
});

describe('AmazonPdfParser stop reasons', () => {
  const pdf = Buffer.from('%PDF-1.4');

  it('refuses a cut-off extraction rather than losing the orders past the cut, and records cost', async () => {
    const tracker = costTracker();
    const { client } = clientReturning([{
      stop_reason: 'max_tokens',
      usage: { input_tokens: 5000, output_tokens: 64000 },
      content: [{ type: 'tool_use', name: 'extract_amazon_data', input: { pdfType: 'orders', orders: [] } }],
    }]);

    const error = await new AmazonPdfParser(client, tracker)
      .parseFile(FAMILY_ID, pdf, 'application/pdf')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toMatch(/shorter date range/);
    expect(tracker.recordUsage).toHaveBeenCalledWith(FAMILY_ID, 'opus', 5000, 64000);
  });

  it('records cost even when the file is not an Amazon page', async () => {
    const tracker = costTracker();
    const { client } = clientReturning([{ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, content: [] }]);

    await expect(new AmazonPdfParser(client, tracker).parseFile(FAMILY_ID, pdf, 'application/pdf'))
      .rejects.toThrow(/doesn't look like an Amazon/);
    expect(tracker.recordUsage).toHaveBeenCalled();
  });
});
