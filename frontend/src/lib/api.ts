import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { 
  AuthResponse, 
  LoginCredentials, 
  RegisterCredentials, 
  PlaidAccount, 
  Transaction, 
  LinkTokenResponse, 
  ExchangeTokenRequest,
  Category,
  MonthlyBudget,
  AutoCategorizeRule
} from '../../../shared/types';

const API_BASE_URL = 'http://localhost:3001/api/v1';

// Additional type definitions for API responses
export interface CategoryWithChildren extends Category {
  children?: Category[];
}

export interface CreateCategoryDto {
  name: string;
  parentId: string | null;
  plaidCategory: string | null;
  isHidden: boolean;
  isSavings: boolean;
}

export interface UpdateCategoryDto {
  name?: string;
  plaidCategory?: string | null;
  isHidden?: boolean;
  isSavings?: boolean;
}

export interface CreateBudgetDto {
  categoryId: string;
  month: string;
  amount: number;
}

export interface BudgetComparison {
  categoryId: string;
  month: string;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
}

export interface MonthlyBudgetResponse {
  month: string;
  budgets: MonthlyBudget[];
  total: number;
}

export interface BudgetComparisonResponse {
  month: string;
  comparisons: BudgetComparison[];
  totals: {
    budgeted: number;
    actual: number;
    remaining: number;
    percentUsed: number;
    isOverBudget: boolean;
  };
}

export interface BudgetHistoryResponse {
  categoryId: string;
  startMonth: string;
  endMonth: string;
  history: MonthlyBudget[];
  average: number;
  count: number;
}

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
    categoryIds?: string[];
    tags?: string[];
    searchQuery?: string;
    includePending?: boolean;
    includeHidden?: boolean;
    minAmount?: number;
    maxAmount?: number;
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

  async updateTransactionCategory(transactionId: string, categoryId: string): Promise<void> {
    const response = await this.client.put(`/transactions/${transactionId}/category`, { categoryId });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update category');
    }
  }

  async addTransactionTags(transactionId: string, tags: string[]): Promise<void> {
    const response = await this.client.post(`/transactions/${transactionId}/tags`, { tags });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to add tags');
    }
  }

  async splitTransaction(transactionId: string, splits: {
    amount: number;
    categoryId?: string;
    description?: string;
    tags?: string[];
  }[]): Promise<void> {
    await this.client.post(`/transactions/${transactionId}/split`, { splits });
  }

  async updateTransactionDescription(transactionId: string, description: string | null): Promise<void> {
    const response = await this.client.put(`/transactions/${transactionId}/description`, { description });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update description');
    }
  }

  // Category endpoints
  async getCategories(): Promise<Category[]> {
    const { data } = await this.client.get<Category[]>('/categories');
    return data;
  }

  async getCategoryTree(): Promise<CategoryWithChildren[]> {
    const { data } = await this.client.get<CategoryWithChildren[]>('/categories/tree');
    return data;
  }

  async getCategoryById(id: string): Promise<Category> {
    const { data } = await this.client.get<Category>(`/categories/${id}`);
    return data;
  }

  async getParentCategories(): Promise<Category[]> {
    const { data } = await this.client.get<Category[]>('/categories/parents');
    return data;
  }

  async getSubcategories(parentId: string): Promise<Category[]> {
    const { data } = await this.client.get<Category[]>(`/categories/${parentId}/subcategories`);
    return data;
  }

  async createCategory(category: CreateCategoryDto): Promise<Category> {
    const { data } = await this.client.post<Category>('/categories', category);
    return data;
  }

  async updateCategory(id: string, updates: UpdateCategoryDto): Promise<Category> {
    const { data } = await this.client.put<Category>(`/categories/${id}`, updates);
    return data;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.client.delete(`/categories/${id}`);
  }

  async initializeDefaultCategories(): Promise<{ message: string; categories: Category[] }> {
    const { data } = await this.client.post<{ message: string; categories: Category[] }>('/categories/initialize');
    return data;
  }

  // Budget endpoints
  async getBudgets(): Promise<MonthlyBudget[]> {
    const { data } = await this.client.get<MonthlyBudget[]>('/budgets');
    return data;
  }

  async getMonthlyBudgets(month: string): Promise<MonthlyBudgetResponse> {
    const { data } = await this.client.get<MonthlyBudgetResponse>(`/budgets/month/${month}`);
    return data;
  }

  async getCategoryBudgets(categoryId: string): Promise<MonthlyBudget[]> {
    const { data } = await this.client.get<MonthlyBudget[]>(`/budgets/category/${categoryId}`);
    return data;
  }

  async getBudget(categoryId: string, month: string): Promise<MonthlyBudget> {
    const { data } = await this.client.get<MonthlyBudget>(`/budgets/category/${categoryId}/month/${month}`);
    return data;
  }

  async createOrUpdateBudget(budget: CreateBudgetDto): Promise<MonthlyBudget> {
    const { data } = await this.client.post<MonthlyBudget>('/budgets', budget);
    return data;
  }

  async copyBudgets(fromMonth: string, toMonth: string): Promise<{ message: string; budgets: MonthlyBudget[] }> {
    const { data } = await this.client.post<{ message: string; budgets: MonthlyBudget[] }>('/budgets/copy', {
      fromMonth,
      toMonth
    });
    return data;
  }

  async getBudgetComparison(month: string, actuals: Record<string, number>): Promise<BudgetComparisonResponse> {
    const { data } = await this.client.post<BudgetComparisonResponse>(`/budgets/comparison/${month}`, { actuals });
    return data;
  }

  async getBudgetHistory(categoryId: string, startMonth: string, endMonth: string): Promise<BudgetHistoryResponse> {
    const { data } = await this.client.get<BudgetHistoryResponse>(`/budgets/history/${categoryId}`, {
      params: { startMonth, endMonth }
    });
    return data;
  }

  async deleteBudget(id: string): Promise<void> {
    await this.client.delete(`/budgets/${id}`);
  }

  async deleteCategoryBudgets(categoryId: string): Promise<void> {
    await this.client.delete(`/budgets/category/${categoryId}`);
  }

  async applyRollover(categoryId: string, fromMonth: string, toMonth: string, actualSpent: number): Promise<{
    categoryId: string;
    fromMonth: string;
    toMonth: string;
    rolloverAmount: number;
    updatedBudget?: MonthlyBudget;
    message?: string;
  }> {
    const { data } = await this.client.post('/budgets/rollover', {
      categoryId,
      fromMonth,
      toMonth,
      actualSpent
    });
    return data;
  }

  // Reporting endpoints
  async getSpendingTrends(startMonth: string, endMonth: string, categoryIds?: string[]): Promise<{
    trends: Array<{
      month: string;
      categoryId: string;
      categoryName: string;
      amount: number;
      transactionCount: number;
    }>;
  }> {
    const { data } = await this.client.get('/reports/spending-trends', {
      params: { startMonth, endMonth, categoryIds }
    });
    return data;
  }

  async getCategoryBreakdown(startDate: string, endDate: string, includeSubcategories = true): Promise<{
    breakdown: Array<{
      categoryId: string;
      categoryName: string;
      amount: number;
      percentage: number;
      transactionCount: number;
      subcategories?: Array<{
        categoryId: string;
        categoryName: string;
        amount: number;
        percentage: number;
        transactionCount: number;
      }>;
    }>;
    total: number;
  }> {
    const { data } = await this.client.get('/reports/category-breakdown', {
      params: { startDate, endDate, includeSubcategories }
    });
    return data;
  }

  async getCashFlow(startMonth: string, endMonth: string): Promise<{
    summary: Array<{
      month: string;
      income: number;
      expenses: number;
      netFlow: number;
      savingsRate: number;
    }>;
  }> {
    const { data } = await this.client.get('/reports/cash-flow', {
      params: { startMonth, endMonth }
    });
    return data;
  }

  async getProjections(monthsToProject = 6): Promise<{
    projections: Array<{
      month: string;
      projectedIncome: number;
      projectedExpenses: number;
      projectedNetFlow: number;
      confidence: 'high' | 'medium' | 'low';
    }>;
  }> {
    const { data } = await this.client.get('/reports/projections', {
      params: { monthsToProject }
    });
    return data;
  }

  async getYearToDate(): Promise<{
    summary: {
      totalIncome: number;
      totalExpenses: number;
      netIncome: number;
      averageMonthlyIncome: number;
      averageMonthlyExpenses: number;
      savingsRate: number;
      topCategories: Array<{
        categoryId: string;
        categoryName: string;
        amount: number;
        percentage: number;
      }>;
    };
  }> {
    const { data } = await this.client.get('/reports/year-to-date');
    return data;
  }

  // Auto-categorization endpoints
  async getAutoCategorizeRules(): Promise<AutoCategorizeRule[]> {
    const { data } = await this.client.get<{ success: boolean; rules: AutoCategorizeRule[] }>('/autocategorize/rules');
    return data.rules;
  }

  async createAutoCategorizeRule(rule: {
    description: string;
    pattern: string;
    categoryId: string;
    categoryName?: string;
    isActive?: boolean;
  }): Promise<AutoCategorizeRule> {
    const { data } = await this.client.post<{ success: boolean; rule: AutoCategorizeRule }>('/autocategorize/rules', rule);
    return data.rule;
  }

  async updateAutoCategorizeRule(ruleId: string, updates: {
    description?: string;
    pattern?: string;
    categoryId?: string;
    categoryName?: string;
    isActive?: boolean;
  }): Promise<void> {
    const response = await this.client.put(`/autocategorize/rules/${ruleId}`, updates);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update rule');
    }
  }

  async deleteAutoCategorizeRule(ruleId: string): Promise<void> {
    const response = await this.client.delete(`/autocategorize/rules/${ruleId}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete rule');
    }
  }

  async moveAutoCategorizeRuleUp(ruleId: string): Promise<void> {
    const response = await this.client.put(`/autocategorize/rules/${ruleId}/move-up`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to move rule');
    }
  }

  async moveAutoCategorizeRuleDown(ruleId: string): Promise<void> {
    const response = await this.client.put(`/autocategorize/rules/${ruleId}/move-down`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to move rule');
    }
  }

  async applyAutoCategorizeRules(): Promise<{ categorized: number; total: number }> {
    const { data } = await this.client.post<{ 
      success: boolean; 
      categorized: number; 
      total: number; 
      message: string 
    }>('/autocategorize/apply');
    return { categorized: data.categorized, total: data.total };
  }
}

export const api = new ApiClient();