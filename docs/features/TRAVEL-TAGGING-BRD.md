# Travel Tagging & Trip Management — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-05
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

Users take trips throughout the year and want to understand how much they spend per trip, how that compares to a planned budget, and how spending breaks down by category. Currently, the app has no way to group transactions by trip or view travel-specific spending reports. Users must mentally track trip costs or use external tools.

### 1.2 Solution Summary

Introduce **Trips** as a first-class entity backed by the existing tag system. Users create trips via a dedicated flow, which generates a structured tag (`trip:<name>:<year>`) applied to transactions. A new **Trips** section provides trip management, per-trip budget planning, and a travel spending report with category drill-down.

### 1.3 Users

Both household users. Any user can create, edit, and delete trips. Both users' transactions are combined into a single trip view.

---

## 2. Tag Convention

### 2.1 Format

```
trip:<trip-name>:<year>
```

- **trip** — Fixed prefix identifying this as a trip tag.
- **trip-name** — Lowercase, hyphenated identifier (e.g., `costarica`, `portugal`, `nyc-weekend`). Generated from the user-provided trip name.
- **year** — Required four-digit year (e.g., `2026`).

### 2.2 Examples

| Trip Name       | Generated Tag             |
|-----------------|---------------------------|
| Costa Rica      | `trip:costa-rica:2026`    |
| Portugal        | `trip:portugal:2025`      |
| NYC Weekend     | `trip:nyc-weekend:2026`   |

### 2.3 Tag Behavior

- Trip tags use the existing `tags: string[]` field on transactions.
- A transaction may carry multiple trip tags (e.g., a multi-leg trip or a shared expense across trips).
- Trip tags coexist with any other non-trip tags on a transaction.
- Existing bulk edit functionality is sufficient for retroactively tagging past transactions.

---

## 3. Trip Entity

### 3.1 Trip Creation

The system must provide a dedicated "Create Trip" flow (not manual tag entry) that collects:

| Field              | Required | Description                                              |
|--------------------|----------|----------------------------------------------------------|
| Trip Name          | Yes      | Display name (e.g., "Costa Rica 2026")                   |
| Start Date         | Yes      | Trip start date                                          |
| End Date           | Yes      | Trip end date                                            |
| Total Budget       | No       | Overall spending target for the trip                     |
| Category Budgets   | No       | Per-category spending targets (see Section 5)            |
| Rating             | No       | 1–5 star rating                                          |
| Notes              | No       | Free-text notes about the trip                           |

- The system generates the structured tag automatically from the trip name and year.
- Rating and notes may be added or edited at any time — there is no restriction based on trip status.

### 3.2 Trip Status

Status is derived from the trip's start and end dates relative to today:

| Status      | Condition                        |
|-------------|----------------------------------|
| Upcoming    | Start date is in the future      |
| Active      | Today is between start and end   |
| Completed   | End date is in the past          |

Status is display-only and does not restrict any functionality. Users can tag transactions, edit budgets, and modify trip details regardless of status.

### 3.3 Trip Editing

Users may edit all trip fields at any time. If the trip name changes in a way that would alter the generated tag, the system must update the tag on all associated transactions.

### 3.4 Trip Deletion

- The system must show a confirmation modal before deleting a trip.
- Upon confirmation, the system removes the trip entity and strips the trip's tag from all associated transactions.
- Transactions themselves are not deleted — only the tag is removed.

---

## 4. Trips Section

### 4.1 Navigation

Trips must be accessible as its own section in the sidebar navigation, alongside Transactions, Budgets, and Reports.

### 4.2 Default View — Trip Card Grid

When a user opens the Trips section, they see a card grid of all trips sorted by most recent start date. Each card displays:

- Trip name
- Dates (start – end)
- Status badge (Upcoming, Active, Completed)
- Total spend
- Total budget (if set)
- Spent vs. budget indicator (e.g., fraction or simple bar)
- Rating (if set)

This view enables at-a-glance cross-trip comparison without requiring users to select specific trips to compare.

### 4.3 Filters

The card grid must support filtering by:

| Filter | Behavior                                           |
|--------|----------------------------------------------------|
| Year   | Show only trips from a selected year               |
| Trip   | Search/select a specific trip by name               |

### 4.4 Trip Detail — Accordion Expansion

Clicking a trip card expands an accordion (or navigates to a detail view) showing:

1. **Trip summary** — Name, dates, status, rating, notes, total spend, total budget, variance (spent vs. budgeted).
2. **Category breakdown** — Each category that appears on trip-tagged transactions, showing:
   - Category name
   - Amount spent
   - Category budget (if set)
   - Variance (spent vs. category budget, if set)
3. **Category drill-down** — Clicking a category opens the existing `TransactionPreviewModal` showing transactions for that category within the trip (filtered by trip tag + category).
4. **"View All" navigation** — From the preview modal, "View All" navigates to the Transactions page with the trip tag filter and category filter pre-applied via URL params.

---

## 5. Trip Budgets

### 5.1 Relationship to Monthly Budgets

Trip budgets are **independent** from monthly budgets. They are a parallel lens on the same transactions:

- A transaction tagged for a trip and categorized as "Food & Drink > Restaurants" counts toward **both** the monthly budget for that category **and** the trip budget.
- There is no explicit link between trip budgets and monthly budgets — the transaction's category is the natural bridge.

### 5.2 Budget Structure

Each trip may have:

- **Total budget** — A single top-level spending target for the entire trip.
- **Category budgets** — Optional per-category spending targets for any category that appears on trip-tagged transactions.

### 5.3 Category Scope

Trip budgets and category breakdowns are **not limited** to "Travel" subcategories. Any category that appears on a trip-tagged transaction is included in the trip's breakdown. The trip tag identifies a transaction as trip-related; categories provide the grouping within that filter.

Examples of categories that commonly appear in trip spending:
- Travel > Flights, Travel > Lodging
- Food & Drink > Restaurants
- Transportation > Gas, Transportation > Rideshare
- Entertainment > Activities
- Shopping

### 5.4 Planned vs. Actual

The trip detail view must show planned (budgeted) vs. actual (spent) at both the total and per-category level. This is a display requirement — no progress tracking, alerts, or notifications are needed.

---

## 6. Pre-Trip & Out-of-Range Transactions

Transactions tagged for a trip are included in that trip's totals **regardless of whether the transaction date falls within the trip's start/end date range**. This supports common scenarios:

- Flights booked months in advance
- Travel insurance purchased before departure
- Post-trip charges (e.g., delayed hotel billing)

The trip's start and end dates define the trip's timeline for display and status purposes, but do not act as a date filter on tagged transactions.

---

## 7. Key Metrics Summary

| Metric                          | Scope         | Description                                          |
|---------------------------------|---------------|------------------------------------------------------|
| Total spend                     | Per trip      | Sum of all trip-tagged transactions                  |
| Total budget                    | Per trip      | User-defined spending target                         |
| Budget variance                 | Per trip      | Total budget minus total spend                       |
| Category spend                  | Per trip      | Spend grouped by category within a trip              |
| Category budget variance        | Per trip      | Category budget minus category spend                 |
| Cross-trip comparison           | All trips     | Card grid enables visual comparison across trips     |

---

## 8. Requirements Summary

### 8.1 Must Have (P0)

| # | Requirement                                                                 |
|---|-----------------------------------------------------------------------------|
| 1 | Trip entity with name, start date, end date, and auto-generated tag         |
| 2 | Dedicated "Create Trip" flow generating `trip:<name>:<year>` tags           |
| 3 | Year is required in the tag format                                          |
| 4 | Trips section in sidebar navigation                                         |
| 5 | Trip card grid as default view, sorted by most recent start date            |
| 6 | Trip detail with category breakdown (all categories, not just Travel)       |
| 7 | Category drill-down reusing existing TransactionPreviewModal                |
| 8 | "View All" navigation carrying trip tag filter to Transactions page         |
| 9 | Filter by year and trip name                                                |
| 10| Trip status derived from dates (Upcoming, Active, Completed)               |
| 11| Both users can create, edit, and delete trips                              |
| 12| Combined view of both users' transactions per trip                         |
| 13| Trip deletion removes tags from associated transactions (with confirmation)|
| 14| Trip-tagged transactions count regardless of date range                    |
| 15| Planned vs. actual display at total and category level                     |

### 8.2 Should Have (P1)

| # | Requirement                                                                 |
|---|-----------------------------------------------------------------------------|
| 1 | Total trip budget (single top-level number)                                 |
| 2 | Per-category trip budgets                                                   |
| 3 | Rating (1–5 stars) on trip entity                                           |
| 4 | Notes field on trip entity                                                  |
| 5 | Status badge on trip cards                                                  |
| 6 | Spent vs. budget indicator on trip cards                                    |
| 7 | Trip name edit propagates tag update to all associated transactions         |

### 8.3 Nice to Have (P2)

| # | Requirement                                                                 |
|---|-----------------------------------------------------------------------------|
| 1 | Progress tracking toward trip budget (visual progress bar, percentage)      |
| 2 | Trip recap prompt when trip status changes to Completed                     |

---

## 9. Out of Scope

| Item                                    | Rationale                                        |
|-----------------------------------------|--------------------------------------------------|
| Shared vs. personal expense distinction | Adds complexity; not needed for initial release  |
| Trip-specific monthly budget integration| Trip budgets are an independent parallel lens     |
| Alerts or notifications on overspend    | Keep it simple; display variance only            |
| Trip templates or recurring trips       | Future enhancement if demand exists              |
| Mobile-specific trip UI                 | Mobile app is a separate initiative              |
| Trip itinerary or planning features     | This is a budgeting tool, not a travel planner   |

---

## 10. Open Questions

| # | Question                                                                    | Status |
|---|-----------------------------------------------------------------------------|--------|
| 1 | Should the trip card grid support sorting options beyond "most recent"?     | Open   |
| 2 | Is there a maximum number of trips to support before pagination is needed?  | Open   |
| 3 | Should trip tags be visually distinguished from regular tags in the transaction list? | Open |

---

## 11. Success Criteria

- Users can create a trip, tag transactions, and view total + per-category spending for that trip.
- Both users' spending is combined in one trip view.
- Drill-down from trip categories to individual transactions works using existing modal patterns.
- Trip budgets provide planned vs. actual visibility without interfering with monthly budgets.
- The card grid enables quick visual comparison across trips.
