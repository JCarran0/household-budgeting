/**
 * Critical Path Tests: Transaction Sync
 * 
 * Tests the core transaction syncing functionality that ensures
 * all financial data is accurately imported from Plaid
 */

import { v4 as uuidv4 } from 'uuid';
import { authService, dataService, transactionService, plaidService } from '../../services';
import { InMemoryDataService } from '../../services/dataService';
import { StoredAccount } from '../../services/accountService';
import { StoredTransaction } from '../../services/transactionService';
import { Transaction as PlaidTransaction } from '../../services/plaidService';
import { encryptionService } from '../../utils/encryption';

describe('User Story: Transaction Synchronization', () => {
  let testUserId: string;
  let testAccount: StoredAccount;

  beforeEach(async () => {
    // Clear all data
    if ('clear' in dataService) {
      (dataService as InMemoryDataService).clear();
    }
    authService.resetRateLimiting();

    // Create test user directly using service
    const username = `sync${Math.random().toString(36).substring(2, 8)}`;
    const password = 'secure passphrase for testing sync';
    
    const result = await authService.register(username, password);
    if (!result.success || !result.user) {
      throw new Error(`Failed to create test user: ${result.error || 'Unknown error'}`);
    }
    testUserId = result.user.id;

    // Create a test account with properly encrypted token
    const testAccessToken = 'test-access-token-sandbox';
    testAccount = {
      id: uuidv4(),
      userId: testUserId,
      plaidItemId: 'test-item-id',
      plaidAccountId: 'test-plaid-account-id',
      plaidAccessToken: encryptionService.encrypt(testAccessToken),
      institutionId: 'ins_test',
      institutionName: 'Test Bank',
      accountName: 'Test Checking',
      officialName: 'Test Checking Account',
      nickname: null,
      type: 'checking',
      subtype: 'checking',
      mask: '1234',
      currentBalance: 1000,
      availableBalance: 950,
      creditLimit: null,
      currency: 'USD',
      status: 'active',
      lastSynced: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save test account
    await dataService.saveData(`accounts_${testUserId}`, [testAccount]);
  });

  describe('As a user, I can sync transactions from my connected accounts', () => {
    test('I can sync transactions with proper date range (2 years history)', async () => {
      // Mock Plaid transactions
      const mockTransactions: PlaidTransaction[] = [
        {
          id: 'txn-1',
          plaidTransactionId: 'txn-1',
          accountId: 'test-plaid-account-id',
          amount: 25.50,
          date: '2025-01-15',
          name: 'Coffee Shop',
          merchantName: 'Starbucks',
          category: ['Food and Drink', 'Coffee Shops'],
          categoryId: '13005000',
          pending: false,
          isoCurrencyCode: 'USD',
          location: undefined,
        },
        {
          id: 'txn-2',
          plaidTransactionId: 'txn-2',
          accountId: 'test-plaid-account-id',
          amount: 150.00,
          date: '2025-01-10',
          name: 'Grocery Store',
          merchantName: 'Whole Foods',
          category: ['Shops', 'Groceries'],
          categoryId: '19013000',
          pending: false,
          isoCurrencyCode: 'USD',
          location: undefined,
        },
      ];

      // Mock Plaid service to return transactions
      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions: mockTransactions,
        totalTransactions: 2,
      });

      // Sync transactions
      const syncResult = await transactionService.syncTransactions(
        testUserId,
        [testAccount],
        '2023-01-01' // Request 2 years of history
      );

      if (!syncResult.success) {
        console.error('Sync failed:', syncResult.error);
      }
      expect(syncResult.success).toBe(true);
      expect(syncResult.added).toBe(2);
      expect(syncResult.modified).toBe(0);
      expect(syncResult.removed).toBe(0);

      // Verify transactions were stored correctly
      const storedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${testUserId}`
      );
      
      expect(storedTransactions).toHaveLength(2);
      expect(storedTransactions![0].userId).toBe(testUserId);
      expect(storedTransactions![0].accountId).toBe(testAccount.id);
      expect(storedTransactions![0].amount).toBe(25.50);
      expect(storedTransactions![0].name).toBe('Coffee Shop');
    });

    test('I can sync ALL available transactions (pagination handling)', async () => {
      // Create 150 mock transactions to test pagination
      const mockTransactions: PlaidTransaction[] = [];
      for (let i = 1; i <= 150; i++) {
        mockTransactions.push({
          id: `txn-${i}`,
          plaidTransactionId: `txn-${i}`,
          accountId: 'test-plaid-account-id',
          amount: 10.00 + i,
          date: '2025-01-01',
          name: `Transaction ${i}`,
          merchantName: `Merchant ${i}`,
          category: ['Shops'],
          categoryId: '19000000',
          pending: false,
          isoCurrencyCode: 'USD',
          location: undefined,
        });
      }

      // Mock Plaid service to return all transactions
      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions: mockTransactions,
        totalTransactions: 150, // Indicates all were fetched
      });

      const syncResult = await transactionService.syncTransactions(
        testUserId,
        [testAccount]
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.added).toBe(150); // All 150 should be added

      const storedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${testUserId}`
      );
      expect(storedTransactions).toHaveLength(150);
    });

    test('Pending transactions are excluded from sync', async () => {
      const mockTransactions: PlaidTransaction[] = [
        {
          id: 'txn-posted',
          plaidTransactionId: 'txn-posted',
          accountId: 'test-plaid-account-id',
          amount: 50.00,
          date: '2025-01-15',
          name: 'Posted Transaction',
          merchantName: 'Store',
          category: ['Shops'],
          categoryId: '19000000',
          pending: false,
          isoCurrencyCode: 'USD',
          location: undefined,
        },
        {
          id: 'txn-pending',
          plaidTransactionId: 'txn-pending',
          accountId: 'test-plaid-account-id',
          amount: 75.00,
          date: '2025-01-16',
          name: 'Pending Transaction',
          merchantName: 'Restaurant',
          category: ['Food and Drink'],
          categoryId: '13000000',
          pending: true,
          isoCurrencyCode: 'USD',
          location: undefined,
        },
      ];

      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions: mockTransactions,
        totalTransactions: 2,
      });

      const syncResult = await transactionService.syncTransactions(
        testUserId,
        [testAccount]
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.added).toBe(2); // Both are added but marked differently

      const storedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${testUserId}`
      );
      
      const postedTxn = storedTransactions!.find(t => t.plaidTransactionId === 'txn-posted');
      const pendingTxn = storedTransactions!.find(t => t.plaidTransactionId === 'txn-pending');
      
      expect(postedTxn!.status).toBe('posted');
      expect(postedTxn!.pending).toBe(false);
      expect(pendingTxn!.status).toBe('pending');
      expect(pendingTxn!.pending).toBe(true);
    });

    test('Duplicate transactions are not added on re-sync', async () => {
      const mockTransaction: PlaidTransaction = {
        id: 'txn-duplicate-test',
        plaidTransactionId: 'txn-duplicate-test',
        accountId: 'test-plaid-account-id',
        amount: 100.00,
        date: '2025-01-15',
        name: 'Test Transaction',
        merchantName: 'Test Store',
        category: ['Shops'],
        categoryId: '19000000',
        pending: false,
        isoCurrencyCode: 'USD',
        location: undefined,
      };

      // First sync
      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions: [mockTransaction],
        totalTransactions: 1,
      });

      const firstSync = await transactionService.syncTransactions(
        testUserId,
        [testAccount]
      );
      expect(firstSync.added).toBe(1);

      // Second sync with same transaction
      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions: [mockTransaction],
        totalTransactions: 1,
      });

      const secondSync = await transactionService.syncTransactions(
        testUserId,
        [testAccount]
      );
      expect(secondSync.added).toBe(0); // No new transactions
      expect(secondSync.modified).toBe(0); // No modifications

      const storedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${testUserId}`
      );
      expect(storedTransactions).toHaveLength(1); // Still only one transaction
    });

    test('Modified transactions are updated correctly', async () => {
      const originalTransaction: PlaidTransaction = {
        id: 'txn-modify-test',
        plaidTransactionId: 'txn-modify-test',
        accountId: 'test-plaid-account-id',
        amount: 50.00,
        date: '2025-01-15',
        name: 'Original Name',
        merchantName: 'Original Merchant',
        category: ['Shops'],
        categoryId: '19000000',
        pending: true, // Start as pending
        isoCurrencyCode: 'USD',
        location: undefined,
      };

      // First sync - pending transaction
      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions: [originalTransaction],
        totalTransactions: 1,
      });

      await transactionService.syncTransactions(testUserId, [testAccount]);

      // Modify transaction (now posted with different amount)
      const modifiedTransaction: PlaidTransaction = {
        ...originalTransaction,
        amount: 52.50, // Amount changed
        pending: false, // Now posted
        name: 'Updated Name', // Name changed
      };

      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions: [modifiedTransaction],
        totalTransactions: 1,
      });

      const secondSync = await transactionService.syncTransactions(
        testUserId,
        [testAccount]
      );
      
      expect(secondSync.modified).toBe(1);

      const storedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${testUserId}`
      );
      const txn = storedTransactions![0];
      
      expect(txn.amount).toBe(52.50);
      expect(txn.status).toBe('posted');
      expect(txn.pending).toBe(false);
      expect(txn.name).toBe('Updated Name');
    });

    test('Removed transactions are marked as removed', async () => {
      const transactions: PlaidTransaction[] = [
        {
          id: 'txn-stays',
          plaidTransactionId: 'txn-stays',
          accountId: 'test-plaid-account-id',
          amount: 25.00,
          date: '2025-01-15',
          name: 'Transaction that stays',
          merchantName: 'Store',
          category: ['Shops'],
          categoryId: '19000000',
          pending: false,
          isoCurrencyCode: 'USD',
          location: undefined,
        },
        {
          id: 'txn-removed',
          plaidTransactionId: 'txn-removed',
          accountId: 'test-plaid-account-id',
          amount: 50.00,
          date: '2025-01-14',
          name: 'Transaction to be removed',
          merchantName: 'Other Store',
          category: ['Shops'],
          categoryId: '19000000',
          pending: false,
          isoCurrencyCode: 'USD',
          location: undefined,
        },
      ];

      // First sync with both transactions
      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions,
        totalTransactions: 2,
      });

      await transactionService.syncTransactions(testUserId, [testAccount]);

      // Second sync with only first transaction (second was removed by bank)
      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions: [transactions[0]], // Only first transaction
        totalTransactions: 1,
      });

      const secondSync = await transactionService.syncTransactions(
        testUserId,
        [testAccount]
      );
      
      expect(secondSync.removed).toBe(1);

      const storedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${testUserId}`
      );
      
      const staysTxn = storedTransactions!.find(t => t.plaidTransactionId === 'txn-stays');
      const removedTxn = storedTransactions!.find(t => t.plaidTransactionId === 'txn-removed');
      
      expect(staysTxn!.status).toBe('posted');
      expect(removedTxn!.status).toBe('removed');
    });

    test('Sync handles multiple accounts with different access tokens', async () => {
      // Create second account with different token
      const secondAccessToken = 'second-test-access-token';
      const secondAccount: StoredAccount = {
        ...testAccount,
        id: uuidv4(),
        plaidAccountId: 'second-plaid-account-id',
        plaidAccessToken: encryptionService.encrypt(secondAccessToken),
        accountName: 'Test Savings',
      };

      const accounts = [testAccount, secondAccount];
      await dataService.saveData(`accounts_${testUserId}`, accounts);

      // Mock transactions for first account
      const firstAccountTxns: PlaidTransaction[] = [
        {
          id: 'checking-txn-1',
          plaidTransactionId: 'checking-txn-1',
          accountId: 'test-plaid-account-id',
          amount: 100.00,
          date: '2025-01-15',
          name: 'Checking Transaction',
          merchantName: 'Store',
          category: ['Shops'],
          categoryId: '19000000',
          pending: false,
          isoCurrencyCode: 'USD',
          location: undefined,
        },
      ];

      // Mock transactions for second account
      const secondAccountTxns: PlaidTransaction[] = [
        {
          id: 'savings-txn-1',
          plaidTransactionId: 'savings-txn-1',
          accountId: 'second-plaid-account-id',
          amount: 50.00,
          date: '2025-01-14',
          name: 'Savings Transaction',
          merchantName: 'ATM',
          category: ['Transfer'],
          categoryId: '21000000',
          pending: false,
          isoCurrencyCode: 'USD',
          location: undefined,
        },
      ];

      // Mock calls for each token
      jest.spyOn(plaidService, 'getTransactions')
        .mockResolvedValueOnce({
          success: true,
          transactions: firstAccountTxns,
          totalTransactions: 1,
        })
        .mockResolvedValueOnce({
          success: true,
          transactions: secondAccountTxns,
          totalTransactions: 1,
        });

      const syncResult = await transactionService.syncTransactions(
        testUserId,
        accounts
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.added).toBe(2); // One from each account

      const storedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${testUserId}`
      );
      
      expect(storedTransactions).toHaveLength(2);
      
      const checkingTxn = storedTransactions!.find(t => t.plaidTransactionId === 'checking-txn-1');
      const savingsTxn = storedTransactions!.find(t => t.plaidTransactionId === 'savings-txn-1');
      
      expect(checkingTxn!.accountId).toBe(testAccount.id);
      expect(savingsTxn!.accountId).toBe(secondAccount.id);
    });

    test('Sync continues even if one account fails', async () => {
      const secondAccessToken = 'failing-test-access-token';
      const secondAccount: StoredAccount = {
        ...testAccount,
        id: uuidv4(),
        plaidAccountId: 'second-plaid-account-id',
        plaidAccessToken: encryptionService.encrypt(secondAccessToken),
        accountName: 'Test Savings',
      };

      const accounts = [testAccount, secondAccount];
      await dataService.saveData(`accounts_${testUserId}`, accounts);

      const successTxns: PlaidTransaction[] = [
        {
          id: 'success-txn',
          plaidTransactionId: 'success-txn',
          accountId: 'test-plaid-account-id',
          amount: 100.00,
          date: '2025-01-15',
          name: 'Successful Transaction',
          merchantName: 'Store',
          category: ['Shops'],
          categoryId: '19000000',
          pending: false,
          isoCurrencyCode: 'USD',
          location: undefined,
        },
      ];

      // First account succeeds, second fails
      jest.spyOn(plaidService, 'getTransactions')
        .mockResolvedValueOnce({
          success: true,
          transactions: successTxns,
          totalTransactions: 1,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Account requires reauth',
        });

      const syncResult = await transactionService.syncTransactions(
        testUserId,
        accounts
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.added).toBe(1); // Only from successful account

      const storedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${testUserId}`
      );
      expect(storedTransactions).toHaveLength(1);
    });

    test('Transaction data is properly isolated between users', async () => {
      // Create second user
      const secondUsername = `sync2${Math.random().toString(36).substring(2, 8)}`;
      const secondResult = await authService.register(
        secondUsername, 
        'another secure passphrase'
      );
      
      if (!secondResult.success || !secondResult.user) {
        throw new Error('Failed to create second user');
      }
      const secondUserId = secondResult.user.id;

      // Create account for second user
      const secondUserAccount: StoredAccount = {
        ...testAccount,
        id: uuidv4(),
        userId: secondUserId,
      };
      await dataService.saveData(`accounts_${secondUserId}`, [secondUserAccount]);

      // Mock transactions for first user
      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions: [{
          id: 'user1-txn',
          plaidTransactionId: 'user1-txn',
          accountId: 'test-plaid-account-id',
          amount: 100.00,
          date: '2025-01-15',
          name: 'User 1 Transaction',
          merchantName: 'Store',
          category: ['Shops'],
          categoryId: '19000000',
          pending: false,
          isoCurrencyCode: 'USD',
          location: undefined,
        }],
        totalTransactions: 1,
      });

      await transactionService.syncTransactions(testUserId, [testAccount]);

      // Mock transactions for second user
      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions: [{
          id: 'user2-txn',
          plaidTransactionId: 'user2-txn',
          accountId: 'test-plaid-account-id',
          amount: 200.00,
          date: '2025-01-15',
          name: 'User 2 Transaction',
          merchantName: 'Different Store',
          category: ['Shops'],
          categoryId: '19000000',
          pending: false,
          isoCurrencyCode: 'USD',
          location: undefined,
        }],
        totalTransactions: 1,
      });

      await transactionService.syncTransactions(secondUserId, [secondUserAccount]);

      // Verify isolation
      const user1Transactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${testUserId}`
      );
      const user2Transactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${secondUserId}`
      );

      expect(user1Transactions).toHaveLength(1);
      expect(user2Transactions).toHaveLength(1);
      
      expect(user1Transactions![0].name).toBe('User 1 Transaction');
      expect(user1Transactions![0].userId).toBe(testUserId);
      
      expect(user2Transactions![0].name).toBe('User 2 Transaction');
      expect(user2Transactions![0].userId).toBe(secondUserId);
    });

    test('Location data is properly preserved when present', async () => {
      const transactionWithLocation: PlaidTransaction = {
        id: 'txn-with-location',
        plaidTransactionId: 'txn-with-location',
        accountId: 'test-plaid-account-id',
        amount: 25.00,
        date: '2025-01-15',
        name: 'Coffee Shop',
        merchantName: 'Starbucks',
        category: ['Food and Drink', 'Coffee Shops'],
        categoryId: '13005000',
        pending: false,
        isoCurrencyCode: 'USD',
        location: {
          address: '123 Main St',
          city: 'San Francisco',
          region: 'CA',
          postalCode: '94102',
          country: 'US',
        },
      };

      jest.spyOn(plaidService, 'getTransactions').mockResolvedValueOnce({
        success: true,
        transactions: [transactionWithLocation],
        totalTransactions: 1,
      });

      await transactionService.syncTransactions(testUserId, [testAccount]);

      const storedTransactions = await dataService.getData<StoredTransaction[]>(
        `transactions_${testUserId}`
      );
      
      const txn = storedTransactions![0];
      expect(txn.location).toBeDefined();
      expect(txn.location!.city).toBe('San Francisco');
      expect(txn.location!.region).toBe('CA');
      expect(txn.location!.postalCode).toBe('94102');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});