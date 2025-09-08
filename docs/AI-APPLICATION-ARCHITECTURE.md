# AI Application Architecture Guide

## 📚 Related Documentation
- **[CLAUDE.md](../CLAUDE.md)** - Main index and project overview
- **[AI-DEPLOYMENTS.md](./AI-DEPLOYMENTS.md)** - Deployment procedures and troubleshooting
- **[AI-TESTING-STRATEGY.md](./AI-TESTING-STRATEGY.md)** - Testing patterns and examples
- **[AI-USER-STORIES.md](./AI-USER-STORIES.md)** - Product requirements and features
- **[AI-Architecture-Plan.md](./AI-Architecture-Plan.md)** - Infrastructure costs and strategic planning

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
│   │   ├── middleware/      # Auth, error handling
│   │   ├── utils/           # Encryption, helpers
│   │   └── __tests__/       # Integration tests
│   └── data/                # JSON file storage
├── frontend/
│   ├── src/
│   │   ├── pages/           # React page components
│   │   ├── components/      # Reusable UI components
│   │   ├── lib/             # API client, utilities
│   │   ├── hooks/           # Custom React hooks
│   │   └── stores/          # Zustand state stores
└── shared/
    ├── types/               # Shared TypeScript types
    └── utils/               # Shared utility functions
        ├── categoryHelpers.ts   # Category type checking
        └── transactionCalculations.ts  # Financial calculations
```

## Key Services Architecture

### Backend Services (Singleton Pattern)

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
  - `createLinkToken()`: Initialize Plaid Link flow
  - `exchangePublicToken()`: Convert public to access token
  - `getAccounts()`: Fetch bank account details
  - `getTransactions()`: Fetch transactions with pagination
  - `removeItem()`: Disconnect bank account from Plaid
- **Features**:
  - Automatic pagination for all transactions
  - 730-day history request (bank-limited)
  - Sandbox/development/production environment support

#### 3. AccountService (`backend/src/services/accountService.ts`)
- **Purpose**: Manage bank account connections and data
- **Key Methods**:
  - `connectAccount()`: Store new bank connection
  - `getUserAccounts()`: Get all user's accounts
  - `syncAccountBalances()`: Update account balances
  - `disconnectAccount()`: Mark account as inactive and remove from Plaid
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

### Shared Utilities (`shared/utils/`)

#### Transaction Calculations (`shared/utils/transactionCalculations.ts`)
- **Purpose**: Consistent financial calculations that exclude transfer transactions
- **Key Functions**:
  - `calculateIncome(transactions)`: Sum negative amounts excluding transfers
  - `calculateExpenses(transactions)`: Sum positive amounts excluding transfers
  - `calculateNetCashFlow(transactions)`: Net income - expenses excluding transfers
  - `calculateSavingsRate(transactions)`: Savings rate as percentage
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
- **Purpose**: Monthly budget management (expense categories only)
- **Key Methods**:
  - `setBudget()`: Set monthly budget for category
  - `copyBudgets()`: Copy from previous month
  - `getBudgetComparison()`: Budget vs actual spending
  - `getBudgetVsActual()`: Returns `null` for income categories (excluded from budget tracking)
  - `hasBudgetsForCategory()`: Check if category has any budgets (for deletion protection)
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

## Frontend Architecture

### Key Components

#### Pages (`frontend/src/pages/`)
- **MantineDashboard**: Main dashboard with stats cards
- **MantineAccounts**: Account management with Plaid Link
- **EnhancedTransactions**: Transaction list with filtering and inline category editing
- **Categories**: Category hierarchy management with auto-categorization rules
- **Budgets**: Monthly budget interface with expense category filtering
  - Budget forms filter categories to only show expense categories (excludes income)
  - Actual spending calculations exclude income transactions from budget comparisons
  - Uses `isExpenseCategory()` helper for consistent filtering
- **Reports**: Financial analysis with:
  - Income/expense toggle for category breakdowns
  - Interactive drill-down pie charts
  - Top income sources and spending categories
  - Transaction previews with navigation to filtered views
  - Income-specific green color palette

#### API Client (`frontend/src/lib/api.ts`)
- Axios-based HTTP client
- Automatic JWT token injection
- Response interceptors for auth handling
- Method binding for proper context

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

### ⚠️ Known Issues
1. **No Account Removal UI**: Backend has `disconnectAccount()` method but frontend lacks UI
2. **Limited Error Recovery**: No UI for re-authentication when Plaid token expires
3. **No Transaction Edit History**: Changes aren't tracked
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
When services need to reference each other (e.g., CategoryService needs AutoCategorizeService and vice versa), use dependency injection:
```typescript
// Create first service without circular dependency
const categoryService = new CategoryService(dataService, budgetService, undefined, transactionService);
// Create second service with reference to first
const autoCategorizeService = new AutoCategorizeService(dataService, categoryService);
// Update first service with reference to second
(categoryService as any).autoCategorizeService = autoCategorizeService;
```

## Quick Modification Guide

<!-- TASK: Add new API endpoint -->
<!-- PATTERN: API development -->
### To Add a New API Endpoint
1. Create route handler in `backend/src/routes/`
2. Add business logic to relevant service
3. Update API client in `frontend/src/lib/api.ts`
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

### To Modify Data Models
1. Update interface in relevant service
2. Update shared types if exposed to frontend
3. Consider migration for existing data
4. Update tests if critical path

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

This application follows a pragmatic "spike and stabilize" approach:
- Features are built quickly with minimal tests
- Tests are added when bugs are found
- TypeScript strict mode catches most issues
- Integration tests preferred over unit tests

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