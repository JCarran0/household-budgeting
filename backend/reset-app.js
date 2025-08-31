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

const DATA_DIR = path.join(__dirname, 'data');

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
  const confirmed = await confirmReset();
  
  if (!confirmed) {
    console.log(colors.yellow + '\nReset cancelled.' + colors.reset);
    process.exit(0);
  }

  console.log('\n' + colors.blue + 'Resetting application data...' + colors.reset);

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    console.log(colors.yellow + '→ Data directory does not exist. Creating it...' + colors.reset);
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Get all JSON files in the data directory
  const files = fs.readdirSync(DATA_DIR).filter(file => file.endsWith('.json'));
  
  // Remove each file
  const fileTypes = {
    'users.json': 'user accounts',
    'accounts_': 'connected bank accounts',
    'transactions_': 'transactions',
    'categories_': 'categories',
    'categories.json': 'legacy categories',
    'budgets_': 'budgets',
    'budgets.json': 'legacy budgets',
    'autocategorize_rules_': 'auto-categorization rules'
  };

  files.forEach(file => {
    const filePath = path.join(DATA_DIR, file);
    
    // Determine what type of file this is
    let fileType = 'data';
    for (const [pattern, description] of Object.entries(fileTypes)) {
      if (file.startsWith(pattern) || file === pattern) {
        fileType = description;
        break;
      }
    }
    
    console.log(`→ Removing ${fileType}: ${file}`);
    fs.unlinkSync(filePath);
  });

  // Create fresh data files
  console.log(colors.blue + '\n→ Creating fresh data files...' + colors.reset);

  const freshFiles = {
    'users.json': { users: [] },
    'categories.json': { categories: [] },
    'budgets.json': { budgets: [] }
  };

  for (const [filename, content] of Object.entries(freshFiles)) {
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    console.log(`  ✓ Created ${filename}`);
  }

  console.log('');
  console.log(colors.green + '✅ Application reset complete!' + colors.reset);
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