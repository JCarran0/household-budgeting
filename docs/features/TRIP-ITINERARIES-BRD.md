# Trip Itineraries — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-18
**Version:** 1.0
**Extends:** `docs/features/TRAVEL-TAGGING-BRD.md`

---

## Summary

Add itinerary planning to the existing Trips feature. A trip gains a collection of **Stops** (Stay, Eat, Play, Transit) rendered as a day-by-day agenda in a new **Trip Detail view** at `/trips/:tripId`. The existing `/trips` list view is preserved as a retrospective budget lens.

## Background

The existing Travel Tagging BRD explicitly excluded itinerary and planning features ("This is a budgeting tool, not a travel planner"). As the app reframes around broader household/family use cases, trip planning becomes in-scope. This BRD reverses that exclusion and defines the planning surface.

The existing Trip entity (name, dates, tag, budgets, rating, notes) is retained unchanged. Stops are added as a new child concept. Financial behavior (tagging, category breakdowns, budget tracking) is unchanged and remains the list view's primary purpose.

## Requirements

### Stop Entity

**REQ-001:** A Trip may contain zero or more Stops.

**REQ-002:** Each Stop has exactly one type: `Stay`, `Eat`, `Play`, or `Transit`.

**REQ-003:** Each Stop has a required date. Time is optional.

**REQ-004:** A Stay has a required end date; all other types do not. End date must be on or after start date.

**REQ-005:** A Stay is the only stop type that may span multiple days. A Stay's `endDate` represents the last night of the stay, not the check-out morning.

**REQ-006:** A Transit has a required `mode`: `Drive`, `Flight`, `Train`, `Walk`, `Shuttle`, or `Other`.

**REQ-007:** A Transit may have optional `fromLocation` and `toLocation` fields. When absent, they may be inferred from the locations of neighboring stops in display only; the underlying data remains null.

**REQ-008:** Every Stop has an optional free-text `notes` field.

### Location

**REQ-009:** A Stay's location must be a verified physical address resolvable to latitude/longitude coordinates.

**REQ-010:** An Eat or Play stop's location is optional and may be either a verified address or free text (e.g., "trailhead", "Grandma's house").

**REQ-011:** A Transit's `fromLocation` and `toLocation`, if provided, may be either verified addresses or free text.

### Date Range Behavior

**REQ-012:** A Stop's date may fall outside the trip's nominal `startDate`/`endDate` range. The trip's nominal dates are display metadata only and are not modified by Stop creation or editing.

**REQ-013:** The agenda view renders days from the earliest Stop date to the latest Stop date (or Stay end date), which may extend beyond the trip's nominal range. Days outside the nominal range are visually indicated as such.

**REQ-014:** Two Stays may not cover the same date. The system must reject any create or edit operation that would cause two Stays to occupy the same night.

### Ownership & Permissions

**REQ-015:** Stops belong to a Trip and inherit the Trip's family scope. Any family member may create, edit, or delete any Stop.

**REQ-016:** Deleting a Trip also deletes all of its Stops.

### Trip Detail View

**REQ-017:** A new route `/trips/:tripId` renders a Trip Detail view.

**REQ-018:** The Trip Detail view has three tabs: **Itinerary**, **Spending**, **Notes**.

**REQ-019:** The Spending tab contains the same category breakdown content currently rendered in the list view's expanded accordion panel.

**REQ-020:** The Notes tab contains the trip's existing `notes` field, editable in place.

**REQ-021:** The Trip Detail view header displays the trip name, date range, status badge, rating, and provides Edit and Delete actions for the Trip entity (reusing existing flows).

### Agenda View (Itinerary Tab)

**REQ-022:** The agenda is a vertical scroll of day sections, ordered chronologically.

**REQ-023:** Each day section displays the date, day-of-week, and a day index (e.g., "Day 3").

**REQ-024:** A Stay's presence anchors the days it covers with a visible "chapter" banner showing the Stay's name and remaining nights (e.g., "Hotel A — night 2 of 3"). The banner appears on every day from the Stay's `startDate` through its `endDate` inclusive. No banner appears on days not covered by any Stay (including the morning after a Stay ends).

**REQ-025:** Stops within a day are displayed in this order: timed stops ascending by time, then untimed stops. Untimed stops may be manually reordered by the user via drag; timed stops are not manually reorderable.

**REQ-026:** A Transit whose date range transitions between two different Stays (a base-change) is rendered as a full-width connector tile between the two Stay chapters rather than inline within a day.

**REQ-027:** A Transit that does not transition between Stays (a day-trip) is rendered inline within its day, alongside other stops.

**REQ-028:** The "current day" during an active trip is visually highlighted.

**REQ-029:** Each day section may be collapsed or expanded. Days are expanded by default.

**REQ-030:** When a day is collapsed, its header displays a one-line summary of its stops.

### Stop Creation

**REQ-031:** Each day section provides an "Add stop" affordance.

**REQ-032:** Adding a stop opens a type-first picker (Stay / Eat / Play / Transit). After type selection, the form reveals the fields appropriate for that type.

**REQ-033:** The form's date field is pre-filled to the day context from which the user initiated creation. The user may override it.

**REQ-034:** The Stay form expresses duration as a number of nights, with quick selectors (e.g., 1, 2, 3, 7). The `endDate` is derived as `startDate + nights - 1` (last night of the stay).

**REQ-035:** The Transit form pre-fills `fromLocation` and `toLocation` from the stops immediately before and after in the agenda, where available. The user may override.

**REQ-036:** The form saves automatically when all required fields for the selected type are valid. A manual "Done" action dismisses the sheet.

**REQ-037:** Additional fields (notes, URLs, confirmation codes) are available via a progressive-disclosure "More details" section.

### Empty State

**REQ-038:** When a Trip has no Stops, the Trip Detail view's Itinerary tab displays a stay-first empty state rather than a list of empty day sections.

**REQ-039:** The empty state offers three actions: **Add a Stay** (primary), **I'm flying first** (opens Transit form with mode=Flight), and **Use template** (opens a template picker with at least "City break", "Multi-city", and "Beach week").

**REQ-040:** The empty state is dismissed automatically once any Stop exists.

**REQ-041:** A populated trip with one or more uncovered days (no Stay spanning them) displays a gentle prompt to add a Stay for those days, rendered at the boundary between covered and uncovered ranges.

**REQ-042:** A populated trip with a day that has no Stops renders a soft "Nothing planned" placeholder within that day's section.

### List View (`/trips`)

**REQ-043:** The existing list view at `/trips` continues to render as an accordion with the existing filter bar, card summaries, and expandable category breakdown.

**REQ-044:** Each accordion panel adds a **View Details** action that navigates to `/trips/:tripId`.

---

## Assumptions

- **A-01:** The existing Trip entity (name, dates, tag, totalBudget, categoryBudgets, rating, notes) is unchanged. Stops are a new concept, not a modification.
- **A-02:** Stop creation, editing, or deletion does not modify transaction tags. The existing tag-based transaction-to-trip relationship is unchanged.
- **A-03:** The chosen address verification provider (e.g., Google Places, Mapbox) is an implementation decision captured in the plan document, not the BRD.
- **A-04:** Any family member may edit any Stop, mirroring the existing Trip-level permission model.
- **A-05:** Times are displayed in the user's local browser time.

## Open Questions

- **Q-01:** Which starting templates should V1 include? Proposed: City break (single base, 3–5 days), Multi-city (2 bases, weeklong), Beach week (single base, 7 days). Road trip is deferred to V2.
- **Q-02:** Should the agenda extend automatically when a trip is "live" to include today's date, even if no stop covers it?

## Out of Scope

| Item | Rationale |
|------|-----------|
| **Map view** | Data model supports auto-derivation from Stays + Transit; deferred to V2. |
| **Email / confirmation parsing** | High cost (IMAP/forwarding infrastructure, parser reliability). Nice-to-have, deferred to V2+. |
| **Destination-based suggestions** ("Popular in Barcelona…") | Fights the personal-trip feel and requires curated data. Deferred indefinitely. |
| **Link Stops to transactions** | Tempting given the existing tag model, but not MVP. Future enhancement. |
| **Road-trip style (waypoint-centric view)** | This BRD is vacation-focused. A separate trip type or view may be added later. |
| **Calendar-grid view** | The time-optional list renders loose plans gracefully; grid view is a power-user V2 toggle. |
| **Time-aware density** (today expanded, past collapsed during trip) | Polish deferred to V2. |
| **Onboarding tour / tooltip carousel** | Empty state and type-first creation are intended to teach the model without a guided tour. |
| **Public / shareable trip links** | Family-level sharing is free from the existing multi-user scope. External sharing is not MVP. |
| **Retirement of the list-view accordion category panel** | Deferred to V2. The list view continues to serve retrospective budget review; its long-term fate is decided after the detail view lands. |
| **Stop reminders or notifications** | Not a planning-tool responsibility in V1. |
| **Mobile-specific UI** | Mobile-friendly design required; native mobile app is a separate initiative. |
| **Rideshare / taxi / bike / ferry as first-class Transit modes** | Covered by `Other` in V1. Promoted to first-class if usage patterns warrant. |
