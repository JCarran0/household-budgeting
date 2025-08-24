#!/usr/bin/env node

/**
 * Direct Plaid Service Test
 * Tests the Plaid service directly without going through Express
 */

require('dotenv').config();
const { PlaidService } = require('./dist/services/plaidService');

async function test() {
  console.log('🧪 Direct Plaid Sandbox Test\n');
  console.log('Environment variables:');
  console.log('  PLAID_CLIENT_ID:', process.env.PLAID_CLIENT_ID ? '✓ Set' : '✗ Missing');
  console.log('  PLAID_SECRET:', process.env.PLAID_SECRET ? '✓ Set' : '✗ Missing');
  console.log('  PLAID_ENV:', process.env.PLAID_ENV || 'sandbox');
  console.log('');

  const plaidService = new PlaidService();

  try {
    // Test 1: Create Link Token
    console.log('1. Creating Link Token...');
    const linkResult = await plaidService.createLinkToken('test-user-123');
    
    if (linkResult.success) {
      console.log('✅ Link token created successfully!');
      console.log('   Token:', linkResult.linkToken);
      console.log('   Expires:', linkResult.expiration);
    } else {
      console.log('❌ Failed to create link token:', linkResult.error);
      process.exit(1);
    }

    console.log('\n🎉 Plaid Sandbox is working correctly!');
    console.log('\n📝 Next steps:');
    console.log('   1. Use the link token in Plaid Link UI');
    console.log('   2. Login with: user_good / pass_good');
    console.log('   3. Get public token from Link');
    console.log('   4. Exchange for access token');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

test();