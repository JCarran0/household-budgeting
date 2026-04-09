import axios from 'axios';
import type { AxiosInstance } from 'axios';

export interface ActualsOverride {
  id: string;
  userId: string;
  month: string; // YYYY-MM format
  totalIncome: number;
  totalExpenses: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActualsOverrideDto {
  month: string; // YYYY-MM format
  totalIncome: number;
  totalExpenses: number;
  notes?: string;
}

export function createActualsOverridesApi(client: AxiosInstance) {
  return {
    async getActualsOverrides(): Promise<ActualsOverride[]> {
      try {
        const { data } = await client.get('/actuals-overrides');
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch actuals overrides');
        }
        return data.overrides || [];
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.data) {
          throw new Error(error.response.data.error || 'Failed to fetch actuals overrides');
        }
        throw error;
      }
    },

    async getActualsOverride(month: string): Promise<ActualsOverride | null> {
      try {
        const { data } = await client.get(`/actuals-overrides/${month}`);
        if (!data.success) {
          if (data.error === 'Override not found') {
            return null;
          }
          throw new Error(data.error || 'Failed to fetch actuals override');
        }
        return data.override;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 404) {
            return null;
          }
          if (error.response?.data) {
            throw new Error(error.response.data.error || 'Failed to fetch actuals override');
          }
        }
        throw error;
      }
    },

    async createOrUpdateActualsOverride(override: CreateActualsOverrideDto): Promise<ActualsOverride> {
      try {
        const { data } = await client.post('/actuals-overrides', override);
        if (!data.success) {
          throw new Error(data.error || 'Failed to save actuals override');
        }
        return data.override;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.data) {
          throw new Error(error.response.data.error || 'Failed to save actuals override');
        }
        throw error;
      }
    },

    async deleteActualsOverride(overrideId: string): Promise<void> {
      try {
        const { data } = await client.delete(`/actuals-overrides/${overrideId}`);
        if (!data.success) {
          throw new Error(data.error || 'Failed to delete actuals override');
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.data) {
          throw new Error(error.response.data.error || 'Failed to delete actuals override');
        }
        throw error;
      }
    },
  };
}
