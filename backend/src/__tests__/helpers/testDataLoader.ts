/**
 * Test Data Loader
 * Utilities for loading and managing test fixture data
 */

import fs from 'fs-extra';
import path from 'path';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

export interface TestUser {
  id: string;
  username: string;
  password: string;
  passwordHash: string;
  createdAt: string;
}

export interface TestAccount {
  id: string;
  userId: string;
  plaidAccountId: string;
  institutionName: string;
  accountName: string;
  type: string;
  subtype: string;
  currentBalance: number;
  availableBalance: number | null;
}

export interface TestTransaction {
  id: string;
  userId: string;
  accountId: string;
  amount: number;
  date: string;
  name: string;
  userDescription: string | null;
  merchantName: string | null;
  categoryId: string | null;
  userCategoryId: string | null;
  tags: string[];
  isHidden: boolean;
}

/**
 * Load test user data from fixtures
 */
export async function loadTestUser(username: string): Promise<{
  user: TestUser;
  accounts: TestAccount[];
}> {
  const userFile = path.join(FIXTURES_DIR, 'users', `${username}.json`);
  const data = await fs.readJson(userFile);
  return {
    user: data.user,
    accounts: data.accounts,
  };
}

/**
 * Load sample transactions from fixtures
 */
export async function loadSampleTransactions(): Promise<TestTransaction[]> {
  const transFile = path.join(FIXTURES_DIR, 'transactions', 'sample_30_days.json');
  return await fs.readJson(transFile);
}

/**
 * Create a copy of the test database for isolation
 */
export async function createTestDatabase(testId: string): Promise<string> {
  const testDataDir = path.join(process.cwd(), 'data', `test_${testId}`);
  await fs.ensureDir(testDataDir);
  return testDataDir;
}

/**
 * Clean up test database after tests
 */
export async function cleanupTestDatabase(testId: string): Promise<void> {
  const testDataDir = path.join(process.cwd(), 'data', `test_${testId}`);
  await fs.remove(testDataDir);
}

/**
 * Setup test data in the database
 */
export async function setupTestData(dataDir: string, userData: any, transactions?: any[]): Promise<void> {
  // Write user data
  const users = { users: [userData.user] };
  await fs.writeJson(path.join(dataDir, 'users.json'), users);
  
  // Write account data
  const userId = userData.user.id;
  await fs.writeJson(
    path.join(dataDir, `accounts_${userId}.json`),
    userData.accounts
  );
  
  // Write transaction data if provided
  if (transactions) {
    await fs.writeJson(
      path.join(dataDir, `transactions_${userId}.json`),
      transactions
    );
  }
  
  // Initialize empty categories
  await fs.writeJson(path.join(dataDir, `categories_${userId}.json`), []);
  
  // Legacy budgets.json no longer needed - using user-scoped files
}

/**
 * Get test fixtures path
 */
export function getFixturePath(...segments: string[]): string {
  return path.join(FIXTURES_DIR, ...segments);
}