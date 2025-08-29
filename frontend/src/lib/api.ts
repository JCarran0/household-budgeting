import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { AuthResponse, LoginCredentials, RegisterCredentials, PlaidAccount, Transaction, LinkTokenResponse, ExchangeTokenRequest } from '../../../shared/types';

const API_BASE_URL = 'http://localhost:3001/api/v1';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Bind methods to ensure 'this' context is preserved
    this.createLinkToken = this.createLinkToken.bind(this);
    this.exchangePublicToken = this.exchangePublicToken.bind(this);
    this.connectAccount = this.connectAccount.bind(this);
    this.getAccounts = this.getAccounts.bind(this);
    this.getTransactions = this.getTransactions.bind(this);
    this.syncTransactions = this.syncTransactions.bind(this);

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
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
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { data } = await this.client.post<any>('/auth/login', credentials);
    if (!data.success) {
      throw new Error(data.error || 'Login failed');
    }
    return {
      token: data.token,
      user: data.user
    };
  }

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const { data } = await this.client.post<any>('/auth/register', credentials);
    if (!data.success) {
      throw new Error(data.error || 'Registration failed');
    }
    return {
      token: data.token,
      user: data.user
    };
  }

  // Plaid endpoints
  async createLinkToken(): Promise<LinkTokenResponse> {
    const { data } = await this.client.post<LinkTokenResponse>('/plaid/link-token');
    return data;
  }

  async exchangePublicToken(request: ExchangeTokenRequest): Promise<{ success: boolean }> {
    const { data } = await this.client.post('/plaid/exchange-token', request);
    return data;
  }

  // Account endpoints
  async connectAccount(params: {
    publicToken: string;
    institutionId: string;
    institutionName: string;
  }): Promise<{ account: PlaidAccount }> {
    const { data } = await this.client.post('/accounts/connect', params);
    return data;
  }

  async getAccounts(): Promise<PlaidAccount[]> {
    const { data } = await this.client.get<{ accounts: PlaidAccount[] }>('/accounts');
    return data.accounts;
  }

  // Transaction endpoints
  async getTransactions(params?: {
    accountId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ transactions: Transaction[]; total: number }> {
    const { data } = await this.client.get('/transactions', { params });
    return data;
  }

  async syncTransactions(accountId?: string): Promise<{ 
    added: number; 
    modified: number; 
    removed: number; 
    hasMore: boolean;
  }> {
    const { data } = await this.client.post('/transactions/sync', { accountId });
    return data;
  }
}

export const api = new ApiClient();