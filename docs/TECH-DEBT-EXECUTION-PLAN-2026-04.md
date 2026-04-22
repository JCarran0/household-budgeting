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
| **[TD-014](AI-TECHNICAL-DEBT.md) stage 1**: Tests for `shared/utils/budgetCalculations.ts`, `bvaIIDataComposition.ts`, `bvaIIDisplay.ts`, `bvaIIFilters.ts` in the existing backend Vitest runner | Pure functions, no new harness needed. Highest value per hour: the rollover and BvA math is the most expensive code in the app to be silently wrong. |
| **[TD-014](AI-TECHNICAL-DEBT.md) stage 2**: Vitest + RTL setup; tests for `useDismissedParentIds` (must not touch `Category.isHidden`), `useBvaIIUrlState` round-trip, error boundary recovery | Frontend-only invariants. Stage 2 unblocks Sprint 5's Tasks.tsx decomposition. |

**Exit criteria**:
- `npm test` in backend covers all rollover math edge cases (calendar-year reset, negative effective budget, subtree conflict detection).
- `npm test` in frontend exists and is wired into `lint-staged` / pre-commit.

---

## Sprint 5 — Maintainability Decompositions
**Goal**: Drain the god-file backlog. Tests written as part of each split, not before.
**Estimated effort**: 4–6 hours per file; can interleave with feature work.

Address in priority order from the updated [TD-010](AI-TECHNICAL-DEBT.md) table:

1. **`Tasks.tsx` (1835 LOC)** — split into `TaskKanban`, `TaskChecklist`, `TaskLeaderboard`, `TaskFormModal`. Write component-level tests for each as the split lands. Highest priority because Task Leaderboard v2.0 work is actively landing here.
2. **`BudgetVsActualsII.tsx` (716 LOC)** — extract `BudgetVsActualsTable` render subcomponent.
3. **`amazonReceiptService.ts` (1215 LOC)** — split into `AmazonPdfParser`, `AmazonMatcher`, `AmazonCategorizerAdapter`.
4. **`Trips.tsx` (1078)`, `Settings.tsx` (871)** — same Transactions-style hook + subcomponent extraction pattern.
5. **Original TD-010 trio** — `MantineAccounts.tsx`, `Budgets.tsx`, `MantineDashboard.tsx`. Lowest priority because the largest absolute cost is upstream.

**Other items pulled into this sprint** (small, related to maintainability):
- **[TD-006](AI-TECHNICAL-DEBT.md)**: Admin role-based authorization check
- **[TD-008](AI-TECHNICAL-DEBT.md)**: Frontend error casting cleanup

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
| 1 — Data Integrity + Chatbot Cache | — | — | |
| 2 — UX + Chatbot Tool Caps | — | — | |
| 3 — Security Hardening | — | — | |
| 4 — Test Foundation | — | — | |
| 5 — Maintainability | — | — | Interleaved with feature work |
| 6 — Operational + Cleanups | — | — | |
