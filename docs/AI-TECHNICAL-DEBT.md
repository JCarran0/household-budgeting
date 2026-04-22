# Technical Debt Tracker

## Overview
This document tracks technical debt items identified during the April 2026 architecture audits. Items are prioritized by severity and linked to relevant code locations.

**Last Updated**: 2026-04-22
**Previous (archived)**: [docs/completed/AI-TECHNICAL-DEBT.md](completed/AI-TECHNICAL-DEBT.md)
**Execution sequencing**: [TECH-DEBT-EXECUTION-PLAN-2026-04.md](TECH-DEBT-EXECUTION-PLAN-2026-04.md)

## Audits
- **2026-04-08** — initial audit, TD-001 through TD-010
- **2026-04-22** — architect review, TD-011 through TD-017 (also updated TD-010)

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
**Updated**: 2026-04-22 (re-audit found significantly larger files than originally tracked)
**Impact**: High - Single-edit blast radius; Tasks.tsx in particular blocks Leaderboard v2.0 work
**Effort**: High

**Problem**:
The 2026-04-22 re-audit found the file-size problem is materially worse than TD-010 originally captured. Updated list, ordered by severity:

| File | LOC | Notes |
|---|---|---|
| `frontend/src/pages/Tasks.tsx` | **1835** | Kanban + Checklist + Leaderboard + Snooze + drag-drop + 300 LOC of modal forms. Every Task Leaderboard v2.0 change lands here. **Highest priority.** |
| `backend/src/services/amazonReceiptService.ts` | **1215** | 22 methods spanning PDF parsing → matching → categorization → rule suggestion. Mixes vision API calls, async state machines, business logic. |
| `frontend/src/pages/Trips.tsx` | **1078** | Trip list + new-trip flow. Imports Google Maps SDK on mount. |
| `frontend/src/pages/Settings.tsx` | **871** | |
| `frontend/src/components/budgets/BudgetVsActualsII/BudgetVsActualsII.tsx` | **716** | Data composition + rendering + URL state + dismissal logic interleaved. |
| `frontend/src/pages/MantineAccounts.tsx` | 688 | Original TD-010 entry |
| `frontend/src/pages/Budgets.tsx` | 592 | Original TD-010 entry |
| `frontend/src/pages/TripDetail.tsx` | 547 | |
| `frontend/src/pages/MantineDashboard.tsx` | 515 | Original TD-010 entry |

The Transactions page already demonstrates the better pattern (extracted hooks, toolbar, table, store) and `EnhancedTransactions.tsx` reduced from 1613 → 544 LOC the same way.

**Fix**:
Address in priority order. For Tasks.tsx (largest blast radius and most active feature surface):
1. Extract `TaskKanban`, `TaskChecklist`, `TaskLeaderboard`, `TaskFormModal` as sibling components under `components/tasks/`
2. Move snooze/drag-drop state into focused hooks
3. **Write tests for the extracted units as part of the split** (do not refactor 1835 LOC without coverage)

For `amazonReceiptService.ts`: split into `AmazonPdfParser`, `AmazonMatcher`, `AmazonCategorizerAdapter` — registry stays in the service. Prompts already separated into `amazonReceiptPrompt.ts`.

For BvA II: extract `BudgetVsActualsTable` render subcomponent; keep `useBvaIIUrlState` hook for state. Display utilities already in `bvaIIDisplay.ts`.

**Files**:
See table above. Sequence: Tasks.tsx → BvA II → amazonReceiptService → Trips/Settings → original TD-010 trio.

---

## 2026-04-22 Audit Additions

### TD-011: File-Storage Read-Modify-Write Race + Read Amplification
**Status**: Parts 1a + 1b Resolved (2026-04-22, Sprint 1); Part 3 (SQLite migration) deferred per the cross-cutting section of the execution plan.
**Created**: 2026-04-22
**Impact**: Critical - Silent data loss on concurrent edits; full-collection reads on every mutation amplify chatbot cost
**Effort**: Low (mutex + memoization) / High (move to SQLite)

**Problem**:
Every mutation in `transactionService.ts` runs `repo.getAll(familyId)` → mutate in memory → `saveAll()`. There is no locking between the read and the write. Two users editing concurrently — realistic for a 2-person family using mobile + desktop — produce a lost-write where the slower request silently clobbers the other's change.

Read amplification compounds this: at 800+ transactions, every single-entity mutation deserializes the entire collection from S3 (in production) or disk (in dev). 13 call sites in `transactionService.ts` (lines 453, 481, 509, 540, 577, 661, 688, 715, 755, 776, 811, 840) call `repo.getAll(familyId)` as part of a single-entity operation. The chatbot multiplies this further: `chatbotDataService.query_transactions()` does the same full read, then filters in-memory, on every tool iteration (up to 10 per message).

**Fix**:
1. **Short term — concurrency.** ✅ Added `Repository.withLock(familyId, fn)` (async-mutex, per-`(repo, familyId)` key) and wrapped every read-modify-write in `transactionService.ts` with it — eliminates lost writes. Other services can adopt `withLock` incrementally as concurrent-edit surfaces are identified.
2. **Short term — read cost.** ✅ Added `requestScopeMiddleware` (AsyncLocalStorage-based) and taught `UnifiedDataService.getData/saveData/deleteData` to consult/populate a per-request memo. Works for both `Repository.getAll` and `ReadOnlyDataService.getData` (the chatbot's path), so the 10× tool-loop amplification collapses to one read per collection per request.
3. **Medium term — storage migration.** File-based JSON is approaching its scaling ceiling. Plan SQLite (single-file, S3-friendly via litestream, near-zero ops cost) before transactions cross ~5k. This deprecates much of TD-011 wholesale.

**Files**:
- `backend/src/services/repository.ts` ✅
- `backend/src/services/transactionService.ts` ✅
- `backend/src/services/dataService.ts` ✅ (memoization lives at data layer so ReadOnlyDataService benefits too)
- `backend/src/middleware/requestScope.ts` ✅ (new)
- `backend/src/app.ts` ✅ (middleware wiring)

---

### TD-012: Chatbot Cost — No Prompt Caching, Unbounded Tool Results
**Status**: Part 1 Resolved (2026-04-22, Sprint 1) — prompt caching shipped. Part 2 (tool result caps) deferred to Sprint 2 per the execution plan.
**Created**: 2026-04-22
**Impact**: High - Real Anthropic spend on every chatbot turn; latency scales with transaction count
**Effort**: Trivial (cache_control) / Medium (tool result caps)

**Problem**:
Two independent inefficiencies in the chatbot flow inflate cost and latency:

1. **No Anthropic prompt caching.** `chatbotService.ts` builds a stable system prompt + tool definitions on every request but does not set `cache_control: { type: 'ephemeral' }`. With a stable prefix, cache hit rate would be high — direct cost reduction. The 5-minute TTL aligns well with conversational turn cadence.
2. **Tool results dump full transaction arrays into context.** `query_transactions()` returns the entire matched array verbatim into the model context. With 800+ transactions and broad filters (e.g., "show me all dining last year"), this is tens of KB of input tokens per tool call, multiplied by up to 10 tool iterations per message.

**Fix**:
1. ✅ Added `cache_control: { type: 'ephemeral' }` to both the system prompt (via structured `TextBlockParam[]` — base prompt cached, per-request `userDisplayName` suffix appended AFTER the breakpoint so it doesn't invalidate the cache) and the last entry of `CHATBOT_TOOLS`. Effect verifiable via `cache_read_input_tokens > 0` on the second turn of any conversation.
2. Cap tool results: default `limit=50` on `query_transactions()`. For larger result sets return `{ count, sample, summary: { byCategory, byMonth } }` and let the model request more if needed. *(Sprint 2)*
3. Push date/category filters into the storage layer so the full collection isn't loaded just to be discarded (depends on TD-011 memoization or a real index).

**Files**:
- `backend/src/services/chatbotService.ts`
- `backend/src/services/chatbotDataService.ts`
- `backend/src/services/chatbotPrompt.ts`

---

### TD-013: React Query Invalidation Cascades
**Status**: Open
**Created**: 2026-04-22
**Impact**: High - UX-visible flicker on every edit; amplifies TD-011 read cost
**Effort**: Low (per-page audit)

**Problem**:
Mutations invalidate queries with broad keys: `invalidateQueries({ queryKey: ['transactions'] })` after a single transaction edit refetches every query whose key starts with `'transactions'` — across Dashboard, Reports, Budgets, EnhancedTransactions. Same pattern with `['budgets']` (`frontend/src/pages/Budgets.tsx:208`).

Two costs:
- **UX**: Visible flicker and re-fetch latency on pages the user isn't looking at.
- **Storage**: Every cascaded refetch triggers another full file read (TD-011), so this and TD-011 amplify each other.

**Fix**:
Tighten query keys to `['transactions', familyId, { month, filters }]` and invalidate the specific shape. For the optimistic-update case, prefer `setQueryData` over invalidation. Half-day audit across `frontend/src/pages/` and `frontend/src/hooks/`.

**Files**:
- `frontend/src/hooks/useTransactionData.ts`
- `frontend/src/pages/EnhancedTransactions.tsx` (line 75 area)
- `frontend/src/pages/Budgets.tsx` (line 208 area)
- `frontend/src/pages/MantineAccounts.tsx` (lines 119–120)

---

### TD-014: Frontend Has Zero Tests
**Status**: Open
**Created**: 2026-04-22
**Impact**: High - Financial math (rollover, BvA II, dismissed-parents) is in the frontend with no regression detection
**Effort**: Medium

**Problem**:
Backend has 51 test files. Frontend has zero. Meanwhile the most invariant-sensitive code in the app — rollover effective-budget computation, BvA II tone classification, and the `useDismissedParentIds` hook that CLAUDE.md explicitly flags as "code review must guard every touchpoint" — lives in or is consumed by the frontend.

The `useDismissedParentIds`-vs-`Category.isHidden` distinction is exactly the kind of invariant a test enforces mechanically and a human eventually misses.

**Fix**:
Two-stage approach to maximize value per hour invested:

1. **Stage 1 — `shared/utils` tests in the backend runner.** The rollover and BvA math live in `shared/utils/budgetCalculations.ts`, `bvaIIDataComposition.ts`, `bvaIIDisplay.ts`, `bvaIIFilters.ts`. These are pure functions and run fine in the existing backend Vitest setup — no new harness needed. Highest-leverage tests:
   - `computeRolloverBalance`, `computeEffectiveBudget`, `buildEffectiveBudgetsMap` — the core math
   - `findRolloverSubtreeConflicts` — subtree-exclusivity invariant
   - BvA II variance sign convention across spending/income/savings types
   - `classifyTreeBudgetState`, `isTreeOverBudget`, `isTreeUnused`
2. **Stage 2 — Vitest + React Testing Library in frontend.** Then add ~5–10 component-level tests:
   - `useDismissedParentIds` — assert it never touches `Category.isHidden`
   - `useBvaIIUrlState` — round-trip (URL → state → URL)
   - Tasks.tsx extracted components (write these as part of TD-010 split)
   - Error boundary recovery

Stage 1 is done in an afternoon; stage 2 spreads across feature work.

**Files**:
- `shared/utils/__tests__/` (new — symlink or test-import path under `backend/`)
- `frontend/vitest.config.ts` (new)
- `frontend/src/**/__tests__/` (new)

---

### TD-015: Markdown Rendering of LLM/User Content Lacks Sanitization
**Status**: Open
**Created**: 2026-04-22
**Impact**: High - XSS risk via chatbot output; relevant to financial app threat model
**Effort**: Low

**Problem**:
The chatbot renders LLM-generated markdown in `ChatOverlay.tsx` / `ActionCard.tsx`. Even though no `dangerouslySetInnerHTML` was found in the audit, any markdown renderer that supports raw HTML passthrough (or any future change to one that does) becomes an XSS vector via prompt injection — a transaction memo or a tampered tool response could carry hostile markup.

This is **related to but distinct from TD-004 (CSP)**. CSP is the outer envelope; sanitization is the inner one. Defense in depth: do both, do them together.

**Fix**:
1. Run all chatbot-rendered markdown through DOMPurify (or use `react-markdown` with `rehype-sanitize`).
2. Audit other surfaces that render user-controlled rich text: trip notes, task descriptions, Amazon receipt parsed item names, project descriptions.
3. Pair this PR with TD-004 — the security headers and the sanitization belong in the same review.

**Files**:
- `frontend/src/components/chat/ChatOverlay.tsx`
- `frontend/src/components/chat/ActionCard.tsx`
- Any other markdown render sites surfaced by the audit

---

### TD-016: Plaid Sync Re-Pulls a Year on Every Manual Sync
**Status**: Open
**Created**: 2026-04-22
**Impact**: Medium - Plaid quota burn + sync latency; will get worse as date window stretches
**Effort**: Medium

**Problem**:
`plaidService.ts:132` hardcodes `startDate: '2025-01-01'` and uses Plaid's offset-paginated `transactionsGet` API. Every manual sync re-fetches the entire window even if only one transaction posted today. Plaid offers `transactionsSync` which is cursor-based and explicitly designed for incremental sync.

**Fix**:
1. Migrate to `transactionsSync`: store the cursor per `Item` (linked Plaid account) and pass it on subsequent calls.
2. The response includes `added`, `modified`, `removed` arrays — apply them to the local store.
3. Side benefit: simplifies the eventual webhook handler (also in pending changes list) since both surfaces consume the same cursor model.

**Files**:
- `backend/src/services/plaidService.ts`
- `backend/src/services/transactionService.ts` (lines 129–245 — sync orchestration)
- Account/Item storage shape (add `plaidCursor` field)

---

### TD-017: Console Logging Throughout — No Structured Logger
**Status**: Open
**Created**: 2026-04-22
**Impact**: Medium - Incident response is grep-archaeology; PII redaction is per-call-site
**Effort**: Medium

**Problem**:
The backend uses `console.log` / `console.error` directly throughout. In production these go to PM2 stdout/stderr. There is no structured JSON output, no log-level discipline, no centralized PII redaction, and no integration with monitoring. When something breaks in prod, debugging is `pm2 logs | grep` and hoping you remember the right substring.

A specific concrete leak: `transactionService.ts:163` logs `account.accountName` for failed-decryption accounts — a structured logger with field-level redaction prevents this category of mistake at the edge.

**Fix**:
1. Adopt Pino. Replace `console.*` with logger calls. JSON output by default in production, pretty-print in dev.
2. Configure a redaction list for sensitive fields: `accessToken`, `password`, `accountNumber`, `email`, `accountName`, `plaidAccessToken`, etc.
3. Forward production logs to CloudWatch (the EC2 instance is already in AWS — minor IAM + agent setup).

**Files**:
- `backend/src/utils/logger.ts` (new)
- `backend/src/**/*.ts` (codemod `console.log` → `logger.info`)
- `ecosystem.config.js` (PM2 log rotation if not already configured)

---

## Reports Page: Excessive Parallel API Requests
**Status**: Open (carried from previous tracker)
**Created**: 2025-10-14
**Impact**: High - Causes 503 errors on Reports page load
**Effort**: Medium

See [completed/AI-TECHNICAL-DEBT.md](completed/AI-TECHNICAL-DEBT.md) for full details. The root cause (12 parallel monthly budget requests) remains — a `GET /api/v1/budgets/year/:year` batch endpoint is the proper fix.
