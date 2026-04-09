import type { AxiosInstance } from 'axios';

export interface VersionResponse {
  current: string;
  environment: string;
  deployedAt: string;
  commitHash: string;
  unreleased: string;
}

export interface ChangelogResponse {
  success: boolean;
  content: string;
  error?: string;
}

export function createMiscApi(client: AxiosInstance) {
  return {
    // Version endpoint
    async getVersion(): Promise<VersionResponse> {
      const { data } = await client.get<VersionResponse>('/version');
      return data;
    },

    // Changelog endpoint
    async getChangelog(): Promise<ChangelogResponse> {
      const { data } = await client.get<ChangelogResponse>('/changelog');
      return data;
    },
  };
}
