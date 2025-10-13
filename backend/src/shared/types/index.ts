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
  nickname?: string | null;
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
  accountName?: string; // Added for display
  amount: number; // negative = expense, positive = income
  date: string;
  name: string; // Original Plaid description
  userDescription: string | null; // User-edited description
  merchantName: string | null;
  category: string[];
  plaidCategoryId: string | null; // Plaid's suggested category
  categoryId: string | null; // User's assigned category
  pending: boolean;
  tags: string[];
  notes: string | null;
  isHidden: boolean;
  isManual: boolean;
  isSplit: boolean;
  parentTransactionId: string | null;
  splitTransactionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;                   // SNAKE_CASE ID: "FOOD_AND_DRINK_COFFEE" or "CUSTOM_WINE_BUDGET"
  name: string;                 // Human readable: "Coffee" or "Wine Budget"
  parentId: string | null;      // Parent category ID (SNAKE_CASE)
  description?: string;         // Description from Plaid taxonomy or user-provided
  isCustom: boolean;           // true for user-created categories
  isHidden: boolean;
  isRollover: boolean;
  isIncome: boolean;           // true for income categories (computed from hierarchy)
}

export interface MonthlyBudget {
  id: string;
  categoryId: string;
  month: string; // YYYY-MM format
  amount: number;
}

// Budget type classification
export type BudgetType = 'income' | 'expense';

// Extended interface for budget comparisons (defined in backend)
export interface BudgetComparison {
  categoryId: string;
  month: string;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
  budgetType: BudgetType;
  isIncomeCategory: boolean;
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

export interface AutoCategorizeRule {
  id: string;
  description: string; // Rule description for UI
  patterns: string[]; // Array of text patterns to search for (OR logic)
  matchType: 'contains'; // For now just contains, can add 'exact', 'regex' later
  categoryId: string;
  categoryName?: string; // For display purposes
  userDescription?: string; // Optional user description to apply to matching transactions
  priority: number; // Lower number = higher priority (applied first)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Feedback types
export type FeedbackType = 'bug' | 'feature';

export interface ApplicationState {
  route: string;
  searchParams: string;
  userAgent: string;
  timestamp: string;
  username: string;
  windowSize: {
    width: number;
    height: number;
  };
  filters?: Record<string, unknown>;
}

export interface FeedbackSubmission {
  type: FeedbackType;
  title: string;
  description: string;
  email?: string;
  applicationState?: ApplicationState;
}

export interface FeedbackResponse {
  success: boolean;
  issueUrl?: string;
  error?: string;
}