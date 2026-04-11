import express, { NextFunction, Request, Response } from 'express';
import { categoryService, dataService, accountOwnerMappingService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';
import { AuthorizationError } from '../errors';

const router = express.Router();

// All admin routes require authentication
router.use(authMiddleware);

interface MigrationResult {
  success: boolean;
  message: string;
  migratedCount: number;
  totalCount: number;
}

/**
 * Migrate categories from isSavings to isRollover
 * This is a one-time migration to rename the concept for better clarity
 */
router.post('/migrate-savings-to-rollover', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    console.log(`Starting migration from isSavings to isRollover for family ${familyId}`);

    // Get all categories for the family directly from data service to manipulate raw data
    const dataService = (categoryService as any).dataService;
    const categories = await dataService.getCategories(familyId);
    let migratedCount = 0;

    // Process each category to migrate the field
    const migratedCategories = categories.map((category: any) => {
      if (category.hasOwnProperty('isSavings')) {
        // Copy the value to the new field
        const isRolloverValue = category.isSavings;

        // Create a new object without the old field
        const { isSavings, ...cleanCategory } = category;

        // Add the new field
        const migratedCategory = {
          ...cleanCategory,
          isRollover: isRolloverValue
        };

        migratedCount++;
        console.log(`Migrated category ${category.id} (${category.name}): isSavings(${isRolloverValue}) -> isRollover(${isRolloverValue})`);

        return migratedCategory;
      }
      return category;
    });

    // Save all migrated categories back
    if (migratedCount > 0) {
      await dataService.saveCategories(migratedCategories, familyId);
    }

    const result: MigrationResult = {
      success: true,
      message: `Successfully migrated ${migratedCount} categories from 'isSavings' to 'isRollover'`,
      migratedCount,
      totalCount: categories.length
    };

    console.log(`Migration completed: ${migratedCount}/${categories.length} categories migrated`);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Get migration status - check if any categories still have the old field
 */
router.get('/migration-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    // Get categories directly from data service to check raw data
    const dataService = (categoryService as any).dataService;
    const categories = await dataService.getCategories(familyId);
    const oldFieldCount = categories.filter((cat: any) => cat.hasOwnProperty('isSavings')).length;
    const newFieldCount = categories.filter((cat: any) => cat.hasOwnProperty('isRollover')).length;

    res.json({
      totalCategories: categories.length,
      categoriesWithOldField: oldFieldCount,
      categoriesWithNewField: newFieldCount,
      migrationNeeded: oldFieldCount > 0,
      migrationComplete: oldFieldCount === 0 && newFieldCount > 0
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Clean up transaction location data by removing null-only location objects
 */
router.post('/clean-location-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    console.log(`Starting location data cleanup for family ${familyId}`);

    // Get all transactions for the family directly from data service to manipulate raw data
    const transactions = await dataService.getData<any[]>(`transactions_${familyId}`) || [];
    let cleanedCount = 0;

    // Helper function to check if location has any non-null data
    const hasLocationData = (location: any): boolean => {
      if (!location || typeof location !== 'object') {
        return false;
      }
      
      const fields = ['address', 'city', 'region', 'postalCode', 'country', 'lat', 'lon'];
      return fields.some(field => location[field] !== null && location[field] !== undefined);
    };

    // Process each transaction to clean up location data
    const cleanedTransactions = transactions.map((transaction: any) => {
      if (transaction.location && !hasLocationData(transaction.location)) {
        cleanedCount++;
        console.log(`Cleaned location data for transaction ${transaction.id} (${transaction.merchantName})`);
        
        return {
          ...transaction,
          location: null
        };
      }
      return transaction;
    });

    // Save all cleaned transactions back
    if (cleanedCount > 0) {
      await dataService.saveData(`transactions_${familyId}`, cleanedTransactions);
    }

    const result: MigrationResult = {
      success: true,
      message: `Successfully cleaned ${cleanedCount} transactions with empty location data`,
      migratedCount: cleanedCount,
      totalCount: transactions.length
    };

    console.log(`Location cleanup completed for family ${familyId}: ${cleanedCount}/${transactions.length} transactions cleaned`);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Get location cleanup status - check transaction location data state
 */
router.get('/location-cleanup-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    // Get transactions directly from data service to check raw data
    const transactions = await dataService.getData<any[]>(`transactions_${familyId}`) || [];

    // Helper function to check if location has any non-null data
    const hasLocationData = (location: any): boolean => {
      if (!location || typeof location !== 'object') {
        return false;
      }
      
      const fields = ['address', 'city', 'region', 'postalCode', 'country', 'lat', 'lon'];
      return fields.some(field => location[field] !== null && location[field] !== undefined);
    };

    let emptyLocationCount = 0;
    let validLocationCount = 0;
    let nullLocationCount = 0;

    transactions.forEach((txn: any) => {
      if (txn.location === null || txn.location === undefined) {
        nullLocationCount++;
      } else if (hasLocationData(txn.location)) {
        validLocationCount++;
      } else {
        emptyLocationCount++;
      }
    });

    res.json({
      totalTransactions: transactions.length,
      transactionsWithEmptyLocation: emptyLocationCount,
      transactionsWithValidLocation: validLocationCount,
      transactionsWithNullLocation: nullLocationCount,
      cleanupNeeded: emptyLocationCount > 0,
      cleanupComplete: emptyLocationCount === 0
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Migrate categories to add isIncome property
 * This adds explicit isIncome property to existing categories based on hierarchy
 */
router.post('/migrate-is-income', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    console.log(`Starting isIncome migration for family ${familyId}`);

    const result = await categoryService.migrateIsIncomeProperty(familyId);

    const migrationResult: MigrationResult = {
      success: true,
      message: `Successfully migrated ${result.migrated} categories to have explicit isIncome property`,
      migratedCount: result.migrated,
      totalCount: result.migrated + result.skipped
    };

    console.log(`isIncome migration completed for family ${familyId}: ${result.migrated} migrated, ${result.skipped} already had property`);

    res.json(migrationResult);
  } catch (error) {
    next(error);
  }
});

/**
 * Get isIncome migration status - check if categories have explicit isIncome property
 */
router.get('/is-income-migration-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const familyId = req.user?.familyId;
    if (!familyId) throw new AuthorizationError();

    // Get categories directly from data service to check raw data
    const dataService = (categoryService as any).dataService;
    const categories = await dataService.getCategories(familyId);

    let withIsIncomeProperty = 0;
    let missingIsIncomeProperty = 0;
    let incomeCategories = 0;
    let expenseCategories = 0;

    categories.forEach((cat: any) => {
      if (cat.hasOwnProperty('isIncome') && cat.isIncome !== undefined) {
        withIsIncomeProperty++;
        if (cat.isIncome) {
          incomeCategories++;
        } else {
          expenseCategories++;
        }
      } else {
        missingIsIncomeProperty++;
      }
    });

    res.json({
      totalCategories: categories.length,
      categoriesWithIsIncomeProperty: withIsIncomeProperty,
      categoriesMissingIsIncomeProperty: missingIsIncomeProperty,
      incomeCategories,
      expenseCategories,
      migrationNeeded: missingIsIncomeProperty > 0,
      migrationComplete: missingIsIncomeProperty === 0 && withIsIncomeProperty > 0
    });
  } catch (error) {
    next(error);
  }
});

// Entity types that are scoped by userId / familyId
const ENTITY_TYPES = [
  'transactions',
  'accounts',
  'budgets',
  'categories',
  'autocategorize_rules',
  'projects',
  'trips',
  'manual_accounts',
  'amazon_receipts',
  'actuals_overrides',
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

interface EntityMigrationStatus {
  entity: EntityType;
  userScopedKeyExists: boolean;
  familyScopedKeyExists: boolean;
}

interface UserMigrationStatus {
  userId: string;
  familyId: string | null;
  entities: EntityMigrationStatus[];
}

/**
 * GET /admin/family-migration-status
 * Reports whether userId-scoped data files still exist and whether
 * familyId-scoped replacements are in place.
 */
router.get('/family-migration-status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Checking family migration status...');

    const users = await dataService.getAllUsers();

    const usersWithoutFamily: string[] = [];
    const userStatuses: UserMigrationStatus[] = [];

    for (const user of users) {
      if (!user.familyId) {
        usersWithoutFamily.push(user.id);
        userStatuses.push({ userId: user.id, familyId: null, entities: [] });
        continue;
      }

      const entities: EntityMigrationStatus[] = [];
      for (const entity of ENTITY_TYPES) {
        const userKey = `${entity}_${user.id}`;
        const familyKey = `${entity}_${user.familyId}`;
        const [userScopedKeyExists, familyScopedKeyExists] = await Promise.all([
          dataService.getData(userKey).then(d => d !== null),
          dataService.getData(familyKey).then(d => d !== null),
        ]);
        entities.push({ entity, userScopedKeyExists, familyScopedKeyExists });
      }

      userStatuses.push({ userId: user.id, familyId: user.familyId, entities });
    }

    const migrationNeeded = userStatuses.some(u =>
      u.entities.some(e => e.userScopedKeyExists && !e.familyScopedKeyExists)
    );

    // Collect flat arrays of keys for a quick summary
    const userScopedKeys: string[] = [];
    const familyScopedKeys: string[] = [];
    for (const us of userStatuses) {
      if (!us.familyId) continue;
      for (const e of us.entities) {
        if (e.userScopedKeyExists) userScopedKeys.push(`${e.entity}_${us.userId}`);
        if (e.familyScopedKeyExists) familyScopedKeys.push(`${e.entity}_${us.familyId}`);
      }
    }

    console.log(`Family migration status: migrationNeeded=${migrationNeeded}, usersWithoutFamily=${usersWithoutFamily.length}`);

    res.json({
      migrationNeeded,
      usersWithoutFamily,
      userStatuses,
      userScopedKeys,
      familyScopedKeys,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/migrate-to-families
 * Copies userId-scoped data files to familyId-scoped keys.
 * Idempotent: skips the copy when the familyId-scoped key already exists.
 * Does NOT delete old keys (see cleanup endpoint).
 */
router.post('/migrate-to-families', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Starting family data migration...');

    const users = await dataService.getAllUsers();

    interface EntityResult {
      entity: EntityType;
      result: 'migrated' | 'skipped' | 'no_data';
    }

    interface UserResult {
      userId: string;
      familyId: string;
      migratedEntities: EntityResult[];
    }

    const userResults: UserResult[] = [];

    for (const user of users) {
      if (!user.familyId) {
        console.log(`Skipping user ${user.id} — no familyId assigned`);
        continue;
      }

      console.log(`Migrating data for user ${user.id} -> family ${user.familyId}`);

      const migratedEntities: EntityResult[] = [];

      for (const entity of ENTITY_TYPES) {
        const userKey = `${entity}_${user.id}`;
        const familyKey = `${entity}_${user.familyId}`;

        const existingData = await dataService.getData(userKey);

        if (existingData === null) {
          console.log(`  ${userKey}: no data, skipping`);
          migratedEntities.push({ entity, result: 'no_data' });
          continue;
        }

        const familyDataAlreadyExists = await dataService.getData(familyKey);
        if (familyDataAlreadyExists !== null) {
          console.log(`  ${userKey} -> ${familyKey}: family key already exists, skipping`);
          migratedEntities.push({ entity, result: 'skipped' });
          continue;
        }

        await dataService.saveData(familyKey, existingData);
        console.log(`  ${userKey} -> ${familyKey}: migrated`);
        migratedEntities.push({ entity, result: 'migrated' });
      }

      userResults.push({ userId: user.id, familyId: user.familyId, migratedEntities });
    }

    // chatbot_costs keys are formatted as chatbot_costs_YYYY-MM (not userId-scoped), skip them.
    console.log('Note: chatbot_costs_* keys are not userId-scoped and are skipped by this migration.');

    // Seed initial account owner mappings for each family (idempotent)
    const seededFamilies = new Set<string>();
    for (const user of users) {
      if (!user.familyId || seededFamilies.has(user.familyId)) continue;
      seededFamilies.add(user.familyId);

      const existing = await accountOwnerMappingService.getMappings(user.familyId);
      if (existing.length === 0) {
        const seedMappings = [
          { cardIdentifier: '7177', displayName: 'Jecoliah' },
          { cardIdentifier: '7245', displayName: 'Joj' },
          { cardIdentifier: '7008', displayName: 'Jared' },
        ];
        for (const seed of seedMappings) {
          await accountOwnerMappingService.createMapping(user.familyId, seed);
        }
        console.log(`Seeded ${seedMappings.length} account owner mappings for family ${user.familyId}`);
      } else {
        console.log(`Account owner mappings already exist for family ${user.familyId}, skipping seed`);
      }
    }

    const totalMigrated = userResults.reduce(
      (sum, u) => sum + u.migratedEntities.filter(e => e.result === 'migrated').length,
      0
    );

    console.log(`Family migration complete: ${totalMigrated} entity files migrated across ${userResults.length} users`);

    res.json({
      success: true,
      totalMigrated,
      userResults,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/migrate-to-families/cleanup?confirm=true
 * Deletes userId-scoped data files only after verifying that the
 * corresponding familyId-scoped key exists.
 * Requires ?confirm=true to prevent accidental execution.
 */
router.post('/migrate-to-families/cleanup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.query['confirm'] !== 'true') {
      res.status(400).json({
        success: false,
        message: 'Pass ?confirm=true to execute cleanup. This deletes old userId-scoped data files.',
      });
      return;
    }

    console.log('Starting family migration cleanup (deleting old userId-scoped keys)...');

    const users = await dataService.getAllUsers();

    interface CleanupResult {
      key: string;
      deleted: boolean;
      reason: string;
    }

    const deletedKeys: CleanupResult[] = [];

    for (const user of users) {
      if (!user.familyId) {
        console.log(`Skipping user ${user.id} — no familyId assigned`);
        continue;
      }

      for (const entity of ENTITY_TYPES) {
        const userKey = `${entity}_${user.id}`;
        const familyKey = `${entity}_${user.familyId}`;

        const userDataExists = await dataService.getData(userKey);
        if (userDataExists === null) {
          // Nothing to delete
          continue;
        }

        const familyDataExists = await dataService.getData(familyKey);
        if (familyDataExists === null) {
          console.log(`  Skipping deletion of ${userKey} — familyId-scoped key ${familyKey} not yet created`);
          deletedKeys.push({
            key: userKey,
            deleted: false,
            reason: `familyId-scoped key ${familyKey} does not exist; run migration first`,
          });
          continue;
        }

        await dataService.deleteData(userKey);
        console.log(`  Deleted ${userKey} (family key ${familyKey} confirmed present)`);
        deletedKeys.push({ key: userKey, deleted: true, reason: `replaced by ${familyKey}` });
      }
    }

    const deletedCount = deletedKeys.filter(k => k.deleted).length;
    const skippedCount = deletedKeys.filter(k => !k.deleted).length;

    console.log(`Cleanup complete: ${deletedCount} keys deleted, ${skippedCount} skipped`);

    res.json({
      success: true,
      deletedCount,
      skippedCount,
      deletedKeys,
    });
  } catch (error) {
    next(error);
  }
});

export default router;