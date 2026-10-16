/**
 * Amazon item history (AI-AMAZON-RECEIPT-BRD §17).
 *
 * Locks: the history is pre-filled once from what survives today; rows
 * written before that import are not lost; the model sees only what the
 * family applied, never what the AI suggested, and never a category that is
 * now hidden; a split records each line and its item's applied category.
 */

import type Anthropic from '@anthropic-ai/sdk';
import {
  AmazonItemHistoryStore,
  buildImport,
  historyEntriesForAction,
  promptHistory,
  recordSuggestions,
} from '../../services/amazon/amazonItemHistoryStore';
import { AmazonCategorizerAdapter, buildStableContext } from '../../services/amazon/amazonCategorizerAdapter';
import type { DataService } from '../../services/dataService';
import type { ChatbotDataService } from '../../services/chatbotDataService';
import type { ChatbotCostTracker } from '../../services/chatbotCostTracker';
import type {
  AmazonItemHistoryEntry,
  AmazonReceiptSession,
  AmazonTransactionMatch,
  Category,
  Transaction,
} from '../../shared/types';

function memoryDataService(): DataService {
  const data = new Map<string, unknown>();
  return {
    getData: async (key: string) => (data.has(key) ? structuredClone(data.get(key)) : null),
    saveData: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); },
  } as unknown as DataService;
}

function match(id: string, items: string[], status: AmazonTransactionMatch['status'] = 'pending'): AmazonTransactionMatch {
  return {
    id,
    orderNumber: `111-${id}`,
    transactionId: `tx-${id}`,
    matchConfidence: 'high',
    items: items.map(name => ({
      name, estimatedPrice: null, suggestedCategoryId: null, appliedCategoryId: null, confidence: 0, isEstimatedPrice: true,
    })),
    splitTransactionIds: [],
    status,
  };
}

function entry(itemName: string, appliedCategoryId: string, recordedAt: string, suggestedCategoryId: string | null = null): AmazonItemHistoryEntry {
  return {
    itemName, appliedCategoryId, suggestedCategoryId, suggestedConfidence: null,
    orderNumber: null, transactionId: 't', source: 'categorize', recordedAt,
  };
}

const now = new Date().toISOString();

describe('buildImport', () => {
  it('takes categorized session items and Amazon split children, and nothing else', () => {
    const categorized = match('m1', ['Dog food'], 'categorized');
    categorized.items[0].appliedCategoryId = 'cat-pets';
    const session = { uploadedAt: now, matches: [categorized, match('m2', ['Skipped thing'], 'skipped')] } as unknown as AmazonReceiptSession;
    const transactions = [
      { id: 'c1', parentTransactionId: 'p1', categoryId: 'cat-home', userDescription: 'Paper towels', name: 'AMAZON.COM', merchantName: null, date: '2026-09-01' },
      { id: 'c2', parentTransactionId: 'p2', categoryId: 'cat-food', userDescription: 'Burrito', name: 'CHIPOTLE', merchantName: 'Chipotle', date: '2026-09-01' },
      { id: 'c3', parentTransactionId: null, categoryId: 'cat-home', userDescription: 'Not a split', name: 'AMAZON.COM', merchantName: null, date: '2026-09-01' },
    ] as unknown as Transaction[];

    const rows = buildImport([session], transactions);

    expect(rows.map(r => [r.itemName, r.appliedCategoryId, r.source, r.suggestedCategoryId])).toEqual([
      ['Dog food', 'cat-pets', 'import', null],
      ['Paper towels', 'cat-home', 'import', null],
    ]);
  });
});

describe('AmazonItemHistoryStore', () => {
  const noSources = async () => ({ sessions: [], transactions: [] });

  it('imports once, and keeps rows appended before the import ran', async () => {
    const store = new AmazonItemHistoryStore(memoryDataService());
    await store.append('fam', [entry('Charger', 'cat-elec', now)]);

    const sources = jest.fn(async () => ({
      sessions: [],
      transactions: [{ id: 'c1', parentTransactionId: 'p', categoryId: 'cat-home', userDescription: 'Paper towels', name: 'AMAZON.COM', merchantName: null, date: now.slice(0, 10) }] as unknown as Transaction[],
    }));
    const first = await store.load('fam', sources);
    await store.load('fam', sources);

    expect(sources).toHaveBeenCalledTimes(1);
    expect(first.map(e => e.itemName).sort()).toEqual(['Charger', 'Paper towels']);
  });

  it('prunes rows older than 24 months on write', async () => {
    const store = new AmazonItemHistoryStore(memoryDataService());
    await store.load('fam', noSources);
    const old = new Date(Date.now() - 800 * 86_400_000).toISOString();
    await store.append('fam', [entry('Old thing', 'cat-a', old), entry('New thing', 'cat-a', now)]);

    expect((await store.load('fam', noSources)).map(e => e.itemName)).toEqual(['New thing']);
  });
});

describe('promptHistory', () => {
  const names: Record<string, string> = { 'cat-pets': 'Pet Food', 'cat-gifts': 'Gifts' };

  it('shows only applied categories, counts repeats, keeps both sides of a split history, and drops hidden categories', () => {
    const rows = promptHistory([
      entry('Dog food', 'cat-pets', '2026-01-01', 'cat-groceries'),
      entry('dog  FOOD', 'cat-pets', '2026-02-01'),
      entry('Lego set', 'cat-gifts', '2026-03-01'),
      entry('Lego set', 'cat-hidden', '2026-04-01'),
    ], id => names[id]);

    expect(rows).toEqual([
      { itemName: 'Lego set', category: 'Gifts', times: 1 },
      { itemName: 'Dog food', category: 'Pet Food', times: 2 },
    ]);
    expect(JSON.stringify(rows)).not.toContain('groceries');
  });
});

describe('recording suggestions and outcomes', () => {
  it('records each split line against its item, sets appliedCategoryId, and keeps the suggestion beside it', () => {
    const m = match('m1', ['Paper towels', 'USB charger']);
    recordSuggestions([m], {
      recommendations: [],
      splitRecommendations: [{
        matchId: 'm1', transactionId: 'tx-m1', originalAmount: 30, totalMatchesOriginal: true,
        splits: [
          { itemName: 'USB charger', estimatedAmount: 10, suggestedCategoryId: 'cat-elec', confidence: 0.9, isEstimatedPrice: true, categoryName: 'Electronics' },
          { itemName: 'Paper towels', estimatedAmount: 20, suggestedCategoryId: 'cat-home', confidence: 0.8, isEstimatedPrice: true, categoryName: 'Home' },
        ],
      }],
    });

    const rows = historyEntriesForAction(m, {
      matchId: 'm1',
      type: 'split',
      splits: [
        { amount: 20, categoryId: 'cat-home', description: 'Paper towels' },
        { amount: 10, categoryId: 'cat-gifts', description: 'USB charger' },
      ],
    }, now);

    expect(rows.map(r => [r.itemName, r.suggestedCategoryId, r.appliedCategoryId, r.source])).toEqual([
      ['Paper towels', 'cat-home', 'cat-home', 'split'],
      ['USB charger', 'cat-elec', 'cat-gifts', 'split'],
    ]);
    expect(m.items.map(i => i.appliedCategoryId)).toEqual(['cat-home', 'cat-gifts']);
  });

  it('records every item of a single-category order', () => {
    const m = match('m1', ['A', 'B']);
    recordSuggestions([m], {
      recommendations: [{
        matchId: 'm1', transactionId: 'tx-m1', suggestedCategoryId: 'cat-home', categoryName: 'Home',
        confidence: 0.9, reasoning: '', itemName: 'A', isAlreadyCategorized: false, currentCategoryId: null,
      }],
      splitRecommendations: [],
    });

    const rows = historyEntriesForAction(m, { matchId: 'm1', type: 'categorize', categoryId: 'cat-home' }, now);

    expect(rows.map(r => [r.itemName, r.suggestedCategoryId, r.suggestedConfidence])).toEqual([
      ['A', 'cat-home', 0.9],
      ['B', 'cat-home', 0.9],
    ]);
  });
});

describe('categorizer prompt', () => {
  const categories = [{ id: 'cat-pets', name: 'Pet Food', parentId: null, isHidden: false }] as unknown as Category[];

  it('includes the item history and excludes Amazon rows from the generic examples', () => {
    const context = buildStableContext('Pet Food (cat-pets)', [{ itemName: 'Dog food', category: 'Pet Food', times: 3 }], 'Groceries (g): "Costco" ($200.00)');
    expect(context).toContain('["Dog food","Pet Food",3]');
    expect(context).toContain('Costco');
  });

  function adapterWith(matchCount: number) {
    const stream = jest.fn().mockImplementation(() => ({
      finalMessage: jest.fn().mockImplementation(async () => ({
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 10 },
        content: [{ type: 'tool_use', name: 'categorize_amazon_items', input: { categorizations: [], splitRecommendations: [] } }],
      })),
    }));
    const data = {
      getCategories: jest.fn().mockResolvedValue(categories),
      queryTransactions: jest.fn().mockResolvedValue([
        { id: 'a', name: 'AMAZON.COM', merchantName: null, categoryId: 'cat-pets', amount: -9 },
      ]),
    } as unknown as ChatbotDataService;
    const tracker = { recordUsage: jest.fn().mockResolvedValue({}) } as unknown as ChatbotCostTracker;
    const adapter = new AmazonCategorizerAdapter({ messages: { stream } } as unknown as Anthropic, data, tracker);
    const matches = Array.from({ length: matchCount }, (_, i) => match(`m${i}`, ['Dog food']));
    return { adapter, stream, matches };
  }

  it('marks the shared context for caching only when more than one batch will read it', async () => {
    const one = adapterWith(3);
    await one.adapter.categorize('fam', one.matches, []).catch(() => undefined);
    expect(one.stream.mock.calls[0][0].messages[0].content[0].cache_control).toBeUndefined();

    const many = adapterWith(20);
    await many.adapter.categorize('fam', many.matches, []).catch(() => undefined);
    expect(many.stream).toHaveBeenCalledTimes(2);
    for (const [request] of many.stream.mock.calls) {
      expect(request.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    }
  });

  it('never puts Amazon transactions in the generic examples', async () => {
    const { adapter, stream, matches } = adapterWith(1);
    await adapter.categorize('fam', matches, []).catch(() => undefined);
    const context: string = stream.mock.calls[0][0].messages[0].content[0].text;
    expect(context.split('SPENDING:')[1]).not.toContain('AMAZON');
  });
});
