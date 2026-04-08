/**
 * Unit tests for TransactionService mutation methods
 *
 * Pre-refactor coverage for R1 (Split TransactionService).
 * These tests lock in behavior before restructuring the code.
 *
 * Uses InMemoryDataService — no mocks, no filesystem, no network.
 */

import { InMemoryDataService } from '../../services/dataService';
import { TransactionService, StoredTransaction } from '../../services/transactionService';
import { PlaidService } from '../../services/plaidService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransactionService(): {
  dataService: InMemoryDataService;
  transactionService: TransactionService;
} {
  const dataService = new InMemoryDataService();
  const plaidService = new PlaidService();
  const transactionService = new TransactionService(dataService, plaidService);
  return { dataService, transactionService };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('TransactionService — mutations', () => {
  const userId = 'test-user-mutations';

  let dataService: InMemoryDataService;
  let transactionService: TransactionService;

  beforeEach(() => {
    ({ dataService, transactionService } = makeTransactionService());
  });

  // Helper — creates a minimal valid transaction in persistent storage.
  const createTransaction = (overrides: Partial<Parameters<TransactionService['createTestTransaction']>[0]> = {}): Promise<StoredTransaction> =>
    transactionService.createTestTransaction({
      userId,
      accountId: 'acct-1',
      plaidTransactionId: `plaid-${Math.random().toString(36).slice(2)}`,
      plaidAccountId: 'plaid-acct-1',
      amount: 25.00,
      date: '2025-06-15',
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
      location: null,
      ...overrides,
    });

  // Utility: re-read all transactions from storage.
  const readAllTransactions = async (): Promise<StoredTransaction[]> =>
    (await dataService.getData<StoredTransaction[]>(`transactions_${userId}`)) ?? [];

  // -------------------------------------------------------------------------
  // updateTransactionCategory
  // -------------------------------------------------------------------------

  describe('updateTransactionCategory', () => {
    it('updates the categoryId to the provided value', async () => {
      const txn = await createTransaction();

      const result = await transactionService.updateTransactionCategory(userId, txn.id, 'FOOD_AND_DRINK');

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.categoryId).toBe('FOOD_AND_DRINK');
    });

    it('sets categoryId to null (uncategorizes the transaction)', async () => {
      const txn = await createTransaction({ categoryId: 'FOOD_AND_DRINK' });

      const result = await transactionService.updateTransactionCategory(userId, txn.id, null);

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.categoryId).toBeNull();
    });

    it('returns an error when the transaction does not exist', async () => {
      const result = await transactionService.updateTransactionCategory(userId, 'nonexistent-id', 'FOOD_AND_DRINK');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('updates the updatedAt timestamp', async () => {
      const txn = await createTransaction();
      const before = new Date(txn.updatedAt);

      // Ensure at least 1 ms passes so timestamps can differ.
      await new Promise(resolve => setTimeout(resolve, 2));

      await transactionService.updateTransactionCategory(userId, txn.id, 'FOOD_AND_DRINK');

      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    });
  });

  // -------------------------------------------------------------------------
  // addTransactionTags  (replaces existing tags)
  // -------------------------------------------------------------------------

  describe('addTransactionTags', () => {
    it('sets tags on a transaction that had none', async () => {
      const txn = await createTransaction({ tags: [] });

      const result = await transactionService.addTransactionTags(userId, txn.id, ['groceries', 'monthly']);

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.tags).toEqual(['groceries', 'monthly']);
    });

    it('replaces existing tags entirely', async () => {
      const txn = await createTransaction({ tags: ['old-tag', 'another-old'] });

      await transactionService.addTransactionTags(userId, txn.id, ['new-tag']);

      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.tags).toEqual(['new-tag']);
      expect(stored?.tags).not.toContain('old-tag');
    });

    it('returns an error when the transaction does not exist', async () => {
      const result = await transactionService.addTransactionTags(userId, 'nonexistent-id', ['tag']);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // appendTransactionTags  (merges tags, deduplicates)
  // -------------------------------------------------------------------------

  describe('appendTransactionTags', () => {
    it('adds new tags to existing ones', async () => {
      const txn = await createTransaction({ tags: ['existing'] });

      const result = await transactionService.appendTransactionTags(userId, txn.id, ['new-tag']);

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.tags).toContain('existing');
      expect(stored?.tags).toContain('new-tag');
    });

    it('deduplicates tags so no tag appears twice', async () => {
      const txn = await createTransaction({ tags: ['dup', 'unique'] });

      await transactionService.appendTransactionTags(userId, txn.id, ['dup', 'extra']);

      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      const dupCount = stored?.tags.filter(t => t === 'dup').length ?? 0;
      expect(dupCount).toBe(1);
      expect(stored?.tags).toContain('extra');
    });

    it('returns success without modifying the transaction when all tags already exist', async () => {
      const txn = await createTransaction({ tags: ['a', 'b'] });

      const result = await transactionService.appendTransactionTags(userId, txn.id, ['a', 'b']);

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.tags).toEqual(['a', 'b']);
    });

    it('returns an error when the transaction does not exist', async () => {
      const result = await transactionService.appendTransactionTags(userId, 'nonexistent-id', ['tag']);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // removeTransactionTags
  // -------------------------------------------------------------------------

  describe('removeTransactionTags', () => {
    it('removes the specified tags from the transaction', async () => {
      const txn = await createTransaction({ tags: ['keep', 'remove-me'] });

      const result = await transactionService.removeTransactionTags(userId, txn.id, ['remove-me']);

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.tags).toEqual(['keep']);
      expect(stored?.tags).not.toContain('remove-me');
    });

    it('returns success without error when the tag does not exist on the transaction', async () => {
      const txn = await createTransaction({ tags: ['only-tag'] });

      const result = await transactionService.removeTransactionTags(userId, txn.id, ['nonexistent-tag']);

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.tags).toEqual(['only-tag']);
    });

    it('returns an error when the transaction does not exist', async () => {
      const result = await transactionService.removeTransactionTags(userId, 'nonexistent-id', ['tag']);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // splitTransaction
  // -------------------------------------------------------------------------

  describe('splitTransaction', () => {
    it('successfully splits a transaction into the specified parts', async () => {
      const txn = await createTransaction({ amount: 50.00 });

      const result = await transactionService.splitTransaction(userId, txn.id, [
        { amount: 30.00, description: 'Part A' },
        { amount: 20.00, description: 'Part B' },
      ]);

      expect(result.success).toBe(true);
      expect(result.splitTransactions).toHaveLength(2);
    });

    it('rejects splits whose total does not equal the original amount', async () => {
      const txn = await createTransaction({ amount: 50.00 });

      const result = await transactionService.splitTransaction(userId, txn.id, [
        { amount: 30.00 },
        { amount: 15.00 }, // total 45, not 50
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/split amounts must equal/i);
    });

    it('allows a split whose total is within $0.01 of the original amount', async () => {
      const txn = await createTransaction({ amount: 10.00 });

      // 3.33 + 3.33 + 3.33 = 9.99 — within $0.01 tolerance
      const result = await transactionService.splitTransaction(userId, txn.id, [
        { amount: 3.33 },
        { amount: 3.33 },
        { amount: 3.34 },
      ]);

      expect(result.success).toBe(true);
    });

    it('rejects splitting a transaction that is already split', async () => {
      const txn = await createTransaction({ amount: 50.00 });
      await transactionService.splitTransaction(userId, txn.id, [
        { amount: 25.00 },
        { amount: 25.00 },
      ]);

      // Attempting to split the original again
      const result = await transactionService.splitTransaction(userId, txn.id, [
        { amount: 25.00 },
        { amount: 25.00 },
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already split/i);
    });

    it('returns an error when the transaction does not exist', async () => {
      const result = await transactionService.splitTransaction(userId, 'nonexistent-id', [
        { amount: 10.00 },
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('hides the original transaction after a split', async () => {
      const txn = await createTransaction({ amount: 40.00 });

      await transactionService.splitTransaction(userId, txn.id, [
        { amount: 20.00 },
        { amount: 20.00 },
      ]);

      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.isHidden).toBe(true);
    });

    it('marks the original transaction with isSplit true and records child IDs', async () => {
      const txn = await createTransaction({ amount: 60.00 });

      const result = await transactionService.splitTransaction(userId, txn.id, [
        { amount: 40.00 },
        { amount: 20.00 },
      ]);

      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.isSplit).toBe(true);
      expect(stored?.splitTransactionIds).toHaveLength(2);
      expect(stored?.splitTransactionIds).toEqual(
        result.splitTransactions?.map(s => s.id)
      );
    });

    it('sets parentTransactionId on each child split', async () => {
      const txn = await createTransaction({ amount: 30.00 });

      const result = await transactionService.splitTransaction(userId, txn.id, [
        { amount: 15.00 },
        { amount: 15.00 },
      ]);

      for (const child of result.splitTransactions ?? []) {
        expect(child.parentTransactionId).toBe(txn.id);
      }
    });

    it('split children inherit date, accountId, and status from the parent', async () => {
      const txn = await createTransaction({
        amount: 50.00,
        date: '2025-03-10',
        accountId: 'acct-special',
        status: 'posted',
      });

      const result = await transactionService.splitTransaction(userId, txn.id, [
        { amount: 25.00 },
        { amount: 25.00 },
      ]);

      for (const child of result.splitTransactions ?? []) {
        expect(child.date).toBe('2025-03-10');
        expect(child.accountId).toBe('acct-special');
        expect(child.status).toBe('posted');
      }
    });

    it('applies individual categoryId and description to each child split', async () => {
      const txn = await createTransaction({ amount: 50.00 });

      const result = await transactionService.splitTransaction(userId, txn.id, [
        { amount: 30.00, categoryId: 'FOOD_AND_DRINK', description: 'Lunch' },
        { amount: 20.00, categoryId: 'ENTERTAINMENT', description: 'Movie' },
      ]);

      const [first, second] = result.splitTransactions ?? [];
      expect(first.categoryId).toBe('FOOD_AND_DRINK');
      expect(first.userDescription).toBe('Lunch');
      expect(second.categoryId).toBe('ENTERTAINMENT');
      expect(second.userDescription).toBe('Movie');
    });
  });

  // -------------------------------------------------------------------------
  // updateTransactionDescription
  // -------------------------------------------------------------------------

  describe('updateTransactionDescription', () => {
    it('sets the user description to the provided string', async () => {
      const txn = await createTransaction();

      const result = await transactionService.updateTransactionDescription(userId, txn.id, 'My label');

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.userDescription).toBe('My label');
    });

    it('clears the user description when null is passed', async () => {
      const txn = await createTransaction({ userDescription: 'Old label' });

      const result = await transactionService.updateTransactionDescription(userId, txn.id, null);

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.userDescription).toBeNull();
    });

    it('returns an error when the transaction does not exist', async () => {
      const result = await transactionService.updateTransactionDescription(userId, 'nonexistent-id', 'label');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // updateTransactionFlagged
  // -------------------------------------------------------------------------

  describe('updateTransactionFlagged', () => {
    it('flags a transaction', async () => {
      const txn = await createTransaction({ isFlagged: false });

      const result = await transactionService.updateTransactionFlagged(userId, txn.id, true);

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.isFlagged).toBe(true);
    });

    it('unflags a transaction', async () => {
      const txn = await createTransaction({ isFlagged: true });

      const result = await transactionService.updateTransactionFlagged(userId, txn.id, false);

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.isFlagged).toBe(false);
    });

    it('returns an error when the transaction does not exist', async () => {
      const result = await transactionService.updateTransactionFlagged(userId, 'nonexistent-id', true);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // updateTransactionHidden
  // -------------------------------------------------------------------------

  describe('updateTransactionHidden', () => {
    it('hides a transaction', async () => {
      const txn = await createTransaction({ isHidden: false });

      const result = await transactionService.updateTransactionHidden(userId, txn.id, true);

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.isHidden).toBe(true);
    });

    it('unhides a transaction', async () => {
      const txn = await createTransaction({ isHidden: true });

      const result = await transactionService.updateTransactionHidden(userId, txn.id, false);

      expect(result.success).toBe(true);
      const stored = (await readAllTransactions()).find(t => t.id === txn.id);
      expect(stored?.isHidden).toBe(false);
    });

    it('returns an error when the transaction does not exist', async () => {
      const result = await transactionService.updateTransactionHidden(userId, 'nonexistent-id', true);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // hasTransactionsForCategory
  // -------------------------------------------------------------------------

  describe('hasTransactionsForCategory', () => {
    it('returns true when active transactions exist for the category', async () => {
      await createTransaction({ categoryId: 'FOOD_AND_DRINK' });

      const result = await transactionService.hasTransactionsForCategory('FOOD_AND_DRINK', userId);

      expect(result).toBe(true);
    });

    it('returns false when no transactions belong to the category', async () => {
      await createTransaction({ categoryId: 'OTHER_CATEGORY' });

      const result = await transactionService.hasTransactionsForCategory('FOOD_AND_DRINK', userId);

      expect(result).toBe(false);
    });

    it('ignores transactions with removed status', async () => {
      await createTransaction({ categoryId: 'FOOD_AND_DRINK', status: 'removed' });

      const result = await transactionService.hasTransactionsForCategory('FOOD_AND_DRINK', userId);

      expect(result).toBe(false);
    });

    it('ignores hidden transactions', async () => {
      await createTransaction({ categoryId: 'FOOD_AND_DRINK', isHidden: true });

      const result = await transactionService.hasTransactionsForCategory('FOOD_AND_DRINK', userId);

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // bulkRecategorizeByCategory
  // -------------------------------------------------------------------------

  describe('bulkRecategorizeByCategory', () => {
    it('recategorizes all matching transactions to the new category', async () => {
      await createTransaction({ categoryId: 'OLD_CAT' });
      await createTransaction({ categoryId: 'OLD_CAT' });
      await createTransaction({ categoryId: 'KEEP_CAT' });

      const count = await transactionService.bulkRecategorizeByCategory('OLD_CAT', 'NEW_CAT', userId);

      expect(count).toBe(2);
      const all = await readAllTransactions();
      const movedTxns = all.filter(t => t.categoryId === 'NEW_CAT');
      const unchanged = all.find(t => t.categoryId === 'KEEP_CAT');
      expect(movedTxns).toHaveLength(2);
      expect(unchanged).toBeDefined();
    });

    it('returns 0 when no transactions match the source category', async () => {
      await createTransaction({ categoryId: 'DIFFERENT_CAT' });

      const count = await transactionService.bulkRecategorizeByCategory('OLD_CAT', 'NEW_CAT', userId);

      expect(count).toBe(0);
    });

    it('sets categoryId to null when the target category is null (uncategorize)', async () => {
      await createTransaction({ categoryId: 'OLD_CAT' });

      const count = await transactionService.bulkRecategorizeByCategory('OLD_CAT', null, userId);

      expect(count).toBe(1);
      const all = await readAllTransactions();
      expect(all[0].categoryId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getBlockingTransactionDetails
  // -------------------------------------------------------------------------

  describe('getBlockingTransactionDetails', () => {
    it('returns the correct count of blocking transactions', async () => {
      await createTransaction({ categoryId: 'TARGET_CAT', name: 'Txn 1' });
      await createTransaction({ categoryId: 'TARGET_CAT', name: 'Txn 2' });
      await createTransaction({ categoryId: 'OTHER_CAT', name: 'Txn 3' });

      const details = await transactionService.getBlockingTransactionDetails('TARGET_CAT', userId);

      expect(details.count).toBe(2);
    });

    it('limits sample transactions to 3 even when more exist', async () => {
      for (let i = 0; i < 5; i++) {
        await createTransaction({ categoryId: 'BIG_CAT', name: `Txn ${i}` });
      }

      const details = await transactionService.getBlockingTransactionDetails('BIG_CAT', userId);

      expect(details.count).toBe(5);
      expect(details.sampleTransactions).toHaveLength(3);
    });

    it('does not include removed transactions in the count', async () => {
      await createTransaction({ categoryId: 'TARGET_CAT', status: 'removed' });
      await createTransaction({ categoryId: 'TARGET_CAT' });

      const details = await transactionService.getBlockingTransactionDetails('TARGET_CAT', userId);

      expect(details.count).toBe(1);
    });

    it('does not include hidden transactions in the count', async () => {
      await createTransaction({ categoryId: 'TARGET_CAT', isHidden: true });
      await createTransaction({ categoryId: 'TARGET_CAT' });

      const details = await transactionService.getBlockingTransactionDetails('TARGET_CAT', userId);

      expect(details.count).toBe(1);
    });

    it('returns count 0 and empty samples when no blocking transactions exist', async () => {
      await createTransaction({ categoryId: 'OTHER_CAT' });

      const details = await transactionService.getBlockingTransactionDetails('TARGET_CAT', userId);

      expect(details.count).toBe(0);
      expect(details.sampleTransactions).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getTransactionCountsByCategory
  // -------------------------------------------------------------------------

  describe('getTransactionCountsByCategory', () => {
    it('returns the correct transaction count per category', async () => {
      await createTransaction({ categoryId: 'FOOD_AND_DRINK' });
      await createTransaction({ categoryId: 'FOOD_AND_DRINK' });
      await createTransaction({ categoryId: 'ENTERTAINMENT' });

      const counts = await transactionService.getTransactionCountsByCategory(userId);

      expect(counts['FOOD_AND_DRINK']).toBe(2);
      expect(counts['ENTERTAINMENT']).toBe(1);
    });

    it('excludes removed transactions from counts', async () => {
      await createTransaction({ categoryId: 'FOOD_AND_DRINK' });
      await createTransaction({ categoryId: 'FOOD_AND_DRINK', status: 'removed' });

      const counts = await transactionService.getTransactionCountsByCategory(userId);

      expect(counts['FOOD_AND_DRINK']).toBe(1);
    });

    it('excludes hidden transactions from counts', async () => {
      await createTransaction({ categoryId: 'FOOD_AND_DRINK' });
      await createTransaction({ categoryId: 'FOOD_AND_DRINK', isHidden: true });

      const counts = await transactionService.getTransactionCountsByCategory(userId);

      expect(counts['FOOD_AND_DRINK']).toBe(1);
    });

    it('returns an empty object when there are no transactions', async () => {
      const counts = await transactionService.getTransactionCountsByCategory(userId);

      expect(counts).toEqual({});
    });

    it('does not include a category key for transactions without a categoryId', async () => {
      await createTransaction({ categoryId: null });

      const counts = await transactionService.getTransactionCountsByCategory(userId);

      expect(Object.keys(counts)).toHaveLength(0);
    });
  });
});
