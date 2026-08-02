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
  /**
   * Plaid's own `item.status.transactions.last_successful_update` for this
   * account's Item (ISO 8601), mirrored across the Item's accounts like
   * `plaidCursor`.
   *
   * This is NOT the same as `lastSynced`. `lastSynced` records when *we* last
   * called Plaid; this records when *Plaid* last succeeded in pulling
   * transactions from the institution. The two diverge exactly in the failure
   * mode that matters: our sync keeps succeeding, balances keep updating, and
   * transaction extraction has been dead for weeks. `null` when Plaid has not
   * reported one (TD-021).
   */
  lastTransactionUpdate?: string | null;
  /**
   * Plaid `item.consent_expiration_time` (ISO 8601) or null when the
   * institution does not expire consent. Stands in for the PENDING_EXPIRATION
   * webhook we do not receive.
   */
  consentExpirationTime?: string | null;
  /**
   * Plaid `persistent_account_id` — stable across card reissues where the
   * institution supplies it. Stored so a future account_id change can be
   * resolved automatically instead of by content matching. Null/absent for
   * institutions that do not provide it, e.g. Capital One (TD-020).
   */
  persistentAccountId?: string | null;
  createdAt: Date;              // When account was connected
  updatedAt: Date;              // Last update
}

/**
 * Plaid-internal fields that must never reach the browser.
 *
 * `plaidAccessToken` is the live bank credential (encrypted at rest, but the
 * ciphertext still has no business leaving the server — shipping it collapses
 * encryption-at-rest and transport into a single layer, so anyone holding
 * PLAID_ENCRYPTION_SECRET plus a captured response has a usable token).
 *
 * `plaidCursor` is a delivery receipt: advancing it is irreversible and drops
 * transactions permanently (TD-020). It has no client-side purpose.
 *
 * `plaidItemId` / `plaidAccountId` are opaque Plaid identifiers the SPA does
 * not read. Stripped as defense in depth, not because they are secret.
 */
const CLIENT_OMITTED_ACCOUNT_FIELDS = [
  'plaidAccessToken',
  'plaidCursor',
  'plaidItemId',
  'plaidAccountId',
] as const;

/** A StoredAccount safe to serialize to the browser. */
export type ClientAccount = Omit<
  StoredAccount,
  (typeof CLIENT_OMITTED_ACCOUNT_FIELDS)[number]
>;

/**
 * Strip Plaid-internal fields from a stored account before it crosses the wire.
 *
 * Every route that serializes a StoredAccount must pass it through here. The
 * previous code spread `...account` directly, which shipped the encrypted
 * access token to the client on every account listing (SA-19).
 */
export function toClientAccount(account: StoredAccount): ClientAccount {
  const safe = { ...account } as Partial<StoredAccount>;
  for (const field of CLIENT_OMITTED_ACCOUNT_FIELDS) {
    delete safe[field];
  }
  return safe as ClientAccount;
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
  /** Accounts marked `error` — Item-level failure not fixable by re-auth */
  degradedAccounts?: Array<{ id: string; institutionName: string; errorCode?: string }>;
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
      const degradedAccounts: Array<{ id: string; institutionName: string; errorCode?: string }> = [];

      // Sync each item's accounts
      for (const [encryptedToken, accounts] of itemGroups) {
        const accessToken = this.decryptToken(encryptedToken);

        const plaidResult = await this.plaidService.getAccounts(accessToken);

        if (!plaidResult.success || !plaidResult.accounts) {
          const plaidItemId = accounts[0]?.plaidItemId;

          // Mark accounts as requiring reauth if needed
          if (plaidResult.requiresReauth) {
            for (const account of accounts) {
              account.status = 'requires_reauth';
              account.updatedAt = new Date();
              await this.saveAccount(familyId, account);
              reauthRequiredAccounts.push({ id: account.id, institutionName: account.institutionName });
            }
          } else if (plaidResult.degraded) {
            // Item-level failure the user cannot clear by signing in again.
            // Mark it so the UI can warn instead of showing a healthy account.
            for (const account of accounts) {
              account.status = 'error';
              account.updatedAt = new Date();
              await this.saveAccount(familyId, account);
              degradedAccounts.push({
                id: account.id,
                institutionName: account.institutionName,
                errorCode: plaidResult.errorCode,
              });
            }
          }

          // Every failure gets a log line. This branch previously fell through
          // to a bare `continue`, so a non-reauth balance failure left no trace
          // anywhere — not in the UI, not in the logs (TD-022).
          log.warn(
            {
              plaidItemId,
              accountCount: accounts.length,
              errorCode: plaidResult.errorCode,
              requiresReauth: plaidResult.requiresReauth ?? false,
              degraded: plaidResult.degraded ?? false,
            },
            'balance sync failed for item',
          );
          continue;
        }

        // Plaid's view of when transactions last actually landed. One extra
        // call per Item per balance sync; without it a stalled transaction
        // feed is indistinguishable from a healthy one (TD-021). A failure
        // here must not fail the balance sync — the values are advisory.
        const itemStatus = await this.plaidService.getItemStatus(accessToken);
        if (!itemStatus.success) {
          log.warn(
            { plaidItemId: accounts[0]?.plaidItemId, error: itemStatus.error },
            'could not read item status; staleness indicators left unchanged',
          );
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
            if (itemStatus.success) {
              storedAccount.lastTransactionUpdate = itemStatus.lastSuccessfulUpdate ?? null;
              storedAccount.consentExpirationTime = itemStatus.consentExpirationTime ?? null;
            }
            if (plaidAccount.persistentAccountId) {
              storedAccount.persistentAccountId = plaidAccount.persistentAccountId;
            }

            await this.saveAccount(familyId, storedAccount);
            accountsUpdated++;
          }
        }
      }

      return {
        success: true,
        accountsUpdated,
        reauthRequiredAccounts,
        degradedAccounts,
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