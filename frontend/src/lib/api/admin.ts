import type { AxiosInstance } from 'axios';

export function createAdminApi(client: AxiosInstance) {
  return {
    async migrateSavingsToRollover(): Promise<{
      success: boolean;
      message: string;
      migratedCount: number;
      totalCount: number;
    }> {
      const { data } = await client.post('/admin/migrate-savings-to-rollover');
      return data;
    },

    async getMigrationStatus(): Promise<{
      totalCategories: number;
      categoriesWithOldField: number;
      categoriesWithNewField: number;
      migrationNeeded: boolean;
      migrationComplete: boolean;
    }> {
      const { data } = await client.get('/admin/migration-status');
      return data;
    },

    async cleanLocationData(): Promise<{
      success: boolean;
      message: string;
      migratedCount: number;
      totalCount: number;
    }> {
      const { data } = await client.post('/admin/clean-location-data');
      return data;
    },

    async getLocationCleanupStatus(): Promise<{
      totalTransactions: number;
      transactionsWithEmptyLocation: number;
      transactionsWithValidLocation: number;
      transactionsWithNullLocation: number;
      cleanupNeeded: boolean;
      cleanupComplete: boolean;
    }> {
      const { data } = await client.get('/admin/location-cleanup-status');
      return data;
    },
  };
}
