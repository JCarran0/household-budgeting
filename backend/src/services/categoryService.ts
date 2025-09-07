import { Category } from '../../../shared/types';
import { DataService } from './dataService';
import { PLAID_CATEGORIES } from '../constants/plaidCategories';
import { BudgetService } from './budgetService';
import { AutoCategorizeService } from './autoCategorizeService';
import { TransactionService } from './transactionService';

export interface CategoryWithChildren extends Category {
  children?: Category[];
}

export interface CreateCategoryDto {
  name: string;
  parentId: string | null;
  description?: string;
  isHidden: boolean;
  isSavings: boolean;
}

export interface UpdateCategoryDto {
  name?: string;
  description?: string;
  isHidden?: boolean;
  isSavings?: boolean;
}

export class CategoryService {
  constructor(
    private dataService: DataService,
    private budgetService?: BudgetService,
    private autoCategorizeService?: AutoCategorizeService,
    private transactionService?: TransactionService
  ) {}

  /**
   * Generate a SNAKE_CASE ID for custom categories
   */
  private generateCategoryId(name: string, existingIds: string[]): string {
    // Convert name to SNAKE_CASE with CUSTOM_ prefix
    const baseId = `CUSTOM_${name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')}`;
    
    // If base ID doesn't exist, use it
    if (!existingIds.includes(baseId)) {
      return baseId;
    }
    
    // If it exists, append a number
    let counter = 2;
    while (existingIds.includes(`${baseId}_${counter}`)) {
      counter++;
    }
    return `${baseId}_${counter}`;
  }

  async getAllCategories(userId: string): Promise<Category[]> {
    return this.dataService.getCategories(userId);
  }

  async getCategoryById(id: string, userId: string): Promise<Category | null> {
    const categories = await this.dataService.getCategories(userId);
    return categories.find(cat => cat.id === id) || null;
  }

  async createCategory(data: CreateCategoryDto, userId: string): Promise<Category> {
    const categories = await this.dataService.getCategories(userId);

    // Validate name is not empty
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Category name is required');
    }

    // Check for duplicate names at the same level
    const duplicateExists = categories.some(cat => 
      cat.name === data.name && cat.parentId === data.parentId
    );
    if (duplicateExists) {
      throw new Error('Category name already exists at this level');
    }

    // Validate parent exists if parentId is provided
    if (data.parentId) {
      const parent = categories.find(cat => cat.id === data.parentId);
      if (!parent) {
        throw new Error('Parent category not found');
      }
      // Ensure parent is not a subcategory (enforce two-level hierarchy)
      if (parent.parentId !== null) {
        throw new Error('Cannot create subcategory under another subcategory');
      }
    }

    // Generate SNAKE_CASE ID for the new category
    const existingIds = categories.map(c => c.id);
    const categoryId = this.generateCategoryId(data.name, existingIds);

    const newCategory: Category = {
      id: categoryId,
      name: data.name,
      parentId: data.parentId,
      description: data.description || undefined,
      isCustom: true, // User-created categories are always custom
      isHidden: data.isHidden,
      isSavings: data.isSavings
    };

    categories.push(newCategory);
    await this.dataService.saveCategories(categories, userId);
    return newCategory;
  }

  async updateCategory(id: string, updates: UpdateCategoryDto, userId: string): Promise<Category> {
    const categories = await this.dataService.getCategories(userId);
    const index = categories.findIndex(cat => cat.id === id);

    if (index === -1) {
      throw new Error('Category not found');
    }

    const updatedCategory = {
      ...categories[index],
      ...updates
    };

    categories[index] = updatedCategory;
    await this.dataService.saveCategories(categories, userId);
    return updatedCategory;
  }

  async deleteCategory(id: string, userId: string): Promise<void> {
    const categories = await this.dataService.getCategories(userId);
    
    // Find the category to delete
    const categoryToDelete = categories.find(cat => cat.id === id);
    if (!categoryToDelete) {
      throw new Error('Category not found');
    }
    
    // Check if category has subcategories
    const hasSubcategories = categories.some(cat => cat.parentId === id);
    if (hasSubcategories) {
      throw new Error('Cannot delete category with subcategories');
    }
    
    // Check if category has associated budgets
    if (this.budgetService) {
      const hasBudgets = await this.budgetService.hasBudgetsForCategory(id, userId);
      if (hasBudgets) {
        throw new Error('Cannot delete category with active budgets. Please delete the budgets first.');
      }
    }
    
    // Check if category is used in auto-categorization rules
    if (this.autoCategorizeService) {
      const hasRules = await this.autoCategorizeService.hasRulesForCategory(id, userId);
      if (hasRules) {
        throw new Error('Cannot delete category used in auto-categorization rules. Please update or delete the rules first.');
      }
    }
    
    // Check if category has associated transactions
    if (this.transactionService) {
      const hasTransactions = await this.transactionService.hasTransactionsForCategory(id, userId);
      if (hasTransactions) {
        throw new Error('Cannot delete category with associated transactions. Please recategorize the transactions first.');
      }
    }
    
    // Remove the category
    const filteredCategories = categories.filter(cat => cat.id !== id);
    await this.dataService.saveCategories(filteredCategories, userId);
  }

  async getParentCategories(userId: string): Promise<Category[]> {
    const categories = await this.dataService.getCategories(userId);
    return categories.filter(cat => cat.parentId === null);
  }

  async getSubcategories(parentId: string, userId: string): Promise<Category[]> {
    const categories = await this.dataService.getCategories(userId);
    return categories.filter(cat => cat.parentId === parentId);
  }

  async getCategoryTree(userId: string): Promise<CategoryWithChildren[]> {
    const categories = await this.dataService.getCategories(userId);
    const parents = categories.filter(cat => cat.parentId === null);
    
    return parents.map(parent => ({
      ...parent,
      children: categories.filter(cat => cat.parentId === parent.id)
    }));
  }

  // Removed plaidCategory-related methods as they are no longer needed

  async getHiddenCategories(userId: string): Promise<Category[]> {
    const categories = await this.dataService.getCategories(userId);
    return categories.filter(cat => cat.isHidden);
  }

  async getSavingsCategories(userId: string): Promise<Category[]> {
    const categories = await this.dataService.getCategories(userId);
    return categories.filter(cat => cat.isSavings);
  }

  async initializeDefaultCategories(userId: string): Promise<void> {
    const categories = await this.dataService.getCategories(userId);
    
    // Only initialize if no categories exist
    if (categories.length > 0) {
      return;
    }

    const defaultCategories: Category[] = [];

    // Create all Plaid primary and subcategories
    Object.entries(PLAID_CATEGORIES).forEach(([primaryId, primary]) => {
      // Add primary category
      defaultCategories.push({
        id: primaryId,
        name: primary.name,
        parentId: null,
        description: undefined,
        isCustom: false,
        isHidden: ['TRANSFER_IN', 'TRANSFER_OUT'].includes(primaryId),
        isSavings: false
      });

      // Add all subcategories for this primary category
      Object.entries(primary.subcategories).forEach(([subcategoryId, subcategory]) => {
        defaultCategories.push({
          id: subcategoryId,
          name: subcategory.name,
          parentId: primaryId,
          description: subcategory.description,
          isCustom: false,
          isHidden: false,
          isSavings: false
        });
      });
    });

    // Add a custom Savings category that's not in Plaid taxonomy
    defaultCategories.push({
      id: 'CUSTOM_SAVINGS',
      name: 'Savings',
      parentId: null,
      description: 'Money set aside for future use',
      isCustom: true,
      isHidden: false,
      isSavings: true
    });

    await this.dataService.saveCategories(defaultCategories, userId);
  }

}

// Export singleton instance
let categoryServiceInstance: CategoryService | null = null;

export function getCategoryService(
  dataService?: DataService,
  budgetService?: BudgetService,
  autoCategorizeService?: AutoCategorizeService,
  transactionService?: TransactionService
): CategoryService {
  if (!categoryServiceInstance) {
    if (!dataService) {
      throw new Error('DataService must be provided when creating CategoryService instance');
    }
    categoryServiceInstance = new CategoryService(dataService, budgetService, autoCategorizeService, transactionService);
  }
  return categoryServiceInstance;
}