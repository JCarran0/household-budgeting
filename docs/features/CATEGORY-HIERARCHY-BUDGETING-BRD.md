# Category Hierarchy in Budgeting & Reports — Business Requirements Document

**Status:** Ready for Review
**Author:** Jared Carrano
**Date:** 2026-04-17
**Version:** 1.3

---

## 1. Overview

### 1.1 Problem Statement

The app supports a two-level category hierarchy (Parent → Subcategory). Users plan budgets at the parent level (e.g. "Travel = $5,000") but categorize transactions at the leaf level (e.g. "Travel → Flights", "Travel → Lodging", "Travel → Other") for analytical fidelity. Rollup behavior has never been formalized in a single specification; the closest documentation (`AI-USER-STORIES.md` §"Hierarchical Budget Display") describes a partially-correct rule that doesn't match shipped code, and rollup logic that *does* exist is duplicated inline in components rather than centralized.

The clearest symptom is in **Reports → Budget Performance**:

> **Reproduction:** Budget $5,000 to parent category "Travel" for the month. Spend $4,800 across "Travel → Flights", "Travel → Lodging", and "Travel → Other" (no budget on the children).
>
> **Observed:** "Unused Budgets" widget shows Travel = $5,000 (0% used). "Unbudgeted Spending" widget shows Flights, Lodging, Other as separate unbudgeted spend lines. Both are wrong.
>
> **Expected:** Travel parent's actual rolls up child spending; the budget is correctly identified as well-used; nothing appears in "Unbudgeted Spending".

The root cause is that `frontend/src/components/reports/BudgetPerformanceSection.tsx` (lines 87–195) and `backend/src/services/budgetService.ts` widget-feeding paths aggregate per-category-id without parent rollup. They evaluate "budgeted" and "actual" on the literal category the data was recorded against, ignoring the hierarchy.

Beyond the bug, two distinct user intents are being conflated and need to be served by separate surfaces:

1. **Variance analysis** ("Where did my plan break?") — operates at the budget unit, i.e. parent.
2. **Spending forensics** ("Where did the money actually go?") — operates at the leaf for next-year planning.

### 1.2 Solution Summary

1. Codify the existing parent/child budgeting semantics in this BRD as the single source of truth.
2. Apply those semantics consistently to **all** Reports → Budget Performance widgets, so variance widgets evaluate at the rolled-up parent level.
3. Add a separate **Spending Composition** widget that exposes leaf-level detail explicitly, so the forensic intent is served without polluting variance widgets.
4. Audit other surfaces (chatbot tools, dashboard) for the same class of bug.

---

## 2. Requirements

### 2.1 Category Hierarchy Semantics (Canonical Definitions)

These rules already exist for the Budget page; this BRD lifts them into one place and makes them the binding definition for the entire app.

**REQ-001:** A category is either a **parent** (no `parentId`) or a **child** (has `parentId` referencing a parent). The hierarchy is exactly two levels deep.

**REQ-002:** **Effective parent budget (max, both types):** For both expense and income parents, the effective budget for any reporting period is `max(direct parent budget, sum of children budgets)`. The parent budget represents the umbrella total for the tree; children are subdivisions *within* that total. This rule applies uniformly to income and expense — the income/expense distinction lives in *variance interpretation* (REQ-002a), not in aggregation math.

**REQ-002a:** **Variance interpretation by type:** Variance display semantics differ by type — under-target is "bad" for income (you wanted to earn at least the target) and "good" for expense (you spent less than the cap). This is independent of REQ-002 and applies to both leaf and rolled-up rows.

**REQ-003:** **Reserved.** (Previous v1.2 "both-level budget UX hint" is no longer needed: under the max rule, double-budgeting is no longer a silent total-inflating surprise — the larger of the two is enforced and the user can always see both numbers in the drill-down per REQ-012.)

**REQ-004:** **Effective parent actual:** For both expense and income parents, the effective actual is `direct parent transactions + sum of children transactions` for the period. Actuals are *always* additive — they represent money that actually moved.

**REQ-005:** **Effective parent "is budgeted":** A parent is considered budgeted if its effective budget (per REQ-002 / REQ-003) is greater than zero. A parent with no direct budget but at least one budgeted child is therefore budgeted.

**REQ-006:** **Effective parent "has spending":** A parent is considered to have spending if its effective actual (per REQ-004) is non-zero.

**REQ-007:** All shared utilities for budget rollup must live in `shared/utils/` and be the only implementation used across backend services and frontend components. Inline rollup logic in components or services is prohibited.

### 2.2 Reports → Budget Performance Widgets (Bug Fix)

**REQ-008:** All five existing widgets in `BudgetPerformanceSection.tsx` must classify rows using the **rolled-up parent view** by default. The aggregation map keyed by raw `categoryId` (currently `categoryAgg`) must be replaced with (or supplemented by) a parent-rolled-up aggregation that applies REQ-002 through REQ-006 before any widget-level classification.

**REQ-009:** Widgets affected by REQ-008:

| Widget | Current Behavior | Required Behavior |
|---|---|---|
| Budget Accuracy Score | Sums per-categoryId budgeted vs actual | Sums per-effective-parent budgeted vs actual |
| Top 10 Budget Gaps | Per-categoryId gap | Per-effective-parent gap |
| Consistently Over-Budget | Per-categoryId monthly comparison | Per-effective-parent monthly comparison: a tree exceeds budget in month M iff `effective_actual(M) > effective_budget(M)`. As a consequence, parents currently flagged because a single child overspent (with the parent itself under) will no longer trigger if the rest of the tree was under — which is the correct behavior, since the user's plan was the parent total, not the child split. |
| Unused Budgets (<10% spent) | Per-categoryId | Per-effective-parent |
| Unbudgeted Spending | Per-categoryId | Per-effective-parent |

**REQ-010:** **"Unbudgeted Spending" rollup behavior:** Two distinct cases must be distinguished:

- **Parent has a direct budget:** The entire tree is considered covered. Nothing from this tree appears in "Unbudgeted Spending", regardless of which children spent.
- **Parent has no direct budget, but one or more children are budgeted:** The user is signalling deliberate child-level granularity. Siblings with spending and no budget *do* appear in "Unbudgeted Spending" as leaf rows. The fact that *some* child is budgeted does not cover the rest.
- **No node in the tree is budgeted:** Spending appears as leaf rows in "Unbudgeted Spending", grouped under no parent.

Rationale: budgeting at the parent level means "treat this as a pool"; budgeting at the child level means "be granular about this tree". The widget must respect that signal rather than collapse both cases into one rule.

**REQ-011:** **"Unused Budgets" rollup behavior:** A parent appears in "Unused Budgets" only if its rolled-up actual is less than 10% of its effective budget. Children's spending counts toward this calculation.

**REQ-012:** Each widget row that represents a rolled-up parent must support drill-down to its leaf composition (modal, popover, or expandable row — exact UI is design-time choice but a means of seeing the leaves must exist). The default drill-down view shows only children with non-zero activity for the period; a "show all" affordance reveals zero-activity children for the planning case ("what other children exist that I could allocate to?").

### 2.3 Spending Composition Widget (New)

**REQ-013:** Add a new widget to Reports → Budget Performance titled **"Spending Composition"**. It answers: "Within categories I budgeted at the parent level, how did my actual spending break down across child categories?"

**REQ-014:** The widget lists each parent that (a) has a non-zero effective budget per REQ-002 and (b) has spending recorded against at least one of its children. For each such parent, it shows:
- Parent name and effective budget
- Each child with non-zero spending: child name, actual amount, percent of parent's actual
- Direct-on-parent spending (if any) shown as its own row labeled "(direct)"

**REQ-015:** Spending Composition is purely informational — it has no notion of "good" or "bad" spending, no thresholds, and no warnings. Its job is to surface where money landed within budgeted parents for next-period planning.

**REQ-016:** Spending Composition is independent of variance widgets — a parent that appears in "Top 10 Budget Gaps" can also appear in Spending Composition. They serve different intents.

### 2.4 App-Wide Consistency Audit

**REQ-017:** The AI chatbot data tools that aggregate by category — at minimum `get_spending_by_category` and `get_budget_summary` — must apply the rollup rules from §2.1 when summarizing at the parent level, and must clearly distinguish parent vs. child rows in their responses so the model does not present rolled-up and leaf data as comparable. Each row in the response must include an `aggregation_level` field with value `'parent_rollup'` or `'leaf'`. The chatbot system prompt must additionally be updated to explain the rollup semantics so the model interprets the field correctly. (The structural field plus prompt is belt-and-suspenders: prompts degrade on long contexts; the field is cheap, self-documenting, and gives a hook for a future `level: 'leaf'` tool variant.)

**REQ-018:** The Dashboard's budget-related widgets (anything that surfaces "over budget" or "under budget" status) must apply the rollup rules from §2.1.

**REQ-019:** The Yearly Budget Grid is out of scope for changes — it is a planning surface and already correctly displays parent and child rows separately for editing. No rollup change is required there.

**REQ-020:** Any new financial surface added to the app must use the shared rollup utilities from REQ-007 by default. Surfaces that intentionally show leaf-only data (e.g. transaction lists) are exempt but must be explicit about that choice in code comments.

---

## 3. Assumptions

- The existing two-level hierarchy is sufficient. No requirement for arbitrary-depth nesting.
- Users budget at either the parent or the child level for a given tree, but rarely both. The `max()` rule in REQ-002 handles the rare case where they do.
- The "transfer" category type is independent of this BRD — transfers continue to be excluded from all spending and variance calculations as today.
- The `isSavings` flag from `SAVINGS-CATEGORY-BRD.md` is orthogonal: savings exclusion happens before rollup, so a savings parent's children are also excluded from spending widgets.
- Drill-down UX (REQ-012) can reuse the existing `TransactionPreviewTrigger` pattern already used in Budget Performance widgets.

---

## 4. Open Questions

All open questions resolved.

| # | Question | Resolution |
|---|----------|------------|
| OQ-001 | For "Unbudgeted Spending", if a user budgets a single child (e.g. "Travel → Flights = $2,000") but spends on a sibling without a budget ("Travel → Lodging"), should Lodging appear as unbudgeted? | **Yes** — refined REQ-010. Parent-level budget covers the whole tree; child-level budgets signal deliberate granularity, so unbudgeted siblings *do* surface as leaf rows. |
| OQ-002 | Should the rollup behavior in Reports be the only behavior, or should there be a "view leaves" toggle as a power-user escape hatch? | **No toggle.** Variance and forensic intents are served by separate widgets (variance widgets per §2.2, Spending Composition per §2.3) rather than one widget in two modes. |
| OQ-003 | For "Consistently Over-Budget" at the rolled-up level: a tree exceeds its effective budget in month M if `effective_actual(M) > effective_budget(M)`. Confirmed? | **Confirmed.** Documented in the REQ-009 table row for "Consistently Over-Budget", including the consequence that single-child overspends inside an otherwise under-budget tree no longer trigger the flag. |
| OQ-004 | Should the chatbot's tool responses (REQ-017) include a per-tool flag like `aggregation: 'parent_rollup'`, or is it sufficient to update the system prompt? | **Both.** REQ-017 now requires an `aggregation_level` field on rows *and* a system prompt update. Belt-and-suspenders against context-window prompt drift. |
| OQ-005 | When drilling down from a rolled-up parent row (REQ-012), should the leaf list show all children or only those with non-zero activity for the period? | **Non-zero by default**, with a "show all" affordance. Folded into REQ-012. |

---

## 5. Out of Scope

- Arbitrary-depth category nesting (more than two levels).
- Reassigning historical transactions when a category is moved between parents.
- A "view as leaves" toggle on Budget Performance widgets (see OQ-002).
- Changes to the Yearly Budget Grid (per REQ-019).
- Changes to how budgets are *created* or *edited* — this BRD is about how they are *aggregated and displayed* in Reports and downstream surfaces.
- New persistence: no new fields on the Category or Budget data models are required.

---

## 6. References

- `docs/AI-USER-STORIES.md` — "Hierarchical Budget Display" section (existing rollup rules for the Budget page that this BRD generalizes)
- `frontend/src/components/reports/BudgetPerformanceSection.tsx:87-195` — current flat aggregation that REQ-008 replaces
- `backend/src/services/budgetService.ts:160-267` — existing per-category `getBudgetVsActual` and `getMonthlyBudgetVsActual`; rollup utilities should be applied to consumers, not embedded here
- ~~`frontend/src/components/budgets/BudgetComparison.tsx:181-245`~~ — Retired 2026-04-23. The canonical max-rule rollup now lives only in `shared/utils/bvaII*` and is consumed by BvA II. The migration described here shipped in BvA II from day one; the legacy additive path was never migrated and was instead deleted with the tab.
- `shared/utils/budgetCalculations.ts:338` — existing `calculateEnhancedParentTotals` (additive, currently unused by UI). Will be replaced by the canonical max-rule utilities required by REQ-007.
- `docs/features/SAVINGS-CATEGORY-BRD.md` — orthogonal savings-exclusion behavior
- `docs/AI-USER-STORIES.md` §"Hierarchical Budget Display" — predates this BRD. Was partially right (max for expense) and partially wrong (additive for income). Superseded by REQ-002 (max for both) and slated for cleanup in implementation.
