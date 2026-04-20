# Stale Data Mitigation — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-20
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

Sessions in this app last for days (JWT `JWT_EXPIRES_IN=7d`), and the two users routinely move between mobile and web. When one user makes a change — adds a transaction, completes a task, edits a budget, adds a trip stop — the other user's already-loaded views do not reflect that change until they explicitly navigate, hard-refresh, or close and reopen the app. The same staleness occurs for a single user across two of their own devices.

React Query is already the data layer (`frontend/src/lib/queryClient.ts`), but the global config explicitly disables `refetchOnWindowFocus` and uses a 5-minute `staleTime`. The result: opening a long-idle tab shows data from hours ago with no signal that anything is out of date.

### 1.2 Solution Summary

Two-phase, stepwise improvement that avoids websockets:

- **Phase 1 — Window-focus refetch.** Flip the React Query default to `refetchOnWindowFocus: true` and tune `staleTime` per query class. Catches the dominant staleness pattern ("partner edited something hours ago, I switch back to my tab") at zero server cost during idle time.
- **Phase 2 — `/api/changes` polling endpoint.** Lightweight `GET /api/changes?since=<ts>` returns a list of dirty resource keys. Active tabs poll every 30–60s and selectively invalidate matching React Query keys. Catches in-session staleness ("partner made a change while I'm actively using the app") at one trivial request per minute per active tab.

Phase 2 is gated on Phase 1 not being sufficient. Step 1 alone may eliminate enough of the pain that Step 2 is unnecessary.

---

## 2. Requirements

### 2.1 Window-Focus Refetch (Phase 1)

**REQ-001:** The global React Query client must enable `refetchOnWindowFocus: true` and `refetchOnReconnect: true` by default.

**REQ-002:** Default `staleTime` must be tuned so focus-refetch only fires when meaningfully useful. Recommended classes:
- **Hot data** (transactions, tasks, account balances, budget actuals): `staleTime: 30s` — refetch on focus almost always.
- **Warm data** (categories, budgets, trips list, projects list): `staleTime: 2m`.
- **Cold data** (theme config, user profile, category options): keep current `staleTime` (5m or `Infinity`).

**REQ-003:** Per-query `staleTime` overrides already in the codebase must be reviewed and reclassified per REQ-002. Queries that explicitly want focus-refetch disabled (e.g. an in-flight bulk operation that mustn't be interrupted) must opt out at the call site.

**REQ-004:** Mutations must continue to invalidate their own related query keys on success. This requirement is a regression check, not new behavior.

**REQ-005:** Phase 1 must not increase backend load during idle periods. Verification: with all tabs unfocused for 10 minutes, network tab shows zero query traffic.

### 2.2 Changes Endpoint (Phase 2)

**REQ-006:** A new endpoint `GET /api/changes?since=<unix-ms-timestamp>` must return the set of resource keys that have been mutated since the given timestamp.

**REQ-007:** Response shape:
```json
{
  "serverTime": 1729440000000,
  "changes": ["transactions", "tasks", "trips/abc123"]
}
```
Keys may be coarse (`"transactions"` = any transaction changed) or scoped (`"trips/abc123"` = specific entity). Coarse is acceptable for V1; scoped is a future refinement.

**REQ-008:** The endpoint must be cheap: O(1) or near-O(1) lookup against an in-memory or storage-backed change log keyed by resource type. It must not scan transaction or task data.

**REQ-009:** All write paths (transaction CRUD, task CRUD, budget CRUD, trip CRUD, project CRUD, category CRUD, account CRUD, AI actions) must record a change entry. The change log only needs to retain the most recent mutation timestamp per resource key — older entries can be discarded.

**REQ-010:** A frontend `useChangesPoller` hook must:
- Poll `/api/changes?since=<lastSeen>` every 60 seconds while the document is visible (use `document.visibilityState`, not just focus — covers backgrounded tabs that are still visible).
- On each response, invalidate the React Query keys that match the returned change keys.
- Update `lastSeen` to the response's `serverTime` (server-authoritative, avoids client clock drift).
- Pause polling while the document is hidden; resume on visibility change.

**REQ-011:** The poller must cohabit cleanly with existing `refetchInterval` consumers (e.g. `Admin.tsx` 5-second status polls). The poller drives query invalidation; refetchInterval drives unconditional refresh. They do not conflict.

**REQ-012:** The poller must not run when the user is unauthenticated (no JWT) or when the changes endpoint returns 401.

### 2.3 Observability

**REQ-013:** Phase 1: log a one-line console message in dev when a focus-refetch fires, with the query key. Removed in production builds.

**REQ-014:** Phase 2: server-side metric (or simple log line) for `/api/changes` request rate and average response payload size. Used to verify Phase 2 cost stays trivial.

---

## 3. Assumptions

- The user base is two people (Jared + spouse). Phase 2's polling load is bounded at ≈2 active tabs × 1 req/min = 2 req/min. Even 10× growth in users would still be negligible against the existing transaction-sync traffic.
- React Query is already the canonical data layer; no parallel fetching code exists outside it (verified via `Grep` — all `fetch`/data calls go through `frontend/src/lib/api.ts` and `useQuery`).
- The change log can live in process memory for V1. It's regenerable on cold start (clients receive a `serverTime` newer than their `lastSeen` and refetch everything affected once). If multi-instance deployment ever happens, change log moves to S3 or a small SQLite table.
- We will **not** introduce websockets, SSE, or any persistent connection in this project. If sub-minute latency ever becomes necessary, that is a separate initiative with its own BRD.

---

## 4. Non-Goals

- Real-time updates. Acceptable end-to-end staleness is ≤60s while a tab is active, ≤refetch-on-focus delay otherwise.
- Per-user change scoping. The change log is per-resource-type, not per-user. Both family members see all changes (which is the desired family-app behavior).
- Optimistic UI for cross-device updates. Phase 1+2 keep the existing "mutate locally → invalidate → refetch" pattern; cross-device propagation goes through the poller, not push.
- Plaid webhook integration. Plaid sync is a separate batch concern and out of scope here. (Tracked in `docs/completed/AI-TECHNICAL-DEBT.md` — webhook support.)

---

## 5. Open Questions

- **Q1:** What's the right `staleTime` for transactions specifically? 30s is the proposed default but the right answer depends on observed user behavior. Resolve by shipping Phase 1 and checking whether focus-refetch alone feels responsive enough.
- **Q2:** Should the change log be in-memory or persisted? Default: in-memory for V1. Loss-on-restart is acceptable because clients refetch on first poll after restart anyway.
- **Q3:** Phase 2 trigger criteria — when do we know Phase 1 isn't enough? Default: ship Phase 1, use the app for 2 weeks, decide based on whether actual in-session staleness is annoying. If never annoying, skip Phase 2.

---

## 6. Success Criteria

- **Phase 1:** After switching to a tab that has been idle for >5 minutes, the visible data reflects state as of the moment the user refocused (not stale state from when the tab was opened).
- **Phase 2:** When one user makes a change, the other user's active tab reflects the change within ≤90 seconds (one poll interval + refetch latency) without manual refresh.
- **No regression:** No measurable increase in idle backend load. Mutation flows behave identically to today.
