#!/usr/bin/env node

/**
 * Manual test script for budget API endpoints
 * Usage: node test-budgets.js
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001/api/v1';
let authToken = null;
let testCategoryId = null;

// Test user credentials
const TEST_USER = {
  username: 'otis',
  password: 'SuperSecure123!'
};

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
api.interceptors.request.use(config => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await api.post('/auth/login', TEST_USER);
    authToken = response.data.token;
    console.log('✅ Logged in successfully\n');
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

async function getTestCategory() {
  try {
    console.log('📋 Getting a test category...');
    const response = await api.get('/categories');
    if (response.data.length > 0) {
      testCategoryId = response.data[0].id;
      console.log(`✅ Using category: ${response.data[0].name} (${testCategoryId})\n`);
    } else {
      // Create a test category
      const newCat = await api.post('/categories', {
        name: 'Test Budget Category',
        parentId: null,
        plaidCategory: null,
        isHidden: false,
        isSavings: false
      });
      testCategoryId = newCat.data.id;
      console.log(`✅ Created test category: ${newCat.data.name} (${testCategoryId})\n`);
    }
  } catch (error) {
    console.error('❌ Failed to get category:', error.response?.data || error.message);
    process.exit(1);
  }
}

async function testCreateBudget() {
  try {
    console.log('➕ Testing POST /budgets...');
    const budgetData = {
      categoryId: testCategoryId,
      month: '2025-01',
      amount: 500
    };
    const response = await api.post('/budgets', budgetData);
    console.log('✅ Created budget:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return null;
  }
}

async function testUpdateBudget() {
  try {
    console.log('\n✏️  Testing budget update (POST /budgets with same category/month)...');
    const budgetData = {
      categoryId: testCategoryId,
      month: '2025-01',
      amount: 750
    };
    const response = await api.post('/budgets', budgetData);
    console.log('✅ Updated budget amount to:', response.data.amount);
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return null;
  }
}

async function testGetMonthlyBudgets() {
  try {
    console.log('\n📅 Testing GET /budgets/month/2025-01...');
    const response = await api.get('/budgets/month/2025-01');
    console.log(`✅ Got ${response.data.budgets.length} budgets for January 2025`);
    console.log(`   Total budget: $${response.data.total}`);
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return null;
  }
}

async function testCreateMultipleBudgets() {
  try {
    console.log('\n➕ Creating multiple budgets for testing...');
    
    // Get more categories
    const categoriesResp = await api.get('/categories');
    const categories = categoriesResp.data.slice(0, 5); // Use first 5 categories
    
    const budgets = [];
    for (const category of categories) {
      const budget = await api.post('/budgets', {
        categoryId: category.id,
        month: '2025-02',
        amount: Math.floor(Math.random() * 1000) + 100
      });
      budgets.push(budget.data);
      console.log(`   Created budget for ${category.name}: $${budget.data.amount}`);
    }
    
    return budgets;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return [];
  }
}

async function testCopyBudgets() {
  try {
    console.log('\n📋 Testing POST /budgets/copy...');
    const response = await api.post('/budgets/copy', {
      fromMonth: '2025-02',
      toMonth: '2025-03'
    });
    console.log(`✅ ${response.data.message}`);
    return response.data.budgets;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return [];
  }
}

async function testBudgetComparison() {
  try {
    console.log('\n📊 Testing POST /budgets/comparison/2025-02...');
    
    // Create some "actual" spending data
    const budgetsResp = await api.get('/budgets/month/2025-02');
    const actuals = {};
    
    budgetsResp.data.budgets.forEach(budget => {
      // Generate random actual spending (some over, some under budget)
      actuals[budget.categoryId] = Math.floor(budget.amount * (Math.random() * 1.5 + 0.5));
    });
    
    const response = await api.post('/budgets/comparison/2025-02', { actuals });
    
    console.log('✅ Budget vs Actual Comparison:');
    console.log(`   Total Budgeted: $${response.data.totals.budgeted}`);
    console.log(`   Total Actual: $${response.data.totals.actual}`);
    console.log(`   Total Remaining: $${response.data.totals.remaining}`);
    console.log(`   Percent Used: ${response.data.totals.percentUsed}%`);
    console.log(`   Over Budget: ${response.data.totals.isOverBudget ? 'Yes' : 'No'}`);
    
    // Show details for each category
    console.log('\n   Category Details:');
    response.data.comparisons.slice(0, 3).forEach(comp => {
      const status = comp.isOverBudget ? '🔴' : '🟢';
      console.log(`   ${status} Category ${comp.categoryId}: $${comp.actual}/$${comp.budgeted} (${comp.percentUsed}%)`);
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return null;
  }
}

async function testBudgetHistory() {
  try {
    console.log(`\n📈 Testing GET /budgets/history/${testCategoryId}...`);
    
    // Create budgets for multiple months
    for (let month = 1; month <= 3; month++) {
      await api.post('/budgets', {
        categoryId: testCategoryId,
        month: `2025-0${month}`,
        amount: 500 + (month * 50)
      });
    }
    
    const response = await api.get(`/budgets/history/${testCategoryId}`, {
      params: {
        startMonth: '2025-01',
        endMonth: '2025-03'
      }
    });
    
    console.log(`✅ Budget history for category:`);
    console.log(`   Period: ${response.data.startMonth} to ${response.data.endMonth}`);
    console.log(`   Number of budgets: ${response.data.count}`);
    console.log(`   Average budget: $${response.data.average}`);
    
    response.data.history.forEach(budget => {
      console.log(`   ${budget.month}: $${budget.amount}`);
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return null;
  }
}

async function testRollover() {
  try {
    console.log('\n💰 Testing POST /budgets/rollover...');
    
    // First ensure we have a budget for the target month
    await api.post('/budgets', {
      categoryId: testCategoryId,
      month: '2025-04',
      amount: 600
    });
    
    const response = await api.post('/budgets/rollover', {
      categoryId: testCategoryId,
      fromMonth: '2025-03',
      toMonth: '2025-04',
      actualSpent: 400  // Spent less than budgeted in March
    });
    
    if (response.data.rolloverAmount > 0) {
      console.log(`✅ Rollover applied:`);
      console.log(`   Rollover amount: $${response.data.rolloverAmount}`);
      console.log(`   New budget for ${response.data.toMonth}: $${response.data.updatedBudget.amount}`);
    } else {
      console.log(`✅ ${response.data.message}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return null;
  }
}

async function testGetAllBudgets() {
  try {
    console.log('\n📋 Testing GET /budgets...');
    const response = await api.get('/budgets');
    console.log(`✅ Got ${response.data.length} total budgets`);
    
    // Group by month
    const byMonth = {};
    response.data.forEach(budget => {
      byMonth[budget.month] = (byMonth[budget.month] || 0) + 1;
    });
    
    Object.entries(byMonth).forEach(([month, count]) => {
      console.log(`   ${month}: ${count} budgets`);
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return [];
  }
}

async function testDeleteBudget() {
  try {
    console.log('\n🗑️  Testing DELETE /budgets/:id...');
    
    // Get a budget to delete
    const budgets = await api.get('/budgets');
    if (budgets.data.length > 0) {
      const budgetToDelete = budgets.data[0];
      await api.delete(`/budgets/${budgetToDelete.id}`);
      console.log('✅ Budget deleted successfully');
      return true;
    } else {
      console.log('⚠️  No budgets to delete');
      return false;
    }
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return false;
  }
}

async function runTests() {
  console.log('='.repeat(50));
  console.log('BUDGET API TEST SUITE');
  console.log('='.repeat(50));

  // Setup
  await login();
  await getTestCategory();

  // Test CRUD operations
  await testCreateBudget();
  await testUpdateBudget();
  await testGetMonthlyBudgets();

  // Test bulk operations
  await testCreateMultipleBudgets();
  await testCopyBudgets();

  // Test analysis features
  await testBudgetComparison();
  await testBudgetHistory();
  await testRollover();

  // Test retrieval and cleanup
  await testGetAllBudgets();
  await testDeleteBudget();

  console.log('\n' + '='.repeat(50));
  console.log('✅ ALL TESTS COMPLETED');
  console.log('='.repeat(50));
}

// Run the tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});