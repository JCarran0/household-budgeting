import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { useAuthStore } from '../../stores/authStore';

// Use relative URL in production, localhost in development
const API_BASE_URL = import.meta.env.PROD
  ? '/api/v1'  // In production, use relative path (nginx will proxy)
  : 'http://localhost:3021/api/v1';

export function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    paramsSerializer: {
      // Serialize arrays without brackets (e.g., categoryIds=1&categoryIds=2)
      indexes: null,
    },
  });

  // Request interceptor to add auth token
  client.interceptors.request.use(
    (config) => {
      // Try to get token from Zustand's persisted storage first
      let token = null;
      try {
        const authStorage = localStorage.getItem('auth-storage');
        if (authStorage) {
          const authData = JSON.parse(authStorage);
          token = authData?.state?.token;
        }
      } catch {
        // Fallback to direct localStorage access for backward compatibility
        token = localStorage.getItem('token');
      }

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor to handle errors
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  );

  return client;
}
