import { v4 as uuidv4 } from 'uuid';
import { Category } from '../../../shared/types';
import { DataService } from './dataService';

export interface CategoryWithChildren extends Category {
  children?: Category[];
}

export interface CreateCategoryDto {
  name: string;
  parentId: string | null;
  isHidden: boolean;
  isSavings: boolean;
}

export interface UpdateCategoryDto {
  name?: string;
  isHidden?: boolean;
  isSavings?: boolean;
}

export class CategoryService {
  constructor(private dataService: DataService) {}

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

    const newCategory: Category = {
      id: uuidv4(),
      name: data.name,
      parentId: data.parentId,
      isHidden: data.isHidden,
      isSavings: data.isSavings,
      isSystem: false // User-created categories are not system categories
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

    // Prevent editing system categories
    if (categories[index].isSystem) {
      throw new Error('System categories cannot be edited');
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
    
    // Prevent deleting system categories
    if (categoryToDelete.isSystem) {
      throw new Error('System categories cannot be deleted');
    }
    
    // Check if category has subcategories
    const hasSubcategories = categories.some(cat => cat.parentId === id);
    if (hasSubcategories) {
      throw new Error('Cannot delete category with subcategories');
    }
    
    // TODO: Check for associated transactions once transaction service is implemented
    // This would require checking if any transactions are using this categoryId
    
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

    // Create Plaid system categories
    const systemCategories: Category[] = [
      { id: 'plaid_income', name: 'Income', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_transfer', name: 'Transfer', parentId: null, isHidden: true, isSavings: false, isSystem: true },
      { id: 'plaid_housing', name: 'Housing', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_transportation', name: 'Transportation', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_food_drink', name: 'Food & Drink', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_shops', name: 'Shopping', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_entertainment', name: 'Entertainment', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_service', name: 'Services', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_healthcare', name: 'Healthcare', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_education', name: 'Education', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_personal', name: 'Personal Care', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_travel', name: 'Travel', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_bank_fees', name: 'Bank Fees', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_cash_advance', name: 'Cash Advance', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_taxes', name: 'Taxes', parentId: null, isHidden: false, isSavings: false, isSystem: true },
      { id: 'plaid_other', name: 'Other', parentId: null, isHidden: false, isSavings: false, isSystem: true },
    ];

    // Create a default user Savings category (not a system category)
    const userCategories: Category[] = [
      { id: uuidv4(), name: 'Savings', parentId: null, isHidden: false, isSavings: true, isSystem: false }
    ];

    const allCategories = [...systemCategories, ...userCategories];
    await this.dataService.saveCategories(allCategories, userId);
  }
}

// Export singleton instance
let categoryServiceInstance: CategoryService | null = null;

export function getCategoryService(dataService?: DataService): CategoryService {
  if (!categoryServiceInstance) {
    if (!dataService) {
      throw new Error('DataService must be provided when creating CategoryService instance');
    }
    categoryServiceInstance = new CategoryService(dataService);
  }
  return categoryServiceInstance;
}