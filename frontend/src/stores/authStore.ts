import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, LoginCredentials, RegisterCredentials } from '../../../shared/types';
import { api } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { useFilterStore } from './filterStore';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          // Clear all cached data when logging in
          await queryClient.cancelQueries();
          queryClient.clear();
          
          const response = await api.login(credentials);
          // Backend returns {success, token, user}
          if (response.token && response.user) {
            localStorage.setItem('token', response.token);
            set({
              user: response.user,
              token: response.token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } else {
            throw new Error('Invalid response from server');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.error || 'Login failed. Please try again.',
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
            localStorage.setItem('token', response.token);
            set({
              user: response.user,
              token: response.token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } else {
            throw new Error('Invalid response from server');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.error || 'Registration failed. Please try again.',
          });
          throw error;
        }
      },

      logout: () => {
        localStorage.removeItem('token');
        
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
        });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);