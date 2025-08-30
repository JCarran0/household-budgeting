#!/usr/bin/env node

/**
 * Manual test script for category API endpoints
 * Usage: node test-categories.js
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001/api/v1';
let authToken = null;

// Test user credentials
const TEST_USER = {
  username: 'otis',
  password: 'SuperSecure123!'
};

// Create axios instance with auth header
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

async function testGetCategories() {
  try {
    console.log('📋 Testing GET /categories...');
    const response = await api.get('/categories');
    console.log(`✅ Got ${response.data.length} categories`);
    if (response.data.length > 0) {
      console.log('Sample category:', JSON.stringify(response.data[0], null, 2));
    }
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return [];
  }
}

async function testInitializeCategories() {
  try {
    console.log('\n🚀 Testing POST /categories/initialize...');
    const response = await api.post('/categories/initialize');
    console.log(`✅ Initialized ${response.data.categories.length} default categories`);
    return response.data.categories;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return [];
  }
}

async function testCreateCategory() {
  try {
    console.log('\n➕ Testing POST /categories...');
    const newCategory = {
      name: 'Test Category',
      parentId: null,
      plaidCategory: null,
      isHidden: false,
      isSavings: false
    };
    const response = await api.post('/categories', newCategory);
    console.log('✅ Created category:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return null;
  }
}

async function testCreateSubcategory(parentId) {
  try {
    console.log('\n➕ Testing POST /categories (subcategory)...');
    const newSubcategory = {
      name: 'Test Subcategory',
      parentId: parentId,
      plaidCategory: null,
      isHidden: false,
      isSavings: false
    };
    const response = await api.post('/categories', newSubcategory);
    console.log('✅ Created subcategory:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return null;
  }
}

async function testUpdateCategory(categoryId) {
  try {
    console.log('\n✏️  Testing PUT /categories/:id...');
    const updates = {
      name: 'Updated Category Name',
      isHidden: true
    };
    const response = await api.put(`/categories/${categoryId}`, updates);
    console.log('✅ Updated category:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return null;
  }
}

async function testGetCategoryTree() {
  try {
    console.log('\n🌳 Testing GET /categories/tree...');
    const response = await api.get('/categories/tree');
    console.log(`✅ Got category tree with ${response.data.length} parent categories`);
    response.data.forEach(parent => {
      console.log(`  📁 ${parent.name} (${parent.children?.length || 0} subcategories)`);
      parent.children?.forEach(child => {
        console.log(`    └─ ${child.name}`);
      });
    });
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return [];
  }
}

async function testGetParentCategories() {
  try {
    console.log('\n📁 Testing GET /categories/parents...');
    const response = await api.get('/categories/parents');
    console.log(`✅ Got ${response.data.length} parent categories`);
    response.data.forEach(cat => {
      console.log(`  - ${cat.name}`);
    });
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return [];
  }
}

async function testGetSubcategories(parentId) {
  try {
    console.log(`\n📂 Testing GET /categories/${parentId}/subcategories...`);
    const response = await api.get(`/categories/${parentId}/subcategories`);
    console.log(`✅ Got ${response.data.length} subcategories`);
    response.data.forEach(cat => {
      console.log(`  - ${cat.name}`);
    });
    return response.data;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return [];
  }
}

async function testDeleteCategory(categoryId) {
  try {
    console.log(`\n🗑️  Testing DELETE /categories/${categoryId}...`);
    await api.delete(`/categories/${categoryId}`);
    console.log('✅ Category deleted successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
    return false;
  }
}

async function runTests() {
  console.log('='.repeat(50));
  console.log('CATEGORY API TEST SUITE');
  console.log('='.repeat(50));

  // Login first
  await login();

  // Get initial categories
  let categories = await testGetCategories();

  // Initialize default categories if none exist
  if (categories.length === 0) {
    categories = await testInitializeCategories();
  }

  // Create a test category
  const testCategory = await testCreateCategory();
  
  if (testCategory) {
    // Create a subcategory
    const subcategory = await testCreateSubcategory(testCategory.id);
    
    // Update the test category
    await testUpdateCategory(testCategory.id);
    
    // Get subcategories
    await testGetSubcategories(testCategory.id);
  }

  // Get category tree
  await testGetCategoryTree();

  // Get parent categories
  await testGetParentCategories();

  // Delete the test category (and its subcategories)
  if (testCategory) {
    await testDeleteCategory(testCategory.id);
  }

  // Final check
  await testGetCategories();

  console.log('\n' + '='.repeat(50));
  console.log('✅ ALL TESTS COMPLETED');
  console.log('='.repeat(50));
}

// Run the tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});