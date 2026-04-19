// Shared TypeScript types for the budgeting app

// =============================================================================
// Push Notification Types
// =============================================================================

export type NotificationType =
  | 'sync_failure'
  | 'budget_alert'
  | 'large_transaction'
  | 'bill_reminder';

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface NotificationPreferences {
  syncFailures: boolean;
  budgetAlerts: boolean;
  budgetAlertThreshold: number;  // percentage, e.g. 80
  largeTransactions: boolean;
  largeTransactionThreshold: number;  // dollar amount
  billReminders: boolean;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  deviceLabel?: string;
  subscribedAt: string;
}

// =============================================================================
// Family & Multi-User Types
// =============================================================================

export interface FamilyMember {
  userId: string;          // References User.id
  displayName: string;     // e.g., "Jared"
  joinedAt: string;        // ISO string
  color?: UserColor;       // Visual identity color chosen by the user
}

// Fixed palette of contrast-safe Mantine colors used for per-user visual identity.
// Keep in sync with frontend/src/utils/userColor.ts.
export const USER_COLOR_PALETTE = [
  'blue',
  'teal',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'violet',
] as const;

export type UserColor = (typeof USER_COLOR_PALETTE)[number];

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
  color?: UserColor;       // Visual identity color chosen by the user
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
  isSavings: boolean;          // true for savings/investment categories (excluded from spending totals)
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
  stops: Stop[];
}

export interface TripCategoryBudget {
  categoryId: string;
  amount: number;
}

// =============================================================================
// Trip Stop Types (Itineraries)
// =============================================================================

export type StopType = 'stay' | 'eat' | 'play' | 'transit';

export type TransitMode =
  | 'drive'
  | 'flight'
  | 'train'
  | 'walk'
  | 'shuttle'
  | 'other';

export interface VerifiedLocation {
  kind: 'verified';
  label: string;     // Short display name, e.g. "Hotel Arts Barcelona"
  address: string;   // Full formatted address
  lat: number;
  lng: number;
  placeId: string;   // Provider-specific (Google Places), for dedup/update
}

export interface FreeTextLocation {
  kind: 'freeText';
  label: string;     // e.g. "Grandma's house"
}

export type StopLocation = VerifiedLocation | FreeTextLocation;

interface StopBase {
  id: string;                   // UUID
  date: string;                 // ISO date (YYYY-MM-DD)
  time: string | null;          // "HH:mm" 24-hour or null
  notes: string;                // Free text, default ''
  sortOrder: number;            // Manual ordering for untimed stops within a day
  createdAt: string;
  updatedAt: string;
}

export interface StayStop extends StopBase {
  type: 'stay';
  name: string;
  location: VerifiedLocation;   // Stays must be verified (REQ-009)
  endDate: string;              // ISO date — last night of stay (D2)
}

export interface EatStop extends StopBase {
  type: 'eat';
  name: string;
  location: StopLocation | null;
}

export interface PlayStop extends StopBase {
  type: 'play';
  name: string;
  location: StopLocation | null;
  durationMinutes: number | null;
}

export interface TransitStop extends StopBase {
  type: 'transit';
  mode: TransitMode;
  fromLocation: StopLocation | null;
  toLocation: StopLocation | null;
  durationMinutes: number | null;
}

export type Stop = StayStop | EatStop | PlayStop | TransitStop;

// Create DTOs — server generates id/createdAt/updatedAt/sortOrder
export interface CreateStayStopDto {
  type: 'stay';
  date: string;
  time?: string | null;
  notes?: string;
  sortOrder?: number;
  name: string;
  location: VerifiedLocation;
  endDate: string;
}

export interface CreateEatStopDto {
  type: 'eat';
  date: string;
  time?: string | null;
  notes?: string;
  sortOrder?: number;
  name: string;
  location?: StopLocation | null;
}

export interface CreatePlayStopDto {
  type: 'play';
  date: string;
  time?: string | null;
  notes?: string;
  sortOrder?: number;
  name: string;
  location?: StopLocation | null;
  durationMinutes?: number | null;
}

export interface CreateTransitStopDto {
  type: 'transit';
  date: string;
  time?: string | null;
  notes?: string;
  sortOrder?: number;
  mode: TransitMode;
  fromLocation?: StopLocation | null;
  toLocation?: StopLocation | null;
  durationMinutes?: number | null;
}

export type CreateStopDto =
  | CreateStayStopDto
  | CreateEatStopDto
  | CreatePlayStopDto
  | CreateTransitStopDto;

// Update DTOs — every field optional; type cannot change after creation.
export interface UpdateStayStopDto {
  date?: string;
  time?: string | null;
  notes?: string;
  sortOrder?: number;
  name?: string;
  location?: VerifiedLocation;
  endDate?: string;
}

export interface UpdateEatStopDto {
  date?: string;
  time?: string | null;
  notes?: string;
  sortOrder?: number;
  name?: string;
  location?: StopLocation | null;
}

export interface UpdatePlayStopDto {
  date?: string;
  time?: string | null;
  notes?: string;
  sortOrder?: number;
  name?: string;
  location?: StopLocation | null;
  durationMinutes?: number | null;
}

export interface UpdateTransitStopDto {
  date?: string;
  time?: string | null;
  notes?: string;
  sortOrder?: number;
  mode?: TransitMode;
  fromLocation?: StopLocation | null;
  toLocation?: StopLocation | null;
  durationMinutes?: number | null;
}

export type UpdateStopDto =
  | UpdateStayStopDto
  | UpdateEatStopDto
  | UpdatePlayStopDto
  | UpdateTransitStopDto;

export interface ReorderStopsDto {
  updates: { id: string; sortOrder: number }[];
}

export interface StoredTrip extends Trip {
  userId: string;
  createdAt: string;
  updatedAt: string;
  lastModifiedBy?: string;  // userId of the family member who last edited
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

export interface ProjectLineItem {
  id: string;            // UUID, generated server-side on create; required on stored/returned objects
  name: string;          // required, max 200 chars
  estimatedCost: number; // required, >= 0
  notes?: string;        // optional, max 1000 chars
}

/** Incoming line item payload — id is optional for new items (server assigns UUID) */
export interface ProjectLineItemInput {
  id?: string;
  name: string;
  estimatedCost: number;
  notes?: string;
}

/** Incoming category budget (create/update payloads) */
export interface ProjectCategoryBudgetInput {
  categoryId: string;
  amount: number;
  lineItems?: ProjectLineItemInput[];
}

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
  lineItems?: ProjectLineItem[]; // optional — treat undefined and [] as equivalent
}

export interface StoredProject extends Project {
  userId: string;
  createdAt: string;
  updatedAt: string;
  lastModifiedBy?: string;  // userId of the family member who last edited
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
  categoryBudgets?: ProjectCategoryBudgetInput[];
  notes?: string;
}

export interface UpdateProjectDto {
  name?: string;
  startDate?: string;
  endDate?: string;
  totalBudget?: number | null;
  categoryBudgets?: ProjectCategoryBudgetInput[];
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

// =============================================================================
// Chat Action Types (Attachments & Action Cards)
// =============================================================================

/** V1 allowlist — extensible string union */
export type ChatActionId = 'create_task';

/** Drives card field rendering */
export type DisplayFieldType = 'text' | 'textarea' | 'date' | 'select' | 'tags';

export interface DisplayField {
  key: string;                  // Maps to a field in params
  label: string;                // Human-readable label
  value: string;                // Formatted value for display
  editable: boolean;            // Whether Edit mode allows changes
  type: DisplayFieldType;
  options?: { value: string; label: string }[]; // for 'select'
}

/** What the LLM produces via propose_action tool */
export interface ActionProposalInput {
  actionId: ChatActionId;
  params: Record<string, unknown>;
  displaySummary: string;
  displayFields: DisplayField[];
  reasoning: string;
}

/** What the backend returns to the frontend after interception */
export interface ActionProposal {
  proposalId: string;           // nonce — single-use UUID
  actionId: ChatActionId;
  params: Record<string, unknown>; // Server-validated, Zod-coerced
  displaySummary: string;
  displayFields: DisplayField[];
  reasoning: string;
  expiresAt: string;            // ISO, nonce expiry (15 min)
}

/** Confirmation request body */
export interface ActionConfirmRequest {
  proposalId: string;
  confirmedParams: Record<string, unknown>;
}

export interface ActionResource {
  type: 'task';                 // V1 only
  id: string;
  url?: string;                 // Frontend-resolvable deep link
  label: string;                // Human-readable name of the resource
}

export type ActionConfirmErrorCode =
  | 'nonce_not_found'
  | 'nonce_expired'
  | 'nonce_already_used'
  | 'validation_failed'
  | 'action_not_allowed'
  | 'internal_error';

/** Confirmation response */
export type ActionConfirmResponse =
  | { success: true; resource: ActionResource }
  | { success: false; error: string; errorCode: ActionConfirmErrorCode };

/** Attachment metadata (transient — no content, just meta) */
export interface ChatAttachmentMeta {
  filename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO date
  model?: string;
  tokenUsage?: TokenUsage;
  pageContext?: PageContext;
  /** Attachment metadata when this message was sent with a file */
  attachment?: ChatAttachmentMeta;
  /** Proposal metadata for assistant messages that triggered an action card.
   *  NOTE: nonce (proposalId) is intentionally excluded — never sent to LLM. */
  proposal?: Pick<ActionProposal, 'actionId' | 'displaySummary' | 'params' | 'displayFields'>;
  proposalStatus?: 'pending' | 'confirmed' | 'dismissed' | 'superseded' | 'expired';
  resource?: ActionResource;    // populated after successful confirm
}

export type ChatModel = 'haiku' | 'sonnet' | 'opus';

export interface ChatRequest {
  message: string;
  conversationHistory: ChatMessage[];
  pageContext: PageContext;
  model: ChatModel;
  userDisplayName?: string;
  /** Client-generated UUID per conversation. Reset on "New conversation". */
  conversationId?: string;
}

export type ChatUsage = {
  monthlySpend: number;
  monthlyLimit: number;
  remainingBudget: number;
  capExceeded: boolean;
};

export type ChatResponse =
  | {
      type: 'message';
      message: ChatMessage;
      usage: ChatUsage;
    }
  | {
      type: 'issue_confirmation';
      message: ChatMessage;
      issueDraft: GitHubIssueDraft;
      usage: ChatUsage;
    }
  | {
      /** Backend intercepted a propose_action tool call; proposal is ready for user */
      type: 'action_proposal';
      message: ChatMessage;
      proposal: ActionProposal;
      usage: ChatUsage;
    };

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

/**
 * How a CategorySpendingSummary row was computed.
 *  - 'parent_rollup' — row represents an entire category tree (parent + all children rolled up)
 *  - 'leaf'          — row represents a single leaf category in isolation (no rollup)
 *
 * Per CATEGORY-HIERARCHY-BUDGETING-BRD.md REQ-017 — the field exists so the model
 * can distinguish rolled-up totals from leaf-level detail and avoid presenting them
 * as comparable. Current chatbot tools return parent_rollup rows only; the field is
 * a stable hook for a future leaf-level variant.
 */
export type CategoryAggregationLevel = 'parent_rollup' | 'leaf';

export interface CategorySpendingSummary {
  categoryId: string;
  categoryName: string;
  amount: number;
  transactionCount: number;
  percentage: number;
  aggregation_level: CategoryAggregationLevel;
}

export interface BudgetSummaryTotals {
  month: string;
  totalBudgetedIncome: number;
  totalActualIncome: number;
  /** Budgeted spending (excludes savings categories per SAVINGS-CATEGORY-BRD). */
  totalBudgetedExpense: number;
  /** Actual spending (excludes savings categories). */
  totalActualExpense: number;
  /** Budgeted savings contributions (e.g. retirement targets). Symmetric with totalActualSavings. */
  totalBudgetedSavings: number;
  /** Actual savings transactions for the period. */
  totalActualSavings: number;
  netBudgeted: number;
  netActual: number;
  incomeVariance: number;
  expenseVariance: number;
}

export interface CashFlowSummary {
  startDate: string;
  endDate: string;
  totalIncome: number;
  totalExpenses: number;  // spending only (excludes savings)
  totalSavings: number;   // savings category transactions
  netCashFlow: number;
  monthlyBreakdown: {
    month: string;
    income: number;
    expenses: number;
    savings: number;
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

export interface SubTask {
  id: string;                     // UUID
  title: string;
  completed: boolean;
}

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
  tags: string[];                 // free-form labels for filtering
  subTasks: SubTask[];            // checklist items on the task
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
  tags?: string[];
  subTasks?: { title: string }[];
  status?: Extract<TaskStatus, 'todo' | 'started'>; // default: 'todo'
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  scope?: TaskScope;
  assigneeId?: string | null;
  dueDate?: string | null;
  tags?: string[];
  subTasks?: SubTask[];
}

export interface UpdateTaskStatusDto {
  status: TaskStatus;
}

// Task Template types

export interface TaskTemplate {
  id: string;                     // UUID
  name: string;                   // template name = default task title
  defaultDescription: string;     // default task description
  defaultAssigneeId: string | null;
  defaultScope: TaskScope;        // default: 'family'
  defaultTags: string[];          // default tags applied to created task
  defaultSubTasks: string[];      // default sub-task titles
  sortOrder: number;              // display order in dropdown
}

export interface StoredTaskTemplate extends TaskTemplate {
  familyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskTemplateDto {
  name: string;
  defaultDescription?: string;
  defaultAssigneeId?: string | null;
  defaultScope?: TaskScope;
  defaultTags?: string[];
  defaultSubTasks?: string[];
}

export interface UpdateTaskTemplateDto {
  name?: string;
  defaultDescription?: string;
  defaultAssigneeId?: string | null;
  defaultScope?: TaskScope;
  defaultTags?: string[];
  defaultSubTasks?: string[];
  sortOrder?: number;
}

// Leaderboard types

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  completedToday: number;
  completedThisWeek: number;
  completedThisMonth: number;
  color?: UserColor;
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