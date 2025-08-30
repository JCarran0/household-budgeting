import { CategoryService } from '../categoryService';
import { InMemoryDataService } from '../dataService';
import { Category } from '../../../../shared/types';

describe('CategoryService', () => {
  let categoryService: CategoryService;
  let dataService: InMemoryDataService;

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
        plaidCategory: 'TRANSPORTATION',
        isHidden: false,
        isSavings: false
      };

      const category = await categoryService.createCategory(newCategory);

      expect(category).toMatchObject({
        ...newCategory,
        id: expect.any(String)
      });
      
      // Verify category was saved
      const savedCategories = await dataService.getCategories();
      expect(savedCategories).toHaveLength(1);
      expect(savedCategories[0]).toMatchObject(newCategory);
    });

    it('should create a subcategory under a parent', async () => {
      const parentCategory: Category = {
        id: 'parent-1',
        name: 'Transportation',
        parentId: null,
        plaidCategory: 'TRANSPORTATION',
        isHidden: false,
        isSavings: false
      };

      const newSubcategory = {
        name: 'Gas & Fuel',
        parentId: 'parent-1',
        plaidCategory: 'TRANSPORTATION_GAS',
        isHidden: false,
        isSavings: false
      };

      await dataService.saveCategories([parentCategory]);

      const subcategory = await categoryService.createCategory(newSubcategory);

      expect(subcategory).toMatchObject({
        ...newSubcategory,
        id: expect.any(String)
      });
      
      // Verify both categories were saved
      const savedCategories = await dataService.getCategories();
      expect(savedCategories).toHaveLength(2);
      expect(savedCategories[1]).toMatchObject(newSubcategory);
    });

    it('should throw error when creating subcategory with non-existent parent', async () => {
      const newSubcategory = {
        name: 'Gas & Fuel',
        parentId: 'non-existent',
        plaidCategory: 'TRANSPORTATION_GAS',
        isHidden: false,
        isSavings: false
      };

      await expect(categoryService.createCategory(newSubcategory))
        .rejects.toThrow('Parent category not found');
    });

    it('should throw error when creating subcategory under another subcategory', async () => {
      const parentCategory: Category = {
        id: 'parent-1',
        name: 'Transportation',
        parentId: null,
        plaidCategory: 'TRANSPORTATION',
        isHidden: false,
        isSavings: false
      };

      const subcategory: Category = {
        id: 'sub-1',
        name: 'Gas',
        parentId: 'parent-1',
        plaidCategory: 'TRANSPORTATION_GAS',
        isHidden: false,
        isSavings: false
      };

      await dataService.saveCategories([parentCategory, subcategory]);

      const newSubSubcategory = {
        name: 'Premium Gas',
        parentId: 'sub-1', // Trying to create under a subcategory
        plaidCategory: null,
        isHidden: false,
        isSavings: false
      };

      await expect(categoryService.createCategory(newSubSubcategory))
        .rejects.toThrow('Cannot create subcategory under another subcategory');
    });

    it('should update an existing category', async () => {
      const existingCategory: Category = {
        id: 'cat-1',
        name: 'Transportation',
        parentId: null,
        plaidCategory: 'TRANSPORTATION',
        isHidden: false,
        isSavings: false
      };

      const updates = {
        name: 'Transport & Travel',
        isHidden: true
      };

      await dataService.saveCategories([existingCategory]);

      const updated = await categoryService.updateCategory('cat-1', updates);

      expect(updated).toMatchObject({
        ...existingCategory,
        ...updates
      });
      
      // Verify category was updated
      const savedCategories = await dataService.getCategories();
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
          plaidCategory: 'TRANSPORTATION',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'cat-2',
          name: 'Food',
          parentId: null,
          plaidCategory: 'FOOD',
          isHidden: false,
          isSavings: false
        }
      ];

      await dataService.saveCategories(categories);

      await categoryService.deleteCategory('cat-1');

      // Verify only Food category remains
      const remainingCategories = await dataService.getCategories();
      expect(remainingCategories).toHaveLength(1);
      expect(remainingCategories[0]).toEqual(categories[1]);
    });

    it('should delete a parent category and all its subcategories', async () => {
      const categories: Category[] = [
        {
          id: 'parent-1',
          name: 'Transportation',
          parentId: null,
          plaidCategory: 'TRANSPORTATION',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
          plaidCategory: 'TRANSPORTATION_GAS',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'sub-2',
          name: 'Parking',
          parentId: 'parent-1',
          plaidCategory: 'TRANSPORTATION_PARKING',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'cat-2',
          name: 'Food',
          parentId: null,
          plaidCategory: 'FOOD',
          isHidden: false,
          isSavings: false
        }
      ];

      await dataService.saveCategories(categories);

      await categoryService.deleteCategory('parent-1');

      // Verify only Food category remains
      const remainingCategories = await dataService.getCategories();
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
          plaidCategory: 'TRANSPORTATION',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
          plaidCategory: 'TRANSPORTATION_GAS',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'parent-2',
          name: 'Food',
          parentId: null,
          plaidCategory: 'FOOD',
          isHidden: false,
          isSavings: false
        }
      ];

      await dataService.saveCategories(categories);

      const parents = await categoryService.getParentCategories();

      expect(parents).toHaveLength(2);
      expect(parents).toEqual([categories[0], categories[2]]);
    });

    it('should get subcategories for a parent', async () => {
      const categories: Category[] = [
        {
          id: 'parent-1',
          name: 'Transportation',
          parentId: null,
          plaidCategory: 'TRANSPORTATION',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
          plaidCategory: 'TRANSPORTATION_GAS',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'sub-2',
          name: 'Parking',
          parentId: 'parent-1',
          plaidCategory: 'TRANSPORTATION_PARKING',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'sub-3',
          name: 'Groceries',
          parentId: 'parent-2',
          plaidCategory: 'FOOD_GROCERIES',
          isHidden: false,
          isSavings: false
        }
      ];

      await dataService.saveCategories(categories);

      const subcategories = await categoryService.getSubcategories('parent-1');

      expect(subcategories).toHaveLength(2);
      expect(subcategories).toEqual([categories[1], categories[2]]);
    });

    it('should build category tree structure', async () => {
      const categories: Category[] = [
        {
          id: 'parent-1',
          name: 'Transportation',
          parentId: null,
          plaidCategory: 'TRANSPORTATION',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'sub-1',
          name: 'Gas',
          parentId: 'parent-1',
          plaidCategory: 'TRANSPORTATION_GAS',
          isHidden: false,
          isSavings: false
        }
      ];

      await dataService.saveCategories(categories);

      const tree = await categoryService.getCategoryTree();

      expect(tree).toEqual([
        {
          ...categories[0],
          children: [categories[1]]
        }
      ]);
    });
  });

  describe('Plaid Category Mapping', () => {
    it('should find category by Plaid category string', async () => {
      const categories: Category[] = [
        {
          id: 'cat-1',
          name: 'Transportation',
          parentId: null,
          plaidCategory: 'TRANSPORTATION',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'cat-2',
          name: 'Gas',
          parentId: 'cat-1',
          plaidCategory: 'TRANSPORTATION_GAS',
          isHidden: false,
          isSavings: false
        }
      ];

      await dataService.saveCategories(categories);

      const category = await categoryService.findByPlaidCategory('TRANSPORTATION_GAS');

      expect(category).toEqual(categories[1]);
    });

    it('should return null when Plaid category not found', async () => {
      const category = await categoryService.findByPlaidCategory('NON_EXISTENT');

      expect(category).toBeNull();
    });

    it('should map Plaid categories to custom categories', async () => {
      const categories: Category[] = [
        {
          id: 'cat-1',
          name: 'Transportation',
          parentId: null,
          plaidCategory: 'TRANSPORTATION',
          isHidden: false,
          isSavings: false
        }
      ];

      await dataService.saveCategories(categories);

      const mapping = await categoryService.getPlaidCategoryMapping();

      expect(mapping).toEqual({
        'TRANSPORTATION': 'cat-1'
      });
    });
  });

  describe('Special Category Flags', () => {
    it('should get all hidden categories', async () => {
      const categories: Category[] = [
        {
          id: 'cat-1',
          name: 'Transportation',
          parentId: null,
          plaidCategory: 'TRANSPORTATION',
          isHidden: true,
          isSavings: false
        },
        {
          id: 'cat-2',
          name: 'Food',
          parentId: null,
          plaidCategory: 'FOOD',
          isHidden: false,
          isSavings: false
        },
        {
          id: 'cat-3',
          name: 'Internal Transfers',
          parentId: null,
          plaidCategory: null,
          isHidden: true,
          isSavings: false
        }
      ];

      await dataService.saveCategories(categories);

      const hidden = await categoryService.getHiddenCategories();

      expect(hidden).toHaveLength(2);
      expect(hidden).toEqual([categories[0], categories[2]]);
    });

    it('should get all savings categories', async () => {
      const categories: Category[] = [
        {
          id: 'cat-1',
          name: 'Emergency Fund',
          parentId: null,
          plaidCategory: null,
          isHidden: false,
          isSavings: true
        },
        {
          id: 'cat-2',
          name: 'Vacation Savings',
          parentId: null,
          plaidCategory: null,
          isHidden: false,
          isSavings: true
        },
        {
          id: 'cat-3',
          name: 'Food',
          parentId: null,
          plaidCategory: 'FOOD',
          isHidden: false,
          isSavings: false
        }
      ];

      await dataService.saveCategories(categories);

      const savings = await categoryService.getSavingsCategories();

      expect(savings).toHaveLength(2);
      expect(savings).toEqual([categories[0], categories[1]]);
    });
  });

  describe('Default Categories', () => {
    it('should initialize default categories if none exist', async () => {
      await categoryService.initializeDefaultCategories();

      // Verify default categories were created
      const savedCategories = await dataService.getCategories();
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
          expect.objectContaining({ name: 'Savings', parentId: null, isSavings: true }),
          expect.objectContaining({ name: 'Transfers', parentId: null, isHidden: true })
        ])
      );
    });

    it('should not initialize default categories if some already exist', async () => {
      const existingCategory: Category = {
        id: 'cat-1',
        name: 'Custom Category',
        parentId: null,
        plaidCategory: null,
        isHidden: false,
        isSavings: false
      };

      await dataService.saveCategories([existingCategory]);

      await categoryService.initializeDefaultCategories();

      // Verify no additional categories were created
      const categories = await dataService.getCategories();
      expect(categories).toHaveLength(1);
      expect(categories[0]).toEqual(existingCategory);
    });
  });
});