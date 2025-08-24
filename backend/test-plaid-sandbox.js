#!/usr/bin/env node

/**
 * Quick Plaid Sandbox Test Script
 * Run with: node test-plaid-sandbox.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api/v1';
let authToken = '';
let userId = '';

async function test() {
  console.log('🧪 Testing Plaid Sandbox Integration\n');

  try {
    // 1. Register a test user
    console.log('1. Registering test user...');
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits
    const registerRes = await axios.post(`${API_BASE}/auth/register`, {
      username: `plaid_${timestamp}`,
      password: 'TestPass123!'
    });
    authToken = registerRes.data.token;
    userId = registerRes.data.userId;
    console.log('✅ User registered, token received\n');

    // 2. Create a link token
    console.log('2. Creating Plaid Link token...');
    const linkRes = await axios.post(
      `${API_BASE}/plaid/link-token`,
      {},
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    console.log('✅ Link token created:', linkRes.data.linkToken);
    console.log('   Expires:', linkRes.data.expiration, '\n');

    // 3. Note about manual testing
    console.log('📝 MANUAL TESTING REQUIRED:');
    console.log('   1. Use this link token in Plaid Link UI');
    console.log('   2. Login with: user_good / pass_good');
    console.log('   3. Select Chase bank');
    console.log('   4. Exchange public token for access token\n');

    console.log('🎉 Sandbox API is working correctly!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Check if server is running
axios.get('http://localhost:3001/health')
  .then(() => test())
  .catch(() => {
    console.error('❌ Server not running. Start with: npm run dev');
    process.exit(1);
  });