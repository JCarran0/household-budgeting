import { CategoryService } from '../categoryService';
import { InMemoryDataService } from '../dataService';
import { Category } from '../../shared/types';
import { RolloverSubtreeConflictError, RolloverNotBudgetableError } from '../../errors';

describe('CategoryService', () => {
  let categoryService: CategoryService;
  let dataService: InMemoryDataService;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    // Create in-memory data service for testing
    dataService = new InMemoryDataService();
    
    // Initialize category service
    categoryService = new CategoryService(dataService);
  });

  describe('Category CRUD Operations', () => {
    it('should create a new parent category', async () => {
      const newCategory = {
        name: 'Transportation',
        parentId: null,
        isHidden: false,
        isRollover: false
      };

      const category = await categoryService.createCategory(newCategory, testUserId);

      expect(category).toMatchObject({
        ...newCategory,
        id: expect.any(String)
      });
      
      // Verify category was saved
      const savedCategories = await dataService.getCategories(testUserId);
      expect(savedCategories).toHaveLength(1);
      expect(savedCategories[0]).toMatchObject(newCategory);
    });

    it('should create a subcategory under a parent', async () => {
      const parentCategory: Category = {
        id: 'parent-1',
        name: 'Transportation',
        parentId: null,
        isHidden: false,
        isRollover: false,
        isCustom: true, isIncome: false, isSavings: false
      };

      const newSubcategory = {
        name: 'Gas & Fuel',
        parentId: 'parent-1',
        isHidden: false,
        isRollover: false
      };

      await dataService.saveCategories([parentCategory], testUserId);

      const subcategory = await categoryService.createCategory(newSubcategory, testUserId);

      expect(subcategory).toMatchObject({
        ...newSubcategory,
        id: expect.any(String)
      });
      
      // Verify both categories were saved
      const savedCategories = await dataService.getCategories(testUserId);
      expect(savedCategories).toHaveLength(2);
      expect(savedCategories[1]).toMatchObject(newSubcategory);
    });

    it('should throw error when creating subcategory with non-existent parent', async () => {
      const newSubcategory = {
        name: 'Gas & Fuel',
        parentId: 'non-existent',
        isHidden: false,
        isRollover: false
      };

      await expect(categoryService.createCategory(newSubcategory, testUserId))
        .rejects.toThrow('Parent category not found');
    });

    it('should throw error when creating subcategory under another subcategory', async () => {
      const parentCategory: Category = {
        id: 'parent-1',
        name: 'Transportation',
        parentId: null,
        isHidden: false,
        isRollover: false,
        isCustom: true, isIncome: false, isSavings: false
      };

      const subcategory: Category = {
        id: 'sub-1',
        name: 'Gas',
        parentId: 'parent-1',
        isHidden: false,
        isRollover: false,
        isCustom: true, isIncome: false, isSavings: false
      };

      await dataService.saveCategories([parentCategory, subcategory], testUserId);

      const newSubSubcategory = {
        name: 'Premium Gas',
        parentId: 'sub-1', // Trying to create under a subcategory
        isHidden: false,
        isRollover: false
      };

      await expect(categoryService.createCategory(newSubSubcategory, testUserId))
        .rejects.toThrow('Cannot create subcategory under another subcategory');
    });

    it('should update an existing category', async () => {
      const existingCategory: Category = {
        id: 'cat-1',
        name: 'Transportation',
        parentId: null,
        isHidden: false,
        isRollover: false,
        isCustom: true, isIncome: false, isSavings: false
      };

      const updates = {
        name: 'Transport & Travel',
        isHidden: true
      };

      await dataService.saveCategories([existingCategory], testUserId);

      const updated = await categoryService.updateCategory('cat-1', updates, testUserId);

      expect(updated).toMatchObject({
        ...existingCategory,
        ...updates
      });
      
      // Verify category was updated
      const savedCategories = await dataService.getCategories(testUserId);
      expect(savedCategories).toHaveLength(1);
      expect(savedCategories[0]).toMatchObject({
        ...existingCategory,
        ...updates
      });
    });

    it('should delete a category without subcategories', async () => {
      const categories: Category[] = [
        {
          id: 'cat-1',
          name: 'Transportation',
          parentId: null,
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'cat-2',
          name: 'Food',
          parentId: null,
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        }
      ];

      await dataService.saveCategories(categories, testUserId);

      await categoryService.deleteCategory('cat-1', testUserId);

      // Verify only Food category remains
      const remainingCategories = await dataService.getCategories(testUserId);
      expect(remainingCategories).toHaveLength(1);
      expect(remainingCategories[0]).toEqual(categories[1]);
    });

    it('should reject deletion of a parent category that has subcategories', async () => {
      const categories: Category[] = [
        {
          id: 'parent-1',
          name: 'Transportation',
          parentId: null,
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'sub-2',
          name: 'Parking',
          parentId: 'parent-1',
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'cat-2',
          name: 'Food',
          parentId: null,
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        }
      ];

      await dataService.saveCategories(categories, testUserId);

      // Deletion of a parent with subcategories is now blocked to prevent
      // orphaned subcategories. Subcategories must be deleted first.
      await expect(categoryService.deleteCategory('parent-1', testUserId))
        .rejects.toThrow('Cannot delete category with subcategories');

      // Verify all categories remain untouched
      const remainingCategories = await dataService.getCategories(testUserId);
      expect(remainingCategories).toHaveLength(4);
    });
  });

  describe('Category Hierarchy', () => {
    it('should get all parent categories', async () => {
      const categories: Category[] = [
        {
          id: 'parent-1',
          name: 'Transportation',
          parentId: null,
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'parent-2',
          name: 'Food',
          parentId: null,
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        }
      ];

      await dataService.saveCategories(categories, testUserId);

      const parents = await categoryService.getParentCategories(testUserId);

      expect(parents).toHaveLength(2);
      expect(parents).toEqual([categories[0], categories[2]]);
    });

    it('should get subcategories for a parent', async () => {
      const categories: Category[] = [
        {
          id: 'parent-1',
          name: 'Transportation',
          parentId: null,
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'sub-2',
          name: 'Parking',
          parentId: 'parent-1',
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'sub-3',
          name: 'Groceries',
          parentId: 'parent-2',
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        }
      ];

      await dataService.saveCategories(categories, testUserId);

      const subcategories = await categoryService.getSubcategories('parent-1', testUserId);

      expect(subcategories).toHaveLength(2);
      expect(subcategories).toEqual([categories[1], categories[2]]);
    });

    it('should build category tree structure', async () => {
      const categories: Category[] = [
        {
          id: 'parent-1',
          name: 'Transportation',
          parentId: null,
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        }
      ];

      await dataService.saveCategories(categories, testUserId);

      const tree = await categoryService.getCategoryTree(testUserId);

      expect(tree).toEqual([
        {
          ...categories[0],
          children: [categories[1]]
        }
      ]);
    });
  });

  describe('Special Category Flags', () => {
    it('should get all hidden categories', async () => {
      const categories: Category[] = [
        {
          id: 'cat-1',
          name: 'Transportation',
          parentId: null,
            isHidden: true,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'cat-2',
          name: 'Food',
          parentId: null,
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'cat-3',
          name: 'Internal Transfers',
          parentId: null,
            isHidden: true,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        }
      ];

      await dataService.saveCategories(categories, testUserId);

      const hidden = await categoryService.getHiddenCategories(testUserId);

      expect(hidden).toHaveLength(2);
      expect(hidden).toEqual([categories[0], categories[2]]);
    });

    it('should get all savings categories', async () => {
      const categories: Category[] = [
        {
          id: 'cat-1',
          name: 'Emergency Fund',
          parentId: null,
            isHidden: false,
          isRollover: true,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'cat-2',
          name: 'Vacation Savings',
          parentId: null,
            isHidden: false,
          isRollover: true,
          isCustom: true, isIncome: false, isSavings: false
        },
        {
          id: 'cat-3',
          name: 'Food',
          parentId: null,
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false, isSavings: false
        }
      ];

      await dataService.saveCategories(categories, testUserId);

      const savings = await categoryService.getRolloverCategories(testUserId);

      expect(savings).toHaveLength(2);
      expect(savings).toEqual([categories[0], categories[1]]);
    });
  });

  describe('Default Categories', () => {
    it('should not create any categories when none exist (users manage their own taxonomy)', async () => {
      // initializeDefaultCategories is now a no-op — users create their own category taxonomy
      // rather than seeding with defaults. The method is kept for backward compatibility.
      await categoryService.initializeDefaultCategories(testUserId);

      const savedCategories = await dataService.getCategories(testUserId);
      expect(savedCategories).toHaveLength(0);
    });

    it('should not initialize default categories if some already exist', async () => {
      const existingCategory: Category = {
        id: 'cat-1',
        name: 'Custom Category',
        parentId: null,
        isHidden: false,
        isRollover: false,
        isCustom: true, isIncome: false, isSavings: false
      };

      await dataService.saveCategories([existingCategory], testUserId);

      await categoryService.initializeDefaultCategories(testUserId);

      // Verify no additional categories were created
      const categories = await dataService.getCategories(testUserId);
      expect(categories).toHaveLength(1);
      expect(categories[0]).toEqual(existingCategory);
    });
  });

  describe('Rollover subtree exclusivity (ROLLOVER-BUDGETS-BRD §3.2, REQ-019)', () => {
    // Each test seeds a parent + child, flips one or the other's isRollover,
    // then exercises the guarded update path on categoryService.updateCategory.
    const parent: Category = {
      id: 'FOOD_AND_DRINK', name: 'Food and Drink', parentId: null,
      isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    };
    const childA: Category = {
      id: 'CUSTOM_GROCERIES', name: 'Groceries', parentId: 'FOOD_AND_DRINK',
      isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    };
    const childB: Category = {
      id: 'CUSTOM_RESTAURANTS', name: 'Restaurants', parentId: 'FOOD_AND_DRINK',
      isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    };
    const sibling: Category = {
      id: 'ENTERTAINMENT', name: 'Entertainment', parentId: null,
      isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    };

    it('rejects flagging parent when a child is already flagged — descendant conflict', async () => {
      await dataService.saveCategories(
        [parent, { ...childA, isRollover: true }, childB],
        testUserId,
      );

      await expect(
        categoryService.updateCategory('FOOD_AND_DRINK', { isRollover: true }, testUserId),
      ).rejects.toMatchObject({
        code: 'ROLLOVER_SUBTREE_CONFLICT',
        details: { conflictingCategoryIds: ['CUSTOM_GROCERIES'], relation: 'descendant' },
      });

      // Neither target nor peer changed
      const stored = await dataService.getCategories(testUserId);
      expect(stored.find(c => c.id === 'FOOD_AND_DRINK')!.isRollover).toBe(false);
      expect(stored.find(c => c.id === 'CUSTOM_GROCERIES')!.isRollover).toBe(true);
    });

    it('rejects flagging a child when its parent is already flagged — ancestor conflict', async () => {
      await dataService.saveCategories(
        [{ ...parent, isRollover: true }, childA],
        testUserId,
      );

      await expect(
        categoryService.updateCategory('CUSTOM_GROCERIES', { isRollover: true }, testUserId),
      ).rejects.toMatchObject({
        code: 'ROLLOVER_SUBTREE_CONFLICT',
        details: { conflictingCategoryIds: ['FOOD_AND_DRINK'], relation: 'ancestor' },
      });
    });

    it('allows flagging a sibling when an unrelated sibling is flagged', async () => {
      await dataService.saveCategories([parent, sibling], testUserId);

      const result = await categoryService.updateCategory(
        'ENTERTAINMENT',
        { isRollover: true },
        testUserId,
      );
      expect(result.isRollover).toBe(true);
    });

    it('allows re-update of an already-flagged category (self no-op)', async () => {
      await dataService.saveCategories([parent, { ...childA, isRollover: true }], testUserId);

      const result = await categoryService.updateCategory(
        'CUSTOM_GROCERIES',
        { isRollover: true, name: 'Grocery' },
        testUserId,
      );
      expect(result.isRollover).toBe(true);
      expect(result.name).toBe('Grocery');
    });

    it('rejects flagging a transfer category — ROLLOVER_NOT_BUDGETABLE', async () => {
      const transfer: Category = {
        id: 'TRANSFER_OUT_SAVINGS', name: 'Transfer Out', parentId: null,
        isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
      };
      await dataService.saveCategories([transfer], testUserId);

      await expect(
        categoryService.updateCategory('TRANSFER_OUT_SAVINGS', { isRollover: true }, testUserId),
      ).rejects.toBeInstanceOf(RolloverNotBudgetableError);
    });

    it('flags parent atomically with resolveRolloverConflicts=true — children unflagged', async () => {
      await dataService.saveCategories(
        [parent, { ...childA, isRollover: true }, { ...childB, isRollover: true }],
        testUserId,
      );

      const result = await categoryService.updateCategory(
        'FOOD_AND_DRINK',
        { isRollover: true, resolveRolloverConflicts: true },
        testUserId,
      );
      expect(result.isRollover).toBe(true);

      const stored = await dataService.getCategories(testUserId);
      expect(stored.find(c => c.id === 'FOOD_AND_DRINK')!.isRollover).toBe(true);
      expect(stored.find(c => c.id === 'CUSTOM_GROCERIES')!.isRollover).toBe(false);
      expect(stored.find(c => c.id === 'CUSTOM_RESTAURANTS')!.isRollover).toBe(false);
    });

    it('flags child atomically with resolveRolloverConflicts=true — parent unflagged', async () => {
      await dataService.saveCategories(
        [{ ...parent, isRollover: true }, childA],
        testUserId,
      );

      const result = await categoryService.updateCategory(
        'CUSTOM_GROCERIES',
        { isRollover: true, resolveRolloverConflicts: true },
        testUserId,
      );
      expect(result.isRollover).toBe(true);

      const stored = await dataService.getCategories(testUserId);
      expect(stored.find(c => c.id === 'FOOD_AND_DRINK')!.isRollover).toBe(false);
      expect(stored.find(c => c.id === 'CUSTOM_GROCERIES')!.isRollover).toBe(true);
    });

    it('does not persist resolveRolloverConflicts onto the Category record', async () => {
      await dataService.saveCategories([parent], testUserId);

      const result = await categoryService.updateCategory(
        'FOOD_AND_DRINK',
        { isRollover: true, resolveRolloverConflicts: true },
        testUserId,
      );
      expect(result).not.toHaveProperty('resolveRolloverConflicts');
      const stored = await dataService.getCategories(testUserId);
      expect(stored[0]).not.toHaveProperty('resolveRolloverConflicts');
    });

    it('structured payload shape matches the frontend contract', async () => {
      await dataService.saveCategories(
        [parent, { ...childA, isRollover: true }],
        testUserId,
      );
      try {
        await categoryService.updateCategory('FOOD_AND_DRINK', { isRollover: true }, testUserId);
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RolloverSubtreeConflictError);
        const e = err as RolloverSubtreeConflictError;
        expect(e.code).toBe('ROLLOVER_SUBTREE_CONFLICT');
        expect(e.statusCode).toBe(400);
        expect(e.details).toEqual({
          conflictingCategoryIds: ['CUSTOM_GROCERIES'],
          relation: 'descendant',
        });
      }
    });

    it('unflagging a category always succeeds — validation only runs when setting to true', async () => {
      await dataService.saveCategories(
        [{ ...parent, isRollover: true }, { ...childA, isRollover: true }], // already invalid
        testUserId,
      );

      // Unflagging the parent should be allowed even though the state is invalid —
      // this is how users resolve legacy conflicts without the atomic flag.
      const result = await categoryService.updateCategory(
        'FOOD_AND_DRINK',
        { isRollover: false },
        testUserId,
      );
      expect(result.isRollover).toBe(false);
    });
  });
});