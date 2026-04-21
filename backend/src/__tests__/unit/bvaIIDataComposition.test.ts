import { composeBvaII } from '../../shared/utils/bvaIIDataComposition';
import type { Category, MonthlyBudget, Transaction } from '../../shared/types';

function cat(id: string, parentId: string | null, overrides: Partial<Category> = {}): Category {
  return {
    id,
    name: id,
    parentId,
    isCustom: false,
    isHidden: false,
    isRollover: false,
    isIncome: false,
    isSavings: false,
    ...overrides,
  };
}

function tx(date: string, categoryId: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: `${date}-${categoryId}-${amount}`,
    plaidTransactionId: null,
    accountId: 'acct',
    amount,
    date,
    name: '',
    userDescription: null,
    merchantName: null,
    category: [],
    plaidCategoryId: null,
    categoryId,
    pending: false,
    tags: [],
    notes: null,
    isHidden: false,
    isFlagged: false,
    isManual: false,
    isSplit: false,
    parentTransactionId: null,
    splitTransactionIds: [],
    accountOwner: null,
    originalDescription: null,
    location: null,
    createdAt: date,
    updatedAt: date,
    ...extra,
  };
}

describe('composeBvaII — BvA II data composition', () => {
  const categories: Category[] = [
    cat('FOOD_AND_DRINK', null, { isRollover: true }),
    cat('CUSTOM_GROCERIES', 'FOOD_AND_DRINK'),
    cat('CUSTOM_RESTAURANTS', 'FOOD_AND_DRINK'),
    cat('TRANSFER_IN', null),
  ];

  const yearlyBudgets: MonthlyBudget[] = [
    { id: 'b1', categoryId: 'FOOD_AND_DRINK', month: '2026-01', amount: 800 },
    { id: 'b2', categoryId: 'FOOD_AND_DRINK', month: '2026-02', amount: 800 },
    { id: 'b3', categoryId: 'FOOD_AND_DRINK', month: '2026-03', amount: 800 },
    { id: 'b4', categoryId: 'FOOD_AND_DRINK', month: '2026-04', amount: 800 },
    { id: 'b5', categoryId: 'CUSTOM_GROCERIES', month: '2026-04', amount: 300 },
  ];

  const yearlyTransactions: Transaction[] = [
    tx('2026-01-10', 'FOOD_AND_DRINK', 500),
    tx('2026-02-12', 'FOOD_AND_DRINK', 600),
    tx('2026-03-05', 'FOOD_AND_DRINK', 700),
    tx('2026-04-08', 'CUSTOM_GROCERIES', 250),
    tx('2026-04-09', 'CUSTOM_RESTAURANTS', 150),
  ];

  test('January display: effective budget equals raw (REQ-005)', () => {
    const out = composeBvaII({
      categories,
      yearlyBudgets,
      yearlyTransactions,
      selectedMonth: '2026-01',
      useRollover: true,
    });
    const food = out.trees.get('FOOD_AND_DRINK')!;
    expect(food.directBudget).toBe(800);
    expect(food.effectiveBudget).toBe(800);
  });

  test('Mid-year with rollover ON: effective reflects YTD carry', () => {
    // Carry for FOOD_AND_DRINK through March:
    //   Jan: 800 − 500 = +300
    //   Feb: 800 − 600 = +200
    //   Mar: 800 − 700 = +100
    //   Carry into April = +600 → effective = 800 + 600 = 1400.
    const out = composeBvaII({
      categories,
      yearlyBudgets,
      yearlyTransactions,
      selectedMonth: '2026-04',
      useRollover: true,
    });
    const food = out.trees.get('FOOD_AND_DRINK')!;
    expect(out.effectiveBudgetsForMonth.get('FOOD_AND_DRINK')).toBe(1400);
    // Parent directBudget from override = 1400; childBudgetSum (Groceries) = 300.
    // Max rule: effective = max(1400, 300) = 1400.
    expect(food.directBudget).toBe(1400);
    expect(food.childBudgetSum).toBe(300);
    expect(food.effectiveBudget).toBe(1400);
  });

  test('Rollover OFF: effective equals raw for every category even if flagged isRollover', () => {
    const out = composeBvaII({
      categories,
      yearlyBudgets,
      yearlyTransactions,
      selectedMonth: '2026-04',
      useRollover: false,
    });
    const food = out.trees.get('FOOD_AND_DRINK')!;
    expect(food.directBudget).toBe(800); // raw April budget
    expect(food.effectiveBudget).toBe(800);
    expect(out.effectiveBudgetsForMonth.size).toBe(0); // effective map unused when off
  });

  test('Parent rollup uses effective values: max(parent_effective, Σ children_effective) — REQ-022', () => {
    // Flip to make children larger than parent for April carry.
    const categoriesChildRollover: Category[] = [
      cat('FOOD_AND_DRINK', null),
      cat('CUSTOM_GROCERIES', 'FOOD_AND_DRINK', { isRollover: true }),
    ];
    const budgets: MonthlyBudget[] = [
      { id: 'b1', categoryId: 'FOOD_AND_DRINK', month: '2026-04', amount: 100 },
      { id: 'b2', categoryId: 'CUSTOM_GROCERIES', month: '2026-01', amount: 500 },
      { id: 'b3', categoryId: 'CUSTOM_GROCERIES', month: '2026-02', amount: 500 },
      { id: 'b4', categoryId: 'CUSTOM_GROCERIES', month: '2026-03', amount: 500 },
      { id: 'b5', categoryId: 'CUSTOM_GROCERIES', month: '2026-04', amount: 500 },
    ];
    const txs: Transaction[] = [
      tx('2026-01-01', 'CUSTOM_GROCERIES', 0),
      tx('2026-02-01', 'CUSTOM_GROCERIES', 0),
      tx('2026-03-01', 'CUSTOM_GROCERIES', 0),
    ];
    const out = composeBvaII({
      categories: categoriesChildRollover,
      yearlyBudgets: budgets,
      yearlyTransactions: txs,
      selectedMonth: '2026-04',
      useRollover: true,
    });
    // Groceries carry = 500 * 3 - 0 = 1500 → effective = 500 + 1500 = 2000.
    // Parent raw = 100. Max(100, 2000) = 2000.
    const food = out.trees.get('FOOD_AND_DRINK')!;
    expect(out.effectiveBudgetsForMonth.get('CUSTOM_GROCERIES')).toBe(2000);
    expect(food.childBudgetSum).toBe(2000);
    expect(food.effectiveBudget).toBe(2000);
  });

  test('Hidden transactions are excluded from actuals', () => {
    const txs: Transaction[] = [
      tx('2026-04-01', 'CUSTOM_GROCERIES', 100),
      tx('2026-04-02', 'CUSTOM_GROCERIES', 200, { isHidden: true }),
    ];
    const out = composeBvaII({
      categories,
      yearlyBudgets: [],
      yearlyTransactions: txs,
      selectedMonth: '2026-04',
      useRollover: false,
    });
    expect(out.actualsForMonth.get('CUSTOM_GROCERIES')).toBe(100);
  });

  test('Transfer transactions are excluded from actuals via isBudgetableCategory', () => {
    const txs: Transaction[] = [
      tx('2026-04-01', 'CUSTOM_GROCERIES', 100),
      tx('2026-04-02', 'TRANSFER_IN', 5000),
    ];
    const out = composeBvaII({
      categories,
      yearlyBudgets: [],
      yearlyTransactions: txs,
      selectedMonth: '2026-04',
      useRollover: false,
    });
    expect(out.actualsForMonth.get('TRANSFER_IN')).toBeUndefined();
    expect(out.actualsForMonth.get('CUSTOM_GROCERIES')).toBe(100);
  });

  test('Actuals use absolute values (expenses positive, income negative both counted)', () => {
    const income = cat('INCOME_WAGES', null, { isIncome: true });
    const txs: Transaction[] = [
      tx('2026-04-01', 'INCOME_WAGES', -5000), // Plaid convention: income is negative
    ];
    const out = composeBvaII({
      categories: [...categories, income],
      yearlyBudgets: [],
      yearlyTransactions: txs,
      selectedMonth: '2026-04',
      useRollover: false,
    });
    expect(out.actualsForMonth.get('INCOME_WAGES')).toBe(5000);
  });

  test('Multi-day aggregation within a month sums by YYYY-MM slice of transaction.date', () => {
    const txs: Transaction[] = [
      tx('2026-04-01', 'CUSTOM_GROCERIES', 100),
      tx('2026-04-15', 'CUSTOM_GROCERIES', 50),
      tx('2026-04-30', 'CUSTOM_GROCERIES', 75),
    ];
    const out = composeBvaII({
      categories,
      yearlyBudgets: [],
      yearlyTransactions: txs,
      selectedMonth: '2026-04',
      useRollover: false,
    });
    expect(out.actualsForMonth.get('CUSTOM_GROCERIES')).toBe(225);
  });
});
