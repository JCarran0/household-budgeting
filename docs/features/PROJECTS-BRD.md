# Project Tracking & Budget Management — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-09 (revised 2026-09-12)
**Version:** 2.0

---

## 1. Overview

### 1.1 Problem Statement

Users take on large, time-bounded projects (primarily home renovations) and want to understand how much they spend per project, how that compares to a planned budget, and how spending breaks down by category. Currently, the app has no way to group transactions by project or view project-specific spending reports. Users must mentally track project costs or use external tools.

### 1.2 Solution Summary

Introduce **Projects** as a first-class entity backed by the existing tag system. Users create projects via a dedicated flow, which generates a structured tag (`project:<name>:<year>`) applied to transactions. A new **Projects** section provides project management, per-project budget planning, and a spending report with category drill-down.

### 1.3 Users

Both household users. Any user can create, edit, and delete projects. Both users' transactions are combined into a single project view.

### 1.4 Relationship to Trips

Projects follow the same architectural pattern as Trips (tag-based grouping, independent budgets, accordion card UI). The key difference is the use case: Trips are for travel, Projects are for home renovations and other large endeavors.

A transaction **may** be tagged to both a Trip and a Project. Like monthly budgets, trip budgets and project budgets are independent parallel lenses on the same transactions — the same expense can legitimately appear in multiple contexts.

---

## 2. Tag Convention

### 2.1 Format

```
project:<project-name>:<year>
```

- **project** — Fixed prefix identifying this as a project tag.
- **project-name** — Lowercase, hyphenated identifier (e.g., `kitchen-reno`, `deck-build`). Generated from the user-provided project name.
- **year** — Required four-digit year extracted from the project start date.

### 2.2 Examples

| Project Name          | Generated Tag                    |
|-----------------------|----------------------------------|
| Kitchen Renovation    | `project:kitchen-renovation:2026`|
| Deck Build            | `project:deck-build:2026`        |
| Bathroom Remodel      | `project:bathroom-remodel:2025`  |
| Fence Replacement     | `project:fence-replacement:2026` |

### 2.3 Tag Behavior

- Project tags use the existing `tags: string[]` field on transactions.
- A transaction may carry multiple project tags (e.g., a shared material purchase across projects).
- Project tags coexist with trip tags and any other tags on a transaction.
- Existing bulk edit functionality is sufficient for retroactively tagging past transactions.
- Transactions may additionally carry arbitrary **line item tags** (§5.5.4), which are ordinary user tags with no structural prefix.

---

## 3. Project Entity

### 3.1 Project Creation

The system must provide a dedicated "Create Project" flow (not manual tag entry) that collects:

| Field              | Required | Description                                              |
|--------------------|----------|----------------------------------------------------------|
| Project Name       | Yes      | Display name (e.g., "Kitchen Renovation 2026")           |
| Start Date         | Yes      | Project start date                                       |
| End Date           | Yes      | Project end date (estimated completion)                  |
| Total Budget       | No       | Overall spending target for the project                  |
| Category Budgets   | No       | Per-category spending targets (see Section 5)            |
| Line Items         | No       | Itemized cost estimates, each with a match tag (§5.5)    |
| Notes              | No       | Free-text notes about the project                        |

- The system generates the structured tag automatically from the project name and year.
- Notes may be added or edited at any time — there is no restriction based on project status.

### 3.2 Project Status

Status is derived from the project's start and end dates relative to today:

| Status      | Condition                        |
|-------------|----------------------------------|
| Planning    | Start date is in the future      |
| Active      | Today is between start and end   |
| Completed   | End date is in the past          |

Status is display-only and does not restrict any functionality. Users can tag transactions, edit budgets, and modify project details regardless of status.

### 3.3 Project Editing

Users may edit all project fields at any time. If the project name changes in a way that would alter the generated tag, the system must update the tag on all associated **transactions and tasks**.

### 3.4 Project Deletion

- The system must show a confirmation modal before deleting a project.
- Upon confirmation, the system removes the project entity and strips the project's tag from all associated **transactions and tasks**.
- Neither transactions nor tasks are deleted — only the tag is removed.

---

## 4. Projects Section

### 4.1 Navigation

Projects must be accessible as its own section in the sidebar navigation, alongside Transactions, Budgets, Reports, and Trips.

### 4.2 Default View — Project Card Grid

When a user opens the Projects section, they see a card grid of all projects sorted by most recent start date. Each card displays:

- Project name
- Dates (start – end)
- Status badge (Planning, Active, Completed)
- Total spend
- Total budget (if set)
- Spent vs. budget indicator (e.g., fraction or simple bar)

This view enables at-a-glance cross-project comparison without requiring users to select specific projects to compare.

### 4.3 Filters

The card grid must support filtering by:

| Filter  | Behavior                                             |
|---------|------------------------------------------------------|
| Year    | Show only projects from a selected year              |
| Project | Search/select a specific project by name             |

### 4.4 Project Detail — Accordion Expansion

Clicking a project card expands an accordion showing:

1. **Project summary** — Name, dates, status, notes, total spend, total budget, variance (spent vs. budgeted).
2. **Category breakdown** — Each category that appears on project-tagged transactions, showing:
   - Category name
   - Amount spent
   - Category budget (if set)
   - Variance (spent vs. category budget, if set)
3. **Category drill-down** — Clicking a category opens the existing `TransactionPreviewModal` showing transactions for that category within the project (filtered by project tag + category).
4. **"View All" navigation** — From the preview modal, "View All" navigates to the Transactions page with the project tag filter and category filter pre-applied via URL params.
5. **Line items** — The project's itemized estimates with their matched actuals and variance, plus the *Unattributed* total (§5.5.6). Presented as a sibling of the category breakdown, not nested within it.

### 4.5 Project Tasks

The project detail view includes a **Tasks tab** alongside the category breakdown. The tab lists all tasks whose `tags` array contains the project's tag and exposes task-creation and completion affordances specific to the project's context.

#### 4.5.1 Link Mechanism

Tasks are associated with a project via the project's tag stored in `Task.tags[]`, mirroring the transaction model. A task may be associated with at most one project (enforced by the UI — the schema allows multiple tags but the "Link to project" picker writes at most one `project:*:*` tag per task).

When a project is renamed such that its tag changes, the system must update the tag on all associated tasks (same behavior as transactions). When a project is deleted, the system strips the project tag from all associated tasks; tasks themselves are not deleted.

#### 4.5.2 Tab Header — Completion Summary

The Tasks tab header displays a completion summary of the form `{completed} of {total} complete` (e.g., "3 of 8 complete"). `completed` counts tasks in `done` status; `total` counts all tasks carrying the project's tag regardless of status.

#### 4.5.3 Task List

Each task in the list shows title, assignee, due date, and status. Clicking a task opens the standard task detail UI (same as the Tasks page). The list respects the archiving rules from TASK-MANAGEMENT-BRD §3.4 — tasks that have been `done` or `cancelled` for more than 14 days do not appear in the project's Tasks tab (they remain accessible via Task History).

#### 4.5.4 Creating a Task from a Project

The tab provides a "+ Add Task" button. Tasks created from this view automatically carry the project's tag in their `tags` array. All other task fields follow the standard task creation flow defined in TASK-MANAGEMENT-BRD §4.

#### 4.5.5 Inverse Navigation — Project Chip on Tasks

When a task carries a project tag, the task card (on the Kanban board and in Task History) and the task detail view display a small chip labeled with the project's display name. Clicking the chip navigates to the project's detail view with the relevant project expanded.

---

## 5. Project Budgets

### 5.1 Relationship to Monthly Budgets

Project budgets are **independent** from monthly budgets. They are a parallel lens on the same transactions:

- A transaction tagged for a project and categorized as "Home Improvement > Furniture" counts toward **both** the monthly budget for that category **and** the project budget.
- There is no explicit link between project budgets and monthly budgets — the transaction's category is the natural bridge.

### 5.2 Budget Structure

Each project may have:

- **Total budget** — A single top-level spending target for the entire project.
- **Category budgets** — Optional per-category spending targets for any category that appears on project-tagged transactions.
- **Line items** — Optional project-level itemized estimates, each matched to transactions by tag (§5.5). Independent of category budgets.

### 5.3 Category Scope

Project budgets and category breakdowns are **not limited** to "Home Improvement" subcategories. Any category that appears on a project-tagged transaction is included in the project's breakdown. The project tag identifies a transaction as project-related; categories provide the grouping within that filter.

Examples of categories that commonly appear in project spending:
- Home Improvement > Furniture, Home Improvement > Hardware
- Shops > Home Improvement Stores
- Service > Contractors
- Transportation > Gas (material pickup runs)
- Food & Drink > Restaurants (worker meals)

### 5.4 Planned vs. Actual

The project detail view must show planned (budgeted) vs. actual (spent) at both the total and per-category level. This is a display requirement — no progress tracking, alerts, or notifications are needed.

### 5.5 Line Item Estimates

Each project may carry a list of **line items** — an itemized breakdown of estimated costs. Line items live at the **project level**, alongside `categoryBudgets` rather than nested inside them, and each carries a **tag** used to match actual transactions.

#### 5.5.1 Motivation

Categories are the right granularity for *budgeting* and the wrong granularity for *project management*. "Home Improvement" is a sensible budget envelope; "Sheetrock" is not a sensible category. A single renovation routinely spends its entire category budget through one category, so the category breakdown answers "how much did this project eat of our Home Improvement budget?" but never "did the sheetrock cost what I thought?"

Line items supply that second axis. Because the app already groups project transactions by tag, the same mechanism carries the finer grain: the project tag says *which project*, an additional arbitrary tag says *which line item*.

#### 5.5.2 Two Independent Axes

```
Project
├── categoryBudgets[]   ← budgeting axis; bridges to monthly budgets via categoryId
└── lineItems[]         ← project-management axis; matched to transactions by tag
```

The two are **siblings, not parent and child**. They are independent lenses over the same set of project-tagged transactions, in the same sense that trip budgets and monthly budgets are independent lenses (§5.1).

A line item has **no `categoryId`**. The category axis and the line item axis do not nest: a `sheetrock` purchase may be categorized *Home Improvement* while the drill from the same store run is *Shops > Hardware* and the permit is *Service > Government*. Declaring a category on the estimate would assert a relationship that the actual transactions are free to contradict. Where a category rollup of line items is wanted, it must be derived from the **matched transactions' own categories**, which is correct by construction.

#### 5.5.3 Line Item Fields

| Field           | Required | Description                                                     |
|-----------------|----------|-----------------------------------------------------------------|
| Name            | Yes      | Display name (e.g. "Actual wall cover (plywood, shiplap, …)")    |
| Estimated cost  | Yes      | Dollar amount, >= 0                                             |
| Tag             | Yes      | Tag matched against transactions (e.g. `wall-cover`)            |
| Notes           | No       | Free-text detail                                                |

Name and tag are **separate fields**. Display names want to be descriptive; tags want to be terse and typo-proof, because they are typed into a transaction's tag input. Deriving the tag from the name does not work — "Actual Wall Cover (plywood, shiplap, bead board, etc.)" slugifies to `actual-wall-cover-plywood-shiplap-bead-board-etc`, which nobody will type.

The UI pre-fills the tag with a slug of the name on first entry and lets the user overwrite it.

#### 5.5.4 Tag Convention

Line item tags are **flat and un-namespaced** — `cement`, not `basement-pantry:cement`.

Matching is always scoped to the project's own transaction subset (§5.5.5), so two projects using the same tag cannot contaminate each other. Reuse is therefore a feature, not a hazard: `tile` and `grout` carry across successive bathrooms, and the tag autocomplete improves with every project.

Line item tags are ordinary user tags. They are not required to be unique, not reserved, and carry no structural meaning outside a project's line item list. `isProjectTag()` continues to identify project tags specifically.

#### 5.5.5 Matching Actuals

A line item's **actual** is the sum of transactions that carry **both** the project's tag and the line item's tag.

Matching is deliberately naive:

- A transaction carrying two line item tags counts its **full amount** toward **both**. No splitting, apportioning, or double-count correction is performed.
- Nothing validates that a line item's tag was ever applied to anything. An untagged item and a mistyped tag are indistinguishable — both simply show no actual.
- Users who want exact attribution across a mixed receipt split the transaction and tag the children (transaction splits inherit the parent's tags — see §5.6).

This is a deliberate simplification for a two-user application. The failure mode is a visibly wrong number that prompts the user to fix the tag, which is a better feedback loop than a validation warning.

**Consequence for display:** because per-item actuals may overlap, the line items table must **not** print a column total. Per-item actuals and variances are shown; a summed total that silently disagrees with Total Spend is not.

#### 5.5.6 Derived Metrics

All of the following are derived at read time. No reconciliation state is stored.

| Metric              | Definition                                                                    |
|---------------------|-------------------------------------------------------------------------------|
| Line item actual    | Σ project-tagged transactions also carrying the line item's tag               |
| Line item variance  | `estimatedCost − actual`                                                      |
| **Unattributed**    | Σ project-tagged transactions carrying **none** of that project's line item tags |
| **Not yet purchased** | Line items with zero matched transactions                                   |

*Unattributed* is the honest measure of whether itemization is keeping up with reality: it is the portion of project spend that no estimate claims.

#### 5.5.7 Relationship to Budget Amounts

The project's `totalBudget` remains the authoritative spending target. Line items do **not** sum to replace it. A project may have a total budget with no line items, or line items whose sum differs from the budget — both are valid.

The allocation hint is **anchored to `totalBudget`** (it previously compared line items against a single category's `amount`):

| Condition                       | Display                                  |
|---------------------------------|------------------------------------------|
| `sum(lineItems) < totalBudget`  | "Unallocated: $X" hint                   |
| `sum(lineItems) > totalBudget`  | "Over-allocated by $X" hint              |
| `sum(lineItems) === totalBudget`| Neutral — no hint                        |
| `lineItems` is empty            | Neutral — no hint                        |
| `totalBudget` is null           | Neutral — no hint                        |

These are soft hints. They do not block saving, do not trigger alerts, and do not affect actual-spend calculations.

#### 5.5.8 Display

Line items are **always shown** in the project detail view — not hidden behind a toggle or restricted to edit mode — so the estimate stays visible throughout the life of the project.

#### 5.5.9 Out of Scope for Line Items

| Item                                                 | Rationale                                                   |
|------------------------------------------------------|-------------------------------------------------------------|
| Apportioning one transaction across several line items | Splits already provide exact attribution                   |
| Double-count detection or warnings                   | Naive matching is a deliberate choice (§5.5.5)              |
| "Purchased" checkbox or per-line status tracking     | Derived from whether any transaction matches                |
| Quantity × unit cost fields                          | Single `estimatedCost` per line item keeps input light      |
| Type/category field (material / tool / service)      | Users may annotate via name or notes; see §5.5.2 on `categoryId` |

### 5.6 Hidden Transactions and Splits

Project totals **exclude hidden transactions**, consistent with every other consumer of transaction data (reports, auto-categorization, the chatbot). `isHidden` means hidden everywhere.

This matters because splitting a transaction sets `isHidden` on the parent. The rules are therefore:

1. A split **parent** is hidden and is excluded from project totals.
2. Split **children** inherit the parent's tags at split time, including project tags and line item tags.

Together these make attribution correct in both orders of operation — tag-then-split and split-then-tag — and let a split serve as the exact attribution mechanism for a mixed receipt.

## 6. Pre-Project & Out-of-Range Transactions

Transactions tagged for a project are included in that project's totals **regardless of whether the transaction date falls within the project's start/end date range**. This supports common scenarios:

- Materials purchased before the project officially starts
- Deposits or down payments paid in advance
- Post-project charges (e.g., delayed contractor billing, warranty work)

The project's start and end dates define the project's timeline for display and status purposes, but do not act as a date filter on tagged transactions.

---

## 7. Key Metrics Summary

| Metric                          | Scope         | Description                                          |
|---------------------------------|---------------|------------------------------------------------------|
| Total spend                     | Per project   | Sum of all project-tagged transactions               |
| Total budget                    | Per project   | User-defined spending target                         |
| Budget variance                 | Per project   | Total budget minus total spend                       |
| Category spend                  | Per project   | Spend grouped by category within a project           |
| Category budget variance        | Per project   | Category budget minus category spend                 |
| Cross-project comparison        | All projects  | Card grid enables visual comparison across projects  |
| Line item estimate              | Per line item | User-defined estimated cost                          |
| Line item actual                | Per line item | Σ project-tagged transactions carrying the item's tag |
| Line item variance              | Per line item | Estimated cost minus actual                          |
| Unattributed spend              | Per project   | Project spend carrying none of the project's line item tags |

---

## 8. Requirements Summary

### 8.1 Must Have (P0)

| # | Requirement                                                                 |
|---|-----------------------------------------------------------------------------|
| 1 | Project entity with name, start date, end date, and auto-generated tag      |
| 2 | Dedicated "Create Project" flow generating `project:<name>:<year>` tags     |
| 3 | Year is required in the tag format                                          |
| 4 | Projects section in sidebar navigation                                      |
| 5 | Project card grid as default view, sorted by most recent start date         |
| 6 | Project detail with category breakdown (all categories, not just Home)      |
| 7 | Category drill-down reusing existing TransactionPreviewModal                |
| 8 | "View All" navigation carrying project tag filter to Transactions page      |
| 9 | Filter by year and project name                                             |
| 10| Project status derived from dates (Planning, Active, Completed)             |
| 11| Both users can create, edit, and delete projects                            |
| 12| Combined view of both users' transactions per project                       |
| 13| Project deletion removes tags from associated transactions (with confirm)   |
| 14| Project-tagged transactions count regardless of date range                  |
| 15| Planned vs. actual display at total and category level                      |
| 16| Project detail view includes a Tasks tab listing tasks tagged with the project |
| 17| Tasks tab header shows "{completed} of {total} complete" summary            |
| 18| "+ Add Task" button on the Tasks tab creates a task pre-tagged with the project |
| 19| Tasks carrying a project tag display a project chip that navigates to the project |
| 20| Project rename propagates tag updates to associated tasks (same behavior as transactions) |
| 21| Project deletion strips the project tag from associated tasks (same behavior as transactions) |
| 22| Project totals exclude hidden transactions (`isHidden`), consistent with all other consumers |
| 23| Transaction splits inherit the parent's tags onto every child at split time |
| 24| Line items live at the project level and carry an explicit match `tag` (no `categoryId`) |
| 25| Line item actual = Σ transactions carrying both the project tag and the line item tag |
| 26| Project detail displays per-line-item estimate, actual, and variance |
| 27| Project detail displays an *Unattributed* total (§5.5.6) |
| 28| A distinct-tags source backs tag autocomplete so line item tags can be typed reliably |

### 8.2 Should Have (P1)

| # | Requirement                                                                 |
|---|-----------------------------------------------------------------------------|
| 1 | Total project budget (single top-level number)                              |
| 2 | Per-category project budgets                                                |
| 3 | Notes field on project entity                                               |
| 4 | Status badge on project cards                                               |
| 5 | Spent vs. budget indicator on project cards                                 |
| 6 | Project name edit propagates tag update to all associated transactions      |
| 7 | Line item notes field                                                       |
| 8 | Unallocated / over-allocated hint when `sum(lineItems) != totalBudget`      |
| 9 | Line items always displayed in the project detail view                      |
| 10| Line item tag pre-filled with a slug of the item name, user-overridable      |
| 11| "Not yet purchased" indication for line items with no matched transactions   |

### 8.3 Nice to Have (P2)

| # | Requirement                                                                 |
|---|-----------------------------------------------------------------------------|
| 1 | Progress percentage (manual % complete field)                               |
| 2 | Photo/receipt attachments for warranty or insurance tracking                |
| 3 | Contractor/vendor notes per category budget line                            |

---

## 9. Out of Scope

| Item                                    | Rationale                                        |
|-----------------------------------------|--------------------------------------------------|
| Shared vs. personal expense distinction | Adds complexity; not needed for initial release  |
| Project-specific monthly budget link    | Project budgets are an independent parallel lens  |
| Apportioning one transaction across line items | Splits provide exact attribution (§5.5.5)  |
| Alerts or notifications on overspend    | Keep it simple; display variance only            |
| Project templates                       | Future enhancement if demand exists              |
| Mobile-specific project UI              | Mobile app is a separate initiative              |
| Milestones, Gantt-style timelines, dependencies | Basic task grouping is now in scope (§4.5). Richer PM features are deferred — the Tasks tab is a contextual view into the existing task system, not a full project-management layer. |
| Rating field                            | Ratings suit trips; less meaningful for projects  |

---

## 10. Open Questions

| # | Question                                                                    | Status |
|---|-----------------------------------------------------------------------------|--------|
| 1 | Should the project card grid support sorting options beyond "most recent"?  | Open   |
| 2 | Is there a max number of projects to support before pagination is needed?   | Open   |
| 3 | Should project tags be visually distinguished from trip/regular tags?       | Open   |
| 4 | Should line item tags be suggested from other projects' line items, or only from transaction tags in use? | Open |
| 5 | Should a line item's tag rename propagate to transactions the way a project rename does? | Open |

---

## 11. Success Criteria

- Users can create a project, tag transactions, and view total + per-category spending for that project.
- Both users' spending is combined in one project view.
- Drill-down from project categories to individual transactions works using existing modal patterns.
- Project budgets provide planned vs. actual visibility without interfering with monthly budgets.
- The card grid enables quick visual comparison across projects.
- Transactions can be tagged to both trips and projects — independent parallel lenses work correctly.
- Users can itemize estimated costs as project-level line items and see each item's estimate against its matched actual spend.
- Users can see how much project spend is not claimed by any line item (*Unattributed*).
- Hidden transactions never appear in project totals, and splitting a tagged transaction preserves its attribution.
- Users can see all tasks associated with a project from the project detail view, create tasks pre-tagged to the project, and navigate back from a task to its project.
