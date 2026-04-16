import { Category } from '../shared/types';
import { DataService } from './dataService';
import { ImportService } from './importService';

/**
 * Interface for checking if a category has dependencies that prevent deletion.
 * This breaks the circular dependency between CategoryService and other services.
 */
export interface CategoryDependencyChecker {
  hasBudgetsForCategory(categoryId: string, familyId: string): Promise<boolean>;
  hasRulesForCategory(categoryId: string, familyId: string): Promise<boolean>;
  hasTransactionsForCategory(categoryId: string, familyId: string): Promise<boolean>;
  getBlockingTransactionDetails(categoryId: string, familyId: string): Promise<{
    count: number;
    sampleTransactions: Array<{
      id: string;
      description: string;
      amount: number;
      date: string;
      accountId: string;
    }>;
  }>;
}

export interface CategoryWithChildren extends Category {
  children?: Category[];
}

export interface CreateCategoryDto {
  name: string;
  parentId: string | null;
  description?: string;
  isHidden: boolean;
  isRollover: boolean;
  isSavings?: boolean;  // only honored when parentId === null
  // isIncome is computed automatically based on parentId
}

export interface UpdateCategoryDto {
  name?: string;
  description?: string;
  parentId?: string | null;
  isHidden?: boolean;
  isRollover?: boolean;
  isSavings?: boolean;  // only honored when parentId === null
}

export class CategoryService {
  private importService?: ImportService;

  constructor(
    private dataService: DataService,
    private dependencyChecker?: CategoryDependencyChecker
  ) {}

  /**
   * Late-bind the ImportService to break the circular dependency between
   * CategoryService and ImportService (each needs the other at construction time).
   * Must be called before any CSV import operations.
   */
  setImportService(importService: ImportService): void {
    this.importService = importService;
  }

  /**
   * Determine if a category should be marked as income based on its hierarchy
   */
  private isIncomeCategory(categoryId: string, parentId: string | null, categories: Category[]): boolean {
    // Root INCOME categories
    if (categoryId.startsWith('INCOME')) {
      return true;
    }

    // Child categories under INCOME parent
    if (parentId === 'INCOME') {
      return true;
    }

    // Check if parent is an income category (for deeply nested cases)
    if (parentId) {
      const parent = categories.find(cat => cat.id === parentId);
      if (parent && parent.isIncome) {
        return true;
      }
    }

    return false;
  }

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

  async getAllCategories(familyId: string): Promise<Category[]> {
    return this.dataService.getCategories(familyId);
  }

  async getCategoryById(id: string, familyId: string): Promise<Category | null> {
    const categories = await this.dataService.getCategories(familyId);
    return categories.find(cat => cat.id === id) || null;
  }

  async createCategory(data: CreateCategoryDto, familyId: string): Promise<Category> {
    const categories = await this.dataService.getCategories(familyId);

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
      isRollover: data.isRollover,
      isIncome: this.isIncomeCategory(categoryId, data.parentId, categories),
      isSavings: data.parentId === null ? (data.isSavings ?? false) : false,
    };

    categories.push(newCategory);
    await this.dataService.saveCategories(categories, familyId);
    return newCategory;
  }

  async updateCategory(id: string, updates: UpdateCategoryDto, familyId: string): Promise<Category> {
    const categories = await this.dataService.getCategories(familyId);
    const index = categories.findIndex(cat => cat.id === id);

    if (index === -1) {
      throw new Error('Category not found');
    }

    const updatedCategory = {
      ...categories[index],
      ...updates
    };

    // Recompute isIncome when parentId changes
    if (updates.parentId !== undefined) {
      updatedCategory.isIncome = this.isIncomeCategory(updatedCategory.id, updatedCategory.parentId, categories);
    }

    // isSavings is only valid on top-level categories
    if (updatedCategory.parentId !== null) {
      updatedCategory.isSavings = false;
    }

    categories[index] = updatedCategory;
    await this.dataService.saveCategories(categories, familyId);
    return updatedCategory;
  }

  async deleteCategory(id: string, familyId: string): Promise<void> {
    const categories = await this.dataService.getCategories(familyId);

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
    if (this.dependencyChecker) {
      const hasBudgets = await this.dependencyChecker.hasBudgetsForCategory(id, familyId);
      if (hasBudgets) {
        throw new Error('Cannot delete category with active budgets. Please delete the budgets first.');
      }
    }

    // Check if category is used in auto-categorization rules
    if (this.dependencyChecker) {
      const hasRules = await this.dependencyChecker.hasRulesForCategory(id, familyId);
      if (hasRules) {
        throw new Error('Cannot delete category used in auto-categorization rules. Please update or delete the rules first.');
      }
    }

    // Check if category has associated transactions
    if (this.dependencyChecker) {
      const hasTransactions = await this.dependencyChecker.hasTransactionsForCategory(id, familyId);
      if (hasTransactions) {
        const blockingDetails = await this.dependencyChecker.getBlockingTransactionDetails(id, familyId);

        let errorMessage = `Cannot delete category with ${blockingDetails.count} associated transaction${blockingDetails.count > 1 ? 's' : ''}.`;

        if (blockingDetails.sampleTransactions.length > 0) {
          errorMessage += '\n\nSample transactions that need to be recategorized:';
          blockingDetails.sampleTransactions.forEach((tx, index) => {
            const formattedAmount = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format(tx.amount);
            errorMessage += `\n${index + 1}. ${tx.description} - ${formattedAmount} (${tx.date}) [Account: ${tx.accountId}]`;
          });

          if (blockingDetails.count > blockingDetails.sampleTransactions.length) {
            errorMessage += `\n... and ${blockingDetails.count - blockingDetails.sampleTransactions.length} more transaction${blockingDetails.count - blockingDetails.sampleTransactions.length > 1 ? 's' : ''}.`;
          }
        }

        errorMessage += '\n\nPlease recategorize these transactions first.';

        throw new Error(errorMessage);
      }
    }
    
    // Remove the category
    const filteredCategories = categories.filter(cat => cat.id !== id);
    await this.dataService.saveCategories(filteredCategories, familyId);
  }

  async getParentCategories(familyId: string): Promise<Category[]> {
    const categories = await this.dataService.getCategories(familyId);
    return categories.filter(cat => cat.parentId === null);
  }

  async getSubcategories(parentId: string, familyId: string): Promise<Category[]> {
    const categories = await this.dataService.getCategories(familyId);
    return categories.filter(cat => cat.parentId === parentId);
  }

  async getCategoryTree(familyId: string): Promise<CategoryWithChildren[]> {
    const categories = await this.dataService.getCategories(familyId);
    const parents = categories.filter(cat => cat.parentId === null);
    
    return parents.map(parent => ({
      ...parent,
      children: categories.filter(cat => cat.parentId === parent.id)
    }));
  }

  // Removed plaidCategory-related methods as they are no longer needed

  async getHiddenCategories(familyId: string): Promise<Category[]> {
    const categories = await this.dataService.getCategories(familyId);
    return categories.filter(cat => cat.isHidden);
  }

  async getRolloverCategories(familyId: string): Promise<Category[]> {
    const categories = await this.dataService.getCategories(familyId);
    return categories.filter(cat => cat.isRollover);
  }

  async initializeDefaultCategories(_familyId: string): Promise<void> {
    // No longer initialize any default categories
    // Users must create their own category taxonomy
    // This method is kept for backward compatibility but does nothing
    return;
  }

  /**
   * Migration method to add isIncome property to existing categories
   * This should be called once to migrate existing data
   */
  async migrateIsIncomeProperty(familyId: string): Promise<{ migrated: number; skipped: number }> {
    const categories = await this.dataService.getCategories(familyId);
    let migrated = 0;
    let skipped = 0;

    // First pass: ensure all categories have isIncome property
    categories.forEach(category => {
      if (category.isIncome === undefined) {
        // Determine isIncome based on current hierarchy logic
        category.isIncome = this.isIncomeCategory(category.id, category.parentId, categories);
        migrated++;
      } else {
        skipped++;
      }
    });

    if (migrated > 0) {
      await this.dataService.saveCategories(categories, familyId);
    }

    return { migrated, skipped };
  }

  /**
   * Migration method to add isSavings property to existing categories
   * This should be called once to migrate existing data
   */
  async migrateIsSavingsProperty(familyId: string): Promise<{ migrated: number; skipped: number }> {
    const categories = await this.dataService.getCategories(familyId);
    let migrated = 0;
    let skipped = 0;

    categories.forEach(category => {
      if ((category as Category & { isSavings?: boolean }).isSavings === undefined) {
        category.isSavings = false;
        migrated++;
      } else {
        skipped++;
      }
    });

    if (migrated > 0) {
      await this.dataService.saveCategories(categories, familyId);
    }

    return { migrated, skipped };
  }

  async importFromCSV(csvContent: string, familyId: string): Promise<{
    success: boolean; 
    importedCount: number; 
    message: string;
    errors?: string[];
  }> {
    // Delegate to ImportService if available, otherwise use legacy implementation
    if (this.importService) {
      const result = await this.importService.importCSV(familyId, 'categories', csvContent, {
        skipDuplicates: true
      });
      
      return {
        success: result.success,
        importedCount: result.imported || 0,
        message: result.message,
        errors: result.errors
      };
    }

    // Legacy implementation - kept for backward compatibility
    // This code path will be removed once ImportService is fully integrated
    throw new Error('ImportService not initialized. Please update service initialization.');
  }


}

// Export singleton instance
let categoryServiceInstance: CategoryService | null = null;

export function getCategoryService(
  dataService?: DataService,
  dependencyChecker?: CategoryDependencyChecker
): CategoryService {
  if (!categoryServiceInstance) {
    if (!dataService) {
      throw new Error('DataService must be provided when creating CategoryService instance');
    }
    categoryServiceInstance = new CategoryService(dataService, dependencyChecker);
  }
  return categoryServiceInstance;
}