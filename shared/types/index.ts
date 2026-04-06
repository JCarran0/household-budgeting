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
  status: 'active' | 'inactive' | 'requires_reauth';
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
  isFlagged: boolean;
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

// Trip types
export interface Trip {
  id: string;
  name: string;
  tag: string;
  startDate: string;
  endDate: string;
  totalBudget: number | null;
  categoryBudgets: TripCategoryBudget[];
  rating: number | null;
  notes: string;
}

export interface TripCategoryBudget {
  categoryId: string;
  amount: number;
}

export interface StoredTrip extends Trip {
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripSummary extends Trip {
  status: 'upcoming' | 'active' | 'completed';
  totalSpent: number;
  categorySpending: TripCategorySpending[];
}

export interface TripCategorySpending {
  categoryId: string;
  categoryName: string;
  spent: number;
  budgeted: number | null;
}

export interface CreateTripDto {
  name: string;
  startDate: string;
  endDate: string;
  totalBudget?: number | null;
  categoryBudgets?: TripCategoryBudget[];
  rating?: number | null;
  notes?: string;
}

export interface UpdateTripDto {
  name?: string;
  startDate?: string;
  endDate?: string;
  totalBudget?: number | null;
  categoryBudgets?: TripCategoryBudget[];
  rating?: number | null;
  notes?: string;
}

// =============================================================================
// Chatbot Types (Phase 1)
// =============================================================================

export interface PageContext {
  path: string;
  pageName: string;
  params: Record<string, string>;
  description: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number; // USD
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO date
  model?: string;
  tokenUsage?: TokenUsage;
  pageContext?: PageContext;
}

export type ChatModel = 'haiku' | 'sonnet' | 'opus';

export interface ChatRequest {
  message: string;
  conversationHistory: ChatMessage[];
  pageContext: PageContext;
  model: ChatModel;
}

export interface ChatResponse {
  type: 'message' | 'issue_confirmation';
  message: ChatMessage;
  issueDraft?: GitHubIssueDraft; // present when type === 'issue_confirmation'
  usage: {
    monthlySpend: number;
    monthlyLimit: number;
    remainingBudget: number;
    capExceeded: boolean;
  };
}

export const MAX_CONVERSATION_HISTORY = 50;

// GitHub issue types
export interface GitHubIssueDraft {
  title: string;
  body: string;
  labels: string[];
}

export interface GitHubIssueConfirmation {
  draft: GitHubIssueDraft;
  conversationContext: string;
}

// =============================================================================
// Chatbot Tool Input/Output Types
// =============================================================================

// AccountSummary — safe subset of PlaidAccount, explicitly excludes secrets (SEC-002)
export interface AccountSummary {
  id: string;
  name: string;
  nickname?: string | null;
  type: PlaidAccount['type'];
  subtype: string | null;
  institution: string;
  mask: string | null;
  currentBalance: number;
  availableBalance: number | null;
  isActive: boolean;
  status: PlaidAccount['status'];
  lastSynced: string | null;
  // Intentionally EXCLUDES: plaidAccountId, plaidItemId, createdAt, updatedAt
}

// Tool inputs
export interface QueryTransactionsInput {
  startDate?: string;
  endDate?: string;
  categoryIds?: string[];
  accountIds?: string[];
  tags?: string[];
  minAmount?: number;
  maxAmount?: number;
  searchQuery?: string;
  status?: 'pending' | 'posted';
  onlyUncategorized?: boolean;
  limit?: number;
}

export interface GetBudgetsInput {
  month: string; // YYYY-MM
}

export interface GetBudgetSummaryInput {
  month: string; // YYYY-MM
}

export interface GetSpendingByCategoryInput {
  startDate: string;
  endDate: string;
}

export interface GetCashFlowInput {
  startDate: string;
  endDate: string;
}

// Tool outputs
export interface CategorySpendingSummary {
  categoryId: string;
  categoryName: string;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
  amount: number;
  transactionCount: number;
  percentage: number;
}

export interface BudgetSummaryTotals {
  month: string;
  totalBudgetedIncome: number;
  totalActualIncome: number;
  totalBudgetedExpense: number;
  totalActualExpense: number;
  netBudgeted: number;
  netActual: number;
  incomeVariance: number;
  expenseVariance: number;
}

export interface CashFlowSummary {
  startDate: string;
  endDate: string;
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  monthlyBreakdown: {
    month: string;
    income: number;
    expenses: number;
    net: number;
  }[];
}

// =============================================================================
// AI Categorization Types
// =============================================================================

export type ClassificationConfidence = 'high' | 'medium' | 'low';

export interface ClassificationResult {
  transactionId: string;
  suggestedCategoryId: string;
  confidence: ClassificationConfidence;
  reasoning: string;
}

export interface ClassifiedTransaction {
  id: string;
  date: string;
  name: string;
  merchantName: string | null;
  amount: number;
  suggestedCategoryId: string;
  confidence: ClassificationConfidence;
  reasoning: string;
  selectedCategoryId: string | null; // user can override before applying
}

export interface ClassificationBucket {
  categoryId: string;
  categoryName: string;
  confidence: ClassificationConfidence;
  transactions: ClassifiedTransaction[];
  totalAmount: number;
}

export interface ClassifyTransactionsRequest {
  transactionIds?: string[];
}

export interface ClassifyTransactionsResponse {
  buckets: ClassificationBucket[];
  unsureBucket: ClassificationBucket;
  totalClassified: number;
  costUsed: number;
}

export interface RuleSuggestion {
  patterns: string[];
  categoryId: string;
  categoryName: string;
  matchingTransactionCount: number;
  exampleTransactions: string[];
}

export interface SuggestRulesRequest {
  categorizations: { transactionId: string; categoryId: string }[];
}

export interface SuggestRulesResponse {
  suggestions: RuleSuggestion[];
}