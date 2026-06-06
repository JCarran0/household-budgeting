/**
 * Workspace API module — Phase 2.1
 *
 * Handles GET /workspaces, POST /workspaces, and POST /auth/switch-workspace.
 * The switch-workspace call re-issues a JWT; the caller (authStore) is
 * responsible for updating the stored token and clearing React Query caches.
 */
import type { AxiosInstance } from 'axios';
import type { Family, User, WorkspaceType } from '../../../../shared/types';

// ---------------------------------------------------------------------------
// Response type guards
// ---------------------------------------------------------------------------

function isValidApiResponse(data: unknown): data is { success: boolean; error?: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    typeof (data as { success: unknown }).success === 'boolean'
  );
}

function hasWorkspaces(
  data: unknown,
): data is { success: boolean; workspaces: Family[] } {
  return isValidApiResponse(data) && 'workspaces' in data && Array.isArray((data as { workspaces: unknown }).workspaces);
}

function hasSwitchResult(
  data: unknown,
): data is { success: boolean; token: string; user: User } {
  return (
    isValidApiResponse(data) &&
    'token' in data &&
    typeof (data as { token: unknown }).token === 'string' &&
    'user' in data &&
    typeof (data as { user: unknown }).user === 'object'
  );
}

// ---------------------------------------------------------------------------
// API factory
// ---------------------------------------------------------------------------

export function createWorkspacesApi(client: AxiosInstance) {
  return {
    /**
     * List all workspaces the authenticated user belongs to.
     * GET /workspaces
     */
    async listWorkspaces(): Promise<Family[]> {
      const { data } = await client.get<unknown>('/workspaces');
      if (!hasWorkspaces(data)) {
        throw new Error('Invalid response from /workspaces');
      }
      return data.workspaces;
    },

    /**
     * Create a new workspace (admin-only in v1; business type only).
     * POST /workspaces
     */
    async createWorkspace(payload: {
      name: string;
      workspaceType: WorkspaceType;
    }): Promise<Family> {
      const { data } = await client.post<unknown>('/workspaces', payload);
      if (!isValidApiResponse(data) || !data.success) {
        throw new Error(
          (data as { error?: string })?.error ?? 'Failed to create workspace',
        );
      }
      return (data as { success: boolean; workspace: Family }).workspace;
    },

    /**
     * Switch the active workspace.
     * POST /auth/switch-workspace
     * Returns a new token + updated user; the store must replace both.
     */
    async switchWorkspace(familyId: string): Promise<{ token: string; user: User }> {
      const { data } = await client.post<unknown>('/auth/switch-workspace', { familyId });
      if (!hasSwitchResult(data)) {
        const errMsg = isValidApiResponse(data)
          ? ((data as { error?: string }).error ?? 'Workspace switch failed')
          : 'Invalid response from switch-workspace';
        throw new Error(errMsg);
      }
      return { token: data.token, user: data.user };
    },
  };
}
