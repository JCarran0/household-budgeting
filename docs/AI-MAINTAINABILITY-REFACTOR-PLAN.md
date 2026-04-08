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
| R1. Split TransactionService | **Done** | `eaa3391`, `8d07125` | 112 pre-refactor tests + filter engine extraction + Repository adoption. |
| R3. Split ReportService | **Done** | `08811e9`, `7a90096` | 35 pre-refactor tests + helper extraction + Repository adoption. |
| R6. Standardize Errors | **Done** | `98bf9a2` | Error classes + middleware + 2 routes migrated (budgets, trips). 33 tests. |
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
| Config module | **Strong** | 41 unit tests (added in R10) |
| Repository base class | **Strong** | 23 unit tests (added in R8) |
| Shared utils (budgetCalculations, categoryHelpers) | **Strong** | 682 + 267 LOC of unit tests |
| Auth service | **Strong** | 517 LOC unit tests |
| Budget service | **Moderate** | 429 LOC unit tests |
| Category service | **Moderate** | 458 LOC unit tests; deletion protection tested via integration |
| Plaid service | **Moderate** | 650 LOC unit + integration |
| Transaction service | **Strong** | 112 unit tests (added in R1): 62 filter + 50 mutation tests |
| Report service | **Strong** | 35 unit tests (added in R3): trends, breakdowns, cash flow, projections, YTD |
| Auto-categorize service | **Indirect only** | Covered by 1,219 LOC integration story |
| Import service | **Indirect only** | Covered by csv-import integration test |
| Chatbot service | **None** | Zero tests |
| Route handlers / error handling | **Partial** | Error middleware has 33 tests (R6). 2 of 15 routes migrated to typed errors. |
| Frontend components | **None** | Zero test files, no test framework configured |
| transactionCalculations.ts (shared) | **None** | No dedicated test |

---

## Refactor Items

### R1. Split TransactionService (1,038 LOC) — DONE

> **Completed:** 2026-04-07 | **Commits:** `eaa3391` (tests), `8d07125` (split)

**What was done:**
- **Pre-refactor tests (commit `eaa3391`):** Added 112 unit tests in two files:
  - `transactionService.filter.test.ts` (62 tests) — comprehensive coverage of the `getTransactions()` filtering pipeline: date, account, category, tag, amount, search, type, hidden/flagged, sort, totals, and combined filters
  - `transactionService.mutations.test.ts` (50 tests) — all CRUD methods: category updates, tag operations, split transactions, description/flag/hide toggles, bulk recategorize, blocking transaction queries
- **Structural split (commit `8d07125`):**
  - Extracted `filterTransactions()` into `transactionFilterEngine.ts` (153 LOC) — a pure stateless function with no DataService dependency, independently testable
  - Refactored TransactionService to use `Repository<StoredTransaction>` for all data access (replaced 15 raw `getData`/`saveData` calls)
  - `getTransactions()` reduced from ~130 lines to 8 lines (delegates to filter engine)
  - TransactionService reduced from 1,038 to 888 LOC

**Remaining work (not blocking):**
- Sync logic could be further extracted into a `TransactionSyncOrchestrator` if it grows or needs independent testing. Currently reasonable at ~180 LOC within the service.
- CRUD mutations follow a repetitive load-find-modify-save pattern that could benefit from Repository helper methods in a future pass.

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

### R3. Split ReportService (968 LOC) — DONE

> **Completed:** 2026-04-07 | **Commits:** `08811e9` (tests), `7a90096` (split)

**What was done:**
- **Pre-refactor tests (commit `08811e9`):** Added 35 unit tests covering spending trends, category breakdowns (expense/income/savings), cash flow with actuals overrides, projections, YTD summary, and helper method behavior.
- **Structural split (commit `7a90096`):**
  - Extracted 4 helper functions into `reportHelpers.ts` (74 LOC): `getMonthRange`, `calculateStdDev`, `getEffectivelyHiddenCategoryIds`, `getSavingsSubcategoryIds` — pure functions, independently testable
  - Refactored ReportService to use `Repository<StoredTransaction>` for transaction data access
  - ReportService reduced from 969 to 896 LOC

**Remaining work (not blocking):**
- Report methods still have significant shared patterns (load transactions → filter by date/hidden → group by category). A further extraction of a `ReportDataLoader` could reduce duplication if these methods grow.

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

### R6. Standardize Error Handling — DONE

> **Completed:** 2026-04-07 | **Commit:** `98bf9a2`

**What was done:**
- Created `backend/src/errors/index.ts` — `AppError` base class with 7 typed subclasses: `ValidationError` (400), `NotFoundError` (404), `AuthorizationError` (401), `ForbiddenError` (403), `ConflictError` (409), `ExternalServiceError` (502), `RateLimitError` (429). Each carries HTTP status code and error code string.
- Created `backend/src/middleware/errorHandler.ts` — Express error middleware that dispatches `AppError` subclasses to correct HTTP responses, handles Zod errors as 400, and returns generic 500s for unknown errors.
- Replaced inline global error handler in `app.ts` with the new middleware.
- Migrated `budgets.ts` (12 handlers) and `trips.ts` (6 handlers) to demonstrate the pattern: `throw new AuthorizationError()` + `next(error)` instead of inline `res.status().json()`.
- Created `backend/src/__tests__/unit/errors.test.ts` — 33 tests for error classes and middleware dispatch.

**Remaining work (not blocking):**
- Migrate remaining 13 route files to use the same pattern (mechanical — follow budgets.ts/trips.ts as examples)
- Gradually migrate services to throw typed `AppError` subclasses instead of plain `Error` objects
- Frontend `useApiError` hook for consistent mutation error handling — deferred to Phase 3

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
- TransactionService and ReportService now use `Repository<T>` (done in R1/R3). Remaining services (actualsOverrideService, autoCategorizeService, accountService, etc.) can be migrated incrementally.

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
Phase 1: Foundation ✅ COMPLETE
├── R10. Config validation ✅
├── R8.  Repository base class ✅
└── R4.  Frontend test infra setup ONLY (deferred — not blocking Phase 2)

Phase 2: Backend structural improvements ✅ COMPLETE
├── R2.  Fix circular deps / DI ✅
├── R1.  Split TransactionService ✅
├── R3.  Split ReportService ✅
└── R6.  Standardize error handling ✅

Phase 3: Frontend decomposition ← NEXT
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
