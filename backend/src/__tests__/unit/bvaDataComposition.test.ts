import { composeBva } from '../../shared/utils/bvaDataComposition';
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

describe('composeBva — BRD Revision 2 rich row shape', () => {
  const categories: Category[] = [
    cat('FOOD_AND_DRINK', null, { isRollover: true }),
    cat('CUSTOM_GROCERIES', 'FOOD_AND_DRINK'),
    cat('CUSTOM_RESTAURANTS', 'FOOD_AND_DRINK'),
    cat('TRANSFER_IN', null),
  ];

  test('Budgeted is always raw monthly — does not change with toggle', () => {
    const yearlyBudgets: MonthlyBudget[] = [
      { id: 'b1', categoryId: 'FOOD_AND_DRINK', month: '2026-01', amount: 800 },
      { id: 'b2', categoryId: 'FOOD_AND_DRINK', month: '2026-02', amount: 800 },
      { id: 'b3', categoryId: 'FOOD_AND_DRINK', month: '2026-03', amount: 800 },
      { id: 'b4', categoryId: 'FOOD_AND_DRINK', month: '2026-04', amount: 800 },
    ];
    const yearlyTransactions: Transaction[] = [
      tx('2026-01-10', 'FOOD_AND_DRINK', 500),
      tx('2026-02-12', 'FOOD_AND_DRINK', 600),
    ];
    const off = composeBva({ categories, yearlyBudgets, yearlyTransactions, selectedMonth: '2026-04', useRollover: false });
    const on = composeBva({ categories, yearlyBudgets, yearlyTransactions, selectedMonth: '2026-04', useRollover: true });

    const foodOff = off.parents.find(p => p.parentId === 'FOOD_AND_DRINK')!;
    const foodOn = on.parents.find(p => p.parentId === 'FOOD_AND_DRINK')!;

    expect(foodOff.budgeted).toBe(800);
    expect(foodOn.budgeted).toBe(800);
  });

  test('Rollover column is tone-signed per section (spending: passthrough)', () => {
    const yearlyBudgets: MonthlyBudget[] = [
      { id: 'b1', categoryId: 'FOOD_AND_DRINK', month: '2026-01', amount: 800 },
      { id: 'b2', categoryId: 'FOOD_AND_DRINK', month: '2026-02', amount: 800 },
      { id: 'b3', categoryId: 'FOOD_AND_DRINK', month: '2026-04', amount: 800 },
    ];
    const yearlyTransactions: Transaction[] = [
      tx('2026-01-10', 'FOOD_AND_DRINK', 500), // +300 favorable
      tx('2026-02-12', 'FOOD_AND_DRINK', 600), // +200 favorable
    ];
    const out = composeBva({ categories, yearlyBudgets, yearlyTransactions, selectedMonth: '2026-04', useRollover: true });
    const food = out.parents.find(p => p.parentId === 'FOOD_AND_DRINK')!;
    // raw = (800−500) + (800−600) + (0−0 for March) = 500. spending passthrough.
    expect(food.rollover).toBe(500);
  });

  test('Rollover column is null for non-rollover categories', () => {
    const yearlyBudgets: MonthlyBudget[] = [
      { id: 'b', categoryId: 'CUSTOM_GROCERIES', month: '2026-04', amount: 300 },
    ];
    const yearlyTransactions: Transaction[] = [];
    const cats: Category[] = [
      cat('FOOD_AND_DRINK', null),           // NOT rollover
      cat('CUSTOM_GROCERIES', 'FOOD_AND_DRINK'), // NOT rollover
    ];
    const out = composeBva({ categories: cats, yearlyBudgets, yearlyTransactions, selectedMonth: '2026-04', useRollover: true });
    const food = out.parents.find(p => p.parentId === 'FOOD_AND_DRINK')!;
    expect(food.rollover).toBeNull();
    expect(food.children[0].rollover).toBeNull();
  });

  test('Available with toggle off equals toneSignedDelta only (rollover ignored)', () => {
    const yearlyBudgets: MonthlyBudget[] = [
      { id: 'b1', categoryId: 'FOOD_AND_DRINK', month: '2026-01', amount: 800 },
      { id: 'b2', categoryId: 'FOOD_AND_DRINK', month: '2026-04', amount: 800 },
    ];
    const yearlyTransactions: Transaction[] = [
      tx('2026-01-10', 'FOOD_AND_DRINK', 500),  // carry +300
      tx('2026-04-08', 'FOOD_AND_DRINK', 700),  // current-month spending
    ];
    const out = composeBva({ categories, yearlyBudgets, yearlyTransactions, selectedMonth: '2026-04', useRollover: false });
    const food = out.parents.find(p => p.parentId === 'FOOD_AND_DRINK')!;
    // spending: budget 800 − actual 700 = +100 favorable. Rollover exists but ignored.
    expect(food.available).toBe(100);
    expect(food.rollover).toBe(300); // still surfaced for display
  });

  test('Available with toggle on includes rollover', () => {
    const yearlyBudgets: MonthlyBudget[] = [
      { id: 'b1', categoryId: 'FOOD_AND_DRINK', month: '2026-01', amount: 800 },
      { id: 'b2', categoryId: 'FOOD_AND_DRINK', month: '2026-04', amount: 800 },
    ];
    const yearlyTransactions: Transaction[] = [
      tx('2026-01-10', 'FOOD_AND_DRINK', 500),
      tx('2026-04-08', 'FOOD_AND_DRINK', 700),
    ];
    const out = composeBva({ categories, yearlyBudgets, yearlyTransactions, selectedMonth: '2026-04', useRollover: true });
    const food = out.parents.find(p => p.parentId === 'FOOD_AND_DRINK')!;
    // delta = 100 favorable + rollover 300 favorable = 400.
    expect(food.available).toBe(400);
  });

  test('January target → Rollover = 0 for rollover categories, Available = delta', () => {
    const yearlyBudgets: MonthlyBudget[] = [
      { id: 'b', categoryId: 'FOOD_AND_DRINK', month: '2026-01', amount: 800 },
    ];
    const yearlyTransactions: Transaction[] = [tx('2026-01-10', 'FOOD_AND_DRINK', 500)];
    const out = composeBva({ categories, yearlyBudgets, yearlyTransactions, selectedMonth: '2026-01', useRollover: true });
    const food = out.parents.find(p => p.parentId === 'FOOD_AND_DRINK')!;
    expect(food.rollover).toBe(0);
    expect(food.available).toBe(300); // budget 800 − actual 500
  });

  test('Income section: Available is actual − budget (over-earn = positive favorable)', () => {
    const cats: Category[] = [
      cat('INCOME_WAGES', null, { isIncome: true, isRollover: true }),
    ];
    const yearlyBudgets: MonthlyBudget[] = [
      { id: 'b1', categoryId: 'INCOME_WAGES', month: '2026-01', amount: 5000 },
      { id: 'b2', categoryId: 'INCOME_WAGES', month: '2026-02', amount: 5000 },
      { id: 'b3', categoryId: 'INCOME_WAGES', month: '2026-03', amount: 5000 },
      { id: 'b4', categoryId: 'INCOME_WAGES', month: '2026-04', amount: 5000 },
    ];
    const yearlyTransactions: Transaction[] = [
      tx('2026-01-15', 'INCOME_WAGES', -5200), // earned 5200 (over by 200)
      tx('2026-02-15', 'INCOME_WAGES', -5100), // over by 100
      tx('2026-03-15', 'INCOME_WAGES', -4800), // under by 200
      tx('2026-04-15', 'INCOME_WAGES', -5500), // current month: over by 500
    ];
    const out = composeBva({ categories: cats, yearlyBudgets, yearlyTransactions, selectedMonth: '2026-04', useRollover: true });
    const income = out.parents.find(p => p.parentId === 'INCOME_WAGES')!;
    // Rollover raw = Σ(budget − actual) for Jan..Mar = (5000−5200)+(5000−5100)+(5000−4800) = −100.
    // Tone-signed for income: −(−100) = +100 favorable (over-earned on net).
    // Current delta: actual 5500 − budget 5000 = +500 favorable.
    // Available = 500 + 100 = 600.
    expect(income.rollover).toBe(100);
    expect(income.available).toBe(600);
  });

  test('Savings section: over-saved = positive favorable', () => {
    const cats: Category[] = [
      cat('CUSTOM_IRA', null, { isSavings: true, isRollover: true }),
    ];
    const yearlyBudgets: MonthlyBudget[] = [
      { id: 'b1', categoryId: 'CUSTOM_IRA', month: '2026-01', amount: 500 },
      { id: 'b2', categoryId: 'CUSTOM_IRA', month: '2026-02', amount: 500 },
      { id: 'b3', categoryId: 'CUSTOM_IRA', month: '2026-03', amount: 500 },
      { id: 'b4', categoryId: 'CUSTOM_IRA', month: '2026-04', amount: 500 },
    ];
    const yearlyTransactions: Transaction[] = [
      tx('2026-01-15', 'CUSTOM_IRA', 800),  // over-saved by 300
      tx('2026-02-15', 'CUSTOM_IRA', 500),  // on plan
      tx('2026-03-15', 'CUSTOM_IRA', 400),  // under-saved by 100
      tx('2026-04-15', 'CUSTOM_IRA', 700),  // current month: over-saved by 200
    ];
    const out = composeBva({ categories: cats, yearlyBudgets, yearlyTransactions, selectedMonth: '2026-04', useRollover: true });
    const sav = out.parents.find(p => p.parentId === 'CUSTOM_IRA')!;
    // Rollover raw = (500−800)+(500−500)+(500−400) = −200.
    // Tone-signed for savings: −(−200) = +200 favorable.
    // Current delta: 700 − 500 = +200 favorable.
    // Available = 200 + 200 = 400.
    expect(sav.rollover).toBe(200);
    expect(sav.available).toBe(400);
  });

  test('Parent row rollover sums tone-signed subtree values (child flagged, parent not)', () => {
    const cats: Category[] = [
      cat('FOOD_AND_DRINK', null),                                   // parent NOT rollover
      cat('CUSTOM_GROCERIES', 'FOOD_AND_DRINK', { isRollover: true }), // child flagged
    ];
    const yearlyBudgets: MonthlyBudget[] = [
      { id: 'b1', categoryId: 'CUSTOM_GROCERIES', month: '2026-01', amount: 400 },
      { id: 'b2', categoryId: 'CUSTOM_GROCERIES', month: '2026-02', amount: 400 },
      { id: 'b3', categoryId: 'CUSTOM_GROCERIES', month: '2026-03', amount: 400 },
      { id: 'b4', categoryId: 'CUSTOM_GROCERIES', month: '2026-04', amount: 400 },
    ];
    const yearlyTransactions: Transaction[] = [
      tx('2026-01-10', 'CUSTOM_GROCERIES', 300), // +100 favorable
      tx('2026-02-10', 'CUSTOM_GROCERIES', 350), // +50 favorable
      tx('2026-03-10', 'CUSTOM_GROCERIES', 420), // -20 unfavorable
    ];
    const out = composeBva({ categories: cats, yearlyBudgets, yearlyTransactions, selectedMonth: '2026-04', useRollover: true });
    const food = out.parents.find(p => p.parentId === 'FOOD_AND_DRINK')!;
    // Child rollover = (400-300)+(400-350)+(400-420) = 100+50-20 = 130. Spending passthrough.
    expect(food.children[0].rollover).toBe(130);
    expect(food.rollover).toBe(130); // parent sums subtree
  });

  test('Non-rollover subtree: parent rollover = null', () => {
    const cats: Category[] = [
      cat('FOOD_AND_DRINK', null),
      cat('CUSTOM_GROCERIES', 'FOOD_AND_DRINK'),
    ];
    const yearlyBudgets: MonthlyBudget[] = [
      { id: 'b', categoryId: 'CUSTOM_GROCERIES', month: '2026-04', amount: 400 },
    ];
    const out = composeBva({ categories: cats, yearlyBudgets, yearlyTransactions: [], selectedMonth: '2026-04', useRollover: true });
    const food = out.parents.find(p => p.parentId === 'FOOD_AND_DRINK')!;
    expect(food.rollover).toBeNull();
  });

  test('Hidden transactions excluded from actuals', () => {
    const yearlyTransactions: Transaction[] = [
      tx('2026-04-01', 'CUSTOM_GROCERIES', 100),
      tx('2026-04-02', 'CUSTOM_GROCERIES', 200, { isHidden: true }),
    ];
    const cats: Category[] = [
      cat('FOOD_AND_DRINK', null),
      cat('CUSTOM_GROCERIES', 'FOOD_AND_DRINK'),
    ];
    const out = composeBva({ categories: cats, yearlyBudgets: [], yearlyTransactions, selectedMonth: '2026-04', useRollover: false });
    const food = out.parents.find(p => p.parentId === 'FOOD_AND_DRINK')!;
    expect(food.children[0].actual).toBe(100);
  });

  test('Transfers excluded from trees entirely', () => {
    const yearlyTransactions: Transaction[] = [
      tx('2026-04-02', 'TRANSFER_IN', 5000),
    ];
    const out = composeBva({ categories, yearlyBudgets: [], yearlyTransactions, selectedMonth: '2026-04', useRollover: false });
    expect(out.parents.find(p => p.parentId === 'TRANSFER_IN')).toBeUndefined();
  });

  test('Multi-day aggregation within a month sums via YYYY-MM slice', () => {
    const yearlyTransactions: Transaction[] = [
      tx('2026-04-01', 'CUSTOM_GROCERIES', 100),
      tx('2026-04-15', 'CUSTOM_GROCERIES', 50),
      tx('2026-04-30', 'CUSTOM_GROCERIES', 75),
    ];
    const cats: Category[] = [
      cat('FOOD_AND_DRINK', null),
      cat('CUSTOM_GROCERIES', 'FOOD_AND_DRINK'),
    ];
    const out = composeBva({ categories: cats, yearlyBudgets: [], yearlyTransactions, selectedMonth: '2026-04', useRollover: false });
    const food = out.parents.find(p => p.parentId === 'FOOD_AND_DRINK')!;
    expect(food.children[0].actual).toBe(225);
  });
});
