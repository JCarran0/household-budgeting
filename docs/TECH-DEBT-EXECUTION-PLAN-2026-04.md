# Tech Debt Execution Plan — April 2026

## Purpose
Sequence the open items in [AI-TECHNICAL-DEBT.md](AI-TECHNICAL-DEBT.md) into an execution order that maximizes leverage per hour. The tracker is the source of truth for *what* is broken; this doc is the source of truth for *what we're doing about it next*.

**Cadence assumption**: Solo developer interleaving with feature work. "Sprint" here ≈ a focused chunk of debt work, not a calendar week. Sprints are independent — items can be reordered if a feature blocker forces it — but the within-sprint pairings are deliberate.

**Scope**: All open items in the tracker as of 2026-04-22. Items marked "Resolved" are excluded.

---

## Sequencing Logic — Why This Order

Three principles drove the sequencing:

1. **Present bugs before future investments.** Fixing data corruption (TD-011) and burning Anthropic spend (TD-012) every day is more urgent than building a test harness. Tests prevent *future* regressions; storage races cause *current* silent data loss.
2. **Pair items that amplify each other.** TD-011 (full-collection reads) and TD-013 (broad cache invalidation) compound — every cascaded refetch triggers a full file read. Doing them in adjacent sprints means each fix's value is visible in the other's metrics.
3. **Don't refactor large files without coverage.** Tasks.tsx (1835 LOC) decomposition is in TD-010, but it deliberately lands *after* the test foundation (TD-014) — and the Tasks-specific tests are written *as part of* the split, not before, because the right test boundaries only emerge once the components exist.

---

## Sprint 1 — Data Integrity + Cheapest $ Win
**Goal**: Stop losing writes; stop overpaying Anthropic on every chatbot turn.
**Estimated effort**: 1–2 days

| Item | Why now |
|---|---|
| **[TD-011](AI-TECHNICAL-DEBT.md) part 1**: Per-`familyId` mutex around `Repository.saveAll` + per-request memoization on `getAll` | Data integrity. Concurrent edits silently lose writes today. |
| **[TD-012](AI-TECHNICAL-DEBT.md) part 1**: Add `cache_control: { type: 'ephemeral' }` to chatbot system prompt + tool definitions | ~30 min of work, immediate Anthropic cost reduction. No reason to defer. |

**Exit criteria**:
- Manual concurrent-edit test (two browser tabs categorizing different transactions simultaneously) — both writes land.
- Chatbot conversation shows `cache_read_input_tokens > 0` in Anthropic API response after the second turn.

---

## Sprint 2 — UX + Finish the Chatbot Cost Story
**Goal**: Stop the page-flicker thrash; stop dumping full transaction arrays into model context.
**Estimated effort**: 1–2 days

| Item | Why now |
|---|---|
| **[TD-013](AI-TECHNICAL-DEBT.md)**: Tighten React Query invalidation keys to per-month / per-filter shape | UX-visible flicker on every edit. Half-day audit. Amplified by TD-011 — better to have storage relief in place first. |
| **[TD-012](AI-TECHNICAL-DEBT.md) part 2**: Cap `query_transactions()` results at 50 by default; return `{ count, sample, summary }` for larger sets | Completes the chatbot cost story. Token-cost reduction is multiplicative with the prompt caching from sprint 1. |

**Exit criteria**:
- Editing a transaction on Accounts page does not refetch Dashboard/Reports/Budgets queries.
- Chatbot tool result for "show me all transactions" returns ≤ 50 items + summary.

---

## Sprint 3 — Security Hardening
**Goal**: Defense in depth on the markdown rendering surface; persistent rate limiting.
**Estimated effort**: 1–2 days

| Item | Why now |
|---|---|
| **[TD-004](AI-TECHNICAL-DEBT.md)** + **[TD-015](AI-TECHNICAL-DEBT.md)**: Strict CSP header (Helmet) + DOMPurify on all chatbot/user markdown | These belong in the same PR — outer envelope (CSP) + inner envelope (sanitization). Doing them together lets one threat-model pass cover both. |
| **[TD-005](AI-TECHNICAL-DEBT.md)**: Persistent rate limiter (file-backed or Redis) + extend to general `/api` coverage at ~100 req/min/IP | Restart-resets on the current limiter mean post-deploy windows have no protection. General coverage closes the auth-only gap. |

**Exit criteria**:
- Lighthouse / `securityheaders.com` shows CSP header present and strict.
- Pasting `<script>alert(1)</script>` into a transaction note and viewing it via chatbot does not execute.
- Rate limit state survives PM2 restart.

---

## Sprint 4 — Test Foundation
**Goal**: Mechanical guardrails on the financial math and the most invariant-sensitive UI hooks.
**Estimated effort**: 2–3 days

| Item | Why now |
|---|---|
| **[TD-014](AI-TECHNICAL-DEBT.md) stage 1**: Tests for `shared/utils/budgetCalculations.ts`, `bvaIIDataComposition.ts`, `bvaIIDisplay.ts`, `bvaIIFilters.ts` in the existing backend **Jest** runner, wired into `npm test` | Pure functions, no new harness needed. Highest value per hour: the rollover and BvA math is the most expensive code in the app to be silently wrong. Tests themselves pre-existed but lived in `src/__tests__/unit/` while `npm test` only ran `src/__tests__/critical/` — so they rotted silently. Real Sprint 4 work here is the CI wiring + fixture repair that surfaces. |
| **[TD-014](AI-TECHNICAL-DEBT.md) stage 2**: Vitest + RTL setup on the frontend (greenfield — frontend has no test runner today); tests for `useDismissedParentIds` (must not touch `Category.isHidden`), `useBvaIIUrlState` round-trip, error boundary recovery | Frontend-only invariants. Stage 2 unblocks Sprint 5's Tasks.tsx decomposition. Vitest/RTL lives on the frontend side; the backend stays on Jest. |

**Exit criteria**:
- `npm test` in backend covers all rollover math edge cases (calendar-year reset, negative effective budget, subtree conflict detection).
- `npm test` in frontend exists and is wired into `lint-staged` / pre-commit.

---

## Sprint 5 — Maintainability Decompositions
**Goal**: Drain the god-file backlog. Tests written as part of each split, not before.
**Estimated effort**: 4–6 hours per file; can interleave with feature work.

Address in priority order from the updated [TD-010](AI-TECHNICAL-DEBT.md) table:

1. ✅ **`Tasks.tsx`** — landed 2026-04-23 (1835 → 485 LOC). See Sprint 5 tracking row below.
2. ✅ **`BudgetVsActualsII.tsx`** — landed 2026-04-24 (716 → 467 LOC). Extracted `BvaIISectionTable.tsx` (226 LOC) + `bvaIIFormatHelpers.tsx` (63 LOC); 15 new Vitest cases.
3. ✅ **`amazonReceiptService.ts`** — landed 2026-04-24 (1215 → 636 LOC, −48%). Extracted into `backend/src/services/amazon/`: `amazonMatcher.ts` (150 LOC, pure), `amazonPdfParser.ts` (221 LOC, Claude vision + sanitize helpers), `amazonCategorizerAdapter.ts` (269 LOC, Claude categorization + rounding absorption). 36 new Jest cases (18 matcher + 9 parser + 9 categorizer). Orchestrator retains full public API.
4. **`Trips.tsx` (1078)`, `Settings.tsx` (871)** — same Transactions-style hook + subcomponent extraction pattern.
5. **`MantineAccounts.tsx` (688 LOC)** — last remaining frontend page over the 600 LOC ceiling. Original TD-010 companions `Budgets.tsx` and `MantineDashboard.tsx` are no longer targets: the 2026-04-23 legacy-tab retirement (commit `0d909aa`) dropped `Budgets.tsx` to 236 LOC, and `MantineDashboard.tsx` is 481 LOC (both under threshold).

**Other items pulled into this sprint** (small, related to maintainability):
- **[TD-006](AI-TECHNICAL-DEBT.md)**: Admin role-based authorization check
- **[TD-008](AI-TECHNICAL-DEBT.md)**: Frontend error casting cleanup
- **BvA II → BvA rename sweep**: classic Budgets view retired 2026-04-23, so the `II` suffix no longer disambiguates. Mechanical rename across ~25 code files (`BudgetVsActualsII` → `BudgetVsActuals`, `BvaII*` → `Bva*`, `bvaII*.ts` → `bva*.ts`, `useBvaIIUrlState` → `useBvaUrlState`, URL param `tab=bva-ii` → `tab=bva` with one-release fallback) + live docs (CLAUDE.md, AI-APPLICATION-ARCHITECTURE.md). Historical artifacts (BRD filenames, CHANGELOG, commit history) intentionally unchanged.

**Exit criteria**:
- No file in `frontend/src/pages/` exceeds 600 LOC.
- No service in `backend/src/services/` exceeds 800 LOC.

---

## Sprint 6 — Operational + Cleanups
**Goal**: Ship the lower-urgency items as a single batch.
**Estimated effort**: 2–3 days total

| Item | Notes |
|---|---|
| **[TD-016](AI-TECHNICAL-DEBT.md)**: Plaid `transactionsSync` cursor migration | Manual sync is infrequent; quota burn is real but bounded. Sets up future webhook work. |
| **[TD-017](AI-TECHNICAL-DEBT.md)**: Pino structured logging + redaction list + CloudWatch forwarding | Operational. Pays back on the next incident, not before. |
| **[TD-007](AI-TECHNICAL-DEBT.md)**: 401 handler bypasses store logout | Small bug. |
| **[TD-009](AI-TECHNICAL-DEBT.md)**: Stale `@types/react-router-dom` v5 | Trivial. |
| **Reports parallel requests** (orphan): batch endpoint `GET /api/v1/budgets/year/:year` | Workaround (nginx limit increase) is in place; proper fix unblocks revisiting the limit. |

**Exit criteria**:
- Plaid sync logs `cursor` field in subsequent calls.
- `pm2 logs budget-backend` shows JSON output, not unstructured text.
- Reports page makes ≤ 3 requests on load (down from 12+).

---

## Cross-Cutting: Storage Migration (Future Sprint)

[TD-011](AI-TECHNICAL-DEBT.md) part 3 — moving from JSON files to SQLite — is intentionally **not** in this plan. It's the right long-term answer (deprecates much of TD-011, TD-013, and parts of TD-016 wholesale) but it's a multi-week migration with its own BRD and risk profile. Planned trigger: when transaction count crosses ~5k or the Sprint 1 mutex starts showing contention.

---

## Status Tracking

When an item lands, update its `Status` field in [AI-TECHNICAL-DEBT.md](AI-TECHNICAL-DEBT.md) to `Resolved (YYYY-MM-DD, commit <sha>)`. Don't move resolved entries out of the active tracker until a sprint of stability has passed — keeps the audit trail readable in one place.

When a sprint completes, mark it here with the date and link to the relevant commits/PRs:

| Sprint | Started | Completed | Notes |
|---|---|---|---|
| 1 — Data Integrity + Chatbot Cache | 2026-04-22 | 2026-04-22 | Branch `chore/tech-debt-sprint-1`. TD-011 parts 1a (`Repository.withLock`, wrapping 10 read-modify-write paths in `transactionService.ts`) + 1b (`requestScopeMiddleware` + AsyncLocalStorage, memo lives at `UnifiedDataService` so both `Repository.getAll` and `ReadOnlyDataService.getData` benefit). TD-012 part 1 (`cache_control: { type: 'ephemeral' }` on system prompt + last tool; `userDisplayName` suffix placed AFTER the cache breakpoint). |
| 2 — UX + Chatbot Tool Caps | 2026-04-23 | 2026-04-23 | TD-013: `frontend/src/lib/transactionCacheSync.ts` — `patchTransactionsInCache` (setQueriesData across `['transactions', …]` AND `['bva-ii', …]` roots) + `invalidateTransactionCounts`. Wired into `TransactionEditModal` (5 mutations), `TransactionTable` inline category, and `useTransactionBulkOps` (success-only; falls back to invalidation on partial failure). Remaining broad `['transactions']` invalidations are on multi-row paths (sync, auto-cat, Amazon-receipt, CSV import) where optimistic patching would require mirroring server logic. TD-012 part 2: `ChatbotDataService.queryTransactionsForTool` — default limit=50, hard-cap 500, returns `{ count, truncated, limit, transactions, summary: { byCategory, byMonth } }` when the match count exceeds the effective limit; `chatbotService.executeTool` switched to the wrapper; internal callers unchanged. Tool description updated so Claude knows the response shape. New integration test `chatbotDataService.queryForTool.test.ts` (4 cases). |
| 3 — Security Hardening | 2026-04-23 | 2026-04-23 | TD-004: adopted `helmet` in `app.ts` with `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` — appropriate for a JSON-only backend surface; SPA-side CSP (Plaid/Maps/Mantine) intentionally deferred to nginx as a separate PR since runtime browser verification is required. TD-015: `rehype-sanitize` on `ChatMessageBubble`'s `ReactMarkdown` with a narrow markdown-only allowlist; audit confirmed no other user-rich-text surface renders as HTML/markdown (trip notes, task descriptions, etc. all go through plain Mantine `<Text>`). TD-005: `backend/src/middleware/rateLimit/` — file-backed `PersistentRateLimitStore` (debounced 1s flushes, atomic rename, 50k-bucket cap, scope-namespaced keys) wired through three named limiters: `rateLimitGlobalApi` (per-IP, 100/min, mounted on the whole `/api` prefix), `rateLimitAuth` (unchanged 10/15min budget, re-exported from `authMiddleware` so existing callers don't move), `rateLimitChatbot` (unchanged 5/min/user, replaces the inline `Map` in `routes/chatbot.ts`). Direct unit tests cover the PM2-restart contract (a second store instance reads disk + denies the next over-limit hit), expiry GC, corruption recovery. App tests assert CSP + HSTS + nosniff on `/health`. |
| 4 — Test Foundation | 2026-04-23 | 2026-04-23 | Branch `chore/tech-debt-sprint-4`. **Stage 1**: discovered the four target test files (`budgetCalculations`, `bvaIIDataComposition`, `bvaIIDisplay`, `bvaIIFilters`) already existed in `backend/src/__tests__/unit/` but were silently excluded from `npm test` — the `jest critical` positional only matched `__tests__/critical/`. Widened `test:critical` to `jest "__tests__/(critical\|unit)/"` (also `test:watch`, `test:coverage`). Surfaced 7 pre-existing failures (stale fixtures, not production bugs): `reportService.test.ts` (isSavings flag added after test write — fixed `CUSTOM_SAVINGS` fixture to `isSavings: true`); `config.test.ts` (production-mode cases missing `PLAID_ENCRYPTION_SECRET`); `categoryHelpers.test.ts` Performance case (explicit `isIncome: false` short-circuits the hierarchical fallback it was meant to exercise — removed the explicit flag). Re-audit of the 3 called-out content gaps found only 1 was real — added one characterization test for `buildEffectiveBudgetsMap` omitting net-zero effective entries (raw+rollover cancellation). Final: **810 backend tests**, all running in `npm test`. **Stage 2**: frontend was greenfield. Added `vitest@3.2.4` + `@testing-library/react@16.3.0` + `jsdom@25.0.1`; `frontend/vitest.config.ts` (separate from `vite.config.ts` so PWA plugin doesn't load into test runtime); `src/test/setup.ts` (jest-dom matchers, `localStorage.clear()` between tests). Tests for **`useDismissedParentIds`** (13 tests pinning the per-user-localStorage-not-isHidden landmine — including canary assertions on the storage key constant and "never touches other localStorage keys"); **`useBvaIIUrlState`** (16 tests covering defaults, reads, writes, canonical serialization incl. `'none'` sentinel per REQ-017, round-trip, unrelated-param preservation); **`ErrorBoundary`** (7 tests using the `fallback` prop to bypass Mantine dependency — covers catch, `onError`, `resetKeys`-driven recovery, continued catching after reset, `isolate=false` rethrow). Final: **39 frontend tests**. **Pre-commit**: `.husky/pre-commit` now runs lint + `npm test` for each side whose files are staged (also triggers backend test on `shared/` changes, since shared utils are exercised via backend's Jest runner). Tests exit via `exit 1` — no `--no-verify` needed in normal flow. |
| 5 — Maintainability | 2026-04-23 | In progress | Interleaved with feature work. **Tasks.tsx landed 2026-04-23** on branch `chore/tech-debt-sprint-5-tasks-decomp`: 1835 → 485 LOC (−73%). Extracted `boardOrdering.ts` (pure helpers + constants) with a 37-test Vitest suite — heaviest coverage on `spliceBoardForDrop`, which is the pangea-dnd post-drop correctness landmine (snoozed-item skipping, overshoot fallback, cross-column + same-column reorder). Extracted `TaskFormModal`, `TaskDetailModal`, `TaskHistoryView`, `TemplateManagementModal`, `SnoozedColumn`, `TaskKanban` (owns DnD context + local `boardTasks` state + splice-based optimistic updates), `TaskLeaderboard` (collapsible wrapper; parent keeps the open-state since the `['tasks','all']` query is gated on it). `Projects.tsx` migrated to the new import paths. 13 new component tests: `TaskFormModal` pins the create-default assignee truth table (the "Unassigned filter creates hidden task" landmine) + `lockedTags` merge-and-dedup; `TaskHistoryView` pins filter+sort wiring. Test harness: added `matchMedia` + `ResizeObserver` stubs to `test/setup.ts` so Mantine's `ResponsiveModal` + `SegmentedControl` render in jsdom. Unmasked one pre-existing `eslint-disable-next-line` that had drifted off its target line; fixed by anchoring the directive at the deps array. One remaining ESLint warning (`members` as a useMemo dep) pre-dates the refactor. Frontend: 89 tests across 7 files. Backend: 810/810 unchanged. **Legacy Budget tabs retired 2026-04-23** (commit `0d909aa`) — `Budgets.tsx` 602 → 236 LOC, five orphaned components deleted, `GET /api/budgets/comparison/:month` + `copy` + `rollover` routes removed. This also drops `MantineDashboard.tsx` (481 LOC) below the 600 LOC ceiling, so the original TD-010 trio collapses to just `MantineAccounts.tsx` (688). **BvA II landed 2026-04-24** on branch `refactor/bva-ii-extraction`: 716 → 467 LOC. Extracted `BvaIISectionTable.tsx` (226 LOC — per-section table render: parent/child rows, expand/collapse, dismiss, edit) and `bvaIIFormatHelpers.tsx` (63 LOC — `availableColor` / `formatSigned` / `directionIcon` / `renderRolloverCell` / `renderAvailableCell`). `BudgetVsActualsII.tsx` retains query fetching, data composition, filter/sort, summary strip, control row, edit modal mount, and SectionTable orchestration. 15 new Vitest cases in `BvaIISectionTable.test.tsx` — chevron + Enter-key parity, childless-parent (no chevron / no row button-role), children sorted |available| desc, de-emphasis opacity, edit hidden for transfer categories, edit stopPropagation, dismiss/restore dispatch, rollover cell em-dash vs. dimmed vs. value. Frontend: 104 tests (from 89). Typecheck clean. **amazonReceiptService.ts landed 2026-04-24**: 1215 → 636 LOC (−48%). Extracted three collaborators into `backend/src/services/amazon/`: `amazonMatcher.ts` (150 LOC — pure tiered match `matchSingleOrder`, `isAmazonMerchant`, `amountsMatch`, `withinDateWindow`, `createMatch` + `AMAZON_MERCHANT_PATTERNS` / `CUSTOM_AMAZON_CATEGORY` / date-window constants); `amazonPdfParser.ts` (221 LOC — class `AmazonPdfParser.parseFile` wrapping Claude vision + `PDF_EXTRACTION_TOOL` round-trip; exported pure helpers `salvagePartialOutput` / `sanitizeCharges` / `crossReference`; dropped the `require()` hack for per-row validator access); `amazonCategorizerAdapter.ts` (269 LOC — class `AmazonCategorizerAdapter.categorize` owning prompt assembly, example few-shot, Claude round-trip, cost-tracker call; pure exports `buildCategoryContext` / `buildExamplesFromTransactions` / `buildSplitRecommendations` for rounding absorption). Orchestrator retains full public API — routes unchanged. 36 new backend Jest cases (18 matcher / 9 parser / 9 categorizer): tier-1/tier-2/ambiguous/fallback boundaries; `usedIds` gating; candidate cap at 5; SEC-006 card sanitization (pins the quirky slice-then-strip order); per-row salvage; crossReference date override; category tree rendering (hidden-exclusion); sub-cent rounding absorption into last split. Backend: **845 tests** (from 810). Frontend: 104 unchanged. Typecheck clean. Exit criterion **still not met** — `Trips.tsx` (1078), `Settings.tsx` (871), `MantineAccounts.tsx` (688) remain over 600. Next files in sequence: Trips → Settings → MantineAccounts. Then the BvA II → BvA rename sweep (see "Other items" above). |
| 6 — Operational + Cleanups | — | — | |
