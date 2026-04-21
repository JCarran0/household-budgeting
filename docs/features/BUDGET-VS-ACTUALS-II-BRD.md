# Budget vs. Actuals II — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-21
**Version:** 1.0
**Depends on:** `docs/features/ROLLOVER-BUDGETS-BRD.md`

---

> **Revision 2 — 2026-04-21:** Column layout and sign convention updated after initial UAT. What was a single `Variance` column (raw `actual − budgeted`) is now split into separate `Rollover` and `Available` columns, with `Available` tone-signed (positive = favorable, across every section). The Budgeted column returns to raw monthly values. The old variance convention is retired from BvA II only — the original BvA tab keeps it. See OQ-010..OQ-012 for rationale.

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
- **Budgeted** — the parent rollup value `max(parent_budget, Σ children_budget)` using the **raw monthly budget only**. The rollover carry is split out into its own column, not folded into Budgeted. This value is identical whether "Use Rollover" is on or off.
- **Rollover** — tone-signed carry from prior months of the calendar year. Positive = favorable historical surplus (underspent spending, over-earned income, over-saved savings). Negative = unfavorable historical shortfall. See §4 for sign/color semantics. Always displayed; its styling and its participation in the Available column vary with the toggle — see REQ-010 and §4.
- **Available** — tone-signed surplus or shortfall vs. plan for this row. Positive = favorable (a surplus of unspent room, excess earnings, or contributions beyond target); negative = unfavorable (overspent, short of income, short of savings target). Formula in REQ-011.
- Row action icons: **Edit**, **Dismiss**.

**REQ-006:** Expanding a parent row reveals its children as indented sub-rows with the same column layout. Children show their own `actual`, `budgeted`, `rollover`, and `available`. The parent's displayed totals do not change on expand.

**REQ-007:** Parent accordion expand/collapse state is **ephemeral session state**. It is not URL-persisted and does not persist across page reloads. Default state is all parents collapsed.

**REQ-008:** Rows of type Spending, Income, and Savings are grouped into three visually distinct sections in the order **Income → Spending → Savings**, with section headers. (This matches the Cash Flow three-line convention established by the Savings Category BRD.)

### 2.3 Column Semantics

**REQ-009:** The Actual column is always raw: it does not change based on the rollover toggle. Actuals are computed via the canonical `transactionReader.ts` filter (excludes removed transactions) and respect transfer exclusion via `transactionCalculations.ts`.

**REQ-010:** The Budgeted column is always the raw monthly budget (parent rollup `max(parent, Σ children)` using per-month `MonthlyBudget` records). It does **not** change with the rollover toggle; the rollover carry is surfaced separately in the Rollover column. Splitting these two numbers makes each independently legible — users can audit the raw plan and the carry without decomposing a single "effective" figure.

**REQ-010a:** The Rollover column is **always shown regardless of the toggle**:

- **Rollover-flagged category, toggle on:** display the tone-signed rollover value (§4), colored by favorability.
- **Rollover-flagged category, toggle off:** display the same tone-signed value but rendered in dimmed/disabled styling — a visual hint that the number exists but isn't being applied to Available. This preserves transparency into the latent carry the user would gain by turning the toggle on.
- **Non-rollover category (any subtree where `isRollover` is unset):** display an em-dash (`—`) in dimmed text to signal "not applicable — category opts out of rollover."
- **Parent row rollover (when any node in its subtree is rollover-flagged):** sum the tone-signed rollover values across the subtree. Per Rollover Budgets BRD REQ-017, subtree exclusivity guarantees at most one flagged node per ancestor chain, so the sum collapses to that node's value — but stating it as a sum makes the math robust if the invariant ever relaxes.

**REQ-011:** The Available column is a **tone-signed** surplus-or-shortfall measure. Positive is always favorable across every section; negative is always unfavorable. The underlying arithmetic flips per section to produce this unified sign, but the invariant the reader sees is consistent: `+$X green = $X ahead of plan`, `−$X red = $X behind plan`.

Formulas:

- **Spending:** `Available = (Budgeted − Actual) + (Rollover if toggle on else 0)`.
- **Income / Savings:** `Available = (Actual − Budgeted) + (Rollover if toggle on else 0)`.

Equivalent unified definition: `Available = toneSignedDelta(section, actual, budgeted) + (toggle ? toneSignedRollover : 0)`, where `toneSignedDelta` returns `budget − actual` for spending and `actual − budget` otherwise, and `toneSignedRollover` flips sign analogously.

**REQ-011a:** When Use Rollover is off, Available is **strictly the current-month surplus/shortfall** — it does not incorporate the Rollover column (even though the Rollover column remains visible, dimmed, per REQ-010a). This is the "what's happening this month in isolation" view; the toggle is how users opt the carry into their working number.

---

## 3. Filters & Toggles

### 3.1 Use Rollover Toggle

**REQ-012:** A "Use Rollover" toggle sits in the control row. Default: **off**. The toggle does NOT change the Budgeted or Rollover column values — those always render (with Rollover dimmed when the toggle is off, per REQ-010a). The toggle changes only whether the Rollover column participates in the Available computation (REQ-011/011a). This keeps the Rollover column informational regardless of toggle state, while the toggle becomes a clean "am I counting the carry in my working number" switch.

**REQ-013:** The toggle is URL-persisted (`rollover=1` when on; param omitted when off). This makes filtered views bookmarkable and keeps chatbot context-awareness working (per the 2026-04 URL-based page-state ADR).

**REQ-014:** When the toggle is on and the displayed month is January, rollover balance is zero for every category (per Rollover Budgets BRD REQ-005) and Available therefore equals the current-month delta — same as the toggle-off case, for this one month. Worth noting in a brief tooltip or subtext on the toggle when January is the active month: *"January is the start of the rollover year — no carry applies yet."*

### 3.2 Category Type Filter

**REQ-015:** A multi-select chip group offers **Spending**, **Income**, and **Savings** as three independent toggles. All three are on by default. Users may turn off any combination.

**REQ-016:** Chip state is URL-persisted as `types=spending,income,savings` (or any subset). When all three are selected, the param may be omitted for cleaner URLs.

**REQ-017:** If all three are deselected, the accordion renders an empty state: *"No category types selected. Toggle Spending, Income, or Savings above to see your budget."* This is not an error.

### 3.3 Variance Filter

**REQ-018:** A single-select control offers (labels retained from the variance-era for continuity):

- **All** (default)
- **Under budget** — rows with `Available > 0` (favorable surplus)
- **Over budget** — rows with `Available < 0` (unfavorable shortfall)
- **Seriously over budget** — rows with `Available` deeply negative per REQ-019

Filter evaluation uses the **current** Available value — i.e., it respects the Use Rollover toggle. With the toggle off, a spending row with a $500 rollover but $20 current-month overspend matches "Over budget" (because toggle-off Available = −$20). With the toggle on, the same row has Available = +$480 and matches "Under budget." This makes "what the filter sees" match "what the column shows" — the only filter the user can trust is the one operating on the numbers they're looking at.

**REQ-019:** The "seriously over budget" threshold preserves the historic 200% semantics, re-expressed in Available terms:

- **Spending:** `Available < −2 × Budgeted` (equivalent to `actual > 3 × budgeted`).
- **Income:** `Available < −(2/3) × Budgeted` (equivalent to `actual < budgeted / 3`).
- **Savings:** same as Income.

Categories with `Budgeted === 0` are excluded from the seriously-over calculation (division undefined). Thresholds remain asymmetric across types for the same reason the current variance-era thresholds were — "3× spending" and "1/3 income" are the natural magnitude asymmetries.

**REQ-020:** The variance filter is URL-persisted as `variance=under|over|serious`. Omitted when set to "All".

**REQ-021:** Variance filtering applies at the **child row level** during evaluation, but the display unit is the parent accordion. If any child of a parent matches the filter, the parent row is shown. Non-matching siblings of a matched child remain visible within the expanded parent (so the user has context), but are visually de-emphasized (e.g., lower opacity). Filters do **not** auto-expand parents in v1 — parents always default to collapsed; users click to see the children their filter matched.

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

### 4.1 Sign Convention — Tone-Signed Available

**REQ-030:** The numeric values in the **Available** and **Rollover** columns are **tone-signed**: positive means favorable (surplus vs. plan), negative means unfavorable (shortfall vs. plan). The invariant across every row, regardless of section:

```
+$X  →  $X ahead of plan  (green)
−$X  →  $X behind plan    (red)
 0   →  on plan exactly   (neutral)
```

**REQ-031:** The underlying arithmetic flips per section to produce this unified sign:

- **Spending:** favorable direction is underspend. `Available = Budgeted − Actual (+ Rollover if toggle on)`. Rollover is `Σ (Budgeted_i − Actual_i)` across prior months, same sign convention.
- **Income:** favorable direction is over-earn. `Available = Actual − Budgeted (+ Rollover if toggle on)`. Rollover is `Σ (Actual_i − Budgeted_i)` across prior months.
- **Savings:** favorable direction is over-save. Same formulas as Income.

The reader never sees this arithmetic; they see positive/negative signed against favorability. Numeric consistency of meaning ("green positive = surplus") is preserved across every section. For **parent rows**, the section comes from the parent's own `isIncome` / `isSavings` flags; the subtree is type-consistent per the category hierarchy rules so every child shares its parent's section.

**REQ-032:** Because sign is tone-signed (not raw `actual − budgeted`), `+$100` in a Spending row and `+$100` in an Income row both mean *"$100 ahead of plan for this line."* This is the intended invariant. The prior convention (raw `actual − budgeted`) is retired with this BRD revision. Any surface outside BvA II that still shows the raw convention (`Variance` columns in the existing BvA tab, for example) stays on its own convention — the two pages intentionally speak different dialects and that is not a bug.

### 4.2 Color Convention

**REQ-033:** Color mirrors sign:

| Row's Available | Tone | Color |
|---|---|---|
| `> 0` | favorable | 🟢 green |
| `< 0` | unfavorable | 🔴 red |
| `= 0` | neutral | default |

The Rollover column follows the same sign→color mapping (tone-signed). When the Use Rollover toggle is **off**, the Rollover cell's color is suppressed — rendered in dimmed/disabled styling — to signal "visible for reference, not participating in Available." For non-rollover categories, the cell is `—` in dimmed text.

### 4.3 Filter Interpretation

**REQ-034:** The "Under budget" / "Over budget" / "Seriously over budget" filter evaluates against the **Available** value as currently displayed (respecting the Use Rollover toggle):

- **Under budget** = `Available > 0` (surplus)
- **Over budget** = `Available < 0` (shortfall)
- **Seriously over budget** = `Available` deeply negative per REQ-019

The per-section goodness mapping happens implicitly inside the Available calculation. The filter's user-facing semantics are unified: "Over budget" universally means "this row is behind plan."


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
- If the category is `isRollover=true` and the Use Rollover toggle is on: a read-only display of the effective budget, with a note: *"FYI: This change will trigger a recalculation of rollover amounts."*
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

**REQ-042:** For rollover-flagged categories, the confirmation modal must include an extra callout: *"FYI: This change will trigger a recalculation of rollover amounts."*

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

**REQ-051:** Color-coded Available / Rollover must not be the sole signal of favorable/unfavorable. Pair color with a text indicator (sign prefix "+" / "−" and a directional icon on Available) for screen-reader users and for colorblind users.

**REQ-052:** The page must remain usable at tablet widths (≥768px). Mobile-optimized layout is not required in v1 (household primarily uses laptop). If columns must compress on smaller screens, the **Available** column has priority; **Budgeted** is next; **Rollover** may collapse into the Available cell as a tooltip or supplementary line; **Actual** may stack under the category name on very narrow views.

---

## 8. Performance

**REQ-053:** Data for the page comes from existing endpoints: `monthlyBudgets` for the selected month and all prior months of the calendar year (for rollover math), plus transactions for the same range. A single aggregated endpoint should be added or adapted if multiple round-trips would be needed; batched loading is preferred over per-category calls.

**REQ-054:** All computation (aggregation, rollover balance derivation, filter evaluation) happens server-side or in the shared utility, not ad-hoc in the component. Consumers call `buildCategoryTreeAggregation` and the new rollover utility from `shared/utils/budgetCalculations.ts`.

---

## 9. Nice-to-Haves (explicitly deferred unless simple)

The following are desirable but not required in v1:

- **Summary strip** at the top showing filter-aware totals for the currently-visible row set. Shipped in v1 with cashflow-convention math (post-Rev-2): `Net Actual` and `Net Budgeted` use Income − Spending − Savings (matching the dashboard Cashflow card), while `Total Rollover` and `Total Available` sum their already-tone-signed per-row values directly. Each cell exposes a hover tooltip with the formula and an example question it answers.
- **Keyboard shortcut** to expand/collapse all accordions.
- **Compare to prior month** column (variance vs. last month's variance) — useful but adds visual density.
- **Export current view to CSV** — useful but aligns better with the pending Data Export feature in CLAUDE.md.

---

## 10. Assumptions

- The existing `/budgets` page tab infrastructure (Mantine Tabs + URL param `view`) can accommodate another tab without structural changes.
- `buildCategoryTreeAggregation` handles the Budgeted column's max rule directly; Rollover is computed separately per-node and summed for parent rows.
- Users adapt to the tone-signed Available framing ("green positive = ahead of plan") quickly. The previous raw-variance convention lives on in the existing BvA tab for users who prefer it.
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
| OQ-009 | Does variance filtering match at parent or child level? | Matches at child level; non-matching siblings de-emphasized. Parents default to collapsed — no auto-expand (Phase 4 post-UAT revision). |
| OQ-010 | How is the rollover carry surfaced to the user? | **Dedicated Rollover column**, always shown. Tone-signed (positive = favorable). Dimmed when toggle off; em-dash for non-rollover categories. |
| OQ-011 | What's the sign convention on the Available column? | **Tone-signed**: positive = favorable ("ahead of plan"), negative = unfavorable ("behind plan") across every section. Replaces the retired `actual − budgeted` variance convention (which lives on in the existing BvA tab). |
| OQ-012 | Does the Use Rollover toggle change the Budgeted column? | **No.** Budgeted is always the raw monthly budget (max rule over the subtree). The toggle only affects whether the Rollover column participates in Available — and the Rollover cell's styling (full color vs. dimmed). |

---

## 13. Success Criteria

- A user on `/budgets?view=bva-ii&month=2026-04` sees a parent-level accordion with five columns: Actual, Budgeted, Rollover, Available, Actions.
- Available is always tone-signed — green positive across every section means "ahead of plan," red negative means "behind plan." A future reader can scan a spending row and an income row and trust that `+$100` means the same thing in both contexts.
- Toggling Use Rollover changes only the Available column's value and the Rollover column's color (full vs. dimmed). Budgeted and Actual never change.
- The Rollover column is always visible: tone-signed colored for rollover categories when the toggle is on, dimmed for rollover categories when the toggle is off, em-dash for non-rollover categories.
- Variance filters ("Under / Over / Seriously over budget") evaluate against the current Available value and unify semantics across sections.
- Dismissing a parent removes it from view immediately; "Show dismissed" toggles the dismissed set back with a Restore action.
- The Edit modal offers single-month or future-months updates with explicit before/after confirmation.
- The existing Budget vs. Actual tab's behavior is unchanged — it keeps the raw `actual − budgeted` variance convention.
- Dismissal is never confused with `Category.isHidden` in code review or future documentation.
