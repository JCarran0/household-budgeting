# App Cost Visibility — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-20
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

Operating this app costs real money across three sources: Anthropic API calls (chatbot, bulk categorization, Amazon receipts), Google Maps/Places API (trip itineraries + map tab), and AWS infrastructure (EC2, S3, Route 53, CloudWatch). Today, visibility is inconsistent:

- **Anthropic costs are tracked but not surfaced.** `backend/src/services/chatbotCostTracker.ts` pools chatbot, categorization, and receipt usage into a single monthly file and enforces a shared `CHATBOT_MONTHLY_LIMIT` cap. The chat overlay displays `~$X / $Y` with green/yellow/red tiers (`ChatOverlay.tsx:85-184`), but the categorization and Amazon receipt flows do not show equivalent readouts to the user despite returning `costUsed` from the backend.
- **Google API costs are invisible.** We call Places API (legacy + New) and Maps JS from trip features; monthly cost is only visible in the GCP console.
- **AWS costs are invisible.** Monthly spend is only visible in the AWS billing console.

The result: users (both family members are effectively owners) cannot answer "is this app worth what it costs to run?" without leaving the app.

### 1.2 Solution Summary

Two surfaces:

- **Per-feature widgets.** Every AI feature entry point surfaces the existing shared-pool Anthropic spend using the same compact `$spend / $cap` badge that chat uses today. Extends an existing pattern — no new tracking infrastructure.
- **Cost & Usage settings page.** A new `Settings → Cost & Usage` sub-tab shows the full picture: current-month Anthropic spend (against cap), current-month Google API spend (self-metered), current-month AWS spend (pulled from Cost Explorer by daily cron), and a 12-month historical view for each source.

Google and AWS are dashboard-only — they do not appear on per-feature widgets and do not enforce caps. Anthropic keeps its existing cap and enforcement behavior unchanged.

---

## 2. Requirements

### 2.1 Per-Feature AI Cost Widgets

**REQ-001:** Every AI feature entry point must display the current shared-pool Anthropic spend using the same visual pattern as `ChatOverlay.tsx`: `~$X.XX / $Y.YY` text, color-coded green (<50% of cap), yellow (50–80%), red (≥80%).

**REQ-002:** Feature entry points that must show the widget:
- Chat overlay header (existing — no change).
- Bulk categorization modal (`CategorizationFlowModal.tsx`) — header or footer.
- Amazon receipt upload flow (`AmazonReceiptFlowModal.tsx`) — header or footer.

**REQ-003:** The displayed `$spend / $cap` value must reflect the same shared pool that backs `ChatbotCostTracker`. All three features already record into this pool; the widget is a read of `GET /api/chatbot/usage` (or equivalent) at modal open + after each AI operation completes.

**REQ-004:** When the cap is reached, the AI operation must be blocked with a clear user-facing message (existing chatbot behavior — must be applied consistently to categorization and receipts if not already).

### 2.2 Cost & Usage Settings Page

**REQ-005:** A new page `Settings → Cost & Usage` must exist and be visible to all users (no admin gate, matching the 2-user family-ownership model).

**REQ-006:** The page must show the following sections in MTD (month-to-date) form at the top:

- **Anthropic** — current-month total spend, cap, % of cap used, visual bar with green/yellow/red tier. Breakdown by feature (chat, categorization, receipts) if cheaply derivable from existing `CostRecord.model`-plus-context data; otherwise a single total with breakdown deferred.
- **Google APIs** — current-month total spend, breakdown by SKU (Places API legacy, Places API New, Maps JS, Autocomplete). No cap.
- **AWS** — current-month total spend, breakdown by service (EC2, S3, Route 53, data transfer, CloudWatch, other). No cap. Shows last-refresh timestamp.
- **Total app cost** — sum of the three sources. No cap.

**REQ-007:** Below MTD, a collapsible "Previous 12 months" section must show each of the above sources as a monthly sparkline or table, limited to the last 12 months.

**REQ-008:** A "Refresh now" button on the page must trigger an on-demand fetch of Google (self-metered counts, already current) and AWS (Cost Explorer API call). The button must be rate-limited to prevent runaway AWS API charges (one refresh per minute per user is sufficient).

### 2.3 Google API Cost Metering

**REQ-009:** A new `GoogleApiCostTracker` service (modeled on `ChatbotCostTracker`) must record every outbound Google API call. Each record captures: timestamp, SKU key, quantity (usually 1), estimated cost. Persisted as monthly JSON files (`google_api_costs_YYYY-MM.json`), same shape as existing chatbot cost storage.

**REQ-010:** A `GOOGLE_API_PRICING` constant must map SKU keys to per-unit prices in USD. Covered SKUs for V1:
- Places API (legacy) — Autocomplete, Place Details, Find Place.
- Places API (New) — `Place.fetchFields`, `AutocompleteSuggestion.fetchAutocompleteSuggestions`.
- Maps JS — dynamic map load (per `MapLoad`).
- Place Photo fetches.

**REQ-011:** All frontend code paths that invoke Google APIs must report each call to the backend via a lightweight `POST /api/usage/google` endpoint (fire-and-forget, batched if easy). Backend records via `GoogleApiCostTracker`. Failure to record must not block the user-facing operation.

**REQ-012:** The free-tier credit (if any remains) must not be subtracted client-side. The self-metered number is gross API usage cost; the Cost & Usage page must display a note that "Google gives a monthly credit; actuals at month-end may be lower."

### 2.4 AWS Cost Retrieval

**REQ-013:** A new `AwsCostTracker` service must call AWS Cost Explorer `GetCostAndUsage` to retrieve month-to-date and prior-12-months spend grouped by `SERVICE`. Results cached as monthly JSON files (`aws_costs_YYYY-MM.json`).

**REQ-014:** A daily cron job (existing cron infra or node-cron on the backend) must refresh the current-month AWS cost file at 06:00 UTC. Prior months are immutable once the month closes.

**REQ-015:** AWS Cost Explorer API access must use the existing production IAM setup. Required IAM permission: `ce:GetCostAndUsage`. The BRD does not dictate whether the cron runs in prod only or also in dev — an open question.

**REQ-016:** AWS Cost Explorer charges ~$0.01 per API call. The daily cron + rate-limited manual refresh must keep monthly Cost Explorer charges under $1 in normal operation.

### 2.5 Retention and Data Model

**REQ-017:** Anthropic, Google, and AWS monthly cost files must be retained indefinitely. Each file is small (< 1 MB for a high-usage month); no pruning is required at current scale.

**REQ-018:** Cost files for all three sources must live under the same `DataService` storage abstraction (filesystem in dev, S3 in prod) that existing `chatbot_costs_YYYY-MM` files use.

### 2.6 API Surface

**REQ-019:** `GET /api/settings/costs/summary` — returns current-month totals and prior-12-months series for all three sources. Used by the Cost & Usage page.

**REQ-020:** `POST /api/usage/google` — records one Google API call (SKU + quantity). Called from the frontend.

**REQ-021:** `POST /api/settings/costs/refresh` — triggers on-demand AWS Cost Explorer fetch. Rate-limited.

**REQ-022:** The existing `GET /api/chatbot/usage` endpoint continues to power per-feature widgets and is not modified.

---

## 3. Non-Functional Requirements

**NFR-001:** Cost tracking must not introduce measurable latency to AI operations or Google API calls. Recording is async and failures are logged but do not propagate.

**NFR-002:** The Cost & Usage page must load in under 500 ms on localhost given cached monthly files. The "Refresh now" button may block for longer while AWS responds.

**NFR-003:** No secrets (AWS keys, GCP credentials) may be exposed to the frontend. All cost retrieval is backend-only; the frontend sees aggregated numbers.

---

## 4. Assumptions

- **Backend pooling is correct as-is.** Chatbot, categorization, and receipts already share one `ChatbotCostTracker` pool and one monthly cap. This BRD does not change that — it only surfaces the already-pooled number in more places.
- **Per-user breakdown is not needed in V1.** The existing `CostRecord.userId` field is preserved so a "Jared spent $X, spouse spent $Y" view is additive later, but not required now.
- **Google pricing is stable enough to hardcode.** Similar to `MODEL_PRICING` in the chatbot tracker, Google SKU prices are defined in a constants file and updated manually when Google's pricing page changes. A monthly eyeball against the GCP console is sufficient drift detection at 2-user scale.
- **AWS Cost Explorer is the right data source.** Actuals update within 24 hours; good enough for a weekly check-in cadence.
- **Shared-pool cap behavior is acceptable.** A runaway bulk categorization run can exhaust the monthly Anthropic cap and block chatbot until the next month. This is the existing behavior and is documented, not changed.
- **Google free-tier credit is ignored in the metered number.** Self-metering shows gross usage cost; actual GCP bill may be lower after the $200/mo Maps credit (or current equivalent). This is called out in the UI via a footnote.

---

## 5. Open Questions

- **OQ-001: Where does the daily AWS Cost Explorer cron run?** Production only (single source of truth, avoids duplicate charges) or both dev and prod (so local development sees real numbers)? Default: prod only, dev reads the synced prod cost files via the existing production-sync flow.
- **OQ-002: How is AWS cost broken down?** `SERVICE` dimension is the default. Tag-based grouping (e.g. by environment tag) is richer but requires all resources to be consistently tagged. V1 uses `SERVICE` only.
- **OQ-003: Per-feature breakdown of Anthropic spend.** The existing `CostRecord` shape does not include a `feature` field (chat / categorization / receipts). Adding one is a small migration — worth doing in V1, or defer until the "which feature is driving cost?" question actually becomes pressing? Default: defer (single total is enough for V1).
- **OQ-004: Alerting on approaching AWS or Google overrun.** V1 shows visual tiers only for Anthropic (where a cap exists). Google and AWS have no caps and therefore no tiers — just raw numbers. Is a user-defined soft budget on Google/AWS with email/push alerts valuable enough for V1? Default: no, defer to V2.
- **OQ-005: Handling the Maps JS "MapLoad" metering.** Each time the Trip map tab mounts counts as one `MapLoad` billable to us. Debounce or dedupe needed to avoid counting re-renders? Default: rely on `@vis.gl/react-google-maps` lifecycle — one load per mount is accurate.

---

## 6. Out of Scope

- **Per-action cost captions on individual AI responses.** Rejected in brainstorm — too noisy.
- **Per-user spend attribution.** Tracker stores `userId`; UI does not surface it in V1.
- **Historical backfill of Google API costs.** Self-metering starts when this feature ships; no reconstruction from GCP bills.
- **Historical backfill of Anthropic per-feature breakdown.** Existing `CostRecord`s do not have a feature tag; retroactively labeling them is not attempted.
- **Cost forecasting / projection.** "At this burn rate you'll spend $X by month-end" is a future enhancement.
- **Budget/cap configuration UI.** Caps remain env-var-driven (`CHATBOT_MONTHLY_LIMIT`). No admin UI to change them.
- **Cost attribution to specific AI prompts/requests within the Cost page.** The existing `CostRecord.requests[]` array is preserved but not surfaced — drill-down is future work.
- **Non-Anthropic, non-Google, non-AWS cost sources.** Plaid (currently $0 on free dev tier), GitHub Actions minutes, domain renewal, and any future SaaS dependencies are out of scope until they represent material spend.
- **Real-time push updates of the Cost page.** Users see daily-fresh AWS and live Google/Anthropic via the manual refresh button; no WebSocket or SSE.

---

## 7. Success Criteria

- A user can open `Settings → Cost & Usage` and see total app operating cost for the current month in under 500 ms.
- Every AI feature (chat, categorization, receipts) shows the same `$spend / $cap` widget with consistent styling.
- AWS cost is no more than 24 hours stale on the page.
- Google API cost is within ±10% of the actual GCP bill at month-end (validated by manual comparison for the first 2 months post-launch).
- Total engineering effort to operate and maintain: monthly ~5 minutes to eyeball Google pricing drift; zero otherwise.
