/**
 * Tests for AutoCatSuggestionService — deterministic clustering of active
 * transactions into rule suggestions.
 *
 * Uses InMemoryDataService + a real AutoCategorizeService for fidelity. The
 * algorithm is exercised end-to-end (group → vote → dedup → sort).
 */

import { InMemoryDataService } from '../../services/dataService';
import { AutoCategorizeService, StoredAutoCategorizeRule } from '../../services/autoCategorizeService';
import { AutoCatSuggestionService } from '../../services/autoCatSuggestionService';
import type { StoredTransaction } from '../../services/transactionService';
import type { Category } from '../../shared/types';

const FAMILY_ID = 'fam-1';
const RESTAURANTS = 'FOOD_AND_DRINK_RESTAURANT';
const COFFEE = 'FOOD_AND_DRINK_COFFEE';
const TRANSFER_OUT = 'TRANSFER_OUT_ACCOUNT_TRANSFER';

const NOW = new Date('2026-05-04T12:00:00Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function dateNDaysAgo(n: number): string {
  const d = new Date(NOW.getTime() - n * ONE_DAY_MS);
  return d.toISOString().slice(0, 10);
}

function buildTx(overrides: Partial<StoredTransaction> & { id: string }): StoredTransaction {
  return {
    userId: FAMILY_ID,
    accountId: 'acc-1',
    plaidAccountId: 'pacc-1',
    plaidTransactionId: `p-${overrides.id}`,
    amount: 12.5,
    date: dateNDaysAgo(10),
    name: 'raw name',
    merchantName: null,
    userDescription: null,
    categoryId: null,
    category: null,
    plaidCategoryId: null,
    pending: false,
    status: 'posted',
    isoCurrencyCode: 'USD',
    accountOwner: null,
    originalDescription: null,
    location: null,
    tags: [],
    notes: null,
    isHidden: false,
    isFlagged: false,
    isSplit: false,
    parentTransactionId: null,
    splitTransactionIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as StoredTransaction;
}

function makeCategories(): Category[] {
  return [
    {
      id: RESTAURANTS,
      name: 'Restaurants',
      parentId: null,
      isCustom: false,
      isHidden: false,
      isRollover: false,
      isIncome: false,
      isSavings: false,
    },
    {
      id: COFFEE,
      name: 'Coffee',
      parentId: null,
      isCustom: false,
      isHidden: false,
      isRollover: false,
      isIncome: false,
      isSavings: false,
    },
    {
      id: TRANSFER_OUT,
      name: 'Transfer - Out',
      parentId: null,
      isCustom: false,
      isHidden: false,
      isRollover: false,
      isIncome: false,
      isSavings: false,
    },
  ];
}

async function setup(opts: {
  transactions: StoredTransaction[];
  rules?: StoredAutoCategorizeRule[];
  categories?: Category[];
}) {
  const ds = new InMemoryDataService();
  await ds.saveCategories(opts.categories ?? makeCategories(), FAMILY_ID);
  await ds.saveData(`transactions_${FAMILY_ID}`, opts.transactions);
  if (opts.rules) {
    await ds.saveData(`autocategorize_rules_${FAMILY_ID}`, opts.rules);
  }
  const autoCategorize = new AutoCategorizeService(ds);
  const service = new AutoCatSuggestionService(ds, autoCategorize);
  return { ds, service };
}

describe('AutoCatSuggestionService.getSuggestions', () => {
  test('empty inputs → empty suggestions', async () => {
    const { service } = await setup({ transactions: [] });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toEqual([]);
    expect(result.totalSuggestions).toBe(0);
    expect(result.truncated).toBe(false);
  });

  test('3 categorized + 1 pending uncategorized → 1 suggestion at 100%', async () => {
    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'b', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'c', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'd', merchantName: 'Lola Pizza', categoryId: null }),
    ];
    const { service } = await setup({ transactions: txns });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].normalizedKey).toBe('lola pizza');
    expect(result.suggestions[0].displayLabel).toBe('Lola Pizza');
    expect(result.suggestions[0].topCategoryId).toBe(RESTAURANTS);
    expect(result.suggestions[0].topCategoryName).toBe('Restaurants');
    expect(result.suggestions[0].agreementPct).toBe(100);
    expect(result.suggestions[0].clusterSize).toBe(3);
    expect(result.suggestions[0].topCategoryCount).toBe(3);
    expect(result.suggestions[0].pendingMatchCount).toBe(1);
    expect(result.suggestions[0].pendingTxnIds).toEqual(['d']);
    expect(result.suggestions[0].sampleCategorizedTxnIds).toEqual(['a', 'b', 'c']);
  });

  test('66% agreement (2 of 3) → no suggestion', async () => {
    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'b', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'c', merchantName: 'Lola Pizza', categoryId: COFFEE }),
      buildTx({ id: 'd', merchantName: 'Lola Pizza', categoryId: null }),
    ];
    const { service } = await setup({ transactions: txns });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toEqual([]);
  });

  test('75% agreement (3 of 4) → no suggestion (below 80%)', async () => {
    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'b', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'c', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'd', merchantName: 'Lola Pizza', categoryId: COFFEE }),
      buildTx({ id: 'e', merchantName: 'Lola Pizza', categoryId: null }),
    ];
    const { service } = await setup({ transactions: txns });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toEqual([]);
  });

  test('80% agreement (4 of 5) → suggestion qualifies', async () => {
    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'b', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'c', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'd', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'e', merchantName: 'Lola Pizza', categoryId: COFFEE }),
      buildTx({ id: 'f', merchantName: 'Lola Pizza', categoryId: null }),
    ];
    const { service } = await setup({ transactions: txns });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].agreementPct).toBe(80);
    expect(result.suggestions[0].clusterSize).toBe(5);
  });

  test('cluster of 3 categorized + 0 pending → no suggestion', async () => {
    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'b', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'c', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
    ];
    const { service } = await setup({ transactions: txns });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toEqual([]);
  });

  test('cluster covered by an existing rule → suppressed', async () => {
    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'b', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'c', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'd', merchantName: 'Lola Pizza', categoryId: null }),
    ];
    const rules: StoredAutoCategorizeRule[] = [
      {
        id: 'r1',
        userId: FAMILY_ID,
        description: 'Lola',
        patterns: ['lola'],
        matchType: 'contains',
        categoryId: RESTAURANTS,
        priority: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const { service } = await setup({ transactions: txns, rules });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toEqual([]);
  });

  test('inactive existing rule does NOT suppress the cluster', async () => {
    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'b', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'c', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'd', merchantName: 'Lola Pizza', categoryId: null }),
    ];
    const rules: StoredAutoCategorizeRule[] = [
      {
        id: 'r1',
        userId: FAMILY_ID,
        description: 'Lola',
        patterns: ['lola'],
        matchType: 'contains',
        categoryId: RESTAURANTS,
        priority: 1,
        isActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const { service } = await setup({ transactions: txns, rules });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toHaveLength(1);
  });

  test('transfer cluster surfaces as a suggestion', async () => {
    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', merchantName: 'Chase to BoA', categoryId: TRANSFER_OUT }),
      buildTx({ id: 'b', merchantName: 'Chase to BoA', categoryId: TRANSFER_OUT }),
      buildTx({ id: 'c', merchantName: 'Chase to BoA', categoryId: TRANSFER_OUT }),
      buildTx({ id: 'd', merchantName: 'Chase to BoA', categoryId: null }),
    ];
    const { service } = await setup({ transactions: txns });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].topCategoryId).toBe(TRANSFER_OUT);
  });

  test('pending transactions are excluded from both sides', async () => {
    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', merchantName: 'Lola Pizza', categoryId: RESTAURANTS, pending: true }),
      buildTx({ id: 'b', merchantName: 'Lola Pizza', categoryId: RESTAURANTS, pending: true }),
      buildTx({ id: 'c', merchantName: 'Lola Pizza', categoryId: RESTAURANTS, pending: true }),
      buildTx({ id: 'd', merchantName: 'Lola Pizza', categoryId: null, pending: true }),
    ];
    const { service } = await setup({ transactions: txns });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toEqual([]);
  });

  test('removed transactions are excluded from both sides', async () => {
    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', merchantName: 'Lola Pizza', categoryId: RESTAURANTS, status: 'removed' }),
      buildTx({ id: 'b', merchantName: 'Lola Pizza', categoryId: RESTAURANTS, status: 'removed' }),
      buildTx({ id: 'c', merchantName: 'Lola Pizza', categoryId: RESTAURANTS, status: 'removed' }),
      buildTx({ id: 'd', merchantName: 'Lola Pizza', categoryId: null, status: 'removed' }),
    ];
    const { service } = await setup({ transactions: txns });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toEqual([]);
  });

  test('categorized transactions older than 180 days are excluded; old uncategorized still count', async () => {
    const txns: StoredTransaction[] = [
      // 200 days old categorized — should be excluded from cluster
      buildTx({ id: 'old1', merchantName: 'Lola Pizza', categoryId: RESTAURANTS, date: dateNDaysAgo(200) }),
      buildTx({ id: 'old2', merchantName: 'Lola Pizza', categoryId: RESTAURANTS, date: dateNDaysAgo(200) }),
      // Recent: 2 categorized — not enough alone
      buildTx({ id: 'r1', merchantName: 'Lola Pizza', categoryId: RESTAURANTS, date: dateNDaysAgo(10) }),
      buildTx({ id: 'r2', merchantName: 'Lola Pizza', categoryId: RESTAURANTS, date: dateNDaysAgo(10) }),
      // Old uncategorized — should still count
      buildTx({ id: 'u1', merchantName: 'Lola Pizza', categoryId: null, date: dateNDaysAgo(400) }),
    ];
    const { service } = await setup({ transactions: txns });
    const result = await service.getSuggestions(FAMILY_ID);
    // Only 2 recent categorized — below MIN_CLUSTER_SIZE of 3
    expect(result.suggestions).toEqual([]);

    // Now bump to 3 recent categorized
    const txns2 = [
      ...txns,
      buildTx({ id: 'r3', merchantName: 'Lola Pizza', categoryId: RESTAURANTS, date: dateNDaysAgo(5) }),
    ];
    const { service: svc2 } = await setup({ transactions: txns2 });
    const result2 = await svc2.getSuggestions(FAMILY_ID);
    expect(result2.suggestions).toHaveLength(1);
    expect(result2.suggestions[0].clusterSize).toBe(3);
    // Old uncategorized still on the pending side
    expect(result2.suggestions[0].pendingMatchCount).toBe(1);
    expect(result2.suggestions[0].pendingTxnIds).toEqual(['u1']);
  });

  test('sort order: 5-pending cluster sorts above 2-pending cluster', async () => {
    const big: StoredTransaction[] = [
      buildTx({ id: 'big1', merchantName: 'Big Merchant', categoryId: RESTAURANTS }),
      buildTx({ id: 'big2', merchantName: 'Big Merchant', categoryId: RESTAURANTS }),
      buildTx({ id: 'big3', merchantName: 'Big Merchant', categoryId: RESTAURANTS }),
      buildTx({ id: 'p1', merchantName: 'Big Merchant', categoryId: null }),
      buildTx({ id: 'p2', merchantName: 'Big Merchant', categoryId: null }),
      buildTx({ id: 'p3', merchantName: 'Big Merchant', categoryId: null }),
      buildTx({ id: 'p4', merchantName: 'Big Merchant', categoryId: null }),
      buildTx({ id: 'p5', merchantName: 'Big Merchant', categoryId: null }),
    ];
    const small: StoredTransaction[] = [
      buildTx({ id: 's1', merchantName: 'Small Merchant', categoryId: COFFEE }),
      buildTx({ id: 's2', merchantName: 'Small Merchant', categoryId: COFFEE }),
      buildTx({ id: 's3', merchantName: 'Small Merchant', categoryId: COFFEE }),
      buildTx({ id: 'sp1', merchantName: 'Small Merchant', categoryId: null }),
      buildTx({ id: 'sp2', merchantName: 'Small Merchant', categoryId: null }),
    ];
    const { service } = await setup({ transactions: [...small, ...big] });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].normalizedKey).toBe('big merchant');
    expect(result.suggestions[1].normalizedKey).toBe('small merchant');
  });

  test('truncation: 12 valid clusters → top 10 returned, truncated=true, totalSuggestions=12', async () => {
    const txns: StoredTransaction[] = [];
    // Build 12 distinct clusters, each with 3 categorized + (12 - i) pending so
    // they sort deterministically by pendingMatchCount desc.
    for (let i = 0; i < 12; i++) {
      const merchant = `Merchant ${String.fromCharCode(65 + i)}`;
      txns.push(
        buildTx({ id: `c${i}-1`, merchantName: merchant, categoryId: RESTAURANTS }),
        buildTx({ id: `c${i}-2`, merchantName: merchant, categoryId: RESTAURANTS }),
        buildTx({ id: `c${i}-3`, merchantName: merchant, categoryId: RESTAURANTS }),
      );
      const pendingCount = 12 - i;
      for (let j = 0; j < pendingCount; j++) {
        txns.push(
          buildTx({ id: `p${i}-${j}`, merchantName: merchant, categoryId: null }),
        );
      }
    }
    const { service } = await setup({ transactions: txns });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toHaveLength(10);
    expect(result.totalSuggestions).toBe(12);
    expect(result.truncated).toBe(true);
    expect(result.suggestions[0].pendingMatchCount).toBe(12);
    expect(result.suggestions[9].pendingMatchCount).toBe(3);
  });

  test('orphan categoryId (no matching category) is treated as uncategorized', async () => {
    // 3 categorized (real) + 1 with an orphaned/deleted categoryId
    const txns: StoredTransaction[] = [
      buildTx({ id: 'a', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'b', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'c', merchantName: 'Lola Pizza', categoryId: RESTAURANTS }),
      buildTx({ id: 'orphan', merchantName: 'Lola Pizza', categoryId: 'CUSTOM_DELETED_CAT' }),
    ];
    const { service } = await setup({ transactions: txns });
    const result = await service.getSuggestions(FAMILY_ID);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].pendingTxnIds).toEqual(['orphan']);
  });
});
