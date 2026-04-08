/**
 * Unit tests for TransactionService.getTransactions() filter logic
 *
 * Purpose: Lock in filtering pipeline behavior as pre-refactor coverage (R1 split).
 * Tests are read-only — test data is created once in beforeAll and shared across all
 * test groups within each describe block.
 */

import { InMemoryDataService } from '../../services/dataService';
import { TransactionService, StoredTransaction } from '../../services/transactionService';
import { PlaidService } from '../../services/plaidService';

// ---------------------------------------------------------------------------
// Shared helper — minimal location stub
// ---------------------------------------------------------------------------

const NO_LOCATION = null;

// Shared base shape for createTestTransaction — only override what each test needs.
function baseTransaction(overrides: {
  userId: string;
  accountId: string;
  plaidTransactionId: string;
  amount: number;
  date: string;
  name: string;
  categoryId?: string | null;
  status?: 'posted' | 'pending' | 'removed';
  pending?: boolean;
  tags?: string[];
  notes?: string | null;
  isHidden?: boolean;
  isFlagged?: boolean;
  merchantName?: string | null;
  userDescription?: string | null;
}) {
  return {
    plaidAccountId: overrides.accountId,
    isoCurrencyCode: 'USD',
    category: null,
    plaidCategoryId: null,
    status: 'posted' as const,
    pending: false,
    tags: [],
    notes: null,
    isHidden: false,
    isFlagged: false,
    merchantName: null,
    userDescription: null,
    location: NO_LOCATION,
    categoryId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Main describe block
// ---------------------------------------------------------------------------

describe('TransactionService — getTransactions() filtering', () => {
  let dataService: InMemoryDataService;
  let transactionService: TransactionService;

  const USER = 'test-user-filter';
  const ACCOUNT_A = 'account-a';
  const ACCOUNT_B = 'account-b';

  // References to created transactions (set in beforeAll, used in assertions)
  let txPosted: StoredTransaction;       // normal posted expense
  let txPending: StoredTransaction;      // pending, not hidden
  let txRemoved: StoredTransaction;      // status=removed
  let txJanExpense: StoredTransaction;   // Jan 2025, cat FOOD_AND_DRINK, account A
  let txFebExpense: StoredTransaction;   // Feb 2025, cat TRANSPORT, account A
  let txMarExpense: StoredTransaction;   // Mar 2025, cat FOOD_AND_DRINK, account B
  let txIncome: StoredTransaction;       // negative amount (income), cat INCOME_WAGES, account A
  let txTransferIn: StoredTransaction;   // categoryId TRANSFER_IN_CASH, account A
  let txTransferOut: StoredTransaction;  // categoryId TRANSFER_OUT_ACCOUNT, account B
  let txUncategorized: StoredTransaction; // no categoryId
  let txHidden: StoredTransaction;       // isHidden=true
  let txFlagged: StoredTransaction;      // isFlagged=true
  let txTagged: StoredTransaction;       // has tags ['vacation', 'dining']
  let txSearchable: StoredTransaction;   // unique name/merchant/notes for search tests
  let txZero: StoredTransaction;         // amount=0

  beforeAll(async () => {
    dataService = new InMemoryDataService();
    const plaidService = new PlaidService();
    transactionService = new TransactionService(dataService, plaidService);

    // 1. Standard posted expense — high amount
    txPosted = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-posted',
        amount: 120.00,
        date: '2025-03-10',
        name: 'Grocery Store',
        categoryId: 'FOOD_AND_DRINK',
      })
    );

    // 2. Pending transaction
    txPending = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-pending',
        amount: 25.00,
        date: '2025-03-15',
        name: 'Pending Coffee',
        status: 'pending',
        pending: true,
        categoryId: 'FOOD_AND_DRINK',
      })
    );

    // 3. Removed transaction — must never appear
    txRemoved = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-removed',
        amount: 50.00,
        date: '2025-03-12',
        name: 'Deleted Charge',
        status: 'removed',
        categoryId: 'FOOD_AND_DRINK',
      })
    );

    // 4. January expense — account A
    txJanExpense = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-jan',
        amount: 45.00,
        date: '2025-01-15',
        name: 'Jan Dinner',
        categoryId: 'FOOD_AND_DRINK',
      })
    );

    // 5. February expense — account A, different category
    txFebExpense = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-feb',
        amount: 30.00,
        date: '2025-02-20',
        name: 'Bus Pass',
        categoryId: 'TRANSPORTATION',
      })
    );

    // 6. March expense — account B
    txMarExpense = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_B,
        plaidTransactionId: 'plaid-mar-b',
        amount: 75.00,
        date: '2025-03-05',
        name: 'Restaurant',
        categoryId: 'FOOD_AND_DRINK',
      })
    );

    // 7. Income transaction — negative amount, income category
    txIncome = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-income',
        amount: -3000.00,
        date: '2025-02-28',
        name: 'Paycheck',
        categoryId: 'INCOME_WAGES',
      })
    );

    // 8. Transfer In — categoryId starts with TRANSFER_IN
    txTransferIn = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-transfer-in',
        amount: -500.00,
        date: '2025-02-10',
        name: 'Transfer from Savings',
        categoryId: 'TRANSFER_IN_CASH',
      })
    );

    // 9. Transfer Out — categoryId starts with TRANSFER_OUT
    txTransferOut = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_B,
        plaidTransactionId: 'plaid-transfer-out',
        amount: 500.00,
        date: '2025-02-10',
        name: 'Transfer to Checking',
        categoryId: 'TRANSFER_OUT_ACCOUNT',
      })
    );

    // 10. Uncategorized transaction
    txUncategorized = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-uncat',
        amount: 18.50,
        date: '2025-03-08',
        name: 'Mystery Charge',
        categoryId: null,
      })
    );

    // 11. Hidden transaction
    txHidden = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-hidden',
        amount: 200.00,
        date: '2025-03-01',
        name: 'Hidden Split Parent',
        categoryId: 'FOOD_AND_DRINK',
        isHidden: true,
      })
    );

    // 12. Flagged transaction
    txFlagged = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_B,
        plaidTransactionId: 'plaid-flagged',
        amount: 99.99,
        date: '2025-01-22',
        name: 'Suspicious Charge',
        categoryId: 'FOOD_AND_DRINK',
        isFlagged: true,
      })
    );

    // 13. Transaction with tags
    txTagged = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-tagged',
        amount: 65.00,
        date: '2025-01-30',
        name: 'Nice Dinner Out',
        categoryId: 'FOOD_AND_DRINK',
        tags: ['vacation', 'dining'],
      })
    );

    // 14. Searchable — unique merchant + notes
    txSearchable = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-search',
        amount: 42.00,
        date: '2025-02-14',
        name: 'Generic Store 1234',
        merchantName: 'UniqueVendorXYZ',
        notes: 'reimbursable office supply',
        categoryId: 'GENERAL_MERCHANDISE',
        tags: ['work'],
      })
    );

    // 15. Zero-amount transaction
    txZero = await transactionService.createTestTransaction(
      baseTransaction({
        userId: USER,
        accountId: ACCOUNT_A,
        plaidTransactionId: 'plaid-zero',
        amount: 0,
        date: '2025-03-20',
        name: 'Zero Fee Transaction',
        categoryId: 'GENERAL_MERCHANDISE',
      })
    );
  });

  afterAll(() => {
    dataService.clear();
  });

  // =========================================================================
  // 1. Base filtering (status / pending)
  // =========================================================================

  describe('base filtering', () => {
    it('excludes removed transactions by default', async () => {
      const result = await transactionService.getTransactions(USER);
      expect(result.success).toBe(true);
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txRemoved.id);
    });

    it('excludes pending transactions by default', async () => {
      const result = await transactionService.getTransactions(USER);
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txPending.id);
    });

    it('includes pending transactions when includePending is true', async () => {
      const result = await transactionService.getTransactions(USER, { includePending: true });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txPending.id);
    });

    it('never includes removed transactions even when includePending is true', async () => {
      const result = await transactionService.getTransactions(USER, { includePending: true });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txRemoved.id);
    });
  });

  // =========================================================================
  // 2. Date filtering
  // =========================================================================

  describe('date filtering', () => {
    it('startDate excludes transactions before the given date', async () => {
      const result = await transactionService.getTransactions(USER, {
        startDate: '2025-02-01',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txJanExpense.id);
      expect(ids).not.toContain(txFlagged.id); // Jan 22
      expect(ids).not.toContain(txTagged.id);  // Jan 30
    });

    it('startDate includes transactions on the boundary date', async () => {
      const result = await transactionService.getTransactions(USER, {
        startDate: '2025-01-15',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txJanExpense.id); // exactly 2025-01-15
    });

    it('endDate excludes transactions after the given date', async () => {
      const result = await transactionService.getTransactions(USER, {
        endDate: '2025-01-31',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txFebExpense.id);
      expect(ids).not.toContain(txPosted.id);   // Mar
    });

    it('endDate includes transactions on the boundary date', async () => {
      const result = await transactionService.getTransactions(USER, {
        endDate: '2025-03-10',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txPosted.id); // exactly 2025-03-10
    });

    it('date range returns only transactions within the window', async () => {
      const result = await transactionService.getTransactions(USER, {
        startDate: '2025-02-01',
        endDate: '2025-02-28',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txFebExpense.id);  // Feb 20
      expect(ids).toContain(txIncome.id);       // Feb 28
      expect(ids).not.toContain(txJanExpense.id);
      expect(ids).not.toContain(txPosted.id);   // Mar
    });
  });

  // =========================================================================
  // 3. Account filtering
  // =========================================================================

  describe('account filtering', () => {
    it('filters to a single account ID', async () => {
      const result = await transactionService.getTransactions(USER, {
        accountIds: [ACCOUNT_B],
      });
      const accounts = result.transactions!.map((t) => t.accountId);
      expect(accounts.every((a) => a === ACCOUNT_B)).toBe(true);
    });

    it('single account filter includes only transactions from that account', async () => {
      const result = await transactionService.getTransactions(USER, {
        accountIds: [ACCOUNT_B],
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txMarExpense.id);
      expect(ids).not.toContain(txJanExpense.id); // account A
    });

    it('multiple account IDs returns transactions from any listed account', async () => {
      const result = await transactionService.getTransactions(USER, {
        accountIds: [ACCOUNT_A, ACCOUNT_B],
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txJanExpense.id);
      expect(ids).toContain(txMarExpense.id);
    });

    it('empty accountIds array applies no account filter', async () => {
      const resultAll = await transactionService.getTransactions(USER);
      const resultEmpty = await transactionService.getTransactions(USER, {
        accountIds: [],
      });
      // Same total count (both include hidden is off by default)
      expect(resultEmpty.totalCount).toBe(resultAll.totalCount);
    });
  });

  // =========================================================================
  // 4. Category filtering
  // =========================================================================

  describe('category filtering', () => {
    it('filters to a single category ID', async () => {
      const result = await transactionService.getTransactions(USER, {
        categoryIds: ['TRANSPORTATION'],
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txFebExpense.id);
      expect(ids).not.toContain(txJanExpense.id); // FOOD_AND_DRINK
    });

    it('multiple category IDs returns transactions from any listed category', async () => {
      const result = await transactionService.getTransactions(USER, {
        categoryIds: ['FOOD_AND_DRINK', 'TRANSPORTATION'],
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txJanExpense.id);
      expect(ids).toContain(txFebExpense.id);
    });

    it("'uncategorized' special value matches transactions with null categoryId", async () => {
      const result = await transactionService.getTransactions(USER, {
        categoryIds: ['uncategorized'],
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txUncategorized.id);
      // Should not contain transactions that have a real category
      expect(ids).not.toContain(txJanExpense.id);
    });

    it("mix of 'uncategorized' and a real category returns both", async () => {
      const result = await transactionService.getTransactions(USER, {
        categoryIds: ['uncategorized', 'TRANSPORTATION'],
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txUncategorized.id);
      expect(ids).toContain(txFebExpense.id);
      expect(ids).not.toContain(txJanExpense.id); // FOOD_AND_DRINK not in filter
    });
  });

  // =========================================================================
  // 5. Tag filtering
  // =========================================================================

  describe('tag filtering', () => {
    it('single tag returns only transactions with that tag', async () => {
      const result = await transactionService.getTransactions(USER, {
        tags: ['vacation'],
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txTagged.id);
      expect(ids).not.toContain(txPosted.id); // no tags
    });

    it('multiple tags use OR logic — matches any one tag', async () => {
      const result = await transactionService.getTransactions(USER, {
        tags: ['work', 'dining'],
      });
      const ids = result.transactions!.map((t) => t.id);
      // txSearchable has 'work', txTagged has 'dining'
      expect(ids).toContain(txSearchable.id);
      expect(ids).toContain(txTagged.id);
    });

    it('tag filter returns no results when no transactions match', async () => {
      const result = await transactionService.getTransactions(USER, {
        tags: ['nonexistent-tag-xyz'],
      });
      expect(result.totalCount).toBe(0);
      expect(result.transactions).toHaveLength(0);
    });
  });

  // =========================================================================
  // 6. Hidden transactions
  // =========================================================================

  describe('hidden transactions', () => {
    it('excludes hidden transactions by default', async () => {
      const result = await transactionService.getTransactions(USER);
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txHidden.id);
    });

    it('includes hidden transactions when includeHidden is true', async () => {
      const result = await transactionService.getTransactions(USER, {
        includeHidden: true,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txHidden.id);
    });
  });

  // =========================================================================
  // 7. Flagged / uncategorized filters
  // =========================================================================

  describe('onlyFlagged filter', () => {
    it('returns only flagged transactions when onlyFlagged is true', async () => {
      const result = await transactionService.getTransactions(USER, {
        onlyFlagged: true,
      });
      expect(result.transactions!.every((t) => t.isFlagged)).toBe(true);
    });

    it('includes the known flagged transaction when onlyFlagged is true', async () => {
      const result = await transactionService.getTransactions(USER, {
        onlyFlagged: true,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txFlagged.id);
    });

    it('excludes unflagged transactions when onlyFlagged is true', async () => {
      const result = await transactionService.getTransactions(USER, {
        onlyFlagged: true,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txPosted.id);
    });
  });

  describe('onlyUncategorized filter', () => {
    it('returns only transactions with null categoryId when onlyUncategorized is true', async () => {
      const result = await transactionService.getTransactions(USER, {
        onlyUncategorized: true,
      });
      expect(result.transactions!.every((t) => t.categoryId === null)).toBe(true);
    });

    it('includes the known uncategorized transaction when onlyUncategorized is true', async () => {
      const result = await transactionService.getTransactions(USER, {
        onlyUncategorized: true,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txUncategorized.id);
    });
  });

  // =========================================================================
  // 8. Amount filtering
  // =========================================================================

  describe('amount filtering', () => {
    it('minAmount excludes transactions below the threshold (uses raw amount)', async () => {
      // txIncome has amount=-3000; minAmount=0 should exclude it
      const result = await transactionService.getTransactions(USER, {
        minAmount: 0,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txIncome.id);
    });

    it('minAmount includes transactions at or above the threshold', async () => {
      const result = await transactionService.getTransactions(USER, {
        minAmount: 75.00,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txPosted.id);   // 120.00
      expect(ids).toContain(txMarExpense.id); // 75.00 — boundary
    });

    it('minAmount excludes transactions below the threshold', async () => {
      const result = await transactionService.getTransactions(USER, {
        minAmount: 75.00,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txFebExpense.id); // 30.00 < 75.00
    });

    it('maxAmount excludes transactions above the threshold (uses raw amount)', async () => {
      const result = await transactionService.getTransactions(USER, {
        maxAmount: 50.00,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txPosted.id); // 120.00 > 50.00
    });

    it('maxAmount includes transactions at or below the threshold', async () => {
      const result = await transactionService.getTransactions(USER, {
        maxAmount: 45.00,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txJanExpense.id); // 45.00 — boundary
    });

    it('amount range returns only transactions within min and max', async () => {
      const result = await transactionService.getTransactions(USER, {
        minAmount: 40.00,
        maxAmount: 70.00,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txJanExpense.id);   // 45.00
      expect(ids).toContain(txTagged.id);        // 65.00
      expect(ids).not.toContain(txPosted.id);    // 120.00
      expect(ids).not.toContain(txFebExpense.id); // 30.00
    });

    it('exactAmount matches using absolute value of transaction amount', async () => {
      // txIncome.amount = -3000; exactAmount=3000 should match via Math.abs
      const result = await transactionService.getTransactions(USER, {
        exactAmount: 3000.00,
        amountTolerance: 0,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txIncome.id);
    });

    it('exactAmount with default tolerance ($0.50) matches within range', async () => {
      // txUncategorized.amount = 18.50; search for 18.75 — within $0.50
      const result = await transactionService.getTransactions(USER, {
        exactAmount: 18.75,
        // amountTolerance not set — defaults to 0.50
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txUncategorized.id); // |18.50 - 18.75| = 0.25 < 0.50
    });

    it('exactAmount with default tolerance excludes transactions outside the window', async () => {
      const result = await transactionService.getTransactions(USER, {
        exactAmount: 18.75,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txPosted.id); // 120.00 far outside range
    });

    it('exactAmount with custom tolerance widens the match window', async () => {
      // txPosted.amount = 120.00; search for 115.00 with tolerance=10 => [105, 125] => 120 in range
      const result = await transactionService.getTransactions(USER, {
        exactAmount: 115.00,
        amountTolerance: 10.00,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txPosted.id);
    });

    it('exactAmount takes precedence over minAmount/maxAmount', async () => {
      // Setting both exactAmount and minAmount/maxAmount — exactAmount wins
      // txPosted.amount = 120; exactAmount=120, but minAmount=999 is ignored
      const result = await transactionService.getTransactions(USER, {
        exactAmount: 120.00,
        amountTolerance: 0,
        minAmount: 999.00, // should be ignored
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txPosted.id);
    });
  });

  // =========================================================================
  // 9. Search query
  // =========================================================================

  describe('search query', () => {
    it('matches on transaction name (case-insensitive)', async () => {
      const result = await transactionService.getTransactions(USER, {
        searchQuery: 'PAYCHECK',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txIncome.id);
    });

    it('matches on merchant name', async () => {
      const result = await transactionService.getTransactions(USER, {
        searchQuery: 'uniquevendorxyz',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txSearchable.id);
    });

    it('matches on transaction tags', async () => {
      const result = await transactionService.getTransactions(USER, {
        searchQuery: 'vacation',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txTagged.id);
    });

    it('matches on notes field', async () => {
      const result = await transactionService.getTransactions(USER, {
        searchQuery: 'office supply',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txSearchable.id);
    });

    it('is case-insensitive for transaction name', async () => {
      const resultLower = await transactionService.getTransactions(USER, {
        searchQuery: 'grocery store',
      });
      const resultUpper = await transactionService.getTransactions(USER, {
        searchQuery: 'GROCERY STORE',
      });
      expect(resultLower.totalCount).toBe(resultUpper.totalCount);
    });

    it('returns no results when query does not match any field', async () => {
      const result = await transactionService.getTransactions(USER, {
        searchQuery: 'zzznomatch999',
      });
      expect(result.totalCount).toBe(0);
    });
  });

  // =========================================================================
  // 10. Transaction type filtering
  // =========================================================================

  describe('transactionType filtering', () => {
    it("'income' returns only negative-amount non-transfer transactions", async () => {
      const result = await transactionService.getTransactions(USER, {
        transactionType: 'income',
      });
      // All results must be negative and not transfers
      expect(result.transactions!.every((t) => t.amount < 0)).toBe(true);
    });

    it("'income' includes the income transaction", async () => {
      const result = await transactionService.getTransactions(USER, {
        transactionType: 'income',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txIncome.id);
    });

    it("'income' excludes transfer transactions even if they have negative amounts", async () => {
      // txTransferIn.amount = -500 (negative) but is a transfer
      const result = await transactionService.getTransactions(USER, {
        transactionType: 'income',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txTransferIn.id);
    });

    it("'expense' returns only non-negative-amount non-transfer transactions", async () => {
      const result = await transactionService.getTransactions(USER, {
        transactionType: 'expense',
      });
      // All results must have amount >= 0 (positive = debit/expense in Plaid convention)
      expect(result.transactions!.every((t) => t.amount >= 0)).toBe(true);
    });

    it("'expense' includes standard posted expense", async () => {
      const result = await transactionService.getTransactions(USER, {
        transactionType: 'expense',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txPosted.id);
    });

    it("'expense' excludes transfer-out transactions", async () => {
      const result = await transactionService.getTransactions(USER, {
        transactionType: 'expense',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txTransferOut.id);
    });

    it("'expense' treats zero-amount transactions as expenses (amount >= 0)", async () => {
      const result = await transactionService.getTransactions(USER, {
        transactionType: 'expense',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txZero.id);
    });

    it("'transfer' returns only transactions with a transfer category", async () => {
      const result = await transactionService.getTransactions(USER, {
        transactionType: 'transfer',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txTransferIn.id);
      expect(ids).toContain(txTransferOut.id);
    });

    it("'transfer' excludes non-transfer transactions", async () => {
      const result = await transactionService.getTransactions(USER, {
        transactionType: 'transfer',
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).not.toContain(txIncome.id);
      expect(ids).not.toContain(txPosted.id);
    });

    it("'all' applies no transaction-type filter", async () => {
      const resultAll = await transactionService.getTransactions(USER, {
        transactionType: 'all',
      });
      const resultNoType = await transactionService.getTransactions(USER);
      expect(resultAll.totalCount).toBe(resultNoType.totalCount);
    });
  });

  // =========================================================================
  // 11. Sort order
  // =========================================================================

  describe('sort order', () => {
    it('results are sorted by date descending', async () => {
      const result = await transactionService.getTransactions(USER);
      const dates = result.transactions!.map((t) => t.date);
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1] >= dates[i]).toBe(true);
      }
    });
  });

  // =========================================================================
  // 12. Total counts (totalCount vs unfilteredTotal)
  // =========================================================================

  describe('total counts', () => {
    it('totalCount reflects the number of transactions after all filters', async () => {
      const result = await transactionService.getTransactions(USER, {
        categoryIds: ['TRANSPORTATION'],
      });
      expect(result.totalCount).toBe(result.transactions!.length);
    });

    it('unfilteredTotal reflects count after date/account/hidden filters but before category filter', async () => {
      // Get baseline: all non-removed, non-pending, non-hidden in Feb
      const baselineResult = await transactionService.getTransactions(USER, {
        startDate: '2025-02-01',
        endDate: '2025-02-28',
      });
      const baselineCount = baselineResult.totalCount!;

      // Now apply a category filter — unfilteredTotal should equal baseline totalCount
      const filteredResult = await transactionService.getTransactions(USER, {
        startDate: '2025-02-01',
        endDate: '2025-02-28',
        categoryIds: ['TRANSPORTATION'],
      });

      expect(filteredResult.unfilteredTotal).toBe(baselineCount);
    });

    it('unfilteredTotal reflects count after date/account filters but before search filter', async () => {
      const baselineResult = await transactionService.getTransactions(USER, {
        accountIds: [ACCOUNT_A],
      });
      const baselineCount = baselineResult.totalCount!;

      const searchResult = await transactionService.getTransactions(USER, {
        accountIds: [ACCOUNT_A],
        searchQuery: 'paycheck',
      });

      // unfilteredTotal is the count before search is applied (matching baseline)
      expect(searchResult.unfilteredTotal).toBe(baselineCount);
      // But totalCount is narrower
      expect(searchResult.totalCount).toBeLessThanOrEqual(searchResult.unfilteredTotal!);
    });

    it('unfilteredTotal respects includeHidden flag', async () => {
      const withoutHidden = await transactionService.getTransactions(USER, {
        includeHidden: false,
      });
      const withHidden = await transactionService.getTransactions(USER, {
        includeHidden: true,
      });
      // Including hidden should increase or equal the unfilteredTotal
      expect(withHidden.unfilteredTotal!).toBeGreaterThan(withoutHidden.unfilteredTotal!);
    });
  });

  // =========================================================================
  // 13. Combined filters
  // =========================================================================

  describe('combined filters', () => {
    it('date range + category + search narrows results correctly', async () => {
      // Jan through Mar, FOOD_AND_DRINK category, name contains "dinner"
      const result = await transactionService.getTransactions(USER, {
        startDate: '2025-01-01',
        endDate: '2025-03-31',
        categoryIds: ['FOOD_AND_DRINK'],
        searchQuery: 'dinner',
      });
      const ids = result.transactions!.map((t) => t.id);
      // txJanExpense.name = 'Jan Dinner' — matches
      expect(ids).toContain(txJanExpense.id);
      // txPosted.name = 'Grocery Store' — no match on 'dinner'
      expect(ids).not.toContain(txPosted.id);
    });

    it('account + transaction type + amount range all apply together', async () => {
      // Account A, expenses only, amount between 40 and 130
      const result = await transactionService.getTransactions(USER, {
        accountIds: [ACCOUNT_A],
        transactionType: 'expense',
        minAmount: 40.00,
        maxAmount: 130.00,
      });
      const ids = result.transactions!.map((t) => t.id);
      // txPosted: account A, expense, 120.00 — in range
      expect(ids).toContain(txPosted.id);
      // txJanExpense: account A, expense, 45.00 — in range
      expect(ids).toContain(txJanExpense.id);
      // txFebExpense: account A, expense, 30.00 — below minAmount
      expect(ids).not.toContain(txFebExpense.id);
      // txIncome: account A, but income not expense
      expect(ids).not.toContain(txIncome.id);
      // txMarExpense: account B — wrong account
      expect(ids).not.toContain(txMarExpense.id);
    });

    it('onlyFlagged + account filter returns only flagged transactions from that account', async () => {
      const result = await transactionService.getTransactions(USER, {
        accountIds: [ACCOUNT_B],
        onlyFlagged: true,
      });
      const ids = result.transactions!.map((t) => t.id);
      expect(ids).toContain(txFlagged.id);
      // Every result must be from account B AND flagged
      expect(result.transactions!.every(
        (t) => t.accountId === ACCOUNT_B && t.isFlagged
      )).toBe(true);
    });
  });
});
