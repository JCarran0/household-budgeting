# Budget vs. Actuals II — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-21
**Version:** 1.0
**Depends on:** `docs/features/ROLLOVER-BUDGETS-BRD.md`

---

## 1. Overview

### 1.1 Problem Statement

The existing Budget vs. Actual tab (`frontend/src/components/budgets/BudgetComparison.tsx`) presents a flat list per month. Over time, the household's needs have grown beyond what that view supports:

- **No hierarchical exploration.** The user cannot collapse detail and see category rollups at a glance.
- **No way to focus.** Every category shows every month. There is no quick filter for "show me only where I'm over budget" or "hide this category, I don't care about it."
- **No support for annual budgeting intent.** Rolled-forward surpluses and deficits (the rollover pattern — see the Rollover Budgets BRD) have no home in this view.
- **Editing requires navigating away.** To adjust a budget when the user notices drift, they leave the comparison view, go to the budget grid, edit, and come back.

Rather than rewrite the existing tab — which is used and trusted — we add a new tab alongside it.

### 1.2 Solution Summary

Add a new tab, **Budget vs. Actuals II**, to the Budgets page (`frontend/src/pages/Budgets.tsx`). The new tab is:

- **Accordion-first.** One row per parent category; expanding a row reveals its children.
- **Rollover-aware.** A "Use Rollover" toggle applies the effective-budget math defined in the Rollover Budgets BRD.
- **Filterable.** Users filter by category type (spending / income / savings multi-select), by variance health (over / under / seriously over), and by dismiss state.
- **Editable in place.** Each row has an edit button that opens a modal for changing the current month's budget, or bulk-updating all future months of the year, with a before/after confirmation.
- **Per-user configurable.** Users can dismiss parent rows they don't care about — a per-user, page-local preference distinct from the family-wide `Category.isHidden` concept.

The existing BvA tab is untouched and continues to serve users who prefer it.

### 1.3 Users

Both family members. Page-local user preferences (dismiss set) are per-user via localStorage; filters are URL-persisted and therefore shareable.

### 1.4 Relationship to Existing Surfaces

This BRD is **additive**:

- The existing `BudgetComparison.tsx` tab is unchanged.
- `YearlyBudgetGrid.tsx` is unchanged.
- Reports widgets, Cash Flow, and Dashboard are unchanged.
- Per the Rollover Budgets BRD §4, BvA II is the **sole** surface that is rollover-aware in v1.

---

## 2. Page Structure

### 2.1 Location & Navigation

**REQ-001:** BvA II is a new tab on the Budgets page at `/budgets`. The tab label is **"Budget vs. Actuals II"**.

**REQ-002:** The tab is selectable alongside the existing Budget vs. Actual tab via Mantine `Tabs`. URL param `view=bva-ii` activates it, consistent with how existing tabs work on the Budgets page.

**REQ-003:** The existing month selector (`MonthPickerInput` with prev/next chevrons) at the top of the Budgets page applies to BvA II unchanged. Changing the month updates URL param `month=YYYY-MM`.

### 2.2 Layout

**REQ-004:** The page body is a vertical stack of:

1. A summary strip (optional in v1 — covered in §9) that shows totals for the active filter set.
2. A control row with the filters listed in §3.
3. An accordion list of parent categories, one row per parent.

**REQ-005:** Each parent row displays, across columns:

- Parent category name (with section indicator for Spending / Income / Savings — icon, color, or label).
- **Actual** (sum of non-removed, non-transfer transactions on the parent's entire subtree for the month).
- **Budgeted** — the parent rollup value. When "Use Rollover" is off, this is `max(parent_budget, Σ children_budget)`. When on, both sides use effective values per Rollover Budgets BRD REQ-022.
- **Variance** — signed difference `actual − budgeted`, colored per category type (§4).
- Row action icons: **Edit**, **Dismiss**.

**REQ-006:** Expanding a parent row reveals its children as indented sub-rows with the same column layout. Children show their own `actual`, `budgeted` (effective if rollover is on), and `variance`. The parent's displayed totals do not change on expand.

**REQ-007:** Parent accordion expand/collapse state is **ephemeral session state**. It is not URL-persisted and does not persist across page reloads. Default state is all parents collapsed.

**REQ-008:** Rows of type Spending, Income, and Savings are grouped into three visually distinct sections in the order **Income → Spending → Savings**, with section headers. (This matches the Cash Flow three-line convention established by the Savings Category BRD.)

### 2.3 Column Semantics

**REQ-009:** The Actual column is always raw: it does not change based on the rollover toggle. Actuals are computed via the canonical `transactionReader.ts` filter (excludes removed transactions) and respect transfer exclusion via `transactionCalculations.ts`.

**REQ-010:** The Budgeted column respects the rollover toggle. With rollover off, it shows `max(parent, Σ children)` using raw budgets. With rollover on, it shows the same rollup using effective budgets per Rollover Budgets BRD §3.5.

**REQ-011:** The Variance column is always `actual − budgeted`, where `budgeted` reflects the current rollover toggle state. The numeric sign convention is fixed across types; the color carries the "goodness" meaning (§4).

---

## 3. Filters & Toggles

### 3.1 Use Rollover Toggle

**REQ-012:** A "Use Rollover" toggle sits in the control row. Default: **off**. When on, budgeted and variance columns reflect effective budgets per the Rollover Budgets BRD.

**REQ-013:** The toggle is URL-persisted (`rollover=1` when on; param omitted when off). This makes filtered views bookmarkable and keeps chatbot context-awareness working (per the 2026-04 URL-based page-state ADR).

**REQ-014:** When the toggle is on and the displayed month is January, rollover balance is zero for every category (per Rollover Budgets BRD REQ-005) and the displayed budgeted values match the raw budgets. This is correct behavior, not a bug, but worth noting in a brief tooltip or subtext on the toggle when January is the active month: *"January is the start of the rollover year — no carry applies yet."*

### 3.2 Category Type Filter

**REQ-015:** A multi-select chip group offers **Spending**, **Income**, and **Savings** as three independent toggles. All three are on by default. Users may turn off any combination.

**REQ-016:** Chip state is URL-persisted as `types=spending,income,savings` (or any subset). When all three are selected, the param may be omitted for cleaner URLs.

**REQ-017:** If all three are deselected, the accordion renders an empty state: *"No category types selected. Toggle Spending, Income, or Savings above to see your budget."* This is not an error.

### 3.3 Variance Filter

**REQ-018:** A single-select control offers:

- **All** (default)
- **Under budget** (favorable variance — rows where the actual is on the "good" side of the budget per §4)
- **Over budget** (unfavorable variance — rows on the "bad" side)
- **Seriously over budget** (unfavorable variance exceeding the threshold in REQ-019)

**REQ-019:** The "seriously over budget" threshold is **200% variance from budget**, locked in v1 (no user configuration). Concretely:

- **Spending:** `actual > 3 × budgeted` (spent more than 3x the budget).
- **Income:** `actual < budgeted / 3` (earned less than 1/3 of the target).
- **Savings:** `actual < budgeted / 3` (saved less than 1/3 of the target).

Where `budgeted` reflects the current rollover toggle state. Categories with `budgeted === 0` are excluded from the seriously-over calculation (division undefined).

**REQ-020:** The variance filter is URL-persisted as `variance=under|over|serious`. Omitted when set to "All".

**REQ-021:** Variance filtering applies at the **child row level** during evaluation, but the display unit is the parent accordion. If any child of a parent matches the filter, the parent row is shown and its accordion is auto-expanded to reveal the matching children. Non-matching siblings remain visible within the expanded parent (so the user has context), but are visually de-emphasized (e.g., lower opacity).

**REQ-022:** A parent with its own budget and actual (no children, or children that don't match) is evaluated at the parent level against the same filter.

### 3.4 Dismiss / Show Dismissed

**REQ-023:** Each parent row has a **Dismiss** action icon. Clicking it immediately removes the row from view without a page refresh. The action is reversible (see REQ-025).

**REQ-024:** The control row includes a **Show dismissed** toggle (default: off). When on, dismissed parent rows are visible again, visually marked as dismissed (muted color, strikethrough on the name, or similar), and their row action changes from **Dismiss** to **Restore**.

**REQ-025:** Clicking **Restore** on a currently-dismissed row immediately returns it to normal display and removes it from the dismissed set.

**REQ-026:** The dismiss action operates only on **parent categories**. Children cannot be individually dismissed in v1; dismissing a parent hides its entire subtree.

**REQ-027:** Dismissed state is stored per-user in `localStorage` under the key `bva2.dismissedParentCategoryIds` as a JSON array of category IDs. It is **not** URL-persisted and **not** server-synced.

**REQ-028:** Dismissed state is **distinct from the family-wide `Category.isHidden` flag**. Dismissing a category in BvA II:

- Does **not** set `Category.isHidden=true`.
- Does **not** affect any other page.
- Does **not** affect the other household member's view of BvA II.
- Does **not** remove the category from budget math — it is purely a display filter on this page for this user.

**REQ-029:** The "Show dismissed" toggle does not reveal `Category.isHidden=true` categories. Family-wide hidden categories remain excluded from BvA II entirely unless the user changes `isHidden` in the Categories page. This keeps the two concepts cleanly separated.

---

## 4. Type-Aware Display Semantics

### 4.1 Variance Sign Convention

**REQ-030:** The numeric variance shown in the column is always `actual − budgeted`, independent of category type. This is consistent across Spending, Income, and Savings.

### 4.2 Color Convention

**REQ-031:** Color carries the "goodness" meaning:

| Type | `actual > budgeted` | `actual < budgeted` | `actual ≈ budgeted` |
|---|---|---|---|
| Spending | 🔴 red (unfavorable) | 🟢 green (favorable) | neutral |
| Income | 🟢 green (favorable) | 🔴 red (unfavorable) | neutral |
| Savings | 🟢 green (favorable) | 🔴 red (unfavorable) | neutral |

Specific Mantine color tokens are an implementation detail, but the conventions used elsewhere in the app (green=favorable, red=unfavorable) must be preserved.

**REQ-032:** The displayed number never has its sign flipped per type. A future dev reading two tables with `+$100` variance must be able to trust that both mean `actual` is $100 higher than `budgeted`.

### 4.3 Filter Interpretation Across Types

**REQ-033:** The "Under budget" / "Over budget" / "Seriously over budget" filter applies the **goodness** interpretation, not the raw sign:

- Spending: "Over budget" = `actual > budgeted`; "Under budget" = `actual < budgeted`.
- Income: "Over budget" = `actual < budgeted`; "Under budget" = `actual > budgeted`.
- Savings: "Over budget" = `actual < budgeted`; "Under budget" = `actual > budgeted`.

In plain English: "Over budget" always means *the bad direction for the category's type*.

### 4.4 Parent Row Type

**REQ-034:** For parent rows, the category-type convention used for coloring and filtering is the parent's type. If a top-level category is Income, all rows in its subtree are treated as Income for this purpose. (The existing `isIncome` / `isSavings` hierarchy rules already ensure a subtree is type-consistent.)

---

## 5. Row-Level Edit

### 5.1 Edit Button

**REQ-035:** Each row (parent or child) has an **Edit** action icon that opens the Budget Edit Modal described below.

### 5.2 Modal Structure

**REQ-036:** The modal shows:

- Category name and (if child) parent name for context.
- Category type indicator (Spending / Income / Savings).
- A month selector, pre-filled with the current page month but editable. Changing it updates the "primary action" button label (§5.3).
- Current budget amount for the selected month (editable number input). If no budget record exists for that month, the input starts blank with placeholder `$0.00`.
- If the category is `isRollover=true` and the Use Rollover toggle is on: a read-only display of the effective budget, with a note: *"Changing this budget will recompute rollover balance for all prior months of the current calendar year."*
- Two primary action buttons per §5.3.
- Cancel button.

### 5.3 Primary Actions

**REQ-037:** The modal exposes two save actions:

1. **"Update [MonthName] Budget"** — writes the new value to the selected month's `MonthlyBudget` for this category. Label updates live as the user changes the month selector (e.g., "Update April Budget", "Update May Budget").

2. **"Update all future [Year] budgets"** — writes the new value to every month of the same calendar year *strictly later* than the selected month. For April selected, this is May through December. For December selected, this button is disabled with tooltip "No future months remaining in [Year]". Year in the label is the calendar year of the selected month.

**REQ-038:** Either action opens a confirmation modal (§5.4) before persisting. There is no silent save.

**REQ-039:** The two actions are mutually exclusive per click — the user picks one path and confirms. There is no "update this month AND all future months" compound action in v1. If a user wants to update April through December with the same value, they use "Update all future 2026 budgets" from March, then separately update April — or they update April, then re-open and use "Update all future" from April. Explicit over clever.

### 5.4 Confirmation Modal

**REQ-040:** Before persisting any change, a confirmation modal displays:

- A summary line: *"You are about to update [N] budget(s) for [Category Name]."*
- A per-month table of before/after values for each month that will be written. Example:

  ```
  May  2026   $100   →   $150
  June 2026   $100   →   $150
  July 2026   $120   →   $150   ← existing value will be overwritten
  Aug  2026   (unset) →  $150
  ...
  Dec  2026   $100   →   $150
  ```

- Rows where an existing non-default value will be overwritten must be visually flagged (as shown above).
- A **Confirm** button and a **Cancel** button.

**REQ-041:** "Update all future" **always overwrites**. It does not skip months that already have a value. The confirmation modal's explicit before/after display is the safety mechanism. This choice is intentional: "Update all future months" to a new value, but silently skipping months that already differ, is the opposite of what the label says.

**REQ-042:** For rollover-flagged categories, the confirmation modal must include an extra callout: *"This category uses rollover. Changing budgets will recompute rollover balance for all affected months."*

### 5.5 Parent vs. Child Edits

**REQ-043:** Editing a parent row updates the parent's own `MonthlyBudget` record. It does **not** cascade to children. The existing `max(parent, Σ children)` rollup determines what the parent row displays after save.

**REQ-044:** Editing a child row updates that child's `MonthlyBudget` record. The parent row's displayed total recomputes per the existing rollup rule.

**REQ-045:** If the user tries to edit a category where `isBudgetableCategory(id) === false` (transfers), the Edit action icon is not shown. This should not happen in practice because non-budgetable categories should not appear in BvA II rows at all.

---

## 6. URL State

### 6.1 Persisted to URL

**REQ-046:** The following state is persisted to URL params, matching the existing `useSearchParams`-based pattern on the Budgets page:

| Param | Values | Default (omitted) |
|---|---|---|
| `view` | `bva-ii` | existing tab default |
| `month` | `YYYY-MM` | current month |
| `rollover` | `1` | off |
| `types` | comma-joined subset of `spending,income,savings` | all three selected |
| `variance` | `under`, `over`, `serious` | `all` |

**REQ-047:** URL state is the source of truth when present. Defaults apply when a param is omitted. Invalid values fall back to the default silently.

### 6.2 Not Persisted to URL

**REQ-048:** The following state is ephemeral or in localStorage, **not** URL-persisted:

- Parent accordion expand/collapse state (session-only).
- "Show dismissed" toggle state (session-only).
- The dismissed set itself (localStorage per REQ-027).

**REQ-049:** Accordion and show-dismissed state reset to defaults on page reload. This is intentional: they are not meaningfully shareable.

---

## 7. Accessibility & Responsiveness

**REQ-050:** All interactive elements (chips, toggles, edit buttons, dismiss/restore actions) must be keyboard-accessible with visible focus states. Accordion expand/collapse must be operable via Enter/Space on the parent row.

**REQ-051:** Color-coded variance must not be the sole signal of favorable/unfavorable. Pair color with a text indicator (e.g., "+", "−", or a small icon) for screen-reader users and for colorblind users.

**REQ-052:** The page must remain usable at tablet widths (≥768px). Mobile-optimized layout is not required in v1 (household primarily uses laptop). If columns must compress on smaller screens, the Variance column has priority; the Budgeted column is next; the Actual column may stack under the category name on very narrow views.

---

## 8. Performance

**REQ-053:** Data for the page comes from existing endpoints: `monthlyBudgets` for the selected month and all prior months of the calendar year (for rollover math), plus transactions for the same range. A single aggregated endpoint should be added or adapted if multiple round-trips would be needed; batched loading is preferred over per-category calls.

**REQ-054:** All computation (aggregation, rollover balance derivation, filter evaluation) happens server-side or in the shared utility, not ad-hoc in the component. Consumers call `buildCategoryTreeAggregation` and the new rollover utility from `shared/utils/budgetCalculations.ts`.

---

## 9. Nice-to-Haves (explicitly deferred unless simple)

The following are desirable but not required in v1:

- **Summary strip** at the top showing filter-aware totals (total actual, total budgeted, total variance) for the currently-visible row set. Probably cheap to include; flag it for v1 scope review.
- **Keyboard shortcut** to expand/collapse all accordions.
- **Compare to prior month** column (variance vs. last month's variance) — useful but adds visual density.
- **Export current view to CSV** — useful but aligns better with the pending Data Export feature in CLAUDE.md.

---

## 10. Assumptions

- The existing `/budgets` page tab infrastructure (Mantine Tabs + URL param `view`) can accommodate a third tab without structural changes.
- The existing `buildCategoryTreeAggregation` utility can be extended or wrapped to produce effective values when rollover is on, without forking the rollup logic.
- Users will understand that the numeric variance (`actual − budgeted`) means the same thing across types, with color indicating whether that number is good or bad in context.
- Users are comfortable with the "Update all future" action overwriting existing budgets, given the explicit before/after confirmation.

---

## 11. Out of Scope

- Any rollover behavior change on surfaces other than BvA II (see Rollover Budgets BRD §4).
- Changes to the existing `BudgetComparison.tsx` tab.
- Changes to `YearlyBudgetGrid.tsx`.
- User-configurable "seriously over budget" threshold. Locked at 200% in v1.
- Cross-device / server-synced dismiss state. localStorage-only.
- Dismissing individual children. Parent-level only.
- Editing multiple categories at once (bulk edit).
- Compound edit action ("this month AND all future").
- Mobile-optimized layout.
- CSV export.
- Deprecating or removing the existing BvA tab. Decision deferred to post-v1 usage review.

---

## 12. Open Questions

All open questions resolved during the design conversation on 2026-04-21.

| # | Question | Resolution |
|---|----------|------------|
| OQ-001 | Should this replace the existing BvA tab, or live alongside it? | **Alongside** — additive, existing tab untouched |
| OQ-002 | How are spending/income/savings filters shaped? | **Three independent chips, multi-select, URL-persisted** |
| OQ-003 | Does "Update all future" include the currently-filtered month? | **No** — strictly later only |
| OQ-004 | Does "Update all future" overwrite or skip months with existing values? | **Overwrite**, with full before/after visible in confirmation modal |
| OQ-005 | Is the hide/unhide feature per-user or family-wide? | **Per-user, localStorage** |
| OQ-006 | Should the hide concept reuse the name "hide"? | **No** — renamed to **Dismiss** to avoid collision with `Category.isHidden` |
| OQ-007 | What state persists to URL vs. ephemeral? | Month, tab, rollover, types, variance → URL. Accordion, show-dismissed, dismissed set → not URL |
| OQ-008 | Is the "seriously over budget" threshold configurable? | **No** — locked at 200% variance |
| OQ-009 | Does variance filtering match at parent or child level? | Matches at child level; parent auto-expands to show matches; non-matching siblings de-emphasized |

---

## 13. Success Criteria

- A user on `/budgets?view=bva-ii&month=2026-04` sees a parent-level accordion of their categories with Actual, Budgeted, and Variance columns.
- Toggling Use Rollover updates the Budgeted and Variance columns to reflect effective budgets, with no impact on the Actual column.
- Filtering by variance health correctly expands parents whose children match, and correctly interprets "over/under" per category type.
- Dismissing a parent removes it from view immediately; "Show dismissed" toggles the dismissed set back into view with a Restore action.
- Opening the Edit modal on any row allows single-month or future-months updates with explicit before/after confirmation.
- The existing Budget vs. Actual tab's behavior is unchanged.
- Dismissal is never confused with `Category.isHidden` in code review or future documentation.
