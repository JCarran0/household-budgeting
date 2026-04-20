import type { AxiosInstance } from 'axios';
import type { Transaction } from '../../../../shared/types';

export function createTransactionsApi(client: AxiosInstance) {
  return {
    async getTransactions(params?: {
      accountId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
      categoryIds?: string[];
      tags?: string[];
      searchQuery?: string;
      includeHidden?: boolean;
      onlyUncategorized?: boolean;
      minAmount?: number;
      maxAmount?: number;
      transactionType?: 'all' | 'income' | 'expense' | 'transfer';
    }): Promise<{ transactions: Transaction[]; total: number; totalCount?: number }> {
      const { data } = await client.get('/transactions', { params });
      return data;
    },

    async getUncategorizedCount(): Promise<{ success: boolean; count: number; total: number }> {
      const { data } = await client.get<{ success: boolean; count: number; total: number }>(
        '/transactions/uncategorized/count'
      );
      return data;
    },

    async syncTransactions(): Promise<{
      added: number;
      modified: number;
      removed: number;
      hasMore: boolean;
      warning?: string;
    }> {
      const { data } = await client.post('/transactions/sync', {});
      return data;
    },

    async updateTransactionCategory(transactionId: string, categoryId: string | null): Promise<void> {
      const response = await client.put(`/transactions/${transactionId}/category`, { categoryId });
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update category');
      }
    },

    async bulkUpdateTransactions(
      transactionIds: string[],
      updates: {
        categoryId?: string | null;
        userDescription?: string | null;
        isHidden?: boolean;
        isFlagged?: boolean;
        tagsToAdd?: string[];
        tagsToRemove?: string[];
      }
    ): Promise<{ updated: number; failed: number; errors?: string[] }> {
      const response = await client.put('/transactions/bulk', { transactionIds, updates });
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to perform bulk update');
      }
      return {
        updated: response.data.updated || 0,
        failed: response.data.failed || 0,
        errors: response.data.errors,
      };
    },

    async addTransactionTags(transactionId: string, tags: string[]): Promise<void> {
      const response = await client.post(`/transactions/${transactionId}/tags`, { tags });
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to add tags');
      }
    },

    async splitTransaction(
      transactionId: string,
      splits: {
        amount: number;
        categoryId?: string;
        description?: string;
        tags?: string[];
      }[]
    ): Promise<void> {
      await client.post(`/transactions/${transactionId}/split`, { splits });
    },

    async updateTransactionDescription(transactionId: string, description: string | null): Promise<void> {
      const response = await client.put(`/transactions/${transactionId}/description`, { description });
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update description');
      }
    },

    async updateTransactionHidden(transactionId: string, isHidden: boolean): Promise<void> {
      const response = await client.put(`/transactions/${transactionId}/hidden`, { isHidden });
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update hidden status');
      }
    },

    async updateTransactionFlagged(transactionId: string, isFlagged: boolean): Promise<void> {
      const response = await client.put(`/transactions/${transactionId}/flagged`, { isFlagged });
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update flagged status');
      }
    },

    async importTransactionsFromCSV(
      csvContent: string,
      options: { preview?: boolean; skipDuplicates?: boolean; updateCategoriesOnly?: boolean } = {}
    ): Promise<{
      success: boolean;
      message?: string;
      error?: string;
      details?: string[];
      data?: {
        imported: number;
        skipped: number;
        errors: string[];
        warnings: string[];
      };
    }> {
      const { data } = await client.post('/transactions/import-csv', {
        csvContent,
        preview: options.preview || false,
        skipDuplicates: options.skipDuplicates !== false,
        updateCategoriesOnly: options.updateCategoriesOnly || false,
      });
      return data;
    },
  };
}
