/**
 * Category Deletion Cleanup - Integration Tests
 *
 * Tests for the category deletion workflow with discrete cleanup steps:
 * - Delete budgets for category
 * - Delete auto-categorization rules for category
 * - Bulk recategorize transactions to new category
 *
 * Each step is independent and can be retried individually.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  registerUser,
  authenticatedGet,
  authenticatedPost,
  authenticatedDelete,
  createCategory,
} from '../helpers/apiHelper';
import { authService, dataService } from '../../services';
import type { StoredTransaction } from '../../services/transactionService';

/**
 * Helper function to create a complete StoredTransaction object with defaults
 */
function createTestTransaction(
  userId: string,
  overrides: Partial<StoredTransaction>
): StoredTransaction {
  const now = new Date();
  return {
    id: uuidv4(),
    userId,
    accountId: 'test-account-1',
    plaidTransactionId: `txn-${uuidv4()}`,
    plaidAccountId: 'plaid-account-1',
    amount: 0,
    date: '2025-01-15',
    name: 'Test Transaction',
    userDescription: null,
    merchantName: null,
    category: null,
    plaidCategoryId: null,
    categoryId: null,
    status: 'posted',
    pending: false,
    isoCurrencyCode: 'USD',
    tags: [],
    notes: null,
    isHidden: false,
    isFlagged: false,
    isSplit: false,
    parentTransactionId: null,
    splitTransactionIds: [],
    accountOwner: null,
    originalDescription: null,
    location: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Category Deletion Cleanup Workflow', () => {
  let authToken: string;
  let userId: string;
  let categoryToDelete: string;
  let replacementCategory: string;

  beforeEach(async () => {
    // Clear all test data
    if ('clear' in dataService) {
      (dataService as any).clear();
    }
    // Reset rate limiting between tests
    authService.resetRateLimiting();

    // Create a test user
    const rand = Math.random().toString(36).substring(2, 8);
    const user = await registerUser(`cleanup${rand}`, 'category cleanup secure passphrase');
    authToken = user.token;
    // Services key all data by familyId, not the individual userId
    userId = user.familyId;

    // Create test categories
    const categoryA = await createCategory(authToken, 'Entertainment');
    categoryToDelete = categoryA.id;

    const categoryB = await createCategory(authToken, 'Groceries');
    replacementCategory = categoryB.id;
  });

  describe('Step 1: Delete Budgets for Category', () => {
    test('should delete all budgets for a category', async () => {
      // Create some budgets for the category
      await authenticatedPost('/api/v1/budgets', authToken, {
        categoryId: categoryToDelete,
        month: '2025-01',
        amount: 500,
      });
      await authenticatedPost('/api/v1/budgets', authToken, {
        categoryId: categoryToDelete,
        month: '2025-02',
        amount: 550,
      });
      await authenticatedPost('/api/v1/budgets', authToken, {
        categoryId: categoryToDelete,
        month: '2025-03',
        amount: 600,
      });

      // Verify budgets exist
      const budgetsResponse = await authenticatedGet('/api/v1/budgets', authToken);
      const budgetsForCategory = budgetsResponse.body.filter(
        (b: any) => b.categoryId === categoryToDelete
      );
      expect(budgetsForCategory).toHaveLength(3);

      // Delete budgets for category
      const deleteResponse = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/delete-budgets`,
        authToken
      );

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.deleted).toBe(3);

      // Verify budgets are gone
      const afterResponse = await authenticatedGet('/api/v1/budgets', authToken);
      const remainingBudgets = afterResponse.body.filter(
        (b: any) => b.categoryId === categoryToDelete
      );
      expect(remainingBudgets).toHaveLength(0);
    });

    test('should return 0 when category has no budgets', async () => {
      const deleteResponse = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/delete-budgets`,
        authToken
      );

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.deleted).toBe(0);
    });

    test('should not delete budgets from other categories', async () => {
      // Create budgets for different categories
      await authenticatedPost('/api/v1/budgets', authToken, {
        categoryId: categoryToDelete,
        month: '2025-01',
        amount: 500,
      });
      await authenticatedPost('/api/v1/budgets', authToken, {
        categoryId: replacementCategory,
        month: '2025-01',
        amount: 600,
      });

      // Delete budgets for one category
      await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/delete-budgets`,
        authToken
      );

      // Verify other category's budgets remain
      const afterResponse = await authenticatedGet('/api/v1/budgets', authToken);
      const replacementBudgets = afterResponse.body.filter(
        (b: any) => b.categoryId === replacementCategory
      );
      expect(replacementBudgets).toHaveLength(1);
      expect(replacementBudgets[0].amount).toBe(600);
    });
  });

  describe('Step 2: Delete Auto-Categorization Rules for Category', () => {
    test('should delete all rules for a category', async () => {
      // Create some rules for the category
      await authenticatedPost('/api/v1/autocategorize/rules', authToken, {
        description: 'Netflix',
        patterns: ['netflix'],
        categoryId: categoryToDelete,
        categoryName: 'Entertainment',
        isActive: true,
      });
      await authenticatedPost('/api/v1/autocategorize/rules', authToken, {
        description: 'Spotify',
        patterns: ['spotify'],
        categoryId: categoryToDelete,
        categoryName: 'Entertainment',
        isActive: true,
      });

      // Verify rules exist
      const rulesResponse = await authenticatedGet('/api/v1/autocategorize/rules', authToken);
      const rulesForCategory = rulesResponse.body.rules.filter(
        (r: any) => r.categoryId === categoryToDelete
      );
      expect(rulesForCategory).toHaveLength(2);

      // Delete rules for category
      const deleteResponse = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/delete-rules`,
        authToken
      );

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.deleted).toBe(2);

      // Verify rules are gone
      const afterResponse = await authenticatedGet('/api/v1/autocategorize/rules', authToken);
      const remainingRules = afterResponse.body.rules.filter(
        (r: any) => r.categoryId === categoryToDelete
      );
      expect(remainingRules).toHaveLength(0);
    });

    test('should return 0 when category has no rules', async () => {
      const deleteResponse = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/delete-rules`,
        authToken
      );

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.deleted).toBe(0);
    });

    test('should renumber priorities after deleting rules', async () => {
      // Create rules for different categories
      await authenticatedPost('/api/v1/autocategorize/rules', authToken, {
        description: 'Rule 1',
        patterns: ['pattern1'],
        categoryId: categoryToDelete,
        categoryName: 'Entertainment',
        isActive: true,
      });
      await authenticatedPost('/api/v1/autocategorize/rules', authToken, {
        description: 'Rule 2',
        patterns: ['pattern2'],
        categoryId: replacementCategory,
        categoryName: 'Groceries',
        isActive: true,
      });
      await authenticatedPost('/api/v1/autocategorize/rules', authToken, {
        description: 'Rule 3',
        patterns: ['pattern3'],
        categoryId: categoryToDelete,
        categoryName: 'Entertainment',
        isActive: true,
      });

      // Delete rules for one category
      await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/delete-rules`,
        authToken
      );

      // Verify remaining rules have sequential priorities
      const afterResponse = await authenticatedGet('/api/v1/autocategorize/rules', authToken);
      expect(afterResponse.body.rules).toHaveLength(1);
      expect(afterResponse.body.rules[0].priority).toBe(1);
      expect(afterResponse.body.rules[0].categoryId).toBe(replacementCategory);
    });
  });

  describe('Step 3: Bulk Recategorize Transactions', () => {
    test('should recategorize all transactions to a new category', async () => {
      // Create test transactions with the category to delete
      const transactions: StoredTransaction[] = [
        createTestTransaction(userId, {
          plaidTransactionId: 'txn1',
          categoryId: categoryToDelete,
          category: ['Entertainment', 'Streaming'],
          amount: 15.99,
          date: '2025-01-15',
          name: 'Netflix',
        }),
        createTestTransaction(userId, {
          plaidTransactionId: 'txn2',
          categoryId: categoryToDelete,
          category: ['Entertainment', 'Music'],
          amount: 9.99,
          date: '2025-01-16',
          name: 'Spotify',
        }),
        createTestTransaction(userId, {
          plaidTransactionId: 'txn3',
          categoryId: replacementCategory,
          category: ['Food', 'Groceries'],
          amount: 45.50,
          date: '2025-01-17',
          name: 'Safeway',
        }),
      ];

      await dataService.saveData(`transactions_${userId}`, transactions);

      // Recategorize transactions
      const recategorizeResponse = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/recategorize-transactions`,
        authToken,
        { newCategoryId: replacementCategory }
      );

      expect(recategorizeResponse.status).toBe(200);
      expect(recategorizeResponse.body.success).toBe(true);
      expect(recategorizeResponse.body.updated).toBe(2);

      // Verify transactions were updated
      const updatedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      );
      expect(updatedTransactions).toHaveLength(3);

      const recategorized = updatedTransactions!.filter(
        t => t.plaidTransactionId === 'txn1' || t.plaidTransactionId === 'txn2'
      );
      expect(recategorized).toHaveLength(2);
      recategorized.forEach(txn => {
        expect(txn.categoryId).toBe(replacementCategory);
      });

      // Verify other transaction unchanged
      const unchanged = updatedTransactions!.find(t => t.plaidTransactionId === 'txn3');
      expect(unchanged?.categoryId).toBe(replacementCategory);
    });

    test('should recategorize transactions to uncategorized (null)', async () => {
      // Create test transactions
      const transactions: StoredTransaction[] = [
        createTestTransaction(userId, {
          plaidTransactionId: 'txn1',
          categoryId: categoryToDelete,
          category: ['Entertainment', 'Streaming'],
          amount: 15.99,
          date: '2025-01-15',
          name: 'Netflix',
        }),
      ];

      await dataService.saveData(`transactions_${userId}`, transactions);

      // Recategorize to uncategorized (null)
      const recategorizeResponse = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/recategorize-transactions`,
        authToken,
        { newCategoryId: null }
      );

      expect(recategorizeResponse.status).toBe(200);
      expect(recategorizeResponse.body.success).toBe(true);
      expect(recategorizeResponse.body.updated).toBe(1);

      // Verify transaction is now uncategorized
      const updatedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      );
      expect(updatedTransactions![0].categoryId).toBeNull();
    });

    test('should return 0 when no transactions match the category', async () => {
      // Create transactions with different category
      const transactions: StoredTransaction[] = [
        createTestTransaction(userId, {
          plaidTransactionId: 'txn1',
          categoryId: replacementCategory,
          category: ['Food', 'Groceries'],
          amount: 45.50,
          date: '2025-01-17',
          name: 'Safeway',
        }),
      ];

      await dataService.saveData(`transactions_${userId}`, transactions);

      const recategorizeResponse = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/recategorize-transactions`,
        authToken,
        { newCategoryId: replacementCategory }
      );

      expect(recategorizeResponse.status).toBe(200);
      expect(recategorizeResponse.body.updated).toBe(0);
    });

    test('should validate newCategoryId parameter', async () => {
      const invalidResponse = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/recategorize-transactions`,
        authToken,
        { newCategoryId: 123 } // Invalid: should be string or null
      );

      expect(invalidResponse.status).toBe(400);
      expect(invalidResponse.body.error).toContain('Invalid newCategoryId');
    });
  });

  describe('Complete Workflow: End-to-End', () => {
    test('should successfully delete category after all cleanup steps', async () => {
      // Setup: Create budgets, rules, and transactions
      await authenticatedPost('/api/v1/budgets', authToken, {
        categoryId: categoryToDelete,
        month: '2025-01',
        amount: 500,
      });

      await authenticatedPost('/api/v1/autocategorize/rules', authToken, {
        description: 'Netflix',
        patterns: ['netflix'],
        categoryId: categoryToDelete,
        categoryName: 'Entertainment',
        isActive: true,
      });

      const transactions: StoredTransaction[] = [
        createTestTransaction(userId, {
          plaidTransactionId: 'txn1',
          categoryId: categoryToDelete,
          category: ['Entertainment', 'Streaming'],
          amount: 15.99,
          date: '2025-01-15',
          name: 'Netflix',
        }),
      ];
      await dataService.saveData(`transactions_${userId}`, transactions);

      // Verify category can't be deleted yet
      const beforeDelete = await authenticatedDelete(
        `/api/v1/categories/${categoryToDelete}`,
        authToken
      );
      expect(beforeDelete.status).toBe(400);
      expect(beforeDelete.body.error).toContain('Cannot delete category');

      // Step 1: Delete budgets
      const budgetsResult = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/delete-budgets`,
        authToken
      );
      expect(budgetsResult.body.deleted).toBe(1);

      // Step 2: Delete rules
      const rulesResult = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/delete-rules`,
        authToken
      );
      expect(rulesResult.body.deleted).toBe(1);

      // Step 3: Recategorize transactions
      const transactionsResult = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/recategorize-transactions`,
        authToken,
        { newCategoryId: replacementCategory }
      );
      expect(transactionsResult.body.updated).toBe(1);

      // Final: Category should now be deletable
      const finalDelete = await authenticatedDelete(
        `/api/v1/categories/${categoryToDelete}`,
        authToken
      );
      expect(finalDelete.status).toBe(204);

      // Verify category is gone
      const categoriesResponse = await authenticatedGet('/api/v1/categories', authToken);
      const deletedCategory = categoriesResponse.body.find(
        (c: any) => c.id === categoryToDelete
      );
      expect(deletedCategory).toBeUndefined();
    });

    test('should allow retrying failed steps independently', async () => {
      // Create multiple budgets
      await authenticatedPost('/api/v1/budgets', authToken, {
        categoryId: categoryToDelete,
        month: '2025-01',
        amount: 500,
      });
      await authenticatedPost('/api/v1/budgets', authToken, {
        categoryId: categoryToDelete,
        month: '2025-02',
        amount: 550,
      });

      // Delete budgets (simulating first attempt)
      const firstAttempt = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/delete-budgets`,
        authToken
      );
      expect(firstAttempt.body.deleted).toBe(2);

      // Retry deletion (should return 0 since already deleted)
      const retryAttempt = await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/delete-budgets`,
        authToken
      );
      expect(retryAttempt.status).toBe(200);
      expect(retryAttempt.body.deleted).toBe(0);

      // Verify this doesn't cause errors and is idempotent
      const budgetsResponse = await authenticatedGet('/api/v1/budgets', authToken);
      const remainingBudgets = budgetsResponse.body.filter(
        (b: any) => b.categoryId === categoryToDelete
      );
      expect(remainingBudgets).toHaveLength(0);
    });
  });

  describe('Data Isolation', () => {
    test('should not affect other users data during cleanup', async () => {
      // Create second user
      const rand2 = Math.random().toString(36).substring(2, 8);
      const user2 = await registerUser(`cleanup2${rand2}`, 'another user passphrase');

      // Create category for user2
      const user2Category = await createCategory(user2.token, 'User2 Entertainment');

      // Create budgets for both users
      await authenticatedPost('/api/v1/budgets', authToken, {
        categoryId: categoryToDelete,
        month: '2025-01',
        amount: 500,
      });
      await authenticatedPost('/api/v1/budgets', user2.token, {
        categoryId: user2Category.id,
        month: '2025-01',
        amount: 600,
      });

      // User1 deletes their budgets
      await authenticatedPost(
        `/api/v1/categories/${categoryToDelete}/delete-budgets`,
        authToken
      );

      // Verify user2's budgets are untouched
      const user2Budgets = await authenticatedGet('/api/v1/budgets', user2.token);
      expect(user2Budgets.body).toHaveLength(1);
      expect(user2Budgets.body[0].categoryId).toBe(user2Category.id);
      expect(user2Budgets.body[0].amount).toBe(600);
    });
  });
});
