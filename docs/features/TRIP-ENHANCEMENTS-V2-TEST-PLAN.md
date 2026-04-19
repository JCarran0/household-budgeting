# Trip Enhancements V2 — Manual UAT Test Plan

**Scope:** Map tab on `/trips/:tripId` + `photoAlbumUrl` field on Trip.
**BRD:** [TRIP-ENHANCEMENTS-V2-BRD.md](./TRIP-ENHANCEMENTS-V2-BRD.md)
**Plan:** [TRIP-ENHANCEMENTS-V2-PLAN.yaml](./TRIP-ENHANCEMENTS-V2-PLAN.yaml)

**Prereqs:**
- Dev servers running (`http://localhost:5183`, backend on `:3021`)
- `VITE_GOOGLE_PLACES_API_KEY` set in `frontend/.env.development`
- **Maps JavaScript API enabled on the same Google Cloud project** (the key Places uses must also be authorized for Maps JS)
- Multiple trips exist with varied shapes — at least one with only Stays, one with mixed Stay/Eat/Play, one with no geocoded stops (only free-text)

Checklist — ☐ pending · ✅ pass · ❌ fail (file a bug with path).

---

## 1. Photo Album URL — Field, Persistence, Button

### 1.1 Editing the field

- [ ] Trip edit modal has a **Photos album URL** text input positioned after Notes
- [ ] Pasting a valid https URL (e.g. `https://photos.google.com/share/abc123`) saves without error
- [ ] Pasting a plain http URL saves without error
- [ ] Pasting `not a url` shows an inline validation error; save button triggers the same error
- [ ] Clearing the field and saving sets the server-side value to `null` (verify via API: `GET /api/v1/trips/:id` → `photoAlbumUrl: null`)
- [ ] Creating a new trip with the field left blank succeeds; the field returns `null`

### 1.2 Open album button

- [ ] On trips with `photoAlbumUrl` set, an **Open album** button appears in the Trip Detail header, to the left of Edit/Delete
- [ ] The button has a photo icon and opens the URL in a **new tab** (target="_blank", rel="noopener noreferrer")
- [ ] On trips without `photoAlbumUrl`, no Open album button is rendered (no placeholder CTA)
- [ ] Hovering the button shows a tooltip "Open photo album"

### 1.3 Legacy trip compatibility

- [ ] A trip created before V2 (no `photoAlbumUrl` in storage) loads without error; API response shows `photoAlbumUrl: null`
- [ ] Editing a legacy trip and saving without touching the photo field keeps `photoAlbumUrl` as `null`

---

## 2. Map Tab — Visibility

- [ ] A trip with **at least one Stay** shows the Map tab between Itinerary and Spending
- [ ] A trip with **only free-text Eat/Play stops (no Stay)** does **not** show the Map tab
- [ ] A trip with **zero stops** does not show the Map tab
- [ ] Deep-linking to `?tab=map` on a trip without geocoded stops silently falls back to the Itinerary tab (URL should NOT persist `?tab=map`)
- [ ] Tab order is: **Itinerary / Map / Spending / Notes**
- [ ] Switching tabs updates the URL (`?tab=map`, `?tab=spending`, etc.); the Itinerary tab has no `?tab=` param

---

## 3. Map — Pin Rendering

### 3.1 Stays
- [ ] Every Stay in the trip renders as a pin at its verified coords
- [ ] Pin icon for a Stay includes a bed glyph (🛏)

### 3.2 Eat / Play
- [ ] An Eat stop with `location.kind === 'verified'` renders as a pin (fork glyph 🍴)
- [ ] A Play stop with `location.kind === 'verified'` renders as a pin (mask glyph 🎭)
- [ ] An Eat/Play stop with `location.kind === 'freeText'` does **NOT** render as a pin
- [ ] An Eat/Play stop with `location === null` does **NOT** render as a pin

### 3.3 Transit endpoints
- [ ] Transit stops are never rendered as their own pins (their spatial presence is the connector line + bracketing Stays)

### 3.4 Day affinity
- [ ] Each pin has an outer color keyed to its day (use ≥3 days' stops to see distinct colors)
- [ ] Each pin has a small dark numeric badge (top-right) showing its day number (Day 1, Day 2, …)
- [ ] On long trips (>10 days), the palette wraps — colors repeat after day 10 but the badge number stays correct

### 3.5 Footer count (REQ-015)
- [ ] A trip with N free-text Eat/Play stops shows a footer "N stops without map locations" (singular 'stop' for N=1)
- [ ] A trip with zero free-text stops shows no footer
- [ ] The footer is informational only — no CTA, not clickable

---

## 4. Map — Transit Lines

### 4.1 Base-change transits render
- [ ] A transit at the seam between two different Stays (e.g., fly from Barcelona to Amsterdam) renders as a connector line between the two Stays' pins
- [ ] The line direction is indicated by an arrow symbol around the midpoint
- [ ] A mode icon (✈/🚂/🚗/🚶/🚐/➜) appears at the line midpoint inside a white pill

### 4.2 Flight arcs
- [ ] A flight transit renders as a **geodesic arc** (curves toward the pole for long East-West routes, e.g., New York → Tokyo)
- [ ] The flight line is **dashed**
- [ ] The flight line color is blue

### 4.3 Ground transit modes
- [ ] A drive/train/walk/shuttle/other transit renders as a **straight polyline** (no curve, no routing)
- [ ] Ground transits are **solid**, not dashed
- [ ] Mode-specific colors: Drive = red, Train = green, Walk = orange, Shuttle = purple, Other = brown

### 4.4 Day-trip transits OMITTED (REQ-017)
- [ ] A transit whose date falls strictly inside a single stay's range (e.g., a day trip from base camp and back) does **not** render as a line on the map
- [ ] The day-trip transit still appears in the Itinerary tab inline — map-omit does not remove it from the agenda

### 4.5 Edge cases
- [ ] A base-change transit with no bracketing Stay on one side (e.g., the very first transit into the trip) does not render a line and does not crash the map
- [ ] A trip with only Stays (no transits) renders pins but no lines

---

## 5. Map — Popup & Deep Link

### 5.1 Popup contents
- [ ] Tapping a pin opens an InfoWindow with: type glyph, stop name, "Day N" label, time (or —), truncated notes
- [ ] Notes longer than ~80 chars are truncated with an ellipsis
- [ ] Clicking the × on the InfoWindow dismisses it
- [ ] Clicking a different pin replaces the popup (does not stack)

### 5.2 View in itinerary
- [ ] "View in itinerary" button appears in the popup
- [ ] Clicking it navigates to the Itinerary tab AND appends `?stop=<stopId>` to the URL
- [ ] On arrival, the matching stop's card scrolls into view (smooth) and pulses a blue highlight for ~2 seconds
- [ ] After arrival, the `?stop=` param is stripped from the URL automatically (reload stays clean)
- [ ] If the target stop's day is collapsed, that day expands before the scroll lands
- [ ] A stale share link (`?stop=bogus-id`) silently clears the param without crashing

### 5.3 External deep link
- [ ] Sharing a URL like `/trips/:tripId?stop=<stopId>` directly (paste into a new tab) triggers the same scroll-and-highlight as the map popup flow

---

## 6. Map — Day Filter

### 6.1 Chips
- [ ] Above the map, a horizontal chip row shows: **All / Day 1 / Day 2 / …**
- [ ] On narrow viewports (<600px wide), the chip row scrolls horizontally without clipping
- [ ] The **All** chip is the default for non-live trips

### 6.2 Live trip auto-select (REQ-026)
- [ ] For a trip where today falls within the agenda range, opening the Map tab auto-selects today's chip (e.g., "Day 3" if today is day 3)
- [ ] The "today" chip has a distinct accent (filled blue) vs non-today chips (outline gray)

### 6.3 Filtering behavior
- [ ] Selecting a day chip reduces the rendered pins to only those whose stop.date matches
- [ ] Selecting a day chip reduces the rendered transit lines to only base-change transits whose span includes that day (REQ-025) — i.e., a base-change transit on the day-of-departure still renders when Day N (arrival) is selected, and vice versa
- [ ] Selecting **All** restores the full set
- [ ] The selected chip is **not** persisted to the URL (tab switch and return resets to default)

### 6.4 Auto-fit
- [ ] On Map tab first open: the map auto-fits its bounds to show all pins with ~48px padding
- [ ] On changing day filter: the map re-fits to the newly visible pin set
- [ ] If the filter yields zero pins, the map retains its last bounds (no crash)

---

## 7. Lazy Loading (REQ-029)

- [ ] Open DevTools Network tab, filter to `maps.googleapis.com`
- [ ] Load a trip's detail view with `?tab=itinerary` (the default). **No** request to `maps.googleapis.com/maps/api/js` should fire just from loading the detail view
  - Note: Places Autocomplete loads separately when the user opens the stop creation form; this is a different concern
- [ ] Click the Map tab. **Now** `maps/api/js` fires
- [ ] Navigate away to Spending tab and back to Itinerary. No additional Maps JS script loads; cached
- [ ] Returning to Map tab a second time uses the cached script (no duplicate request)

---

## 8. Error Handling (REQ-028)

- [ ] With `VITE_GOOGLE_PLACES_API_KEY` **unset**, the Map tab shows a yellow "Map unavailable" card and remains navigable
- [ ] With an **invalid API key** or key without Maps JS API enabled, the Map tab shows a red "Map unavailable" fallback card
- [ ] The fallback never prevents the rest of the app from rendering (Itinerary tab still works)
- [ ] The fallback does not spam toasts; a single inline alert is sufficient

---

## 9. Accessibility

- [ ] Each pin has an aria-label of the form "Stay: Hotel Name, Day 2" (verify with screen reader or devtools)
- [ ] Day chips are keyboard-focusable and selectable via Space/Enter
- [ ] The map region has aria-label "Trip map view"
- [ ] The footer count uses `role="status"` + `aria-live="polite"` — screen reader announces the count when it updates
- [ ] Focus is visible on day chips when tabbed to (no invisible focus rings)

---

## 10. Regression Sweep

- [ ] Itinerary tab behavior (stops, drag-reorder, banners, connectors) unchanged from V1
- [ ] Spending tab behavior unchanged
- [ ] Notes tab behavior unchanged
- [ ] Trip edit modal still saves correctly (the new Photos URL field is additive)
- [ ] Trip deletion still works
- [ ] Creating a new trip via the `/trips` list works; new trips have `photoAlbumUrl: null` by default

---

## 11. Diverse Trip Shapes — Staging/Production data

Run the above checklist against at least the following trip shapes (sync prod data via `AWS_PROFILE=budget-app-prod npm run sync:production` or use test data):

- [ ] **Single-base week** (1 Stay, several verified Eat/Play pins, no transits) — pins cluster, no lines
- [ ] **Multi-city Europe trip** (3+ Stays, flight + train transits between them, mixed Eat/Play) — lines connect Stay chapters; flight arc visible on long haul; day filter reveals daily clusters
- [ ] **Day-trip-heavy weekend** (1 Stay, many same-day transits in-and-out) — no base-change lines render; pins only
- [ ] **Transit-only trip** (no verified stops) — Map tab hidden

---

**Sign-off:** Tester name, date, pass/fail summary → append to bottom of this file after execution.
