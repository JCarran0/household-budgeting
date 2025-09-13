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
  type BudgetTotals
} from '../../../../shared/utils/budgetCalculations';
import { Category, MonthlyBudget, Transaction } from '../../../../shared/types';

describe('Budget Calculation Utilities', () => {
  const mockCategories: Category[] = [
    // Root categories
    { id: 'INCOME', name: 'Income', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: true },
    { id: 'FOOD_AND_DRINK', name: 'Food and Drink', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false },
    { id: 'ENTERTAINMENT', name: 'Entertainment', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false },
    { id: 'TRANSFER_IN', name: 'Transfer In', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false },
    { id: 'TRANSFER_OUT', name: 'Transfer Out', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false },

    // Income subcategories
    { id: 'INCOME_WAGES', name: 'Wages', parentId: 'INCOME', isCustom: false, isHidden: false, isRollover: false, isIncome: true },
    { id: 'CUSTOM_SALARY', name: 'Salary', parentId: 'INCOME', isCustom: true, isHidden: false, isRollover: false, isIncome: true },

    // Expense subcategories
    { id: 'FOOD_AND_DRINK_COFFEE', name: 'Coffee', parentId: 'FOOD_AND_DRINK', isCustom: false, isHidden: false, isRollover: false, isIncome: false },
    { id: 'CUSTOM_GROCERIES', name: 'Groceries', parentId: 'FOOD_AND_DRINK', isCustom: true, isHidden: false, isRollover: false, isIncome: false },
    { id: 'CUSTOM_MOVIES', name: 'Movies', parentId: 'ENTERTAINMENT', isCustom: true, isHidden: false, isRollover: false, isIncome: false },

    // Hidden categories
    { id: 'HIDDEN_CATEGORY', name: 'Hidden Category', parentId: null, isCustom: true, isHidden: true, isRollover: false, isIncome: false },
    { id: 'CHILD_OF_HIDDEN', name: 'Child of Hidden', parentId: 'HIDDEN_CATEGORY', isCustom: true, isHidden: false, isRollover: false, isIncome: false },
    { id: 'VISIBLE_PARENT', name: 'Visible Parent', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false },
    { id: 'HIDDEN_CHILD', name: 'Hidden Child', parentId: 'VISIBLE_PARENT', isCustom: true, isHidden: true, isRollover: false, isIncome: false },
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
      isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      createdAt: '2025-01-15', updatedAt: '2025-01-15'
    },
    {
      id: '2', plaidTransactionId: '2', accountId: 'acc1', amount: -2800, date: '2025-01-15',
      name: 'Freelance', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'CUSTOM_SALARY', pending: false, tags: [], notes: null, isHidden: false,
      isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      createdAt: '2025-01-15', updatedAt: '2025-01-15'
    },
    {
      id: '3', plaidTransactionId: '3', accountId: 'acc1', amount: 750, date: '2025-01-20',
      name: 'Grocery Store', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'FOOD_AND_DRINK', pending: false, tags: [], notes: null, isHidden: false,
      isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      createdAt: '2025-01-20', updatedAt: '2025-01-20'
    },
    {
      id: '4', plaidTransactionId: '4', accountId: 'acc1', amount: 180, date: '2025-01-22',
      name: 'Coffee Shop', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'FOOD_AND_DRINK_COFFEE', pending: false, tags: [], notes: null, isHidden: false,
      isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      createdAt: '2025-01-22', updatedAt: '2025-01-22'
    },
    {
      id: '5', plaidTransactionId: '5', accountId: 'acc1', amount: 250, date: '2025-01-25',
      name: 'Movie Theater', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'ENTERTAINMENT', pending: false, tags: [], notes: null, isHidden: false,
      isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      createdAt: '2025-01-25', updatedAt: '2025-01-25'
    },
    {
      id: '6', plaidTransactionId: '6', accountId: 'acc1', amount: 1000, date: '2025-01-26',
      name: 'Transfer', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'TRANSFER_IN', pending: false, tags: [], notes: null, isHidden: false,
      isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      createdAt: '2025-01-26', updatedAt: '2025-01-26'
    },
    {
      id: '7', plaidTransactionId: '7', accountId: 'acc1', amount: 90, date: '2025-01-27',
      name: 'Hidden Transaction', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'HIDDEN_CATEGORY', pending: false, tags: [], notes: null, isHidden: false,
      isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      createdAt: '2025-01-27', updatedAt: '2025-01-27'
    },
    {
      id: '8', plaidTransactionId: '8', accountId: 'acc1', amount: 40, date: '2025-01-28',
      name: 'Child of Hidden', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'CHILD_OF_HIDDEN', pending: false, tags: [], notes: null, isHidden: false,
      isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
      createdAt: '2025-01-28', updatedAt: '2025-01-28'
    },
    {
      id: '9', plaidTransactionId: '9', accountId: 'acc1', amount: 25, date: '2025-01-29',
      name: 'Hidden Transaction', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
      categoryId: 'VISIBLE_PARENT', pending: false, tags: [], notes: null, isHidden: true,
      isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
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
            isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
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
      test('should calculate parent totals with existing parent budget', () => {
        const children = [
          { categoryId: 'FOOD_AND_DRINK_COFFEE', budgeted: 200, actual: 180, isIncomeCategory: false },
          { categoryId: 'CUSTOM_GROCERIES', budgeted: 300, actual: 400, isIncomeCategory: false }
        ];
        const existingParent = { budgeted: 800, actual: 750, isIncomeCategory: false };

        const result = calculateEnhancedParentTotals('FOOD_AND_DRINK', children, existingParent, mockCategories);

        expect(result.budgeted).toBe(1300); // 500 (children) + 800 (parent)
        expect(result.actual).toBe(1330); // 580 (children) + 750 (parent)
        expect(result.remaining).toBe(-30); // 1300 - 1330 (over budget)
        expect(result.percentUsed).toBe(102);
        expect(result.isOverBudget).toBe(true);
        expect(result.isCalculated).toBe(true);
        expect(result.originalBudget).toBe(800);
        expect(result.originalActual).toBe(750);
      });

      test('should handle parent-only calculation (no existing parent budget)', () => {
        const children = [
          { categoryId: 'INCOME_WAGES', budgeted: 5000, actual: 4500, isIncomeCategory: true },
          { categoryId: 'CUSTOM_SALARY', budgeted: 3000, actual: 2800, isIncomeCategory: true }
        ];

        const result = calculateEnhancedParentTotals('INCOME', children, undefined, mockCategories);

        expect(result.budgeted).toBe(8000); // Only children totals
        expect(result.actual).toBe(7300); // Only children totals
        expect(result.remaining).toBe(-700); // For income: actual - budgeted
        expect(result.percentUsed).toBe(91);
        expect(result.isOverBudget).toBe(true); // Under income target
        expect(result.isIncomeCategory).toBe(true);
        expect(result.originalBudget).toBeUndefined();
      });
    });

    describe('getBudgetableTransactions', () => {
      test('should filter out transfers and hidden transactions', () => {
        const budgetable = getBudgetableTransactions(mockTransactions, mockCategories);

        expect(budgetable.length).toBe(7); // 9 total - 1 transfer - 1 hidden = 7
        expect(budgetable.find(t => t.categoryId === 'TRANSFER_IN')).toBeUndefined();
        expect(budgetable.find(t => t.isHidden)).toBeUndefined();
      });

      test('should include both income and expense transactions', () => {
        const budgetable = getBudgetableTransactions(mockTransactions, mockCategories);

        expect(budgetable.find(t => t.categoryId === 'INCOME')).toBeTruthy();
        expect(budgetable.find(t => t.categoryId === 'CUSTOM_SALARY')).toBeTruthy();
        expect(budgetable.find(t => t.categoryId === 'FOOD_AND_DRINK')).toBeTruthy();
        expect(budgetable.find(t => t.categoryId === 'ENTERTAINMENT')).toBeTruthy();
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
            isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
            createdAt: '2025-01-15', updatedAt: '2025-01-15'
          },
          {
            id: '2', plaidTransactionId: '2', accountId: 'acc1', amount: -3000, date: '2025-01-15',
            name: 'Freelance', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
            categoryId: 'CUSTOM_SALARY', pending: false, tags: [], notes: null, isHidden: false,
            isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
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
            isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
            createdAt: '2025-01-20', updatedAt: '2025-01-20'
          },
          {
            id: '2', plaidTransactionId: '2', accountId: 'acc1', amount: 150, date: '2025-01-22',
            name: 'Movie Tickets', userDescription: null, merchantName: null, category: [], plaidCategoryId: null,
            categoryId: 'CUSTOM_MOVIES', pending: false, tags: [], notes: null, isHidden: false,
            isManual: false, isSplit: false, parentTransactionId: null, splitTransactionIds: [],
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
        expect(result.budgeted).toBe(5000); // child + parent
        expect(result.actual).toBe(5000); // child + parent
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
        { id: 'ORPHAN', name: 'Orphan', parentId: 'MISSING_PARENT', isCustom: true, isHidden: false, isRollover: false, isIncome: false }
      ];

      const hiddenIds = getHiddenCategoryIds(orphanCategories);
      expect(hiddenIds.has('ORPHAN')).toBe(false);
    });

    test('should handle circular parent references', () => {
      const circularCategories: Category[] = [
        { id: 'A', name: 'Category A', parentId: 'B', isCustom: true, isHidden: false, isRollover: false, isIncome: false },
        { id: 'B', name: 'Category B', parentId: 'A', isCustom: true, isHidden: false, isRollover: false, isIncome: false }
      ];

      // Should not crash and should not consider them hidden
      const hiddenIds = getHiddenCategoryIds(circularCategories);
      expect(hiddenIds.has('A')).toBe(false);
      expect(hiddenIds.has('B')).toBe(false);
    });
  });
});