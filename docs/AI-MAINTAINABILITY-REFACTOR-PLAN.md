# Maintainability Refactor Plan

## Overview

This plan captures the top 10 architectural refactoring targets identified through a deep-dive analysis of the codebase. Each item follows a **test-first approach**: assess existing coverage, add missing tests to lock in current behavior, then refactor with confidence.

**Last Updated**: 2026-04-07

## Progress

| Item | Status | Commit | Notes |
|------|--------|--------|-------|
| R10. Config Validation | **Done** | `5d0eea4` | Backend config module created and wired in. Frontend config deferred. |
| R8. Repository Base Class | **Done** | `fbe27b1` | Generic `Repository<T>` created with 23 tests. Migration of services deferred. |
| R4. Frontend Test Infra | **Dropped** | — | See decision note below. TypeScript compilation is the confidence gate for R4/R5. |
| R2. Fix Circular Deps | **Done** | `034fab0` | Zero `as any` casts. CategoryDependencyChecker interface. BudgetService uses dataService directly. |
| R1. Split TransactionService | **Done** | `eaa3391`, `8d07125` | 112 pre-refactor tests + filter engine extraction + Repository adoption. |
| R3. Split ReportService | **Done** | `08811e9`, `7a90096` | 35 pre-refactor tests + helper extraction + Repository adoption. |
| R6. Standardize Errors | **Done** | `98bf9a2` | Error classes + middleware + 2 routes migrated (budgets, trips). 33 tests. |
| R4. Decompose Reports.tsx | **Done** | `afb0a6f` | 7 section components. Reports.tsx reduced from 2,151 to 423 LOC. |
| R5. Decompose EnhancedTransactions.tsx | Not started | | |
| R7. Split API Client | **Done** | `4373790` | 9 domain modules. api.ts reduced from 1,206 to 43 LOC. Zero import changes. |
| R9. Move Logic Out of Routes | **Done** | `b88b864` | 4 new service methods. All 3 routes migrated to R6 patterns. -225 LOC from routes. |

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

### R4. Decompose Reports.tsx (2,151 LOC) — DONE

> **Completed:** 2026-04-08 | **Commit:** `afb0a6f`

**What was done:**
- Extracted 6 tab panels into 7 focused components:
  - `CashflowSection.tsx` (149 LOC) — area chart + planned vs actual overlay
  - `SpendingTrendsSection.tsx` (171 LOC) — category trends line chart
  - `CategoryBreakdownSection.tsx` (757 LOC) — pie chart with drill-down, hidden categories, "Other" grouping. All category-local state and memos moved inside.
  - `ProjectionsSection.tsx` (273 LOC) — outlook chart with toggle states moved inside
  - `BudgetPerformanceSection.tsx` (473 LOC) — 5 budget health widgets with memos moved inside
  - `ReportsKpiCards.tsx` (120 LOC) — 4 KPI summary cards
  - `reportDateRange.ts` (78 LOC) — extracted `getDateRange` utility
- Reports.tsx reduced to 423 LOC: URL sync, React Query fetches, shared memos, tab shell
- TypeScript compilation and production build pass cleanly

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

**Confidence gate:** TypeScript compilation (`tsc --noEmit`) + manual smoke test. See decision note below.

**Key files:**
- `frontend/src/pages/EnhancedTransactions.tsx`
- `frontend/src/components/transactions/TransactionEditModal.tsx`

**Estimated effort:** Medium

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

### R7. Split API Client (1,206 LOC) — DONE

> **Completed:** 2026-04-08 | **Commit:** `4373790`

**What was done:**
- Split 1,206 LOC `ApiClient` class into 9 domain modules under `frontend/src/lib/api/`:
  - `client.ts` (61 LOC) — shared Axios instance with auth/error interceptors
  - `auth.ts` (79 LOC) — login, register, password reset
  - `accounts.ts` (80 LOC) — Plaid accounts, reauth
  - `transactions.ts` (136 LOC) — CRUD, sync, bulk ops, CSV import
  - `categories.ts` (118 LOC) — CRUD, tree, deletion workflow
  - `budgets.ts` (162 LOC) — CRUD, comparison, rollover, yearly
  - `reports.ts` (151 LOC) — trends, breakdowns, cash flow, YTD
  - `admin.ts` (48 LOC) — migrations, cleanup
  - `misc.ts` (400 LOC) — trips, chatbot, feedback, themes, auto-categorize, manual accounts
- `api.ts` reduced to 43 LOC — creates client, composes domain modules, re-exports all types
- All 41 existing import sites work without changes. TypeScript compilation and production build pass.

**Remaining work (not blocking):**
- `misc.ts` (400 LOC) is still a grab-bag. Can be split further into `trips.ts`, `chat.ts`, `feedback.ts`, `themes.ts` etc. as those areas are worked on.

---

### R8. Extract Data Repository Base Class — DONE

> **Completed:** 2026-04-07 | **Commit:** `fbe27b1`

**What was done:**
- Created `backend/src/services/repository.ts` — Generic `Repository<T>` class (49 LOC) with `getAll`, `saveAll`, `findBy`, `findById`, `deleteAll` methods. Encapsulates the `{entityName}_{userId}` key convention and bakes in empty-array defaults.
- Created `backend/src/__tests__/unit/repository.test.ts` — 23 tests covering key generation, CRUD, field-based lookup, and user isolation using `InMemoryDataService` directly.

**Remaining work (not blocking):**
- TransactionService and ReportService now use `Repository<T>` (done in R1/R3). Remaining services (actualsOverrideService, autoCategorizeService, accountService, etc.) can be migrated incrementally.

---

### R9. Move Business Logic Out of Routes — DONE

> **Completed:** 2026-04-08 | **Commit:** `b88b864`

**What was done:**
- **New service methods:**
  - `TransactionService.getUncategorizedCount()` — moved from route handler
  - `TransactionService.getMonthlySummary()` — moved from route handler
  - `TransactionService.bulkUpdate()` — moved 127-line loop from route handler
  - `BudgetService.getBudgetComparisonForMonth()` — moved category-fetch + totals computation from route handler
- **Route migrations:** All handlers in `transactions.ts`, `reports.ts`, and `budgets.ts` migrated to R6 error patterns (`AuthorizationError` + `next(error)`)
- **Route size reductions:** transactions 781→599, reports 345→318, budgets 376→360 (total -225 LOC)

**Remaining work (not blocking):**
- Remaining 10 route files (accounts, categories, auth, plaid, admin, feedback, chatbot, etc.) still use old error patterns — can be migrated as they're touched

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

Phase 3: Frontend decomposition (IN PROGRESS)
├── R7.  Split API client ✅
├── R4.  Decompose Reports.tsx ✅
└── R5.  Decompose EnhancedTransactions.tsx ← LAST ITEM

Phase 4: Cleanup ✅ COMPLETE
└── R9.  Move business logic out of routes ✅
```

**Dependencies between items:**
- R1 and R3 are easier after R2 (cleaner DI) ✅
- R6 is easier after R1 and R3 (fewer files to touch per service) ✅
- R9 is easier after R6 (new error classes can be used in routes) ✅
- R4 and R5 have no remaining blockers (frontend test infra dropped — see decision note)

---

## Decision: Frontend Test Infrastructure (2026-04-08)

The original plan required setting up Vitest + React Testing Library before decomposing R4/R5. After completing all backend items, we reassessed this requirement:

**Why we're skipping frontend test infra for R4/R5:**
- R4/R5 are pure *structural* refactors — extracting JSX into child components, passing props down. No logic changes.
- TypeScript compilation is the real safety net for component decomposition. If props are wrong or imports break, `tsc` catches it.
- React component tests for this kind of work tend to be brittle — they test rendering details that change during the refactor itself, creating churn.
- Setting up Vitest + RTL + mocking React Query + Mantine is significant effort for tests that would mostly assert "component renders."
- The backend test-first approach worked well because we were changing *logic* (filter pipelines, data access). Frontend decomposition changes *structure*, not behavior.

**Confidence gate for R4/R5:**
1. `tsc --noEmit` passes (catches type errors, missing props, broken imports)
2. `vite build` succeeds (catches runtime import issues)
3. Manual smoke test of each page/tab after extraction

**Frontend tests remain valuable** for testing user interactions, form validation, and filter behavior — but that should be its own initiative, not coupled to structural decomposition.

---

## Success Criteria

Each refactor item is complete when:

1. Pre-refactor tests are written and passing (backend items) OR TypeScript compilation passes (frontend structural items)
2. Structural changes are made
3. All pre-existing tests still pass (zero regressions)
4. New tests for the refactored structure pass (where applicable)
5. No file exceeds 400 LOC (target state)
6. `tsc --noEmit` passes with zero errors
7. The change is shipped as an independent, reviewable PR

---

## Cross-References

- **Technical Debt Tracker:** `docs/AI-TECHNICAL-DEBT.md` — existing known issues that may overlap
- **Testing Strategy:** `docs/AI-TESTING-STRATEGY.md` — test philosophy and patterns
- **Architecture Guide:** `docs/AI-APPLICATION-ARCHITECTURE.md` — current architecture reference
