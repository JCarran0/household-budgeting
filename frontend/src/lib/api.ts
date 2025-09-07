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
  AutoCategorizeRule,
  User
} from '../../../shared/types';

// Use relative URL in production, localhost in development
const API_BASE_URL = import.meta.env.PROD 
  ? '/api/v1'  // In production, use relative path (nginx will proxy)
  : 'http://localhost:3001/api/v1';

// Extended PlaidAccount with backend fields
export interface ExtendedPlaidAccount extends PlaidAccount {
  accountName?: string;
  officialName?: string | null;
  institutionName?: string;
}

// Additional type definitions for API responses
export interface CategoryWithChildren extends Category {
  children?: Category[];
}

export interface VersionResponse {
  current: string;
  environment: string;
  deployedAt: string;
  commitHash: string;
  unreleased: string;
}

export interface CreateCategoryDto {
  name: string;
  parentId: string | null;
  description?: string;
  isHidden: boolean;
  isRollover: boolean;
}

// Type guard functions
function isValidApiResponse(data: unknown): data is { success: boolean; error?: string } {
  return typeof data === 'object' && data !== null && 'success' in data && typeof (data as { success: unknown }).success === 'boolean';
}

function hasTokenAndUser(data: unknown): data is { success: boolean; token: string; user: User } {
  return isValidApiResponse(data) && 'token' in data && 'user' in data && typeof (data as { token: unknown }).token === 'string';
}

export interface UpdateCategoryDto {
  name?: string;
  description?: string;
  isHidden?: boolean;
  isRollover?: boolean;
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
      paramsSerializer: {
        // Serialize arrays without brackets (e.g., categoryIds=1&categoryIds=2)
        indexes: null,
      },
    });
    
    // Bind methods to ensure 'this' context is preserved
    this.getVersion = this.getVersion.bind(this);
    this.createLinkToken = this.createLinkToken.bind(this);
    this.exchangePublicToken = this.exchangePublicToken.bind(this);
    this.connectAccount = this.connectAccount.bind(this);
    this.getAccounts = this.getAccounts.bind(this);
    this.disconnectAccount = this.disconnectAccount.bind(this);
    this.updateAccountNickname = this.updateAccountNickname.bind(this);
    this.getTransactions = this.getTransactions.bind(this);
    this.getUncategorizedCount = this.getUncategorizedCount.bind(this);
    this.syncTransactions = this.syncTransactions.bind(this);
    this.importTransactionsFromCSV = this.importTransactionsFromCSV.bind(this);
    
    // Category methods
    this.getCategories = this.getCategories.bind(this);
    this.getCategoryTree = this.getCategoryTree.bind(this);
    this.getCategoryById = this.getCategoryById.bind(this);
    this.getParentCategories = this.getParentCategories.bind(this);
    this.getSubcategories = this.getSubcategories.bind(this);
    this.createCategory = this.createCategory.bind(this);
    this.updateCategory = this.updateCategory.bind(this);
    this.deleteCategory = this.deleteCategory.bind(this);
    this.initializeDefaultCategories = this.initializeDefaultCategories.bind(this);
    this.importCategoriesFromCSV = this.importCategoriesFromCSV.bind(this);
    this.getCategoryTransactionCounts = this.getCategoryTransactionCounts.bind(this);
    
    // Budget methods
    this.getBudgets = this.getBudgets.bind(this);
    this.getAvailableBudgetMonths = this.getAvailableBudgetMonths.bind(this);
    this.getMonthlyBudgets = this.getMonthlyBudgets.bind(this);
    this.getCategoryBudgets = this.getCategoryBudgets.bind(this);
    this.getBudget = this.getBudget.bind(this);
    this.createOrUpdateBudget = this.createOrUpdateBudget.bind(this);
    this.copyBudgets = this.copyBudgets.bind(this);
    this.getBudgetComparison = this.getBudgetComparison.bind(this);
    this.getBudgetHistory = this.getBudgetHistory.bind(this);
    this.deleteBudget = this.deleteBudget.bind(this);

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
    const { data } = await this.client.post<unknown>('/auth/login', credentials);
    if (!isValidApiResponse(data) || !data.success) {
      throw new Error((data as { error?: string })?.error || 'Login failed');
    }
    if (!hasTokenAndUser(data)) {
      throw new Error('Invalid response format from server');
    }
    return {
      token: data.token,
      user: data.user
    };
  }

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const { data } = await this.client.post<unknown>('/auth/register', credentials);
    if (!isValidApiResponse(data) || !data.success) {
      throw new Error((data as { error?: string })?.error || 'Registration failed');
    }
    if (!hasTokenAndUser(data)) {
      throw new Error('Invalid response format from server');
    }
    return {
      token: data.token,
      user: data.user
    };
  }

  // Version endpoint
  async getVersion(): Promise<VersionResponse> {
    const { data } = await this.client.get<VersionResponse>('/version');
    return data;
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

  async getAccounts(): Promise<ExtendedPlaidAccount[]> {
    const { data } = await this.client.get<{ accounts: ExtendedPlaidAccount[] }>('/accounts');
    return data.accounts;
  }

  async disconnectAccount(accountId: string): Promise<void> {
    const { data } = await this.client.delete(`/accounts/${accountId}`);
    if (!data.success) {
      throw new Error(data.error || 'Failed to disconnect account');
    }
  }

  async updateAccountNickname(accountId: string, nickname: string | null): Promise<void> {
    const { data } = await this.client.put(`/accounts/${accountId}`, { nickname });
    if (!data.success) {
      throw new Error(data.error || 'Failed to update account nickname');
    }
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
    includeHidden?: boolean;
    onlyUncategorized?: boolean;
    minAmount?: number;
    maxAmount?: number;
    transactionType?: 'all' | 'income' | 'expense';
  }): Promise<{ transactions: Transaction[]; total: number }> {
    const { data } = await this.client.get('/transactions', { params });
    return data;
  }

  async getUncategorizedCount(): Promise<{ success: boolean; count: number; total: number }> {
    const { data } = await this.client.get<{ success: boolean; count: number; total: number }>('/transactions/uncategorized/count');
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

  async updateTransactionCategory(transactionId: string, categoryId: string | null): Promise<void> {
    const response = await this.client.put(`/transactions/${transactionId}/category`, { categoryId });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update category');
    }
  }
  
  async bulkUpdateTransactions(transactionIds: string[], updates: { categoryId?: string | null; userDescription?: string | null; isHidden?: boolean }): Promise<{ updated: number; failed: number; errors?: string[] }> {
    const response = await this.client.put('/transactions/bulk', { transactionIds, updates });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to perform bulk update');
    }
    return {
      updated: response.data.updated || 0,
      failed: response.data.failed || 0,
      errors: response.data.errors,
    };
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

  async updateTransactionHidden(transactionId: string, isHidden: boolean): Promise<void> {
    const response = await this.client.put(`/transactions/${transactionId}/hidden`, { isHidden });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update hidden status');
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

  async importCategoriesFromCSV(csvContent: string): Promise<{
    success: boolean;
    message: string;
    importedCount?: number;
    errors?: string[];
  }> {
    const { data } = await this.client.post<{
      success: boolean;
      message: string;
      importedCount?: number;
      errors?: string[];
    }>('/categories/import-csv', { csvContent });
    return data;
  }
  
  async getCategoryTransactionCounts(): Promise<Record<string, number>> {
    const { data } = await this.client.get<Record<string, number>>('/categories/transaction-counts');
    return data;
  }

  // Budget endpoints
  async getBudgets(): Promise<MonthlyBudget[]> {
    const { data } = await this.client.get<MonthlyBudget[]>('/budgets');
    return data;
  }

  async getAvailableBudgetMonths(): Promise<{ month: string; count: number }[]> {
    const { data } = await this.client.get<{ month: string; count: number }[]>('/budgets/available-months');
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

  async getIncomeCategoryBreakdown(startDate: string, endDate: string, includeSubcategories = true): Promise<{
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
    const { data } = await this.client.get('/reports/income-breakdown', {
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
    patterns: string[];
    categoryId: string;
    categoryName?: string;
    userDescription?: string;
    isActive?: boolean;
  }): Promise<AutoCategorizeRule> {
    const { data } = await this.client.post<{ success: boolean; rule: AutoCategorizeRule }>('/autocategorize/rules', rule);
    return data.rule;
  }

  async updateAutoCategorizeRule(ruleId: string, updates: {
    description?: string;
    patterns?: string[];
    categoryId?: string;
    categoryName?: string;
    userDescription?: string;
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

  async previewAutoCategorization(forceRecategorize: boolean = false): Promise<{
    wouldCategorize: number;
    wouldRecategorize: number;
    total: number;
  }> {
    const { data } = await this.client.post<{ 
      success: boolean; 
      wouldCategorize: number;
      wouldRecategorize: number; 
      total: number; 
      message: string 
    }>('/autocategorize/preview', { forceRecategorize });
    return { 
      wouldCategorize: data.wouldCategorize, 
      wouldRecategorize: data.wouldRecategorize,
      total: data.total 
    };
  }

  async applyAutoCategorizeRules(forceRecategorize: boolean = false): Promise<{ 
    categorized: number; 
    recategorized: number;
    total: number 
  }> {
    const { data } = await this.client.post<{ 
      success: boolean; 
      categorized: number;
      recategorized: number; 
      total: number; 
      message: string 
    }>('/autocategorize/apply', { forceRecategorize });
    return { 
      categorized: data.categorized, 
      recategorized: data.recategorized,
      total: data.total 
    };
  }

  // Transaction import endpoint
  async importTransactionsFromCSV(csvContent: string, options: { preview?: boolean; skipDuplicates?: boolean; updateCategoriesOnly?: boolean } = {}): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    details?: string[];
    data?: {
      imported: number;
      skipped: number;
      errors: string[];
      warnings: string[];
    };
  }> {
    const { data } = await this.client.post('/transactions/import-csv', {
      csvContent,
      preview: options.preview || false,
      skipDuplicates: options.skipDuplicates !== false,
      updateCategoriesOnly: options.updateCategoriesOnly || false
    });
    return data;
  }

  // Admin methods
  async migrateSavingsToRollover(): Promise<{
    success: boolean;
    message: string;
    migratedCount: number;
    totalCount: number;
  }> {
    const { data } = await this.client.post('/admin/migrate-savings-to-rollover');
    return data;
  }

  async getMigrationStatus(): Promise<{
    totalCategories: number;
    categoriesWithOldField: number;
    categoriesWithNewField: number;
    migrationNeeded: boolean;
    migrationComplete: boolean;
  }> {
    const { data } = await this.client.get('/admin/migration-status');
    return data;
  }

  async cleanLocationData(): Promise<{
    success: boolean;
    message: string;
    migratedCount: number;
    totalCount: number;
  }> {
    const { data } = await this.client.post('/admin/clean-location-data');
    return data;
  }

  async getLocationCleanupStatus(): Promise<{
    totalTransactions: number;
    transactionsWithEmptyLocation: number;
    transactionsWithValidLocation: number;
    transactionsWithNullLocation: number;
    cleanupNeeded: boolean;
    cleanupComplete: boolean;
  }> {
    const { data } = await this.client.get('/admin/location-cleanup-status');
    return data;
  }
}

export const api = new ApiClient();