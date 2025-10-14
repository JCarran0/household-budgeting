# Technical Debt Tracker

## Overview
This document tracks technical debt items for AI coding agents working on the household budgeting application. Items are prioritized and linked to relevant code locations.

**Last Updated**: 2025-10-14

## Critical Priority

### 1. Reports Page: Excessive Parallel API Requests
**Status**: Mitigated (nginx rate limits increased)
**Created**: 2025-10-14
**Impact**: High - Causes 503 errors on Reports page load
**Effort**: Medium

**Problem**:
The Reports page (`frontend/src/pages/Reports.tsx`) makes 15+ parallel API requests on load:
- 12 monthly budget requests (2025-01 through 2025-12)
- Multiple report data requests (category breakdown, projections, etc.)
- Version check
This overwhelms nginx rate limits (originally 10r/s burst 10, now 30r/s burst 30).

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

**References**:
- Nginx config: `/etc/nginx/sites-available/budget-app` on production server
- Architecture docs: `docs/AI-APPLICATION-ARCHITECTURE.md:813` (mentions 503 issues)

---

## High Priority

### 2. TypeScript `any` Types in Frontend
**Status**: Open
**Created**: From CLAUDE.md
**Impact**: High - Type safety compromised
**Effort**: High

**Problem**:
Some frontend components use `any` types, violating the project's strict TypeScript policy.

**Solution**:
- Audit frontend code for `any` types: `cd frontend && grep -r ": any" src/`
- Replace with proper types or `unknown` with type guards
- Run TypeScript compiler in strict mode: `npx tsc --noEmit`

**References**:
- CLAUDE.md:236 - TypeScript strict mode policy
- CLAUDE.md:583 - Known issues list

---

### 3. API Client Method Binding
**Status**: Resolved (documented as pattern)
**Created**: From architecture docs
**Impact**: High - Runtime errors if forgotten
**Effort**: Low per method

**Problem**:
New API client methods must be manually bound in constructor to preserve `this` context. Forgetting causes "Cannot read properties of undefined" errors when methods are used as callbacks.

**Current Pattern** (must be followed):
```typescript
// frontend/src/lib/api.ts
constructor() {
  // ALL methods must be bound!
  this.getBudgets = this.getBudgets.bind(this);
  this.getMonthlyBudgets = this.getMonthlyBudgets.bind(this);
  // ... etc
}
```

**Better Solution** (future):
- Convert API client to use arrow functions (automatically binds `this`)
- Or use TypeScript decorators for auto-binding

**Files**:
- `frontend/src/lib/api.ts:constructor`

**References**:
- `docs/AI-APPLICATION-ARCHITECTURE.md:749-771` - Troubleshooting section

---

## Medium Priority

### 4. Expired Plaid Token Recovery
**Status**: Open
**Created**: From CLAUDE.md
**Impact**: Medium - Poor UX
**Effort**: Medium

**Problem**:
When Plaid access tokens expire, users must manually reconnect accounts. No automatic refresh mechanism.

**Solution**:
- Implement Plaid token refresh flow
- Add webhook support for token expiration events
- Show user-friendly reconnection UI

**Files**:
- `backend/src/services/plaidService.ts` - Add refresh logic
- `backend/src/services/accountService.ts` - Handle token refresh
- `frontend/src/pages/MantineAccounts.tsx` - Add reconnection UI

**References**:
- CLAUDE.md:586 - Known issues

---

### 5. Frontend TypeScript Build Warnings
**Status**: Open
**Created**: From CLAUDE.md
**Impact**: Medium - Build warnings
**Effort**: Medium

**Problem**:
Frontend has TypeScript errors that don't fail the build but generate warnings.

**Solution**:
- Run `cd frontend && npm run build` to see warnings
- Fix type errors systematically
- Consider enabling `noEmitOnError` in `tsconfig.json`

**References**:
- CLAUDE.md:583 - Known issues

---

### 6. Test Coverage Gaps
**Status**: Open
**Created**: From CLAUDE.md
**Impact**: Medium - Risk of UI bugs
**Effort**: High

**Problem**:
UI components lack comprehensive test coverage.

**Solution**:
- Add tests for critical UI flows (Reports, Budgets, Transactions)
- Use Testing Library for component tests
- Focus on user interactions, not implementation details

**References**:
- CLAUDE.md:616 - Technical debt section
- `docs/AI-TESTING-STRATEGY.md` - Testing philosophy

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
- CLAUDE.md:612 - Pending architectural changes

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
- CLAUDE.md:611 - Pending architectural changes

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
- CLAUDE.md:610 - Pending architectural changes

---

## Completed / Resolved

### Nginx Rate Limiting - RESOLVED
**Completed**: 2025-10-14
**Solution**: Increased nginx rate limits from 10r/s (burst 10) to 30r/s (burst 30)
**Follow-up**: Create batch API endpoint (see #1 above)

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
