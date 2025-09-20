import { CategoryService } from '../categoryService';
import { InMemoryDataService } from '../dataService';
import { Category } from '../../shared/types';

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
        isCustom: true, isIncome: false
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
        isCustom: true, isIncome: false
      };

      const subcategory: Category = {
        id: 'sub-1',
        name: 'Gas',
        parentId: 'parent-1',
        isHidden: false,
        isRollover: false,
        isCustom: true, isIncome: false
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
        isCustom: true, isIncome: false
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
          isCustom: true, isIncome: false
        },
        {
          id: 'cat-2',
          name: 'Food',
          parentId: null,
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
        }
      ];

      await dataService.saveCategories(categories, testUserId);

      await categoryService.deleteCategory('cat-1', testUserId);

      // Verify only Food category remains
      const remainingCategories = await dataService.getCategories(testUserId);
      expect(remainingCategories).toHaveLength(1);
      expect(remainingCategories[0]).toEqual(categories[1]);
    });

    it('should delete a parent category and all its subcategories', async () => {
      const categories: Category[] = [
        {
          id: 'parent-1',
          name: 'Transportation',
          parentId: null,
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
        },
        {
          id: 'sub-2',
          name: 'Parking',
          parentId: 'parent-1',
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
        },
        {
          id: 'cat-2',
          name: 'Food',
          parentId: null,
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
        }
      ];

      await dataService.saveCategories(categories, testUserId);

      await categoryService.deleteCategory('parent-1', testUserId);

      // Verify only Food category remains
      const remainingCategories = await dataService.getCategories(testUserId);
      expect(remainingCategories).toHaveLength(1);
      expect(remainingCategories[0]).toEqual(categories[3]);
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
          isCustom: true, isIncome: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
        },
        {
          id: 'parent-2',
          name: 'Food',
          parentId: null,
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
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
          isCustom: true, isIncome: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
        },
        {
          id: 'sub-2',
          name: 'Parking',
          parentId: 'parent-1',
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
        },
        {
          id: 'sub-3',
          name: 'Groceries',
          parentId: 'parent-2',
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
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
          isCustom: true, isIncome: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
            isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
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
          isCustom: true, isIncome: false
        },
        {
          id: 'cat-2',
          name: 'Food',
          parentId: null,
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
        },
        {
          id: 'cat-3',
          name: 'Internal Transfers',
          parentId: null,
            isHidden: true,
          isRollover: false,
          isCustom: true, isIncome: false
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
          isCustom: true, isIncome: false
        },
        {
          id: 'cat-2',
          name: 'Vacation Savings',
          parentId: null,
            isHidden: false,
          isRollover: true,
          isCustom: true, isIncome: false
        },
        {
          id: 'cat-3',
          name: 'Food',
          parentId: null,
          isHidden: false,
          isRollover: false,
          isCustom: true, isIncome: false
        }
      ];

      await dataService.saveCategories(categories, testUserId);

      const savings = await categoryService.getRolloverCategories(testUserId);

      expect(savings).toHaveLength(2);
      expect(savings).toEqual([categories[0], categories[1]]);
    });
  });

  describe('Default Categories', () => {
    it('should initialize default categories if none exist', async () => {
      await categoryService.initializeDefaultCategories(testUserId);

      // Verify default categories were created
      const savedCategories = await dataService.getCategories(testUserId);
      expect(savedCategories).toHaveLength(12);
      expect(savedCategories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Income', parentId: null }),
          expect.objectContaining({ name: 'Housing', parentId: null }),
          expect.objectContaining({ name: 'Transportation', parentId: null }),
          expect.objectContaining({ name: 'Food & Dining', parentId: null }),
          expect.objectContaining({ name: 'Shopping', parentId: null }),
          expect.objectContaining({ name: 'Entertainment', parentId: null }),
          expect.objectContaining({ name: 'Bills & Utilities', parentId: null }),
          expect.objectContaining({ name: 'Healthcare', parentId: null }),
          expect.objectContaining({ name: 'Education', parentId: null }),
          expect.objectContaining({ name: 'Personal', parentId: null }),
          expect.objectContaining({ name: 'Savings', parentId: null, isRollover: true, isIncome: false }),
          expect.objectContaining({ name: 'Transfers', parentId: null, isHidden: true })
        ])
      );
    });

    it('should not initialize default categories if some already exist', async () => {
      const existingCategory: Category = {
        id: 'cat-1',
        name: 'Custom Category',
        parentId: null,
        isHidden: false,
        isRollover: false,
        isCustom: true, isIncome: false
      };

      await dataService.saveCategories([existingCategory], testUserId);

      await categoryService.initializeDefaultCategories(testUserId);

      // Verify no additional categories were created
      const categories = await dataService.getCategories(testUserId);
      expect(categories).toHaveLength(1);
      expect(categories[0]).toEqual(existingCategory);
    });
  });
});