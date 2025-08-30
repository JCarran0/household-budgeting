import { v4 as uuidv4 } from 'uuid';
import { Category } from '../../../shared/types';
import { DataService } from './dataService';

export interface CategoryWithChildren extends Category {
  children?: Category[];
}

export interface CreateCategoryDto {
  name: string;
  parentId: string | null;
  plaidCategory: string | null;
  isHidden: boolean;
  isSavings: boolean;
}

export interface UpdateCategoryDto {
  name?: string;
  plaidCategory?: string | null;
  isHidden?: boolean;
  isSavings?: boolean;
}

export class CategoryService {
  constructor(private dataService: DataService) {}

  async getAllCategories(): Promise<Category[]> {
    return this.dataService.getCategories();
  }

  async getCategoryById(id: string): Promise<Category | null> {
    const categories = await this.dataService.getCategories();
    return categories.find(cat => cat.id === id) || null;
  }

  async createCategory(data: CreateCategoryDto): Promise<Category> {
    const categories = await this.dataService.getCategories();

    // Validate parent exists if parentId is provided
    if (data.parentId) {
      const parent = categories.find(cat => cat.id === data.parentId);
      if (!parent) {
        throw new Error('Parent category not found');
      }
      // Ensure parent is not a subcategory
      if (parent.parentId !== null) {
        throw new Error('Cannot create subcategory under another subcategory');
      }
    }

    const newCategory: Category = {
      id: uuidv4(),
      name: data.name,
      parentId: data.parentId,
      plaidCategory: data.plaidCategory,
      isHidden: data.isHidden,
      isSavings: data.isSavings
    };

    categories.push(newCategory);
    await this.dataService.saveCategories(categories);
    return newCategory;
  }

  async updateCategory(id: string, updates: UpdateCategoryDto): Promise<Category> {
    const categories = await this.dataService.getCategories();
    const index = categories.findIndex(cat => cat.id === id);

    if (index === -1) {
      throw new Error('Category not found');
    }

    const updatedCategory = {
      ...categories[index],
      ...updates
    };

    categories[index] = updatedCategory;
    await this.dataService.saveCategories(categories);
    return updatedCategory;
  }

  async deleteCategory(id: string): Promise<void> {
    const categories = await this.dataService.getCategories();
    
    // Remove the category and any subcategories
    const filteredCategories = categories.filter(cat => {
      return cat.id !== id && cat.parentId !== id;
    });

    await this.dataService.saveCategories(filteredCategories);
  }

  async getParentCategories(): Promise<Category[]> {
    const categories = await this.dataService.getCategories();
    return categories.filter(cat => cat.parentId === null);
  }

  async getSubcategories(parentId: string): Promise<Category[]> {
    const categories = await this.dataService.getCategories();
    return categories.filter(cat => cat.parentId === parentId);
  }

  async getCategoryTree(): Promise<CategoryWithChildren[]> {
    const categories = await this.dataService.getCategories();
    const parents = categories.filter(cat => cat.parentId === null);
    
    return parents.map(parent => ({
      ...parent,
      children: categories.filter(cat => cat.parentId === parent.id)
    }));
  }

  async findByPlaidCategory(plaidCategory: string): Promise<Category | null> {
    const categories = await this.dataService.getCategories();
    return categories.find(cat => cat.plaidCategory === plaidCategory) || null;
  }

  async getPlaidCategoryMapping(): Promise<Record<string, string>> {
    const categories = await this.dataService.getCategories();
    const mapping: Record<string, string> = {};
    
    categories.forEach(cat => {
      if (cat.plaidCategory) {
        mapping[cat.plaidCategory] = cat.id;
      }
    });
    
    return mapping;
  }

  async getHiddenCategories(): Promise<Category[]> {
    const categories = await this.dataService.getCategories();
    return categories.filter(cat => cat.isHidden);
  }

  async getSavingsCategories(): Promise<Category[]> {
    const categories = await this.dataService.getCategories();
    return categories.filter(cat => cat.isSavings);
  }

  async initializeDefaultCategories(): Promise<void> {
    const categories = await this.dataService.getCategories();
    
    // Only initialize if no categories exist
    if (categories.length > 0) {
      return;
    }

    const defaultCategories: CreateCategoryDto[] = [
      // Income
      { name: 'Income', parentId: null, plaidCategory: 'INCOME', isHidden: false, isSavings: false },
      
      // Expenses
      { name: 'Housing', parentId: null, plaidCategory: 'HOUSING', isHidden: false, isSavings: false },
      { name: 'Transportation', parentId: null, plaidCategory: 'TRANSPORTATION', isHidden: false, isSavings: false },
      { name: 'Food & Dining', parentId: null, plaidCategory: 'FOOD_AND_DRINK', isHidden: false, isSavings: false },
      { name: 'Shopping', parentId: null, plaidCategory: 'SHOPS', isHidden: false, isSavings: false },
      { name: 'Entertainment', parentId: null, plaidCategory: 'ENTERTAINMENT', isHidden: false, isSavings: false },
      { name: 'Bills & Utilities', parentId: null, plaidCategory: 'SERVICE', isHidden: false, isSavings: false },
      { name: 'Healthcare', parentId: null, plaidCategory: 'HEALTHCARE', isHidden: false, isSavings: false },
      { name: 'Education', parentId: null, plaidCategory: 'EDUCATION', isHidden: false, isSavings: false },
      { name: 'Personal', parentId: null, plaidCategory: 'PERSONAL_CARE', isHidden: false, isSavings: false },
      
      // Savings
      { name: 'Savings', parentId: null, plaidCategory: null, isHidden: false, isSavings: true },
      
      // Hidden
      { name: 'Transfers', parentId: null, plaidCategory: 'TRANSFER', isHidden: true, isSavings: false }
    ];

    const newCategories: Category[] = defaultCategories.map(cat => ({
      id: uuidv4(),
      ...cat
    }));

    await this.dataService.saveCategories(newCategories);
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