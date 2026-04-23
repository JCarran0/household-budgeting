/**
 * Tests for budget calculation utilities
 * Testing consolidated budget calculation functions
 */

import {
  getHiddenCategoryIds,
  getChildCategoryIds,
  getParentCategoryIds,
  calculateBudgetTotals,
  calculateActualTotals,
  calculateBudgetVsActual,
  createActualsMap,
  calculateEnhancedParentTotals,
  getBudgetableTransactions,
  shouldExcludeCategory,
  buildCategoryTreeAggregation,
  buildPeriodRollup,
  classifyTreeBudgetState,
  isTreeUnused,
  isTreeOverBudget,
  computeRolloverBalance,
  computeEffectiveBudget,
  buildEffectiveBudgetsMap,
  findRolloverSubtreeConflicts,
  type BudgetTotals
} from '../../shared/utils/budgetCalculations';
import { Category, MonthlyBudget, Transaction } from '../../shared/types';

describe('Budget Calculation Utilities', () => {
  const mockCategories: Category[] = [
    // Root categories
    { id: 'INCOME', name: 'Income', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
    { id: 'FOOD_AND_DRINK', name: 'Food and Drink', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'ENTERTAINMENT', name: 'Entertainment', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'TRANSFER_IN', name: 'Transfer In', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'TRANSFER_OUT', name: 'Transfer Out', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },

    // Income subcategories
    { id: 'INCOME_WAGES', name: 'Wages', parentId: 'INCOME', isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
    { id: 'CUSTOM_SALARY', name: 'Salary', parentId: 'INCOME', isCustom: true, isHidden: false, isRollover: false, isIncome: true, isSavings: false },

    // Expense subcategories
    { id: 'FOOD_AND_DRINK_COFFEE', name: 'Coffee', parentId: 'FOOD_AND_DRINK', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'CUSTOM_GROCERIES', name: 'Groceries', parentId: 'FOOD_AND_DRINK', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'CUSTOM_MOVIES', name: 'Movies', parentId: 'ENTERTAINMENT', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },

    // Hidden categories
    { id: 'HIDDEN_CATEGORY', name: 'Hidden Category', parentId: null, isCustom: true, isHidden: true, isRollover: false, isIncome: false, isSavings: false },
    { id: 'CHILD_OF_HIDDEN', name: 'Child of Hidden', parentId: 'HIDDEN_CATEGORY', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'VISIBLE_PARENT', name: 'Visible Parent', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    { id: 'HIDDEN_CHILD', name: 'Hidden Child', parentId: 'VISIBLE_PARENT', isCustom: true, isHidden: true, isRollover: false, isIncome: false, isSavings: false },
  ];

  const mockBudgets: MonthlyBudget[] = [
    { id: '1', categoryId: 'INCOME', month: '2025-01', amount: 5000 },
    { id: '2', categoryId: 'CUSTOM_SALARY', month: '2025-01', amount: 3000 },
    { id: '3', categoryId: 'FOOD_AND_DRINK', month: '2025-01', amount: 800 },
    { id: '4', categoryId: 'FOOD_AND_DRINK_COFFEE', month: '2025-01', amount: 200 },
    { id: '5', categoryId: 'ENTERTAINMENT', month: '2025-01', amount: 300 },
    { id: '6', categoryId: 'TRANSFER_IN', month: '2025-01', amount: 1000 },
    { id: '7', categoryId: 'HIDDEN_CATEGORY', month: '2025-01', amount: 100 },
    { id: '8', categoryId: 'CHILD_OF_HIDDEN', month: '2025-01', amount: 50 },
  ];

  const mockTransactions: Transaction[] = [
    {
      id: '1', plaidTransactionId: '1', accountId: 'acc1', amount: -4500, date: '2025-01-15',
      name: 'Salary', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'INCOME', pending: false, tags: [], notes: null, isHidden: false,
      isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      accountOwner: null, originalDescription: null, location: null,
      createdAt: '2025-01-15', updatedAt: '2025-01-15'
    },
    {
      id: '2', plaidTransactionId: '2', accountId: 'acc1', amount: -2800, date: '2025-01-15',
      name: 'Freelance', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'CUSTOM_SALARY', pending: false, tags: [], notes: null, isHidden: false,
      isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      accountOwner: null, originalDescription: null, location: null,
      createdAt: '2025-01-15', updatedAt: '2025-01-15'
    },
    {
      id: '3', plaidTransactionId: '3', accountId: 'acc1', amount: 750, date: '2025-01-20',
      name: 'Grocery Store', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'FOOD_AND_DRINK', pending: false, tags: [], notes: null, isHidden: false,
      isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      accountOwner: null, originalDescription: null, location: null,
      createdAt: '2025-01-20', updatedAt: '2025-01-20'
    },
    {
      id: '4', plaidTransactionId: '4', accountId: 'acc1', amount: 180, date: '2025-01-22',
      name: 'Coffee Shop', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'FOOD_AND_DRINK_COFFEE', pending: false, tags: [], notes: null, isHidden: false,
      isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      accountOwner: null, originalDescription: null, location: null,
      createdAt: '2025-01-22', updatedAt: '2025-01-22'
    },
    {
      id: '5', plaidTransactionId: '5', accountId: 'acc1', amount: 250, date: '2025-01-25',
      name: 'Movie Theater', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'ENTERTAINMENT', pending: false, tags: [], notes: null, isHidden: false,
      isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      accountOwner: null, originalDescription: null, location: null,
      createdAt: '2025-01-25', updatedAt: '2025-01-25'
    },
    {
      id: '6', plaidTransactionId: '6', accountId: 'acc1', amount: 1000, date: '2025-01-26',
      name: 'Transfer', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'TRANSFER_IN', pending: false, tags: [], notes: null, isHidden: false,
      isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      accountOwner: null, originalDescription: null, location: null,
      createdAt: '2025-01-26', updatedAt: '2025-01-26'
    },
    {
      id: '7', plaidTransactionId: '7', accountId: 'acc1', amount: 90, date: '2025-01-27',
      name: 'Hidden Transaction', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'HIDDEN_CATEGORY', pending: false, tags: [], notes: null, isHidden: false,
      isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      accountOwner: null, originalDescription: null, location: null,
      createdAt: '2025-01-27', updatedAt: '2025-01-27'
    },
    {
      id: '8', plaidTransactionId: '8', accountId: 'acc1', amount: 40, date: '2025-01-28',
      name: 'Child of Hidden', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'CHILD_OF_HIDDEN', pending: false, tags: [], notes: null, isHidden: false,
      isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      accountOwner: null, originalDescription: null, location: null,
      createdAt: '2025-01-28', updatedAt: '2025-01-28'
    },
    {
      id: '9', plaidTransactionId: '9', accountId: 'acc1', amount: 25, date: '2025-01-29',
      name: 'Hidden Transaction', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'VISIBLE_PARENT', pending: false, tags: [], notes: null, isHidden: true,
      isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      accountOwner: null, originalDescription: null, location: null,
      createdAt: '2025-01-29', updatedAt: '2025-01-29'
    }
  ];

  describe('Category Identification Functions', () => {
    describe('getHiddenCategoryIds', () => {
      test('should identify directly hidden categories', () => {
        const hiddenIds = getHiddenCategoryIds(mockCategories);

        expect(hiddenIds.has('HIDDEN_CATEGORY')).toBe(true);
        expect(hiddenIds.has('HIDDEN_CHILD')).toBe(true);
      });

      test('should identify children of hidden parents', () => {
        const hiddenIds = getHiddenCategoryIds(mockCategories);

        expect(hiddenIds.has('CHILD_OF_HIDDEN')).toBe(true);
      });

      test('should not include visible categories', () => {
        const hiddenIds = getHiddenCategoryIds(mockCategories);

        expect(hiddenIds.has('INCOME')).toBe(false);
        expect(hiddenIds.has('FOOD_AND_DRINK')).toBe(false);
        expect(hiddenIds.has('VISIBLE_PARENT')).toBe(false);
      });

      test('should handle empty categories array', () => {
        const hiddenIds = getHiddenCategoryIds([]);

        expect(hiddenIds.size).toBe(0);
      });
    });

    describe('getChildCategoryIds', () => {
      test('should identify all child categories', () => {
        const childIds = getChildCategoryIds(mockCategories);

        expect(childIds.has('INCOME_WAGES')).toBe(true);
        expect(childIds.has('CUSTOM_SALARY')).toBe(true);
        expect(childIds.has('FOOD_AND_DRINK_COFFEE')).toBe(true);
        expect(childIds.has('CUSTOM_GROCERIES')).toBe(true);
        expect(childIds.has('CUSTOM_MOVIES')).toBe(true);
        expect(childIds.has('CHILD_OF_HIDDEN')).toBe(true);
        expect(childIds.has('HIDDEN_CHILD')).toBe(true);
      });

      test('should not include parent categories', () => {
        const childIds = getChildCategoryIds(mockCategories);

        expect(childIds.has('INCOME')).toBe(false);
        expect(childIds.has('FOOD_AND_DRINK')).toBe(false);
        expect(childIds.has('ENTERTAINMENT')).toBe(false);
        expect(childIds.has('HIDDEN_CATEGORY')).toBe(false);
        expect(childIds.has('VISIBLE_PARENT')).toBe(false);
      });

      test('should handle empty categories array', () => {
        const childIds = getChildCategoryIds([]);

        expect(childIds.size).toBe(0);
      });
    });

    describe('getParentCategoryIds', () => {
      test('should identify all parent categories', () => {
        const parentIds = getParentCategoryIds(mockCategories);

        expect(parentIds.has('INCOME')).toBe(true);
        expect(parentIds.has('FOOD_AND_DRINK')).toBe(true);
        expect(parentIds.has('ENTERTAINMENT')).toBe(true);
        expect(parentIds.has('HIDDEN_CATEGORY')).toBe(true);
        expect(parentIds.has('VISIBLE_PARENT')).toBe(true);
      });

      test('should not include categories without children', () => {
        const parentIds = getParentCategoryIds(mockCategories);

        expect(parentIds.has('TRANSFER_IN')).toBe(false);
        expect(parentIds.has('TRANSFER_OUT')).toBe(false);
        expect(parentIds.has('INCOME_WAGES')).toBe(false);
        expect(parentIds.has('CUSTOM_SALARY')).toBe(false);
      });
    });
  });

  describe('Budget Calculation Functions', () => {
    describe('calculateBudgetTotals', () => {
      test('should calculate totals without filters', () => {
        const totals = calculateBudgetTotals(mockBudgets, mockCategories);

        expect(totals.income).toBe(8000); // INCOME (5000) + CUSTOM_SALARY (3000)
        expect(totals.expense).toBe(1450); // FOOD_AND_DRINK (800) + COFFEE (200) + ENTERTAINMENT (300) + HIDDEN_CATEGORY (100) + CHILD_OF_HIDDEN (50)
        expect(totals.transfer).toBe(0); // excludeTransfers = true by default
        expect(totals.total).toBe(9450);
      });

      test('should exclude hidden categories when requested', () => {
        const totals = calculateBudgetTotals(mockBudgets, mockCategories, { excludeHidden: true });

        expect(totals.income).toBe(8000); // Same as above
        expect(totals.expense).toBe(1300); // FOOD_AND_DRINK (800) + COFFEE (200) + ENTERTAINMENT (300) - excludes hidden categories (100+50)
        expect(totals.total).toBe(9300);
      });

      test('should exclude child categories when requested', () => {
        const totals = calculateBudgetTotals(mockBudgets, mockCategories, { excludeChildren: true });

        expect(totals.income).toBe(5000); // Only INCOME (excludes CUSTOM_SALARY child)
        expect(totals.expense).toBe(1200); // FOOD_AND_DRINK (800) + ENTERTAINMENT (300) + HIDDEN_CATEGORY (100), excludes COFFEE (200) and CHILD_OF_HIDDEN (50)
        expect(totals.total).toBe(6200);
      });

      test('should include transfers when requested', () => {
        const totals = calculateBudgetTotals(mockBudgets, mockCategories, { excludeTransfers: false });

        expect(totals.income).toBe(8000);
        expect(totals.expense).toBe(1450); // Same as first test - includes hidden categories
        expect(totals.transfer).toBe(1000); // TRANSFER_IN
        expect(totals.total).toBe(10450);
      });

      test('should handle empty budgets array', () => {
        const totals = calculateBudgetTotals([], mockCategories);

        expect(totals.income).toBe(0);
        expect(totals.expense).toBe(0);
        expect(totals.transfer).toBe(0);
        expect(totals.total).toBe(0);
      });
    });

    describe('calculateActualTotals', () => {
      test('should calculate totals from transactions without filters', () => {
        const totals = calculateActualTotals(mockTransactions, mockCategories);

        expect(totals.income).toBe(7300); // |−4500| + |−2800| = 7300
        expect(totals.expense).toBe(1310); // 750 + 180 + 250 + 90 + 40 = 1310 (includes hidden categories)
        expect(totals.transfer).toBe(0); // excludeTransfers = true by default
        expect(totals.total).toBe(8610);
      });

      test('should exclude hidden transactions', () => {
        const totals = calculateActualTotals(mockTransactions, mockCategories, { excludeHidden: true });

        expect(totals.income).toBe(7300); // Income transactions are not in hidden categories
        expect(totals.expense).toBe(1180); // 750 + 180 + 250 = 1180 (excludes hidden categories: 90 + 40)
        expect(totals.total).toBe(8480);
      });

      test('should exclude hidden categories when requested', () => {
        const totals = calculateActualTotals(mockTransactions, mockCategories, { excludeHidden: true });

        // Should exclude HIDDEN_CATEGORY (90) and CHILD_OF_HIDDEN (40)
        expect(totals.expense).toBe(1180); // Same as above since these aren't in the expense calc
      });

      test('should include transfers when requested', () => {
        const totals = calculateActualTotals(mockTransactions, mockCategories, { excludeTransfers: false });

        expect(totals.income).toBe(7300);
        expect(totals.expense).toBe(1310); // Same as first test - includes hidden categories
        expect(totals.transfer).toBe(1000); // TRANSFER_IN transaction
        expect(totals.total).toBe(9610);
      });

      test('should exclude transactions without categoryId', () => {
        const transactionsWithNull = [
          ...mockTransactions,
          {
            id: '10', plaidTransactionId: '10', accountId: 'acc1', amount: 500, date: '2025-01-30',
            name: 'Uncategorized', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
            categoryId: null, pending: false, tags: [], notes: null, isHidden: false,
            isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
            accountOwner: null, originalDescription: null, location: null,
            createdAt: '2025-01-30', updatedAt: '2025-01-30'
          }
        ];

        const totals = calculateActualTotals(transactionsWithNull, mockCategories);

        // Should be same as before since uncategorized transaction is excluded
        expect(totals.total).toBe(8610);
      });
    });

    describe('calculateBudgetVsActual', () => {
      test('should calculate comparison metrics correctly', () => {
        const budgetTotals: BudgetTotals = { income: 8000, expense: 1500, transfer: 1000, total: 10500 };
        const actualTotals: BudgetTotals = { income: 7500, expense: 1200, transfer: 800, total: 9500 };

        const comparison = calculateBudgetVsActual(budgetTotals, actualTotals);

        // Income comparison
        expect(comparison.income.budgeted).toBe(8000);
        expect(comparison.income.actual).toBe(7500);
        expect(comparison.income.remaining).toBe(-500); // Under income target
        expect(comparison.income.percentUsed).toBe(94);
        expect(comparison.income.isOverBudget).toBe(true); // Under target is "over budget" for income

        // Expense comparison
        expect(comparison.expense.budgeted).toBe(1500);
        expect(comparison.expense.actual).toBe(1200);
        expect(comparison.expense.remaining).toBe(300); // Under expense budget
        expect(comparison.expense.percentUsed).toBe(80);
        expect(comparison.expense.isOverBudget).toBe(false);

        // Transfer comparison
        expect(comparison.transfer.budgeted).toBe(1000);
        expect(comparison.transfer.actual).toBe(800);
        expect(comparison.transfer.remaining).toBe(200);
        expect(comparison.transfer.percentUsed).toBe(80);
        expect(comparison.transfer.isOverBudget).toBe(false);

        // Total comparison
        expect(comparison.total.budgeted).toBe(10500);
        expect(comparison.total.actual).toBe(9500);
        expect(comparison.total.remaining).toBe(1000);
        expect(comparison.total.percentUsed).toBe(90);
        expect(comparison.total.isOverBudget).toBe(false);
      });

      test('should handle zero budget amounts', () => {
        const budgetTotals: BudgetTotals = { income: 0, expense: 0, transfer: 0, total: 0 };
        const actualTotals: BudgetTotals = { income: 1000, expense: 500, transfer: 0, total: 1500 };

        const comparison = calculateBudgetVsActual(budgetTotals, actualTotals);

        expect(comparison.income.percentUsed).toBe(0);
        expect(comparison.expense.percentUsed).toBe(0);
        expect(comparison.total.percentUsed).toBe(0);
      });
    });
  });

  describe('Utility Functions', () => {
    describe('createActualsMap', () => {
      test('should create category-to-amount mapping', () => {
        const actualsMap = createActualsMap(mockTransactions, mockCategories);

        expect(actualsMap['INCOME']).toBe(4500);
        expect(actualsMap['CUSTOM_SALARY']).toBe(2800);
        expect(actualsMap['FOOD_AND_DRINK']).toBe(750);
        expect(actualsMap['FOOD_AND_DRINK_COFFEE']).toBe(180);
        expect(actualsMap['ENTERTAINMENT']).toBe(250);
        expect(actualsMap['TRANSFER_IN']).toBeUndefined(); // Excluded by default
      });

      test('should exclude hidden transactions', () => {
        const actualsMap = createActualsMap(mockTransactions, mockCategories);

        // Transaction #9 is isHidden: true, so VISIBLE_PARENT should not appear
        expect(actualsMap['VISIBLE_PARENT']).toBeUndefined();
      });

      test('should exclude hidden categories when requested', () => {
        const actualsMap = createActualsMap(mockTransactions, mockCategories, { excludeHidden: true });

        // Should exclude HIDDEN_CATEGORY and CHILD_OF_HIDDEN
        expect(actualsMap['HIDDEN_CATEGORY']).toBeUndefined();
        expect(actualsMap['CHILD_OF_HIDDEN']).toBeUndefined();
      });

      test('should include transfers when requested', () => {
        const actualsMap = createActualsMap(mockTransactions, mockCategories, { excludeTransfers: false });

        expect(actualsMap['TRANSFER_IN']).toBe(1000);
      });
    });

    describe('calculateEnhancedParentTotals', () => {
      test('REQ-002: budgeted = max(direct parent, sum children) — both levels present', () => {
        const children = [
          { categoryId: 'FOOD_AND_DRINK_COFFEE', budgeted: 200, actual: 180, isIncomeCategory: false },
          { categoryId: 'CUSTOM_GROCERIES', budgeted: 300, actual: 400, isIncomeCategory: false }
        ];
        const existingParent = { budgeted: 800, actual: 750, isIncomeCategory: false };

        const result = calculateEnhancedParentTotals('FOOD_AND_DRINK', children, existingParent, mockCategories);

        expect(result.budgeted).toBe(800); // max(500 children, 800 parent), NOT 1300
        expect(result.actual).toBe(1330); // 580 (children) + 750 (parent) — REQ-004 still additive
        expect(result.remaining).toBe(-530); // 800 - 1330 (over budget)
        expect(result.percentUsed).toBe(166);
        expect(result.isOverBudget).toBe(true);
        expect(result.isCalculated).toBe(true);
        expect(result.originalBudget).toBe(800);
        expect(result.originalActual).toBe(750);
      });

      test('REQ-002: child-only budget — budgeted equals sum of children', () => {
        const children = [
          { categoryId: 'INCOME_WAGES', budgeted: 5000, actual: 4500, isIncomeCategory: true },
          { categoryId: 'CUSTOM_SALARY', budgeted: 3000, actual: 2800, isIncomeCategory: true }
        ];

        const result = calculateEnhancedParentTotals('INCOME', children, undefined, mockCategories);

        expect(result.budgeted).toBe(8000); // sum of children (no parent budget)
        expect(result.actual).toBe(7300); // sum of children (no parent actual)
        expect(result.remaining).toBe(-700); // For income: actual - budgeted
        expect(result.percentUsed).toBe(91);
        expect(result.isOverBudget).toBe(true); // Under income target
        expect(result.isIncomeCategory).toBe(true);
        expect(result.originalBudget).toBeUndefined();
      });

      test('REQ-002: parent-only budget — budgeted equals direct parent budget', () => {
        // Children have no budgets but have spending — exercises max rule with childBudgetSum=0.
        const children = [
          { categoryId: 'TRAVEL_FLIGHTS', budgeted: 0, actual: 2000, isIncomeCategory: false },
          { categoryId: 'TRAVEL_LODGING', budgeted: 0, actual: 1500, isIncomeCategory: false },
        ];
        const existingParent = { budgeted: 5000, actual: 0, isIncomeCategory: false };

        const result = calculateEnhancedParentTotals('FOOD_AND_DRINK', children, existingParent, mockCategories);

        expect(result.budgeted).toBe(5000); // max(0 children, 5000 parent)
        expect(result.actual).toBe(3500); // children additive
      });
    });

    describe('getBudgetableTransactions', () => {
      test('should filter out transfers and hidden transactions', () => {
        const budgetable = getBudgetableTransactions(mockTransactions, mockCategories);

        expect(budgetable.length).toBe(7); // 9 total - 1 transfer - 1 hidden = 7
        expect(budgetable.find((t: Transaction) => t.categoryId === 'TRANSFER_IN')).toBeUndefined();
        expect(budgetable.find((t: Transaction) => t.isHidden)).toBeUndefined();
      });

      test('should include both income and expense transactions', () => {
        const budgetable = getBudgetableTransactions(mockTransactions, mockCategories);

        expect(budgetable.find((t: Transaction) => t.categoryId === 'INCOME')).toBeTruthy();
        expect(budgetable.find((t: Transaction) => t.categoryId === 'CUSTOM_SALARY')).toBeTruthy();
        expect(budgetable.find((t: Transaction) => t.categoryId === 'FOOD_AND_DRINK')).toBeTruthy();
        expect(budgetable.find((t: Transaction) => t.categoryId === 'ENTERTAINMENT')).toBeTruthy();
      });
    });

    describe('shouldExcludeCategory', () => {
      test('should exclude transfer categories by default', () => {
        expect(shouldExcludeCategory('TRANSFER_IN', mockCategories)).toBe(true);
        expect(shouldExcludeCategory('TRANSFER_OUT', mockCategories)).toBe(true);
      });

      test('should exclude hidden categories when requested', () => {
        expect(shouldExcludeCategory('HIDDEN_CATEGORY', mockCategories, { excludeHidden: true })).toBe(true);
        expect(shouldExcludeCategory('CHILD_OF_HIDDEN', mockCategories, { excludeHidden: true })).toBe(true);
      });

      test('should exclude child categories when requested', () => {
        expect(shouldExcludeCategory('FOOD_AND_DRINK_COFFEE', mockCategories, { excludeChildren: true })).toBe(true);
        expect(shouldExcludeCategory('CUSTOM_SALARY', mockCategories, { excludeChildren: true })).toBe(true);
      });

      test('should not exclude regular categories', () => {
        expect(shouldExcludeCategory('INCOME', mockCategories)).toBe(false);
        expect(shouldExcludeCategory('FOOD_AND_DRINK', mockCategories)).toBe(false);
        expect(shouldExcludeCategory('ENTERTAINMENT', mockCategories)).toBe(false);
      });

      test('should respect excludeTransfers option', () => {
        expect(shouldExcludeCategory('TRANSFER_IN', mockCategories, { excludeTransfers: false })).toBe(false);
        expect(shouldExcludeCategory('TRANSFER_OUT', mockCategories, { excludeTransfers: false })).toBe(false);
      });
    });
  });

  describe('Income Category Identification', () => {
    describe('calculateBudgetTotals with isIncome property', () => {
      test('should correctly categorize income categories', () => {
        const budgets: MonthlyBudget[] = [
          { id: '1', categoryId: 'INCOME', month: '2025-01', amount: 5000 },
          { id: '2', categoryId: 'CUSTOM_SALARY', month: '2025-01', amount: 3000 },
          { id: '3', categoryId: 'FOOD_AND_DRINK', month: '2025-01', amount: 800 },
        ];

        const totals = calculateBudgetTotals(budgets, mockCategories);
        expect(totals.income).toBe(8000); // INCOME + CUSTOM_SALARY
        expect(totals.expense).toBe(800); // FOOD_AND_DRINK
      });

      test('should correctly categorize expense categories', () => {
        const budgets: MonthlyBudget[] = [
          { id: '1', categoryId: 'FOOD_AND_DRINK_COFFEE', month: '2025-01', amount: 200 },
          { id: '2', categoryId: 'ENTERTAINMENT', month: '2025-01', amount: 300 },
          { id: '3', categoryId: 'CUSTOM_MOVIES', month: '2025-01', amount: 150 },
        ];

        const totals = calculateBudgetTotals(budgets, mockCategories);
        expect(totals.income).toBe(0);
        expect(totals.expense).toBe(650); // All expense categories
      });

      test('should handle mixed income and expense budgets', () => {
        const budgets: MonthlyBudget[] = [
          { id: '1', categoryId: 'INCOME', month: '2025-01', amount: 5000 },
          { id: '2', categoryId: 'FOOD_AND_DRINK', month: '2025-01', amount: 800 },
          { id: '3', categoryId: 'CUSTOM_SALARY', month: '2025-01', amount: 2000 },
          { id: '4', categoryId: 'ENTERTAINMENT', month: '2025-01', amount: 300 },
        ];

        const totals = calculateBudgetTotals(budgets, mockCategories);
        expect(totals.income).toBe(7000); // INCOME + CUSTOM_SALARY
        expect(totals.expense).toBe(1100); // FOOD_AND_DRINK + ENTERTAINMENT
      });
    });

    describe('calculateActualTotals with isIncome property', () => {
      test('should correctly categorize income transactions', () => {
        const transactions: Transaction[] = [
          {
            id: '1', plaidTransactionId: '1', accountId: 'acc1', amount: -5000, date: '2025-01-15',
            name: 'Salary', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
            categoryId: 'INCOME', pending: false, tags: [], notes: null, isHidden: false,
            isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
            accountOwner: null, originalDescription: null, location: null,
            createdAt: '2025-01-15', updatedAt: '2025-01-15'
          },
          {
            id: '2', plaidTransactionId: '2', accountId: 'acc1', amount: -3000, date: '2025-01-15',
            name: 'Freelance', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
            categoryId: 'CUSTOM_SALARY', pending: false, tags: [], notes: null, isHidden: false,
            isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
            accountOwner: null, originalDescription: null, location: null,
            createdAt: '2025-01-15', updatedAt: '2025-01-15'
          }
        ];

        const totals = calculateActualTotals(transactions, mockCategories);
        expect(totals.income).toBe(8000); // Both income transactions (absolute values)
        expect(totals.expense).toBe(0);
      });

      test('should correctly categorize expense transactions', () => {
        const transactions: Transaction[] = [
          {
            id: '1', plaidTransactionId: '1', accountId: 'acc1', amount: 800, date: '2025-01-20',
            name: 'Grocery Store', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
            categoryId: 'FOOD_AND_DRINK', pending: false, tags: [], notes: null, isHidden: false,
            isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
            accountOwner: null, originalDescription: null, location: null,
            createdAt: '2025-01-20', updatedAt: '2025-01-20'
          },
          {
            id: '2', plaidTransactionId: '2', accountId: 'acc1', amount: 150, date: '2025-01-22',
            name: 'Movie Tickets', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
            categoryId: 'CUSTOM_MOVIES', pending: false, tags: [], notes: null, isHidden: false,
            isFlagged: false, isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
            accountOwner: null, originalDescription: null, location: null,
            createdAt: '2025-01-22', updatedAt: '2025-01-22'
          }
        ];

        const totals = calculateActualTotals(transactions, mockCategories);
        expect(totals.income).toBe(0);
        expect(totals.expense).toBe(950); // Both expense transactions (absolute values)
      });
    });

    describe('calculateEnhancedParentTotals with isIncome property', () => {
      test('should correctly identify parent as income category', () => {
        const children = [
          { categoryId: 'INCOME_WAGES', budgeted: 2000, actual: 1800, isIncomeCategory: true },
          { categoryId: 'CUSTOM_SALARY', budgeted: 3000, actual: 3200, isIncomeCategory: true }
        ];

        const result = calculateEnhancedParentTotals(
          'INCOME',
          children,
          undefined,
          mockCategories
        );

        expect(result.isIncomeCategory).toBe(true);
        expect(result.budgeted).toBe(5000);
        expect(result.actual).toBe(5000);
        // For income: remaining = actual - budgeted, positive is good
        expect(result.remaining).toBe(0); // 5000 - 5000
        expect(result.isOverBudget).toBe(false); // actual >= budgeted for income
      });

      test('should correctly identify parent as expense category', () => {
        const children = [
          { categoryId: 'FOOD_AND_DRINK_COFFEE', budgeted: 200, actual: 180, isIncomeCategory: false },
          { categoryId: 'CUSTOM_GROCERIES', budgeted: 600, actual: 650, isIncomeCategory: false }
        ];

        const result = calculateEnhancedParentTotals(
          'FOOD_AND_DRINK',
          children,
          undefined,
          mockCategories
        );

        expect(result.isIncomeCategory).toBe(false);
        expect(result.budgeted).toBe(800);
        expect(result.actual).toBe(830);
        // For expense: remaining = budgeted - actual, positive is good
        expect(result.remaining).toBe(-30); // 800 - 830
        expect(result.isOverBudget).toBe(true); // actual > budgeted for expense
      });

      test('should handle mixed parent with existing budget', () => {
        const children = [
          { categoryId: 'INCOME_WAGES', budgeted: 2000, actual: 1800, isIncomeCategory: true }
        ];
        const existingParent = { budgeted: 3000, actual: 3200, isIncomeCategory: true };

        const result = calculateEnhancedParentTotals(
          'INCOME',
          children,
          existingParent,
          mockCategories
        );

        expect(result.isIncomeCategory).toBe(true);
        expect(result.budgeted).toBe(3000); // max(2000 children, 3000 parent), NOT 5000
        expect(result.actual).toBe(5000); // child + parent — actuals always additive (REQ-004)
        expect(result.originalBudget).toBe(3000);
        expect(result.originalActual).toBe(3200);
      });
    });

    describe('Fallback behavior for categories without isIncome property', () => {
      test('should handle categories missing isIncome property', () => {
        const categoriesWithoutIsIncome: Category[] = [
          // Simulate old data without isIncome property
          { id: 'INCOME', name: 'Income', parentId: null, isCustom: false, isHidden: false, isRollover: false } as Category,
          { id: 'FOOD_AND_DRINK', name: 'Food and Drink', parentId: null, isCustom: false, isHidden: false, isRollover: false } as Category,
          { id: 'CUSTOM_SALARY', name: 'Salary', parentId: 'INCOME', isCustom: true, isHidden: false, isRollover: false } as Category,
        ];

        const budgets: MonthlyBudget[] = [
          { id: '1', categoryId: 'INCOME', month: '2025-01', amount: 5000 },
          { id: '2', categoryId: 'CUSTOM_SALARY', month: '2025-01', amount: 3000 },
          { id: '3', categoryId: 'FOOD_AND_DRINK', month: '2025-01', amount: 800 },
        ];

        // Should fall back to hierarchical detection
        const totals = calculateBudgetTotals(budgets, categoriesWithoutIsIncome);
        expect(totals.income).toBe(8000); // Should still detect INCOME and CUSTOM_SALARY
        expect(totals.expense).toBe(800); // Should still detect FOOD_AND_DRINK as expense
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty arrays gracefully', () => {
      expect(getHiddenCategoryIds([])).toEqual(new Set());
      expect(getChildCategoryIds([])).toEqual(new Set());
      expect(getParentCategoryIds([])).toEqual(new Set());

      const emptyTotals = calculateBudgetTotals([], []);
      expect(emptyTotals.income).toBe(0);
      expect(emptyTotals.expense).toBe(0);
      expect(emptyTotals.transfer).toBe(0);
      expect(emptyTotals.total).toBe(0);
    });

    test('should handle categories with missing parents', () => {
      const orphanCategories: Category[] = [
        { id: 'ORPHAN', name: 'Orphan', parentId: 'MISSING_PARENT', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false }
      ];

      const hiddenIds = getHiddenCategoryIds(orphanCategories);
      expect(hiddenIds.has('ORPHAN')).toBe(false);
    });

    test('should handle circular parent references', () => {
      const circularCategories: Category[] = [
        { id: 'A', name: 'Category A', parentId: 'B', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
        { id: 'B', name: 'Category B', parentId: 'A', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false }
      ];

      // Should not crash and should not consider them hidden
      const hiddenIds = getHiddenCategoryIds(circularCategories);
      expect(hiddenIds.has('A')).toBe(false);
      expect(hiddenIds.has('B')).toBe(false);
    });
  });

  describe('buildCategoryTreeAggregation (REQ-002 max rule, REQ-004 additive actuals)', () => {
    // Build a focused fixture for hierarchy semantics. Travel parent + 3 children
    // mirrors the BRD's reproduction case.
    const travelCategories: Category[] = [
      { id: 'TRAVEL', name: 'Travel', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_FLIGHTS', name: 'Flights', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_LODGING', name: 'Lodging', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_OTHER', name: 'Other', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'INCOME', name: 'Income', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
      { id: 'INCOME_BASE', name: 'Base', parentId: 'INCOME', isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
      { id: 'INCOME_BONUS', name: 'Bonus', parentId: 'INCOME', isCustom: false, isHidden: false, isRollover: false, isIncome: true, isSavings: false },
      { id: 'RETIREMENT', name: 'Retirement', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: true },
      { id: 'RETIREMENT_401K', name: '401k', parentId: 'RETIREMENT', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: true },
      { id: 'TRANSFER_IN', name: 'Transfer In', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'HIDDEN_PARENT', name: 'Hidden Stuff', parentId: null, isCustom: true, isHidden: true, isRollover: false, isIncome: false, isSavings: false },
      { id: 'HIDDEN_CHILD_1', name: 'Hidden Child', parentId: 'HIDDEN_PARENT', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    ];

    test('REQ-002: parent-only budget — effectiveBudget equals direct parent budget', () => {
      const budgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 },
      ];
      const trees = buildCategoryTreeAggregation(travelCategories, budgets, new Map());
      const travel = trees.get('TRAVEL')!;
      expect(travel.directBudget).toBe(5000);
      expect(travel.childBudgetSum).toBe(0);
      expect(travel.effectiveBudget).toBe(5000);
    });

    test('REQ-002: child-only budgets — effectiveBudget equals childBudgetSum', () => {
      const budgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'TRAVEL_FLIGHTS', month: '2026-04', amount: 2000 },
        { id: 'b2', categoryId: 'TRAVEL_LODGING', month: '2026-04', amount: 1500 },
      ];
      const trees = buildCategoryTreeAggregation(travelCategories, budgets, new Map());
      const travel = trees.get('TRAVEL')!;
      expect(travel.directBudget).toBe(0);
      expect(travel.childBudgetSum).toBe(3500);
      expect(travel.effectiveBudget).toBe(3500);
    });

    test('REQ-002: BOTH levels — effectiveBudget is max, NOT additive (drift-prevention)', () => {
      // The defining test: this scenario MUST NOT regress to additive (5000 + 3500 = 8500).
      const budgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 },
        { id: 'b2', categoryId: 'TRAVEL_FLIGHTS', month: '2026-04', amount: 2000 },
        { id: 'b3', categoryId: 'TRAVEL_LODGING', month: '2026-04', amount: 1500 },
      ];
      const trees = buildCategoryTreeAggregation(travelCategories, budgets, new Map());
      const travel = trees.get('TRAVEL')!;
      expect(travel.directBudget).toBe(5000);
      expect(travel.childBudgetSum).toBe(3500);
      expect(travel.effectiveBudget).toBe(5000); // max(5000, 3500) — NOT 8500
    });

    test('REQ-002: BOTH levels with children > parent — effectiveBudget is the larger sum', () => {
      const budgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 1000 },
        { id: 'b2', categoryId: 'TRAVEL_FLIGHTS', month: '2026-04', amount: 2000 },
        { id: 'b3', categoryId: 'TRAVEL_LODGING', month: '2026-04', amount: 1500 },
      ];
      const trees = buildCategoryTreeAggregation(travelCategories, budgets, new Map());
      const travel = trees.get('TRAVEL')!;
      expect(travel.effectiveBudget).toBe(3500); // max(1000, 3500)
    });

    test('REQ-002: max rule applies uniformly to income parents (no income/expense split)', () => {
      // Salary parent budgeted at $80k; children Base $70k + Bonus $10k.
      // Additive would give $160k (nonsense); max gives $80k.
      const budgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'INCOME', month: '2026-04', amount: 80000 },
        { id: 'b2', categoryId: 'INCOME_BASE', month: '2026-04', amount: 70000 },
        { id: 'b3', categoryId: 'INCOME_BONUS', month: '2026-04', amount: 10000 },
      ];
      const trees = buildCategoryTreeAggregation(travelCategories, budgets, new Map());
      const income = trees.get('INCOME')!;
      expect(income.isIncome).toBe(true);
      expect(income.effectiveBudget).toBe(80000); // max(80000, 80000), NOT 160000
    });

    test('REQ-004: actuals are always additive — direct + sum(children)', () => {
      // BRD reproduction case: $5k parent budget, all spending on children.
      const budgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 },
      ];
      const actuals = new Map([
        ['TRAVEL_FLIGHTS', 2000],
        ['TRAVEL_LODGING', 2200],
        ['TRAVEL_OTHER', 600],
      ]);
      const trees = buildCategoryTreeAggregation(travelCategories, budgets, actuals);
      const travel = trees.get('TRAVEL')!;
      expect(travel.directActual).toBe(0);
      expect(travel.childActualSum).toBe(4800);
      expect(travel.effectiveActual).toBe(4800);
    });

    test('REQ-004: actuals additive even when both parent and children have spending', () => {
      const actuals = new Map([
        ['TRAVEL', 100],         // direct on parent (e.g. uncategorized travel)
        ['TRAVEL_FLIGHTS', 2000],
        ['TRAVEL_LODGING', 1500],
      ]);
      const trees = buildCategoryTreeAggregation(travelCategories, [], actuals);
      const travel = trees.get('TRAVEL')!;
      expect(travel.directActual).toBe(100);
      expect(travel.childActualSum).toBe(3500);
      expect(travel.effectiveActual).toBe(3600);
    });

    test('children array carries per-child detail for drill-down (REQ-012)', () => {
      const budgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'TRAVEL_FLIGHTS', month: '2026-04', amount: 2000 },
      ];
      const actuals = new Map([
        ['TRAVEL_FLIGHTS', 1800],
        ['TRAVEL_LODGING', 1500],
      ]);
      const trees = buildCategoryTreeAggregation(travelCategories, budgets, actuals);
      const travel = trees.get('TRAVEL')!;
      const flights = travel.children.find(c => c.categoryId === 'TRAVEL_FLIGHTS');
      const lodging = travel.children.find(c => c.categoryId === 'TRAVEL_LODGING');
      expect(flights).toEqual({ categoryId: 'TRAVEL_FLIGHTS', categoryName: 'Flights', budgeted: 2000, actual: 1800 });
      expect(lodging).toEqual({ categoryId: 'TRAVEL_LODGING', categoryName: 'Lodging', budgeted: 0, actual: 1500 });
    });

    test('savings categories excluded as a unit when excludeSavings=true', () => {
      const budgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 },
        { id: 'b2', categoryId: 'RETIREMENT', month: '2026-04', amount: 1000 },
        { id: 'b3', categoryId: 'RETIREMENT_401K', month: '2026-04', amount: 500 },
      ];
      const actuals = new Map([
        ['TRAVEL_FLIGHTS', 2000],
        ['RETIREMENT_401K', 800],
      ]);
      const trees = buildCategoryTreeAggregation(travelCategories, budgets, actuals, { excludeSavings: true });
      expect(trees.has('TRAVEL')).toBe(true);
      expect(trees.has('RETIREMENT')).toBe(false); // entire savings tree gone
    });

    test('transfer categories excluded by default (excludeTransfers defaults to true)', () => {
      const budgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'TRANSFER_IN', month: '2026-04', amount: 1000 },
      ];
      const trees = buildCategoryTreeAggregation(travelCategories, budgets, new Map());
      expect(trees.has('TRANSFER_IN')).toBe(false);
    });

    test('hidden categories excluded by default (excludeHidden defaults to true)', () => {
      const budgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'HIDDEN_PARENT', month: '2026-04', amount: 100 },
        { id: 'b2', categoryId: 'HIDDEN_CHILD_1', month: '2026-04', amount: 50 },
      ];
      const trees = buildCategoryTreeAggregation(travelCategories, budgets, new Map());
      expect(trees.has('HIDDEN_PARENT')).toBe(false);
    });

    test('drift-prevention: effectiveBudget never exceeds max(directBudget, childBudgetSum) for any tree', () => {
      // Random-ish mix across multiple trees — invariant must hold for every one.
      const budgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 },
        { id: 'b2', categoryId: 'TRAVEL_FLIGHTS', month: '2026-04', amount: 2000 },
        { id: 'b3', categoryId: 'TRAVEL_LODGING', month: '2026-04', amount: 1500 },
        { id: 'b4', categoryId: 'INCOME', month: '2026-04', amount: 80000 },
        { id: 'b5', categoryId: 'INCOME_BASE', month: '2026-04', amount: 70000 },
        { id: 'b6', categoryId: 'INCOME_BONUS', month: '2026-04', amount: 10000 },
      ];
      const trees = buildCategoryTreeAggregation(travelCategories, budgets, new Map());
      for (const tree of trees.values()) {
        expect(tree.effectiveBudget).toBeLessThanOrEqual(Math.max(tree.directBudget, tree.childBudgetSum));
        expect(tree.effectiveBudget).toBe(Math.max(tree.directBudget, tree.childBudgetSum));
      }
    });

    test('accepts plain Record<string, number> as actuals input', () => {
      const actualsRecord = { TRAVEL_FLIGHTS: 2000, TRAVEL_LODGING: 1500 };
      const trees = buildCategoryTreeAggregation(travelCategories, [], actualsRecord);
      const travel = trees.get('TRAVEL')!;
      expect(travel.effectiveActual).toBe(3500);
    });

    test('returns empty map when there are no categories with activity', () => {
      const trees = buildCategoryTreeAggregation(travelCategories, [], new Map());
      expect(trees.size).toBe(0);
    });
  });

  describe('classifyTreeBudgetState (REQ-010 three-case rule)', () => {
    const cats: Category[] = [
      { id: 'TRAVEL', name: 'Travel', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_FLIGHTS', name: 'Flights', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_LODGING', name: 'Lodging', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    ];

    test('parent_budgeted: parent has direct budget — entire tree covered', () => {
      const trees = buildCategoryTreeAggregation(cats,
        [{ id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 }],
        new Map([['TRAVEL_FLIGHTS', 2000]]));
      expect(classifyTreeBudgetState(trees.get('TRAVEL')!)).toBe('parent_budgeted');
    });

    test('parent_budgeted: parent budget + child budgets present — still parent_budgeted', () => {
      const trees = buildCategoryTreeAggregation(cats,
        [
          { id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 },
          { id: 'b2', categoryId: 'TRAVEL_FLIGHTS', month: '2026-04', amount: 2000 },
        ], new Map());
      expect(classifyTreeBudgetState(trees.get('TRAVEL')!)).toBe('parent_budgeted');
    });

    test('child_budgeted_only: only children budgeted — siblings without budgets are signal', () => {
      const trees = buildCategoryTreeAggregation(cats,
        [{ id: 'b1', categoryId: 'TRAVEL_FLIGHTS', month: '2026-04', amount: 2000 }],
        new Map([['TRAVEL_LODGING', 1500]]));
      expect(classifyTreeBudgetState(trees.get('TRAVEL')!)).toBe('child_budgeted_only');
    });

    test('unbudgeted: spending only, no budgets anywhere in tree', () => {
      const trees = buildCategoryTreeAggregation(cats, [],
        new Map([['TRAVEL_FLIGHTS', 2000]]));
      expect(classifyTreeBudgetState(trees.get('TRAVEL')!)).toBe('unbudgeted');
    });
  });

  describe('BRD reproduction: Travel parent budget + child spending', () => {
    // Single end-to-end verification of the bug described in
    // CATEGORY-HIERARCHY-BUDGETING-BRD.md §1.1. Exercises every property a
    // Reports → Budget Performance widget needs to make the correct decision.
    const cats: Category[] = [
      { id: 'TRAVEL', name: 'Travel', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_FLIGHTS', name: 'Flights', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_LODGING', name: 'Lodging', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_OTHER', name: 'Other', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    ];
    const budgets: MonthlyBudget[] = [
      { id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 },
    ];
    const actuals = new Map([
      ['TRAVEL_FLIGHTS', 2000],
      ['TRAVEL_LODGING', 2200],
      ['TRAVEL_OTHER', 600],
    ]);

    test('all three widget concerns resolved in one go', () => {
      const trees = buildCategoryTreeAggregation(cats, budgets, actuals);
      const travel = trees.get('TRAVEL')!;

      // (a) Effective budget is the parent's $5,000 (REQ-002)
      expect(travel.effectiveBudget).toBe(5000);

      // (b) Effective actual rolls up children to $4,800 (REQ-004)
      expect(travel.effectiveActual).toBe(4800);

      // (c) Unused Budgets widget MUST NOT show this (96% used, not <10%) — REQ-011
      expect(isTreeUnused(travel)).toBe(false);

      // (d) Consistently Over-Budget widget MUST NOT flag (under budget) — REQ-009
      expect(isTreeOverBudget(travel)).toBe(false);

      // (e) Unbudgeted Spending widget MUST NOT show any leaf rows from this tree
      //     because the parent has a direct budget (REQ-010 case 1)
      expect(classifyTreeBudgetState(travel)).toBe('parent_budgeted');

      // (f) No leaf rows for Flights/Lodging/Other should be reachable in the
      //     Unbudgeted Spending classification path — confirmed by (e).
    });
  });

  describe('buildPeriodRollup', () => {
    const cats: Category[] = [
      { id: 'TRAVEL', name: 'Travel', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_FLIGHTS', name: 'Flights', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_LODGING', name: 'Lodging', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    ];

    test('per-month max applied independently then summed (not max-of-sums)', () => {
      // Month A: parent 100 + child 50 → max = 100. Month B: parent 80 + child 120 → max = 120.
      // Period total must be 100 + 120 = 220 (NOT max(180, 170) = 180).
      const period = buildPeriodRollup(cats, [
        {
          month: '2026-01',
          budgets: [
            { id: 'a1', categoryId: 'TRAVEL', month: '2026-01', amount: 100 },
            { id: 'a2', categoryId: 'TRAVEL_FLIGHTS', month: '2026-01', amount: 50 },
          ],
          actuals: new Map(),
        },
        {
          month: '2026-02',
          budgets: [
            { id: 'b1', categoryId: 'TRAVEL', month: '2026-02', amount: 80 },
            { id: 'b2', categoryId: 'TRAVEL_FLIGHTS', month: '2026-02', amount: 120 },
          ],
          actuals: new Map(),
        },
      ]);

      const travel = period.get('TRAVEL')!;
      expect(travel.effectiveBudget).toBe(220);
      expect(travel.directBudget).toBe(180);
      expect(travel.childBudgetSum).toBe(170);
      expect(travel.monthsWithBudget).toBe(2);
    });

    test('monthsOverBudget counts months where effective_actual > effective_budget', () => {
      const period = buildPeriodRollup(cats, [
        {
          month: '2026-01',
          budgets: [{ id: 'a1', categoryId: 'TRAVEL', month: '2026-01', amount: 100 }],
          actuals: new Map([['TRAVEL_FLIGHTS', 200]]), // over (effective_actual 200 > 100)
        },
        {
          month: '2026-02',
          budgets: [{ id: 'b1', categoryId: 'TRAVEL', month: '2026-02', amount: 100 }],
          actuals: new Map([['TRAVEL_FLIGHTS', 50]]),  // under
        },
        {
          month: '2026-03',
          budgets: [{ id: 'c1', categoryId: 'TRAVEL', month: '2026-03', amount: 100 }],
          actuals: new Map([['TRAVEL_FLIGHTS', 150]]), // over
        },
      ]);
      const travel = period.get('TRAVEL')!;
      expect(travel.monthsOverBudget).toBe(2);
      expect(travel.monthsWithBudget).toBe(3);
    });

    test('child period totals fold per-month child totals additively', () => {
      const period = buildPeriodRollup(cats, [
        {
          month: '2026-01',
          budgets: [],
          actuals: new Map([['TRAVEL_FLIGHTS', 200], ['TRAVEL_LODGING', 100]]),
        },
        {
          month: '2026-02',
          budgets: [],
          actuals: new Map([['TRAVEL_FLIGHTS', 300]]),
        },
      ]);
      const travel = period.get('TRAVEL')!;
      const flights = travel.children.find(c => c.categoryId === 'TRAVEL_FLIGHTS')!;
      const lodging = travel.children.find(c => c.categoryId === 'TRAVEL_LODGING')!;
      expect(flights.actual).toBe(500);
      expect(lodging.actual).toBe(100);
      expect(travel.childIds.sort()).toEqual(['TRAVEL_FLIGHTS', 'TRAVEL_LODGING']);
    });

    test('returns empty map when no monthly data has activity', () => {
      const period = buildPeriodRollup(cats, []);
      expect(period.size).toBe(0);
    });
  });

  describe('isTreeUnused / isTreeOverBudget', () => {
    const cats: Category[] = [
      { id: 'TRAVEL', name: 'Travel', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_FLIGHTS', name: 'Flights', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    ];

    test('isTreeUnused: <10% spent flags unused', () => {
      const trees = buildCategoryTreeAggregation(cats,
        [{ id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 }],
        new Map([['TRAVEL', 100]])); // 2% used
      expect(isTreeUnused(trees.get('TRAVEL')!)).toBe(true);
    });

    test('isTreeUnused: BRD repro — child spending counts toward parent threshold', () => {
      // The exact scenario from the BRD: $5k parent budget, ~$4.8k spent on children.
      // Should NOT appear in Unused Budgets.
      const trees = buildCategoryTreeAggregation(cats,
        [{ id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 }],
        new Map([['TRAVEL_FLIGHTS', 4800]]));
      expect(isTreeUnused(trees.get('TRAVEL')!)).toBe(false);
    });

    test('isTreeUnused: zero budget never flagged as unused', () => {
      const trees = buildCategoryTreeAggregation(cats, [],
        new Map([['TRAVEL_FLIGHTS', 100]]));
      expect(isTreeUnused(trees.get('TRAVEL')!)).toBe(false);
    });

    test('isTreeOverBudget: rolled-up actual exceeding rolled-up budget flags over', () => {
      const trees = buildCategoryTreeAggregation(cats,
        [{ id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 }],
        new Map([['TRAVEL_FLIGHTS', 6000]]));
      expect(isTreeOverBudget(trees.get('TRAVEL')!)).toBe(true);
    });

    test('isTreeOverBudget: under at parent level, over at child level — does NOT flag (REQ-009 consequence)', () => {
      // Parent budget $5k; spent $4k on Flights, $0 elsewhere. Effective actual $4k < $5k.
      // This documents the intentional behavior change called out in the BRD.
      const trees = buildCategoryTreeAggregation(cats,
        [{ id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 }],
        new Map([['TRAVEL_FLIGHTS', 4000]]));
      expect(isTreeOverBudget(trees.get('TRAVEL')!)).toBe(false);
    });
  });

  // =============================================================================
  // Rollover Budget Utilities — ROLLOVER-BUDGETS-BRD.md
  // =============================================================================

  describe('computeRolloverBalance / computeEffectiveBudget', () => {
    const makeCat = (overrides: Partial<Category> & { id: string }): Category => ({
      name: overrides.id,
      parentId: null,
      isCustom: false,
      isHidden: false,
      isRollover: true,
      isIncome: false,
      isSavings: false,
      ...overrides,
    });

    const spending = makeCat({ id: 'CUSTOM_GAS', isRollover: true });
    const income = makeCat({ id: 'INCOME_BONUS', isRollover: true, isIncome: true });
    const savings = makeCat({ id: 'CUSTOM_IRA', isRollover: true, isSavings: true });

    // Worked-example tests from BRD §2.4 table — one per row.
    // Target month is always February of the same year; January carries into it.

    test('BRD §2.4: spending surplus — prior 100/80 carries +20, next effective 120', () => {
      const budgets = new Map([['2026-01', 100], ['2026-02', 100]]);
      const actuals = new Map([['2026-01', 80]]);
      const balance = computeRolloverBalance(spending, '2026-02', budgets, actuals);
      expect(balance).toBe(20);
      expect(computeEffectiveBudget(spending, 100, balance)).toBe(120);
    });

    test('BRD §2.4: spending deficit — prior 100/120 carries −20, next effective 80', () => {
      const budgets = new Map([['2026-01', 100], ['2026-02', 100]]);
      const actuals = new Map([['2026-01', 120]]);
      const balance = computeRolloverBalance(spending, '2026-02', budgets, actuals);
      expect(balance).toBe(-20);
      expect(computeEffectiveBudget(spending, 100, balance)).toBe(80);
    });

    test('BRD §2.4: income ahead of pace — prior 500/700 carries −200, next effective 300', () => {
      const budgets = new Map([['2026-01', 500], ['2026-02', 500]]);
      const actuals = new Map([['2026-01', 700]]);
      const balance = computeRolloverBalance(income, '2026-02', budgets, actuals);
      expect(balance).toBe(-200);
      expect(computeEffectiveBudget(income, 500, balance)).toBe(300);
    });

    test('BRD §2.4: income behind pace — prior 500/0 carries +500, next effective 1000', () => {
      const budgets = new Map([['2026-01', 500], ['2026-02', 500]]);
      const actuals = new Map([['2026-01', 0]]);
      const balance = computeRolloverBalance(income, '2026-02', budgets, actuals);
      expect(balance).toBe(500);
      expect(computeEffectiveBudget(income, 500, balance)).toBe(1000);
    });

    test('BRD §2.4: savings behind target — prior 500/300 carries +200, next effective 700', () => {
      const budgets = new Map([['2026-01', 500], ['2026-02', 500]]);
      const actuals = new Map([['2026-01', 300]]);
      const balance = computeRolloverBalance(savings, '2026-02', budgets, actuals);
      expect(balance).toBe(200);
      expect(computeEffectiveBudget(savings, 500, balance)).toBe(700);
    });

    test('BRD §2.4: savings ahead of target — prior 500/800 carries −300, next effective 200', () => {
      const budgets = new Map([['2026-01', 500], ['2026-02', 500]]);
      const actuals = new Map([['2026-01', 800]]);
      const balance = computeRolloverBalance(savings, '2026-02', budgets, actuals);
      expect(balance).toBe(-300);
      expect(computeEffectiveBudget(savings, 500, balance)).toBe(200);
    });

    test('REQ-001: isRollover=false returns 0 regardless of data', () => {
      const notFlagged = makeCat({ id: 'CUSTOM_GROCERIES', isRollover: false });
      const budgets = new Map([['2026-01', 100]]);
      const actuals = new Map([['2026-01', 250]]);
      expect(computeRolloverBalance(notFlagged, '2026-02', budgets, actuals)).toBe(0);
      expect(computeEffectiveBudget(notFlagged, 100, 9999)).toBe(100);
    });

    test('REQ-005: January unconditionally returns 0 — no prior months in year', () => {
      const budgets = new Map([['2025-12', 100]]); // prior year data irrelevant
      const actuals = new Map([['2025-12', 0]]);
      expect(computeRolloverBalance(spending, '2026-01', budgets, actuals)).toBe(0);
    });

    test('REQ-005: January of any year returns 0 for all category types', () => {
      const budgets = new Map<string, number>();
      const actuals = new Map<string, number>();
      expect(computeRolloverBalance(spending, '2000-01', budgets, actuals)).toBe(0);
      expect(computeRolloverBalance(income, '2030-01', budgets, actuals)).toBe(0);
      expect(computeRolloverBalance(savings, '2099-01', budgets, actuals)).toBe(0);
    });

    test('REQ-002 defense: transfer categories always return 0', () => {
      const transfer: Category = makeCat({ id: 'TRANSFER_OUT_SAVINGS', isRollover: true });
      const budgets = new Map([['2026-01', 100]]);
      const actuals = new Map([['2026-01', 50]]);
      expect(computeRolloverBalance(transfer, '2026-02', budgets, actuals)).toBe(0);
    });

    test('REQ-008: negative effective budget is preserved', () => {
      // Feb target with Jan overspend: $100 budget, $500 actual → Jan carries −$400.
      // March effective = $100 + (−$400) = −$300.
      const budgets = new Map([['2026-01', 100], ['2026-02', 100]]);
      const actuals = new Map([['2026-01', 500]]);
      const balance = computeRolloverBalance(spending, '2026-02', budgets, actuals);
      expect(balance).toBe(-400);
      expect(computeEffectiveBudget(spending, 100, balance)).toBe(-300);
    });

    test('REQ-014: mid-year activation sums all prior months of current year', () => {
      // April target: sum of Jan + Feb + Mar (budgeted − actual).
      const budgets = new Map([
        ['2026-01', 100],
        ['2026-02', 100],
        ['2026-03', 100],
        ['2026-04', 100],
      ]);
      const actuals = new Map([
        ['2026-01', 80],   // +20
        ['2026-02', 90],   // +10
        ['2026-03', 110],  // -10
      ]);
      const balance = computeRolloverBalance(spending, '2026-04', budgets, actuals);
      expect(balance).toBe(20); // 20 + 10 − 10
      expect(computeEffectiveBudget(spending, 100, balance)).toBe(120);
    });

    test('REQ-012: year boundary resets — Jan 2027 carries 0 regardless of Dec 2026 data', () => {
      const budgets = new Map([
        ['2026-12', 500],
        ['2027-01', 100],
      ]);
      const actuals = new Map([['2026-12', 0]]); // would carry +500 if not for reset
      expect(computeRolloverBalance(spending, '2027-01', budgets, actuals)).toBe(0);
    });

    test('missing budget/actual entries default to 0 — no ReferenceError', () => {
      // Sparse data — only February has entries; prior months default to 0.
      const budgets = new Map([['2026-03', 100]]);
      const actuals = new Map([['2026-02', 50]]);
      // Jan: 0 budget − 0 actual = 0; Feb: 0 budget − 50 actual = −50.
      expect(computeRolloverBalance(spending, '2026-03', budgets, actuals)).toBe(-50);
    });

    test('malformed targetMonth returns 0', () => {
      const budgets = new Map([['2026-01', 100]]);
      const actuals = new Map([['2026-01', 50]]);
      expect(computeRolloverBalance(spending, 'bogus', budgets, actuals)).toBe(0);
      expect(computeRolloverBalance(spending, '2026-13', budgets, actuals)).toBe(0);
      expect(computeRolloverBalance(spending, '26-04', budgets, actuals)).toBe(0);
    });
  });

  describe('buildEffectiveBudgetsMap', () => {
    const cats: Category[] = [
      { id: 'FOOD_AND_DRINK', name: 'Food & Drink', parentId: null, isCustom: false, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
      { id: 'CUSTOM_GAS', name: 'Gas', parentId: null, isCustom: true, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
      { id: 'CUSTOM_GROCERIES', name: 'Groceries', parentId: 'FOOD_AND_DRINK', isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRANSFER_OUT_SAVINGS', name: 'Transfer', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    ];

    test('rollover category accrues balance into target-month effective', () => {
      const budgets = new Map<string, Map<string, number>>([
        ['CUSTOM_GAS', new Map([['2026-01', 100], ['2026-02', 100], ['2026-03', 100]])],
      ]);
      const actuals = new Map<string, Map<string, number>>([
        ['CUSTOM_GAS', new Map([['2026-01', 40], ['2026-02', 50]])],
      ]);
      const map = buildEffectiveBudgetsMap(cats, '2026-03', budgets, actuals);
      // Carry = (100−40) + (100−50) = 110. Effective = 100 + 110 = 210.
      expect(map.get('CUSTOM_GAS')).toBe(210);
    });

    test('non-rollover category passes raw budget through unchanged', () => {
      const budgets = new Map<string, Map<string, number>>([
        ['CUSTOM_GROCERIES', new Map([['2026-01', 400], ['2026-03', 400]])],
      ]);
      const actuals = new Map<string, Map<string, number>>([
        ['CUSTOM_GROCERIES', new Map([['2026-01', 999]])],
      ]);
      const map = buildEffectiveBudgetsMap(cats, '2026-03', budgets, actuals);
      expect(map.get('CUSTOM_GROCERIES')).toBe(400);
    });

    test('transfer category passes raw through — no rollover applied even if flagged', () => {
      const budgets = new Map<string, Map<string, number>>([
        ['TRANSFER_OUT_SAVINGS', new Map([['2026-01', 200], ['2026-03', 200]])],
      ]);
      const actuals = new Map<string, Map<string, number>>([
        ['TRANSFER_OUT_SAVINGS', new Map([['2026-01', 0]])],
      ]);
      const map = buildEffectiveBudgetsMap(cats, '2026-03', budgets, actuals);
      expect(map.get('TRANSFER_OUT_SAVINGS')).toBe(200);
    });

    test('categories with no raw budget and zero rollover contribution are omitted', () => {
      const budgets = new Map<string, Map<string, number>>();
      const actuals = new Map<string, Map<string, number>>();
      const map = buildEffectiveBudgetsMap(cats, '2026-03', budgets, actuals);
      expect(map.size).toBe(0);
    });

    test('categories whose raw + rollover exactly cancel (net-zero effective) are omitted', () => {
      // Characterization: the omission predicate is value !== 0 at the final sum,
      // NOT raw !== 0. A category with raw=100 that is cancelled by a -100 carry
      // is indistinguishable in the map from a category with no budget at all.
      // Consumers must treat absence as "net $0" rather than "no budget"; see
      // shared/utils/budgetCalculations.ts:981.
      const budgets = new Map<string, Map<string, number>>([
        // CUSTOM_GAS is isRollover=true in this suite's fixture.
        // Jan: budgeted 100, spent 100 → carry 0 into Feb.
        // Feb: budgeted 100, spent 200 → carry -100 into March.
        // March raw = 100, carry = -100, effective = 0.
        ['CUSTOM_GAS', new Map([['2026-01', 100], ['2026-02', 100], ['2026-03', 100]])],
      ]);
      const actuals = new Map<string, Map<string, number>>([
        ['CUSTOM_GAS', new Map([['2026-01', 100], ['2026-02', 200]])],
      ]);
      const map = buildEffectiveBudgetsMap(cats, '2026-03', budgets, actuals);
      expect(map.has('CUSTOM_GAS')).toBe(false);
    });

    test('January target — rollover categories get raw passthrough (REQ-005)', () => {
      const budgets = new Map<string, Map<string, number>>([
        ['CUSTOM_GAS', new Map([['2026-01', 100]])],
      ]);
      const actuals = new Map<string, Map<string, number>>();
      const map = buildEffectiveBudgetsMap(cats, '2026-01', budgets, actuals);
      expect(map.get('CUSTOM_GAS')).toBe(100);
    });

    test('feeds buildCategoryTreeAggregation via budgetsOverride — max rule uses effective values', () => {
      // Parent FOOD_AND_DRINK is rollover; child CUSTOM_GROCERIES is not.
      // Build effective budgets for March, then rollup. Parent's effective should
      // include Jan+Feb carry; children pass through raw.
      const budgets = new Map<string, Map<string, number>>([
        ['FOOD_AND_DRINK', new Map([['2026-01', 800], ['2026-02', 800], ['2026-03', 800]])],
        ['CUSTOM_GROCERIES', new Map([['2026-03', 300]])],
      ]);
      const actuals = new Map<string, Map<string, number>>([
        ['FOOD_AND_DRINK', new Map([['2026-01', 500], ['2026-02', 600]])], // carry +300 + +200 = +500
      ]);
      const effective = buildEffectiveBudgetsMap(cats, '2026-03', budgets, actuals);
      expect(effective.get('FOOD_AND_DRINK')).toBe(1300); // 800 + 500

      const trees = buildCategoryTreeAggregation(
        cats,
        [], // ignored when budgetsOverride present
        new Map(),
        { budgetsOverride: effective },
      );
      const food = trees.get('FOOD_AND_DRINK')!;
      expect(food.directBudget).toBe(1300);
      expect(food.childBudgetSum).toBe(300);
      expect(food.effectiveBudget).toBe(1300); // max(1300, 300)
    });
  });

  describe('buildCategoryTreeAggregation with budgetsOverride', () => {
    const cats: Category[] = [
      { id: 'TRAVEL', name: 'Travel', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_FLIGHTS', name: 'Flights', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRAVEL_LODGING', name: 'Lodging', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      { id: 'TRANSFER_IN', name: 'Transfer In', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
    ];

    test('override replaces budgets array entirely — raw budgets ignored', () => {
      const rawBudgets: MonthlyBudget[] = [
        { id: 'b1', categoryId: 'TRAVEL', month: '2026-04', amount: 5000 },
      ];
      const override = new Map([
        ['TRAVEL', 1200],
        ['TRAVEL_FLIGHTS', 800],
      ]);
      const trees = buildCategoryTreeAggregation(cats, rawBudgets, new Map(), {
        budgetsOverride: override,
      });
      const travel = trees.get('TRAVEL')!;
      expect(travel.directBudget).toBe(1200);
      expect(travel.childBudgetSum).toBe(800);
      expect(travel.effectiveBudget).toBe(1200); // max(1200, 800)
    });

    test('override values may be negative (rollover overspend) — directBudget carries sign', () => {
      const override = new Map([['TRAVEL', -300]]);
      const trees = buildCategoryTreeAggregation(cats, [], new Map(), {
        budgetsOverride: override,
      });
      const travel = trees.get('TRAVEL')!;
      expect(travel.directBudget).toBe(-300);
      // Note: existing Math.max rule folds in Σ children = 0 → effective = 0.
      // This is the literal BRD REQ-022 behavior; negative parent budgets with
      // zero-budgeted children display as 0 at the rolled-up parent level.
      expect(travel.effectiveBudget).toBe(0);
    });

    test('override respects excludeTransfers — transfer override entry does not produce a tree', () => {
      const override = new Map([
        ['TRAVEL', 1000],
        ['TRANSFER_IN', 500],
      ]);
      const trees = buildCategoryTreeAggregation(cats, [], new Map(), {
        budgetsOverride: override,
      });
      expect(trees.has('TRAVEL')).toBe(true);
      expect(trees.has('TRANSFER_IN')).toBe(false);
    });

    test('actuals still sourced from the actuals argument regardless of override', () => {
      const override = new Map([['TRAVEL', 1000]]);
      const actuals = new Map([['TRAVEL_FLIGHTS', 750]]);
      const trees = buildCategoryTreeAggregation(cats, [], actuals, {
        budgetsOverride: override,
      });
      const travel = trees.get('TRAVEL')!;
      expect(travel.effectiveActual).toBe(750);
      expect(travel.directBudget).toBe(1000);
    });
  });

  describe('findRolloverSubtreeConflicts', () => {
    test('no conflicts when only parents OR only children are flagged', () => {
      const cats: Category[] = [
        { id: 'TRAVEL', name: 'Travel', parentId: null, isCustom: false, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
        { id: 'TRAVEL_FLIGHTS', name: 'Flights', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
        { id: 'FOOD_AND_DRINK', name: 'Food', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
        { id: 'CUSTOM_GROCERIES', name: 'Groceries', parentId: 'FOOD_AND_DRINK', isCustom: true, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
      ];
      expect(findRolloverSubtreeConflicts(cats)).toEqual([]);
    });

    test('parent + single flagged child surfaces a conflict', () => {
      const cats: Category[] = [
        { id: 'TRAVEL', name: 'Travel', parentId: null, isCustom: false, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
        { id: 'TRAVEL_FLIGHTS', name: 'Flights', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
        { id: 'TRAVEL_LODGING', name: 'Lodging', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
      ];
      expect(findRolloverSubtreeConflicts(cats)).toEqual([
        { parentId: 'TRAVEL', childIds: ['TRAVEL_FLIGHTS'] },
      ]);
    });

    test('parent + multiple flagged children lists all children', () => {
      const cats: Category[] = [
        { id: 'TRAVEL', name: 'Travel', parentId: null, isCustom: false, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
        { id: 'TRAVEL_FLIGHTS', name: 'Flights', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
        { id: 'TRAVEL_LODGING', name: 'Lodging', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
      ];
      expect(findRolloverSubtreeConflicts(cats)).toEqual([
        { parentId: 'TRAVEL', childIds: ['TRAVEL_FLIGHTS', 'TRAVEL_LODGING'] },
      ]);
    });

    test('multiple conflicted subtrees each surface independently', () => {
      const cats: Category[] = [
        { id: 'TRAVEL', name: 'Travel', parentId: null, isCustom: false, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
        { id: 'TRAVEL_FLIGHTS', name: 'Flights', parentId: 'TRAVEL', isCustom: false, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
        { id: 'FOOD_AND_DRINK', name: 'Food', parentId: null, isCustom: false, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
        { id: 'CUSTOM_GROCERIES', name: 'Groceries', parentId: 'FOOD_AND_DRINK', isCustom: true, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
      ];
      const conflicts = findRolloverSubtreeConflicts(cats);
      expect(conflicts).toHaveLength(2);
      expect(conflicts).toContainEqual({ parentId: 'TRAVEL', childIds: ['TRAVEL_FLIGHTS'] });
      expect(conflicts).toContainEqual({ parentId: 'FOOD_AND_DRINK', childIds: ['CUSTOM_GROCERIES'] });
    });

    test('child flagged without parent flagged is never a conflict', () => {
      const cats: Category[] = [
        { id: 'FOOD_AND_DRINK', name: 'Food', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false },
        { id: 'CUSTOM_GROCERIES', name: 'Groceries', parentId: 'FOOD_AND_DRINK', isCustom: true, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
        { id: 'CUSTOM_RESTAURANTS', name: 'Restaurants', parentId: 'FOOD_AND_DRINK', isCustom: true, isHidden: false, isRollover: true, isIncome: false, isSavings: false },
      ];
      // Multiple siblings flagged is fine — only parent+child chain is a conflict.
      expect(findRolloverSubtreeConflicts(cats)).toEqual([]);
    });
  });
});