#!/usr/bin/env node

/**
 * Reset Household Budgeting App to Initial State
 * This script removes all user data and returns the app to a fresh state
 * 
 * Usage: node reset-app.js
 * Or with confirmation: node reset-app.js --force
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load environment variables if .env exists
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available or .env doesn't exist - that's OK
}

// Use DATA_DIR from environment or default to ./data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

console.log(colors.cyan + '=========================================');
console.log('  Household Budgeting App Reset Script');
console.log('=========================================' + colors.reset);
console.log('');

console.log(colors.red + 'WARNING: This will DELETE all:' + colors.reset);
console.log('  • User accounts and authentication data');
console.log('  • Connected bank accounts');
console.log('  • Synced transactions');
console.log('  • Categories and budgets');
console.log('  • Auto-categorization rules');
console.log('');

// Check for --force flag
const forceReset = process.argv.includes('--force');

async function confirmReset() {
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
    process.exit(1);
  }

  const confirmed = await confirmReset();
  
  if (!confirmed) {
    console.log(colors.yellow + '\nReset cancelled.' + colors.reset);
    process.exit(0);
  }

  console.log('\n' + colors.blue + 'Resetting application data...' + colors.reset);
  console.log('Data directory: ' + DATA_DIR);

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    console.log(colors.yellow + '→ Data directory does not exist. Creating it...' + colors.reset);
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Get all JSON files in the data directory
  const files = fs.readdirSync(DATA_DIR).filter(file => file.endsWith('.json'));
  
  // UUID pattern for user-scoped files
  const uuidPattern = /_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/;
  
  // File type patterns for logging
  const fileTypes = {
    'users.json': 'user accounts',
    'accounts_': 'connected bank accounts',
    'transactions_': 'transactions',
    'categories_': 'categories',
    'budgets_': 'budgets',
    'autocategorize_rules_': 'auto-categorization rules',
    'tags_': 'tags'
  };

  // Separate files into categories
  const userScopedFiles = [];
  const systemFiles = [];
  const obsoleteFiles = ['categories.json', 'budgets.json']; // Legacy files to remove
  
  files.forEach(file => {
    if (uuidPattern.test(file)) {
      userScopedFiles.push(file);
    } else if (file === 'users.json') {
      systemFiles.push(file);
    } else if (obsoleteFiles.includes(file)) {
      // Will be removed but not recreated
    }
  });

  // Remove user-scoped files
  if (userScopedFiles.length > 0) {
    console.log(colors.blue + '\n→ Removing user-scoped data files...' + colors.reset);
    userScopedFiles.forEach(file => {
      const filePath = path.join(DATA_DIR, file);
      
      // Determine what type of file this is
      let fileType = 'data';
      for (const [pattern, description] of Object.entries(fileTypes)) {
        if (file.startsWith(pattern)) {
          fileType = description;
          break;
        }
      }
      
      console.log(`  → Removing ${fileType}: ${file}`);
      fs.unlinkSync(filePath);
    });
  }

  // Remove obsolete files if they exist
  obsoleteFiles.forEach(file => {
    const filePath = path.join(DATA_DIR, file);
    if (fs.existsSync(filePath)) {
      console.log(colors.yellow + `  → Removing obsolete file: ${file}` + colors.reset);
      fs.unlinkSync(filePath);
    }
  });

  // Reset users.json to empty array
  console.log(colors.blue + '\n→ Resetting system files...' + colors.reset);
  const usersPath = path.join(DATA_DIR, 'users.json');
  fs.writeFileSync(usersPath, JSON.stringify({ users: [] }, null, 2));
  console.log(`  ✓ Reset users.json to empty state`)

  // Summary
  console.log('');
  console.log(colors.green + '✅ Application reset complete!' + colors.reset);
  console.log('');
  console.log('Summary:');
  console.log(`  • Removed ${userScopedFiles.length} user-scoped data file(s)`);
  console.log(`  • Reset users.json to empty state`);
  if (obsoleteFiles.some(f => fs.existsSync(path.join(DATA_DIR, f)))) {
    console.log(`  • Removed obsolete legacy files`);
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
  console.log(colors.cyan + '=========================================' + colors.reset);
}

// Run the reset
resetApp().catch(error => {
  console.error(colors.red + 'Error during reset:', error.message + colors.reset);
  process.exit(1);
});