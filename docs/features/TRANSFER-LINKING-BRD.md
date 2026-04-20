# Transfer Linking — Business Requirements Document

**Status:** Won't Do (2026-04-20 — value not sufficient to justify build)
**Author:** Jared Carrano
**Date:** 2026-04-06
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

When money moves between connected accounts (e.g., paying a credit card from checking), two transactions appear: one outflow and one inflow. Today, these are independent records with no relationship to each other. This creates two problems:

1. **Double-counting** — If both transactions are categorized as income/expense rather than transfers, they inflate totals. The system excludes transfers from budget calculations, but only if the user correctly categorizes both sides as transfers. There is no guardrail connecting the two.

2. **Reconciliation** — Users have no way to verify that both sides of a transfer posted correctly. If one side is missing or the amounts don't match (e.g., due to a fee), there is no visibility into the discrepancy. Users must manually cross-reference transactions across accounts.

### 1.2 Solution Summary

Introduce **transfer linking** — a mechanism that pairs two transfer-categorized transactions into a single logical transfer. When a user categorizes a transaction as a transfer and selects a matching counterpart, both transactions are linked by a shared identifier. The counterpart is automatically assigned the complementary transfer category (`TRANSFER_IN` / `TRANSFER_OUT`). Unlinked transfers remain valid and are surfaced through a dedicated filter so users can find and resolve them over time.

### 1.3 Users

Both household users. Transfer linking is scoped to the authenticated user's connected accounts.

### 1.4 Scope

This BRD covers transfers between the user's own connected accounts only. External transfers (Venmo to a friend, Zelle from family, etc.) are out of scope — those transactions should be categorized as regular income or expense.

---

## 2. Transfer Model

### 2.1 Core Concept

A **transfer** is a relationship between exactly two transactions:

- One transaction with a negative amount (money received — `TRANSFER_IN`)
- One transaction with a positive amount (money sent — `TRANSFER_OUT`)

Both transactions must have the exact same absolute dollar amount. They must belong to different accounts.

### 2.2 Transfer States

A transfer-categorized transaction exists in one of two states:

| State | Definition |
|-------|------------|
| **Linked** | Paired with a counterpart transaction via a shared `transferGroupId`. Both sides are present and matched. |
| **Unlinked** | Categorized as `TRANSFER_IN` or `TRANSFER_OUT` but not yet paired with a counterpart. |

### 2.3 Data Model Changes

The following fields are added to the transaction record:

| Field | Type | Description |
|-------|------|-------------|
| `transferGroupId` | `string \| null` | Shared identifier linking two transfer transactions. `null` if not part of a linked pair. |
| `linkedTransactionId` | `string \| null` | The ID of the paired counterpart transaction. `null` if unlinked. |

These fields are additive. Existing transactions default to `null` for both fields. No migration is required for existing data — the feature is non-breaking.

### 2.4 Invariants

| # | Invariant |
|---|-----------|
| INV-001 | A linked transfer pair must consist of exactly two transactions. |
| INV-002 | Both transactions in a pair must have the same absolute dollar amount. |
| INV-003 | The two transactions must belong to different accounts. |
| INV-004 | One transaction must be `TRANSFER_IN` (negative amount) and the other `TRANSFER_OUT` (positive amount). |
| INV-005 | `transferGroupId` and `linkedTransactionId` must always be set or cleared together — if one is set, the other must be set. |
| INV-006 | A transaction may belong to at most one transfer pair. |

---

## 3. Functional Requirements — Linking Workflow

### 3.1 Creating a Transfer Link

| # | Requirement |
|---|-------------|
| REQ-001 | When a user categorizes a transaction as `TRANSFER_IN` or `TRANSFER_OUT`, the system must prompt the user to optionally link it to a matching counterpart. |
| REQ-002 | The matching UI must display a filtered list of candidate transactions: same absolute dollar amount, opposite sign, from a different account. |
| REQ-003 | The candidate list must be sorted by date (closest to the initiating transaction first). |
| REQ-004 | When the user selects a counterpart, the system must: (a) generate a shared `transferGroupId`, (b) set `linkedTransactionId` on both transactions, (c) auto-assign the complementary transfer category to the counterpart (`TRANSFER_IN` if the counterpart has a negative amount, `TRANSFER_OUT` if positive). |
| REQ-005 | If the counterpart already has a non-transfer category, the system must override it with the appropriate transfer category. The user has implicitly confirmed this by selecting it as a match. |
| REQ-006 | The user must be able to skip linking (categorize as transfer without pairing). The transaction remains in the "unlinked" state. |
| REQ-029 | When a user changes a transaction's category to a transfer category from the transaction list view (inline category picker), the system must automatically open the transaction edit modal with the linking prompt so the user can immediately pair it. The user may dismiss the modal to leave the transfer unlinked. |

### 3.2 Breaking a Transfer Link

| # | Requirement |
|---|-------------|
| REQ-007 | A user must be able to unlink a transfer pair. Unlinking clears `transferGroupId` and `linkedTransactionId` on both transactions. |
| REQ-008 | Unlinking must not change either transaction's category. Both remain categorized as transfers (unlinked). |
| REQ-009 | If a user recategorizes a linked transfer transaction to a non-transfer category, the system must automatically break the link and clear `transferGroupId` and `linkedTransactionId` on both transactions. |

### 3.3 Recategorization Rules

| # | Requirement |
|---|-------------|
| REQ-010 | A transaction may only be linked as a transfer if its category is `TRANSFER_IN` or `TRANSFER_OUT` (or a subcategory thereof). |
| REQ-011 | Recategorizing a linked transfer to a non-transfer category breaks the link (see REQ-009). The counterpart retains its transfer category but becomes unlinked. |

---

## 4. Functional Requirements — Surfacing Unlinked Transfers

### 4.1 Filtering

| # | Requirement |
|---|-------------|
| REQ-012 | The transaction list must support a filter for **unlinked transfers** — transactions categorized as a transfer but without a `transferGroupId`. |
| REQ-013 | The existing `transactionType: 'transfer'` filter must continue to show all transfers (both linked and unlinked). |
| REQ-014 | A new filter value `transactionType: 'unlinked_transfer'` must show only unlinked transfers. |

### 4.2 Visibility

| # | Requirement |
|---|-------------|
| REQ-015 | The transaction list should display a count or badge indicating how many unlinked transfers exist, giving users a passive reminder to resolve them. |
| REQ-016 | From an unlinked transfer, the user must be able to initiate the linking flow (same as REQ-001 through REQ-006) to find and select a match. |

---

## 5. Functional Requirements — Transaction List Display

### 5.1 Visual Linking

| # | Requirement |
|---|-------------|
| REQ-017 | Linked transfer transactions must appear as two separate rows in the transaction list. |
| REQ-018 | Linked transactions must have a visual indicator showing they are paired (e.g., a link icon, colored connector, matching badge, or grouped border). |
| REQ-019 | Clicking the link indicator on one transaction should scroll to or highlight the paired transaction, or show a summary of the counterpart if it is not visible (e.g., filtered out or on a different page). |
| REQ-020 | The counterpart summary (REQ-019) must include: account name, date, and amount — enough to identify the other side without navigating away. |

---

## 6. Functional Requirements — Plaid Suggestions

### 6.1 Leveraging Plaid Category Data

| # | Requirement |
|---|-------------|
| REQ-021 | When a transaction has a `plaidCategoryId` that starts with `TRANSFER_IN` or `TRANSFER_OUT`, and the transaction has no user-assigned category (`categoryId` is `null`), the system should surface this as a **suggested transfer** in the UI. |
| REQ-022 | Suggested transfers must be visually distinct from confirmed transfers — e.g., a subtle label like "Plaid suggests: transfer" on the transaction row or in the categorization flow. |
| REQ-023 | Acting on a Plaid suggestion follows the same flow as manual categorization: the user confirms the transfer category, then optionally links a counterpart. Plaid suggestions are hints, not authoritative. |
| REQ-024 | The unlinked transfers filter (REQ-014) must not include Plaid-suggested transfers that the user has not confirmed. Only user-categorized transfers appear as unlinked. |

---

## 7. Budget & Report Impact

| # | Requirement |
|---|-------------|
| REQ-025 | Transfer linking must not change how transfers are excluded from budgets and reports. The existing behavior — excluding transactions with transfer categories from income/expense calculations — remains unchanged. |
| REQ-026 | The reports section may optionally include a **Transfer Summary** view showing: total transfer volume, linked vs. unlinked counts, and transfers by account pair. This is a nice-to-have, not a launch requirement. |

---

## 8. Migration & Backward Compatibility

### 8.1 Non-Breaking Rollout

| # | Requirement |
|---|-------------|
| MIG-001 | The new `transferGroupId` and `linkedTransactionId` fields must default to `null` on all existing transactions. No data migration is required at launch. |
| MIG-002 | All existing transfer detection logic (`isTransferCategory()`, budget exclusions, report filtering) must continue to work unchanged. Transfer linking is purely additive. |
| MIG-003 | Existing transactions already categorized as `TRANSFER_IN` or `TRANSFER_OUT` must appear as **unlinked transfers** after the feature launches, allowing users to link them through the normal workflow. |

### 8.2 Historical Pairing

| # | Requirement |
|---|-------------|
| MIG-004 | The system must not auto-link historical transfers. All linking must be user-initiated through the standard workflow. |
| MIG-005 | The unlinked transfer filter (REQ-012) is the primary mechanism for users to work through historical transfers at their own pace. |

---

## 9. Chatbot Integration

| # | Requirement |
|---|-------------|
| REQ-027 | The chatbot's read-only data service must expose transfer linking data (`transferGroupId`, `linkedTransactionId`) so the chatbot can answer questions like "Are all my transfers matched?" or "Show me unlinked transfers." |
| REQ-028 | The chatbot must understand the concept of linked transfers and be able to summarize transfer activity between accounts. |

---

## 10. Assumptions

| # | Assumption |
|---|------------|
| A-1 | Transfers only occur between the user's own connected accounts. External transfers (Venmo, Zelle, wire transfers to third parties) are categorized as regular income or expense. |
| A-2 | Transfer amounts always match exactly. The system does not handle partial matches or fee-adjusted transfers (e.g., wire transfer fees). If amounts differ, they cannot be linked. |
| A-3 | The existing `TRANSFER_IN` / `TRANSFER_OUT` category hierarchy is sufficient. No new categories are needed. |
| A-4 | Plaid's `plaidCategoryId` is a useful hint for surfacing suggested transfers but is never treated as authoritative. |
| A-5 | Split transactions cannot be part of a transfer link. If a user needs to link a partial amount, they must split the transaction first, then link the split portion. |

---

## 11. Out of Scope

| Item | Rationale |
|------|-----------|
| External / third-party transfers | Different problem — no counterpart in connected accounts |
| Automatic linking without user confirmation | User trust and accuracy are paramount for financial data |
| Fee-adjusted transfer matching | Edge case — users can manually handle via split + link if needed |
| Transfer groups larger than 2 | Simplicity — one-to-one pairing covers the core use case |
| Recurring transfer detection | Future enhancement — could suggest "this looks like a monthly payment" |
| Bulk linking workflow | The filter + individual link flow is sufficient for launch; bulk operations can be added if users report friction |

---

## 12. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | ~~Should the linking prompt appear inline in the categorization flow, or as a separate step/modal after categorizing?~~ | Resolved — within the existing transaction edit modal (D1) |
| 2 | What visual treatment works best for linked pairs in the transaction list? (grouped border, connector line, icon, etc.) | Open |
| 3 | Should the Plaid suggestion indicator (REQ-022) be part of the transaction row or only visible in the categorization modal? | Open |
| 4 | Should there be a dashboard widget or notification for unlinked transfer count, or is the filter badge (REQ-015) sufficient? | Open |
| 5 | How should the counterpart display work when the paired transaction is in a different month than the current view? | Open |

---

## 13. Success Criteria

- Users can link transfer pairs and verify both sides posted correctly.
- Linked transfers are visually connected in the transaction list.
- Unlinked transfers are easy to find and resolve via filtering.
- Existing budget exclusion, report filtering, and transfer detection behavior is unchanged.
- No data migration is required — the feature rolls out cleanly on top of existing data.
- Plaid suggestions help users identify transfers without being treated as truth.

---

## 14. Notes

### One-Sided Venmo Transfer Problem (2026-04-07)

**Status:** Shelved — the double-counting and reconciliation problems this BRD addresses have not materialized as real pain points for a 2-user household app. The complexity is not justified.

**Key finding from data analysis:** When Venmo auto-funds a payment from a linked bank account (e.g., BoA checking), Plaid reports **2 transactions, not 3**:

1. **Venmo account**: The actual payment to the person (e.g., "Rachel Scott '12/9 ty!'" $160) — categorized as the real expense (CUSTOM_HOUSE_CLEANING)
2. **BoA Checking**: "Venmo" for the same amount ($160) — categorized as TRANSFER_OUT

There is no intermediate "transfer into Venmo" transaction on the Venmo side. This means the BoA→Venmo auto-funding creates a **one-sided transfer**: a TRANSFER_OUT on BoA with no corresponding TRANSFER_IN. Under this BRD's model (INV-004), these can never be linked as a pair.

**Implications if this feature were built:**
- Every Venmo auto-funding transaction would permanently appear in the "unlinked transfers" filter, creating noise
- The correct categorization is already what users do today: expense category on Venmo, TRANSFER_OUT on BoA — no linking needed
- The real risk (double-counting) only occurs if users miscategorize the BoA "Venmo" debit as an expense instead of a transfer
