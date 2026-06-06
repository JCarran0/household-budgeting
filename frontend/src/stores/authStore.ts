import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, LoginCredentials, RegisterCredentials, UserColor, Family } from '../../../shared/types';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/api/errors';
import { queryClient } from '../lib/queryClient';
import { useFilterStore } from './filterStore';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  /** Full list of workspaces the user belongs to (populated on login) */
  workspaces: Family[];
  /** The currently-active workspace ID (mirrors user.familyId / JWT claim) */
  activeWorkspaceId: string | null;

  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  updateDisplayName: (displayName: string) => void;
  updateColor: (color: UserColor) => void;
  /**
   * Switch the active workspace.
   * Calls POST /auth/switch-workspace, replaces token + user, clears all React
   * Query caches so no cross-workspace data leaks (D2, Phase 2.1).
   */
  switchWorkspace: (familyId: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      workspaces: [],
      activeWorkspaceId: null,

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          // Clear all cached data when logging in
          await queryClient.cancelQueries();
          queryClient.clear();

          const response = await api.login(credentials);
          // Backend returns {success, token, user}
          if (response.token && response.user) {
            // Commit auth state FIRST so the new token is persisted to
            // localStorage before any authenticated request goes out. If we
            // fetch the workspace list before this set(), that request carries
            // the stale (just-cleared) token, 401s, and the response
            // interceptor force-redirects to /login — the double-login bug.
            set({
              user: response.user,
              token: response.token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
              activeWorkspaceId: response.user.activeWorkspaceId ?? response.user.familyId,
            });

            // Now safe to fetch the workspace list with the committed token.
            try {
              const workspaces = await api.listWorkspaces();
              set({ workspaces });
            } catch {
              // Non-fatal: workspace list is a convenience; auth still succeeds
            }
          } else {
            throw new Error('Invalid response from server');
          }
        } catch (error: unknown) {
          set({
            isLoading: false,
            error: getApiErrorMessage(error, 'Login failed. Please try again.'),
          });
          throw error;
        }
      },

      register: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          // Clear all cached data when registering a new user
          await queryClient.cancelQueries();
          queryClient.clear();

          const response = await api.register(credentials);
          // Backend returns {success, token, user}
          if (response.token && response.user) {
            // Commit auth state FIRST (see login() — fetching workspaces before
            // the token is persisted causes a 401 + redirect to /login).
            set({
              user: response.user,
              token: response.token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
              activeWorkspaceId: response.user.activeWorkspaceId ?? response.user.familyId,
            });

            try {
              const workspaces = await api.listWorkspaces();
              set({ workspaces });
            } catch {
              // Non-fatal
            }
          } else {
            throw new Error('Invalid response from server');
          }
        } catch (error: unknown) {
          set({
            isLoading: false,
            error: getApiErrorMessage(error, 'Registration failed. Please try again.'),
          });
          throw error;
        }
      },

      logout: () => {
        // Clean up both storage keys for backward compatibility
        localStorage.removeItem('token');
        localStorage.removeItem('auth-storage');

        // Clear all cached data when logging out
        queryClient.cancelQueries();
        queryClient.clear();

        // Clear user filter preferences on logout
        useFilterStore.getState().clearUserFilters();

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
          workspaces: [],
          activeWorkspaceId: null,
        });
      },

      clearError: () => {
        set({ error: null });
      },

      updateDisplayName: (displayName: string) => {
        set((state) => ({
          user: state.user ? { ...state.user, displayName } : null,
        }));
      },

      updateColor: (color: UserColor) => {
        set((state) => ({
          user: state.user ? { ...state.user, color } : null,
        }));
      },

      switchWorkspace: async (familyId: string) => {
        const { user } = get();
        if (!user) throw new Error('Not authenticated');

        const response = await api.switchWorkspace(familyId);
        if (!response.token || !response.user) {
          throw new Error('Invalid switch-workspace response from server');
        }

        // Clear ALL cached data before switching so no personal data leaks into
        // the business view and vice versa (REQ-003, Phase 2.1).
        await queryClient.cancelQueries();
        queryClient.clear();

        // Refresh workspace list after the switch
        let workspaces: Family[] = get().workspaces;
        try {
          workspaces = await api.listWorkspaces();
        } catch {
          // Non-fatal
        }

        set({
          user: response.user,
          token: response.token,
          activeWorkspaceId: response.user.activeWorkspaceId ?? response.user.familyId,
          workspaces,
        });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    }
  )
);