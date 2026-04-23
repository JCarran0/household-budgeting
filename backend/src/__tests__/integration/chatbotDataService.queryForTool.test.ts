/**
 * ChatbotDataService queryTransactionsForTool test — TD-012 Sprint 2
 *
 * Verifies the tool-facing wrapper caps rows in model context and returns an
 * aggregate summary when the match set exceeds the limit. The point of the
 * cap is cost control on Anthropic input tokens — a 12-month "all dining"
 * query on an 800+ transaction family must not dump every row into prompt.
 */

import { ChatbotDataService } from '../../services/chatbotDataService';
import { ReadOnlyDataServiceImpl } from '../../services/readOnlyDataService';
import { InMemoryDataService } from '../../services/dataService';
import type { Category } from '../../shared/types';

describe('ChatbotDataService.queryTransactionsForTool — TD-012 cap + summary', () => {
  const FAMILY_ID = 'fam-tool';

  const seedCategories: Category[] = [
    { id: 'FOOD', name: 'Food', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'FOOD_DINING', name: 'Dining', parentId: 'FOOD', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
  ];

  let dataService: InMemoryDataService;
  let chatbotData: ChatbotDataService;

  beforeEach(async () => {
    dataService = new InMemoryDataService();
    chatbotData = new ChatbotDataService(new ReadOnlyDataServiceImpl(dataService));
    await dataService.saveCategories(seedCategories, FAMILY_ID);
  });

  function seedTransactions(count: number): Promise<void> {
    const rows = Array.from({ length: count }, (_, i) => {
      const monthIdx = (i % 3) + 1; // 2026-01 / 02 / 03
      const dayIdx = (i % 28) + 1;
      const date = `2026-0${monthIdx}-${String(dayIdx).padStart(2, '0')}`;
      return {
        id: `t${i}`,
        userId: 'u1',
        accountId: 'a1',
        plaidAccountId: 'p1',
        amount: 10, // expenses; sum goes into byCategory.total as positive
        date,
        name: `Merchant ${i}`,
        categoryId: 'FOOD_DINING',
        status: 'posted',
        pending: false,
        isHidden: false,
        isSplit: false,
        parentTransactionId: null,
        splitTransactionIds: [],
        createdAt: date,
        updatedAt: date,
      };
    });
    return dataService.saveData(`transactions_${FAMILY_ID}`, rows);
  }

  test('returns full array when match count ≤ default limit (50)', async () => {
    await seedTransactions(20);

    const result = await chatbotData.queryTransactionsForTool(FAMILY_ID, {});

    expect(result.count).toBe(20);
    expect(result.truncated).toBe(false);
    expect(result.limit).toBe(50);
    expect(result.transactions).toHaveLength(20);
    expect(result.summary).toBeUndefined();
  });

  test('truncates to limit + returns summary aggregates when match count > limit', async () => {
    await seedTransactions(120);

    const result = await chatbotData.queryTransactionsForTool(FAMILY_ID, {});

    expect(result.count).toBe(120);
    expect(result.truncated).toBe(true);
    expect(result.limit).toBe(50);
    expect(result.transactions).toHaveLength(50);
    expect(result.summary).toBeDefined();

    // byCategory covers the FULL 120, not just the 50 sampled
    const foodBucket = result.summary!.byCategory.find(b => b.categoryId === 'FOOD_DINING');
    expect(foodBucket?.count).toBe(120);
    expect(foodBucket?.total).toBe(1200); // 120 × 10

    // byMonth covers all months in the match set
    const monthTotal = result.summary!.byMonth.reduce((s, b) => s + b.count, 0);
    expect(monthTotal).toBe(120);
    // Sorted ascending by month key
    const months = result.summary!.byMonth.map(b => b.month);
    expect(months).toEqual([...months].sort());
  });

  test('honors explicit limit from the model', async () => {
    await seedTransactions(120);

    const result = await chatbotData.queryTransactionsForTool(FAMILY_ID, { limit: 10 });

    expect(result.count).toBe(120);
    expect(result.truncated).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.transactions).toHaveLength(10);
    expect(result.summary?.byCategory[0].count).toBe(120);
  });

  test('hard-caps limit at 500 even if the model requests more', async () => {
    await seedTransactions(60);

    const result = await chatbotData.queryTransactionsForTool(FAMILY_ID, { limit: 10_000 });

    // Match count is 60 (< 500), so no truncation, but the effective limit is clamped.
    expect(result.limit).toBe(500);
    expect(result.truncated).toBe(false);
    expect(result.transactions).toHaveLength(60);
  });
});
