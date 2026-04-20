# AI Application Architecture Guide

## 📚 Related Documentation
- **[CLAUDE.md](../CLAUDE.md)** - Main index and project overview
- **[AI-DEPLOYMENTS.md](./AI-DEPLOYMENTS.md)** - Deployment procedures and troubleshooting
- **[AI-TESTING-STRATEGY.md](./AI-TESTING-STRATEGY.md)** - Testing patterns and examples
- **[AI-USER-STORIES.md](./AI-USER-STORIES.md)** - Product requirements and features
- **[AI-Architecture-Plan.md](./completed/AI-Architecture-Plan.md)** - Infrastructure costs and strategic planning

## Quick Start for AI Agents

This document provides a comprehensive overview of the household budgeting application architecture, designed to help AI coding agents quickly understand and work with the codebase.

## Core Architecture Overview

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Mantine UI v8 + @mantine/modals
- **Backend**: Node.js + Express + TypeScript
- **Storage**: JSON files (MVP phase)
- **External Integration**: Plaid API for bank connections
- **Authentication**: JWT with bcrypt password hashing
- **State Management**: Zustand (frontend), Service singletons (backend)
- **Data Fetching**: TanStack Query (React Query)
- **Charts**: Recharts for interactive visualizations

### Project Structure
```
household-budgeting/
├── backend/
│   ├── src/
│   │   ├── routes/          # Express route handlers
│   │   ├── services/        # Business logic layer
│   │   │   ├── storage/     # Storage adapters (S3, filesystem)
│   │   │   ├── repository.ts        # Generic Repository<T> base class
│   │   │   ├── transactionFilterEngine.ts  # Pure filtering logic
│   │   │   └── reportHelpers.ts     # Report calculation helpers
│   │   ├── errors/          # Typed error classes (AppError hierarchy)
│   │   ├── middleware/      # Auth, error handling
│   │   ├── config.ts        # Centralized Zod-validated configuration
│   │   ├── utils/           # Encryption, helpers
│   │   └── __tests__/       # Integration and unit tests
│   └── data/                # JSON file storage (dev)
├── frontend/
│   ├── src/
│   │   ├── pages/           # React page components
│   │   ├── components/
│   │   │   ├── reports/     # Report section components (CashflowSection, etc.)
│   │   │   ├── transactions/ # Transaction components (FilterBar, Table, Toolbar)
│   │   │   ├── budgets/     # Budget components
│   │   │   ├── categories/  # Category components
│   │   │   ├── accounts/    # Account components
│   │   │   ├── chat/        # Chatbot overlay
│   │   │   └── auth/        # Auth forms
│   │   ├── lib/
│   │   │   ├── api.ts       # API facade (composes domain modules)
│   │   │   └── api/         # Domain-specific API modules
│   │   ├── hooks/           # Custom React hooks
│   │   ├── stores/          # Zustand state stores
│   │   ├── providers/       # ThemeProvider, PlaidLinkProvider
│   │   └── utils/           # Formatters, report date range helpers
└── shared/
    ├── types/               # Shared TypeScript types
    └── utils/               # Shared utility functions
        ├── categoryHelpers.ts         # Category type checking
        ├── transactionCalculations.ts # Financial calculations
        └── budgetCalculations.ts      # Budget calculation utilities
```

## Key Services Architecture

### Backend Services (Singleton Pattern)

#### Service Architecture Patterns
- **Dependency Injection**: Services receive dependencies via constructor. No `as any` casts — `services/index.ts` builds the dependency graph with typed interfaces.
- **Repository Pattern**: `Repository<T>` base class (`repository.ts`) encapsulates data access. Used by TransactionService and ReportService.
- **Transaction Reader**: `transactionReader.ts` — canonical `excludeRemoved()` and `getActiveTransactions()` functions for filtering out Plaid's removed pending holds. All read paths (filter engine, chatbot, auto-categorize, reports) use this as the single source of truth. Mutation paths that load-modify-save (TransactionService mutations, admin routes, TripService, ProjectService) intentionally bypass it to avoid silently dropping removed records on save.
- **Filter Engine**: `transactionFilterEngine.ts` — pure `filterTransactions()` function extracted from TransactionService for independent testability. Uses `excludeRemoved()` from Transaction Reader.
- **Report Helpers**: `reportHelpers.ts` — pure functions for date ranges, std dev, hidden category propagation, savings category detection.
- **Error Handling**: Typed `AppError` hierarchy in `errors/index.ts` with Express `errorHandler` middleware. Services throw typed errors; routes pass via `next(error)`.
- **Configuration**: `config.ts` validates all env vars at startup via Zod. Exports typed `config` object consumed by services.

#### 1. AuthService (`backend/src/services/authService.ts`)
- **Purpose**: User authentication, JWT management, and password recovery
- **Key Methods**:
  - `register()`: Create new user with passphrase (15+ chars)
  - `login()`: Validate credentials, return JWT
  - `changePassword()`: Update password with current password verification
  - `requestPasswordReset()`: Generate secure reset token (15-min expiry)
  - `resetPassword()`: Reset password using valid token
  - `validateToken()`: Validate JWT for protected routes
- **Security Features**:
  - Rate limiting (5 attempts per 15 min)
  - Account lockout after failed attempts
  - Bcrypt password hashing
  - **Password Reset Security**:
    - Cryptographically secure tokens (crypto.randomBytes)
    - 15-minute token expiration
    - Single-use tokens (invalidated after use)
    - Rate limiting (5-minute cooldown between requests)
    - Server log token delivery (no email required)
    - Username enumeration protection

#### 2. PlaidService (`backend/src/services/plaidService.ts`)
- **Purpose**: Plaid API integration for bank connections
- **Key Methods**:
  - `createLinkToken()`: Initialize Plaid Link flow for new account connection
  - `createUpdateLinkToken()`: Initialize Plaid Link in update mode for re-authentication
  - `exchangePublicToken()`: Convert public to access token
  - `getAccounts()`: Fetch bank account details
  - `getTransactions()`: Fetch transactions with pagination
  - `removeItem()`: Disconnect bank account from Plaid
- **Features**:
  - Automatic pagination for all transactions
  - 730-day history request (bank-limited)
  - Sandbox/development/production environment support
  - **Re-authentication Flow**: When a bank connection expires (status: `requires_reauth`), use `createUpdateLinkToken()` with the existing access token to put Plaid Link in update mode

#### 3. AccountService (`backend/src/services/accountService.ts`)
- **Purpose**: Manage bank account connections and data
- **Key Methods**:
  - `connectAccount()`: Store new bank connection
  - `getUserAccounts()`: Get all user's accounts
  - `syncAccountBalances()`: Update account balances
  - `disconnectAccount()`: Mark account as inactive and remove from Plaid
  - `createUpdateLinkToken()`: Create Plaid Link token for re-authentication
  - `markAccountActive()`: Reset account status to 'active' after successful re-auth
- **Account Status**: Accounts have a `status` field with values:
  - `active`: Normal operating state, syncing works
  - `inactive`: Account has been disconnected
  - `requires_reauth`: Bank connection expired, user needs to sign in again
- **Data Model**: `StoredAccount` interface with encrypted access tokens
- **Security**: AES-256-GCM encryption for Plaid access tokens

#### 4. TransactionService (`backend/src/services/transactionService.ts`)
- **Purpose**: Transaction management and categorization
- **Key Methods**:
  - `syncTransactions()`: Fetch and store new transactions with auto-categorization
  - `getUserTransactions()`: Query with filters (supports categoryIds for filtering)
  - `updateCategory()`: Assign category to transaction
  - `splitTransaction()`: Split into sub-transactions
  - `hasTransactionsForCategory()`: Check if category has any transactions (for deletion protection)
- **Automatic Categorization**:
  - New transactions: Directly assigned Plaid category ID (detailed or primary)
  - Category updates: Preserves user overrides when Plaid changes categories
  - Direct mapping: `transaction.category[1] || transaction.category[0]` → `categoryId`
- **Features**:
  - Integration with AutoCategorizeService for rule-based categorization
  - Zero-mapping Plaid category assignment
  - Transaction tagging and hiding
  - Split transaction support
  - Support for orphaned category ID detection and handling
  - Transaction type filtering (all, income, expense, transfer)

### Trip Itineraries — data model & aggregation points

- **Stops are embedded in the Trip entity** (`shared/types/index.ts`: `Trip.stops: Stop[]`). No separate store — `trips_{familyId}.json` already covers it. Older trips persisted before the feature default to `stops: []` on read (backwards-compat handled in `TripService.loadTrips`).
- **`Stop` is a discriminated union on `type`** (`stay` / `eat` / `play` / `transit`). Each variant carries its own required fields. Zod schemas for CRUD live in `backend/src/validators/stopValidators.ts` — a single `z.discriminatedUnion` so validation is consistent on every write path.
- **No-overlap rule (REQ-014) is enforced in `TripService.createStop` / `updateStop`** via `validateNoStayOverlap` (shared helper). Overlap throws `StayOverlapError extends ConflictError` — the route returns `409` with `errorCode: STAY_OVERLAP` + a `conflictsWith` payload so the UI can surface the conflicting Stay's name.
- **Stay dates are night-based**: `endDate` is the last night slept, not the check-out morning. Two Stays may not share a night. Adjacent stays (A ends night X, B starts night X+1) are allowed.
- **Agenda rendering is derived at render time** from the stop list (`shared/utils/tripHelpers.ts`: `computeAgendaDayRange`, `groupStopsByDay`, `findActiveStay`, `isTransitBaseChange`). Nothing denormalized in storage.
- **Transit classification**: a transit renders as a full-width connector between Stay chapters when it crosses a seam (`isTransitBaseChange` returns true); otherwise it renders inline within a day as a day-trip.
- **Location verification** goes through `frontend/src/hooks/useGooglePlaces.ts` (D7). Gated on `VITE_GOOGLE_PLACES_API_KEY`; without a key, Stay creation shows a clear unconfigured state while Eat / Play / Transit still accept free-text.

### Trip Enhancements V2 — Map tab + photo album link

- **Map tab lives at `frontend/src/components/trips/map/TripMap.tsx`** and renders inside `TripDetail.tsx` as a peer tab to Itinerary / Spending / Notes. Its visibility is keyed on `stops.some(hasVerifiedCoords)` — trips with zero geocoded stops hide the tab entirely (D10), and a `?tab=map` deep-link silently falls back to Itinerary when the trip has no coords.
- **Composition**: `TripMap` = `APIProvider` (from `@vis.gl/react-google-maps`) → `TripMapLoadGuard` (fallback card on load failure) → `TripMapContent` (day filter bar + Map + pin layer + transit layer + popup + unpinned-count footer).
- **Shared helpers with the Itinerary tab**: `computeAgendaDayRange`, `enumerateDateRange`, `hasVerifiedCoords`, `isTransitBaseChange` — the same utilities drive both surfaces so day indexing and base-change classification stay consistent across tabs.
- **Pins** (`StopPin.tsx`): Stays always pinned (V1 REQ-009 guarantees verified coords); Eat/Play pinned only when `location.kind === 'verified'`. Transits are never pinned — their spatial presence is the connector line. Day affinity via color + numeric badge sourced from `mapPalette.ts`.
- **Transit lines** (`TransitLine.tsx`): Base-change transits only (`isTransitBaseChange`, REQ-016/017). Flights render as geodesic arcs (`google.maps.Polyline` with `geodesic: true`) + dashed stroke; ground modes render as straight polylines with solid strokes. Mode icon at midpoint (geodesic uses `geometry.spherical.interpolate(a, b, 0.5)`; straight uses linear midpoint). Direction indicated by `SymbolPath.FORWARD_CLOSED_ARROW`. The `transitFilter` prop is forward-compatible for enabling day-trip transits later without refactor (D5).
- **Interactions**: Pin click → `StopPopup` (InfoWindow) with "View in itinerary" button that appends `?stop=<id>` to the URL and switches to Itinerary. Agenda reads the param, expands the target's day, `scrollIntoView({ block: 'center' })`, pulses a 2 s highlight via Web Animations API, then strips the param. `DayFilterBar` (chips: `All / Day 1 / Day 2 / …`) filters pins and transit segments; base-change transits span two days and render on both (REQ-025). Live trips auto-select today's chip on mount (REQ-026).
- **Lazy loading (REQ-029)**: `TripMap` is only mounted when the Map tab is active (`keepMounted={false}` on `Tabs`), so the Google Maps JS bundle is fetched only when the user opens the tab. No dynamic import is needed because tab visibility already guards the mount.
- **Backend surface**: single additive field `Trip.photoAlbumUrl: string | null`. Zod schema allows http(s) URLs; empty strings coerce to `null` (so we never persist `""`). Legacy trips persisted before V2 default to `null` on read in `TripService.loadTrips`. No map-specific endpoints — the map renders entirely from `getTripSummary` payload.

### Shared Utilities (`shared/utils/`)

#### Transaction Calculations (`shared/utils/transactionCalculations.ts`)
- **Purpose**: Consistent financial calculations that exclude transfer transactions
- **Key Functions**:
  - `calculateIncome(transactions)`: Sum negative amounts excluding transfers
  - `calculateExpenses(transactions)`: Sum positive amounts excluding transfers (includes savings; prefer `calculateSpending` for consumption-only)
  - `calculateSpending(transactions, savingsCategoryIds)`: Sum positive amounts excluding transfers AND savings categories
  - `calculateSavings(transactions, savingsCategoryIds)`: Sum positive amounts in savings categories only
  - `calculateNetCashFlow(transactions)`: Income − Expenses (excluding transfers). NOTE: treats savings as a spending bucket; when savings are split out, compute `income − spending − savings` directly.
  - `categorizeTransactions(transactions)`: Separate into income, expenses, transfers
- **Transfer Exclusion**: All calculations automatically exclude `TRANSFER_IN` and `TRANSFER_OUT` categories and their subcategories
- **Usage Pattern**: Always use these utilities instead of manual `filter + reduce` to ensure consistency

```typescript
// Don't do this (doesn't exclude transfers):
const income = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);

// Do this instead (automatically excludes transfers):
import { calculateIncome } from 'shared/utils/transactionCalculations';
const income = calculateIncome(transactions);
```

#### Category Helpers (`shared/utils/categoryHelpers.ts`)
- **Purpose**: Category type detection and validation
- **Key Functions**:
  - `isTransferCategory(categoryId)`: Detects transfer categories and subcategories
  - `isIncomeCategory(categoryId)`: Detects income categories
  - `isBudgetableCategory(categoryId)`: Excludes transfers from budgeting
  - `getBudgetType(categoryId)`: Returns 'income' or 'expense' for budget logic
- **Pattern**: Uses `startsWith()` for subcategory detection (e.g., `TRANSFER_IN_DEPOSIT`)

#### 5. CategoryService (`backend/src/services/categoryService.ts`)
- **Purpose**: Two-level category hierarchy management with Plaid PFC integration
- **Key Methods**:
  - `initializeDefaultCategories()`: Creates 121 categories (120 Plaid + 1 custom)
  - `createCategory()`: Add custom category with SNAKE_CASE ID generation
  - `getCategoryTree()`: Get hierarchical structure
  - `deleteCategory()`: Remove category with referential integrity checks
  - `importFromCSV()`: Bulk import categories from CSV with auto-parent creation
- **Category ID Pattern**:
  - Plaid categories: Direct SNAKE_CASE IDs (e.g., `FOOD_AND_DRINK_COFFEE`)
  - Custom categories: `CUSTOM_` prefix (e.g., `CUSTOM_WINE_BUDGET`)
  - Collision handling: Appends numbers (e.g., `CUSTOM_WINE_BUDGET_2`)
- **Plaid Integration**: 
  - 16 primary categories (e.g., INCOME, FOOD_AND_DRINK)
  - 104 subcategories with descriptions
  - Direct ID mapping - no translation needed
- **Deletion Protection**: Categories cannot be deleted if they have:
  - Subcategories
  - Active budgets (checked via `BudgetService.hasBudgetsForCategory()`)
  - Auto-categorization rules (checked via `AutoCategorizeService.hasRulesForCategory()`)
  - Associated transactions (checked via `TransactionService.hasTransactionsForCategory()`)
- **Data Model**: Categories include `isCustom` flag and optional `description`
- **Data Isolation**: All categories are user-specific (no global categories)

#### 6. ReportService (`backend/src/services/reportService.ts`)
- **Purpose**: Financial reporting and analytics
- **Key Methods**:
  - `getCategoryBreakdown()`: Expense category breakdown with hierarchy
  - `getIncomeCategoryBreakdown()`: Income category breakdown (negative amounts)
  - `getSpendingTrends()`: Category spending over time
  - `getCashFlowSummary()`: Income vs expenses by month
  - `generateProjections()`: Future cash flow predictions
  - `getYearToDateSummary()`: YTD financial summary
- **Income vs Expense Filtering**:
  - **Plaid Amount Convention**: 
    - Expenses: `amount > 0` (positive values represent money going out)
    - Income: `amount < 0` (negative values represent money coming in)
    - This convention is used consistently throughout the application
  - Both methods support hierarchical category grouping
  - Uses `isIncomeCategory()` and `isExpenseCategory()` helpers from shared utilities
- **Features**: Excludes hidden categories from reports, supports date ranges

#### 7. BudgetService (`backend/src/services/budgetService.ts`)
- **Purpose**: Monthly and yearly budget management (expense categories only)
- **Key Methods**:
  - `setBudget()`: Set monthly budget for category
  - `copyBudgets()`: Copy from previous month
  - `getBudgetComparison()`: Budget vs actual spending
  - `getBudgetVsActual()`: Returns `null` for income categories (excluded from budget tracking)
  - `hasBudgetsForCategory()`: Check if category has any budgets (for deletion protection)
  - `getYearlyBudgets(year, userId)`: Get all budgets for a specific year
  - `batchUpdateBudgets(updates[], userId)`: Efficiently update multiple budgets at once
- **Yearly Budget Operations**:
  - Year validation: 2020 to current year + 5 years
  - Batch updates support zero amounts (deletes budget if amount is 0)
  - Single query optimization for yearly data retrieval
  - Automatic sorting by month for consistent display
- **Batch Update Pattern**:
  - Validates all updates before processing any
  - Processes updates sequentially to maintain data consistency
  - Supports delete operations via zero amounts
  - Returns only created/updated budgets (excludes deletions)
- **Income Category Exclusion**:
  - Income categories (starting with "INCOME") are excluded from budget comparisons
  - `getBudgetVsActual()` returns `null` for income categories instead of comparison data
  - `getMonthlyBudgetVsActual()` skips income categories in loops
  - Rationale: Income doesn't follow expense budgeting logic - you don't "budget" income amounts
- **Data Model**: `MonthlyBudget` with YYYY-MM format
- **Shared Utilities**: Uses `isIncomeCategory()` from `shared/utils/categoryHelpers.ts`

#### 8. AutoCategorizeService (`backend/src/services/autoCategorizeService.ts`)
- **Purpose**: Automated transaction categorization with user-defined rules
- **Key Methods**:
  - `getRules()`: Fetch user's auto-categorization rules
  - `createRule()`: Create new rule with multiple patterns (OR logic)
  - `updateRule()`: Modify existing rules including patterns
  - `deleteRule()`: Remove rule and re-number priorities
  - `reorderRules()`: Bulk reorder rules by priority
  - `moveRuleUp()`: Move single rule up in priority
  - `moveRuleDown()`: Move single rule down in priority
  - `applyRules()`: Apply rules to transactions with pattern matching
  - `previewCategorization()`: Show what would be categorized without applying
  - `applyRulesToAllTransactions()`: Apply rules to all user transactions
  - `hasRulesForCategory()`: Check if category is used in any rules (for deletion protection)
- **Features**:
  - Multiple patterns per rule (up to 5, OR logic)
  - Rule priority system (lower number = higher priority)
  - Re-categorization with orphaned category ID handling
  - Plaid category name fallback matching
  - Preview before applying changes
  - Force recategorization option
- **Data Model**: `StoredAutoCategorizeRule` with patterns array and migration support

#### 9. ImportService (`backend/src/services/importService.ts`)
- **Purpose**: Unified CSV import processing for all import types
- **Key Methods**:
  - `importCSV()`: Main entry point for all CSV imports by type
  - `getJobStatus()`: Check import job status (preparation for async)
  - `getParserInfo()`: Get sample CSV and format info for import type
- **Import Types**:
  - `categories`: Full implementation with auto-parent creation
  - `transactions`: Parser ready, business logic pending implementation
  - `mappings`: Parser ready, business logic pending implementation
- **Architecture**:
  - Job tracking for future async processing migration
  - Extensible parser system (BaseCSVParser → Type-specific parsers)
  - Batch processing support for large files
  - Comprehensive error handling with row-level validation
- **Parser Hierarchy**:
  - `BaseCSVParser<T>`: Abstract base with common CSV parsing logic
  - `CategoryCSVParser`: Handles category import with parent auto-creation
  - `TransactionCSVParser`: Ready for bank transaction imports (multiple formats)
  - `MappingCSVParser`: Ready for auto-categorization mapping imports
- **Future-Ready Design**:
  - Structured for S3 upload + Lambda processing migration
  - Job-based tracking even for synchronous imports
  - Configurable batch sizes and validation options

#### 10. DataService (`backend/src/services/dataService.ts`)
- **Purpose**: Unified data persistence layer with storage adapters
- **Features**:
  - User-scoped data isolation (all data keyed by userId)
  - Storage adapter pattern (filesystem for dev, S3 for production)
  - Atomic writes with temp files
  - Automatic directory creation
- **Important**: Categories require userId parameter (no global categories)

## Shared Utilities

### CSV Import Framework (`backend/src/utils/csvImport/`)
- **Purpose**: Extensible framework for parsing and validating CSV files for multiple import types
- **Architecture**:
  - `BaseCSVParser<T>`: Abstract base class with common parsing logic
  - Type-specific parsers extending base (CategoryCSVParser, TransactionCSVParser, etc.)
  - `ImportService`: Unified service coordinating all import operations
- **Key Features**:
  - Configurable column mappings and transformations
  - Row-level validation with detailed error reporting
  - Support for different CSV formats (delimiter, quotes, encoding)
  - Batch processing for large files
  - Job tracking preparation for async processing
- **Legacy**: `csvParser.ts` - Original category parser (still functional, but superseded)

### Category Helper Functions (`shared/utils/categoryHelpers.ts`)
- **Purpose**: Centralized logic for category type identification and classification
- **Shared Between**: Frontend and backend for consistent category handling
- **Key Functions**:
  - `isIncomeCategory(categoryId: string): boolean`
    - Returns `true` for categories starting with "INCOME"
    - Used to exclude income from expense budgeting and reporting
  - `isTransferCategory(categoryId: string): boolean` 
    - Returns `true` for TRANSFER_IN and TRANSFER_OUT categories
    - Used to exclude transfers from most financial reports
  - `isExpenseCategory(categoryId: string): boolean`
    - Returns `true` for categories that should be included in expense budgeting
    - Excludes income and transfer categories
    - Primary filter for budget forms and expense calculations
- **Usage Pattern**: Import and use these helpers instead of duplicating category type logic
- **Plaid Convention**: Leverages Plaid's category ID structure for automatic classification

### Budget Calculation Utilities (`shared/utils/budgetCalculations.ts`)
- **Purpose**: Centralized budget calculation utilities to eliminate code duplication and ensure consistency
- **Critical Problem Solved**: Addresses architectural debt from 6+ instances of duplicate hidden category logic across components
- **Shared Between**: Frontend and backend for consistent budget calculations
- **Key Functions**:
  - `getHiddenCategoryIds(categories)`: Identifies categories that are hidden or have hidden parents
  - `getChildCategoryIds(categories)`: Returns set of all child category IDs
  - `getParentCategoryIds(categories)`: Returns set of all parent category IDs
  - `calculateBudgetTotals(budgets, categories, options)`: Calculate income/expense/transfer budget totals
  - `calculateActualTotals(transactions, categories, options)`: Calculate actual totals from transactions
  - `createActualsMap(transactions, categories, options)`: Create category-to-amount mapping
  - `calculateBudgetVsActual(budgetTotals, actualTotals)`: Compare budgets vs actuals with variance
- **Filtering Options**: `excludeHidden`, `excludeChildren`, `excludeTransfers`
- **Usage Pattern**: Always use these utilities instead of duplicate filtering logic

```typescript
// ❌ Don't do this (duplicates hidden category logic):
const hiddenCategoryIds = new Set<string>();
categories.forEach(cat => {
  if (cat.isHidden) {
    hiddenCategoryIds.add(cat.id);
  } else if (cat.parentId) {
    const parent = categories.find(p => p.id === cat.parentId);
    if (parent?.isHidden) {
      hiddenCategoryIds.add(cat.id);
    }
  }
});

// ✅ Use the shared utility:
const hiddenCategoryIds = getHiddenCategoryIds(categories);

// ✅ For budget totals with proper filtering:
const budgetTotals = calculateBudgetTotals(budgets, categories, { excludeHidden: true });
const actualTotals = calculateActualTotals(transactions, categories, { excludeHidden: true });
```

- **Components Using**: Budgets.tsx, BudgetComparison.tsx, BudgetDebugger.tsx, backend budgets.ts
- **Test Coverage**: Comprehensive unit tests with 37 test cases covering edge cases and options

## Frontend Architecture

### Key Components

#### Pages (`frontend/src/pages/`)
- **MantineDashboard**: Main dashboard with stats cards
- **MantineAccounts**: Account management with Plaid Link
- **EnhancedTransactions**: Transaction list with filtering and inline category editing
- **Categories**: Category hierarchy management with auto-categorization rules
- **Budgets**: Monthly and yearly budget interface with expense category filtering
  - Budget forms filter categories to only show expense categories (excludes income)
  - Actual spending calculations exclude income transactions from budget comparisons
  - Uses `isExpenseCategory()` helper for consistent filtering
  - **Yearly View**: Grid interface with inline editing and auto-save functionality
- **Reports**: Financial analysis with:
  - Income/expense toggle for category breakdowns
  - Interactive drill-down pie charts
  - Top income sources and spending categories
  - Transaction previews with navigation to filtered views
  - Income-specific green color palette

#### API Client (`frontend/src/lib/api.ts`)
- Axios-based HTTP client (facade that composes domain modules)
- Domain logic split into separate modules under `frontend/src/lib/api/` (e.g., `transactions.ts`, `budgets.ts`, `reports.ts`)
- Automatic JWT token injection
- Response interceptors for auth handling
- Method binding for proper context
- When adding new API methods, add them to the relevant domain module under `frontend/src/lib/api/` and re-export from `api.ts`

#### State Management (`frontend/src/stores/`)
- **authStore**: User authentication state
- Uses Zustand for global state
- Persists JWT in localStorage

#### Plaid Integration (`frontend/src/components/PlaidButton.tsx`)
- React Plaid Link wrapper
- Conditional rendering to prevent errors
- Handles token exchange flow

#### Auto-Categorization (`frontend/src/components/categories/AutoCategorization.tsx`)
- Complete auto-categorization rule management interface
- Multiple pattern support (up to 5 patterns per rule with OR logic)
- Rule priority management with drag-and-drop reordering
- Preview and apply categorization with confirmation dialogs
- Re-categorization option with orphaned category ID handling

### CSV Import (`frontend/src/components/categories/CSVImport.tsx`)
- Generic CSV import interface for category bulk operations
- File upload and direct text paste support
- Real-time validation with error display
- Sample CSV format display with examples
- Uses ImportService framework for processing

#### Transaction Components (`frontend/src/components/transactions/`)
- **TransactionPreviewModal**: Modal showing first 25 transactions for a category
- **TransactionPreviewTrigger**: Wrapper component making any content clickable for transaction preview
- **Features**: Navigation to transactions page with filters applied
- **Integration**: Used throughout Reports page for category breakdown exploration

#### Budget Components (`frontend/src/components/budgets/`)
- **YearlyBudgetGrid**: Advanced grid component for yearly budget management
- **Debounced Auto-save Pattern**:
  ```typescript
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, CreateBudgetDto>>(new Map());
  const [debouncedUpdates] = useDebouncedValue(pendingUpdates, 1000);

  // Process debounced updates with batch API call
  useMemo(() => {
    if (debouncedUpdates.size > 0) {
      const updates = Array.from(debouncedUpdates.values());
      batchUpdateMutation.mutate(updates);
    }
  }, [debouncedUpdates, batchUpdateMutation]);
  ```
- **Key Features**: Inline editing, sticky headers, visual feedback for pending updates, hierarchical category display
- **Performance**: Batch API calls, optimistic updates, efficient re-rendering

## Critical Data Flow Patterns

### 1. Account Connection Flow
```
User clicks "Connect Account"
→ Frontend requests link token from backend
→ Backend creates Plaid Link token
→ User completes Plaid Link flow
→ Frontend receives public token
→ Backend exchanges for access token
→ Backend stores encrypted token and account data
→ Initial transaction sync runs automatically
```

### 2. Transaction Sync Flow
```
User/System triggers sync
→ Backend fetches all transactions from Plaid (paginated)
→ Transactions matched by plaidTransactionId
→ New transactions added, existing updated
→ Auto-categorization applied
→ Frontend refreshes via React Query
```

### 3. Budget Calculation Flow
```
Frontend requests budget comparison
→ Backend fetches budgets for month
→ Backend calculates actual spending from transactions
→ Comparison returned with variance
→ Dashboard updates progress indicators
```

### 4. Auto-Categorization Flow
```
User creates/edits rules with multiple patterns
→ Rules stored with priority ordering
→ User triggers categorization (preview or apply)
→ Backend fetches uncategorized transactions (or all if force recategorize)
→ Each transaction matched against rule patterns (OR logic)
→ First matching rule assigns category and description
→ Fallback to Plaid category name matching if no rules match
→ Results returned with counts of categorized/recategorized transactions
```

### 5. Transaction Preview Flow
```
User clicks category in reports
→ TransactionPreviewTrigger opens modal
→ Modal fetches first 25 transactions for category/date range
→ Displays transaction list with total count and amount
→ "View All" button navigates to transactions page with filters applied
→ URL parameters preserve category and date filters
```

## Current Implementation Status

### ✅ Completed Features
- JWT authentication with rate limiting
- Plaid account connection and sync
- Transaction management with categorization
- Auto-categorization rules with multiple patterns (OR logic)
- Rule priority management and reordering
- Re-categorization with orphaned category ID handling
- Transaction preview modal with navigation to filtered transactions page
- Interactive drill-down pie charts in reports
- Income category dashboards with toggle between income/expense views
- Two-level category hierarchy (all user-specific)
- Monthly budget tracking
- Dashboard with stats and alerts
- Enhanced reports with updated date range options (This Month, This Year, etc.)
- Responsive UI with dark theme
- Inline transaction category editing
- Account re-authentication via Plaid Link update mode
- Visual indicators for accounts needing sign-in (badge, dashboard alert)
- Per-account transaction sync (vs sync all)

### ⚠️ Known Issues
1. **No Account Removal UI**: Backend has `disconnectAccount()` method but frontend lacks UI
2. **No Transaction Edit History**: Changes aren't tracked
4. **Single User Testing**: Multi-user scenarios not fully tested

### 🚧 In Progress
- Account disconnection UI implementation
- Enhanced reporting features
- Transaction recurring detection

## Security Considerations

### Implemented Security
- **Encryption**: AES-256-GCM for Plaid tokens
- **Authentication**: JWT with expiration
- **Rate Limiting**: Login attempt protection
- **Input Validation**: Zod schemas on endpoints
- **CORS**: Configured for localhost only

### Security Gaps
- No MFA implementation
- No audit logging
- Session tokens don't rotate
- No data backup strategy

## Development Patterns

### TypeScript Strict Mode
- **No `any` types allowed**
- All functions fully typed
- Strict null checks enabled
- Discriminated unions for complex state

### Error Handling Pattern
```typescript
type Result<T> = 
  | { success: true; data: T }
  | { success: false; error: string };
```

### Service Singleton Pattern
```typescript
const dataService = new DataService();
const plaidService = new PlaidService();
const authService = new AuthService(dataService);
// Ensures consistent state across app
```

### Circular Dependency Resolution
When services need to reference each other (e.g., CategoryService needs AutoCategorizeService for deletion protection), use a narrow interface:
```typescript
// Define a narrow interface so CategoryService doesn't depend on the full concrete type
interface CategoryDependencyChecker {
  hasRulesForCategory(categoryId: string, userId: string): Promise<boolean>;
}

// Pass the checker interface during construction — no `as any` casts needed
const categoryService = new CategoryService(dataService, budgetService, transactionService, autoCategorizeService);
```
This pattern is wired in `services/index.ts`, which owns the full dependency graph.

## Quick Modification Guide

<!-- TASK: Add new API endpoint -->
<!-- PATTERN: API development -->
### To Add a New API Endpoint
1. Create route handler in `backend/src/routes/`
2. Add business logic to relevant service
3. Add API method to the relevant domain module in `frontend/src/lib/api/` and re-export from `frontend/src/lib/api.ts`
4. Add types to `shared/types/`

#### Example: CSV Import Endpoint
- **Route**: `POST /api/v1/categories/import-csv` in `backend/src/routes/categories.ts`
- **Service Method**: `CategoryService.importFromCSV(csvContent, userId)` (delegates to ImportService)
- **Import Framework**: Uses `backend/src/utils/csvImport/` for parsing and validation
- **Frontend Component**: `CSVImport.tsx` with file upload and text paste support
- **API Client**: `importCategoriesFromCSV()` method in `frontend/src/lib/api.ts`

#### Example: Password Reset Endpoints
- **Routes**: `POST /api/v1/auth/request-reset` and `POST /api/v1/auth/reset-password` in `backend/src/routes/authRoutes.ts`
- **Service Methods**: `AuthService.requestPasswordReset()` and `AuthService.resetPassword()`
- **Frontend Components**: `ResetRequestForm.tsx` and `ResetPasswordForm.tsx` in `frontend/src/components/auth/`
- **API Client**: `requestPasswordReset()` and `resetPassword()` methods in `frontend/src/lib/api.ts`
- **Security Features**: Rate limiting, token expiration, server log token delivery
- **User Flow**: Request token → Check server logs → Reset password with token

#### Example: Yearly Budget Endpoints
- **Routes**: `GET /api/v1/budgets/year/:year` and `POST /api/v1/budgets/batch` in `backend/src/routes/budgets.ts`
- **Service Methods**: `BudgetService.getYearlyBudgets(year, userId)` and `BudgetService.batchUpdateBudgets(updates[], userId)`
- **Frontend Component**: `YearlyBudgetGrid.tsx` with inline editing and auto-save
- **API Client**: `getYearlyBudgets(year)` and `batchUpdateBudgets(updates[])` methods in `frontend/src/lib/api.ts`
- **Key Features**: Year validation, batch processing, debounced auto-save, zero-amount deletion
- **User Flow**: Select year → View/edit grid → Auto-save changes → Batch API calls

### To Add a New CSV Import Type
1. **Create Type-Specific Parser**: Extend `BaseCSVParser<T>` in `backend/src/utils/csvImport/`
   ```typescript
   export class YourCSVParser extends BaseCSVParser<ParsedYourType> {
     protected initializeColumnMappings(): void {
       // Define column mappings with validation and transformations
     }
     protected validateRow(row: Record<string, string>, rowNumber: number): ParsedYourType | ParseError {
       // Row-level validation logic
     }
   }
   ```
2. **Add Import Type**: Update `ImportType` union in `backend/src/utils/csvImport/types.ts`
3. **Implement Business Logic**: Add case to ImportService.importCSV() switch statement
4. **Add Route**: Create endpoint in appropriate route file using ImportService
5. **Frontend Integration**: Create UI component and API client method
6. **Add Sample Data**: Implement `getSampleCSV()` and `getFormatDescription()` static methods

<!-- TASK: Add new React page -->
<!-- PATTERN: Frontend development -->
### To Add a New Page
1. Create component in `frontend/src/pages/`
2. Add route in `frontend/src/App.tsx`
3. Update navigation in `frontend/src/components/Navigation.tsx`
4. Add API methods if needed

### To Add a New Chat Action

The action-card mechanism requires exactly three touches: a backend handler, a shared type extension, and a frontend form. Adding an action outside this pattern breaks the three-touch extensibility guarantee in the BRD success criteria.

**Step 1 — Backend handler (`backend/src/services/chatActions/`)**

Create `backend/src/services/chatActions/{newAction}Action.ts`:

```typescript
import { registerChatAction } from './registry';
import { taskService } from '../index'; // or whatever service the action needs
import { z } from 'zod';
import type { ActionResource } from '../../shared/types';

// Export the schema so it can be re-used as a source of truth
export const createBudgetEntrySchema = z.object({
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().positive(),
});

type CreateBudgetEntryParams = z.infer<typeof createBudgetEntrySchema>;

registerChatAction<CreateBudgetEntryParams>({
  actionId: 'create_budget_entry',
  label: 'Set a budget',
  paramsSchema: createBudgetEntrySchema,
  async execute(params, ctx): Promise<ActionResource> {
    const entry = await budgetService.setBudget(
      params.categoryId, params.month, params.amount, ctx.userId,
    );
    return {
      type: 'task',           // extend ActionResource.type for new resource types
      id: entry.id,
      url: `/budgets?month=${params.month}`,
      label: `Budget set: ${params.amount} for ${params.month}`,
    };
  },
});
```

Then add an import in `backend/src/services/chatActions/index.ts`:

```typescript
import './createBudgetEntryAction'; // registers via side-effect
```

**Step 2 — Shared type (`shared/types/index.ts`)**

Extend `ChatActionId`:

```typescript
// Before
export type ChatActionId = 'create_task';

// After
export type ChatActionId = 'create_task' | 'create_budget_entry';
```

Also add the `actionId` value to the `propose_action` tool definition in `backend/src/services/chatbotPrompt.ts` so Claude knows it's available.

**Step 3 — Frontend form (`frontend/src/components/chat/action-forms/`)**

Create `frontend/src/components/chat/action-forms/BudgetEntryActionCardEditForm.tsx`. The component receives `proposal: ActionProposal` and `onSubmit: (params: Record<string, unknown>) => void`. Match the shape of `TaskActionCardEditForm.tsx`.

Then register it in `frontend/src/components/chat/action-forms/index.ts`:

```typescript
const FORM_REGISTRY: Record<ChatActionId, FC<ActionFormProps>> = {
  create_task: TaskActionCardEditForm,
  create_budget_entry: BudgetEntryActionCardEditForm, // add this
};
```

**Security invariants that must hold for any new action:**

- Handler receives `ctx: ChatActionHandlerContext` containing `userId` and `familyId` from the JWT. It must never accept identity from `params`.
- Zod schema must be the single source of truth — the same export used by both the HTTP route (if one exists) and the action handler.
- Handler must invoke an existing authenticated service method, not a privileged bypass.

**Example: fully-worked `create_budget_entry`**

Using the code above, the full flow for adding a budget action would be:
1. `createBudgetEntryAction.ts` — registers with `create_budget_entry` actionId and the Zod schema above.
2. `shared/types/index.ts` — adds `'create_budget_entry'` to `ChatActionId` union.
3. `BudgetEntryActionCardEditForm.tsx` — inline form with categoryId selector, month picker, and amount field.
4. `action-forms/index.ts` — adds the form to `FORM_REGISTRY`.
5. `chatbotPrompt.ts` — adds `'create_budget_entry'` to the `propose_action` tool's `actionId` enum.

No changes to the confirmation endpoint, proposal store, or audit logging — those are action-agnostic.

### To Modify Data Models
1. Update interface in relevant service
2. Update shared types if exposed to frontend
3. Consider migration for existing data
4. Update tests if critical path

### To Implement Budget Calculations
1. **Always use shared utilities** from `shared/utils/budgetCalculations.ts`
2. **Never duplicate filtering logic** - especially for hidden categories
3. **Key functions to use**:
   - `getHiddenCategoryIds(categories)` - for hidden category filtering
   - `calculateBudgetTotals(budgets, categories, options)` - for budget aggregation
   - `calculateActualTotals(transactions, categories, options)` - for transaction totals
4. **Common options**: `{ excludeHidden: true, excludeChildren: false, excludeTransfers: true }`
5. **Add tests** if creating new calculation patterns

## Testing Strategy

### Current Test Coverage
- **Auth Service**: 29 tests (comprehensive)
- **Plaid Service**: 18 tests (integration with sandbox)
- **Transaction Sync**: Pagination and history tests
- **Budget Calculations**: Basic validation

### Test Execution
```bash
# Run all backend tests
cd backend && npm test

# Run specific service tests
npm test -- authService

# Run with coverage
npm run test:coverage
```

## Environment Configuration

### Required Environment Variables
```bash
# Backend (.env)
NODE_ENV=development
PORT=3001
PLAID_CLIENT_ID=xxx
PLAID_SECRET=xxx
PLAID_ENV=sandbox
JWT_SECRET=xxx
JWT_EXPIRES_IN=7d
DATA_DIR=./data
ENCRYPTION_KEY=xxx (32 bytes hex)
```

### Frontend Configuration
- API URL hardcoded to `http://localhost:3001`
- Plaid Link configured in `PlaidButton` component

<!-- TROUBLESHOOT: Common problems -->
<!-- PATTERN: Debugging -->
## Data Models

### Category Interface
```typescript
interface Category {
  id: string;                   // SNAKE_CASE ID (e.g., "FOOD_AND_DRINK_COFFEE" or "CUSTOM_WINE_BUDGET")
  name: string;                 // Human readable name (e.g., "Coffee" or "Wine Budget")
  parentId: string | null;      // Parent category ID (SNAKE_CASE)
  description?: string;         // Description from Plaid taxonomy or user-provided
  isCustom: boolean;           // true for user-created categories
  isHidden: boolean;           // Hidden from budgets/reports
  isRollover: boolean;         // Rollover category for budget carryover
}
```

### CSV Import Framework Types
```typescript
// Base types for CSV import system
interface ImportJob {
  id: string;
  userId: string;
  type: ImportType;             // 'categories' | 'transactions' | 'mappings'
  status: ImportStatus;         // 'pending' | 'processing' | 'completed' | 'failed'
  progress: number;
  totalRows: number;
  processedRows: number;
  errors: ParseError[];
  result?: ImportResult;
}

interface ImportResult {
  success: boolean;
  message: string;
  imported?: number;
  skipped?: number;
  errors?: string[];
}

// Type-specific parsed data
interface ParsedCategory {
  parent: string | null;
  name: string;
  isHidden: boolean;
  isRollover: boolean;
  description?: string;
}

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  category?: string;
  accountName?: string;
}

interface ParsedMapping {
  sourcePattern: string;
  targetCategory: string;
  matchType: 'exact' | 'contains' | 'regex';
  priority?: number;
}
```

### Category ID Examples
- **Plaid Primary**: `INCOME`, `FOOD_AND_DRINK`, `TRANSPORTATION`
- **Plaid Detailed**: `INCOME_WAGES`, `FOOD_AND_DRINK_COFFEE`, `TRANSPORTATION_GAS`
- **Custom Categories**: `CUSTOM_WINE_BUDGET`, `CUSTOM_DATE_NIGHTS`, `CUSTOM_EMERGENCY_FUND`
- **Collision Handling**: `CUSTOM_ROLLOVER`, `CUSTOM_ROLLOVER_2`, `CUSTOM_ROLLOVER_3`

## Common Troubleshooting

<!-- TROUBLESHOOT: API client errors -->
### Issue: "Cannot read properties of undefined"
**Cause**: API client methods not bound properly in constructor
**Solution**: Ensure all methods are bound in the API client constructor

**Details**: When adding new methods to the API client (`frontend/src/lib/api.ts`), they must be explicitly bound in the constructor to preserve the correct `this` context when passed as callbacks:

```typescript
constructor() {
  // ... existing bindings
  
  // Budget methods - ALL must be bound!
  this.getBudgets = this.getBudgets.bind(this);
  this.getAvailableBudgetMonths = this.getAvailableBudgetMonths.bind(this);
  this.getMonthlyBudgets = this.getMonthlyBudgets.bind(this);
  this.setBudget = this.setBudget.bind(this);
  this.deleteBudget = this.deleteBudget.bind(this);
  this.copyBudgets = this.copyBudgets.bind(this);
  // ... etc
}
```

**Common Symptom**: Methods work when called directly but fail when used in React Query or as event handlers, showing "No data available" or similar errors even when data exists.

### Issue: Plaid Link duplicate script warning
**Cause**: Multiple component mounts
**Solution**: Use conditional rendering with link token

### Issue: Transactions not syncing
**Check**:
1. Account status is 'active'
2. Plaid access token is valid
3. Date range is within bank limits

### Issue: Categories not initializing
**Solution**: Call `/api/v1/categories/initialize` endpoint

### Issue: Initial sync returns 0 transactions
**Cause**: Plaid needs 10-60 seconds to prepare transaction data after token exchange
**Solution**: Wait before syncing, or sync manually later

### Issue: Syncing one account removes transactions from other accounts
**Cause**: Transaction removal logic checking all transactions instead of just synced accounts
**Solution**: Only check transactions from accounts being synced:
```typescript
const syncedAccountIds = new Set(accounts.map(a => a.id));
if (syncedAccountIds.has(existing.accountId)) { /* check for removal */ }
```

### Issue: Transaction page laggy with 800+ transactions
**Cause**: Rendering all rows at once causes performance issues
**Solution**: Implement pagination (50 transactions per page recommended)

### Issue: TypeScript build creates nested dist structure
**Cause**: Importing files from outside rootDir (e.g., shared/types)
**Solution**: Remove explicit rootDir and use postbuild script to flatten dist structure

### Issue: Auto-categorization rules not applying to transactions
**Check**:
1. Rules are active (`isActive: true`)
2. Rule patterns match transaction descriptions (case-insensitive)
3. Categories referenced by rules still exist (not orphaned IDs)
4. Rule priority order is correct
**Solution**: Use preview functionality to debug rule matching

### Issue: JWT token storage conflict causing 401 errors appearing as 503
**Cause**: Duplicate token storage between Zustand persistence and direct localStorage access
**Symptoms**:
- 503 Service Unavailable errors in browser console for authenticated endpoints
- Actual server responses are 401 Unauthorized
- Works immediately after login but fails after page refresh
- API interceptor can't find token despite successful login

**Diagnosis**:
1. Check browser DevTools → Application → localStorage
2. Look for both `auth-storage` (JSON) and `token` (string) keys
3. Verify API interceptor token retrieval logic
4. Check if Zustand store rehydration is working

**Solution**: Ensure single source of truth for token storage
- API interceptor should read from Zustand's persisted storage
- Remove duplicate localStorage.setItem calls from auth actions
- Clean up both storage keys on logout/401 errors
```typescript
// API interceptor should read from Zustand storage
const authStorage = localStorage.getItem('auth-storage');
const token = authStorage ? JSON.parse(authStorage).state?.token : null;
```

### Issue: Transactions show as "uncategorized" but can't be categorized
**Cause**: Transactions have orphaned category IDs (e.g., old `plaid_*` IDs)
**Solution**: Use "Recategorize all transactions" option to fix orphaned categories

### Issue: Transaction preview modal shows no results
**Check**:
1. Date range includes transactions for the category
2. Category ID is valid and matches existing transactions
3. Transactions aren't hidden from the query
**Solution**: Verify category and date range parameters in network tab

## Next Steps for Development

### High Priority
1. **Account Removal UI**: Add disconnect button to account cards
2. **Error Recovery**: Handle Plaid re-authentication flow
3. **Data Backup**: Implement S3 or database storage

### Medium Priority
1. **Recurring Transactions**: Detect and mark recurring
2. **Budget Rollover**: Implement rollover category functionality
3. **Advanced Reports**: Charts and visualizations

### Low Priority
1. **Mobile App**: React Native implementation
2. **Multi-Currency**: Support non-USD accounts
3. **Bill Reminders**: Notification system

## Key Files for Common Tasks

### Account Management
- Backend: `backend/src/services/accountService.ts`
- Routes: `backend/src/routes/accounts.ts`
- Frontend: `frontend/src/pages/MantineAccounts.tsx`

#### Re-authentication Flow
When a bank connection expires (Plaid returns `ITEM_LOGIN_REQUIRED` error), accounts are marked with `status: 'requires_reauth'`. The re-authentication flow:

1. **Frontend Detection**: MantineAccounts.tsx shows "Sign-in Required" badge and menu option
2. **Create Update Token**: `POST /api/v1/accounts/:accountId/link-token` creates Plaid Link token in update mode
3. **User Re-authenticates**: PlaidLinkProvider opens Plaid Link with update token
4. **Complete Re-auth**: `POST /api/v1/accounts/:accountId/reauth-complete` marks account as active
5. **Sync Resumes**: Normal transaction syncing works again

Key files:
- `frontend/src/contexts/PlaidLinkContext.ts`: Defines `openPlaidUpdate(accountId)` method
- `frontend/src/providers/PlaidLinkProvider.tsx`: Implements update mode flow
- `backend/src/routes/accounts.ts`: `/link-token` and `/reauth-complete` endpoints

### Transaction Management
- Backend: `backend/src/services/transactionService.ts`
- Routes: `backend/src/routes/transactions.ts`
- Frontend: `frontend/src/pages/EnhancedTransactions.tsx`

### Budget Management
- Backend: `backend/src/services/budgetService.ts`
- Routes: `backend/src/routes/budgets.ts`
- Frontend: `frontend/src/pages/Budgets.tsx`

### Authentication
- Backend: `backend/src/services/authService.ts`
- Middleware: `backend/src/middleware/authMiddleware.ts`
- Frontend: `frontend/src/stores/authStore.ts`

#### Authentication Flows

**Standard Login Flow**:
1. User submits username/password
2. AuthService validates credentials and generates JWT
3. Frontend stores token and navigates to dashboard

**Password Reset Flow** (Single-user optimized):
1. User requests reset via `/request-reset` 
2. AuthService generates secure token and logs to server
3. User SSH access server to retrieve token from PM2 logs
4. User submits token + new password via `/reset-password`
5. AuthService validates token and updates password
6. Token is invalidated after successful use

**Security Measures**:
- Rate limiting on auth endpoints (rateLimitAuth middleware)
- Account lockout after 5 failed attempts (15-minute lockout)
- JWT expiration (7 days default)
- Password strength validation (15+ characters)
- Reset token expiration (15 minutes)
- Single-use reset tokens
- Username enumeration protection

### Auto-Categorization
- Backend Service: `backend/src/services/autoCategorizeService.ts`
- Routes: `backend/src/routes/autoCategorize.ts`
- Frontend UI: `frontend/src/components/categories/AutoCategorization.tsx`

### Admin Panel
- Backend Routes: `backend/src/routes/admin.ts`
- Frontend Page: `frontend/src/pages/Admin.tsx`
- Features:
  - Data migration utilities (e.g., field renaming)
  - System status monitoring
  - Batch operations for data maintenance
- Migration Pattern: Direct dataService access with object destructuring for field removal

### Transaction Preview
- Frontend Components: `frontend/src/components/transactions/`
- Modal: `TransactionPreviewModal.tsx`
- Trigger: `TransactionPreviewTrigger.tsx`

### Application Metadata
- Health Endpoint: `GET /health` - Returns status, timestamp, environment, and version
- Version Endpoint: `GET /version` - Returns current version, unreleased changes, deployment info
- Version Source: `package.json` version field (synced across all packages)

## Final Notes

This application follows a pragmatic approach:
- Features are built quickly, then stabilized with tests
- Core services have comprehensive unit test coverage (244+ tests added in Q2 2026 refactor)
- Integration tests validate complete user workflows
- TypeScript strict mode catches type errors at compile time
- Frontend structural changes verified via `tsc --noEmit` + production build

The codebase prioritizes:
1. **Type Safety**: No runtime type errors
2. **Security**: Financial data protection
3. **User Experience**: Professional UI
4. **Maintainability**: Clear service boundaries

When modifying, remember:
- Check CLAUDE.md for detailed guidelines
- Run existing tests before committing
- Use conventional commit messages
- Never commit secrets or credentials