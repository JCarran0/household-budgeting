import type { AxiosInstance } from 'axios';
import type { Category } from '../../../../shared/types';

export interface CategoryWithChildren extends Category {
  children?: Category[];
}

export interface CreateCategoryDto {
  name: string;
  parentId: string | null;
  description?: string;
  isHidden: boolean;
  isRollover: boolean;
}

export interface UpdateCategoryDto {
  name?: string;
  description?: string;
  parentId?: string | null;
  isHidden?: boolean;
  isRollover?: boolean;
}

export function createCategoriesApi(client: AxiosInstance) {
  return {
    async getCategories(): Promise<Category[]> {
      const { data } = await client.get<Category[]>('/categories');
      return data;
    },

    async getCategoryTree(): Promise<CategoryWithChildren[]> {
      const { data } = await client.get<CategoryWithChildren[]>('/categories/tree');
      return data;
    },

    async getCategoryById(id: string): Promise<Category> {
      const { data } = await client.get<Category>(`/categories/${id}`);
      return data;
    },

    async getParentCategories(): Promise<Category[]> {
      const { data } = await client.get<Category[]>('/categories/parents');
      return data;
    },

    async getSubcategories(parentId: string): Promise<Category[]> {
      const { data } = await client.get<Category[]>(`/categories/${parentId}/subcategories`);
      return data;
    },

    async createCategory(category: CreateCategoryDto): Promise<Category> {
      const { data } = await client.post<Category>('/categories', category);
      return data;
    },

    async updateCategory(id: string, updates: UpdateCategoryDto): Promise<Category> {
      const { data } = await client.put<Category>(`/categories/${id}`, updates);
      return data;
    },

    async deleteCategory(id: string): Promise<void> {
      await client.delete(`/categories/${id}`);
    },

    // Category deletion workflow methods
    async deleteCategoryBudgets(categoryId: string): Promise<{ deleted: number }> {
      const { data } = await client.post<{ success: boolean; deleted: number }>(
        `/categories/${categoryId}/delete-budgets`
      );
      return { deleted: data.deleted };
    },

    async deleteCategoryRules(categoryId: string): Promise<{ deleted: number }> {
      const { data } = await client.post<{ success: boolean; deleted: number }>(
        `/categories/${categoryId}/delete-rules`
      );
      return { deleted: data.deleted };
    },

    async recategorizeCategoryTransactions(
      categoryId: string,
      newCategoryId: string | null
    ): Promise<{ updated: number }> {
      const { data } = await client.post<{ success: boolean; updated: number }>(
        `/categories/${categoryId}/recategorize-transactions`,
        { newCategoryId }
      );
      return { updated: data.updated };
    },

    async initializeDefaultCategories(): Promise<{ message: string; categories: Category[] }> {
      const { data } = await client.post<{ message: string; categories: Category[] }>(
        '/categories/initialize'
      );
      return data;
    },

    async importCategoriesFromCSV(csvContent: string): Promise<{
      success: boolean;
      message: string;
      importedCount?: number;
      errors?: string[];
    }> {
      const { data } = await client.post<{
        success: boolean;
        message: string;
        importedCount?: number;
        errors?: string[];
      }>('/categories/import-csv', { csvContent });
      return data;
    },

    async getCategoryTransactionCounts(): Promise<Record<string, number>> {
      const { data } = await client.get<Record<string, number>>('/categories/transaction-counts');
      return data;
    },
  };
}
