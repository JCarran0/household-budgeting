# Trip Place Photos — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-20
**Version:** 1.0
**Extends:** `docs/features/TRIP-ITINERARIES-BRD.md`, `docs/features/TRIP-ENHANCEMENTS-V2-BRD.md`

---

## Summary

Add small thumbnail images of places (hotels, restaurants, attractions) alongside verified stops in Trip Itineraries. Photos are sourced from the Google Places API — the same provider already backing address verification — captured once at stop-creation time and re-rendered on demand. No photo bytes are stored by the app; only a Google-issued photo resource name plus attribution text.

This is distinct from the `photoAlbumUrl` hyperlink shipped in Enhancements V2, which links to a user-provided album. V2's photo surface is the **trip's** memories; this BRD's surface is **a place's** appearance — an ambient enrichment that reduces list-homogeneity on the Itinerary tab and gives the Map popups a visual anchor.

## Background

V1 Trip Itineraries render Stays and verified Eat/Play stops as icon-and-text cards. At a glance, a hotel, a restaurant, and a museum are visually identical — only the icon color and a label distinguish them. For trips with 15–30 stops, this flattens the agenda into a uniform stream.

The Google Places API (already loaded for autocomplete/verification) exposes place photos through the same `Place` resource. In the v1 REST shape and the equivalent Maps JS `Place` class, each place carries a `photos[]` list where each entry has a stable `name` (resource name like `places/{placeId}/photos/{photoId}`) and an `authorAttributions[]` array. A photo media URL is fetched via a separate endpoint and redirects to a Google CDN image; the URL embeds the API key but is hot-linkable directly in `<img src>`.

Key constraints from the Google terms of service:
- Photo binaries **may not** be cached or re-hosted beyond session scope.
- Photo resource names and attribution text **may** be persisted.
- Attribution must be displayed wherever the photo is shown.

These constraints shape the design: persist pointers, render via direct Google URLs, surface attribution on hover.

## Requirements

### Capture

**REQ-001:** When a user selects a verified place via Google Places Autocomplete (Stay, Eat, or Play location), the app fetches the place's first available photo resource name and the display name of its first author attribution in the same details round-trip used today for `name`, `formatted_address`, and `geometry`.

**REQ-002:** If the fetch fails (network, quota, API error), the stop is still created successfully. Photo fields remain unset. No user-facing error is surfaced.

**REQ-003:** If the selected place has no photos, photo fields remain unset. This is a common and expected case for non-commercial addresses.

**REQ-004:** Free-text locations (no verified `placeId`) are excluded from photo capture.

**REQ-005:** Photo fields live on `VerifiedLocation` — not on the `Stop` itself — because a location is the natural owner of its representative image, and the same location shape is reused across Stay, Eat, Play, and Transit endpoints.

**REQ-006:** The fetched photo is the first entry in the Places API `photos[]` response (index 0). No photo selection UI is provided.

### Schema

**REQ-007:** `VerifiedLocation` in `shared/types/index.ts` gains two optional string fields:
- `photoName` — the Places API photo resource name (e.g., `places/ChIJ.../photos/ATJ...`).
- `photoAttribution` — the display name of the first author attribution, pre-formatted for display (no "Photo:" prefix; the render layer adds that).

Both fields are optional to preserve backwards compatibility with existing stops. Backend stores them as opaque JSON; no service, route, or database migration is required.

### Render — Stay Banner

**REQ-008:** On the Trip Itinerary agenda, the Stay banner displays a 48px square thumbnail at the leading edge when the stay's location carries a `photoName`. The thumbnail replaces the existing `IconBed` icon.

**REQ-009:** When no `photoName` is present, or the API key is unavailable at render time, the existing `IconBed` renders unchanged.

**REQ-010:** The thumbnail carries a hover tooltip with the text `Photo: {attribution}` when `photoAttribution` is present, or `Photo via Google` otherwise. This satisfies the Google Places attribution display requirement.

**REQ-011:** The thumbnail image URL is constructed client-side as `https://places.googleapis.com/v1/{photoName}/media?maxWidthPx={size * 2}&key={VITE_GOOGLE_PLACES_API_KEY}`. The API key is already referrer-restricted to `budget.jaredcarrano.com` and `localhost:5183`.

### Render — AddStopSheet Preview

**REQ-012:** The Stay form (and only the Stay form in this release — see Out of Scope for Eat/Play) shows a 96px square preview below the LocationInput when the currently-selected location has a `photoName`. The preview provides "this is what will appear on the banner" confirmation before save. No separate API call; the preview uses the photo name already captured at selection time.

**REQ-013:** The preview is hidden when the location is cleared, unverified, or carries no photo.

### Render — Full-size Modal ("Hero")

**REQ-016:** The thumbnail (both the Stay banner thumbnail and the Stay form preview — and, in PR 2, any other `PlacePhotoThumb` surface) is clickable. A click opens a Mantine `Modal` rendering the same photo at a larger size. This is an ambient affordance — the hover tooltip hints at interactivity, and the click payoff is "see this photo bigger."

**REQ-017:** The modal image is fetched from the same `places.googleapis.com/v1/{photoName}/media` endpoint with `maxWidthPx=1600`. This produces a crisp image on laptop/desktop viewports without over-fetching on mobile. No separate schema, no pre-fetch; the request fires on modal open.

**REQ-018:** Attribution renders as an always-visible caption inside the modal — positioned below (or bottom-right overlay on) the image. Modal real estate is generous, and always-visible attribution inside the modal is the strictest interpretation of Google's display policy, preemptively satisfying any policy tightening. The hover tooltip on the thumbnail itself is retained (REQ-010).

**REQ-019:** The modal dismisses via ESC, click-outside, or close button (Mantine defaults). Modal size is `xl` with a `contain`-fit image capped at `80vh`, so the photo scales with the viewport.

### Backwards compatibility

**REQ-014:** Stops created before this feature ships continue to render with icon-only visuals. No backfill is performed.

**REQ-015:** Users who wish to add a photo to a pre-existing Stay may open the stay for edit, clear the location, and re-select the same address. The next save captures the photo. This behavior is documented in the release note but not surfaced in-product.

---

## Assumptions

- **A-01:** `VITE_GOOGLE_PLACES_API_KEY` carries HTTP referrer restrictions in GCP limiting use to `budget.jaredcarrano.com` and `localhost:5183`. Without this restriction, bundled keys can be extracted and abused; referrer restriction is an explicit prerequisite for this feature.

- **A-02:** The Maps JS Places library exposes a `Place` class with a `fetchFields` method returning `photos[].name` as a persistable string. If a version upgrade is required to access this, it's within scope.

- **A-03:** One extra `photos`-field fetch at stop-creation time costs ~$0.007 per stop. At 2-user family scale (~10 stops/month), incremental cost is negligible (<$1/year).

- **A-04:** Google's photo CDN URLs do not require authenticated fetches — a plain `<img src="...">` resolves the redirect and renders. No backend proxy is required.

- **A-05:** Photos are not quality-filtered. Some places return charming photos; others return a blurry parking-lot shot. The app accepts whatever Google returns; a "regenerate" or "pick another" UI is not in scope.

- **A-06:** Attribution is satisfied by a hover tooltip. Google's policy accepts in-app attribution proximate to the photo; a tooltip on the image meets this bar. If future Google policy requires always-visible attribution, the tooltip pattern converts to a persistent caption with a schema migration.

- **A-07:** The feature ships in two PRs:
  - **PR 1** — schema + capture (Stay/Eat/Play/Transit all capture) + render on Stay banner + Stay form preview.
  - **PR 2** — render on map `StopPopup`, render as avatar on `StopCard` for Eat/Play. Both gated on PR 1's quality outcome in real usage.

- **A-08:** **"Places API (New)" must be enabled in the GCP project** (in addition to the legacy Places API the app already uses for V1 autocomplete/geocoding). The new API backs `AutocompleteSuggestion.fetchAutocompleteSuggestions`, `Place.fetchFields`, and the `places.googleapis.com/v1/{photoName}/media` photo endpoint. Without it, both the typeahead and photo capture return HTTP 403 and the Stay form cannot be submitted. Enable at `https://console.developers.google.com/apis/api/places.googleapis.com/overview?project={projectId}`. No separate key is needed — the existing referrer-restricted key (A-01) carries permission once the API is enabled on the same project.

- **A-09:** **Hero modal opens cost one extra Places Photos fetch each.** Each click triggers a `maxWidthPx=1600` fetch (~$0.007 per photo, same SKU as the thumbnail). Browser HTTP caching reduces repeat-fetch cost within a tab session, but a fresh tab or session re-fetches. At family scale (2 users, occasional opens), monthly incremental cost is negligible (estimated <$0.25/year).

---

## Open Questions

- **Q-01:** Should photo capture happen for **all** verified locations (Stay, Eat, Play, Transit endpoints) in PR 1, or only for Stays (deferring Eat/Play/Transit capture to PR 2)?
  **Proposed default:** Capture everywhere in PR 1. Capture is a single code path (the `handlePredictionSelect` callback in `LocationInput.tsx`); gating it by stop type adds branching for no benefit. Render is scoped to Stay banner in PR 1; Eat/Play/Transit photo fields sit idle until PR 2 uses them. This also means PR 2 has ready data for Eat/Play Stop cards without re-touching saved records.

- **Q-02:** For the Stay banner thumbnail size — 48px, 56px, or 64px?
  **Proposed default:** 48px. Matches the existing vertical rhythm of the banner (stay name + address + "N nights" in two text lines). 64px pushes the banner noticeably taller on mobile. If 48px feels anemic, adjust in a follow-up polish pass; the schema and fetch don't change.

- **Q-03:** If Google returns no attribution (`authorAttributions[]` empty), store `photoAttribution` as `null`/undefined (render "Photo via Google") or store the literal string `"Google"`?
  **Proposed default:** Store `null`/undefined and let the render helper decide the fallback label. Separates data from presentation; easier to evolve the fallback copy later.

- **Q-04:** Should we consider a backend proxy (`GET /api/places/photo?name=...` returning a 302 to Google's CDN) to keep the API key server-side?
  **Proposed default:** No, for this release. The key is already referrer-restricted (A-01) and surfaces photo URLs client-side is standard for the Places API. A proxy adds a 30-line endpoint and rate-limit surface for no net security gain under the referrer restriction. Revisit only if a key compromise audit reveals a bypass.

- **Q-05:** Should the release note explain the "re-select address to backfill photo" pathway, or omit it to avoid encouraging editing of historical data?
  **Proposed default:** Include it, one-sentence: "Existing stays get photos when you edit the address and re-confirm it." Brief, discoverable, not pushy.

---

## Out of Scope

| Item | Rationale |
|------|-----------|
| **Eat/Play stop card thumbnails on the Itinerary tab** | PR 2 after we've seen real photo quality on Stays. If thumbnails on 1-line Eat/Play cards feel cluttered, PR 2 may ship only the map popup treatment. |
| **Map popup place photo** | Deferred to PR 2 pending PR 1 validation. Data captured in PR 1 makes PR 2 a pure render change. |
| **Transit endpoint photos** | Transit stops represent motion, not destinations. The bracketing Stays already carry photos; duplicating on transit cards clutters without adding signal. |
| **Photo carousel / swiping to alternate photos** | Google Places returns up to 10 photos per place; exposing a selector is a richer UI than this release justifies. Always-first-photo is a deliberate simplification. |
| **"Regenerate photo" / "choose a different photo" action** | Same. Users bothered by a specific photo can re-select the location to re-capture, which sometimes yields a different index-0 photo after Google refreshes its corpus. |
| **Backfilling photos for existing stops** | Explicit non-goal. Would require a background job iterating all stops with verified locations and issuing fetchFields calls — moderate cost and no user-initiated trigger. Re-selection (REQ-015) is the sufficient pathway. |
| **User-uploaded photos overriding Google's photo** | Cross-cuts with storage, moderation, and photo-rights concerns that dwarf this release's scope. |
| **Attribution as always-visible caption** | Tooltip-on-hover satisfies current Google policy (A-06). Always-visible caption adds visual weight to every thumbnail and would compete with the stop's name. Reconsider if policy changes. |
| **Photo thumbnails in the Trip list view (`/trips`)** | Out of scope; the list view is stops-free by design. A trip-level cover photo is a separate feature. |
| **Server-side photo caching / proxy** | See Q-04. Not justified at current scale. |
| **Offline photo viewing** | No offline story for the app generally; photos follow. |
| **Photo export with trip share/PDF** | Not a requested feature; the app has no trip-export surface today. |
