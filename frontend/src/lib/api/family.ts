import type { AxiosInstance } from 'axios';
import type { Family, AccountOwnerMapping, UserColor } from '../../../../shared/types';

interface FamilyResponse {
  success: boolean;
  family: Family;
}

interface InvitationResponse {
  success: boolean;
  invitation: {
    code: string;
    expiresAt: string;
  };
}

interface MappingsResponse {
  success: boolean;
  mappings: AccountOwnerMapping[];
}

interface MappingResponse {
  success: boolean;
  mapping: AccountOwnerMapping;
}

interface ProfileResponse {
  success: boolean;
  user: {
    id: string;
    username: string;
    displayName: string;
    familyId: string;
    color?: UserColor;
  };
}

interface ChangePasswordParams {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function createFamilyApi(client: AxiosInstance) {
  return {
    // Family management
    async getFamily(): Promise<FamilyResponse> {
      const { data } = await client.get<FamilyResponse>('/family');
      return data;
    },

    async updateFamilyName(name: string): Promise<FamilyResponse> {
      const { data } = await client.put<FamilyResponse>('/family/name', { name });
      return data;
    },

    async createInvitation(): Promise<InvitationResponse> {
      const { data } = await client.post<InvitationResponse>('/family/invite');
      return data;
    },

    async removeFamilyMember(userId: string): Promise<FamilyResponse> {
      const { data } = await client.delete<FamilyResponse>(`/family/members/${userId}`);
      return data;
    },

    // Profile management
    async updateProfile(displayName: string, color?: UserColor): Promise<ProfileResponse> {
      const payload: { displayName: string; color?: UserColor } = { displayName };
      if (color !== undefined) payload.color = color;
      const { data } = await client.put<ProfileResponse>('/auth/profile', payload);
      return data;
    },

    async changePassword(params: ChangePasswordParams): Promise<{ success: boolean; message: string }> {
      const { data } = await client.post<{ success: boolean; message: string }>('/auth/change-password', params);
      return data;
    },

    // Account owner mappings
    async getAccountOwnerMappings(): Promise<MappingsResponse> {
      const { data } = await client.get<MappingsResponse>('/account-owners');
      return data;
    },

    async createAccountOwnerMapping(mapping: {
      cardIdentifier: string;
      displayName: string;
      linkedUserId?: string;
    }): Promise<MappingResponse> {
      const { data } = await client.post<MappingResponse>('/account-owners', mapping);
      return data;
    },

    async updateAccountOwnerMapping(
      id: string,
      updates: Partial<{ cardIdentifier: string; displayName: string; linkedUserId: string | null }>,
    ): Promise<MappingResponse> {
      const { data } = await client.put<MappingResponse>(`/account-owners/${id}`, updates);
      return data;
    },

    async deleteAccountOwnerMapping(id: string): Promise<{ success: boolean }> {
      const { data } = await client.delete<{ success: boolean }>(`/account-owners/${id}`);
      return data;
    },
  };
}
