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

/**
 * Rollover sign correctness across category types.
 *
 * Regression for the income rollover sign bug: the Rollover accumulator
 * resolved its section from the category's own optional `isIncome` field, while
 * the Available column resolved it hierarchically from the subtree root. Stored
 * income categories omit `isIncome` entirely (real example:
 * `CUSTOM_JOJ_CONSULTANT_FEE` carries only `parentId: 'INCOME'`), so income rows
 * fell through to 'spending' and carried `budgeted − actual` forward. That is
 * the expense convention; for income it inverts, and because the accumulator
 * runs every month the error compounds rather than staying a fixed offset.
 *
 * These fixtures deliberately do NOT set `isIncome` — setting it would mask the
 * defect, since the buggy path reads exactly that field.
 */
describe('composeBva — rollover sign by section', () => {
  // No isIncome / isSavings keys: mirrors what is actually persisted.
  function bareCat(id: string, parentId: string | null, isRollover = false): Category {
    return { id, name: id, parentId, isCustom: false, isHidden: false, isRollover } as Category;
  }

  const categories: Category[] = [
    bareCat('INCOME', null),
    bareCat('CUSTOM_CONSULTING_FEE', 'INCOME', true),
    bareCat('FOOD_AND_DRINK', null),
    bareCat('CUSTOM_GROCERIES', 'FOOD_AND_DRINK', true),
  ];

  // Identical plan/outcome for both: budget 1000/mo, "1000 planned, 600 realised".
  const yearlyBudgets: MonthlyBudget[] = ['2026-01', '2026-02', '2026-03', '2026-04'].flatMap(
    (month, i) => [
      { id: `i${i}`, categoryId: 'CUSTOM_CONSULTING_FEE', month, amount: 1000 },
      { id: `e${i}`, categoryId: 'CUSTOM_GROCERIES', month, amount: 1000 },
    ],
  );

  // Plaid stores income as negative; composeBva flips it so income reads +600.
  const yearlyTransactions: Transaction[] = ['2026-01', '2026-02', '2026-03', '2026-04'].flatMap(
    month => [
      tx(`${month}-10`, 'CUSTOM_CONSULTING_FEE', -600),
      tx(`${month}-10`, 'CUSTOM_GROCERIES', 600),
    ],
  );

  function rowsFor(month: string) {
    const out = composeBva({
      categories,
      yearlyBudgets,
      yearlyTransactions,
      selectedMonth: month,
      useRollover: false,
    });
    const income = out.parents
      .find(p => p.parentId === 'INCOME')!
      .children.find(ch => ch.categoryId === 'CUSTOM_CONSULTING_FEE')!;
    const expense = out.parents
      .find(p => p.parentId === 'FOOD_AND_DRINK')!
      .children.find(ch => ch.categoryId === 'CUSTOM_GROCERIES')!;
    return { income, expense };
  }

  test('both types read the same underlying figures', () => {
    const { income, expense } = rowsFor('2026-03');
    expect(income.actual).toBe(600);
    expect(income.budgeted).toBe(1000);
    expect(expense.actual).toBe(600);
    expect(expense.budgeted).toBe(1000);
  });

  test('Available flips by section and is unchanged by this fix', () => {
    const { income, expense } = rowsFor('2026-03');
    expect(income.available).toBe(-400); // earned 600 against a 1000 target
    expect(expense.available).toBe(400); // spent 600 of a 1000 allowance
  });

  test('January resets to zero for both types (calendar-year reset)', () => {
    const { income, expense } = rowsFor('2026-01');
    expect(income.rollover).toBe(0);
    expect(expense.rollover).toBe(0);
  });

  test('running totals move in OPPOSITE directions for identical figures', () => {
    // One prior month in Feb, two in Mar, three in Apr.
    expect(rowsFor('2026-02').expense.rollover).toBe(400);
    expect(rowsFor('2026-03').expense.rollover).toBe(800);
    expect(rowsFor('2026-04').expense.rollover).toBe(1200);

    expect(rowsFor('2026-02').income.rollover).toBe(-400);
    expect(rowsFor('2026-03').income.rollover).toBe(-800);
    expect(rowsFor('2026-04').income.rollover).toBe(-1200);
  });

  test('rollover is the running sum of prior availables — the stated contract', () => {
    // Rollover(n) === Rollover(n-1) + Available(n-1), for BOTH sections.
    for (const [prev, next] of [['2026-01', '2026-02'], ['2026-02', '2026-03'], ['2026-03', '2026-04']]) {
      const a = rowsFor(prev);
      const b = rowsFor(next);
      expect(b.income.rollover).toBe(a.income.rollover! + a.income.available);
      expect(b.expense.rollover).toBe(a.expense.rollover! + a.expense.available);
    }
  });

  test('the error compounds: income rollover must not track the expense sign', () => {
    // Under the bug income mirrored expense exactly (+400/+800/+1200), and the
    // gap from truth doubled each month rather than holding constant.
    const months = ['2026-02', '2026-03', '2026-04'];
    for (const m of months) {
      const { income, expense } = rowsFor(m);
      expect(income.rollover).toBe(-expense.rollover!);
      expect(income.rollover).not.toBe(expense.rollover);
    }
  });

  test('income classification survives an absent isIncome field', () => {
    // The root cause: `c.isIncome` is undefined on stored income categories, so
    // reading it directly yields 'spending'. Resolution must use the subtree root.
    const cats: Category[] = [bareCat('INCOME', null), bareCat('CUSTOM_SIDE_GIG', 'INCOME', true)];
    expect((cats[1] as Partial<Category>).isIncome).toBeUndefined();
    const out = composeBva({
      categories: cats,
      yearlyBudgets: [
        { id: 'b1', categoryId: 'CUSTOM_SIDE_GIG', month: '2026-01', amount: 500 },
        { id: 'b2', categoryId: 'CUSTOM_SIDE_GIG', month: '2026-02', amount: 500 },
      ],
      yearlyTransactions: [tx('2026-01-05', 'CUSTOM_SIDE_GIG', -200)],
      selectedMonth: '2026-02',
      useRollover: false,
    });
    const row = out.parents
      .find(p => p.parentId === 'INCOME')!
      .children.find(ch => ch.categoryId === 'CUSTOM_SIDE_GIG')!;
    expect(row.rollover).toBe(-300); // earned 200 of 500 → carried shortfall
  });

  test('income rollover row seeded with no current-month activity keeps income sign', () => {
    // Exercises ensureTreeForCategory, which built its tree from
    // `parentCat.isIncome ?? false` and so marked income subtrees as spending.
    const cats: Category[] = [bareCat('INCOME', null), bareCat('CUSTOM_BONUS', 'INCOME', true)];
    const out = composeBva({
      categories: cats,
      yearlyBudgets: [{ id: 'b1', categoryId: 'CUSTOM_BONUS', month: '2026-01', amount: 900 }],
      yearlyTransactions: [tx('2026-01-05', 'CUSTOM_BONUS', -100)],
      selectedMonth: '2026-03', // no budget, no transactions this month
      useRollover: false,
    });
    const parent = out.parents.find(p => p.parentId === 'INCOME')!;
    const row = parent.children.find(ch => ch.categoryId === 'CUSTOM_BONUS')!;
    expect(row.rollover).toBe(-800); // earned 100 of 900
    expect(row.available).toBe(0); // no activity, toggle off
  });

  test('toggling rollover into Available preserves section sign', () => {
    const on = composeBva({
      categories,
      yearlyBudgets,
      yearlyTransactions,
      selectedMonth: '2026-03',
      useRollover: true,
    });
    const income = on.parents
      .find(p => p.parentId === 'INCOME')!
      .children.find(ch => ch.categoryId === 'CUSTOM_CONSULTING_FEE')!;
    const expense = on.parents
      .find(p => p.parentId === 'FOOD_AND_DRINK')!
      .children.find(ch => ch.categoryId === 'CUSTOM_GROCERIES')!;
    expect(income.available).toBe(-1200); // -400 current + -800 carried
    expect(expense.available).toBe(1200); // 400 current + 800 carried
  });
});
