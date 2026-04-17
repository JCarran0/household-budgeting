# Savings Category Flag & Spending Consistency — Business Requirements Document

**Status:** Draft  
**Author:** Jared Carrano  
**Date:** 2026-04-16  
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

Savings and investment contributions (401k, IRA, brokerage deposits, etc.) are currently tracked as expenses. This inflates "spending" figures across the app — cash flow reports, the dashboard's Monthly Spending widget, and any other surface that aggregates expenses. Users cannot easily distinguish how much they actually consumed vs. how much they set aside.

### 1.2 Solution Summary

Introduce an `isSavings` flag on top-level budget categories. Transactions in savings categories are excluded from spending totals by default throughout the app. Reports and the dashboard surface savings as a distinct, first-class metric. A toggle on relevant report views lets users include savings in the net calculation when they want the full cash-out-the-door picture.

Separately, audit all app surfaces that display "spending" or "net" figures to ensure they use consistent, savings-aware definitions.

---

## 2. Requirements

### 2.1 Category Model

**REQ-001:** The top-level category model must support an `isSavings` boolean flag (default: `false`).

**REQ-002:** `isSavings` is settable only on top-level categories. All subcategories inherit the flag from their parent; it cannot be overridden at the subcategory level.

**REQ-003:** Users can set or clear `isSavings` on any top-level category via the category management UI.

**REQ-004:** The category list UI must visually distinguish savings categories (e.g. a badge or icon).

### 2.2 Spending & Cash Flow Calculations

**REQ-005:** Any calculation labeled "spending" or "expenses" across the app must exclude transactions belonging to savings categories.

**REQ-006:** Any calculation labeled "net" (net cash flow, net budget variance, etc.) must by default exclude savings categories from the expense side.

**REQ-007:** Savings are never classified as income. They are a third category alongside income and spending.

### 2.3 Cash Flow Report

**REQ-008:** The cash flow report must display three line items: **Income**, **Spending** (excludes savings), and **Savings** (savings category transactions only).

**REQ-009:** The default net calculation is: `Net = Income − Spending`.

**REQ-010:** A toggle ("Include savings in net") switches the net formula to: `Net = Income − Spending − Savings`. The savings line remains visible regardless of toggle state; only its inclusion in the net changes.

**REQ-011:** The toggle state persists for the session but does not need to persist across page reloads.

### 2.4 Dashboard

**REQ-012:** The dashboard must display a **Monthly Savings** widget showing the total of savings-category transactions for the current month.

**REQ-013:** The dashboard's **Monthly Spending** widget must reflect only non-savings expenses (consistent with REQ-005).

**REQ-014:** The dashboard's net or summary figures must be consistent with the savings-aware definitions in REQ-006.

### 2.5 App-Wide Consistency Audit

**REQ-015:** All surfaces displaying spending, expense totals, or net figures must be audited and updated to exclude savings categories. This includes (at minimum): Dashboard, Cash Flow Report, Budget vs. Actual view, Yearly Budget Grid, and any category spending summaries.

**REQ-016:** The AI chatbot's financial data tools (`get_accounts`, `get_spending_by_category`, `get_cash_flow`, `get_budget_summary`) must return savings-aware figures and expose savings as a distinct value where applicable.

---

## 3. Assumptions

- A "savings category" maps cleanly to a top-level category (e.g. "Retirement", "Investments"). No use case exists for a mixed category where some subcategories are savings and others are not.
- Transactions are already assigned to categories; the flag retroactively reclassifies how those transactions are aggregated, not how they are stored.
- Transfers between accounts (already a separate concept) are distinct from savings contributions and are not affected by this feature.

---

## 4. Open Questions

All open questions resolved.

| # | Question | Resolution |
|---|----------|------------|
| OQ-001 | Should the budget vs. actual view show savings categories in a separate section, or inline with a visual indicator? | **Separate section** |
| OQ-002 | Should the yearly budget grid separate savings rows visually? | **Separate section** |
| OQ-003 | Should the chatbot prompt be updated to explain the savings/spending distinction to the model? | **Yes** — update system prompt so "spending" queries exclude savings |

---

## 5. Out of Scope

- Savings goals or targets (e.g. "save $500/month toward retirement") — this is a tracking feature, not a goals feature.
- Automatic detection or suggestion of which categories should be marked as savings.
- Sub-category level `isSavings` overrides.
- Persistent toggle state across sessions.
