/**
 * Tests for category helper utilities
 * Testing hierarchical income detection functionality
 */

import { 
  isIncomeCategory,
  isTransferCategory,
  isExpenseCategory,
  createCategoryLookup,
  isIncomeCategoryHierarchical,
  isExpenseCategoryHierarchical,
  isIncomeCategoryWithCategories,
  isExpenseCategoryWithCategories
} from '../../../../shared/utils/categoryHelpers';
import { Category } from '../../../../shared/types';

describe('Category Helper Functions', () => {
  const mockCategories: Category[] = [
    // Root INCOME category
    { id: 'INCOME', name: 'Income', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: true },

    // Income subcategories (should be detected as income)
    { id: 'INCOME_WAGES', name: 'Wages', parentId: 'INCOME', isCustom: false, isHidden: false, isRollover: false, isIncome: true },
    { id: 'CUSTOM_SALARY', name: 'Salary', parentId: 'INCOME', isCustom: true, isHidden: false, isRollover: false, isIncome: true },
    { id: 'CUSTOM_FREELANCE', name: 'Freelance', parentId: 'INCOME', isCustom: true, isHidden: false, isRollover: false, isIncome: true },

    // Deep nested income subcategories
    { id: 'CUSTOM_BONUS', name: 'Bonus', parentId: 'INCOME_WAGES', isCustom: true, isHidden: false, isRollover: false, isIncome: true },

    // Non-income categories
    { id: 'FOOD_AND_DRINK', name: 'Food and Drink', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false },
    { id: 'FOOD_AND_DRINK_COFFEE', name: 'Coffee', parentId: 'FOOD_AND_DRINK', isCustom: false, isHidden: false, isRollover: false, isIncome: false },
    { id: 'CUSTOM_GROCERIES', name: 'Groceries', parentId: 'FOOD_AND_DRINK', isCustom: true, isHidden: false, isRollover: false, isIncome: false },

    // Transfer categories
    { id: 'TRANSFER_IN', name: 'Transfer In', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false },
    { id: 'TRANSFER_OUT', name: 'Transfer Out', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: false },

    // Custom non-income categories
    { id: 'CUSTOM_ENTERTAINMENT', name: 'Entertainment', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false },
  ];

  describe('Legacy Functions (deprecated)', () => {
    describe('isIncomeCategory', () => {
      test('should return true for categories starting with INCOME', () => {
        expect(isIncomeCategory('INCOME')).toBe(true);
        expect(isIncomeCategory('INCOME_WAGES')).toBe(true);
        expect(isIncomeCategory('INCOME_DIVIDENDS')).toBe(true);
      });

      test('should return false for non-income categories', () => {
        expect(isIncomeCategory('CUSTOM_SALARY')).toBe(false);
        expect(isIncomeCategory('FOOD_AND_DRINK')).toBe(false);
        expect(isIncomeCategory('TRANSFER_IN')).toBe(false);
      });
    });

    describe('isExpenseCategory', () => {
      test('should return false for income categories', () => {
        expect(isExpenseCategory('INCOME')).toBe(false);
        expect(isExpenseCategory('INCOME_WAGES')).toBe(false);
      });

      test('should return false for transfer categories', () => {
        expect(isExpenseCategory('TRANSFER_IN')).toBe(false);
        expect(isExpenseCategory('TRANSFER_OUT')).toBe(false);
      });

      test('should return true for expense categories', () => {
        expect(isExpenseCategory('FOOD_AND_DRINK')).toBe(true);
        expect(isExpenseCategory('CUSTOM_GROCERIES')).toBe(true);
        expect(isExpenseCategory('CUSTOM_ENTERTAINMENT')).toBe(true);
      });
    });
  });

  describe('Transfer Category Detection', () => {
    describe('isTransferCategory', () => {
      test('should return true for transfer categories', () => {
        expect(isTransferCategory('TRANSFER_IN')).toBe(true);
        expect(isTransferCategory('TRANSFER_OUT')).toBe(true);
      });

      test('should return false for non-transfer categories', () => {
        expect(isTransferCategory('INCOME')).toBe(false);
        expect(isTransferCategory('FOOD_AND_DRINK')).toBe(false);
        expect(isTransferCategory('CUSTOM_SALARY')).toBe(false);
      });
    });
  });

  describe('Category Lookup Utilities', () => {
    describe('createCategoryLookup', () => {
      test('should create a Map with category ID as key', () => {
        const lookup = createCategoryLookup(mockCategories);
        
        expect(lookup).toBeInstanceOf(Map);
        expect(lookup.size).toBe(mockCategories.length);
        expect(lookup.get('INCOME')?.name).toBe('Income');
        expect(lookup.get('CUSTOM_SALARY')?.parentId).toBe('INCOME');
      });

      test('should handle empty categories array', () => {
        const lookup = createCategoryLookup([]);
        
        expect(lookup).toBeInstanceOf(Map);
        expect(lookup.size).toBe(0);
      });
    });
  });

  describe('Hierarchical Income Detection', () => {
    let categoryLookup: Map<string, Category>;

    beforeEach(() => {
      categoryLookup = createCategoryLookup(mockCategories);
    });

    describe('isIncomeCategoryHierarchical', () => {
      test('should return true for root income categories', () => {
        expect(isIncomeCategoryHierarchical('INCOME', categoryLookup)).toBe(true);
        expect(isIncomeCategoryHierarchical('INCOME_WAGES', categoryLookup)).toBe(true);
      });

      test('should return true for custom income subcategories', () => {
        expect(isIncomeCategoryHierarchical('CUSTOM_SALARY', categoryLookup)).toBe(true);
        expect(isIncomeCategoryHierarchical('CUSTOM_FREELANCE', categoryLookup)).toBe(true);
      });

      test('should return true for deeply nested income categories', () => {
        expect(isIncomeCategoryHierarchical('CUSTOM_BONUS', categoryLookup)).toBe(true);
      });

      test('should return false for non-income categories', () => {
        expect(isIncomeCategoryHierarchical('FOOD_AND_DRINK', categoryLookup)).toBe(false);
        expect(isIncomeCategoryHierarchical('FOOD_AND_DRINK_COFFEE', categoryLookup)).toBe(false);
        expect(isIncomeCategoryHierarchical('CUSTOM_GROCERIES', categoryLookup)).toBe(false);
        expect(isIncomeCategoryHierarchical('CUSTOM_ENTERTAINMENT', categoryLookup)).toBe(false);
      });

      test('should return false for transfer categories', () => {
        expect(isIncomeCategoryHierarchical('TRANSFER_IN', categoryLookup)).toBe(false);
        expect(isIncomeCategoryHierarchical('TRANSFER_OUT', categoryLookup)).toBe(false);
      });

      test('should handle non-existent categories gracefully', () => {
        expect(isIncomeCategoryHierarchical('NON_EXISTENT', categoryLookup)).toBe(false);
      });

      test('should prevent infinite loops with circular references', () => {
        // Create a circular reference scenario
        const circularCategories: Category[] = [
          { id: 'A', name: 'Category A', parentId: 'B', isCustom: true, isHidden: false, isRollover: false, isIncome: false },
          { id: 'B', name: 'Category B', parentId: 'A', isCustom: true, isHidden: false, isRollover: false, isIncome: false },
        ];
        const circularLookup = createCategoryLookup(circularCategories);
        
        expect(isIncomeCategoryHierarchical('A', circularLookup)).toBe(false);
        expect(isIncomeCategoryHierarchical('B', circularLookup)).toBe(false);
      });
    });

    describe('isExpenseCategoryHierarchical', () => {
      test('should return false for income categories and subcategories', () => {
        expect(isExpenseCategoryHierarchical('INCOME', categoryLookup)).toBe(false);
        expect(isExpenseCategoryHierarchical('INCOME_WAGES', categoryLookup)).toBe(false);
        expect(isExpenseCategoryHierarchical('CUSTOM_SALARY', categoryLookup)).toBe(false);
        expect(isExpenseCategoryHierarchical('CUSTOM_BONUS', categoryLookup)).toBe(false);
      });

      test('should return false for transfer categories', () => {
        expect(isExpenseCategoryHierarchical('TRANSFER_IN', categoryLookup)).toBe(false);
        expect(isExpenseCategoryHierarchical('TRANSFER_OUT', categoryLookup)).toBe(false);
      });

      test('should return true for expense categories', () => {
        expect(isExpenseCategoryHierarchical('FOOD_AND_DRINK', categoryLookup)).toBe(true);
        expect(isExpenseCategoryHierarchical('FOOD_AND_DRINK_COFFEE', categoryLookup)).toBe(true);
        expect(isExpenseCategoryHierarchical('CUSTOM_GROCERIES', categoryLookup)).toBe(true);
        expect(isExpenseCategoryHierarchical('CUSTOM_ENTERTAINMENT', categoryLookup)).toBe(true);
      });
    });
  });

  describe('Convenience Functions (with categories array)', () => {
    describe('isIncomeCategoryWithCategories', () => {
      test('should work with categories array instead of lookup', () => {
        expect(isIncomeCategoryWithCategories('INCOME', mockCategories)).toBe(true);
        expect(isIncomeCategoryWithCategories('CUSTOM_SALARY', mockCategories)).toBe(true);
        expect(isIncomeCategoryWithCategories('CUSTOM_BONUS', mockCategories)).toBe(true);
        expect(isIncomeCategoryWithCategories('FOOD_AND_DRINK', mockCategories)).toBe(false);
      });
    });

    describe('isExpenseCategoryWithCategories', () => {
      test('should work with categories array instead of lookup', () => {
        expect(isExpenseCategoryWithCategories('INCOME', mockCategories)).toBe(false);
        expect(isExpenseCategoryWithCategories('CUSTOM_SALARY', mockCategories)).toBe(false);
        expect(isExpenseCategoryWithCategories('TRANSFER_IN', mockCategories)).toBe(false);
        expect(isExpenseCategoryWithCategories('FOOD_AND_DRINK', mockCategories)).toBe(true);
        expect(isExpenseCategoryWithCategories('CUSTOM_GROCERIES', mockCategories)).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty lookup map', () => {
      const emptyLookup = new Map<string, Category>();
      
      // If a category doesn't exist in the lookup, it should not be considered income
      expect(isIncomeCategoryHierarchical('INCOME', emptyLookup)).toBe(false);
      // Non-existent categories should default to being expense categories  
      expect(isExpenseCategoryHierarchical('FOOD_AND_DRINK', emptyLookup)).toBe(true);
    });

    test('should handle categories with null parentId', () => {
      const rootCategories: Category[] = [
        { id: 'ROOT_EXPENSE', name: 'Root Expense', parentId: null, isCustom: true, isHidden: false, isRollover: false, isIncome: false },
      ];
      const lookup = createCategoryLookup(rootCategories);
      
      expect(isIncomeCategoryHierarchical('ROOT_EXPENSE', lookup)).toBe(false);
      expect(isExpenseCategoryHierarchical('ROOT_EXPENSE', lookup)).toBe(true);
    });

    test('should handle orphaned categories (parent not found)', () => {
      const orphanedCategories: Category[] = [
        { id: 'ORPHAN', name: 'Orphaned Category', parentId: 'MISSING_PARENT', isCustom: true, isHidden: false, isRollover: false, isIncome: false },
      ];
      const lookup = createCategoryLookup(orphanedCategories);
      
      expect(isIncomeCategoryHierarchical('ORPHAN', lookup)).toBe(false);
      expect(isExpenseCategoryHierarchical('ORPHAN', lookup)).toBe(true);
    });
  });

  describe('Performance', () => {
    test('should handle large category hierarchies efficiently', () => {
      // Create a deep hierarchy: INCOME -> Level1 -> Level2 -> ... -> Level10
      const deepCategories: Category[] = [
        { id: 'INCOME', name: 'Income', parentId: null, isCustom: false, isHidden: false, isRollover: false, isIncome: true }
      ];
      
      let parentId = 'INCOME';
      for (let i = 1; i <= 10; i++) {
        const categoryId = `LEVEL_${i}`;
        deepCategories.push({
          id: categoryId,
          name: `Level ${i}`,
          parentId,
          isCustom: true,
          isHidden: false,
          isRollover: false,
          isIncome: false
        });
        parentId = categoryId;
      }
      
      const lookup = createCategoryLookup(deepCategories);
      
      // Should efficiently detect income category at any level
      expect(isIncomeCategoryHierarchical('LEVEL_10', lookup)).toBe(true);
      expect(isIncomeCategoryHierarchical('LEVEL_5', lookup)).toBe(true);
      expect(isIncomeCategoryHierarchical('LEVEL_1', lookup)).toBe(true);
    });
  });
});