# Maintainability Refactor Plan

## Overview

This plan captures the top 10 architectural refactoring targets identified through a deep-dive analysis of the codebase. Each item follows a **test-first approach**: assess existing coverage, add missing tests to lock in current behavior, then refactor with confidence.

**Last Updated**: 2026-04-07

## Progress

| Item | Status | Commit | Notes |
|------|--------|--------|-------|
| R10. Config Validation | **Done** | `5d0eea4` | Backend config module created and wired in. Frontend config deferred. |
| R8. Repository Base Class | **Done** | `fbe27b1` | Generic `Repository<T>` created with 23 tests. Migration of services deferred. |
| R4. Frontend Test Infra | Not started | | |
| R2. Fix Circular Deps | **Done** | `034fab0` | Zero `as any` casts. CategoryDependencyChecker interface. BudgetService uses dataService directly. |
| R1. Split TransactionService | Not started | | |
| R3. Split ReportService | Not started | | |
| R6. Standardize Errors | Not started | | |
| R4. Decompose Reports.tsx | Not started | | |
| R5. Decompose EnhancedTransactions.tsx | Not started | | |
| R7. Split API Client | Not started | | |
| R9. Move Logic Out of Routes | Not started | | |

---

## Guiding Principles

1. **Test before you touch** — Every refactor item begins with a coverage assessment and test gap fill. No structural changes until we can verify behavior is preserved.
2. **Incremental delivery** — Each item is independently shippable. No big-bang rewrites.
3. **Preserve behavior exactly** — Refactoring means changing structure, not behavior. Any behavioral changes are separate work items.
4. **One concern per module** — The target state is files under 400 LOC with a single, clear responsibility.

---

## Current Test Coverage Snapshot

Before planning each refactor, here's where we stand today:

| Area | Coverage Level | Notes |
|------|---------------|-------|
| Shared utils (budgetCalculations, categoryHelpers) | **Strong** | 682 + 267 LOC of unit tests |
| Auth service | **Strong** | 517 LOC unit tests |
| Budget service | **Moderate** | 429 LOC unit tests |
| Category service | **Moderate** | 458 LOC unit tests |
| Plaid service | **Moderate** | 650 LOC unit + integration |
| Transaction service | **Indirect only** | No unit tests; covered by integration stories |
| Report service | **Indirect only** | No unit tests; covered by financial-calc stories |
| Auto-categorize service | **Indirect only** | Covered by 1,219 LOC integration story |
| Import service | **Indirect only** | Covered by csv-import integration test |
| Chatbot service | **None** | Zero tests |
| Route handlers | **Almost none** | 1 of 15 routes has a test file |
| Frontend components | **None** | Zero test files, no test framework configured |
| transactionCalculations.ts (shared) | **None** | No dedicated test |

---

## Refactor Items

### R1. Split TransactionService (1,038 LOC)

**Problem:** Single service handles syncing, filtering, categorization, splitting, and matching. Changing any one concern risks breaking others. The `getTransactions()` method alone is 400+ LOC of filtering pipeline.

**Target state:**
- `TransactionRepository` — CRUD operations against DataService (~250 LOC)
- `TransactionFilterEngine` — Filtering, sorting, search logic (~350 LOC)
- `TransactionSyncOrchestrator` — Plaid sync coordination (~300 LOC)
- `TransactionService` becomes a thin facade that delegates to the above

**Pre-refactor test work:**
1. **Assess:** TransactionService has no unit tests. It's tested indirectly via:
   - `search-filtering.stories.test.ts` (907 LOC)
   - `transaction-sync.stories.test.ts` (674 LOC)
   - `transaction-categorization.stories.test.ts` (392 LOC)
2. **Gap fill:**
   - Add unit tests for `getTransactions()` filter logic — all filter combinations (category, amount, date range, tags, type, hidden, splits)
   - Add unit tests for `syncTransactions()` — success path, partial failure, empty response
   - Add unit tests for `splitTransaction()` and `updateTransaction()` edge cases
   - Add unit tests for `removeTransactions()` — the scoped-removal logic that only removes accounts being synced
3. **Confidence gate:** All new unit tests + existing integration stories pass before any structural changes.

**Key files:**
- `backend/src/services/transactionService.ts`
- `backend/src/__tests__/stories/search-filtering.stories.test.ts`
- `backend/src/__tests__/stories/transaction-sync.stories.test.ts`

**Estimated effort:** Medium-High

---

### R2. Fix Circular Dependencies & Service Initialization — DONE

> **Completed:** 2026-04-07 | **Commit:** `034fab0`

**What was done:**
- **BudgetService**: Removed `getCategoriesCallback` parameter. BudgetService now calls `this.dataService.getCategories(userId)` directly — the data layer always had this method, making the callback unnecessary indirection.
- **CategoryService**: Introduced `CategoryDependencyChecker` interface capturing the 4 deletion pre-check methods (`hasBudgetsForCategory`, `hasRulesForCategory`, `hasTransactionsForCategory`, `getBlockingTransactionDetails`). Constructor reduced from 5 params to 2 (`dataService`, `dependencyChecker?`). Added typed `setImportService()` setter for the remaining late-binding dependency.
- **services/index.ts**: Clean initialization with zero `as any` casts. Uses a closure-based dependency checker that defers `autoCategorizeService` resolution until after construction.
- Updated `category-deletion-protection.test.ts` setup to use new constructor signature (assertions unchanged).
- All 30 critical tests pass (category deletion + financial calculations). Net -34 LOC.

---

### R3. Split ReportService (968 LOC)

**Problem:** ReportService mixes data aggregation, trend calculation, projection math, and drill-down logic. Complex financial calculations are hard to test in isolation and risky to modify.

**Target state:**
- `ReportDataAggregator` — Fetches and joins data from multiple sources (~250 LOC)
- `TrendCalculator` — Spending trends, period-over-period analysis (~250 LOC)
- `ProjectionEngine` — Forward-looking projections and forecasts (~200 LOC)
- `ReportService` becomes an orchestrator that composes the above

**Pre-refactor test work:**
1. **Assess:** No unit tests. Covered indirectly by:
   - `financial-calc.stories.test.ts` (833 LOC)
   - `reports-transactions-navigation.stories.test.ts` (282 LOC)
2. **Gap fill:**
   - Add unit tests for each report endpoint's calculation logic with known inputs/outputs
   - Test trend calculations: monthly trends, category trends, income vs expense over time
   - Test projection calculations: accuracy with varying data densities, edge cases (no data, single month)
   - Test cash flow aggregation: income/expense totals, transfer exclusion, category rollups
3. **Confidence gate:** Unit tests cover every public method of ReportService before splitting.

**Key files:**
- `backend/src/services/reportService.ts`
- `backend/src/__tests__/stories/financial-calc.stories.test.ts`

**Estimated effort:** Medium

---

### R4. Decompose Reports.tsx (2,151 LOC)

**Problem:** Single React component with 11 useState calls, 5 useQuery calls, 6 tab panels, complex memoized data processing, and rendering all in one file. Adding a new chart or modifying a tab risks breaking unrelated tabs.

**Target state:**
```
pages/Reports.tsx (~200 LOC — tab shell, shared filters, URL sync)
  ├── components/reports/CashflowSection.tsx (~350 LOC)
  ├── components/reports/SpendingTrendsSection.tsx (~300 LOC)
  ├── components/reports/CategoryBreakdownSection.tsx (~350 LOC)
  ├── components/reports/ProjectionsSection.tsx (~300 LOC)
  ├── components/reports/BudgetPerformanceSection.tsx (~300 LOC)
  └── hooks/useReportData.ts (~150 LOC — shared data fetching)
```

**Pre-refactor test work:**
1. **Assess:** Zero frontend tests. No test framework configured for frontend.
2. **Gap fill:**
   - **First:** Set up Vitest + React Testing Library in the frontend project
   - Add integration-style tests for Reports page: renders each tab, displays data from mocked API responses, filter changes update displayed data
   - Test critical data transformations: the `useMemo` blocks that process API responses into chart data — extract these into pure functions and unit test them
   - Test URL parameter sync: changing filters updates URL, loading with URL params restores filter state
3. **Confidence gate:** Each tab renders with test data. Data transformation functions have unit tests. URL sync round-trips correctly.

**Key files:**
- `frontend/src/pages/Reports.tsx`
- `frontend/src/hooks/usePersistedFilters.ts`

**Estimated effort:** High (includes frontend test infrastructure setup)

---

### R5. Decompose EnhancedTransactions.tsx (1,613 LOC)

**Problem:** Same structural issue as Reports — 14 useState calls, pagination, bulk editing, inline modals, filter logic, and rendering all in one file.

**Target state:**
```
pages/EnhancedTransactions.tsx (~250 LOC — layout, coordination)
  ├── components/transactions/TransactionTable.tsx (~400 LOC)
  ├── components/transactions/TransactionFilterBar.tsx (~300 LOC)
  ├── components/transactions/TransactionToolbar.tsx (~200 LOC)
  ├── components/transactions/TransactionEditModal.tsx (already exists — 431 LOC)
  └── hooks/useTransactionList.ts (~200 LOC — data fetching + pagination)
```

**Pre-refactor test work:**
1. **Assess:** Zero frontend tests (same as R4).
2. **Gap fill:** (Depends on R4 setting up test infrastructure)
   - Test transaction list rendering: pagination, empty states, loading states
   - Test filter interactions: applying filters updates the list, clearing resets
   - Test bulk operations: select all, bulk categorize, bulk hide
   - Test inline editing: category assignment, split transactions
3. **Confidence gate:** Core user flows (list, filter, edit, bulk operate) have test coverage.

**Key files:**
- `frontend/src/pages/EnhancedTransactions.tsx`
- `frontend/src/components/transactions/TransactionEditModal.tsx`

**Estimated effort:** Medium (assumes R4 already set up test infra)

---

### R6. Standardize Error Handling

**Problem:** Three inconsistent patterns coexist across the backend:
- Services **throw** generic `Error` objects: `throw new Error('Invalid month format')`
- Some services return result objects: `{ success: false, error: '...' }`
- Routes catch everything as generic 500: `res.status(500).json({ error: 'Failed to...' })`

Frontend has its own inconsistency: some components check `error.response.data.error`, others just use `error.message`.

**Target state:**
- Typed error classes: `ValidationError`, `NotFoundError`, `AuthorizationError`, `ExternalServiceError`
- Each carries an HTTP status code and user-safe message
- Express error middleware maps error class → HTTP response (one place, not 15 route files)
- Services throw typed errors consistently (no result objects for errors)
- Frontend has a shared `useApiError` hook or error handler for mutations

**Pre-refactor test work:**
1. **Assess:** Error paths are partially tested in integration stories. Auth error handling is tested in `auth.stories.test.ts`.
2. **Gap fill:**
   - Catalog every `throw new Error(...)` and `catch` block across all services and routes
   - Add tests for error scenarios in each major service: invalid input, missing data, external service failure
   - Add tests for route-level error responses: verify status codes and response shapes for known error conditions
   - Test that validation errors return 400 (not 500)
3. **Confidence gate:** Error response tests document current behavior. New error classes must produce identical HTTP responses.

**Key files:**
- All files in `backend/src/routes/` (15 files)
- All files in `backend/src/services/` (22 files)
- New: `backend/src/errors/` directory with error classes
- New: `backend/src/middleware/errorHandler.ts`

**Estimated effort:** Medium-High (touches many files but changes are mechanical)

---

### R7. Split API Client (1,206 LOC)

**Problem:** `frontend/src/lib/api.ts` contains 60+ methods in a single file with no domain grouping. Every new endpoint grows this file. Type definitions are duplicated from `shared/types/`.

**Target state:**
```
frontend/src/lib/
  ├── api.ts (~100 LOC — shared client instance, auth interceptors, base config)
  ├── api/
  │   ├── transactions.ts (~200 LOC)
  │   ├── budgets.ts (~150 LOC)
  │   ├── categories.ts (~120 LOC)
  │   ├── reports.ts (~150 LOC)
  │   ├── accounts.ts (~120 LOC)
  │   ├── chat.ts (~100 LOC)
  │   └── admin.ts (~100 LOC)
  └── types/ → imports from shared/types/ (no local redefinitions)
```

**Pre-refactor test work:**
1. **Assess:** No tests for API client.
2. **Gap fill:**
   - This is a structural refactor (moving methods between files) with no logic changes
   - Rather than testing the API client directly, verify with TypeScript compilation — all existing call sites must still compile after the split
   - Add a simple smoke test: each API module exports the expected methods
3. **Confidence gate:** `tsc --noEmit` passes. All existing imports resolve. Existing integration/E2E tests (once R4 adds them) still pass.

**Key files:**
- `frontend/src/lib/api.ts`
- All files that import from `frontend/src/lib/api`

**Estimated effort:** Low-Medium

---

### R8. Extract Data Repository Base Class — DONE

> **Completed:** 2026-04-07 | **Commit:** `fbe27b1`

**What was done:**
- Created `backend/src/services/repository.ts` — Generic `Repository<T>` class (49 LOC) with `getAll`, `saveAll`, `findBy`, `findById`, `deleteAll` methods. Encapsulates the `{entityName}_{userId}` key convention and bakes in empty-array defaults.
- Created `backend/src/__tests__/unit/repository.test.ts` — 23 tests covering key generation, CRUD, field-based lookup, and user isolation using `InMemoryDataService` directly.

**Remaining work (not blocking):**
- Migrate existing services to compose or extend `Repository<T>` instead of calling `dataService.getData`/`saveData` directly. Can be done incrementally as services are touched in R1/R3 refactors.

---

### R9. Move Business Logic Out of Routes

**Problem:** Route handlers in `budgets.ts`, `reports.ts`, and `transactions.ts` contain filter transformation logic, aggregation calculations, and inline validation that belongs in the service layer. Routes should only do: parse request, call service, format response.

**Target state:**
- Route handlers are under 30 LOC each (parse → call → respond)
- All filter transformation, calculation, and validation lives in services
- Shared request-parsing utilities for common patterns (pagination, date ranges, user ID extraction)

**Pre-refactor test work:**
1. **Assess:** Only 1 of 15 route files has tests (`plaid.integration.test.ts`, 81 LOC).
2. **Gap fill:**
   - Add route-level integration tests for the routes being refactored: `budgets.ts`, `reports.ts`, `transactions.ts`
   - Test the HTTP contract: request shape → response shape for each endpoint
   - Test error responses: missing params → 400, invalid auth → 401, service error → 500
   - These tests exercise the full route → service → data path, so they catch regressions regardless of where the logic lives
3. **Confidence gate:** Every endpoint in the target route files has at least one happy-path and one error-path test.

**Key files:**
- `backend/src/routes/budgets.ts` (432 LOC)
- `backend/src/routes/reports.ts` (345 LOC)
- `backend/src/routes/transactions.ts` (781 LOC)

**Estimated effort:** Medium

---

### R10. Startup Configuration Validation — DONE

> **Completed:** 2026-04-07 | **Commit:** `5d0eea4`

**What was done:**
- Created `backend/src/config.ts` — Zod-validated config module grouped by domain (server, plaid, auth, storage, ai, github, deploy). Exports typed `AppConfig` object and `loadConfig()` function for test isolation.
- Created `backend/src/__tests__/unit/config.test.ts` — 41 tests covering valid configs, required vars, conditional validation (production Plaid creds, S3 bucket), type coercion, defaults, enum validation, and error message quality.
- Wired config into `backend/src/services/index.ts`, `backend/src/app.ts`, and `backend/src/index.ts`, replacing scattered `process.env` reads.
- All 41 config tests pass. All 169 integration tests pass (zero regressions).

**Remaining work (not blocking):**
- Migrate remaining services that still read `process.env` directly (plaidService, authService, storageFactory, feedbackService, encryption utils) — can be done incrementally as those files are touched in later refactors.
- Frontend `config.ts` for typed constants (pagination, feature flags) — deferred to Phase 3 when frontend is being decomposed.

---

## Recommended Execution Order

The items are ordered to maximize early value and minimize dependencies between items.

```
Phase 1: Foundation (do first — enables everything else)
├── R10. Config validation (Low effort, immediate safety win)
├── R8.  Repository base class (Low effort, reduces noise in later refactors)
└── R4.  Frontend test infra setup ONLY (prerequisite for R4/R5 refactoring)

Phase 2: Backend structural improvements
├── R2.  Fix circular deps / DI (unblocks clean service splitting)
├── R1.  Split TransactionService (highest-risk god object)
├── R3.  Split ReportService (second highest-risk god object)
└── R6.  Standardize error handling (easier after services are smaller)

Phase 3: Frontend decomposition
├── R4.  Decompose Reports.tsx (largest frontend file)
├── R5.  Decompose EnhancedTransactions.tsx
└── R7.  Split API client (mechanical, low risk)

Phase 4: Cleanup
└── R9.  Move business logic out of routes (easier after services are well-structured)
```

**Dependencies between items:**
- R4 and R5 depend on frontend test infrastructure (part of R4)
- R1 and R3 are easier after R2 (cleaner DI)
- R6 is easier after R1 and R3 (fewer files to touch per service)
- R9 is easier after R6 (new error classes can be used in routes)

---

## Success Criteria

Each refactor item is complete when:

1. Pre-refactor tests are written and passing
2. Structural changes are made
3. All pre-existing tests still pass (zero regressions)
4. New tests for the refactored structure pass
5. No file exceeds 400 LOC (target state)
6. `tsc --noEmit` passes with zero errors
7. The change is shipped as an independent, reviewable PR

---

## Cross-References

- **Technical Debt Tracker:** `docs/AI-TECHNICAL-DEBT.md` — existing known issues that may overlap
- **Testing Strategy:** `docs/AI-TESTING-STRATEGY.md` — test philosophy and patterns
- **Architecture Guide:** `docs/AI-APPLICATION-ARCHITECTURE.md` — current architecture reference
