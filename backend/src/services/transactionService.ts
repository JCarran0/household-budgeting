/**
 * Transaction Management Service
 * 
 * Handles transaction syncing, categorization, and filtering
 */

import { v4 as uuidv4 } from 'uuid';
import { PlaidService, Transaction as PlaidTransaction } from './plaidService';
import { DataService } from './dataService';
import { StoredAccount } from './accountService';
import { encryptionService } from '../utils/encryption';

// Transaction status
export type TransactionStatus = 'posted' | 'pending' | 'removed';

// Stored transaction structure
export interface StoredTransaction {
  id: string;                          // Our internal ID
  userId: string;                      // User who owns this transaction
  accountId: string;                   // Our account ID
  plaidTransactionId: string | null;   // Plaid's transaction ID
  plaidAccountId: string;              // Plaid's account ID
  amount: number;                      // Amount (positive = debit, negative = credit)
  date: string;                        // Transaction date (YYYY-MM-DD)
  name: string;                        // Original transaction name from Plaid
  userDescription: string | null;      // User-edited description (overrides name for display)
  merchantName: string | null;         // Merchant name if available
  category: string[] | null;           // Plaid categories
  categoryId: string | null;           // Our category ID
  userCategoryId: string | null;       // User's custom category
  status: TransactionStatus;           // Transaction status
  pending: boolean;                    // Is transaction pending?
  isoCurrencyCode: string | null;      // Currency code
  tags: string[];                      // User tags
  notes: string | null;                // User notes
  isHidden: boolean;                   // Hidden from budgets
  isSplit: boolean;                    // Is this a split transaction?
  parentTransactionId: string | null;  // Parent if this is a split
  splitTransactionIds: string[];       // Child transactions if split
  location: {
    address: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    lat: number | null;
    lon: number | null;
  } | null;
  createdAt: Date;                     // When we first saw this
  updatedAt: Date;                     // Last update
}

// Filter options
export interface TransactionFilter {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  categoryIds?: string[];
  tags?: string[];
  searchQuery?: string;
  includePending?: boolean;
  includeHidden?: boolean;
  onlyUncategorized?: boolean;
  minAmount?: number;
  maxAmount?: number;
  exactAmount?: number;
  amountTolerance?: number;
}

// Result types
export interface TransactionsResult {
  success: boolean;
  transactions?: StoredTransaction[];
  totalCount?: number;
  unfilteredTotal?: number;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  added?: number;
  modified?: number;
  removed?: number;
  error?: string;
  warning?: string;  // For partial success when some accounts fail
}

export class TransactionService {
  constructor(
    private dataService: DataService,
    private plaidService: PlaidService
  ) {}

  /**
   * Sync transactions from Plaid for all user accounts
   */
  async syncTransactions(
    userId: string,
    accounts: StoredAccount[],
    startDate: string = '2025-01-01'
  ): Promise<SyncResult> {
    try {
      const endDate = new Date().toISOString().split('T')[0]; // Today
      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;
      const failedAccounts: string[] = [];

      // Group accounts by access token
      const tokenGroups = new Map<string, StoredAccount[]>();
      for (const account of accounts) {
        const token = account.plaidAccessToken;
        const group = tokenGroups.get(token) || [];
        group.push(account);
        tokenGroups.set(token, group);
      }

      // Sync each token's transactions
      for (const [encryptedToken, tokenAccounts] of tokenGroups) {
        let accessToken: string;
        try {
          accessToken = this.decryptToken(encryptedToken);
        } catch (error) {
          console.error('Failed to decrypt access token:', error);
          // If we can't decrypt the token, skip these accounts
          // and continue with others
          if (error instanceof Error && error.message.includes('reconnect')) {
            console.warn(`Skipping ${tokenAccounts.length} accounts - token needs reconnection`);
            // Track failed accounts
            tokenAccounts.forEach(account => failedAccounts.push(account.accountName));
          }
          continue;
        }
        
        console.log(`Syncing transactions for ${tokenAccounts.length} accounts from ${startDate} to ${endDate}`);
        
        // Fetch from Plaid (now with automatic pagination)
        const plaidResult = await this.plaidService.getTransactions(
          accessToken,
          startDate,
          endDate,
          { includePending: true }
        );

        if (!plaidResult.success || !plaidResult.transactions) {
          console.error('Failed to sync transactions:', plaidResult.error);
          continue;
        }

        console.log(`Received ${plaidResult.transactions.length} transactions from Plaid (total available: ${plaidResult.totalTransactions})`);

        // Process transactions
        const result = await this.processPlaidTransactions(
          userId,
          tokenAccounts,
          plaidResult.transactions
        );

        totalAdded += result.added;
        totalModified += result.modified;
        totalRemoved += result.removed;
        
        console.log(`Sync complete: ${result.added} added, ${result.modified} modified, ${result.removed} removed`);
      }

      // If some accounts failed but others succeeded, return partial success
      if (failedAccounts.length > 0 && (totalAdded > 0 || totalModified > 0)) {
        return {
          success: true,
          added: totalAdded,
          modified: totalModified,
          removed: totalRemoved,
          warning: `Some accounts need reconnection: ${failedAccounts.join(', ')}`,
        };
      }
      
      // If all accounts failed, return an error
      if (failedAccounts.length > 0 && totalAdded === 0 && totalModified === 0) {
        return {
          success: false,
          error: 'All accounts need reconnection. Please reconnect your bank accounts.',
        };
      }
      
      return {
        success: true,
        added: totalAdded,
        modified: totalModified,
        removed: totalRemoved,
      };
    } catch (error) {
      console.error('Error syncing transactions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      };
    }
  }

  /**
   * Process Plaid transactions and update our store
   */
  private async processPlaidTransactions(
    userId: string,
    accounts: StoredAccount[],
    plaidTransactions: PlaidTransaction[]
  ): Promise<{ added: number; modified: number; removed: number }> {
    // Load existing transactions
    const existingTransactions = await this.dataService.getData<StoredTransaction[]>(
      `transactions_${userId}`
    ) || [];

    // Create lookup maps
    const existingByPlaidId = new Map<string, StoredTransaction>();
    for (const txn of existingTransactions) {
      if (txn.plaidTransactionId) {
        existingByPlaidId.set(txn.plaidTransactionId, txn);
      }
    }

    const accountLookup = new Map<string, StoredAccount>();
    for (const account of accounts) {
      accountLookup.set(account.plaidAccountId, account);
    }

    let added = 0;
    let modified = 0;
    const processedIds = new Set<string>();

    // Process each Plaid transaction
    for (const plaidTxn of plaidTransactions) {
      processedIds.add(plaidTxn.plaidTransactionId);
      
      const account = accountLookup.get(plaidTxn.accountId);
      if (!account) continue;

      const existing = existingByPlaidId.get(plaidTxn.plaidTransactionId);
      
      if (existing) {
        // Update existing transaction
        const updated = this.updateTransaction(existing, plaidTxn);
        if (updated) {
          modified++;
        }
      } else {
        // Add new transaction
        const newTxn = this.createTransaction(userId, account.id, plaidTxn);
        existingTransactions.push(newTxn);
        added++;
      }
    }

    // Mark removed transactions (only for accounts we're currently syncing)
    let removed = 0;
    const syncedAccountIds = new Set(accounts.map(a => a.id));
    
    for (const existing of existingTransactions) {
      // Only check transactions from accounts we're currently syncing
      if (syncedAccountIds.has(existing.accountId) && 
          existing.plaidTransactionId && 
          !processedIds.has(existing.plaidTransactionId)) {
        if (existing.status !== 'removed') {
          existing.status = 'removed';
          existing.updatedAt = new Date();
          removed++;
        }
      }
    }

    // Save all transactions
    await this.dataService.saveData(`transactions_${userId}`, existingTransactions);

    return { added, modified, removed };
  }

  /**
   * Create a new transaction from Plaid data
   */
  private createTransaction(
    userId: string,
    accountId: string,
    plaidTxn: PlaidTransaction
  ): StoredTransaction {
    return {
      id: uuidv4(),
      userId,
      accountId,
      plaidTransactionId: plaidTxn.plaidTransactionId,
      plaidAccountId: plaidTxn.accountId,
      amount: plaidTxn.amount,
      date: plaidTxn.date,
      name: plaidTxn.name,
      userDescription: null, // User hasn't edited description yet
      merchantName: plaidTxn.merchantName,
      category: plaidTxn.category,
      categoryId: plaidTxn.categoryId,
      userCategoryId: null,
      status: plaidTxn.pending ? 'pending' : 'posted',
      pending: plaidTxn.pending,
      isoCurrencyCode: plaidTxn.isoCurrencyCode,
      tags: [],
      notes: null,
      isHidden: false,
      isSplit: false,
      parentTransactionId: null,
      splitTransactionIds: [],
      location: plaidTxn.location ? {
        address: plaidTxn.location.address || null,
        city: plaidTxn.location.city || null,
        region: plaidTxn.location.region || null,
        postalCode: plaidTxn.location.postalCode || null,
        country: plaidTxn.location.country || null,
        lat: null,
        lon: null,
      } : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Update an existing transaction with new Plaid data
   */
  private updateTransaction(
    existing: StoredTransaction,
    plaidTxn: PlaidTransaction
  ): boolean {
    let changed = false;

    // Check for changes
    if (existing.amount !== plaidTxn.amount) {
      existing.amount = plaidTxn.amount;
      changed = true;
    }

    if (existing.pending !== plaidTxn.pending) {
      existing.pending = plaidTxn.pending;
      existing.status = plaidTxn.pending ? 'pending' : 'posted';
      changed = true;
    }

    if (existing.name !== plaidTxn.name) {
      existing.name = plaidTxn.name;
      changed = true;
    }

    if (existing.merchantName !== plaidTxn.merchantName) {
      existing.merchantName = plaidTxn.merchantName;
      changed = true;
    }

    if (changed) {
      existing.updatedAt = new Date();
    }

    return changed;
  }

  /**
   * Get transactions with filtering
   */
  async getTransactions(
    userId: string,
    filter: TransactionFilter = {}
  ): Promise<TransactionsResult> {
    try {
      const allTransactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];

      // Get base transactions (excluding removed and pending if not included)
      let baseTransactions = allTransactions.filter((txn: StoredTransaction) => txn.status !== 'removed');
      
      // Apply base filters that affect the total count
      if (!filter.includePending) {
        baseTransactions = baseTransactions.filter((txn: StoredTransaction) => !txn.pending);
      }

      let filtered = baseTransactions;

      // Apply date and account filters (these are part of the base query)
      if (filter.startDate) {
        filtered = filtered.filter((txn: StoredTransaction) => txn.date >= filter.startDate!);
      }

      if (filter.endDate) {
        filtered = filtered.filter((txn: StoredTransaction) => txn.date <= filter.endDate!);
      }

      if (filter.accountIds && filter.accountIds.length > 0) {
        filtered = filtered.filter((txn: StoredTransaction) => filter.accountIds!.includes(txn.accountId));
      }
      
      // Calculate total after date/account filters but before search/category/tag filters
      // This gives us the denominator for "Showing X of Y transactions"
      const totalBeforeSearchFilters = filter.includeHidden 
        ? filtered.length
        : filtered.filter((txn: StoredTransaction) => !txn.isHidden).length;

      if (filter.categoryIds && filter.categoryIds.length > 0) {
        filtered = filtered.filter((txn: StoredTransaction) => {
          // Check both userCategoryId (user's custom) and categoryId (Plaid's)
          const categoryToCheck = txn.userCategoryId || txn.categoryId;
          return categoryToCheck ? filter.categoryIds!.includes(categoryToCheck) : false;
        });
      }

      if (filter.tags && filter.tags.length > 0) {
        filtered = filtered.filter((txn: StoredTransaction) => 
          filter.tags!.some(tag => txn.tags.includes(tag))
        );
      }

      if (!filter.includePending) {
        filtered = filtered.filter((txn: StoredTransaction) => !txn.pending);
      }

      if (!filter.includeHidden) {
        filtered = filtered.filter((txn: StoredTransaction) => !txn.isHidden);
      }

      if (filter.onlyUncategorized) {
        filtered = filtered.filter((txn: StoredTransaction) => !txn.userCategoryId);
      }

      // Handle exact amount search with tolerance
      if (filter.exactAmount !== undefined) {
        const tolerance = filter.amountTolerance || 0.50; // Default tolerance of $0.50
        const targetAmount = filter.exactAmount;
        filtered = filtered.filter((txn: StoredTransaction) => {
          const txnAmount = Math.abs(txn.amount);
          return txnAmount >= (targetAmount - tolerance) && txnAmount <= (targetAmount + tolerance);
        });
      } else {
        // Handle min/max range search (only if not doing exact search)
        if (filter.minAmount !== undefined) {
          filtered = filtered.filter((txn: StoredTransaction) => Math.abs(txn.amount) >= filter.minAmount!);
        }

        if (filter.maxAmount !== undefined) {
          filtered = filtered.filter((txn: StoredTransaction) => Math.abs(txn.amount) <= filter.maxAmount!);
        }
      }

      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        filtered = filtered.filter((txn: StoredTransaction) => 
          txn.name.toLowerCase().includes(query) ||
          (txn.merchantName && txn.merchantName.toLowerCase().includes(query)) ||
          txn.tags.some(tag => tag.toLowerCase().includes(query)) ||
          (txn.notes && txn.notes.toLowerCase().includes(query))
        );
      }

      // Sort by date descending
      filtered.sort((a: StoredTransaction, b: StoredTransaction) => b.date.localeCompare(a.date));

      return {
        success: true,
        transactions: filtered,
        totalCount: filtered.length,
        unfilteredTotal: totalBeforeSearchFilters,
      };
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return {
        success: false,
        error: 'Failed to fetch transactions',
      };
    }
  }

  /**
   * Update transaction category
   */
  async updateTransactionCategory(
    userId: string,
    transactionId: string,
    categoryId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];

      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      transaction.userCategoryId = categoryId;
      transaction.updatedAt = new Date();

      await this.dataService.saveData(`transactions_${userId}`, transactions);

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to update category' };
    }
  }

  /**
   * Add tags to transaction (replaces existing tags)
   */
  async addTransactionTags(
    userId: string,
    transactionId: string,
    tags: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];

      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      // Replace tags entirely (frontend sends the complete list)
      transaction.tags = tags;
      transaction.updatedAt = new Date();

      await this.dataService.saveData(`transactions_${userId}`, transactions);

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to add tags' };
    }
  }

  /**
   * Split a transaction into multiple parts
   */
  async splitTransaction(
    userId: string,
    transactionId: string,
    splits: Array<{
      amount: number;
      categoryId?: string;
      description?: string;
      tags?: string[];
    }>
  ): Promise<{ success: boolean; error?: string; splitTransactions?: StoredTransaction[] }> {
    try {
      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];

      const originalTransaction = transactions.find(t => t.id === transactionId);
      if (!originalTransaction) {
        return { success: false, error: 'Transaction not found' };
      }

      if (originalTransaction.isSplit) {
        return { success: false, error: 'Transaction is already split' };
      }

      // Validate split amounts equal original
      const totalSplitAmount = splits.reduce((sum, split) => sum + split.amount, 0);
      if (Math.abs(totalSplitAmount - Math.abs(originalTransaction.amount)) > 0.01) {
        return { success: false, error: 'Split amounts must equal original transaction amount' };
      }

      // Create split transactions
      const splitTransactions: StoredTransaction[] = [];
      const now = new Date();

      for (let i = 0; i < splits.length; i++) {
        const split = splits[i];
        const splitTxn: StoredTransaction = {
          id: uuidv4(),
          userId,
          accountId: originalTransaction.accountId,
          plaidTransactionId: null, // Split transactions don't have Plaid IDs
          plaidAccountId: originalTransaction.plaidAccountId,
          amount: originalTransaction.amount > 0 ? split.amount : -split.amount, // Maintain sign
          date: originalTransaction.date,
          name: split.description || `${originalTransaction.name} (Split ${i + 1})`,
          userDescription: split.description || null,
          merchantName: originalTransaction.merchantName,
          category: originalTransaction.category,
          categoryId: split.categoryId || null,
          userCategoryId: split.categoryId || null,
          status: originalTransaction.status,
          pending: originalTransaction.pending,
          isoCurrencyCode: originalTransaction.isoCurrencyCode,
          tags: split.tags || [],
          notes: split.description || null,
          isHidden: false,
          isSplit: false,
          parentTransactionId: originalTransaction.id,
          splitTransactionIds: [],
          location: originalTransaction.location,
          createdAt: now,
          updatedAt: now,
        };
        
        splitTransactions.push(splitTxn);
        transactions.push(splitTxn);
      }

      // Update original transaction
      originalTransaction.isSplit = true;
      originalTransaction.splitTransactionIds = splitTransactions.map(t => t.id);
      originalTransaction.isHidden = true; // Hide original from budgets
      originalTransaction.updatedAt = now;

      // Save all transactions
      await this.dataService.saveData(`transactions_${userId}`, transactions);

      return { success: true, splitTransactions };
    } catch (error) {
      console.error('Error splitting transaction:', error);
      return { success: false, error: 'Failed to split transaction' };
    }
  }

  /**
   * Update transaction description
   */
  async updateTransactionDescription(
    userId: string,
    transactionId: string,
    description: string | null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transactions = await this.dataService.getData<StoredTransaction[]>(
        `transactions_${userId}`
      ) || [];

      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      transaction.userDescription = description;
      transaction.updatedAt = new Date();

      await this.dataService.saveData(`transactions_${userId}`, transactions);
      return { success: true };
    } catch (error) {
      console.error('Error updating transaction description:', error);
      return { success: false, error: 'Failed to update description' };
    }
  }

  /**
   * Decrypt access token for use
   */
  private decryptToken(encryptedToken: string): string {
    try {
      return encryptionService.decrypt(encryptedToken);
    } catch (error) {
      // If this is a plain text token from before encryption was implemented,
      // throw a clear error message
      if (encryptedToken && encryptedToken.startsWith('access-')) {
        throw new Error('Invalid access token format. Please reconnect your bank account.');
      }
      throw new Error('Failed to decrypt access token. Please reconnect your bank account.');
    }
  }
}