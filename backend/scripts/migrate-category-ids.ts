#!/usr/bin/env ts-node

/**
 * Migration script to update category ID fields
 * 
 * This script migrates from the old dual-field approach (categoryId/userCategoryId)
 * to the new cleaner approach (plaidCategoryId/categoryId)
 * 
 * Old structure:
 * - categoryId: Plaid's suggested category
 * - userCategoryId: User's manually assigned category
 * 
 * New structure:
 * - plaidCategoryId: Plaid's suggested category
 * - categoryId: User's actual category (what was userCategoryId)
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables
config({ path: path.join(__dirname, '..', '.env') });

// Import services
import { dataService } from '../src/services';
import { StoredTransaction } from '../src/services/transactionService';

interface OldTransaction {
  id: string;
  userId: string;
  accountId: string;
  plaidTransactionId: string | null;
  plaidAccountId: string;
  amount: number;
  date: string;
  name: string;
  userDescription: string | null;
  merchantName: string | null;
  category: string[] | null;
  categoryId: string | null;        // Old: Plaid's category
  userCategoryId: string | null;    // Old: User's category
  status: string;
  pending: boolean;
  isoCurrencyCode: string | null;
  tags: string[];
  notes: string | null;
  isHidden: boolean;
  isSplit: boolean;
  parentTransactionId: string | null;
  splitTransactionIds: string[];
  location: any;
  createdAt: Date;
  updatedAt: Date;
}

async function migrateTransactions() {
  console.log('Starting category ID migration...');
  
  // Get all user files
  const dataDir = process.env.DATA_DIR || './data';
  const files = fs.readdirSync(dataDir);
  const transactionFiles = files.filter(f => f.startsWith('transactions_') && f.endsWith('.json'));
  
  let totalMigrated = 0;
  let totalFiles = 0;
  
  for (const file of transactionFiles) {
    const userId = file.replace('transactions_', '').replace('.json', '');
    console.log(`\nMigrating transactions for user: ${userId}`);
    
    try {
      // Create backup first
      const backupPath = path.join(dataDir, `backup_${file}`);
      const originalPath = path.join(dataDir, file);
      fs.copyFileSync(originalPath, backupPath);
      console.log(`  Created backup: backup_${file}`);
      
      // Load transactions
      const transactions = await dataService.getData<OldTransaction[]>(
        `transactions_${userId}`
      ) || [];
      
      if (transactions.length === 0) {
        console.log('  No transactions to migrate');
        continue;
      }
      
      console.log(`  Found ${transactions.length} transactions`);
      
      // Migrate each transaction
      let migratedCount = 0;
      const migratedTransactions = transactions.map((txn: any) => {
        // Check if already migrated
        if ('plaidCategoryId' in txn && !('userCategoryId' in txn)) {
          console.log(`    Transaction ${txn.id} already migrated`);
          return txn;
        }
        
        // Migrate the fields
        const migrated = {
          ...txn,
          plaidCategoryId: txn.categoryId || null,  // Preserve Plaid's original suggestion
          categoryId: txn.userCategoryId || null,   // Use user's category as main category
        };
        
        // Remove old field
        delete (migrated as any).userCategoryId;
        
        migratedCount++;
        return migrated;
      });
      
      // Save migrated data
      await dataService.saveData(`transactions_${userId}`, migratedTransactions);
      
      console.log(`  Migrated ${migratedCount} transactions`);
      console.log(`  Total transactions: ${migratedTransactions.length}`);
      
      totalMigrated += migratedCount;
      totalFiles++;
      
    } catch (error) {
      console.error(`  Error migrating user ${userId}:`, error);
      console.error('  Backup preserved, manual intervention may be required');
    }
  }
  
  console.log('\n=== Migration Complete ===');
  console.log(`Files processed: ${totalFiles}`);
  console.log(`Total transactions migrated: ${totalMigrated}`);
  console.log('\nBackup files created with prefix "backup_"');
  console.log('To rollback, rename backup files to original names');
}

// Add rollback function
async function rollbackMigration() {
  console.log('Rolling back migration...');
  
  const dataDir = process.env.DATA_DIR || './data';
  const files = fs.readdirSync(dataDir);
  const backupFiles = files.filter(f => f.startsWith('backup_transactions_') && f.endsWith('.json'));
  
  for (const backupFile of backupFiles) {
    const originalFile = backupFile.replace('backup_', '');
    const backupPath = path.join(dataDir, backupFile);
    const originalPath = path.join(dataDir, originalFile);
    
    console.log(`Restoring ${originalFile} from backup...`);
    fs.copyFileSync(backupPath, originalPath);
  }
  
  console.log('Rollback complete');
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

if (command === 'rollback') {
  rollbackMigration().catch(console.error);
} else {
  migrateTransactions().catch(console.error);
}