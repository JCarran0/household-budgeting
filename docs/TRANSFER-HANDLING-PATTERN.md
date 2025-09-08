# Transfer Transaction Handling Pattern

## Overview
This document describes the consistent pattern for handling transfer transactions across the application. Transfers (money moving between accounts) should be excluded from income and expense calculations to avoid double-counting and provide accurate financial reporting.

## Core Principle
**Transfers are not income or expenses** - they are money movements between accounts and should be excluded from:
- Income calculations
- Expense calculations  
- Net cash flow calculations
- Savings rate calculations
- Budget vs actual comparisons

## Implementation Pattern

### 1. Transfer Detection
Use the `isTransferCategory` helper function from `shared/utils/categoryHelpers.ts`:

```typescript
export function isTransferCategory(categoryId: string): boolean {
  return categoryId.startsWith('TRANSFER_IN') || categoryId.startsWith('TRANSFER_OUT');
}
```

This function identifies both parent transfer categories and their subcategories:
- `TRANSFER_IN` - Money coming into an account from another account
- `TRANSFER_OUT` - Money going out to another account
- All subcategories like `TRANSFER_IN_DEPOSIT`, `TRANSFER_OUT_SAVINGS`, etc.

### 2. Transaction Calculations
Use the shared utilities from `shared/utils/transactionCalculations.ts`:

```typescript
import { 
  calculateIncome,
  calculateExpenses, 
  calculateNetCashFlow,
  calculateSavingsRate
} from '../shared/utils/transactionCalculations';

// Calculate totals excluding transfers
const income = calculateIncome(transactions);
const expenses = calculateExpenses(transactions);
const netFlow = calculateNetCashFlow(transactions);
const savingsRate = calculateSavingsRate(transactions);
```

### 3. Transaction Filtering
The transaction service supports a `transactionType` filter with four options:
- `'all'` - All transactions including transfers
- `'income'` - Only income transactions (negative amounts, excluding transfers)
- `'expense'` - Only expense transactions (positive amounts, excluding transfers)
- `'transfer'` - Only transfer transactions

```typescript
// API usage
const response = await api.getTransactions({ 
  transactionType: 'income' // Excludes transfers automatically
});
```

### 4. Budget Calculations
The budget service uses `isBudgetableCategory` to exclude transfers:

```typescript
// From shared/utils/categoryHelpers.ts
export function isBudgetableCategory(categoryId: string, categories: Category[]): boolean {
  // Transfer categories should not be budgetable
  if (isTransferCategory(categoryId)) {
    return false;
  }
  // Both income and expense categories are budgetable
  return true;
}
```

## Where This Pattern Is Applied

### Backend Services
1. **Transaction Service** (`backend/src/services/transactionService.ts`)
   - `getTransactions()` method filters by transaction type
   - Excludes transfers when `transactionType` is 'income' or 'expense'

2. **Budget Service** (`backend/src/services/budgetService.ts`)
   - Uses `isBudgetableCategory` to exclude transfers from budgets
   - Budget comparisons skip transfer categories

3. **Report Service** (`backend/src/services/reportService.ts`)
   - Cash flow calculations use shared utilities
   - Income/expense breakdowns exclude transfers

### API Endpoints
1. **Transaction Routes** (`backend/src/routes/transactions.ts`)
   - `/api/v1/transactions/summary` - Uses shared utilities for totals
   - `/api/v1/transactions` - Supports transaction type filtering

### Frontend Components
1. **Dashboard** (`frontend/src/pages/MantineDashboard.tsx`)
   - Monthly income/spending calculations exclude transfers
   - Uses `isTransferCategory` helper

2. **Transactions Page** (`frontend/src/pages/EnhancedTransactions.tsx`)
   - Transaction Type filter includes "Transfers" option
   - Income/Expense filters exclude transfers

## Testing
The pattern is tested in:
- `backend/src/__tests__/critical/transfer-filter.test.ts`
- `backend/src/__tests__/critical/income-expense-filter.test.ts`

## Migration Notes
When updating existing code to follow this pattern:

1. **Replace manual amount filtering** with shared utilities:
   ```typescript
   // OLD - doesn't exclude transfers
   const income = transactions
     .filter(t => t.amount < 0)
     .reduce((sum, t) => sum + Math.abs(t.amount), 0);
   
   // NEW - excludes transfers
   import { calculateIncome } from '../shared/utils/transactionCalculations';
   const income = calculateIncome(transactions);
   ```

2. **Check for Plaid category mappings**:
   - Ensure salary/wages are mapped to `INCOME_WAGES`, not `TRANSFER_IN_DEPOSIT`
   - Direct deposits should be categorized as income, not transfers

## Common Pitfalls to Avoid

1. **Don't use amount sign alone** to determine income vs expense
   - Always check if transaction is a transfer first
   
2. **Don't forget subcategories** when checking for transfers
   - Use `startsWith()` not exact match for transfer detection

3. **Be consistent** across the application
   - Always use the shared utilities for calculations
   - Don't create local implementations

## Benefits of This Pattern

1. **Accuracy** - No double-counting of transfers in financial reports
2. **Consistency** - Same logic applied everywhere
3. **Maintainability** - Single source of truth for calculations
4. **User Experience** - Clear separation of transfers from real income/expenses
5. **Testing** - Centralized logic is easier to test and verify