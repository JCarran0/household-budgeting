#!/usr/bin/env ts-node

/**
 * Reset Household Budgeting App to Initial State
 * This script removes all user data and returns the app to a fresh state
 * Works with both filesystem (local) and S3 (production) storage
 * 
 * Usage: npm run reset
 * Or with confirmation: npm run reset:force
 */

import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { StorageFactory } from '../services/storage/storageFactory';
import { StorageAdapter } from '../services/storage/types';

// Load environment variables (allow override with DOTENV_CONFIG_PATH)
const envPath = process.env.DOTENV_CONFIG_PATH || '.env';
dotenv.config({ path: envPath });

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Check for --force flag
const forceReset = process.argv.includes('--force');

console.log(colors.cyan + '=========================================');
console.log('  Household Budgeting App Reset Script');
console.log('=========================================' + colors.reset);
console.log('');

// Display storage type
const storageType = process.env.STORAGE_TYPE || 
  (process.env.NODE_ENV === 'production' ? 's3' : 'filesystem');
console.log(colors.blue + 'Storage Type: ' + colors.reset + storageType.toUpperCase());

if (storageType === 's3') {
  console.log(colors.blue + 'S3 Bucket: ' + colors.reset + (process.env.S3_BUCKET_NAME || 'Not configured'));
  console.log(colors.blue + 'S3 Prefix: ' + colors.reset + (process.env.S3_PREFIX || 'data/'));
} else {
  console.log(colors.blue + 'Data Directory: ' + colors.reset + (process.env.DATA_DIR || './data'));
}

console.log('');
console.log(colors.red + 'WARNING: This will DELETE all:' + colors.reset);
console.log('  • User accounts and authentication data');
console.log('  • Connected bank accounts');
console.log('  • Synced transactions');
console.log('  • Categories and budgets');
console.log('  • Auto-categorization rules');
console.log('');

async function confirmReset(): Promise<boolean> {
  if (forceReset) {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(colors.yellow + 'Are you sure you want to reset the app? (yes/no): ' + colors.reset, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function resetApp() {
  // Extra safety check for production environment
  if (process.env.NODE_ENV === 'production' && !forceReset) {
    console.log(colors.red + '\n⚠️  Production environment detected!' + colors.reset);
    console.log('Use --force flag to reset production data.');
    console.log('Example: npm run reset:force');
    process.exit(1);
  }

  const confirmed = await confirmReset();
  
  if (!confirmed) {
    console.log(colors.yellow + '\nReset cancelled.' + colors.reset);
    process.exit(0);
  }

  console.log('\n' + colors.blue + 'Resetting application data...' + colors.reset);

  try {
    // Get the appropriate storage adapter (filesystem or S3)
    const storage: StorageAdapter = StorageFactory.getAdapter();
    
    // List all keys in storage
    console.log(colors.blue + '\n→ Scanning for data files...' + colors.reset);
    const allKeys = await storage.list('');
    
    // UUID pattern for user-scoped files
    const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    
    // File type patterns for logging
    const fileTypes: Record<string, string> = {
      'accounts_': 'connected bank accounts',
      'transactions_': 'transactions',
      'categories_': 'categories',
      'budgets_': 'budgets',
      'autocategorize_rules_': 'auto-categorization rules',
      'tags_': 'tags'
    };

    // Separate files into categories
    const userScopedKeys: string[] = [];
    const systemKeys: string[] = [];
    const obsoleteKeys = ['categories', 'budgets']; // Legacy keys to remove
    
    for (const key of allKeys) {
      if (uuidPattern.test(key)) {
        userScopedKeys.push(key);
      } else if (key === 'users') {
        systemKeys.push(key);
      } else if (obsoleteKeys.includes(key)) {
        userScopedKeys.push(key); // Will be deleted but not recreated
      }
    }

    // Remove user-scoped files
    if (userScopedKeys.length > 0) {
      console.log(colors.blue + '\n→ Removing user-scoped data files...' + colors.reset);
      
      for (const key of userScopedKeys) {
        // Determine what type of file this is
        let fileType = 'data';
        for (const [pattern, description] of Object.entries(fileTypes)) {
          if (key.startsWith(pattern)) {
            fileType = description;
            break;
          }
        }
        
        // Check if this is an obsolete file
        if (obsoleteKeys.includes(key)) {
          fileType = 'obsolete file';
        }
        
        console.log(`  → Removing ${fileType}: ${key}`);
        await storage.delete(key);
      }
    }

    // Reset users.json to empty array
    console.log(colors.blue + '\n→ Resetting system files...' + colors.reset);
    await storage.write('users', { users: [] });
    console.log(`  ✓ Reset users.json to empty state`);

    // Summary
    console.log('');
    console.log(colors.green + '✅ Application reset complete!' + colors.reset);
    console.log('');
    console.log('Summary:');
    console.log(`  • Storage Type: ${storageType.toUpperCase()}`);
    if (storageType === 's3') {
      console.log(`  • S3 Bucket: ${process.env.S3_BUCKET_NAME}`);
    }
    console.log(`  • Removed ${userScopedKeys.length} user-scoped data file(s)`);
    console.log(`  • Reset users.json to empty state`);
    
    const obsoleteCount = userScopedKeys.filter(k => obsoleteKeys.includes(k)).length;
    if (obsoleteCount > 0) {
      console.log(`  • Removed ${obsoleteCount} obsolete legacy file(s)`);
    }
    
    console.log('');
    console.log('The app is now in its initial state:');
    console.log('  • No user accounts exist');
    console.log('  • No bank accounts are connected');
    console.log('  • No transactions are stored');
    console.log('  • No categories or budgets exist');
    console.log('');
    console.log(colors.cyan + 'You can now:' + colors.reset);
    console.log('  1. Start the backend: cd backend && npm run dev');
    console.log('  2. Start the frontend: cd frontend && npm run dev');
    console.log('  3. Register a new account at http://localhost:5173');
    console.log('');
    console.log(colors.yellow + 'Note: If you were logged in, clear your browser\'s localStorage' + colors.reset);
    console.log('      or click logout to remove the cached authentication token.');
    console.log('');
    console.log(colors.cyan + '=========================================' + colors.reset);

  } catch (error) {
    console.error(colors.red + '\nError during reset:' + colors.reset, error);
    console.error('\nPossible causes:');
    
    if (storageType === 's3') {
      console.error('  • S3 bucket not configured or accessible');
      console.error('  • Missing AWS credentials or IAM permissions');
      console.error('  • Incorrect bucket name or region');
    } else {
      console.error('  • Data directory not accessible');
      console.error('  • File system permissions issue');
    }
    
    process.exit(1);
  }
}

// Run the reset
resetApp().catch(error => {
  console.error(colors.red + 'Unexpected error:', error.message + colors.reset);
  process.exit(1);
});