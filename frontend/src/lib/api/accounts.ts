import type { AxiosInstance } from 'axios';
import type { PlaidAccount, LinkTokenResponse, ExchangeTokenRequest } from '../../../../shared/types';

/** What a re-auth discovered about the Item's accounts (TD-020). */
export interface ReauthAccountRef {
  id: string;
  accountName: string;
  mask: string | null;
}

export interface ReauthCompleteResult {
  /** Genuinely new accounts now tracked. */
  adopted: ReauthAccountRef[];
  /** Accounts the bank replaced with a new ID — need reconciliation. */
  pendingReconciliation: Array<ReauthAccountRef & { matchedVia: string }>;
  /** Accounts that vanished with no identifiable replacement. */
  unpaired: ReauthAccountRef[];
}

// Extended PlaidAccount with backend fields
export interface ExtendedPlaidAccount extends PlaidAccount {
  accountName?: string;
  officialName?: string | null;
  institutionName?: string;
  /**
   * The bank replaced this account's Plaid id and the app has recorded the
   * replacement but cannot re-key its history automatically (TD-020). Derived
   * server-side; the id itself is never sent to the client.
   */
  needsReconciliation?: boolean;
}

export function createAccountsApi(client: AxiosInstance) {
  return {
    // Plaid link token endpoints
    async createLinkToken(): Promise<LinkTokenResponse> {
      const { data } = await client.post<LinkTokenResponse>('/plaid/link-token');
      return data;
    },

    async exchangePublicToken(request: ExchangeTokenRequest): Promise<{ success: boolean }> {
      const { data } = await client.post('/plaid/exchange-token', request);
      return data;
    },

    // Account endpoints
    async connectAccount(params: {
      publicToken: string;
      institutionId: string;
      institutionName: string;
    }): Promise<{ account: PlaidAccount }> {
      const { data } = await client.post('/accounts/connect', params);
      return data;
    },

    async getAccounts(): Promise<ExtendedPlaidAccount[]> {
      const { data } = await client.get<{ accounts: ExtendedPlaidAccount[] }>('/accounts');
      return data.accounts;
    },

    async disconnectAccount(accountId: string): Promise<void> {
      const { data } = await client.delete(`/accounts/${accountId}`);
      if (!data.success) {
        throw new Error(data.error || 'Failed to disconnect account');
      }
    },

    async updateAccountNickname(accountId: string, nickname: string | null): Promise<void> {
      const { data } = await client.put(`/accounts/${accountId}`, { nickname });
      if (!data.success) {
        throw new Error(data.error || 'Failed to update account nickname');
      }
    },

    async createUpdateLinkToken(accountId: string): Promise<{ link_token: string; expiration: string }> {
      const { data } = await client.post(`/accounts/${accountId}/link-token`);
      if (!data.success) {
        throw new Error(data.error || 'Failed to create link token');
      }
      return { link_token: data.link_token, expiration: data.expiration };
    },

    async completeReauth(accountId: string): Promise<ReauthCompleteResult> {
      const { data } = await client.post(`/accounts/${accountId}/reauth-complete`);
      if (!data.success) {
        throw new Error(data.error || 'Failed to complete re-authentication');
      }
      return {
        adopted: data.adopted ?? [],
        pendingReconciliation: data.pendingReconciliation ?? [],
        unpaired: data.unpaired ?? [],
      };
    },

    async syncAccountTransactions(accountId: string): Promise<{
      added: number;
      modified: number;
      removed: number;
      warning?: string;
    }> {
      const { data } = await client.post(`/accounts/${accountId}/sync-transactions`);
      if (!data.success) {
        throw new Error(data.error || 'Failed to sync account transactions');
      }
      return data;
    },
  };
}
