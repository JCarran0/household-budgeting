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
  notes?: string; // Optional cell-level note, max 1000 chars
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
  /** Optional link to an externally-hosted photo album (Google Photos, etc). */
  photoAlbumUrl: string | null;
  /**
   * Stop whose photo drives the cover banner on trip surfaces. When null, the
   * resolver falls back to the first Stay (then Eat/Play) stop with a photoName.
   */
  coverStopId: string | null;
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
  photoName?: string;        // Places v1 photo resource name (e.g. places/.../photos/...)
  photoAttribution?: string; // First author's display name
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

// Update DTOs — every field optional except `type`, which is required as a
// discriminator so the backend can select the right variant and verify the
// type has not changed.
export interface UpdateStayStopDto {
  type: 'stay';
  date?: string;
  time?: string | null;
  notes?: string;
  sortOrder?: number;
  name?: string;
  location?: VerifiedLocation;
  endDate?: string;
}

export interface UpdateEatStopDto {
  type: 'eat';
  date?: string;
  time?: string | null;
  notes?: string;
  sortOrder?: number;
  name?: string;
  location?: StopLocation | null;
}

export interface UpdatePlayStopDto {
  type: 'play';
  date?: string;
  time?: string | null;
  notes?: string;
  sortOrder?: number;
  name?: string;
  location?: StopLocation | null;
  durationMinutes?: number | null;
}

export interface UpdateTransitStopDto {
  type: 'transit';
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
  photoAlbumUrl?: string | null;
  coverStopId?: string | null;
}

export interface UpdateTripDto {
  name?: string;
  startDate?: string;
  endDate?: string;
  totalBudget?: number | null;
  categoryBudgets?: TripCategoryBudget[];
  rating?: number | null;
  notes?: string;
  photoAlbumUrl?: string | null;
  coverStopId?: string | null;
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
export type ChatActionId = 'create_task' | 'submit_github_issue';

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
  type: 'task' | 'github_issue';
  id: string;
  url?: string;                 // Frontend-resolvable deep link (or external for github_issue)
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
      /** Backend intercepted a propose_action tool call; proposal is ready for user */
      type: 'action_proposal';
      message: ChatMessage;
      proposal: ActionProposal;
      usage: ChatUsage;
    };

export const MAX_CONVERSATION_HISTORY = 50;

// GitHub issue payload — params shape for the submit_github_issue chat action.
export interface GitHubIssueDraft {
  title: string;
  body: string;
  labels: ('bug' | 'enhancement')[];
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
  netCashFlow: number;    // income - expenses - savings
  monthlyBreakdown: {
    month: string;
    income: number;
    expenses: number;
    savings: number;
    net: number;          // income - expenses - savings
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
  // Uncategorized transactions left over after this batch was capped at
  // CLASSIFICATION_BATCH_LIMIT. Frontend re-runs the flow to drain them.
  remainingUncategorized: number;
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
  /**
   * Server-stamped timestamp when `completed` transitioned false → true.
   * Cleared (null) when the subtask is unchecked. Populated by the server
   * on each toggle; client-supplied values are ignored.
   */
  completedAt: string | null;
  /**
   * Server-stamped userId of whoever most recently checked this subtask.
   * Cleared when unchecked. Subtask leaderboard credit falls through to
   * this field when the parent task has no assignee.
   */
  completedBy: string | null;
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
  snoozedUntil: string | null;    // ISO datetime; null if not snoozed (v2.0)
  sortOrder: number;              // fractional float for manual ordering (v2.0)
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
  /**
   * Optional explicit sortOrder for the new task (v2.1). When omitted, the
   * server assigns top-of-column. Used by Checklist quick entry to place
   * new tasks at the user's cursor position.
   */
  sortOrder?: number;
}

/**
 * Wire shape for subtask updates. Only id/title/completed are accepted —
 * `completedAt` / `completedBy` are server-stamped based on toggles and
 * cannot be set by the client.
 */
export type SubTaskUpdate = Pick<SubTask, 'id' | 'title' | 'completed'>;

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  scope?: TaskScope;
  assigneeId?: string | null;
  dueDate?: string | null;
  tags?: string[];
  subTasks?: SubTaskUpdate[];
}

export interface UpdateTaskStatusDto {
  status: TaskStatus;
  /**
   * Optional startedAt timestamp. Only honored by the service when the
   * target status is 'done' AND the task's current startedAt is null —
   * used by the Checklist view's synthetic start stamp (v2.0 D2).
   */
  startedAt?: string;
}

// v2.0 — Snooze
export interface SnoozeTaskDto {
  /** ISO datetime; null clears the snooze. Future-only when set. */
  snoozedUntil: string | null;
}

// v2.0 — Manual reorder
export interface ReorderTaskDto {
  /** Destination column (validated against current + disallowed statuses). */
  status: TaskStatus;
  /** New sortOrder — computed client-side via shared/utils/taskSortOrder. */
  sortOrder: number;
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

export type BadgeCategory =
  | 'volume'
  | 'consistency'
  | 'streak'
  | 'lifetime'
  | 'weekday_warrior'
  | 'night_owl'
  | 'early_bird'
  | 'power_hour'
  | 'clean_sweep'
  | 'spring_cleaner'
  | 'holiday_hero'
  | 'phoenix'
  | 'clutch'
  | 'partner_in_crime'
  | 'comeback_kid';

export type BadgeId =
  // v1.0 — volume (3 tiers)
  | 'volume_5'
  | 'volume_10'
  | 'volume_20'
  // v1.0 — consistency (3 tiers)
  | 'consistency_4'
  | 'consistency_5'
  | 'consistency_7'
  // v1.0 — streak (3 tiers)
  | 'streak_7'
  | 'streak_30'
  | 'streak_100'
  // v1.0 — lifetime (5 tiers)
  | 'lifetime_10'
  | 'lifetime_50'
  | 'lifetime_100'
  | 'lifetime_500'
  | 'lifetime_1000'
  // v2.0 — weekday_warrior (3 tiers)
  | 'weekday_warrior_10'
  | 'weekday_warrior_25'
  | 'weekday_warrior_50'
  // v2.0 — night_owl (3 tiers)
  | 'night_owl_10'
  | 'night_owl_25'
  | 'night_owl_50'
  // v2.0 — early_bird (3 tiers)
  | 'early_bird_10'
  | 'early_bird_25'
  | 'early_bird_50'
  // v2.0 — power_hour (3 tiers)
  | 'power_hour_5'
  | 'power_hour_10'
  | 'power_hour_15'
  // v2.0 — clean_sweep (4 tiers)
  | 'clean_sweep_1'
  | 'clean_sweep_5'
  | 'clean_sweep_10'
  | 'clean_sweep_25'
  // v2.0 — spring_cleaner (3 tiers)
  | 'spring_cleaner_25'
  | 'spring_cleaner_50'
  | 'spring_cleaner_100'
  // v2.0 — holiday_hero (3 tiers)
  | 'holiday_hero_25'
  | 'holiday_hero_50'
  | 'holiday_hero_100'
  // v2.0 — phoenix (3 tiers)
  | 'phoenix_1'
  | 'phoenix_5'
  | 'phoenix_10'
  // v2.0 — clutch (3 tiers)
  | 'clutch_5'
  | 'clutch_25'
  | 'clutch_50'
  // v2.0 — partner_in_crime (3 tiers)
  | 'partner_in_crime_5'
  | 'partner_in_crime_25'
  | 'partner_in_crime_50'
  // v2.0 — comeback_kid (3 tiers)
  | 'comeback_kid_1'
  | 'comeback_kid_3'
  | 'comeback_kid_5';

export interface BadgeDefinition {
  id: BadgeId;
  category: BadgeCategory;
  threshold: number;
  order: number;
  tier: 1 | 2 | 3 | 4 | 5;
  shippedAt: string;
  celebrationCopy: string;
  displayName?: string;
  label: string;
  description: string;
}

export interface EarnedBadge {
  id: BadgeId;
  earnedAt: string;
}

// v1.0 shipped 2026-04-19; v2.0 ships 2026-04-22 (placeholder — override at deploy).
const V1_SHIPPED_AT = '2026-04-19T00:00:00.000Z';
const V2_SHIPPED_AT = '2026-04-22T00:00:00.000Z';

export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  // ---- Volume (v1.0) ----
  { id: 'volume_5', category: 'volume', threshold: 5, order: 1, tier: 1, shippedAt: V1_SHIPPED_AT,
    label: 'Volume Bronze', description: '5 tasks completed in a single day',
    celebrationCopy: "{displayName}, Volume Bronze! 5 tasks in a single day. Productivity is a vibe, and you're emitting." },
  { id: 'volume_10', category: 'volume', threshold: 10, order: 2, tier: 2, shippedAt: V1_SHIPPED_AT,
    label: 'Volume Silver', description: '10 tasks completed in a single day',
    celebrationCopy: "{displayName}, Volume Silver! Double digits in a single day. The to-do list is actively afraid of you." },
  { id: 'volume_20', category: 'volume', threshold: 20, order: 3, tier: 3, shippedAt: V1_SHIPPED_AT,
    label: 'Volume Gold', description: '20 tasks completed in a single day',
    celebrationCopy: "{displayName}, Volume Gold! 20 tasks in one day. Are you sure you breathed today?" },

  // ---- Consistency (v1.0) ----
  { id: 'consistency_4', category: 'consistency', threshold: 4, order: 1, tier: 1, shippedAt: V1_SHIPPED_AT,
    label: 'Consistency Bronze', description: 'At least 1 task on 4 days in a single week',
    celebrationCopy: "{displayName}, Consistency Bronze! 4 days with a completion this week. Showing up is half the battle — you showed up." },
  { id: 'consistency_5', category: 'consistency', threshold: 5, order: 2, tier: 2, shippedAt: V1_SHIPPED_AT,
    label: 'Consistency Silver', description: 'At least 1 task on 5 days in a single week',
    celebrationCopy: "{displayName}, Consistency Silver! 5 days this week with something crossed off. The rhythm is undeniable." },
  { id: 'consistency_7', category: 'consistency', threshold: 7, order: 3, tier: 3, shippedAt: V1_SHIPPED_AT,
    label: 'Consistency Gold', description: 'At least 1 task on all 7 days in a single week',
    celebrationCopy: "{displayName}, Consistency Gold! A completion every single day this week. Perfect attendance. Gold star. Literally." },

  // ---- Streak (v1.0) ----
  { id: 'streak_7', category: 'streak', threshold: 7, order: 1, tier: 1, shippedAt: V1_SHIPPED_AT,
    label: 'Streak Bronze', description: '7 consecutive days with at least 1 completion',
    celebrationCopy: "{displayName}, Streak Bronze! A full week of consecutive days. Habits are forming, and they are suspicious." },
  { id: 'streak_30', category: 'streak', threshold: 30, order: 2, tier: 2, shippedAt: V1_SHIPPED_AT,
    label: 'Streak Silver', description: '30 consecutive days with at least 1 completion',
    celebrationCopy: "{displayName}, Streak Silver! 30 days in a row. That's not a streak, that's a lifestyle." },
  { id: 'streak_100', category: 'streak', threshold: 100, order: 3, tier: 3, shippedAt: V1_SHIPPED_AT,
    label: 'Streak Gold', description: '100 consecutive days with at least 1 completion',
    celebrationCopy: "{displayName}, Streak Gold! 100-day streak. Stop and reflect on what's happening here — it's remarkable." },

  // ---- Lifetime (v1.0) ----
  { id: 'lifetime_10', category: 'lifetime', threshold: 10, order: 1, tier: 1, shippedAt: V1_SHIPPED_AT,
    label: 'Lifetime Bronze', description: '10 total family-task completions',
    celebrationCopy: "{displayName}, Lifetime Bronze! 10 tasks delivered. The journey of a thousand completions begins with one." },
  { id: 'lifetime_50', category: 'lifetime', threshold: 50, order: 2, tier: 2, shippedAt: V1_SHIPPED_AT,
    label: 'Lifetime Silver', description: '50 total family-task completions',
    celebrationCopy: "{displayName}, Lifetime Silver! 50 tasks delivered. You're not even breaking a sweat." },
  { id: 'lifetime_100', category: 'lifetime', threshold: 100, order: 3, tier: 3, shippedAt: V1_SHIPPED_AT,
    label: 'Lifetime Gold', description: '100 total family-task completions',
    celebrationCopy: "{displayName}, Lifetime Gold! 100 family tasks delivered. Triple digits. Certified useful." },
  { id: 'lifetime_500', category: 'lifetime', threshold: 500, order: 4, tier: 4, shippedAt: V1_SHIPPED_AT,
    label: 'Lifetime Platinum', description: '500 total family-task completions',
    celebrationCopy: "{displayName}, Lifetime Platinum! 500 tasks delivered. Your family would be a logistical disaster without you." },
  { id: 'lifetime_1000', category: 'lifetime', threshold: 1000, order: 5, tier: 5, shippedAt: V1_SHIPPED_AT,
    label: 'Lifetime Legendary', description: '1000 total family-task completions',
    celebrationCopy: "{displayName}, LEGENDARY. 1,000 family tasks delivered. One thousand. You could retire here — but you won't, because you're you." },

  // ---- Weekday Warrior (v2.0) ----
  { id: 'weekday_warrior_10', category: 'weekday_warrior', threshold: 10, order: 1, tier: 1, shippedAt: V2_SHIPPED_AT,
    label: 'Weekday Warrior Bronze', description: '10 completions in a single Mon-Fri workweek',
    celebrationCopy: "{displayName}, you've earned your first Weekday Warrior badge. You don't let a little thing like a day job get in your way. Your family appreciates it." },
  { id: 'weekday_warrior_25', category: 'weekday_warrior', threshold: 25, order: 2, tier: 2, shippedAt: V2_SHIPPED_AT,
    label: 'Weekday Warrior Silver', description: '25 completions across workdays in a single calendar month',
    celebrationCopy: "{displayName}, Weekday Warrior Silver! 25 tasks across the workweek grind — productivity between meetings is an art form, and you've nailed it." },
  { id: 'weekday_warrior_50', category: 'weekday_warrior', threshold: 50, order: 3, tier: 3, shippedAt: V2_SHIPPED_AT,
    label: 'Weekday Warrior Gold', description: '50 completions across workdays in a single calendar month',
    celebrationCopy: "{displayName}, Weekday Warrior Gold! 50 tasks in a month of Mondays through Fridays. You didn't keep up — you lapped the workweek." },

  // ---- Night Owl (v2.0) ----
  { id: 'night_owl_10', category: 'night_owl', threshold: 10, order: 1, tier: 1, shippedAt: V2_SHIPPED_AT,
    label: 'Night Owl Bronze', description: '10 completions after 9 PM',
    celebrationCopy: "{displayName}, Night Owl Bronze! 10 tasks closed after 9 PM. Your future self thanks you, even if your sleep schedule is suspicious." },
  { id: 'night_owl_25', category: 'night_owl', threshold: 25, order: 2, tier: 2, shippedAt: V2_SHIPPED_AT,
    label: 'Night Owl Silver', description: '25 completions after 9 PM',
    celebrationCopy: "{displayName}, Night Owl Silver! 25 tasks in the quiet hours. The house is asleep, but the to-do list isn't safe." },
  { id: 'night_owl_50', category: 'night_owl', threshold: 50, order: 3, tier: 3, shippedAt: V2_SHIPPED_AT,
    label: 'Night Owl Gold', description: '50 completions after 9 PM',
    celebrationCopy: "{displayName}, Night Owl Gold! 50 tasks closed after 9 PM. Are you okay? (Don't answer — the badge is proud of you.)" },

  // ---- Early Bird (v2.0) ----
  { id: 'early_bird_10', category: 'early_bird', threshold: 10, order: 1, tier: 1, shippedAt: V2_SHIPPED_AT,
    label: 'Early Bird Bronze', description: '10 completions before 7 AM',
    celebrationCopy: "{displayName}, Early Bird Bronze! 10 tasks before 7 AM — while the rest of us were still negotiating with the snooze button." },
  { id: 'early_bird_25', category: 'early_bird', threshold: 25, order: 2, tier: 2, shippedAt: V2_SHIPPED_AT,
    label: 'Early Bird Silver', description: '25 completions before 7 AM',
    celebrationCopy: "{displayName}, Early Bird Silver! 25 tasks before 7 AM. Sunrise sees you and says, 'oh, they're at it again.'" },
  { id: 'early_bird_50', category: 'early_bird', threshold: 50, order: 3, tier: 3, shippedAt: V2_SHIPPED_AT,
    label: 'Early Bird Gold', description: '50 completions before 7 AM',
    celebrationCopy: "{displayName}, Early Bird Gold! 50 tasks before coffee has kicked in for most people. You are a menace to procrastinators everywhere." },

  // ---- Power Hour (v2.0) ----
  { id: 'power_hour_5', category: 'power_hour', threshold: 5, order: 1, tier: 1, shippedAt: V2_SHIPPED_AT,
    label: 'Power Hour Bronze', description: '5 completions within any 60-minute rolling window',
    celebrationCopy: "{displayName}, Power Hour Bronze! 5 tasks in a single hour. Someone was in the zone." },
  { id: 'power_hour_10', category: 'power_hour', threshold: 10, order: 2, tier: 2, shippedAt: V2_SHIPPED_AT,
    label: 'Power Hour Silver', description: '10 completions within any 60-minute rolling window',
    celebrationCopy: "{displayName}, Power Hour Silver! 10 tasks in 60 minutes — that's a task every 6 minutes. We checked the math. It's real." },
  { id: 'power_hour_15', category: 'power_hour', threshold: 15, order: 3, tier: 3, shippedAt: V2_SHIPPED_AT,
    label: 'Power Hour Gold', description: '15 completions within any 60-minute rolling window',
    celebrationCopy: "{displayName}, Power Hour Gold! 15 tasks in an hour. This isn't productivity, it's performance art." },

  // ---- Clean Sweep (v2.0) ----
  { id: 'clean_sweep_1', category: 'clean_sweep', threshold: 1, order: 1, tier: 1, shippedAt: V2_SHIPPED_AT,
    label: 'Clean Sweep Bronze', description: '1 family zero-inbox occurrence credited to you',
    celebrationCopy: "{displayName}, Clean Sweep Bronze! You brought the family task list to zero. For one glorious moment, there was nothing to do. Enjoy it — it won't last." },
  { id: 'clean_sweep_5', category: 'clean_sweep', threshold: 5, order: 2, tier: 2, shippedAt: V2_SHIPPED_AT,
    label: 'Clean Sweep Silver', description: '5 family zero-inbox occurrences credited to you',
    celebrationCopy: "{displayName}, Clean Sweep Silver! 5 times you've emptied the family inbox. You're a recurring threat to clutter." },
  { id: 'clean_sweep_10', category: 'clean_sweep', threshold: 10, order: 3, tier: 3, shippedAt: V2_SHIPPED_AT,
    label: 'Clean Sweep Gold', description: '10 family zero-inbox occurrences credited to you',
    celebrationCopy: "{displayName}, Clean Sweep Gold! 10 zero-inbox moments. The family task list sees you coming and sighs in defeat." },
  { id: 'clean_sweep_25', category: 'clean_sweep', threshold: 25, order: 4, tier: 4, shippedAt: V2_SHIPPED_AT,
    label: 'Clean Sweep Platinum', description: '25 family zero-inbox occurrences credited to you',
    celebrationCopy: "{displayName}, Clean Sweep Platinum! 25 times you've left no task standing. This is a lifestyle now." },

  // ---- Spring Cleaner (v2.0) ----
  { id: 'spring_cleaner_25', category: 'spring_cleaner', threshold: 25, order: 1, tier: 1, shippedAt: V2_SHIPPED_AT,
    label: 'Spring Cleaner Bronze', description: '25 completions in a single March-April season',
    celebrationCopy: "{displayName}, Spring Cleaner Bronze! 25 completions between March and April. The house, the yard, the mental load — all getting brighter." },
  { id: 'spring_cleaner_50', category: 'spring_cleaner', threshold: 50, order: 2, tier: 2, shippedAt: V2_SHIPPED_AT,
    label: 'Spring Cleaner Silver', description: '50 completions in a single March-April season',
    celebrationCopy: "{displayName}, Spring Cleaner Silver! 50 completions in a single spring. Turns out it's not the flowers blooming — it's you." },
  { id: 'spring_cleaner_100', category: 'spring_cleaner', threshold: 100, order: 3, tier: 3, shippedAt: V2_SHIPPED_AT,
    label: 'Spring Cleaner Gold', description: '100 completions in a single March-April season',
    celebrationCopy: "{displayName}, Spring Cleaner Gold! 100 completions in two months. Winter hibernation is over, and the rest of us are tired just watching." },

  // ---- Holiday Hero (v2.0) ----
  { id: 'holiday_hero_25', category: 'holiday_hero', threshold: 25, order: 1, tier: 1, shippedAt: V2_SHIPPED_AT,
    label: 'Holiday Hero Bronze', description: '25 completions in a single December',
    celebrationCopy: "{displayName}, Holiday Hero Bronze! 25 completions in December. Between the gifts, the gatherings, and the grocery runs — somehow you kept it together." },
  { id: 'holiday_hero_50', category: 'holiday_hero', threshold: 50, order: 2, tier: 2, shippedAt: V2_SHIPPED_AT,
    label: 'Holiday Hero Silver', description: '50 completions in a single December',
    celebrationCopy: "{displayName}, Holiday Hero Silver! 50 completions in a single December. You didn't just survive the holidays — you conquered them." },
  { id: 'holiday_hero_100', category: 'holiday_hero', threshold: 100, order: 3, tier: 3, shippedAt: V2_SHIPPED_AT,
    label: 'Holiday Hero Gold', description: '100 completions in a single December',
    celebrationCopy: "{displayName}, Holiday Hero Gold! 100 completions in December. Santa took notes." },

  // ---- Phoenix (v2.0) ----
  { id: 'phoenix_1', category: 'phoenix', threshold: 1, order: 1, tier: 1, shippedAt: V2_SHIPPED_AT,
    label: 'Phoenix Bronze', description: '1 completion credited after a 14+ day quiet gap',
    celebrationCopy: "{displayName}, Phoenix Bronze! Your first comeback after two weeks quiet. Rising from the ashes — one task at a time." },
  { id: 'phoenix_5', category: 'phoenix', threshold: 5, order: 2, tier: 2, shippedAt: V2_SHIPPED_AT,
    label: 'Phoenix Silver', description: '5 completions credited after 14+ day quiet gaps',
    celebrationCopy: "{displayName}, Phoenix Silver! 5 comebacks. Life gets loud, you go quiet, you come back swinging. A classic." },
  { id: 'phoenix_10', category: 'phoenix', threshold: 10, order: 3, tier: 3, shippedAt: V2_SHIPPED_AT,
    label: 'Phoenix Gold', description: '10 completions credited after 14+ day quiet gaps',
    celebrationCopy: "{displayName}, Phoenix Gold! 10 epic returns from the void. No such thing as falling off — just a really long warm-up." },

  // ---- Clutch (v2.0) ----
  { id: 'clutch_5', category: 'clutch', threshold: 5, order: 1, tier: 1, shippedAt: V2_SHIPPED_AT,
    label: 'Clutch Bronze', description: '5 tasks closed on or after their due date',
    celebrationCopy: "{displayName}, Clutch Bronze! 5 overdue tasks closed before they could haunt you. The past forgives you." },
  { id: 'clutch_25', category: 'clutch', threshold: 25, order: 2, tier: 2, shippedAt: V2_SHIPPED_AT,
    label: 'Clutch Silver', description: '25 tasks closed on or after their due date',
    celebrationCopy: "{displayName}, Clutch Silver! 25 rescues from the overdue pile. You don't run from deadlines — you catch up to them." },
  { id: 'clutch_50', category: 'clutch', threshold: 50, order: 3, tier: 3, shippedAt: V2_SHIPPED_AT,
    label: 'Clutch Gold', description: '50 tasks closed on or after their due date',
    celebrationCopy: "{displayName}, Clutch Gold! 50 overdue tasks dispatched. The calendar trembles." },

  // ---- Partner in Crime (v2.0) ----
  { id: 'partner_in_crime_5', category: 'partner_in_crime', threshold: 5, order: 1, tier: 1, shippedAt: V2_SHIPPED_AT,
    label: 'Partner in Crime Bronze', description: '5 days where both family members completed ≥1 task',
    celebrationCopy: "{displayName}, Partner in Crime Bronze! 5 days where both of you got things done. Teamwork, but make it household." },
  { id: 'partner_in_crime_25', category: 'partner_in_crime', threshold: 25, order: 2, tier: 2, shippedAt: V2_SHIPPED_AT,
    label: 'Partner in Crime Silver', description: '25 days where both family members completed ≥1 task',
    celebrationCopy: "{displayName}, Partner in Crime Silver! 25 shared-completion days. The family flywheel is spinning." },
  { id: 'partner_in_crime_50', category: 'partner_in_crime', threshold: 50, order: 3, tier: 3, shippedAt: V2_SHIPPED_AT,
    label: 'Partner in Crime Gold', description: '50 days where both family members completed ≥1 task',
    celebrationCopy: "{displayName}, Partner in Crime Gold! 50 days of synchronized chore-crushing. This marriage thing is going okay." },

  // ---- Comeback Kid (v2.0) ----
  { id: 'comeback_kid_1', category: 'comeback_kid', threshold: 1, order: 1, tier: 1, shippedAt: V2_SHIPPED_AT,
    label: 'Comeback Kid Bronze', description: '1 month behind at mid-month, ahead at end-of-month',
    celebrationCopy: "{displayName}, Comeback Kid Bronze! Mid-month you were behind — end of month, you'd retaken the lead. Never count yourself out." },
  { id: 'comeback_kid_3', category: 'comeback_kid', threshold: 3, order: 2, tier: 2, shippedAt: V2_SHIPPED_AT,
    label: 'Comeback Kid Silver', description: '3 months of mid-month deficit reversed by month end',
    celebrationCopy: "{displayName}, Comeback Kid Silver! Three months of end-of-month reversals. The second half of the month is where you live." },
  { id: 'comeback_kid_5', category: 'comeback_kid', threshold: 5, order: 3, tier: 3, shippedAt: V2_SHIPPED_AT,
    label: 'Comeback Kid Gold', description: '5 months of mid-month deficit reversed by month end',
    celebrationCopy: "{displayName}, Comeback Kid Gold! Five come-from-behind monthly wins. You'd rather be chasing than leading, and it shows." },
] as const;

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  completedToday: number;
  completedThisWeek: number;
  completedThisMonth: number;
  currentStreak: number;
  bestStreak: number;
  earnedBadges: EarnedBadge[];
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