import express from 'express';
import { categoryService, dataService } from '../services';
import { authMiddleware } from '../middleware/authMiddleware';

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
router.post('/migrate-savings-to-rollover', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    console.log(`Starting migration from isSavings to isRollover for user ${userId}`);

    // Get all categories for the user directly from data service to manipulate raw data
    const dataService = (categoryService as any).dataService;
    const categories = await dataService.getCategories(userId);
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
      await dataService.saveCategories(migratedCategories, userId);
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
    console.error('Migration failed:', error);
    
    const result: MigrationResult = {
      success: false,
      message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      migratedCount: 0,
      totalCount: 0
    };
    
    res.status(500).json(result);
  }
});

/**
 * Get migration status - check if any categories still have the old field
 */
router.get('/migration-status', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Get categories directly from data service to check raw data
    const dataService = (categoryService as any).dataService;
    const categories = await dataService.getCategories(userId);
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
    console.error('Failed to get migration status:', error);
    res.status(500).json({ error: 'Failed to get migration status' });
  }
});

/**
 * Clean up transaction location data by removing null-only location objects
 */
router.post('/clean-location-data', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    console.log(`Starting location data cleanup for user ${userId}`);

    // Get all transactions for the user directly from data service to manipulate raw data
    const transactions = await dataService.getData<any[]>(`transactions_${userId}`) || [];
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
      await dataService.saveData(`transactions_${userId}`, cleanedTransactions);
    }

    const result: MigrationResult = {
      success: true,
      message: `Successfully cleaned ${cleanedCount} transactions with empty location data`,
      migratedCount: cleanedCount,
      totalCount: transactions.length
    };

    console.log(`Location cleanup completed: ${cleanedCount}/${transactions.length} transactions cleaned`);
    
    res.json(result);
  } catch (error) {
    console.error('Location cleanup failed:', error);
    
    const result: MigrationResult = {
      success: false,
      message: `Location cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      migratedCount: 0,
      totalCount: 0
    };
    
    res.status(500).json(result);
  }
});

/**
 * Get location cleanup status - check transaction location data state
 */
router.get('/location-cleanup-status', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Get transactions directly from data service to check raw data
    const transactions = await dataService.getData<any[]>(`transactions_${userId}`) || [];

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
    console.error('Failed to get location cleanup status:', error);
    res.status(500).json({ error: 'Failed to get location cleanup status' });
  }
});

/**
 * Migrate categories to add isIncome property
 * This adds explicit isIncome property to existing categories based on hierarchy
 */
router.post('/migrate-is-income', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    console.log(`Starting isIncome migration for user ${userId}`);

    const result = await categoryService.migrateIsIncomeProperty(userId);

    const migrationResult: MigrationResult = {
      success: true,
      message: `Successfully migrated ${result.migrated} categories to have explicit isIncome property`,
      migratedCount: result.migrated,
      totalCount: result.migrated + result.skipped
    };

    console.log(`isIncome migration completed: ${result.migrated} migrated, ${result.skipped} already had property`);

    res.json(migrationResult);
  } catch (error) {
    console.error('isIncome migration failed:', error);

    const result: MigrationResult = {
      success: false,
      message: `isIncome migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      migratedCount: 0,
      totalCount: 0
    };

    res.status(500).json(result);
  }
});

/**
 * Get isIncome migration status - check if categories have explicit isIncome property
 */
router.get('/is-income-migration-status', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Get categories directly from data service to check raw data
    const dataService = (categoryService as any).dataService;
    const categories = await dataService.getCategories(userId);

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
    console.error('Failed to get isIncome migration status:', error);
    res.status(500).json({ error: 'Failed to get isIncome migration status' });
  }
});

export default router;