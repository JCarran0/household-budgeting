# Trip Enhancements V2 — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-19
**Version:** 1.0
**Extends:** `docs/features/TRIP-ITINERARIES-BRD.md`

---

## Summary

Add two enrichment surfaces to the Trip Detail view shipped in V1: a **Map tab** that renders Stays and verified Eat/Play stops spatially with base-change transit lines, and a lightweight **photos album link** field on the Trip that surfaces a user-supplied Google Photos (or other provider) album URL as a button in the Trip Detail header.

Neither surface changes the Trip or Stop data model beyond additive fields. No photo content is fetched, parsed, or stored by the app in V2.

## Background

V1 (TRIP-ITINERARIES-BRD) explicitly deferred Map view to V2 with the note "Data model supports auto-derivation from Stays + Transit." The data model investment has been paid; this BRD defines the UX.

Photo integration was not scoped in V1. Investigation into the Google Photos APIs surfaced a significant constraint: the Library API scopes that previously allowed third-party apps to browse a user's albums were permanently removed on March 31, 2025 (`photoslibrary.readonly`, `photoslibrary.sharing`, and `photoslibrary` all return 403 PERMISSION_DENIED). The replacement — the Picker API — does not expose EXIF or location metadata. Consequently, "automatically render geo-tagged photos on the map next to matching stops" is **not achievable via any Google Photos API** and would require a native-upload path with client-side EXIF parsing, which is out of scope for V2.

V2 therefore ships the smallest useful photo surface: a link to the user's externally-hosted album. Richer integrations (Picker-curated highlights, native upload with geo-match) are explicitly deferred.

## Requirements

### Photos — Album Link

**REQ-001:** The Trip entity gains an optional string field, provisionally named `photoAlbumUrl` (generic to support non-Google providers; see Q-04).

**REQ-002:** The field is editable via the existing Trip edit form. No server-side validation of domain or reachability. Client-side validation limited to "is a well-formed `http(s)` URL."

**REQ-003:** When set, the Trip Detail view header displays an "Open album" button that opens the URL in a new tab.

**REQ-004:** When unset, no button is rendered and no placeholder CTA appears.

**REQ-005:** No album content is fetched, parsed, previewed, thumbnailed, or stored by the app. The field is strictly a hyperlink.

**REQ-006:** The album link has no relationship to Stops. No geo-matching, no per-stop photo association.

### Map — Tab Placement & Visibility

**REQ-007:** The Trip Detail view gains a fourth tab: **Map**. Tab order is pending (see Q-01); proposed default is `Itinerary / Map / Spending / Notes`.

**REQ-008:** The Map tab is visible only when the trip contains at least one stop with verified coordinates. For trips with only free-text Eat/Play stops and no Stays, the tab is hidden.

**REQ-009:** On Map tab open, the map auto-fits its bounds to include all rendered pins and all base-change transit endpoints.

### Map — Pins

**REQ-010:** Every Stay is pinned using its verified-address coordinates (guaranteed to exist per V1 REQ-009).

**REQ-011:** An Eat or Play stop is pinned only when its location is a verified address. Stops with free-text locations are silently omitted from the map and remain visible in the agenda.

**REQ-012:** Transit endpoints are **not** rendered as separate pins. A Transit's spatial presence on the map is its connector line (REQ-016) and its neighboring stops' pins.

**REQ-013:** Pin iconography visually distinguishes stop type (Stay / Eat / Play) at a glance.

**REQ-014:** Pins carry day affinity — visually encoded via color and/or a small day-number badge (see Q-02).

**REQ-015:** When one or more stops have free-text (unpinned) locations, a footer on the map displays a count (e.g., "3 stops without map locations"). No prompt to add coordinates is displayed in V2.

### Map — Transit Lines

**REQ-016:** Base-change transits (a Transit whose date range transitions between two different Stays, per V1 REQ-026) render as connector lines on the map.

**REQ-017:** Day-trip transits (per V1 REQ-027) do **not** render on the map in V2. The renderer accepts "which transits to draw" as a parameter so day-trip rendering can be enabled later without refactor.

**REQ-018:** Transit line style depends on mode:
- **Flight** — geodesic great-circle arc.
- **Drive / Train / Walk / Shuttle / Other** — straight polyline from origin to destination (no turn-by-turn routing).

**REQ-019:** A mode icon (e.g., ✈ 🚂 🚗) appears at the midpoint of each transit line.

**REQ-020:** Direction of travel is visually indicated on each line (arrow, animated dashes, or equivalent).

**REQ-021:** Base-change transit endpoints always resolve: both neighboring Stays are guaranteed coordinates per V1 REQ-009.

### Map — Interactions

**REQ-022:** Tapping a pin opens a popup containing: the type icon, stop name, day label ("Day 3"), time if present, a one-line notes snippet, and a "View in itinerary" action.

**REQ-023:** The "View in itinerary" action navigates the user to the Itinerary tab with the selected stop scrolled into view and briefly highlighted. Implemented via URL param (e.g., `?stop=<stopId>`).

**REQ-024:** A horizontal day-filter chip row appears above the map: `All / Day 1 / Day 2 / …`.

**REQ-025:** Selecting a day chip filters pins and transit lines to that day. Base-change transits spanning two days render on both days when either is the selected filter.

**REQ-026:** When the trip is "live" (today falls within the trip's agenda range), the current day's chip is auto-selected on Map tab open. Otherwise `All` is the default.

**REQ-027:** On narrow viewports, the day chip row is horizontally scrollable.

### Map — Provider & Integration

**REQ-028:** The map is implemented using the Google Maps JavaScript API, consistent with V1's Google Places Autocomplete integration. A React wrapper (e.g., `@vis.gl/react-google-maps` or `react-google-maps/api`) is selected in the plan.

**REQ-029:** The Maps JS library is loaded lazily when the Map tab mounts, not on initial Trip Detail load.

**REQ-030:** Map rendering uses the existing `VITE_GOOGLE_PLACES_API_KEY` (or a paired Maps-JS-enabled key) on the Google Cloud project. No second billing account is introduced.

---

## Assumptions

- **A-01:** Stays always carry verified lat/lng (guaranteed by V1 REQ-009).
- **A-02:** Verified Eat/Play coordinates are already captured in V1 via Google Places Autocomplete and persisted on the Stop.
- **A-03:** 2-user application scale keeps Google Maps JS billing inside the $200/mo free credit by multiple orders of magnitude. Dynamic map loads ($7/1000) are not a cost concern.
- **A-04:** The `photoAlbumUrl` field has no server-side validation of domain, provider, or accessibility. The user pastes a URL; the app links to it.
- **A-05:** V2 fetches no photo data, stores no photo bytes, and performs no OAuth flow against any photo provider.
- **A-06:** All map interactions happen client-side; no new backend endpoints are added for the map view itself. (Backend changes are limited to persisting `photoAlbumUrl` on the Trip entity.)
- **A-07:** V1's agenda-deriving utilities (`groupStopsByDay`, `findActiveStay`, `isTransitBaseChange`) are reused for map day-filtering and transit classification.

## Open Questions

- **Q-01:** Tab order on Trip Detail. Proposed: `Itinerary / Map / Spending / Notes` (narrative → spatial → financial → free-form). Alternative: append Map at the end.
- **Q-02:** Day affinity visual. Proposed: color-by-day with a small numeric badge on each pin. Alternatives: color only, number only, or legend-driven with a single pin color.
- **Q-03:** Should the map provide any nudge toward geocoding stops with free-text locations? Proposed: silent omit with footer count in V2; measure usage before adding nudges.
- **Q-04:** Photo field naming. Proposed: generic `photoAlbumUrl` (forward-compatible with Apple Photos / Dropbox / iCloud sharing URLs). Alternative: provider-specific `googlePhotosAlbumUrl` to match the actual V2 use case verbatim.
- **Q-05:** Stop deep-link URL parameter. Proposed: `?stop=<stopId>` applied uniformly whether the navigation originates from the Map popup or from an external deep link. Trivial and useful.
- **Q-06:** Should the Map tab be suppressed for trips with zero verified coordinates (per REQ-008), or rendered as an empty-state tab with a prompt to add a Stay? Proposed: hide entirely.

## Out of Scope

| Item | Rationale |
|------|-----------|
| **Google Photos Picker API integration** | Picker returns no EXIF/location data; would deliver thumbnails but not geo-matched stop photos. Revisit when native-upload is funded. |
| **Geo-tagged photo matching to stops** | Not achievable via any Google Photos API (Library API scopes removed March 31, 2025; Picker strips EXIF). Requires native-upload + client-side EXIF parsing. Deferred. |
| **Native photo upload / S3 storage of trip photos** | Re-curates what the user already organized in Google Photos. Cost and scope exceed V2. |
| **Album thumbnails / previews in Trip Detail** | Depends on integration types that are unavailable (see above). |
| **Per-stop photo attachment** | Same blocker. |
| **Day-trip transits on the map** | Visual clutter; endpoints already pinned as neighboring Stays/Eat/Play. Renderer is forward-compatible; add later if demand surfaces. |
| **Turn-by-turn routing for ground transits** | Google Directions API cost + complexity; straight segments are an acceptable approximation for a family trip log. |
| **Street View integration on pin popups** | Polish; defer. |
| **Custom map styling / themed basemap** | Google default is acceptable; theming is polish. |
| **Offline maps** | Not a V2 use case. |
| **Shareable map snapshots (PNG export)** | Not requested. |
| **Full-screen map mode** | Polish; revisit if the tab feels cramped in use. |
| **Split-pane Itinerary ↔ Map layout** | Rejected in favor of dedicated tab (see map-placement discussion). Revisit only if usage evidence emerges that hover-linkage is highly valued. |
| **Map view during agenda creation** ("place this stop by clicking the map") | Authoring remains form-driven via Google Places Autocomplete. Map is a read view in V2. |
| **Multi-provider photo URL detection** (Apple Photos, Dropbox, iCloud) | Depends on Q-04 resolution. If field is generic, trivially supported as a URL; if provider-specific, explicitly out. |
| **Email / booking confirmation parsing for auto-populated map pins** | Still deferred (parent V1 BRD out-of-scope item). |
