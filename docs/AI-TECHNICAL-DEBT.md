# Technical Debt Tracker

## Overview
This document tracks technical debt items identified during the April 2026 architecture audit. Items are prioritized by severity and linked to relevant code locations.

**Last Updated**: 2026-04-08
**Previous (archived)**: [docs/completed/AI-TECHNICAL-DEBT.md](completed/AI-TECHNICAL-DEBT.md)

---

## Critical Priority

### TD-001: Encryption Secret Falls Back to JWT Secret
**Status**: Resolved (2026-04-08)
**Created**: 2026-04-08
**Impact**: Critical - Single compromised secret unlocks both sessions and encrypted Plaid tokens
**Effort**: Low

**Problem**:
`backend/src/utils/encryption.ts:17` reads `process.env` directly and falls back to `JWT_SECRET` when `PLAID_ENCRYPTION_SECRET` is unset. `backend/src/config.ts:264-267` duplicates this fallback. Additionally, `backend/.env.example` documents the variable as `ENCRYPTION_KEY` (line 20) but the code reads `PLAID_ENCRYPTION_SECRET` — anyone following the example will silently use the JWT secret for encryption.

**Fix**:
1. Make `encryption.ts` consume `config.auth.encryptionSecret` instead of reading `process.env` directly
2. Enforce `PLAID_ENCRYPTION_SECRET` is set in production config validation
3. Fix `.env.example` to use the correct variable name `PLAID_ENCRYPTION_SECRET`

**Files**:
- `backend/src/utils/encryption.ts`
- `backend/src/config.ts`
- `backend/.env.example`

---

### TD-002: Password Reset Tokens Logged in Plaintext
**Status**: Resolved (2026-04-08)
**Created**: 2026-04-08
**Impact**: Critical - Reset tokens visible to anyone with log access (CloudWatch, PM2 logs)
**Effort**: Low

**Problem**:
`backend/src/services/authService.ts:417-426` logs the raw reset token to stdout via `console.log()`. In production, logs are forwarded to CloudWatch and are accessible to anyone with log access — effectively bypassing the token's security model.

**Fix**:
Replace the raw token log with a sanitized message that confirms a token was generated without exposing the token value. The security event log already captures the metadata.

**Files**:
- `backend/src/services/authService.ts`

---

### TD-003: JWT Algorithm Not Pinned
**Status**: Resolved (2026-04-08)
**Created**: 2026-04-08
**Impact**: Critical - Algorithm confusion attack vector if library defaults change
**Effort**: Trivial

**Problem**:
`backend/src/services/authService.ts` calls `jwt.sign()` (line 230) and `jwt.verify()` (line 244) without specifying an algorithm. The `jsonwebtoken` library defaults to HS256, but not pinning it explicitly leaves the door open for algorithm confusion attacks.

**Fix**:
Add `{ algorithm: 'HS256' }` to `jwt.sign()` options and `{ algorithms: ['HS256'] }` to `jwt.verify()` options.

**Files**:
- `backend/src/services/authService.ts`

---

## High Priority

### TD-004: No Content-Security-Policy Header
**Status**: Open
**Created**: 2026-04-08
**Impact**: High - Missing XSS mitigation layer for a financial application
**Effort**: Medium

**Problem**:
`backend/src/app.ts` sets `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, and `HSTS` as inline middleware but has no `Content-Security-Policy` header. For an app that renders markdown (chatbot) and user financial data, CSP is an important defense-in-depth measure.

**Fix**:
Add a strict CSP header. Consider adopting the `helmet` middleware package which provides sensible defaults for all security headers.

**Files**:
- `backend/src/app.ts`

---

### TD-005: In-Memory Rate Limiting Resets on Restart
**Status**: Open
**Created**: 2026-04-08
**Impact**: High - Rate limits are trivially bypassable by forcing a PM2 restart
**Effort**: Medium

**Problem**:
Both auth rate limiting (`backend/src/middleware/authMiddleware.ts:146-185`) and chatbot rate limiting (`backend/src/routes/chatbot.ts:24-57`) use in-memory `Map`s. These reset on every process restart and don't work across multiple processes.

**Fix**:
Move rate-limit state to Redis or a persistent file-backed store. For the current single-process deployment, even a simple JSON file with TTL cleanup would survive PM2 restarts.

**Files**:
- `backend/src/middleware/authMiddleware.ts`
- `backend/src/routes/chatbot.ts`

---

### TD-006: No Role-Based Authorization for Admin Routes
**Status**: Open
**Created**: 2026-04-08
**Impact**: High - Any authenticated user can run data migrations and access system internals
**Effort**: Medium

**Problem**:
Admin routes in `backend/src/routes/admin.ts` only check that a user is authenticated — there is no admin role check. The same file uses `(categoryService as any).dataService` three times to bypass TypeScript encapsulation for migration operations.

**Fix**:
1. Add an `isAdmin` flag to user records
2. Create an `adminMiddleware` that checks the flag
3. Move migration operations into a typed `AdminService` to eliminate `as any` casts

**Files**:
- `backend/src/routes/admin.ts`
- `backend/src/services/authService.ts` (user model)
- New: `backend/src/middleware/adminMiddleware.ts`
- New: `backend/src/services/adminService.ts`

---

### TD-007: 401 Handler Bypasses Store Logout
**Status**: Resolved (2026-04-08)
**Created**: 2026-04-08
**Impact**: High - Stale data from previous session persists after forced logout
**Effort**: Low

**Problem**:
`frontend/src/lib/api/client.ts` calls `window.location.href = '/login'` on 401 responses instead of calling `authStore.logout()`. This skips React Query cache cleanup and filter state reset.

**Fix**:
Import and call `authStore.getState().logout()` instead of the raw redirect.

**Files**:
- `frontend/src/lib/api/client.ts`

---

## Medium Priority

### TD-008: Repeated Inline Error Casting on Frontend
**Status**: Open
**Created**: 2026-04-08
**Impact**: Medium - Maintainability; error handling is `any`-equivalent in practice
**Effort**: Low

**Problem**:
Error handling across 10+ frontend files uses the same inline cast: `error as { response?: { data?: { error?: string } } }`. This pattern is repeated everywhere and is effectively `any`-typed.

**Fix**:
Extract a shared `getApiErrorMessage(error: unknown): string` utility and use it across all error handling sites.

**Files**:
- New: `frontend/src/lib/api/errors.ts`
- Multiple files in `frontend/src/pages/` and `frontend/src/components/`

---

### TD-009: Stale @types/react-router-dom v5
**Status**: Resolved (2026-04-08)
**Created**: 2026-04-08
**Impact**: Medium - v5 types silently suppress errors for v7-specific APIs
**Effort**: Trivial

**Problem**:
`react-router-dom@7.8.2` ships its own TypeScript types, but `@types/react-router-dom@5.3.3` is still installed. The outdated types shadow the correct v7 types.

**Fix**:
`cd frontend && npm uninstall @types/react-router-dom`

**Files**:
- `frontend/package.json`

---

### TD-010: Large Page Components Need Decomposition
**Status**: Open
**Created**: 2026-04-08
**Impact**: Medium - Maintainability; hard to test and reason about
**Effort**: High

**Problem**:
Several page components exceed 500 lines with mixed concerns:
- `frontend/src/pages/MantineAccounts.tsx` (688 lines) — sync/disconnect/reconnect logic inline
- `frontend/src/pages/Budgets.tsx` (592 lines) — modal state, copy-budget, URL sync mixed
- `frontend/src/pages/MantineDashboard.tsx` (515 lines) — all queries and UI co-located

The Transactions page already demonstrates the better pattern (extracted hooks, toolbar, table, store).

**Fix**:
Follow the Transactions decomposition pattern: extract domain-specific hooks (`useAccountSync`, `useBudgetActions`, etc.) and split rendering into sub-components.

**Files**:
- `frontend/src/pages/MantineAccounts.tsx`
- `frontend/src/pages/Budgets.tsx`
- `frontend/src/pages/MantineDashboard.tsx`

---

## Reports Page: Excessive Parallel API Requests
**Status**: Open (carried from previous tracker)
**Created**: 2025-10-14
**Impact**: High - Causes 503 errors on Reports page load
**Effort**: Medium

See [completed/AI-TECHNICAL-DEBT.md](completed/AI-TECHNICAL-DEBT.md) for full details. The root cause (12 parallel monthly budget requests) remains — a `GET /api/v1/budgets/year/:year` batch endpoint is the proper fix.
