import type { AxiosInstance } from 'axios';
import type { PlaidAccount, LinkTokenResponse, ExchangeTokenRequest } from '../../../../shared/types';

// Extended PlaidAccount with backend fields
export interface ExtendedPlaidAccount extends PlaidAccount {
  accountName?: string;
  officialName?: string | null;
  institutionName?: string;
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

    async completeReauth(accountId: string): Promise<void> {
      const { data } = await client.post(`/accounts/${accountId}/reauth-complete`);
      if (!data.success) {
        throw new Error(data.error || 'Failed to complete re-authentication');
      }
    },

    async syncAccountTransactions(accountId: string): Promise<{
      added: number;
      modified: number;
      removed: number;
    }> {
      const { data } = await client.post(`/accounts/${accountId}/sync-transactions`);
      if (!data.success) {
        throw new Error(data.error || 'Failed to sync account transactions');
      }
      return data;
    },
  };
}
