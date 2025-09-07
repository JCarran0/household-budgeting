import express from 'express';
import { categoryService } from '../services';
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

export default router;