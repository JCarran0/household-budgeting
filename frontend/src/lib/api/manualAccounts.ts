import type { AxiosInstance } from 'axios';
import type {
  ManualAccount,
  CreateManualAccountDto,
  UpdateManualAccountDto,
} from '../../../../shared/types';

export function createManualAccountsApi(client: AxiosInstance) {
  return {
    async getManualAccounts(): Promise<ManualAccount[]> {
      const { data } = await client.get<ManualAccount[]>('/manual-accounts');
      return data;
    },

    async createManualAccount(dto: CreateManualAccountDto): Promise<ManualAccount> {
      const { data } = await client.post<ManualAccount>('/manual-accounts', dto);
      return data;
    },

    async updateManualAccount(id: string, dto: UpdateManualAccountDto): Promise<ManualAccount> {
      const { data } = await client.put<ManualAccount>(`/manual-accounts/${id}`, dto);
      return data;
    },

    async deleteManualAccount(id: string): Promise<void> {
      await client.delete(`/manual-accounts/${id}`);
    },
  };
}
