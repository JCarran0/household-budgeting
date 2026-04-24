# Rollover Budgets — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-21
**Version:** 1.0
**Related:** `docs/features/BUDGET-VS-ACTUALS-II-BRD.md` (consumer of this concept)

---

## 1. Overview

### 1.1 Problem Statement

Some household expenses are intentionally lumpy. A user might know they spend ~$1,200/year on car repairs, but actual spend is $0 in most months and $600 in a few. Budgeting $100/month for this category makes every low-spend month look like a big surplus, and every repair month look like a catastrophic overspend. Neither reflects reality: the user's actual budgeting intent is *annual*, not *monthly*.

The same pattern shows up on the income side (variable freelance/commission/bonus income) and the savings side (irregular IRA lump sums, bonus-driven 401k catch-up contributions).

The app already has a stored `isRollover` boolean on the `Category` model (renamed from `isSavings` in Sep 2025), but the flag currently has **no behavior attached** — setting it is a no-op. This BRD gives that flag real semantics for the first time.

### 1.2 Solution Summary

Make rollover a first-class budgeting concept. A user flags a category as rollover, and within that calendar year:

- Surpluses (underspend on expense categories, overearn on income/savings) **carry forward** into the next month's effective budget.
- Deficits (overspend, underearn) also carry forward, reducing the next month's effective budget.
- The running balance resets to zero on January 1.

Rollover balance is **derived on the fly** from `monthlyBudgets` + `transactions`. No new persistence, no migrations, no stored state.

v1 surfaces rollover on exactly one page: the new Budget vs. Actuals II tab (see the consuming BRD). Every other existing page continues to ignore rollover and shows raw budgeted-vs-actual figures.

### 1.3 Users

Both family members. Rollover is a per-category property, so one user flagging a family category affects the view for both.

### 1.4 Relationship to Existing Concepts

- **`Category.isHidden`** — family-wide flag that excludes a category from budgets and reports everywhere. Orthogonal to rollover. A category can be both hidden and rollover.
- **`Category.isSavings`** — top-level flag that excludes a category's transactions from spending totals. Orthogonal to rollover. Savings categories can be flagged rollover.
- **`isBudgetableCategory(categoryId)`** — existing helper that returns `false` for transfers (`TRANSFER_IN*`, `TRANSFER_OUT*`). Rollover is only meaningful on budgetable categories.
- **`buildCategoryTreeAggregation` / `max(parent, sum(children))`** — the existing parent rollup rule. Rollover-adjusted "effective" budgets plug into the same rule (see §3.5).

---

## 2. The Rollover Concept

### 2.1 Flag

**REQ-001:** The `Category.isRollover` boolean flag (already present in the schema) governs whether a category participates in rollover math. Default: `false`.

**REQ-002:** `isRollover` can only be set on budgetable categories. A category where `isBudgetableCategory(id) === false` (today: transfers) cannot be flagged rollover.

**REQ-003:** `isRollover` applies to the individual category node, not transitively. A parent being flagged does not flag its children, and vice versa.

### 2.2 Rollover Balance — Definition

**REQ-004:** For any category `cat` flagged `isRollover=true` and any month `month` in year `Y`:

```
rolloverBalance(cat, month) = Σ (budgeted_i − actual_i) for i = Jan(Y) .. month − 1
```

Where:
- `budgeted_i` is the category's `MonthlyBudget` amount for month `i` (or `0` if no budget record exists for that month).
- `actual_i` is the sum of that category's non-removed, non-transfer transactions in month `i`, computed consistent with the existing `shared/utils/transactionCalculations.ts` and `transactionReader.ts` conventions.

**REQ-005:** For the first month of any calendar year (January), `rolloverBalance(cat, Jan) = 0` unconditionally.

**REQ-006:** Rollover balance is **derived on every read**. It is not stored, not cached across requests in any stateful way, and not stamped at month-close. The source of truth is the existing `monthlyBudgets` and transaction records.

### 2.3 Effective Budget

**REQ-007:** A category's **effective budget** for display and variance computation in rollover-aware surfaces is:

```
effectiveBudget(cat, month) = budgeted(cat, month) + rolloverBalance(cat, month)
```

When `isRollover=false`, `effectiveBudget === budgeted`.

**REQ-008:** `effectiveBudget` may be negative (e.g., a large early-year overspend leaves the category in the red for subsequent months). Negative values must be displayed literally (e.g., `"Effective budget: −$450"`) with explanatory tooltip copy such as *"You've exceeded your annual plan by $450 so far this year."* Negative effective budgets are **not** errors.

### 2.4 Symmetric Carry — Signed Math

**REQ-009:** Both surpluses and deficits carry. The sign is preserved.

**REQ-010:** The formula in REQ-004 is type-agnostic. It applies identically to spending, income, and savings categories. The interpretation differs per type but the math does not.

Worked examples (month-over-month, one rollover category each):

| Type | Prior month budget | Prior month actual | Carry | Next month effective | Intuition |
|---|---:|---:|---:|---:|---|
| Spending | $100 | $80 | +$20 | $100 + $20 = $120 | Banked $20 of allowance |
| Spending | $100 | $120 | −$20 | $100 − $20 = $80 | Borrowed from future |
| Income | $500 | $700 | −$200 | $500 − $200 = $300 | Ahead of yearly pace |
| Income | $500 | $0 | +$500 | $500 + $500 = $1000 | Need to catch up |
| Savings | $500 | $300 | +$200 | $500 + $200 = $700 | Behind on savings target |
| Savings | $500 | $800 | −$300 | $500 − $300 = $200 | Ahead on savings target |

**REQ-011:** Display coloring and "goodness" interpretation is per-type (not part of the rollover math itself) and is specified in the consuming BRD (`BUDGET-VS-ACTUALS-II-BRD.md`). Summary: for spending, `actual > budget` is unfavorable; for income and savings, `actual > budget` is favorable.

### 2.5 Rollover Period — Calendar Year

**REQ-012:** The rollover period is the calendar year. The running balance resets to zero on January 1. Residual balances at December 31 **evaporate** — they do not carry into the next year.

**REQ-013:** There is no user-configurable fiscal year, no rolling 12-month window, and no per-category custom start date in v1.

### 2.6 Mid-Year Activation and Deactivation

**REQ-014:** Flagging a category `isRollover=true` mid-year causes the derived balance to include all prior months of the current calendar year (Jan through month − 1). There is no "rollover active since" marker.

**REQ-015:** Unflagging a category mid-year removes rollover balance from all future views. Re-flagging later restores the full year-to-date derivation (because the source data has not changed).

**REQ-016:** Because the first year of the feature may surface balances users did not know were accruing, rollover-aware surfaces should display a small explanatory note near the rollover toggle on first activation, such as: *"Rollover balance reflects all months since January of the current year."*

---

## 3. Subtree Exclusivity

### 3.1 The Rule

**REQ-017:** Within any parent→child subtree, `isRollover` may be true on **either** the parent **or** one-or-more children, but **not both**. In other words: in the chain from any category up to its top-level ancestor, at most one node may have `isRollover=true`.

This rule exists because the same transactions contribute to both a parent's aggregated actuals and its children's direct actuals. Allowing simultaneous parent + child rollover would produce two independently tracked balances covering overlapping dollars — mathematically defined but mentally confusing.

### 3.2 Enforcement

**REQ-018:** The Categories page must enforce the exclusivity rule at toggle time:

- Flagging a parent as rollover while one or more children are flagged: show a confirmation modal listing the affected children, and on confirm, unflag them atomically with the parent flag change.
- Flagging a child as rollover while its parent is flagged: show an inline error or confirmation, and on confirm, unflag the parent atomically with the child flag change.

**REQ-019:** The backend category update endpoint must also enforce the exclusivity rule. Attempts to set `isRollover=true` on a node when an ancestor or descendant is already flagged must return a validation error. Frontend enforcement is convenience; backend enforcement is correctness.

### 3.3 Data Integrity on First Load

**REQ-020:** On first load after this feature ships, the app may encounter categories where an invalid parent+child combination already exists (because the `isRollover` flag was previously settable with no behavior). On the Categories page, any such violation must be surfaced as a one-time data-integrity prompt listing the conflicts and asking the user to pick which node to keep flagged. No automatic resolution — user must choose.

### 3.4 Interaction with Category Hierarchy

**REQ-021:** The app's category hierarchy is two levels deep (parent + child, no grandchildren). The exclusivity rule reduces to a simple pairwise check per parent subtree. If the hierarchy is ever deepened, the rule generalizes to "at most one node per ancestor chain."

### 3.5 Interaction with Parent Rollup

**REQ-022:** The existing parent aggregation rule, `max(parent, sum(children))`, continues to apply. When computing the parent row's displayed budget in a rollover-aware surface, both sides of the `max` use effective values:

```
parent_row_effective_budget = max(parent_effective, Σ children_effective)
```

where `x_effective = x_budget + rolloverBalance(x, month)` when `x.isRollover` else `x_budget`.

**REQ-023:** Parent actuals remain additive (parent direct + sum of children), unchanged from today. Rollover never alters how actuals are computed.

---

## 4. Scope of Rollover Awareness in v1

**REQ-024:** Exactly one surface in v1 consumes rollover math and offers a "Use Rollover" toggle: the **Budget vs. Actuals II** tab (specified in its own BRD).

**REQ-025:** All other existing surfaces continue to ignore `isRollover` and display raw `budgeted` and `actual` values as they do today. This includes at minimum:

- ~~The existing `BudgetComparison.tsx` Budget vs. Actual tab~~ — retired 2026-04-23; BvA II is now the sole Budget vs. Actuals surface.
- `YearlyBudgetGrid.tsx` (budget planning grid)
- Reports widgets (Budget Comparison, Spending Composition, etc.)
- Cash Flow report
- Dashboard
- AI chatbot financial tools (`get_budget_summary`, etc.)

**REQ-026:** The Categories page must surface the `isRollover` toggle with explanatory copy that reflects the new real semantics. Specifically:

- The toggle label and help text must describe what rollover does ("Budget surpluses and deficits carry over month-to-month within the calendar year").
- The toggle must be **hidden or disabled with an explanatory tooltip** for any category where `isBudgetableCategory(id) === false` (transfers).
- When the user toggles a parent whose children are flagged (or vice versa), the exclusivity enforcement from §3.2 fires.

**REQ-027:** The v1 scope boundary is intentional. Rollover is a new mental model, and surfacing it in every view simultaneously would change every number on every page for users who flag any category. A single opt-in surface lets users learn the concept in one place before deciding whether it should propagate further.

---

## 5. Implementation Notes

### 5.1 No New Persistence

No new tables, columns, or stored balances. The only schema change is **giving the existing `isRollover` boolean real meaning at read time**; the column itself already exists and already round-trips through the API.

### 5.2 Performance

Rollover balance computation is O(months_in_year × categories_rendered) per request at worst. For the 2-user household scale (~20 rollover-eligible categories, 12 months), this is trivially cheap and does not warrant caching.

### 5.3 Shared Utility

Rollover math must live in `shared/utils/budgetCalculations.ts` (or a sibling module) alongside the existing `buildCategoryTreeAggregation`. Consumers (BvA II, future surfaces) call into this utility; they do not inline the math.

### 5.4 Consistency with Existing Readers

Actuals used in rollover math must come through the canonical `transactionReader.ts` filter (excludes `status === 'removed'`) and must respect transfer exclusion via `transactionCalculations.ts`. No bespoke transaction aggregation inside the rollover utility.

---

## 6. Assumptions

- The 2-user household scale means simple derive-on-read math is always fast enough; no caching layer is needed.
- Users can tolerate the behavior that year-end residual balances evaporate on January 1. If they want to carry a surplus into the next year, they bump the next-year January budget manually.
- Retroactive edits to historical budgets or transactions will cause rollover balances to recompute, which is the same behavior as every other derived aggregation in the app.
- Users will not try to use rollover as an audit/accounting tool. If that need arises, v2+ can add stored monthly snapshots.

---

## 7. Out of Scope

- **Stored/stamped rollover balances.** No month-close snapshot, no cron.
- **Manual balance adjustments.** There is no "reset my rollover to zero" action in v1. If the user truly needs to, they edit prior-month budgets.
- **Custom or rolling rollover periods.** Calendar year only.
- **Cross-year carry.** December 31 residual evaporates.
- **Rollover on transfers.** Structurally impossible (non-budgetable).
- **Rollover awareness in Reports, Cash Flow, Dashboard, YearlyBudgetGrid, existing BvA, or the chatbot.** Deferred.
- **Backfill or migration.** The `isRollover` column already exists; no data migration is needed.
- **Automatic suggestions for which categories to flag rollover.** Users decide manually.

---

## 8. Open Questions

All open questions resolved during the design conversation on 2026-04-21.

| # | Question | Resolution |
|---|----------|------------|
| OQ-001 | Store vs. derive rollover balance? | **Derive on the fly** — no new persistence |
| OQ-002 | What is the rollover period? | **Calendar year**, resets Jan 1; year-end residual evaporates |
| OQ-003 | Do deficits carry symmetrically with surpluses? | **Yes, symmetric signed carry** |
| OQ-004 | Does math differ by category type (spending/income/savings)? | **No** — math is type-agnostic; display coloring flips per type |
| OQ-005 | Can parent AND child both be flagged rollover? | **No** — exclusive within any subtree |
| OQ-006 | Which category types can be flagged? | **Spending, income, and savings**. Not transfers. |
| OQ-007 | Which surfaces are rollover-aware in v1? | **BvA II only**. Categories page updated for toggle UX. All others unchanged. |
| OQ-008 | What happens to the existing no-op `isRollover` flag on first load with this feature? | Data-integrity prompt if any parent+child conflict exists; otherwise flag gains semantics silently |

---

## 9. Success Criteria

- A user can flag a category as rollover and see its monthly budget on BvA II adjust by the year-to-date carry.
- The subtree exclusivity rule is enforced consistently in UI and backend.
- Categories flagged rollover in the past (with no behavior) either continue to work correctly, or surface a one-time conflict prompt if they now violate the exclusivity rule.
- No existing surface's numbers change as a result of shipping this BRD (because all other surfaces are rollover-unaware in v1).
- No new persistence, migrations, or cron jobs are required to ship.
