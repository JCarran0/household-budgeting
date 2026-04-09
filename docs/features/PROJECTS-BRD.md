# Project Tracking & Budget Management — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-09
**Version:** 1.0

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

Users may edit all project fields at any time. If the project name changes in a way that would alter the generated tag, the system must update the tag on all associated transactions.

### 3.4 Project Deletion

- The system must show a confirmation modal before deleting a project.
- Upon confirmation, the system removes the project entity and strips the project's tag from all associated transactions.
- Transactions themselves are not deleted — only the tag is removed.

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

---

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

---

## 8. Requirements Summary

### 9.1 Must Have (P0)

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

### 8.2 Should Have (P1)

| # | Requirement                                                                 |
|---|-----------------------------------------------------------------------------|
| 1 | Total project budget (single top-level number)                              |
| 2 | Per-category project budgets                                                |
| 3 | Notes field on project entity                                               |
| 4 | Status badge on project cards                                               |
| 5 | Spent vs. budget indicator on project cards                                 |
| 6 | Project name edit propagates tag update to all associated transactions      |

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
| Alerts or notifications on overspend    | Keep it simple; display variance only            |
| Project templates                       | Future enhancement if demand exists              |
| Mobile-specific project UI              | Mobile app is a separate initiative              |
| Project management features (tasks, milestones, Gantt) | This is a budgeting tool, not a PM tool |
| Rating field                            | Ratings suit trips; less meaningful for projects  |

---

## 10. Open Questions

| # | Question                                                                    | Status |
|---|-----------------------------------------------------------------------------|--------|
| 1 | Should the project card grid support sorting options beyond "most recent"?  | Open   |
| 2 | Is there a max number of projects to support before pagination is needed?   | Open   |
| 3 | Should project tags be visually distinguished from trip/regular tags?       | Open   |

---

## 11. Success Criteria

- Users can create a project, tag transactions, and view total + per-category spending for that project.
- Both users' spending is combined in one project view.
- Drill-down from project categories to individual transactions works using existing modal patterns.
- Project budgets provide planned vs. actual visibility without interfering with monthly budgets.
- The card grid enables quick visual comparison across projects.
- Transactions can be tagged to both trips and projects — independent parallel lenses work correctly.
