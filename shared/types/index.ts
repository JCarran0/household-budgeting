// Shared TypeScript types for the budgeting app

// =============================================================================
// Family & Multi-User Types
// =============================================================================

export interface FamilyMember {
  userId: string;          // References User.id
  displayName: string;     // e.g., "Jared"
  joinedAt: string;        // ISO string
}

export interface Family {
  id: string;              // UUID
  name: string;            // e.g., "Carrano Family"
  members: FamilyMember[];
  createdAt: string;       // ISO string
  updatedAt: string;       // ISO string
}

export interface AccountOwnerMapping {
  id: string;              // UUID
  cardIdentifier: string;  // Last-4 digits from Plaid accountOwner
  displayName: string;     // e.g., "Jared", "Joj"
  linkedUserId?: string;   // Optional link to a family member
}

// Theme Types
export interface CustomTheme {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  primaryColor: string;
  colors: {
    [colorName: string]: string[]; // Each color has 10 shades
  };
  otherOptions: {
    defaultRadius: string;
    cursorType: string;
    autoContrast: boolean;
    luminanceThreshold: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateThemeRequest {
  name: string;
  primaryColor: string;
  colors: {
    [colorName: string]: string[];
  };
  otherOptions: {
    defaultRadius: string;
    cursorType: string;
    autoContrast: boolean;
    luminanceThreshold: number;
  };
}

export interface UpdateThemeRequest {
  name?: string;
  primaryColor?: string;
  colors?: {
    [colorName: string]: string[];
  };
  otherOptions?: {
    defaultRadius?: string;
    cursorType?: string;
    autoContrast?: boolean;
    luminanceThreshold?: number;
  };
}

// Customizable colors constant
export const CUSTOMIZABLE_COLORS = [
  'dark', 'gray', 'red', 'pink', 'grape', 'violet',
  'indigo', 'blue', 'cyan', 'teal', 'green', 'lime',
  'yellow', 'orange'
] as const;

export interface User {
  id: string;
  username: string;
  displayName: string;     // Separate from username, shown in UI
  familyId: string;        // The family this user belongs to
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
  displayName: string;
  familyName?: string;     // Optional, defaults to "{username}'s Family"
  joinCode?: string;       // Optional, to join an existing family
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
  accountOwner: string | null;
  originalDescription: string | null;
  location: {
    address: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    lat: number | null;
    lon: number | null;
  } | null;
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

// Project types
export interface Project {
  id: string;
  name: string;
  tag: string;
  startDate: string;
  endDate: string;
  totalBudget: number | null;
  categoryBudgets: ProjectCategoryBudget[];
  notes: string;
}

export interface ProjectCategoryBudget {
  categoryId: string;
  amount: number;
}

export interface StoredProject extends Project {
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary extends Project {
  status: 'planning' | 'active' | 'completed';
  totalSpent: number;
  categorySpending: ProjectCategorySpending[];
}

export interface ProjectCategorySpending {
  categoryId: string;
  categoryName: string;
  spent: number;
  budgeted: number | null;
}

export interface CreateProjectDto {
  name: string;
  startDate: string;
  endDate: string;
  totalBudget?: number | null;
  categoryBudgets?: ProjectCategoryBudget[];
  notes?: string;
}

export interface UpdateProjectDto {
  name?: string;
  startDate?: string;
  endDate?: string;
  totalBudget?: number | null;
  categoryBudgets?: ProjectCategoryBudget[];
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

// =============================================================================
// Amazon Receipt Matching Types
// =============================================================================

// --- PDF Parsing Types ---

/** Extracted from Amazon Orders page PDF */
export interface ParsedAmazonOrder {
  orderNumber: string;
  orderDate: string; // ISO date
  totalAmount: number;
  items: ParsedAmazonItem[];
}

export interface ParsedAmazonItem {
  name: string;
  estimatedPrice: number | null; // null if not available (multi-item orders)
  quantity: number;
}

/** Extracted from Amazon Payments > Transactions PDF */
export interface ParsedAmazonCharge {
  orderNumber: string;
  chargeDate: string; // ISO date
  amount: number;
  cardLastFour: string;
  merchantLabel: string;
}

// --- Matching & Session Types ---

export type AmazonMatchConfidence = 'high' | 'medium' | 'low' | 'manual';
export type AmazonMatchStatus = 'pending' | 'categorized' | 'split' | 'skipped';
export type AmazonSessionStatus = 'parsed' | 'matching' | 'reviewing' | 'completed';

export interface AmazonMatchItem {
  name: string;
  estimatedPrice: number | null;
  suggestedCategoryId: string | null;
  appliedCategoryId: string | null;
  confidence: number; // 0.0–1.0
  isEstimatedPrice: boolean;
}

export interface AmazonTransactionMatch {
  id: string; // Generated match ID
  orderNumber: string;
  transactionId: string;
  matchConfidence: AmazonMatchConfidence;
  items: AmazonMatchItem[];
  splitTransactionIds: string[]; // Populated after split applied
  status: AmazonMatchStatus;
}

export interface AmazonReceiptSession {
  id: string;
  userId: string;
  uploadedAt: string; // ISO timestamp
  pdfTypes: ('orders' | 'transactions')[];
  parsedOrders: ParsedAmazonOrder[];
  parsedCharges: ParsedAmazonCharge[];
  matches: AmazonTransactionMatch[];
  status: AmazonSessionStatus;
}

// --- API Request/Response Types ---

export interface AmazonReceiptUploadResponse {
  sessionId: string;
  pdfTypes: ('orders' | 'transactions')[];
  parsedOrders: ParsedAmazonOrder[];
  parsedCharges: ParsedAmazonCharge[];
  costUsed: number;
}

export interface AmazonReceiptMatchResponse {
  matches: AmazonTransactionMatch[];
  unmatched: ParsedAmazonOrder[];
  ambiguous: AmbiguousAmazonMatch[];
}

export interface AmbiguousAmazonMatch {
  order: ParsedAmazonOrder;
  candidates: {
    transactionId: string;
    date: string;
    amount: number;
    description: string;
  }[];
}

export interface AmazonCategorizationResponse {
  recommendations: AmazonCategoryRecommendation[];
  splitRecommendations: AmazonSplitRecommendation[];
  costUsed: number;
}

export interface AmazonCategoryRecommendation {
  matchId: string;
  transactionId: string;
  suggestedCategoryId: string;
  categoryName: string;
  confidence: number;
  reasoning: string;
  itemName: string;
  isAlreadyCategorized: boolean;
  currentCategoryId: string | null;
}

export interface AmazonSplitRecommendation {
  matchId: string;
  transactionId: string;
  originalAmount: number;
  splits: {
    itemName: string;
    estimatedAmount: number;
    suggestedCategoryId: string;
    categoryName: string;
    confidence: number;
    isEstimatedPrice: boolean;
  }[];
  totalMatchesOriginal: boolean;
}

export interface AmazonApplyAction {
  matchId: string;
  type: 'categorize' | 'split' | 'skip';
  categoryId?: string; // For simple recategorization
  splits?: {
    // For split application
    amount: number;
    categoryId: string;
    description?: string;
  }[];
}

export interface AmazonApplyResponse {
  applied: number;
  splits: number;
  skipped: number;
  rulesCreated: number;
  summary: {
    totalDollarsRecategorized: number;
    categoriesUpdated: string[];
  };
}

export interface AmazonResolveAmbiguousRequest {
  resolutions: {
    orderNumber: string;
    transactionId: string;
  }[];
}

export interface AmazonCategorizeRequest {
  matchIds: string[];
}

// =============================================================================
// Task Management Types
// =============================================================================

export type TaskStatus = 'todo' | 'started' | 'done' | 'cancelled';
export type TaskScope = 'family' | 'personal';

export interface TaskTransition {
  fromStatus: TaskStatus | null;  // null for initial creation
  toStatus: TaskStatus;
  timestamp: string;              // ISO datetime
  userId: string;                 // who made the change
}

export interface Task {
  id: string;                     // UUID
  title: string;
  description: string;            // empty string default
  status: TaskStatus;
  scope: TaskScope;
  assigneeId: string | null;      // userId of assignee, null if unassigned
  dueDate: string | null;         // ISO date, null if no deadline
  createdAt: string;              // ISO datetime
  createdBy: string;              // userId
  startedAt: string | null;       // most recent transition to started
  completedAt: string | null;     // most recent transition to done
  cancelledAt: string | null;     // most recent transition to cancelled
  assignedAt: string | null;      // most recent assignment change
  transitions: TaskTransition[];  // append-only log
}

export interface StoredTask extends Task {
  familyId: string;
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  scope?: TaskScope;              // default: 'family'
  assigneeId?: string | null;
  dueDate?: string | null;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  scope?: TaskScope;
  assigneeId?: string | null;
  dueDate?: string | null;
}

export interface UpdateTaskStatusDto {
  status: TaskStatus;
}

// Task Template types

export interface TaskTemplate {
  id: string;                     // UUID
  name: string;                   // template name = default task title
  defaultAssigneeId: string | null;
  defaultScope: TaskScope;        // default: 'family'
  sortOrder: number;              // display order in dropdown
}

export interface StoredTaskTemplate extends TaskTemplate {
  familyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskTemplateDto {
  name: string;
  defaultAssigneeId?: string | null;
  defaultScope?: TaskScope;
}

export interface UpdateTaskTemplateDto {
  name?: string;
  defaultAssigneeId?: string | null;
  defaultScope?: TaskScope;
  sortOrder?: number;
}

// Leaderboard types

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  completedToday: number;
  completedThisWeek: number;
  completedThisMonth: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  boundaries: {
    todayStart: string;
    weekStart: string;
    monthStart: string;
  };
}

// Manual Account Types
export type ManualAccountCategory =
  | 'real_estate'
  | 'vehicle'
  | 'retirement'
  | 'brokerage'
  | 'cash'
  | 'crypto'
  | 'other_asset'
  | 'mortgage'
  | 'auto_loan'
  | 'student_loan'
  | 'personal_loan'
  | 'other_liability';

export interface ManualAccount {
  id: string;
  userId: string;
  name: string;
  category: ManualAccountCategory;
  isAsset: boolean;
  currentBalance: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateManualAccountDto {
  name: string;
  category: ManualAccountCategory;
  isAsset: boolean;
  currentBalance: number;
  notes?: string | null;
}

export interface UpdateManualAccountDto {
  name?: string;
  category?: ManualAccountCategory;
  isAsset?: boolean;
  currentBalance?: number;
  notes?: string | null;
}