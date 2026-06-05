# Business Workspace — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-06-05
**Version:** 1.0

---

## 1. Summary

A separate, fully-isolated **business workspace** alongside the existing family workspace, reached by an in-app workspace switcher (one login, no logout). The business workspace reuses Plaid sync, the transaction list, and tag-based categorization, but replaces the family budgeting surfaces with a single new capability: a **monthly client royalty statement** (PDF to send the client, CSV for records), derived from tagged transactions. Scoped to one business (Out of Touch Media, LLC) and one client (Dream Big Publishing, LLC) in v1.

## 2. Background

Out of Touch Media is a royalty pass-through. Amazon KDP deposits book royalties into the business's Chase account; OoT keeps a flat **5% commission** and remits the remainder to its client. Each month OoT produces a royalty statement — currently built from a Wave transaction export feeding a Google Sheet — and uses it to (a) send the client a statement and (b) know the exact amount to wire.

Wave is removing transaction sync, breaking the pipeline. The family app already has the load-bearing pieces: Plaid sync, per-`familyId` data isolation, a per-family category hierarchy, tagging, and auto-categorize rules. Modeling "business" as a second isolated workspace lets us replace Wave's role (sync + categorized export) plus generate the client statement, without standing up a new app or new infrastructure.

Critically, the Amazon money is **held in trust** — it is a liability passing through, **not** OoT's income; the remittance is **not** an expense. OoT's only real revenue is the 5% commission (plus any charges it bills the client). The business workspace therefore is a **trust ledger + statement generator**, not a budget, and intentionally does not reuse family budgeting semantics.

## 3. Requirements

### 3.1 Workspaces & Switching

**REQ-001:** A user may belong to more than one workspace. A workspace is the existing per-`familyId` partition; "family" and "business" are two workspaces owned by the same person.

**REQ-002:** The app provides a workspace switcher (header control) that changes the active workspace without logging out. After switching, all data, navigation, and reports reflect only the active workspace.

**REQ-003:** The active workspace is authoritative for every request — a user acting in the business workspace cannot read or write family data in the same session, and vice versa.

**REQ-004:** A user with access to only one workspace sees no switcher (or an inert one); the feature must not change the experience for single-workspace users.

### 3.2 Data Isolation

**REQ-005:** All business data (transactions, accounts, Plaid items, categories, tags, auto-categorize rules, statements) is stored under the business workspace's `familyId` and is never readable from the family workspace, using the same partitioning that isolates families today.

**REQ-006:** The Plaid connection for the Chase business account belongs to the business workspace only; its access token, item, and sync cursor are stored under the business `familyId`.

**REQ-007:** Resource limits and counters that are currently global must be scoped per workspace so business activity does not consume the family's allowance:
- Chatbot monthly cost cap (today `chatbot_costs_{month}`, global) → scoped per workspace.
- Auth rate-limit / lockout state must not let business-account login attempts lock out the family account (or vice versa).

### 3.3 Business Category Seed (Trust-Ledger Taxonomy)

**REQ-008:** A newly created business workspace is seeded with a trust-ledger category set, **not** the family INCOME/EXPENSES/SAVINGS seed. The seed distinguishes at least these roles:
- **Trust royalty inflow** — Amazon KDP deposits held in trust.
- **Remittance** — funds paid out to the client.
- **Billable to client** — charges OoT bills the client, sub-typed (e.g., Book Report, Book Purchase, Book Shipping).
- **Overhead** — OoT business expenses absorbed (e.g., bank fees, software subscriptions), not billed to the client.
- **Commission / revenue** — OoT's earned commission.

**REQ-009:** Each transaction-derived input to the statement is determined by its assigned category/tag, not by hard-coded merchant logic.

### 3.4 Plaid Sync & Transactions

**REQ-010:** The business workspace can connect the Chase business account via Plaid Link and sync its transactions, using the same sync mechanism as the family workspace.

**REQ-011:** Each Amazon KDP deposit syncs as an individual transaction (the statement itemizes deposits per row; deposits must not be pre-aggregated).

**REQ-012:** Auto-categorize rules are available in the business workspace and can tag recurring transactions (e.g., descriptions containing `AMAZON` → trust royalty inflow; known subscriptions → overhead).

### 3.5 Client Royalty Statement — Computation

**REQ-013:** A statement is generated for a chosen calendar month and includes the trust-royalty-inflow transactions dated within that month.

**REQ-014:** For each included deposit, the statement computes:
- **Commission** = `commissionRate × depositAmount`, rounded to cents (v1 `commissionRate` = 5%).
- **Client royalty** = `depositAmount − commission`.

**REQ-015:** **Royalty Subtotal** = the sum of per-row client royalties.

**REQ-016:** **Other fees & charges** = transactions tagged *billable to client* within the period, grouped and summed by billable sub-type. Each configured sub-type line appears on the statement even when its total is `$0.00`.

**REQ-017:** **Remittance total** (the amount to send the client) = `Royalty Subtotal − Σ(other fees & charges)`.

**REQ-018:** Overhead-tagged and commission/revenue transactions are excluded from the statement entirely.

**REQ-019:** The remittance total is the amount OoT *will* pay the client; the actual outbound payment is executed manually outside the app (see Out of Scope) and is not required for the statement to be valid.

### 3.6 Client Royalty Statement — Content & Numbering

**REQ-020:** The statement header carries static workspace configuration: the business name/address and the client name/company/address. These are entered once per workspace, not per statement.

**REQ-021:** Each statement has a **payment number** that auto-increments from the last stored statement (e.g., 068 → 069) and is editable before finalizing.

**REQ-022:** Each statement records a payment date (defaulting to the generation date) and the period it covers.

**REQ-023:** The statement presents, at minimum: per-deposit rows (disbursement date, Amazon payout, commission, client royalty), the royalty subtotal, the itemized other-fees-&-charges section, and the final remittance total.

### 3.7 Statement Persistence

**REQ-024:** Generated statements are persisted as records under the business workspace (e.g., `statements_{familyId}`), including the payment number, dates, period, the line items as generated, and the final remittance total.

**REQ-025:** A persisted statement renders identically when re-opened later, even if its source transactions are subsequently re-tagged or edited (the stored statement is the source of truth for what was sent).

**REQ-026:** The payment-number counter derives from the latest persisted statement.

### 3.8 Statement Output

**REQ-027:** A statement can be exported as a **PDF** suitable to send to the client (the client-facing document).

**REQ-028:** A statement can be exported as a **CSV** for the user's own records / spreadsheet import.

### 3.9 Feature Gating

**REQ-029:** In the business workspace, family-only surfaces are hidden: trips, tasks, projects, wishlist, budgets, Budget vs. Actuals, savings/rollover, and the family dashboard KPIs.

**REQ-030:** In the family workspace, the business statement surface is hidden.

**REQ-031:** Shared surfaces that are workspace-agnostic (transaction list, categories, accounts, Plaid sync, auto-categorize rules) remain available in both, scoped to the active workspace.

## 4. Assumptions

- One business and one client in v1. A future second client is hedged by an optional `clientId` tag (zero-cost seam), but per-client sub-ledgers are not built.
- `commissionRate` is a single flat rate (5%) stored as workspace/client configuration, applied uniformly to every deposit; it does not vary per deposit or over history in v1.
- Commission is rounded to cents **per row**; the client royalty is the per-row remainder (matches the current Google Sheet output, e.g., `$70,220.83 → $3,511.04` commission → `$66,709.79` royalty).
- "Other fees & charges" are always sourced from tagged transactions, never hand-entered.
- The trust money is pass-through and is never treated as OoT income or expense in any aggregation; only commission (and billable charges) represent OoT revenue.
- A statement period is a single calendar month.
- Currency is USD, consistent with the rest of the app.
- The business workspace's Chase account is supported by Plaid and provides per-deposit granularity comparable to the existing Wave export.
- The user provisions their own business workspace (no public sign-up / multi-tenant onboarding flow is implied).

## 5. Open Questions

- **PDF fidelity.** Should the PDF reproduce the current Google Sheet layout/branding closely, or is a clean equivalent acceptable? (It is client-facing, so this matters.) — defer exact design to the plan.
- **Billable sub-types — fixed or configurable.** Are Book Report / Book Purchase / Book Shipping a fixed set, or should the workspace let the user define billable sub-types? v1 default: fixed set matching today's statement.
- **Disbursement date vs. bank-posted date.** The statement groups by "KDP Disbursement Date"; whether that always equals the Plaid transaction date, or needs a separate captured field, is unconfirmed.
- **Statement editing/voiding.** Can a finalized statement be corrected or voided after persistence, and does that consume/skip a payment number? — defer.
- **Plaid item billing.** Adding the Chase business account as a second Plaid item may carry incremental Plaid cost; confirm before launch.
- **Workspace switcher mechanics.** JWT re-issue on switch vs. a separate active-workspace claim — implementation decision for the plan.
- **Provisioning UX.** How a business workspace is created and linked to the existing user (admin action, settings screen, or seed script) — defer to the plan.

## 6. Out of Scope

### v1 (deferred to Phase 2)

- **Manual transactions.** Entering non-Plaid transactions (e.g., home-office write-offs such as internet/office space for tax purposes). Valuable for both workspaces; specced separately in Phase 2.
- **Revenue sweep worksheet.** The "how much can I safely transfer to savings" calculation (current page 2). To be **redesigned**, not ported as-is.
- **Tax prep / accountant handoff.** Overhead/expense summaries, Schedule-C-style categorization, year-end export for an accountant.
- **OoT P&L / books.** Any reporting on OoT's own profitability beyond what the statement requires.

### Explicitly excluded (not planned)

- **Payment automation.** The app does not move money. It computes the remittance and generates the statement; the actual ACH/wire to the client is executed manually in the bank. Rationale: for one monthly transfer, programmatic movement of client trust funds adds fiduciary/liability surface far exceeding the time saved. Stripe specifically is the wrong tool (built to collect from customers and pay out to your own account, not relay a third party's funds; the inflow comes from Amazon, not a Stripe charge).
- **Multi-client sub-ledgers.** One client in v1; only a tag-shaped seam is reserved.
- **Multi-currency.** USD only.
- **Public/multi-tenant onboarding.** Workspaces are provisioned for this single user, not opened to external sign-ups.
- **Cross-workspace reporting.** No combined family + business views, totals, or dashboards.
