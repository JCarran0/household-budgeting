# Trip Itineraries — Manual UAT Test Plan

**Scope:** `/trips/:tripId` detail view, Itinerary tab, Stop CRUD, templates, empty states.
**Prereqs:**
- Dev servers running (`http://localhost:5183`, backend on `:3021`)
- `VITE_GOOGLE_PLACES_API_KEY` set in `frontend/.env.development` for Stay tests
- At least one trip exists on `/trips`

Checklist — ☐ pending · ✅ pass · ❌ fail (file a bug with path).

---

## 1. Navigation & Detail View

- [ ] `/trips` accordion shows a **View Details** button on each trip; clicking opens `/trips/:tripId`
- [ ] Header displays: trip name, status badge, date range, rating (if set), total spent / total budget, tag
- [ ] Three tabs render: Itinerary, Spending, Notes
- [ ] `?tab=spending` in the URL opens the Spending tab directly; switching tabs updates the URL
- [ ] Back link returns to `/trips`
- [ ] 404 page shows for `/trips/bogus-id`
- [ ] Edit trip from detail page opens the same modal as the list view; save updates the header
- [ ] Delete trip from detail page navigates back to `/trips` after confirmation

## 2. Empty State

- [ ] Trip with no stops shows the **stay-first empty card** (🛏 "Where are you staying?")
- [ ] Primary CTA "**+ Add a Stay**" opens the stop sheet pre-set to Stay with trip's startDate
- [ ] "**I'm flying first**" opens Transit form with mode = Flight, startDate = trip.startDate
- [ ] "**Use template**" opens template picker

## 3. Templates

- [ ] Template picker shows City break / Multi-city / Beach week
- [ ] City break → opens Stay form with nights = entire trip length
- [ ] Beach week → same as City break
- [ ] Multi-city → opens Stay form with nights = ~half of trip length
- [ ] Info alert explains templates pre-fill the Stay form (no pre-created stops)

## 4. Stay Creation (Google Places required)

- [ ] Stay form shows **no warning banner** when `VITE_GOOGLE_PLACES_API_KEY` is set and valid
- [ ] Typing in Location field shows Google autocomplete predictions within ~500ms
- [ ] Selecting a prediction populates the Location field with the verified label and dims the "Change" affordance
- [ ] Nights picker defaults to 1; segmented control offers 1/2/3/7 + custom NumberInput
- [ ] "Last night: YYYY-MM-DD" label updates as startDate or nights change
- [ ] Save succeeds; toast shows "Stop added"; detail view shows the new Stay as a chapter banner
- [ ] **Without an API key**, yellow warning banner appears + location is disabled + Add Stay button is disabled

## 5. Stay No-Overlap Rule

- [ ] Create Stay A: May 1–3 (3 nights). Saves successfully.
- [ ] Create Stay B adjacent: May 4–6. Saves successfully — adjacency allowed.
- [ ] Create Stay C overlapping A: May 2–4. Save fails with red toast: "This Stay overlaps with 'Stay A' (2026-05-01 – 2026-05-03)."
- [ ] Edit Stay B to shift into Stay A's range. Save fails with overlap message naming Stay A.
- [ ] Edit Stay A to extend by one night (no overlap). Succeeds.

## 6. Eat / Play / Transit Creation (no Places key needed)

- [ ] Eat form: required name, optional free-text location, optional time. Saves successfully.
- [ ] Play form: same as Eat + optional duration in minutes.
- [ ] Transit form: mode segmented control (Drive / Flight / Train / Walk / Shuttle / Other), date required.
- [ ] Transit with from/to filled shows "From → To" in the agenda card.
- [ ] Transit form pre-fills from = previous stop's location, to = next stop's location when creating in between.

## 7. Agenda Rendering

- [ ] Day headers show "Sat, May 1 · Day 1" format
- [ ] Today's day is highlighted (blue left border + text)
- [ ] Days outside trip's nominal range show "Outside range" badge and are dimmed
- [ ] Stay banner renders **once** at the first day it covers (not on every night)
- [ ] Timed stops appear before untimed stops, sorted ascending by time
- [ ] Untimed stops are draggable within the day (grip handle on hover)
- [ ] Dragging an untimed stop reorders it; reload preserves the new order
- [ ] Days can be collapsed; collapsed header shows one-line summary ("3 stops · Pizza + 2 more"); state persists across tab switches via sessionStorage

## 8. Transit Dual Rendering

- [ ] Create Stay A (May 1–3) + Stay B (May 4–6) + Transit on May 4 mode=Drive.
  - Transit renders as a **full-width dashed connector tile** between the two chapter banners, not inside a Day section.
- [ ] Create Stay A (May 1–5) + Transit on May 3 (inside Stay A's range).
  - Transit renders **inline within May 3's Day section** as a day-trip.
- [ ] Delete the connecting Transit. Agenda continues to render both Stay chapters.

## 9. Gap-Day Nudges

- [ ] Create a 7-day trip with a Stay covering only nights 1–3. Nights 4–7 show a dashed "Where are you staying from 2026-... to 2026-...?" card with "+ Add Stay" button.
- [ ] Clicking the nudge's Add Stay button opens Stay form with startDate = the uncovered range start.

## 10. Edit / Delete Stops

- [ ] Click edit icon on a stop → form opens pre-filled with the stop's values
- [ ] Change name, save → agenda reflects new name
- [ ] Click delete icon → confirmation shows "Delete 'Stop Name' on May 1, 2026?"
- [ ] Transit delete confirmation shows "Delete 'Drive to {toLocation}' on ..."
- [ ] Confirming deletes the stop; cancelling leaves it intact

## 11. Spending Tab (regression)

- [ ] Spending tab renders the same category breakdown as the /trips accordion panel
- [ ] Clicking a row opens the transaction preview modal filtered by trip tag + category

## 12. Family Sharing (regression)

- [ ] User A creates a trip + stops. Sign in as User B (same family) → sees the same trip and can edit/delete stops.
- [ ] Sign in as a user from a different family → trip not visible.

---

## Known Limitations (V1, not bugs)

- Stay dates are night-based: `endDate` = last night slept, not check-out morning. Document this in copy if confusion arises.
- Templates create scaffolding only; Stay locations are not pre-filled (verified-location constraint).
- No map view, no email/confirmation parsing, no link-to-transaction, no road-trip style — all V2+ items per BRD.
- Autosave-on-valid from the plan (REQ-036) is not implemented; explicit Save button only. Noted for V2.
