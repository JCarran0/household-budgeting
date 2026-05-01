/**
 * Account Management Service
 * 
 * Handles bank account connections via Plaid and account data persistence
 */

import { v4 as uuidv4 } from 'uuid';
import { PlaidService } from './plaidService';
import { DataService } from './dataService';
import { encryptionService } from '../utils/encryption';

import { childLogger } from '../utils/logger';

const log = childLogger('accountService');

// Account status types
export type AccountStatus = 'active' | 'inactive' | 'requires_reauth' | 'error';

// Stored account structure
export interface StoredAccount {
  id: string;                    // Our internal ID
  userId: string;                 // User who owns this account
  plaidItemId: string;           // Plaid Item ID
  plaidAccountId: string;        // Plaid Account ID
  plaidAccessToken: string;      // Encrypted access token
  institutionId: string;         // Plaid Institution ID
  institutionName: string;       // Bank name (e.g., "Chase")
  accountName: string;           // Account name from Plaid
  officialName: string | null;   // Official account name from bank
  nickname: string | null;       // User-defined nickname for the account
  type: string;                  // Account type (checking, savings, credit)
  subtype: string | null;        // Account subtype
  mask: string | null;           // Last 4 digits
  currentBalance: number | null; // Current balance
  availableBalance: number | null; // Available balance
  creditLimit: number | null;    // Credit limit (for credit cards)
  currency: string;              // ISO currency code
  status: AccountStatus;         // Account status
  lastSynced: Date | null;       // Last successful sync
  /**
   * Plaid `transactions/sync` cursor for the Item this account belongs to.
   * Persisted on every account belonging to the Item (one cursor per Item, but
   * mirrored across its accounts since accounts are the storage unit). `null`
   * means we have not yet completed an initial sync — the next call will omit
   * `cursor` and Plaid will return the full available history.
   */
  plaidCursor: string | null;
  createdAt: Date;              // When account was connected
  updatedAt: Date;              // Last update
}

// Result types
export interface ConnectAccountResult {
  success: boolean;
  account?: StoredAccount;
  error?: string;
}

export interface AccountsResult {
  success: boolean;
  accounts?: StoredAccount[];
  error?: string;
}

export interface SyncResult {
  success: boolean;
  accountsUpdated?: number;
  error?: string;
  /** Accounts that were marked requires_reauth during this sync */
  reauthRequiredAccounts?: Array<{ id: string; institutionName: string }>;
}

export class AccountService {
  constructor(
    private dataService: DataService,
    private plaidService: PlaidService
  ) {}

  /**
   * Connect a new bank account after Plaid Link success
   */
  async connectAccount(
    familyId: string,
    publicToken: string,
    institutionId: string,
    institutionName: string
  ): Promise<ConnectAccountResult> {
    try {
      // Exchange public token for access token
      const tokenResult = await this.plaidService.exchangePublicToken(publicToken);

      if (!tokenResult.success || !tokenResult.accessToken || !tokenResult.itemId) {
        return {
          success: false,
          error: tokenResult.error || 'Failed to exchange token',
        };
      }

      // Fetch account details from Plaid
      const accountsResult = await this.plaidService.getAccounts(tokenResult.accessToken);

      if (!accountsResult.success || !accountsResult.accounts) {
        return {
          success: false,
          error: accountsResult.error || 'Failed to fetch accounts',
        };
      }

      // Store each account
      const storedAccounts: StoredAccount[] = [];

      for (const plaidAccount of accountsResult.accounts) {
        const account: StoredAccount = {
          id: uuidv4(),
          userId: familyId,
          plaidItemId: tokenResult.itemId,
          plaidAccountId: plaidAccount.plaidAccountId,
          plaidAccessToken: this.encryptToken(tokenResult.accessToken),
          institutionId,
          institutionName,
          accountName: plaidAccount.name,
          officialName: plaidAccount.officialName,
          nickname: null,  // User-defined nickname, initially null
          type: plaidAccount.type,
          subtype: plaidAccount.subtype,
          mask: plaidAccount.mask,
          currentBalance: plaidAccount.currentBalance,
          availableBalance: plaidAccount.availableBalance,
          creditLimit: plaidAccount.creditLimit || null,
          currency: plaidAccount.currency || 'USD',
          status: 'active',
          lastSynced: new Date(),
          plaidCursor: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Save to data store
        await this.saveAccount(familyId, account);
        storedAccounts.push(account);
      }

      // Return first account (primary)
      return {
        success: true,
        account: storedAccounts[0],
      };
    } catch (error) {
      log.error({ err: error }, 'error connecting account');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect account',
      };
    }
  }

  /**
   * Get all accounts for a family
   */
  async getUserAccounts(familyId: string): Promise<AccountsResult> {
    try {
      const accounts = await this.dataService.getData<StoredAccount[]>(`accounts_${familyId}`) || [];

      return {
        success: true,
        accounts: accounts.filter((a: StoredAccount) => a.status !== 'inactive'),
      };
    } catch (error) {
      log.error({ err: error }, 'error fetching user accounts');
      return {
        success: false,
        error: 'Failed to fetch accounts',
      };
    }
  }

  /**
   * Get a specific account
   */
  async getAccount(familyId: string, accountId: string): Promise<StoredAccount | null> {
    const accountsResult = await this.getUserAccounts(familyId);
    
    if (!accountsResult.success || !accountsResult.accounts) {
      return null;
    }

    return accountsResult.accounts.find(a => a.id === accountId) || null;
  }

  /**
   * Sync account balances from Plaid
   */
  async syncAccountBalances(familyId: string): Promise<SyncResult> {
    try {
      const accountsResult = await this.getUserAccounts(familyId);
      
      if (!accountsResult.success || !accountsResult.accounts) {
        return {
          success: false,
          error: 'No accounts to sync',
        };
      }

      // Group accounts by Plaid Item (access token)
      const itemGroups = new Map<string, StoredAccount[]>();
      
      for (const account of accountsResult.accounts) {
        const items = itemGroups.get(account.plaidAccessToken) || [];
        items.push(account);
        itemGroups.set(account.plaidAccessToken, items);
      }

      let accountsUpdated = 0;
      const reauthRequiredAccounts: Array<{ id: string; institutionName: string }> = [];

      // Sync each item's accounts
      for (const [encryptedToken, accounts] of itemGroups) {
        const accessToken = this.decryptToken(encryptedToken);

        const plaidResult = await this.plaidService.getAccounts(accessToken);

        if (!plaidResult.success || !plaidResult.accounts) {
          // Mark accounts as requiring reauth if needed
          if (plaidResult.requiresReauth) {
            for (const account of accounts) {
              account.status = 'requires_reauth';
              account.updatedAt = new Date();
              await this.saveAccount(familyId, account);
              reauthRequiredAccounts.push({ id: account.id, institutionName: account.institutionName });
            }
          }
          continue;
        }

        // Update balances
        for (const plaidAccount of plaidResult.accounts) {
          const storedAccount = accounts.find(
            a => a.plaidAccountId === plaidAccount.plaidAccountId
          );
          
          if (storedAccount) {
            storedAccount.currentBalance = plaidAccount.currentBalance;
            storedAccount.availableBalance = plaidAccount.availableBalance;
            storedAccount.creditLimit = plaidAccount.creditLimit || null;
            storedAccount.lastSynced = new Date();
            storedAccount.updatedAt = new Date();
            storedAccount.status = 'active';

            await this.saveAccount(familyId, storedAccount);
            accountsUpdated++;
          }
        }
      }

      return {
        success: true,
        accountsUpdated,
        reauthRequiredAccounts,
      };
    } catch (error) {
      log.error({ err: error }, 'error syncing account balances');
      return {
        success: false,
        error: 'Failed to sync balances',
      };
    }
  }

  /**
   * Update account nickname
   */
  async updateAccountNickname(familyId: string, accountId: string, nickname: string | null): Promise<{ success: boolean; error?: string }> {
    try {
      const account = await this.getAccount(familyId, accountId);

      if (!account) {
        return { success: false, error: 'Account not found' };
      }

      // Update the nickname
      account.nickname = nickname;
      account.updatedAt = new Date();

      // Save the updated account
      const accounts = await this.dataService.getData<StoredAccount[]>(`accounts_${familyId}`) || [];
      const updatedAccounts = accounts.map(acc =>
        acc.id === accountId ? account : acc
      );

      await this.dataService.saveData(`accounts_${familyId}`, updatedAccounts);

      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'error updating account nickname');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update account nickname'
      };
    }
  }

  /**
   * Disconnect an account
   */
  async disconnectAccount(familyId: string, accountId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const account = await this.getAccount(familyId, accountId);
      
      if (!account) {
        return {
          success: false,
          error: 'Account not found',
        };
      }

      // Remove from Plaid - this completely deletes the Item
      // This ensures reconnecting will create a new Item with proper transaction history
      try {
        const accessToken = this.decryptToken(account.plaidAccessToken);
        
        const removeResult = await this.plaidService.removeItem(accessToken);
        
        if (!removeResult.success) {
          // Log the error but continue with disconnection
          // User can still disconnect locally even if Plaid removal fails
          log.error({ plaidItemId: account.plaidItemId, error: removeResult.error || 'Unknown error' }, 'failed to remove Plaid Item');
        }
      } catch (plaidError) {
        // Log error but don't fail the whole disconnection
        log.error({ err: plaidError, accountId }, 'error calling Plaid removeItem');
      }

      // Mark as inactive locally
      account.status = 'inactive';
      account.updatedAt = new Date();
      await this.saveAccount(familyId, account);
      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'error disconnecting account');
      return {
        success: false,
        error: 'Failed to disconnect account',
      };
    }
  }

  /**
   * Persist a Plaid `transactions/sync` cursor on every active account
   * belonging to the given Item. Cursor is per-Item but mirrored across
   * accounts since accounts are our storage unit.
   */
  async setItemCursor(familyId: string, plaidItemId: string, cursor: string): Promise<void> {
    const accounts = await this.dataService.getData<StoredAccount[]>(`accounts_${familyId}`) || [];
    let changed = false;
    for (const account of accounts) {
      if (account.plaidItemId === plaidItemId && account.plaidCursor !== cursor) {
        account.plaidCursor = cursor;
        account.updatedAt = new Date();
        changed = true;
      }
    }
    if (changed) {
      await this.dataService.saveData(`accounts_${familyId}`, accounts);
    }
  }

  /**
   * Save account to data store
   */
  private async saveAccount(familyId: string, account: StoredAccount): Promise<void> {
    const accounts = await this.dataService.getData<StoredAccount[]>(
      `accounts_${familyId}`
    ) || [];

    const index = accounts.findIndex((a: StoredAccount) => a.id === account.id);

    if (index >= 0) {
      accounts[index] = account;
    } else {
      accounts.push(account);
    }

    await this.dataService.saveData(`accounts_${familyId}`, accounts);
  }

  /**
   * Create a link token for re-authentication (update mode)
   * This allows users to sign in again without disconnecting
   */
  async createUpdateLinkToken(familyId: string, accountId: string): Promise<{ success: boolean; linkToken?: string; expiration?: string; error?: string }> {
    try {
      const account = await this.getAccount(familyId, accountId);

      if (!account) {
        return { success: false, error: 'Account not found' };
      }

      const accessToken = this.decryptToken(account.plaidAccessToken);
      const result = await this.plaidService.createUpdateLinkToken(familyId, accessToken);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        linkToken: result.linkToken,
        expiration: result.expiration,
      };
    } catch (error) {
      log.error({ err: error }, 'error creating update link token');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create update link token',
      };
    }
  }

  /**
   * Mark account as active after successful re-authentication
   */
  async markAccountActive(familyId: string, accountId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const account = await this.getAccount(familyId, accountId);

      if (!account) {
        return { success: false, error: 'Account not found' };
      }

      account.status = 'active';
      account.lastSynced = new Date();
      account.updatedAt = new Date();
      await this.saveAccount(familyId, account);

      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'error marking account active');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update account status',
      };
    }
  }

  /**
   * Encrypt access token for storage using AES-256-GCM
   */
  private encryptToken(token: string): string {
    return encryptionService.encrypt(token);
  }

  /**
   * Decrypt access token for use
   */
  private decryptToken(encryptedToken: string): string {
    return encryptionService.decrypt(encryptedToken);
  }
}