/**
 * Pins the rule-matcher field-search semantics:
 *   - test patterns against userDescription, merchantName, and name
 *   - any field containing any pattern wins (short-circuit on first hit)
 * Regression target: Plaid normalizes merchantName aggressively (e.g.,
 * "Rocket Money" covers both Rocket Money Premium and Rocket Savings deposits),
 * so a rule keyed off the raw bank string in `name` must still match.
 */

import { InMemoryDataService } from '../../services/dataService';
import { AutoCategorizeService, StoredAutoCategorizeRule } from '../../services/autoCategorizeService';
import type { StoredTransaction } from '../../services/transactionService';

const FAMILY_ID = 'fam-1';
const CAT_ID = 'CUSTOM_SUBSCRIPTIONS';

function buildTx(overrides: Partial<StoredTransaction>): StoredTransaction {
  return {
    id: overrides.id ?? 'tx-1',
    userId: FAMILY_ID,
    accountId: 'acc-1',
    plaidAccountId: 'pacc-1',
    plaidTransactionId: 'ptx-1',
    amount: 10,
    date: '2026-05-01',
    name: 'raw name',
    merchantName: null,
    userDescription: null,
    categoryId: null,
    category: null,
    pending: false,
    status: 'posted',
    isoCurrencyCode: 'USD',
    location: null,
    paymentChannel: 'online',
    transactionType: 'special',
    tags: [],
    notes: null,
    isHidden: false,
    isFlagged: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as StoredTransaction;
}

async function seedRule(svc: AutoCategorizeService, ds: InMemoryDataService, patterns: string[]) {
  const rule: StoredAutoCategorizeRule = {
    id: 'rule-1',
    userId: FAMILY_ID,
    description: 'Test rule',
    patterns,
    matchType: 'contains',
    categoryId: CAT_ID,
    categoryName: 'Subscriptions',
    userDescription: '',
    priority: 1,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await ds.saveData(`autocategorize_rules_${FAMILY_ID}`, [rule]);
  void svc; // svc just needs the data; we call applyRules below
}

describe('AutoCategorizeService matcher — field search semantics', () => {
  let ds: InMemoryDataService;
  let svc: AutoCategorizeService;

  beforeEach(() => {
    ds = new InMemoryDataService();
    svc = new AutoCategorizeService(ds);
  });

  test('Rocket Money case: pattern in name matches even when merchantName is the Plaid-normalized "Rocket Money"', async () => {
    await seedRule(svc, ds, ['Rocket Savings DES']);
    const tx = buildTx({
      name: 'Rocket Savings DES:Deposit ID:XXXXX573843 INDN:Jared Carrano CO ID:XXXXX0522',
      merchantName: 'Rocket Money',
      userDescription: null,
    });

    const result = await svc.applyRules(FAMILY_ID, [tx]);

    expect(result.categorized).toBe(1);
    expect(tx.categoryId).toBe(CAT_ID);
  });

  test('matches against merchantName when name does not contain pattern', async () => {
    await seedRule(svc, ds, ['Starbucks']);
    const tx = buildTx({
      name: 'POS DEBIT 12345',
      merchantName: 'Starbucks',
      userDescription: null,
    });

    const result = await svc.applyRules(FAMILY_ID, [tx]);

    expect(result.categorized).toBe(1);
    expect(tx.categoryId).toBe(CAT_ID);
  });

  test('matches against userDescription when set', async () => {
    await seedRule(svc, ds, ['my custom label']);
    const tx = buildTx({
      name: 'random raw',
      merchantName: 'Random Merchant',
      userDescription: 'My Custom Label rename',
    });

    const result = await svc.applyRules(FAMILY_ID, [tx]);

    expect(result.categorized).toBe(1);
    expect(tx.categoryId).toBe(CAT_ID);
  });

  test('falls through to merchantName when userDescription is set but does not match', async () => {
    await seedRule(svc, ds, ['Starbucks']);
    const tx = buildTx({
      name: 'POS DEBIT 12345',
      merchantName: 'Starbucks',
      userDescription: 'Coffee with Sam',
    });

    const result = await svc.applyRules(FAMILY_ID, [tx]);

    // userDescription "coffee with sam" does NOT contain "starbucks"
    // → fall through to merchantName "Starbucks" → match
    expect(result.categorized).toBe(1);
    expect(tx.categoryId).toBe(CAT_ID);
  });

  test('no match when none of the three fields contain the pattern', async () => {
    await seedRule(svc, ds, ['Walmart']);
    const tx = buildTx({
      name: 'Target Store',
      merchantName: 'Target',
      userDescription: 'Weekly run',
    });

    const result = await svc.applyRules(FAMILY_ID, [tx]);

    expect(result.categorized).toBe(0);
    expect(tx.categoryId).toBeNull();
  });

  test('matching is case-insensitive across all three fields', async () => {
    await seedRule(svc, ds, ['ROCKET SAVINGS']);
    const tx = buildTx({
      name: 'rocket savings des:deposit',
      merchantName: 'Rocket Money',
      userDescription: null,
    });

    const result = await svc.applyRules(FAMILY_ID, [tx]);

    expect(result.categorized).toBe(1);
    expect(tx.categoryId).toBe(CAT_ID);
  });
});
