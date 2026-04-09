# Technical Debt Tracker

## Overview
This document tracks technical debt items for AI coding agents working on the household budgeting application. Items are prioritized and linked to relevant code locations.

**Last Updated**: 2026-04-08

## Critical Priority

### 1. Reports Page: Excessive Parallel API Requests
**Status**: Resolved (commit `5ed0bb9`)
**Created**: 2025-10-14
**Impact**: High - Causes 503 errors on Reports page load
**Effort**: Medium

**Problem**:
The Reports page makes 15+ parallel API requests on load:
- 12 monthly budget requests (2025-01 through 2025-12)
- Multiple report data requests (category breakdown, projections, etc.)
- Version check
This overwhelms nginx rate limits (originally 10r/s burst 10, now 30r/s burst 30).

**Current State** (updated 2026-04-08):
Reports.tsx was decomposed into 7 section components (commit `afb0a6f`). `frontend/src/pages/Reports.tsx` is now 423 LOC and handles data fetching only; rendering is delegated to section components in `frontend/src/components/reports/`. The root cause (12 parallel monthly budget requests) remains — a batch endpoint is still the proper fix.

**Current Workaround**:
Nginx rate limits increased to 30r/s with burst allowance of 30 requests.

**Proper Solution**:
1. Create batch API endpoint: `GET /api/v1/budgets/year/:year`
   - Returns all 12 months in single response
   - Reduces 12 requests to 1
   - Location: `backend/src/routes/budgets.ts`

2. Implement request throttling in frontend:
   ```typescript
   import pLimit from 'p-limit';
   const limit = pLimit(5); // Max 5 concurrent requests
   ```

3. Add React Query caching with longer `staleTime`

**Files to Modify**:
- `backend/src/routes/budgets.ts` - Add yearly batch endpoint
- `backend/src/services/budgetService.ts` - Add `getYearlyBudgets(year, userId)` method
- `frontend/src/lib/api.ts` - Add `getYearlyBudgets(year)` method
- `frontend/src/pages/Reports.tsx` - Use batch endpoint instead of 12 individual calls
- `frontend/src/components/reports/` - Section components

**References**:
- Nginx config: `/etc/nginx/sites-available/budget-app` on production server
- Architecture docs: `docs/AI-APPLICATION-ARCHITECTURE.md:813` (mentions 503 issues)

---

## High Priority

### 2. TypeScript `any` Types in Frontend
**Status**: Resolved (verified 2026-04-08)
**Created**: From CLAUDE.md
**Impact**: Was High - now resolved

**Resolution**: Audit of `grep -rn ": any\|as any" frontend/src/` returns zero matches. The API client refactoring eliminated the last `any` casts. `tsc -b --noEmit` passes clean.

---

## Medium Priority

### 10. Remaining Route Error Pattern Migration
**Status**: Resolved (commit `8d9243e`)
**Created**: 2026-04-08
**Impact**: Medium - Inconsistent error handling across routes
**Effort**: Medium

**Problem**:
10 of 15 route files still use the old `try/catch → res.status(500)` error handling pattern. Budgets, trips, transactions, and reports routes have been migrated to typed error classes + `next(error)` middleware. The remaining routes are inconsistent with the new pattern and do not benefit from centralised error formatting.

**Remaining files to migrate**:
- `backend/src/routes/accounts.ts`
- `backend/src/routes/categories.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/plaid.ts`
- `backend/src/routes/admin.ts`
- `backend/src/routes/feedback.ts`
- `backend/src/routes/chatbot.ts`
- `backend/src/routes/autoCategorize.ts`
- `backend/src/routes/actualsOverrides.ts`
- `backend/src/routes/manualAccounts.ts`
- `backend/src/routes/themes.ts`

**Solution**:
Replace `res.status(500).json({ error: '...' })` patterns with typed error classes and `next(error)` calls following the pattern established in the migrated routes.

**References**:
- `backend/src/errors/index.ts` - Typed error classes
- `backend/src/middleware/errorHandler.ts` - Centralised error middleware

---

### 11. EnhancedTransactions.tsx Still 923 LOC
**Status**: Open
**Created**: 2026-04-08
**Impact**: Low - Decomposed from 1,613 LOC but still over 400 LOC target
**Effort**: Medium

**Problem**:
`frontend/src/pages/EnhancedTransactions.tsx` retains coordination logic including bulk selection, mutations, URL params, and 15 `useState` calls. The file is functional but still large enough to be difficult to navigate and test.

**Solution**:
Extract custom hooks to slim the component:
- `useTransactionBulkOps` — bulk selection state and handlers
- `useTransactionData` — data fetching and React Query logic
- `useTransactionFilters` — URL param sync for filters

**Files**:
- `frontend/src/pages/EnhancedTransactions.tsx` - Main page (923 LOC)

---

### 12. API Client misc.ts Grab-Bag (400 LOC)
**Status**: Resolved (commit `0cfd902`)
**Created**: 2026-04-08
**Impact**: Low - Functional but poorly organized
**Effort**: Low

**Problem**:
`frontend/src/lib/api/misc.ts` is a catch-all module (~400 LOC) containing trips, chatbot, feedback, themes, auto-categorize, manual accounts, actuals overrides, and version/changelog API calls. New domain-specific modules added during refactoring have their own files, but this grab-bag remains.

**Solution**:
Split into individual domain modules following the existing pattern:
- `frontend/src/lib/api/chatbot.ts`
- `frontend/src/lib/api/themes.ts`
- `frontend/src/lib/api/manualAccounts.ts`
- etc.

**Files**:
- `frontend/src/lib/api/misc.ts` - Current grab-bag module
- `frontend/src/lib/api/index.ts` - Re-export barrel

---

## Low Priority

### 7. Data Export Feature
**Status**: Planned
**Created**: From architecture docs
**Impact**: Low - Nice to have
**Effort**: Medium

**Problem**:
Users cannot export their financial data (CSV/JSON).

**Solution**:
- Add export endpoints for transactions, budgets, categories
- Support CSV and JSON formats
- Add download UI to frontend

**Files to Create**:
- `backend/src/routes/export.ts`
- `backend/src/services/exportService.ts`
- `frontend/src/components/DataExport.tsx`

**References**:
- CLAUDE.md - Pending architectural changes

---

### 8. Webhook Support for Real-time Updates
**Status**: Planned
**Created**: From architecture docs
**Impact**: Low - Performance optimization
**Effort**: High

**Problem**:
App relies on manual sync for transaction updates. Plaid supports webhooks for real-time notifications.

**Solution**:
- Implement Plaid webhook endpoints
- Handle transaction updates automatically
- Add webhook verification and security

**Files to Create**:
- `backend/src/routes/webhooks.ts`
- `backend/src/services/webhookService.ts`

**References**:
- CLAUDE.md - Pending architectural changes

---

### 9. Transaction Caching Layer
**Status**: Planned
**Created**: From architecture docs
**Impact**: Low - Performance optimization
**Effort**: Medium

**Problem**:
Frequently accessed transaction data is fetched repeatedly.

**Solution**:
- Implement Redis caching for transaction queries
- Set appropriate TTLs (time-to-live)
- Invalidate cache on transaction updates

**References**:
- CLAUDE.md - Pending architectural changes

---

## Completed / Resolved

### Nginx Rate Limiting - RESOLVED
**Completed**: 2025-10-14
**Solution**: Increased nginx rate limits from 10r/s (burst 10) to 30r/s (burst 30)
**Follow-up**: Create batch API endpoint (see #1 above)

---

### 3. API Client Method Binding - RESOLVED
**Completed**: 2026-04-08 (commit `4373790`)
**Original Problem**: New API client methods had to be manually bound in the constructor to preserve `this` context. Forgetting to bind caused "Cannot read properties of undefined" errors when methods were passed as callbacks.
**Solution**: The API client was split into domain-specific modules using factory functions (not a class). The old class with manual `.bind()` calls no longer exists. `frontend/src/lib/api.ts` is now 43 LOC that composes modules from `frontend/src/lib/api/`. Arrow functions in factory modules preserve context automatically.

---

### 4. Expired Plaid Token Recovery - RESOLVED
**Completed**: 2026-01 (see CLAUDE.md)
**Original Problem**: When Plaid access tokens expired, users had to fully disconnect and reconnect accounts.
**Solution**: Plaid Link update mode for re-authentication was implemented. Accounts in `requires_reauth` state show visual indicators on the Accounts page and dashboard. Users re-authenticate via "Sign in to Bank" in the account menu. New endpoints and `PlaidLinkContext` update mode support the flow.

---

### 5. Frontend TypeScript Build Warnings - RESOLVED
**Completed**: 2026-04-08
**Original Problem**: Frontend had TypeScript errors that generated warnings but did not fail the build.
**Solution**: `tsc -b --noEmit` now passes with zero errors. Only pre-existing ESLint warnings remain (`react-hooks/exhaustive-deps`), which are a separate concern from TypeScript type correctness.

---

### 6. Test Coverage Gaps - PARTIALLY RESOLVED
**Updated**: 2026-04-08
**Original Problem**: UI components lacked comprehensive test coverage.
**Current State**: 244 backend unit tests were added during the maintainability refactor:
- Config utilities: 41 tests
- Repository layer: 23 tests
- Transaction filter logic: 62 tests
- Transaction mutation logic: 50 tests
- Report service: 35 tests
- Error classes: 33 tests

Backend coverage is now strong. Frontend component tests are still missing for critical UI flows (Reports, Budgets, Transactions). Adding frontend component tests with Testing Library remains a valid improvement.

**Remaining Work**:
- Add component tests for Reports, Budgets, EnhancedTransactions pages
- Focus on user interactions, not implementation details

**References**:
- `docs/AI-TESTING-STRATEGY.md` - Testing philosophy

---

## How to Use This Document

### For AI Coding Agents:

1. **Before starting work**: Review this document to understand existing issues
2. **When encountering issues**: Check if already documented here
3. **When fixing debt**: Update status and add completion date
4. **When discovering new debt**: Add entry with proper prioritization

### Priority Definitions:
- **Critical**: Causes production errors or data loss
- **High**: Significant impact on security, performance, or user experience
- **Medium**: Important improvements but workarounds exist
- **Low**: Nice-to-have features or optimizations

### Effort Estimates:
- **Low**: < 4 hours
- **Medium**: 4-16 hours
- **High**: > 16 hours

---

## Related Documentation
- **CLAUDE.md** - Project overview and guidelines
- **docs/AI-APPLICATION-ARCHITECTURE.md** - Technical architecture
- **docs/AI-DEPLOYMENTS.md** - Deployment procedures
- **docs/AI-TESTING-STRATEGY.md** - Testing approach
- **docs/completed/AI-Architecture-Plan.md** - Strategic planning and ADRs (archived)
