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

    async getFamilyMigrationStatus(): Promise<{
      migrationNeeded: boolean;
      usersWithoutFamily: number;
      userStatuses: Array<{
        userId: string;
        username: string;
        familyId: string | null;
        entities: Record<string, { userScoped: boolean; familyScoped: boolean }>;
      }>;
      userScopedKeys: string[];
      familyScopedKeys: string[];
    }> {
      const { data } = await client.get('/admin/family-migration-status');
      return data;
    },

    async migrateToFamilies(): Promise<{
      success: boolean;
      message: string;
      results: Array<{
        userId: string;
        username: string;
        familyId: string;
        entities: Record<string, string>;
      }>;
    }> {
      const { data } = await client.post('/admin/migrate-to-families');
      return data;
    },

    async cleanupFamilyMigration(): Promise<{
      success: boolean;
      message: string;
      deleted: string[];
      skipped: Array<{ key: string; reason: string }>;
    }> {
      const { data } = await client.post('/admin/migrate-to-families/cleanup?confirm=true');
      return data;
    },
  };
}
