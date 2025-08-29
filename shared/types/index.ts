// Shared TypeScript types for the budgeting app

export interface User {
  id: string;
  username: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  password: string;
}

export interface PlaidAccount {
  id: string;
  plaidAccountId: string;
  plaidItemId: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'loan' | 'other';
  subtype: string | null;
  institution: string;
  mask: string | null;
  currentBalance: number;
  availableBalance: number | null;
  isActive: boolean;
  lastSynced: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  plaidTransactionId: string | null;
  accountId: string;
  amount: number; // negative = expense, positive = income
  date: string;
  name: string;
  merchantName: string | null;
  category: string[];
  categoryId: string | null;
  pending: boolean;
  tags: string[];
  isHidden: boolean;
  isManual: boolean;
  isSplit: boolean;
  parentTransactionId: string | null;
  splitTransactionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  plaidCategory: string | null;
  isHidden: boolean;
  isSavings: boolean;
}

export interface MonthlyBudget {
  id: string;
  categoryId: string;
  month: string; // YYYY-MM format
  amount: number;
}

export interface LinkTokenResponse {
  link_token: string;
}

export interface ExchangeTokenRequest {
  public_token: string;
}

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}