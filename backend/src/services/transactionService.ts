/**
 * Transaction Management Service
 * 
 * Handles transaction syncing, categorization, and filtering
 */

import { v4 as uuidv4 } from 'uuid';
import { PlaidService, Transaction as PlaidTransaction } from './plaidService';
import { DataService } from './dataService';
import { Repository } from './repository';
import { StoredAccount } from './accountService';
import { encryptionService } from '../utils/encryption';
import { filterTransactions } from './transactionFilterEngine';
import { calculateIncome, calculateExpenses, calculateNetCashFlow } from '../shared/utils/transactionCalculations';

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
  plaidCategoryId: string | null;      // Plaid's suggested category ID
  categoryId: string | null;           // User's assigned category
  status: TransactionStatus;           // Transaction status
  pending: boolean;                    // Is transaction pending?
  isoCurrencyCode: string | null;      // Currency code
  accountOwner: string | null;         // Account owner from Plaid (for joint accounts)
  originalDescription: string | null;  // Raw statement description from Plaid
  tags: string[];                      // User tags
  notes: string | null;                // User notes
  isHidden: boolean;                   // Hidden from budgets
  isFlagged: boolean;                  // Flagged for discussion
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
  onlyFlagged?: boolean;
  minAmount?: number;
  maxAmount?: number;
  exactAmount?: number;
  amountTolerance?: number;
  transactionType?: 'income' | 'expense' | 'transfer' | 'all'; // Filter by income vs expense vs transfers
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
  /** Newly added transactions from this sync (for notification triggers) */
  newTransactions?: StoredTransaction[];
}

export class TransactionService {
  private repo: Repository<StoredTransaction>;

  constructor(
    dataService: DataService,
    private plaidService: PlaidService
  ) {
    this.repo = new Repository<StoredTransaction>(dataService, 'transactions');
  }

  /**
   * Check if a location object contains any non-null data
   */
  private hasLocationData(location: any): boolean {
    if (!location || typeof location !== 'object') {
      return false;
    }
    
    const fields = ['address', 'city', 'region', 'postalCode', 'country', 'lat', 'lon'];
    return fields.some(field => location[field] !== null && location[field] !== undefined);
  }

  /**
   * Sync transactions from Plaid for all user accounts
   */
  async syncTransactions(
    familyId: string,
    accounts: StoredAccount[],
    startDate: string = '2025-01-01'
  ): Promise<SyncResult> {
    try {
      const endDate = new Date().toISOString().split('T')[0]; // Today
      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;
      const allNewTransactions: StoredTransaction[] = [];
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
          familyId,
          tokenAccounts,
          plaidResult.transactions
        );

        totalAdded += result.added;
        totalModified += result.modified;
        totalRemoved += result.removed;
        allNewTransactions.push(...result.newTransactions);

        console.log(`Sync complete: ${result.added} added, ${result.modified} modified, ${result.removed} removed`);
      }

      // If some accounts failed but others succeeded, return partial success
      if (failedAccounts.length > 0 && (totalAdded > 0 || totalModified > 0)) {
        return {
          success: true,
          added: totalAdded,
          modified: totalModified,
          removed: totalRemoved,
          newTransactions: allNewTransactions,
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
        newTransactions: allNewTransactions,
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
    familyId: string,
    accounts: StoredAccount[],
    plaidTransactions: PlaidTransaction[]
  ): Promise<{ added: number; modified: number; removed: number; newTransactions: StoredTransaction[] }> {
    // Load existing transactions
    const existingTransactions = await this.repo.getAll(familyId);

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
    const newTransactions: StoredTransaction[] = [];

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
        const newTxn = this.createTransaction(familyId, account.id, plaidTxn);
        existingTransactions.push(newTxn);
        newTransactions.push(newTxn);
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
    await this.repo.saveAll(familyId, existingTransactions);

    return { added, modified, removed, newTransactions };
  }

  /**
   * Create a new transaction from Plaid data
   */
  private createTransaction(
    familyId: string,
    accountId: string,
    plaidTxn: PlaidTransaction
  ): StoredTransaction {
    return {
      id: uuidv4(),
      userId: familyId,
      accountId,
      plaidTransactionId: plaidTxn.plaidTransactionId,
      plaidAccountId: plaidTxn.accountId,
      amount: plaidTxn.amount,
      date: plaidTxn.date,
      name: plaidTxn.name,
      userDescription: null, // User hasn't edited description yet
      merchantName: plaidTxn.merchantName,
      category: plaidTxn.category,
      plaidCategoryId: plaidTxn.categoryId,
      // Do not automatically assign Plaid categories - user must categorize manually
      categoryId: null,
      status: plaidTxn.pending ? 'pending' : 'posted',
      pending: plaidTxn.pending,
      isoCurrencyCode: plaidTxn.isoCurrencyCode,
      accountOwner: plaidTxn.accountOwner || null,
      originalDescription: plaidTxn.originalDescription || null,
      tags: [],
      notes: null,
      isHidden: false,
      isFlagged: false,
      isSplit: false,
      parentTransactionId: null,
      splitTransactionIds: [],
      location: (() => {
        if (!plaidTxn.location) return null;

        const locationData = {
          address: plaidTxn.location.address || null,
          city: plaidTxn.location.city || null,
          region: plaidTxn.location.region || null,
          postalCode: plaidTxn.location.postalCode || null,
          country: plaidTxn.location.country || null,
          lat: null,
          lon: null,
        };

        return this.hasLocationData(locationData) ? locationData : null;
      })(),
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

    if (existing.accountOwner !== plaidTxn.accountOwner) {
      existing.accountOwner = plaidTxn.accountOwner || null;
      changed = true;
    }

    if (existing.originalDescription !== plaidTxn.originalDescription) {
      existing.originalDescription = plaidTxn.originalDescription || null;
      changed = true;
    }

    // Update Plaid category metadata for reference, but don't auto-assign to categoryId
    const plaidCategoryChanged = JSON.stringify(existing.category) !== JSON.stringify(plaidTxn.category);

    if (plaidCategoryChanged) {
      existing.category = plaidTxn.category;
      existing.plaidCategoryId = plaidTxn.categoryId;
      // Do NOT update categoryId - preserve user's manual categorization
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
    familyId: string,
    filter: TransactionFilter = {}
  ): Promise<TransactionsResult> {
    try {
      const allTransactions = await this.repo.getAll(familyId);
      return filterTransactions(allTransactions, filter);
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
    familyId: string,
    transactionId: string,
    categoryId: string | null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transactions = await this.repo.getAll(familyId);

      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      // Set to null if null (uncategorized), not undefined
      transaction.categoryId = categoryId;
      transaction.updatedAt = new Date();

      await this.repo.saveAll(familyId, transactions);

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to update category' };
    }
  }

  /**
   * Add tags to transaction (replaces existing tags)
   */
  async addTransactionTags(
    familyId: string,
    transactionId: string,
    tags: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transactions = await this.repo.getAll(familyId);

      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      // Replace tags entirely (frontend sends the complete list)
      transaction.tags = tags;
      transaction.updatedAt = new Date();

      await this.repo.saveAll(familyId, transactions);

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to add tags' };
    }
  }

  /**
   * Add tags to a transaction (merges with existing, no duplicates)
   */
  async appendTransactionTags(
    familyId: string,
    transactionId: string,
    tagsToAdd: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transactions = await this.repo.getAll(familyId);

      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      const merged = Array.from(new Set([...transaction.tags, ...tagsToAdd]));
      if (merged.length === transaction.tags.length) {
        return { success: true }; // no change needed
      }

      transaction.tags = merged;
      transaction.updatedAt = new Date();
      await this.repo.saveAll(familyId, transactions);

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to add tags' };
    }
  }

  /**
   * Remove specific tags from a transaction
   */
  async removeTransactionTags(
    familyId: string,
    transactionId: string,
    tagsToRemove: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transactions = await this.repo.getAll(familyId);

      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      const removeSet = new Set(tagsToRemove);
      const filtered = transaction.tags.filter(t => !removeSet.has(t));
      if (filtered.length === transaction.tags.length) {
        return { success: true }; // no change needed
      }

      transaction.tags = filtered;
      transaction.updatedAt = new Date();
      await this.repo.saveAll(familyId, transactions);

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to remove tags' };
    }
  }

  /**
   * Split a transaction into multiple parts
   */
  async splitTransaction(
    familyId: string,
    transactionId: string,
    splits: Array<{
      amount: number;
      categoryId?: string;
      description?: string;
      tags?: string[];
    }>
  ): Promise<{ success: boolean; error?: string; splitTransactions?: StoredTransaction[] }> {
    try {
      const transactions = await this.repo.getAll(familyId);

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
          userId: familyId,
          accountId: originalTransaction.accountId,
          plaidTransactionId: null, // Split transactions don't have Plaid IDs
          plaidAccountId: originalTransaction.plaidAccountId,
          amount: originalTransaction.amount > 0 ? split.amount : -split.amount, // Maintain sign
          date: originalTransaction.date,
          // Use split description if provided, otherwise inherit from original
          name: originalTransaction.name, // Always keep the original bank name
          userDescription: split.description || originalTransaction.userDescription || null,
          merchantName: originalTransaction.merchantName,
          category: originalTransaction.category,
          plaidCategoryId: originalTransaction.plaidCategoryId,
          categoryId: split.categoryId || null,
          status: originalTransaction.status,
          pending: originalTransaction.pending,
          isoCurrencyCode: originalTransaction.isoCurrencyCode,
          accountOwner: originalTransaction.accountOwner || null,
          originalDescription: originalTransaction.originalDescription || null,
          tags: split.tags || [],
          notes: originalTransaction.notes, // Preserve original notes
          isHidden: false,
          isFlagged: false,
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
      await this.repo.saveAll(familyId, transactions);

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
    familyId: string,
    transactionId: string,
    description: string | null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transactions = await this.repo.getAll(familyId);

      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      transaction.userDescription = description;
      transaction.updatedAt = new Date();

      await this.repo.saveAll(familyId, transactions);
      return { success: true };
    } catch (error) {
      console.error('Error updating transaction description:', error);
      return { success: false, error: 'Failed to update description' };
    }
  }

  /**
   * Update transaction flagged status
   */
  async updateTransactionFlagged(
    familyId: string,
    transactionId: string,
    isFlagged: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transactions = await this.repo.getAll(familyId);

      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      transaction.isFlagged = isFlagged;
      transaction.updatedAt = new Date();

      await this.repo.saveAll(familyId, transactions);
      return { success: true };
    } catch (error) {
      console.error('Error updating transaction flagged status:', error);
      return { success: false, error: 'Failed to update flagged status' };
    }
  }

  /**
   * Update transaction hidden status
   */
  async updateTransactionHidden(
    familyId: string,
    transactionId: string,
    isHidden: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transactions = await this.repo.getAll(familyId);

      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      transaction.isHidden = isHidden;
      transaction.updatedAt = new Date();

      await this.repo.saveAll(familyId, transactions);
      return { success: true };
    } catch (error) {
      console.error('Error updating transaction hidden status:', error);
      return { success: false, error: 'Failed to update hidden status' };
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

  /**
   * Check if any active transactions are associated with a category
   * Uses same filtering logic as getBlockingTransactionDetails to avoid
   * "Cannot delete category with 0 associated transactions" error
   */
  async hasTransactionsForCategory(categoryId: string, familyId: string): Promise<boolean> {
    const transactions = await this.repo.getAll(familyId);
    return transactions.some(t =>
      t.categoryId === categoryId &&
      t.status !== 'removed' &&
      !t.isHidden
    );
  }

  /**
   * Bulk recategorize all transactions from one category to another
   * Used during category deletion workflow
   * @param oldCategoryId Category to move from
   * @param newCategoryId Category to move to (null for uncategorized)
   * @param familyId Family ID
   * @returns Count of transactions updated
   */
  async bulkRecategorizeByCategory(
    oldCategoryId: string,
    newCategoryId: string | null,
    familyId: string
  ): Promise<number> {
    const transactions = await this.repo.getAll(familyId);

    let updateCount = 0;
    const updatedTransactions = transactions.map(transaction => {
      if (transaction.categoryId === oldCategoryId) {
        updateCount++;
        return {
          ...transaction,
          categoryId: newCategoryId
        };
      }
      return transaction;
    });

    if (updateCount > 0) {
      await this.repo.saveAll(familyId, updatedTransactions);
    }

    return updateCount;
  }

  /**
   * Get details about transactions that would block category deletion
   * Returns transaction count and sample transaction details for error messages
   */
  async getBlockingTransactionDetails(categoryId: string, familyId: string): Promise<{
    count: number;
    sampleTransactions: Array<{
      id: string;
      description: string;
      amount: number;
      date: string;
      accountId: string;
    }>;
  }> {
    const transactions = await this.repo.getAll(familyId);

    const blockingTransactions = transactions.filter(t =>
      t.categoryId === categoryId &&
      t.status !== 'removed' &&
      !t.isHidden
    );

    // Get up to 3 sample transactions for the error message
    const sampleTransactions = blockingTransactions.slice(0, 3).map(t => ({
      id: t.id,
      description: t.userDescription || t.name || 'Unknown transaction',
      amount: t.amount,
      date: t.date,
      accountId: t.accountId
    }));

    return {
      count: blockingTransactions.length,
      sampleTransactions
    };
  }

  /**
   * Get transaction counts for all categories
   * Returns a map of category IDs to their transaction counts
   */
  async getTransactionCountsByCategory(familyId: string): Promise<Record<string, number>> {
    try {
      const transactions = await this.repo.getAll(familyId);

      const counts: Record<string, number> = {};
      
      for (const transaction of transactions) {
        // Skip removed or hidden transactions
        if (transaction.status === 'removed' || transaction.isHidden) {
          continue;
        }
        
        // Use the categoryId field (which contains user-assigned or Plaid category)
        const categoryId = transaction.categoryId;
        
        if (categoryId) {
          counts[categoryId] = (counts[categoryId] || 0) + 1;
        }
      }
      
      return counts;
    } catch (error) {
      console.error('Error getting transaction counts by category:', error);
      return {};
    }
  }

  /**
   * Create a transaction for testing purposes
   * This method bypasses normal Plaid sync flow and creates a transaction directly
   */
  async createTestTransaction(transactionData: {
    userId: string;
    accountId: string;
    plaidTransactionId: string;
    plaidAccountId: string;
    amount: number;
    date: string;
    name: string;
    userDescription: string | null;
    merchantName: string | null;
    category: string[] | null;
    plaidCategoryId: string | null;
    categoryId: string | null;
    status: TransactionStatus;
    pending: boolean;
    isoCurrencyCode: string | null;
    accountOwner?: string | null;
    originalDescription?: string | null;
    tags: string[];
    notes: string | null;
    isHidden: boolean;
    isFlagged: boolean;
    location: {
      address: string | null;
      city: string | null;
      region: string | null;
      postalCode: string | null;
      country: string | null;
      lat: number | null;
      lon: number | null;
    } | null;
  }): Promise<StoredTransaction> {
    const transaction: StoredTransaction = {
      id: uuidv4(),
      ...transactionData,
      accountOwner: transactionData.accountOwner ?? null,
      originalDescription: transactionData.originalDescription ?? null,
      isSplit: false,
      parentTransactionId: null,
      splitTransactionIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Get existing transactions
    const transactions = await this.repo.getAll(transactionData.userId);

    // Add the new transaction
    transactions.push(transaction);

    // Save updated transactions
    await this.repo.saveAll(transactionData.userId, transactions);

    return transaction;
  }

  /**
   * Get count of uncategorized transactions for a user
   */
  async getUncategorizedCount(familyId: string): Promise<{ count: number; total: number }> {
    const result = await this.getTransactions(familyId);
    if (!result.success || !result.transactions) {
      throw new Error('Failed to fetch transactions');
    }
    const count = result.transactions.filter(
      t => !t.categoryId && !t.isHidden && !t.parentTransactionId
    ).length;
    const total = result.transactions.filter(
      t => !t.isHidden && !t.parentTransactionId
    ).length;
    return { count, total };
  }

  /**
   * Get a summary of this month's transactions (income, expenses, net)
   */
  async getMonthlySummary(familyId: string): Promise<{
    month: string;
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
    transactionCount: number;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const result = await this.getTransactions(familyId, {
      startDate: startOfMonth,
      endDate: endOfMonth,
      includePending: false,
    });

    if (!result.success || !result.transactions) {
      throw new Error('Failed to calculate summary');
    }

    return {
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      totalIncome: calculateIncome(result.transactions),
      totalExpenses: calculateExpenses(result.transactions),
      netIncome: calculateNetCashFlow(result.transactions),
      transactionCount: result.transactions.length,
    };
  }

  /**
   * Bulk update multiple transactions with the given field updates
   */
  async bulkUpdate(
    familyId: string,
    transactionIds: string[],
    updates: {
      categoryId?: string | null;
      userDescription?: string | null;
      isHidden?: boolean;
      isFlagged?: boolean;
      tagsToAdd?: string[];
      tagsToRemove?: string[];
    }
  ): Promise<{ updated: number; failed: number; errors?: string[] }> {
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const transactionId of transactionIds) {
      try {
        if (updates.categoryId !== undefined) {
          const result = await this.updateTransactionCategory(familyId, transactionId, updates.categoryId);
          if (!result.success) {
            failedCount++;
            errors.push(`Transaction ${transactionId}: ${result.error}`);
            continue;
          }
        }

        if (updates.userDescription !== undefined) {
          const result = await this.updateTransactionDescription(familyId, transactionId, updates.userDescription);
          if (!result.success) {
            failedCount++;
            errors.push(`Transaction ${transactionId}: ${result.error}`);
            continue;
          }
        }

        if (updates.isHidden !== undefined) {
          const result = await this.updateTransactionHidden(familyId, transactionId, updates.isHidden);
          if (!result.success) {
            failedCount++;
            errors.push(`Transaction ${transactionId}: ${result.error}`);
            continue;
          }
        }

        if (updates.isFlagged !== undefined) {
          const result = await this.updateTransactionFlagged(familyId, transactionId, updates.isFlagged);
          if (!result.success) {
            failedCount++;
            errors.push(`Transaction ${transactionId}: ${result.error}`);
            continue;
          }
        }

        if (updates.tagsToAdd && updates.tagsToAdd.length > 0) {
          const result = await this.appendTransactionTags(familyId, transactionId, updates.tagsToAdd);
          if (!result.success) {
            failedCount++;
            errors.push(`Transaction ${transactionId}: ${result.error}`);
            continue;
          }
        }

        if (updates.tagsToRemove && updates.tagsToRemove.length > 0) {
          const result = await this.removeTransactionTags(familyId, transactionId, updates.tagsToRemove);
          if (!result.success) {
            failedCount++;
            errors.push(`Transaction ${transactionId}: ${result.error}`);
            continue;
          }
        }

        successCount++;
      } catch {
        failedCount++;
        errors.push(`Transaction ${transactionId}: Update failed`);
      }
    }

    return {
      updated: successCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}