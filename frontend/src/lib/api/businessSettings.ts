/**
 * Business Settings API module — Phase 7.5
 *
 * Covers GET /business/settings (read header) and PUT /business/settings
 * (update header). Only meaningful in a business workspace.
 */
import type { AxiosInstance } from 'axios';
import type { StatementHeader } from '../../../../shared/types';

export interface BusinessSettingsResponse {
  header: StatementHeader;
}

function isBusinessSettingsResponse(data: unknown): data is BusinessSettingsResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'header' in data &&
    typeof (data as { header: unknown }).header === 'object'
  );
}

export function createBusinessSettingsApi(client: AxiosInstance) {
  return {
    /**
     * Fetch the stored StatementHeader (business + client identity).
     * GET /business/settings
     */
    async getBusinessSettings(): Promise<BusinessSettingsResponse> {
      const { data } = await client.get<unknown>('/business/settings');
      if (!isBusinessSettingsResponse(data)) {
        throw new Error('Invalid response from GET /business/settings');
      }
      return data;
    },

    /**
     * Persist the StatementHeader.
     * PUT /business/settings
     */
    async updateBusinessSettings(
      header: StatementHeader,
    ): Promise<BusinessSettingsResponse> {
      const { data } = await client.put<unknown>('/business/settings', { header });
      if (!isBusinessSettingsResponse(data)) {
        throw new Error('Invalid response from PUT /business/settings');
      }
      return data;
    },
  };
}
