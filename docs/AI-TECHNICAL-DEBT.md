# Technical Debt Tracker

## Overview
This document tracks technical debt items identified during the April 2026 architecture audits. Items are prioritized by severity and linked to relevant code locations.

**Last Updated**: 2026-08-02
**Previous (archived)**: [docs/completed/AI-TECHNICAL-DEBT.md](completed/AI-TECHNICAL-DEBT.md)
**Execution sequencing**: [TECH-DEBT-EXECUTION-PLAN-2026-04.md](TECH-DEBT-EXECUTION-PLAN-2026-04.md)

## Audits
- **2026-04-08** — initial audit, TD-001 through TD-010
- **2026-04-22** — architect review, TD-011 through TD-017 (also updated TD-010)
- **2026-06-02** — trip-photo corruption incident: updated TD-011 (`tripService` unprotected RMW surface), added TD-019 (backup posture)
- **2026-08-02** — Capital One card-reissue incident: added TD-020 (`account_id` change → silent data loss), TD-021 (no Plaid webhooks / no staleness surface), TD-022 (silent sync error paths); reopened TD-017 (CloudWatch forwarding never enabled, so the logging payoff is unrealized)

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
**Status**: Resolved (2026-04-23, Sprint 3) for the backend JSON surface. SPA-side CSP (the policy that actually applies when a browser renders an HTML page) is left as a follow-up at the nginx layer — adding a meta tag `<head>` CSP without runtime browser verification risks breaking Plaid Link / Google Maps / Mantine inline styles in production.
**Created**: 2026-04-08
**Impact**: High - Missing XSS mitigation layer for a financial application
**Effort**: Medium

**Problem**:
`backend/src/app.ts` sets `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, and `HSTS` as inline middleware but has no `Content-Security-Policy` header. For an app that renders markdown (chatbot) and user financial data, CSP is an important defense-in-depth measure.

**Fix**:
✅ Adopted `helmet` in `backend/src/app.ts`. The backend serves JSON only (the SPA is built and served separately by nginx), so the CSP is locked down to `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` — there is no legitimate reason for a browser to ever execute a script from one of these responses. Helmet also covers HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Cross-Origin-Resource-Policy with sane defaults; the prior inline header block is removed.

Follow-up (separate, requires browser smoke test):
- Add a CSP at the nginx layer (or a `<meta http-equiv>` in `frontend/index.html`) that allows the SPA's actual third-party origins: `cdn.plaid.com` (Plaid Link), `maps.googleapis.com`/`maps.gstatic.com` (Google Maps), `fonts.googleapis.com`/`fonts.gstatic.com` (Google Fonts), and `'unsafe-inline'` for `style-src` (Mantine CSS-in-JS). Pair with a runtime walk through Plaid Link, the Trips map, and the chatbot to confirm nothing breaks before promoting to production.

**Files**:
- `backend/src/app.ts` ✅
- `backend/package.json` ✅ (helmet dep)
- `backend/src/__tests__/app.test.ts` ✅ (asserts CSP / nosniff / HSTS on /health)

---

### TD-005: In-Memory Rate Limiting Resets on Restart
**Status**: Resolved (2026-04-23, Sprint 3)
**Created**: 2026-04-08
**Impact**: High - Rate limits are trivially bypassable by forcing a PM2 restart
**Effort**: Medium

**Problem**:
Both auth rate limiting (`backend/src/middleware/authMiddleware.ts:146-185`) and chatbot rate limiting (`backend/src/routes/chatbot.ts:24-57`) use in-memory `Map`s. These reset on every process restart and don't work across multiple processes.

**Fix**:
✅ Introduced `backend/src/middleware/rateLimit/` with a shared `PersistentRateLimitStore` (file at `DATA_DIR/rate_limits.json`, debounced 1s flushes via atomic-rename, expired-bucket GC on flush, capped at 50k buckets). The store is local-to-process — kept on EBS even when user data lives in S3, since rate-limit state is per-instance, not per-family. Window/state survives PM2 restart by being reloaded on construction.

Three named limiters wired through the same store:
- `rateLimitGlobalApi` — per-IP, 100 req/min, applied to the entire `/api` surface in `app.ts` (closes the auth-only-coverage gap from the original TD).
- `rateLimitAuth` — per-IP, 10 req / 15 min, re-exported from `authMiddleware.ts` so all existing callers (`authRoutes.ts`, `feedback.ts`) need no edits.
- `rateLimitChatbot` — per-userId, 5 req/min, replaces the inline `Map` in `routes/chatbot.ts`.

The test-mode bypass (`NODE_ENV === 'test'`) is preserved so existing auth/chatbot tests continue exercising the underlying handlers without rate-limit interference. Direct unit tests on the store cover the PM2-restart contract, expiry GC, scope isolation, and corruption recovery (`backend/src/__tests__/unit/persistentRateLimitStore.test.ts`).

**Files**:
- `backend/src/middleware/rateLimit/persistentStore.ts` ✅ (new)
- `backend/src/middleware/rateLimit/index.ts` ✅ (new — factory + named limiters)
- `backend/src/middleware/authMiddleware.ts` ✅ (re-exports through new module)
- `backend/src/routes/chatbot.ts` ✅ (drops inline Map, imports from new module)
- `backend/src/app.ts` ✅ (mounts `rateLimitGlobalApi` on `/api`)
- `backend/src/__tests__/unit/persistentRateLimitStore.test.ts` ✅ (new)

---

### TD-006: No Role-Based Authorization for Admin Routes
**Status**: Resolved (2026-04-24, Sprint 5)
**Created**: 2026-04-08
**Impact**: High - Any authenticated user can run data migrations and access system internals
**Effort**: Medium

**Problem**:
Admin routes in `backend/src/routes/admin.ts` only check that a user is authenticated — there is no admin role check. The same file uses `(categoryService as any).dataService` three times to bypass TypeScript encapsulation for migration operations.

**Fix**:
✅ Added optional `isAdmin?: boolean` to the `User` interface in `backend/src/services/dataService.ts`. Older user records omit the flag and are treated as non-admin — fail-closed by default.

✅ New `backend/src/middleware/adminMiddleware.ts` mounted on the admin router after `authMiddleware`. Resolution order per request:
1. If the stored `User.isAdmin === true` → allow
2. Else if the username is in the `ADMIN_USERNAMES` env var (comma-separated, case-insensitive) → persist `isAdmin=true` to storage, then allow (one-time bootstrap)
3. Else → **403 Admin privileges required**

The env-var path is deliberately self-healing: setting `ADMIN_USERNAMES=jared` in prod env + restarting is enough for Jared's next admin hit to persist the flag, after which the env can be unset without revoking access. Fail-closed when unset *and* no user has the flag. Documented in `backend/.env.example`.

✅ New `backend/src/services/adminService.ts` owns the three migration methods that previously reached into CategoryService's private `dataService` field via `(categoryService as any).dataService`. `AdminService` takes `DataService` via constructor injection — `DataService.getCategories` / `saveCategories` is already on the public contract, so no encapsulation pierce is needed. Three methods: `migrateSavingsToRollover`, `getSavingsMigrationStatus`, `getIsIncomeMigrationStatus`. The `migrate-is-income` POST still calls `categoryService.migrateIsIncomeProperty` directly — that method is already public and typed, so wrapping it in AdminService would be busywork.

✅ All three `(categoryService as any).dataService` casts in `admin.ts` removed. The `any`-typed `.map((category: any)` body in `migrate-savings-to-rollover` is replaced by a typed `LegacyCategory = Category & { isSavings?: boolean }` shape in AdminService — the only place in the codebase that still references the legacy field.

**Tests**: 5 new critical-tier Jest cases in `backend/src/__tests__/critical/adminMiddleware.test.ts`:
- unauthenticated → 401
- authenticated non-admin → 403 ("Admin privileges required")
- stored `isAdmin === true` → 200 (AdminService payload surfaces)
- `ADMIN_USERNAMES` auto-promotion path: 403 before env, 200 after, persisted `isAdmin=true` in storage, 200 still succeeds after the env is cleared
- user NOT in `ADMIN_USERNAMES` is not promoted and `isAdmin` remains undefined

Backend: **850 tests** (from 845). Typecheck + lint clean. Integration suite: 308/308 unchanged.

**Files**:
- `backend/src/services/dataService.ts` ✅ (User.isAdmin flag)
- `backend/src/middleware/adminMiddleware.ts` ✅ (new)
- `backend/src/services/adminService.ts` ✅ (new)
- `backend/src/services/index.ts` ✅ (adminService singleton + type re-export)
- `backend/src/routes/admin.ts` ✅ (mounts adminMiddleware; replaces 3 `as any` casts with AdminService calls)
- `backend/.env.example` ✅ (documents ADMIN_USERNAMES)
- `backend/src/__tests__/critical/adminMiddleware.test.ts` ✅ (new, 5 cases)

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
**Status**: Resolved (2026-04-24, Sprint 5)
**Created**: 2026-04-08
**Impact**: Medium - Maintainability; error handling is `any`-equivalent in practice
**Effort**: Low

**Problem**:
Error handling across 10+ frontend files uses the same inline cast: `error as { response?: { data?: { error?: string } } }`. This pattern is repeated everywhere and is effectively `any`-typed.

**Fix**:
✅ Introduced `frontend/src/lib/api/errors.ts` with `getApiErrorMessage(error: unknown, fallback?: string): string` and `getApiErrorStatus(error: unknown): number | undefined`. The helper uses `axios.isAxiosError()` when applicable and duck-types `{ response: { data: { error | message } } }` shapes otherwise, so existing tests that throw plain objects (e.g. `PasswordSection.test.tsx:92`) keep working. Migrated 11 call sites across `authStore.ts` (2 — login/register error surfacing), `queryClient.ts` (2 — retry-on-status branch + global mutation toast), `MantineAccounts.tsx` (3 — sync/sync-all/disconnect toast), `CategoryDeletionModal.tsx`, `CSVImport.tsx`, `CategorizationFlowModal.tsx`, `PasswordSection.tsx`, `NotificationPermission.tsx` (status-code branch), `TripDetail.tsx` (404 branch), `AmazonReceiptFlowModal.tsx` (replaces local `getErrorMessage` + drops direct `axios` import), `BudgetEditModal.tsx` (replaces local `getErrorMessage` + drops `ApiErrorShape` interface). **Intentionally left**: `AddStopSheet.tsx:314` reads a structured `Partial<StayOverlapPayload>` from response data (not just a message), and `CategoryForm.tsx` reads `.code` + `.details` for rollover-validation flows — both go beyond the helper's message/status contract. 16 Vitest cases on the new utility cover axios errors, duck-typed shapes, `Error` instances, strings, null/undefined, and empty-field fallthrough. Frontend test total: **172** (from 156).

**Files**:
- `frontend/src/lib/api/errors.ts` ✅ (new)
- `frontend/src/lib/api/errors.test.ts` ✅ (new, 16 cases)
- `frontend/src/lib/queryClient.ts` ✅
- `frontend/src/stores/authStore.ts` ✅
- `frontend/src/pages/MantineAccounts.tsx` ✅
- `frontend/src/pages/TripDetail.tsx` ✅
- `frontend/src/components/settings/PasswordSection.tsx` ✅
- `frontend/src/components/pwa/NotificationPermission.tsx` ✅
- `frontend/src/components/categories/CategoryDeletionModal.tsx` ✅
- `frontend/src/components/categories/CSVImport.tsx` ✅
- `frontend/src/components/transactions/CategorizationFlowModal.tsx` ✅
- `frontend/src/components/transactions/AmazonReceiptFlowModal.tsx` ✅
- `frontend/src/components/budgets/BudgetVsActuals/BudgetEditModal.tsx` ✅

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
| ✅ `backend/src/services/amazonReceiptService.ts` | 636 (from 1215) | Resolved 2026-04-24. Split into `amazon/amazonMatcher.ts` (pure tiered match), `amazon/amazonPdfParser.ts` (Claude vision + sanitize), `amazon/amazonCategorizerAdapter.ts` (Claude categorization + rounding). 36 new Jest cases. |
| `frontend/src/pages/Trips.tsx` | **1078** | Trip list + new-trip flow. Imports Google Maps SDK on mount. |
| `frontend/src/pages/Settings.tsx` | **871** | |
| `frontend/src/components/budgets/BudgetVsActualsII/BudgetVsActualsII.tsx` | **716** | Data composition + rendering + URL state + dismissal logic interleaved. |
| ✅ `frontend/src/pages/MantineAccounts.tsx` | 377 (from 688) | Resolved 2026-04-24. Extracted `ConnectedAccountCard`, `ManualAccountCard`, `DisconnectAccountModal`, `DeleteManualAccountModal`, `accountCategories.ts`. 25 new Vitest cases. |
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
**Status**: Parts 1a + 1b Resolved (2026-04-22, Sprint 1); Part 3 (SQLite migration) deferred per the cross-cutting section of the execution plan. **`tripService` identified as an unprotected surface (2026-06-02) — see update below.**
**Created**: 2026-04-22
**Updated**: 2026-06-02
**Impact**: Critical - Silent data loss on concurrent edits; full-collection reads on every mutation amplify chatbot cost
**Effort**: Low (mutex + memoization) / High (move to SQLite)

**Problem**:
Every mutation in `transactionService.ts` runs `repo.getAll(familyId)` → mutate in memory → `saveAll()`. There is no locking between the read and the write. Two users editing concurrently — realistic for a 2-person family using mobile + desktop — produce a lost-write where the slower request silently clobbers the other's change.

Read amplification compounds this: at 800+ transactions, every single-entity mutation deserializes the entire collection from S3 (in production) or disk (in dev). 13 call sites in `transactionService.ts` (lines 453, 481, 509, 540, 577, 661, 688, 715, 755, 776, 811, 840) call `repo.getAll(familyId)` as part of a single-entity operation. The chatbot multiplies this further: `chatbotDataService.query_transactions()` does the same full read, then filters in-memory, on every tool iteration (up to 10 per message).

**Fix**:
1. **Short term — concurrency.** ✅ Added `Repository.withLock(familyId, fn)` (async-mutex, per-`(repo, familyId)` key) and wrapped every read-modify-write in `transactionService.ts` with it — eliminates lost writes. Other services can adopt `withLock` incrementally as concurrent-edit surfaces are identified.
2. **Short term — read cost.** ✅ Added `requestScopeMiddleware` (AsyncLocalStorage-based) and taught `UnifiedDataService.getData/saveData/deleteData` to consult/populate a per-request memo. Works for both `Repository.getAll` and `ReadOnlyDataService.getData` (the chatbot's path), so the 10× tool-loop amplification collapses to one read per collection per request.
3. **Medium term — storage migration.** File-based JSON is approaching its scaling ceiling. Plan SQLite (single-file, S3-friendly via litestream, near-zero ops cost) before transactions cross ~5k. This deprecates much of TD-011 wholesale.

**Update (2026-06-02) — `tripService` surfaced as a concurrent-edit case.**
The "other services adopt `withLock` incrementally as surfaces are identified" caveat in fix (1) came due. The self-healing trip-photo feature ([TRIP-PLACE-PHOTOS](features/TRIP-PLACE-PHOTOS-BRD.md)) fired N parallel `updateStop` PATCHes on page load; each is an unlocked `loadTrips → mutate → saveTrips` cycle. The race manifested exactly as TD-011 predicts:
- **Filesystem adapter (local dev):** non-atomic `fs.writeJson` → torn file. `trips_{familyId}.json` was corrupted with a valid array followed by a leftover tail fragment (`SyntaxError: Unexpected non-whitespace character after JSON`). Repaired by hand; corrupt copy preserved as `*.corrupt.bak`.
- **S3 adapter (prod):** `PutObject` is atomic so no corruption, but the N writes off one baseline → lost updates (only one stop's heal survives, the rest silently dropped and re-fire each reload). Prod object verified valid; no data loss.

Stopgap shipped (`f8fc1d4`): the caller (`refreshTripPhotos`) now serializes its PATCHes — fetches stay parallel, writes are sequential. This removed the trigger but was a band-aid at one call site.

**Proper fix — ✅ done (2026-06-03).** `tripService` now owns a `Repository<StoredTrip>` and wraps all four read-modify-write cycles (`createTrip`, `updateTrip`, `deleteTrip`, `saveStopsOnTrip` — the last covers every stop op) in `Repository.withLock(familyId, fn)`, the same pattern `transactionService` uses. Regression locked in by `tripService.concurrency.test.ts`, which fires N parallel `updateStop`s through a write-delaying `DataService` stub and asserts no lost updates — verified to fail without the lock. The caller-side serialization in `refreshTripPhotos` is now belt-and-suspenders; it can stay (parallel writes would be safe but pointless).

**Remaining services audited (2026-06-03).** All four JSON-backed services have the same unprotected `load → mutate → save` shape and are all module singletons (so `withLock` *would* apply if added), but the calibrated risk is **Low**, not the mechanical "High" a pattern-match gives — because none of them has a *trigger*. The trip case was elevated specifically because the photo-heal feature fired N writes in parallel programmatically; nothing here does:

| Service | Unprotected mutators | Parallel-write trigger today? | Real risk |
|---------|---------------------|-------------------------------|-----------|
| `taskService` | create/update/delete/updateStatus/snooze/reorder | No — drag-drop fires **one** `reorderTask` per drop (`TaskKanban.tsx:246`, `ChecklistView.tsx:480`), not a batch. `reorderTask` does load→(updateTaskStatus)→load→save, widening its own window but still single-request | Low |
| `projectService` | create/update/delete | No — human-paced. **Caveat:** `updateProject`/`deleteProject` also write `transactions_`/`tasks_` directly, bypassing those services' own locks. Wrapping naively risks lock-ordering deadlock — needs care, not a copy-paste of the trip fix | Low (but the cross-collection bypass is a separate, broader consistency gap) |
| `wishlistService` | create/update/delete | No | Low |
| `categoryService` | create/update/delete + idempotent `migrate*` | No — `migrate*` transforms are idempotent (concurrent runs converge); no seeding path fires in parallel | Low |

**Decision: do not mechanically lock all four now.** It's speculative hardening for a race nothing currently triggers, and the SQLite migration (Part 3) deprecates the whole RMW model. Instead: (a) add `withLock` to a service **when** a feature introduces parallel writes to it (the actual trigger — exactly how `tripService` earned it), and (b) treat `projectService`'s cross-collection writes as the one item here worth a deliberate look independent of RMW locking. Tracked, not scheduled.

**Files**:
- `backend/src/services/repository.ts` ✅
- `backend/src/services/transactionService.ts` ✅
- `backend/src/services/dataService.ts` ✅ (memoization lives at data layer so ReadOnlyDataService benefits too)
- `backend/src/middleware/requestScope.ts` ✅ (new)
- `backend/src/app.ts` ✅ (middleware wiring)
- `backend/src/services/tripService.ts` ✅ — now wraps all RMW cycles in `withLock` (2026-06-03)
- `backend/src/__tests__/unit/tripService.concurrency.test.ts` ✅ — lost-update regression (new)
- `frontend/src/hooks/useRefreshTripPhotos.ts` — caller-side serialization, now belt-and-suspenders (`f8fc1d4`)

---

### TD-012: Chatbot Cost — No Prompt Caching, Unbounded Tool Results
**Status**: Resolved (Part 1: 2026-04-22 Sprint 1; Part 2: 2026-04-23 Sprint 2). Part 3 (push filters into storage) folds into the SQLite migration — see cross-cutting section of the execution plan.
**Created**: 2026-04-22
**Impact**: High - Real Anthropic spend on every chatbot turn; latency scales with transaction count
**Effort**: Trivial (cache_control) / Medium (tool result caps)

**Problem**:
Two independent inefficiencies in the chatbot flow inflate cost and latency:

1. **No Anthropic prompt caching.** `chatbotService.ts` builds a stable system prompt + tool definitions on every request but does not set `cache_control: { type: 'ephemeral' }`. With a stable prefix, cache hit rate would be high — direct cost reduction. The 5-minute TTL aligns well with conversational turn cadence.
2. **Tool results dump full transaction arrays into context.** `query_transactions()` returns the entire matched array verbatim into the model context. With 800+ transactions and broad filters (e.g., "show me all dining last year"), this is tens of KB of input tokens per tool call, multiplied by up to 10 tool iterations per message.

**Fix**:
1. ✅ Added `cache_control: { type: 'ephemeral' }` to both the system prompt (via structured `TextBlockParam[]` — base prompt cached, per-request `userDisplayName` suffix appended AFTER the breakpoint so it doesn't invalidate the cache) and the last entry of `CHATBOT_TOOLS`. Effect verifiable via `cache_read_input_tokens > 0` on the second turn of any conversation.
2. ✅ Added `chatbotDataService.queryTransactionsForTool` — default `limit=50`, hard-cap `limit=500`. When the full match count exceeds the effective limit, returns `{ count, truncated, limit, transactions, summary: { byCategory, byMonth } }` so the model sees aggregate shape even without the row dump. `chatbotService.executeTool`'s `query_transactions` case now calls the wrapper; internal `getBudgetSummary` / `getSpendingByCategory` / `getCashFlow` continue to call `queryTransactions` directly and are unchanged. Tool description updated so Claude knows how to read the truncated response and when to widen `limit`.
3. Push date/category filters into the storage layer so the full collection isn't loaded just to be discarded. Superseded by the SQLite migration in the cross-cutting section — a real index removes this concern wholesale.

**Files**:
- `backend/src/services/chatbotService.ts`
- `backend/src/services/chatbotDataService.ts`
- `backend/src/services/chatbotPrompt.ts`

---

### TD-013: React Query Invalidation Cascades
**Status**: Resolved (2026-04-23, Sprint 2) for single-row transaction edits — the remaining broad invalidations are on sync / auto-cat / Amazon-receipt / CSV-import paths where many rows change at once and a targeted patch isn't computable client-side.
**Created**: 2026-04-22
**Impact**: High - UX-visible flicker on every edit; amplifies TD-011 read cost
**Effort**: Low (per-page audit)

**Problem**:
Mutations invalidate queries with broad keys: `invalidateQueries({ queryKey: ['transactions'] })` after a single transaction edit refetches every query whose key starts with `'transactions'` — across Dashboard, Reports, Budgets, EnhancedTransactions. Same pattern with `['budgets']` (`frontend/src/pages/Budgets.tsx:208`).

Two costs:
- **UX**: Visible flicker and re-fetch latency on pages the user isn't looking at.
- **Storage**: Every cascaded refetch triggers another full file read (TD-011), so this and TD-011 amplify each other.

**Fix**:
✅ Introduced `frontend/src/lib/transactionCacheSync.ts` with `patchTransactionsInCache` and `invalidateTransactionCounts`. Single-row edit mutations in `TransactionEditModal.tsx` (5 mutations), `TransactionTable.tsx` (inline category), and `useTransactionBulkOps.ts` (bulk confirm — success-only path; falls back to invalidation on partial failure where we can't tell which IDs succeeded) now use `setQueriesData` to patch cached rows under both the `['transactions', …]` and `['bva-ii', …]` roots in place, so the list the user is looking at stops doing a refetch round-trip on every tick of categorization work. Count queries (uncategorized, Amazon-eligible) are still invalidated since the cache-local delta can't tell us the new count.

Remaining broad `['transactions']` invalidations are intentional — they fire on multi-row changes where optimistic patch isn't feasible without mirroring server logic: `useTransactionData.syncMutation`, `EnhancedTransactions.autoCatApplyMutation`, `CategorizationFlowModal.handleClose`, `AmazonReceiptFlowModal.handleClose`, `TransactionImport`, and `MantineAccounts` sync paths. The `['budgets']` invalidations in `Budgets.tsx` and `BudgetEditModal.tsx` are untouched — already scoped to the budget entity and off the hot path.

**Files**:
- `frontend/src/lib/transactionCacheSync.ts` (new)
- `frontend/src/components/transactions/TransactionEditModal.tsx`
- `frontend/src/components/transactions/TransactionTable.tsx`
- `frontend/src/hooks/useTransactionBulkOps.ts`

---

### TD-014: Frontend Has Zero Tests
**Status**: **Largely resolved** — the title is now historical. Frontend has 31 test files / 272 passing tests as of 2026-08-02 (was zero when filed). Remaining gap is coverage of specific invariants, not absence of a harness.
**Created**: 2026-04-22
**Updated**: 2026-08-02
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
**Status**: Resolved (2026-04-23, Sprint 3)
**Created**: 2026-04-22
**Impact**: High - XSS risk via chatbot output; relevant to financial app threat model
**Effort**: Low

**Problem**:
The chatbot renders LLM-generated markdown in `ChatOverlay.tsx` / `ActionCard.tsx`. Even though no `dangerouslySetInnerHTML` was found in the audit, any markdown renderer that supports raw HTML passthrough (or any future change to one that does) becomes an XSS vector via prompt injection — a transaction memo or a tampered tool response could carry hostile markup.

This is **related to but distinct from TD-004 (CSP)**. CSP is the outer envelope; sanitization is the inner one. Defense in depth: do both, do them together.

**Fix**:
✅ Added `rehype-sanitize` and configured a narrow markdown-only `tagNames` allowlist on the `ReactMarkdown` instance in `ChatMessageBubble.tsx` (the only `react-markdown` consumer in the SPA). The schema starts from `defaultSchema` (which strips `<script>`, event handlers, `javascript:` URLs) and removes everything else that isn't part of pure markdown. `href` is restricted to `http`/`https`/`mailto`.

Audit of other user-controlled rich text surfaces:
- Trip notes (`TripDetail.tsx`), task descriptions (`Tasks.tsx`), project descriptions, Amazon parsed item names — **all rendered as plain Mantine `<Text>`**, which neither interprets HTML nor markdown. Safe by construction; no change needed.
- `ChangelogModal.tsx` does manual `<Text>`-based markdown rendering of `CHANGELOG.md` content, which comes from the repo (not user input). Out of scope.
- No `dangerouslySetInnerHTML` anywhere in the SPA.

Paired with TD-004 (Sprint 3) — CSP outer envelope + sanitization inner envelope cover the same threat model.

**Files**:
- `frontend/src/components/chat/ChatMessageBubble.tsx` ✅
- `frontend/package.json` ✅ (rehype-sanitize dep)

---

### TD-016: Plaid Sync Re-Pulls a Year on Every Manual Sync
**Status**: Resolved (2026-05-01)
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
**Status**: **Partially resolved** — code half landed 2026-05-01 (Sprint 6); CloudWatch forwarding was never enabled (reopened 2026-08-02)
**Created**: 2026-04-22
**Updated**: 2026-08-02
**Impact**: Medium - Incident response is grep-archaeology; PII redaction is per-call-site
**Effort**: Medium (remaining: Low — one EC2-side install)

> **2026-08-02 reopen.** The Pino migration and redaction work below all shipped and is real. The *outcome* TD-017 existed to deliver — being able to answer "what happened last month?" without SSH — did not. The CloudWatch agent install was written up as a one-time EC2-side step (it lives on the instance, not in the repo) and was never performed. Verified during the Capital One incident:
>
> ```
> /aws/ec2/budget-app    0 bytes stored
> budget-backend         log group does not exist
> ```
>
> So the Insights query documented in [AI-DEPLOYMENTS.md](AI-DEPLOYMENTS.md) §Logging has nothing to run against, and incident response is still `aws ssm send-command` + `pm2 logs | grep`. That directly blocked the first question asked during the 2026-08-02 incident ("do we have logs showing what happened on 7/15?") — the answer had to come from Plaid's API instead.
>
> **Remaining work**: perform the agent install already documented in AI-DEPLOYMENTS.md §Logging (yum install, IAM `CloudWatchAgentServerPolicy` on the instance role, drop the `collect_list` config, start the agent), then verify with `aws logs tail budget-backend`. Set a retention policy on the log group so it stays cost-bounded. Until this is done, treat PM2's rotation window as the real limit on how far back any investigation can reach.

**Problem**:
The backend uses `console.log` / `console.error` directly throughout. In production these go to PM2 stdout/stderr. There is no structured JSON output, no log-level discipline, no centralized PII redaction, and no integration with monitoring. When something breaks in prod, debugging is `pm2 logs | grep` and hoping you remember the right substring.

A specific concrete leak: `transactionService.ts:163` logs `account.accountName` for failed-decryption accounts — a structured logger with field-level redaction prevents this category of mistake at the edge.

**Fix**:
✅ `backend/src/utils/logger.ts` adds Pino. Pretty-print in dev (timestamp + colorized level), JSON in production (CloudWatch-ready), `silent` in test. Reads `NODE_ENV` directly rather than going through the config singleton — keeps the encryption tests' partial config mocks working. `childLogger(module)` adds a `module` binding for filterability. Redaction list (`REDACT_PATHS`) covers top-level + nested + array-element paths for: auth (`password`, `passwordHash`, `token`, `refreshToken`, `resetToken`, `jwt`), Plaid (`accessToken`, `plaidAccessToken`, `publicToken`, `linkToken`), account PII (`accountName`, `accountNumber`, `routingNumber`, `officialName`), user PII (`email`), VAPID (`privateKey`). Pre-shipping the redaction backstop lets call sites focus on signal without remembering every PII field.

Migrated all 156 production `console.*` call sites across 30 files to `log.{info,warn,error,debug}` with structured field bags. The TD-017-cited leak is closed: `transactionService.ts:160-167` now logs `{ plaidItemId, accountCount }` on decryption failure — never the array of `accountName`s. Other notable cleanups: `routes/categories.ts:113-118` (which was dumping full `req.headers` and `req.user` on every initialize call) reduced to `{ familyId, userId }`; `services/plaidService.ts:168` (was logging the full `clientId`) now logs a 6-char prefix; `chatActions/auditLog.ts` switched from manual `JSON.stringify({...})` envelopes to structured `log.info({ event, ...entry })` so the audit JSON now flows through the same redaction layer as everything else.

`ecosystem.config.js` no longer sets `log_date_format` — Pino's own ISO timestamp is the single source of truth, and a PM2-prepended wall-clock string would break the CloudWatch JSON parser. CloudWatch agent install (one-time EC2-side: `amazon-cloudwatch-agent` + IAM `CloudWatchAgentServerPolicy` + collect_list pointing at `output.log`/`error.log`) and a sample CloudWatch Insights query are documented in [AI-DEPLOYMENTS.md](AI-DEPLOYMENTS.md) §Logging.

**Tests**: 8 new Jest cases in `backend/src/__tests__/unit/logger.test.ts` build a parallel Pino instance with the same `REDACT_PATHS` and a captured destination stream (the shipped `logger` is `silent` in test mode). Cases cover top-level redaction (`accessToken`/`password`/`resetToken`/`jwt`/`privateKey`), nested-object redaction (`account.accountName`/`plaidAccessToken`/`accountNumber`), the **TD-017 leak shape verbatim** (array of `{ accountName, plaidAccessToken }` objects — pins the `*[*].field` path syntax), nested `user.email`, non-secret fields preserved (`familyId`/`transactionId`/`amount`/`cursor` untouched), message string preserved, child-logger inheritance of redaction + `module` binding, level filtering. Backend: **896 tests** (from 888).

**Files**:
- `backend/src/utils/logger.ts` ✅ (new)
- `backend/src/__tests__/unit/logger.test.ts` ✅ (new, 8 cases)
- `backend/src/index.ts`, `backend/src/app.ts`, all middleware/, all routes/, all services/, `backend/src/utils/encryption.ts` ✅ (156 console.* → logger calls)
- `ecosystem.config.js` ✅ (drop `log_date_format`)
- `docs/AI-DEPLOYMENTS.md` ✅ (CloudWatch agent setup + Insights query)
- `backend/package.json` ✅ (pino + pino-pretty deps)

---

### TD-018: Frontend Bundle Has Outgrown the Workbox Precache Cap
**Status**: Open — step (a) landed 2026-05-23 (commit `1668dc7`); steps (b)–(d) remaining
**Created**: 2026-05-04
**Updated**: 2026-05-23
**Impact**: Medium — deploy-blocking when crossed; PWA update cost grows linearly with bundle size; first-load on cellular feels it
**Effort**: Medium

**Problem**:
The frontend ships as a single ~2.1 MB JS chunk (gzip 621 KB). On 2026-05-04 the bundle crossed workbox's default `maximumFileSizeToCacheInBytes` of 2 MiB and the GHA `Validate Code → build` step started failing with `assets/index-*.js is 2.11 MB, and won't be precached`. We unblocked the deploy by raising the limit to 4 MiB in `frontend/vite.config.ts:65-67`, but that only buys headroom — it doesn't address the underlying problem:

1. Every release reinstalls the full bundle through the service worker precache. At ~2 MB per update, that's painful on slow / metered connections — and we silently re-cross 4 MiB on the next round of growth.
2. Vite already warns about it on every build: *"Some chunks are larger than 500 kB after minification"*.
3. There's a second, related warning that's been ignored: `authStore.ts` is dynamically imported by `lib/api/client.ts` but **also** statically imported by 13 other modules (`InspirationModal`, `MantineLayout`, `ProtectedRoute`, `LoginForm`, `RegisterForm`, `ChatOverlay`, `FeedbackModal`, `FamilySection`, `ProfileSection`, `MantineDashboard`, `Projects`, `Tasks`, `ThemeProvider`). Vite says: *"dynamic import will not move module into another chunk."* The intended split is being defeated.

**Fix**:
Three independent pieces, in increasing order of effort:

1. ✅ **Resolve the static-vs-dynamic `authStore` conflict** — landed 2026-05-23 (commit `1668dc7`). Took the static-everywhere option: `client.ts:54` flipped from `import('../../stores/authStore').then(...)` to a top-level `import { useAuthStore } from '../../stores/authStore'`. The "circular dep" the lazy import was guarding against doesn't exist at module-init — `useAuthStore` is only referenced inside the response-interceptor body (runs on actual HTTP responses, well after all modules have initialized), so ES module live bindings close the cycle safely. The 13 other statics that were defeating the split now match the canonical import shape. Vite's "dynamic import will not move module into another chunk" warning is gone. Bundle size unchanged at 2.08 MB / 611 KB gzip — expected; this step unblocks (2) and (3), it doesn't move the needle by itself. The chunk-size-warning over 500 KB is independent and is what (2)+(3) address.
2. **Route-level code-splitting on the heavy pages.** `React.lazy()` + `Suspense` boundaries on `Tasks`, `Trips`, `EnhancedTransactions`, `BudgetVsActuals`, `Admin`, `Settings`, `Reports`. These are independent destinations; the user pays the chunk cost only when they navigate. Expected savings: ~40-50% off the initial JS shell.
3. **`build.rollupOptions.output.manualChunks` for the obvious vendor splits.** Mantine, `@tabler/icons-react`, `@tanstack/react-query`, the Google Maps + Places stack (used only by Trips). Vendor chunks change rarely → service-worker cache hit rate goes up across releases.

After 2+3, drop `maximumFileSizeToCacheInBytes` back to (or near) the workbox default — keeping the limit elevated removes the forcing function.

**Why not urgent**: 2-user app on broadband; PWA update annoyance is bounded. The deploy block is what dragged this from "ignored warning" to "tracked debt." If we hit 4 MiB the same way, that's the signal to schedule it.

**Files**:
- `frontend/vite.config.ts` (current 4 MiB band-aid; chunk warning will reappear after the fix shrinks the bundle and we drop the override)
- ✅ `frontend/src/lib/api/client.ts` — static-vs-dynamic conflict resolved (commit `1668dc7`)
- `frontend/src/App.tsx` or wherever routes are declared (route lazy boundaries — step 2)
- Vendor split config — step 3

---

### TD-019: No Off-Bucket / Long-Term Backup of Production Data
**Status**: Open — partially mitigated by existing S3 versioning (see below)
**Created**: 2026-06-02
**Impact**: Low-Medium — single-bucket dependence; no recovery from bucket-level loss or edits older than 90 days
**Effort**: Low

**Problem**:
Prompted by the TD-011 trip-photo corruption (2026-06-02), we audited what backup actually exists. The finding: **more than expected, but with one real gap.**

Already in place on `budget-app-data-f5b52f89` (verified 2026-06-02):
- **Versioning: Enabled** — every `PutObject` retains the prior version, so accidental overwrite/corruption is recoverable by restoring an earlier version. This is the primary safety net and it is the right tool for JSON-blob storage.
- **Lifecycle:** noncurrent versions → STANDARD-IA at 30 days, expire at 90 days. Incomplete multipart uploads aborted at 7 days. Keeps version history cost-bounded.
- **Scale:** ~22 objects, ~7 MB total. Versioning overhead is pennies/month.

The gap:
1. **All eggs in one bucket.** Versioning protects against *object*-level mistakes, not against bucket deletion, a destructive lifecycle/policy change, or account compromise. There is no copy outside the bucket.
2. **90-day horizon.** Versions expire at 90 days, so there is no point-in-time recovery older than a quarter (e.g., "restore the state from 6 months ago").
3. **No restore drill.** We have never exercised a version-restore, so recovery is untested.

**Fix** (cost-minimal, matched to a 2-user app — pick the cheapest sufficient option, do not gold-plate):
1. **Cheapest, highest-value:** a scheduled cross-bucket/cross-account copy of the `data/` prefix to a second cheap location — e.g. a weekly `aws s3 sync` into a separate bucket (ideally a different account) with its own lifecycle, or a Glacier Deep Archive tier for >90-day retention. ~7 MB → effectively free; storage cost is rounding error.
2. Either run (1) from the existing EC2 host via cron, or as a tiny scheduled Lambda. No new always-on infra.
3. **Test the restore once** and write the 3-line runbook into [AWS-DEPLOYMENTS.md](AI-DEPLOYMENTS.md). An untested backup is a hope, not a backup.
4. Optional / probably overkill here: S3 MFA-delete, Object Lock. Note them and move on unless the threat model changes.

**Why not urgent**: versioning already covers the overwhelmingly most-likely failure (a bad write — exactly what TD-011 produces). The remaining gap is whole-bucket loss, which for a 2-person app on a personal AWS account is low-probability. Schedule (1)+(3) when convenient; they're an afternoon and a few cents/month.

**Files**:
- New: a sync script (e.g. `backend/scripts/backup-prod-snapshot.ts` or a shell cron) + schedule
- [docs/AI-DEPLOYMENTS.md](AI-DEPLOYMENTS.md) — restore runbook

---

## 2026-08-02 Capital One Card-Reissue Incident

Context for TD-020 through TD-022. On 2026-07-15 Capital One reissued a card (mask `7008` → `7245`). Plaid retired the old `account_id`, minted a new one **inside the same Item**, and re-keyed 90 days of history under it with all-new `transaction_id`s. The Item itself stayed healthy the whole time — no Item error, valid consent, `/accounts/get` working, balances updating — so nothing surfaced. Transactions silently stopped for **19 days** and were noticed only by eye.

Plaid's mechanism for exactly this is `persistent_account_id`, a stable identifier that survives reissues. Capital One populates it for **none** of the accounts on this Item, so old and new cannot be linked programmatically by identifier. Repair was done by content matching (`backend/src/scripts/reconcile-plaid-account-change.ts`, commit `7fe1a17`): 1 account repointed, 333 transactions re-keyed, 55 recovered.

---

### TD-020: Plaid `account_id` Change Causes Silent, Unrecoverable Transaction Loss
**Status**: **Fail-closed guard shipped (2026-08-02)** — loss is prevented and reported. Automatic re-keying still requires the reconciler script.
**Created**: 2026-08-02
**Updated**: 2026-08-02
**Impact**: **High** — silent permanent data loss; the cursor advances past dropped rows
**Effort**: Medium

**Problem**:
`transactionService.ts:290` skips any transaction whose `account_id` is not in the Item's known accounts:

```ts
const account = accountLookup.get(plaidTxn.accountId);
if (!account) continue;
```

The cursor is then persisted anyway at `:211`. Plaid's cursor is a delivery receipt — once advanced, those rows are never re-sent. So when an institution reissues a card mid-Item, every transaction on the new account is consumed and discarded, with no error, no log line, and no way to get it back short of a cursor reset (which then re-delivers everything and duplicates by `plaidTransactionId`).

Compounding it: dedupe is strictly by `plaidTransactionId` (`:292`). A reissued account's rows all carry new ids, so any naive fix that only repoints the account would insert months of already-held history as new. The two failure modes push in opposite directions, which is why this needs deliberate handling rather than a one-line guard.

**Fix**:
1. Detect the condition explicitly: before applying a delta, compare the Item's live `account_id`s against stored ones. A stored account that has vanished is a reissue signal, not a no-op.
2. **Do not advance the cursor** when the delta contains rows for unknown accounts. Failing closed keeps the data recoverable; failing open loses it.
3. Surface it — an account-level state (e.g. `needs_reconciliation`) plus a dashboard alert, so it is visible without reading logs.
4. Reuse the content-matching strategy already proven in `reconcile-plaid-account-change.ts` (pair on `type` + `subtype` + `official_name`; re-key on `date` + `amount` with a ±2-day pass for posted-date jitter; refuse ambiguous matches).
5. Store `persistent_account_id` on `StoredAccount` when the institution provides it. It will not help Capital One, but it makes this automatic for institutions that do populate it.

**Fix as shipped** (2026-08-02) — steps 1, 2, 3 (partial) and 5:
- `applyPlaidSyncDelta` now returns `unplaceableAccountIds` + `unplaceableRowCount`. The `continue`s are unchanged — we still cannot file a transaction against an account we do not have — but the drop is counted instead of invisible. Both drop sites are covered: the `added` loop and the `modified` loop's treat-as-add branch.
- **The cursor is not advanced when any row is unplaceable.** This is the whole fix. Plaid's cursor is a delivery receipt; holding it costs one re-fetched delta on the next sync, while advancing it loses the data permanently. Rows we *can* file are still filed — writes are idempotent by `plaidTransactionId`, so re-delivery is harmless.
- `SyncResult.reconciliationNeeded` carries `{plaidItemId, institutionName, droppedRows}`, and the user-facing `warning` (already surfaced as a notification via `MantineAccounts.tsx:100`) says plainly that transactions are *held*, not lost.
- `persistent_account_id` is now mapped from Plaid and stored on `StoredAccount` when the institution supplies it (step 5). It will not help Capital One, which returns null for every account, but it makes the same event automatically resolvable for institutions that do populate it.

**Tests**: 7 cases in `backend/src/__tests__/critical/account-id-change.stories.test.ts` — cursor held on unknown `account_id`, condition reported, `modified`-branch rows counted, healthy deltas still advance the cursor (fail-closed must not stall normal syncs), mixed deltas still store what they can, re-running a held delta does not duplicate, and `setItemCursor` is never called while reconciliation is pending. Verified as real regression tests by disabling only the guard: 5 of 7 fail.

**Still open**: automatic re-keying. Detection and prevention are done; repair remains the reconciler script, which needs an operator. Wiring `getSectionTypeForCategory`-style content matching into the app would close it, but the script's `--dry-run`-then-`--apply` shape is a reasonable place for a two-user app to leave a rare, destructive-if-wrong operation.

**Files**:
- `backend/src/services/transactionService.ts` ✅ (delta application, cursor persistence, `SyncResult`)
- `backend/src/services/plaidService.ts` ✅ (`persistentAccountId` mapping)
- `backend/src/services/accountService.ts` ✅ (persist `persistentAccountId`)
- `backend/src/scripts/reconcile-plaid-account-change.ts` (manual repair — the break-glass path)

---

### TD-021: No Plaid Webhooks Configured; No Sync-Staleness Surface
**Status**: **Staleness indicator resolved (2026-08-02)** — fix step 1 shipped. Webhook work (steps 2-4) remains open.
**Created**: 2026-08-02
**Updated**: 2026-08-02
**Impact**: **High** — no failure is detectable without manual inspection; a 19-day outage went unnoticed
**Effort**: Medium (staleness indicator alone: Low)

**Problem**:
`PLAID_WEBHOOK_URL` is set nowhere — not in `.env.example`, not in the deploy workflow's generated `.env` (`release-and-deploy.yml:291-320`). `plaidService.ts:236` only attaches a webhook when that variable exists, so no Item has ever registered one. Confirmed against production: `last_webhook: none` on **all nine** Items.

Consequences:
- No `SYNC_UPDATES_AVAILABLE` — nothing tells the app new transactions exist.
- No `PENDING_EXPIRATION` — the 7-day warning before an OAuth consent lapses never arrives. Two Items were within 36 days of expiry and nothing surfaced.
- No `ERROR` webhook — Item errors are discovered only when a user happens to sync.

There is also no cron (`grep` for `cron`/`setInterval` finds only `chatActions/proposalStore.ts`), so syncs happen only when a user clicks. With two users and no alerting, "nobody complained" is not evidence of health.

Separately, nothing compares an account's most recent transaction date against its expected cadence. Plaid already reports `item.status.transactions.last_successful_update` on every `/item/get` — during the incident it read 18 days stale while the UI showed a healthy connection.

**Fix**:
1. **Staleness indicator first** (cheap, no webhook infrastructure): read `item.status.transactions.last_successful_update` during sync, persist per Item, and surface an "last updated N days ago" warning on the account card past a threshold. This alone converts the incident from invisible to obvious.
2. Set `PLAID_WEBHOOK_URL` as a repo variable and add it to the deploy workflow's `.env` generation.
3. Add a webhook receiver route with proper JWT verification — note `plaidService.ts:565-571` currently returns `true` unconditionally with a "In production, implement proper JWT verification" comment. That must be closed before the endpoint is exposed.
4. Handle `SYNC_UPDATES_AVAILABLE` (trigger sync), `PENDING_EXPIRATION` (prompt re-link — the "Sign in to Bank" action is now always available per `4ccd51d`), and `ERROR`.

**Step 1 as shipped** (2026-08-02) — the half that needs no webhook infrastructure:
- `plaidService.getItemStatus()` reads `item.status.transactions.last_successful_update`, `last_failed_update`, and `consent_expiration_time`.
- `syncAccountBalances` calls it once per Item and persists `lastTransactionUpdate` + `consentExpirationTime` onto each account (mirrored across the Item like `plaidCursor`). A failure here is logged and ignored — the values are advisory and must not fail a balance sync.
- `frontend/src/components/accounts/accountHealth.ts` holds the pure predicates: `hasStaleTransactions` (≥5 days, tolerating a weekend plus a holiday) and `hasExpiringConsent` (≤14 days, wider than Plaid's 7-day `PENDING_EXPIRATION` since we are polling rather than receiving). Both return false when the field is absent — warning on every card would train the user to ignore the warning.
- `ConnectedAccountCard` renders each as an inline orange line.

The critical distinction, worth preserving in any rework: **`lastSynced` records when *we* called Plaid; `lastTransactionUpdate` records when the *institution* last delivered.** Only the second one goes stale in the silent-stall failure mode, which is why the existing "Last synced" line could never have caught it.

**Tests**: 10 cases in `accountHealth.test.ts`, including the real incident shape (2026-07-15 stall observed 2026-08-02 → warns) and the real consent value (2026-09-06 seen on 2026-08-02 → correctly does not warn).

**Files**:
- `backend/src/services/plaidService.ts` ✅ (`getItemStatus`), and `:236` webhook attach + the `:565-571` verification stub for the remaining work
- `backend/src/services/accountService.ts` ✅ (persist staleness fields)
- `shared/types/index.ts` ✅
- `frontend/src/components/accounts/accountHealth.ts` ✅ (new, + tests)
- `frontend/src/components/accounts/ConnectedAccountCard.tsx` ✅
- `backend/src/routes/plaid.ts` (new webhook route — remaining)
- `.github/workflows/release-and-deploy.yml`, `backend/.env.example` (remaining)

---

### TD-022: Sync Error Paths Fail Silently
**Status**: **Resolved (2026-08-02)**
**Created**: 2026-08-02
**Updated**: 2026-08-02
**Impact**: Medium — failures are invisible in the UI and, in one path, invisible in logs too
**Effort**: Low

**Problem**:
Two related gaps let a broken connection keep presenting as healthy:

1. **`plaidService.ts:591`** — `requiresReauthentication` allowlists five codes (`ITEM_LOGIN_REQUIRED`, `ITEM_LOCKED`, `USER_PERMISSION_REVOKED`, `INVALID_CREDENTIALS`, `ITEM_NOT_ACCESSIBLE`). Anything outside it — `ACCESS_NOT_GRANTED` being the realistic one, since institutions let users revoke per-data-type sharing — is logged and skipped while the account stays `active`. The UI then shows a working connection that silently delivers nothing.
2. **`accountService.ts:222`** — when balance sync fails for a non-reauth reason, the loop hits a bare `continue` with **no log statement at all**. That failure leaves no trace anywhere.

Note these are *detection* gaps, not the cause of the 2026-08-02 incident (that was TD-020). They are on the same path and would hide the same class of problem.

**Fix**:
1. Widen the reauth code list, or invert it: treat any `ITEM_ERROR`-type response as degraded-until-proven-otherwise rather than allowlisting known-bad codes.
2. Add a log line to the `accountService.ts:222` branch with `plaidItemId` + error code. No silent `continue`s on a data path.
3. Distinguish "needs re-auth" from "degraded" in `AccountStatus` so the UI can warn without falsely claiming a sign-in is required.

**Fix as shipped** (2026-08-02):
1. `REAUTH_ERROR_CODES` widened from 5 to 10 codes. `ACCESS_NOT_GRANTED` is the consequential addition — institutions let users revoke sharing per data type, producing a working `/accounts/get` alongside a dead transaction feed, and re-granting in update mode is the fix. Also added `INVALID_MFA`, `INVALID_UPDATED_USERNAME`, `INSUFFICIENT_CREDENTIALS`, `PENDING_DISCONNECT`.
2. New `isDegradedItemError(errorType, errorCode)` inverts the allowlist as the item proposed: any `ITEM_ERROR` that is not a reauth code is degraded until proven otherwise. Unknown future codes now surface instead of silently reading as healthy.
3. `AccountsResult.degraded` carries it to `accountService`, which marks such accounts `status: 'error'` and returns them as `degradedAccounts`.
4. The bare `continue` at the old `:222` now logs unconditionally — `{plaidItemId, accountCount, errorCode, requiresReauth, degraded}` — so no balance-sync failure can leave zero trace.
5. `PlaidAccount.status` in `shared/types` gained `'error'`. The backend `AccountStatus` already had it; the shared type did not, so the state was literally unrepresentable client-side.
6. `ConnectedAccountCard` renders a yellow **Connection Issue** badge for `error`, distinct from the orange **Sign-in Required**. Telling someone to re-authenticate when that will not help is worse than saying nothing.

**Tests**: 3 cases in `ConnectedAccountCard.test.tsx` — degraded shows the right badge and *not* the sign-in prompt, still offers the re-link action, and a healthy account shows neither badge.

**Files**:
- `backend/src/services/plaidService.ts` ✅
- `backend/src/services/accountService.ts` ✅
- `shared/types/index.ts` ✅
- `frontend/src/components/accounts/ConnectedAccountCard.tsx` ✅

---

## Reports Page: Excessive Parallel API Requests
**Status**: Resolved (2026-04-08, commit `5ed0bb9`)
**Created**: 2025-10-14
**Impact**: High - Causes 503 errors on Reports page load
**Effort**: Medium

See [completed/AI-TECHNICAL-DEBT.md](completed/AI-TECHNICAL-DEBT.md) for full details. The root cause was 12 parallel monthly budget requests. The `GET /api/v1/budgets/year/:year` batch endpoint (route `backend/src/routes/budgets.ts`, service `budgetService.getYearlyBudgets`) had existed since 2025-09-20 (`c127fce`); `5ed0bb9` switched `Reports.tsx` to consume it, looping over *years* (1–2 requests) instead of months (`Reports.tsx:142-186`). Reconciled 2026-06-10 — the item had in fact shipped before the [TECH-DEBT-EXECUTION-PLAN-2026-04](TECH-DEBT-EXECUTION-PLAN-2026-04.md) was drafted, but was carried into Sprint 6 as open by mistake.

Reports page load now fires ~6 independent queries (cashflow, trends, breakdown, projections, categories, yearly-budget), down from 12+. The plan's "≤ 3 requests" target was intentionally **not** pursued: closing the 6→3 gap requires a combined reports endpoint that collapses four independently-cached section queries into one cache entry — a poor trade (loss of per-section cache granularity, more refetch churn on filter changes) for a 2-user app. The nginx rate-limit "increase" (`terraform/user_data.sh`: `rate=10r/s`, `burst=10 nodelay`) was reviewed and **kept** — it is the looser outer envelope behind the app-layer limiter (`rateLimitGlobalApi`, 100/min/IP, added in Sprint 3); reverting it downward would only re-introduce 503 risk for no benefit.
