import type { AxiosInstance } from 'axios';
import type {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  User,
} from '../../../../shared/types';

// Type guard functions
function isValidApiResponse(data: unknown): data is { success: boolean; error?: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    typeof (data as { success: unknown }).success === 'boolean'
  );
}

function hasTokenAndUser(data: unknown): data is { success: boolean; token: string; user: User } {
  return (
    isValidApiResponse(data) &&
    'token' in data &&
    'user' in data &&
    typeof (data as { token: unknown }).token === 'string'
  );
}

export function createAuthApi(client: AxiosInstance) {
  return {
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
      const { data } = await client.post<unknown>('/auth/login', credentials);
      if (!isValidApiResponse(data) || !data.success) {
        throw new Error((data as { error?: string })?.error || 'Login failed');
      }
      if (!hasTokenAndUser(data)) {
        throw new Error('Invalid response format from server');
      }
      return {
        token: data.token,
        user: data.user,
      };
    },

    async register(credentials: RegisterCredentials): Promise<AuthResponse> {
      const { data } = await client.post<unknown>('/auth/register', credentials);
      if (!isValidApiResponse(data) || !data.success) {
        throw new Error((data as { error?: string })?.error || 'Registration failed');
      }
      if (!hasTokenAndUser(data)) {
        throw new Error('Invalid response format from server');
      }
      return {
        token: data.token,
        user: data.user,
      };
    },

    async requestPasswordReset(username: string): Promise<{ success: boolean; message: string }> {
      const { data } = await client.post<unknown>('/auth/request-reset', { username });
      if (!isValidApiResponse(data)) {
        throw new Error('Invalid response format from server');
      }
      return data as { success: boolean; message: string };
    },

    async resetPassword(params: {
      username: string;
      token: string;
      newPassword: string;
      confirmPassword: string;
    }): Promise<{ success: boolean; message: string }> {
      const { data } = await client.post<unknown>('/auth/reset-password', params);
      if (!isValidApiResponse(data)) {
        throw new Error('Invalid response format from server');
      }
      return data as { success: boolean; message: string };
    },
  };
}
