import type { AxiosInstance } from 'axios';

export function createThemesApi(client: AxiosInstance) {
  return {
    async getThemePreferences(): Promise<Record<string, unknown> | null> {
      const { data } = await client.get<{
        success: boolean;
        preferences: Record<string, unknown> | null;
      }>('/themes/preferences');
      return data.preferences;
    },

    async saveThemePreferences(overrides: Record<string, unknown>): Promise<void> {
      await client.put('/themes/preferences', overrides);
    },

    async resetThemePreferences(): Promise<void> {
      await client.delete('/themes/preferences');
    },
  };
}
