# Wishlist — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-05-26
**Version:** 1.3 (2026-10-06 — photos, REQ-018..024; 1.2 2026-09-18 — links + notes, REQ-014..017)

---

## 1. Summary

A lightweight shared list of planned purchases. Each user can propose an item (name, estimated amount, estimated month, category), and either user can mark it AGREED, REJECTED, or PENDING. Standalone in v1 — no integration with budgets, BvA, or transactions.

## 2. Background

Today, "should we buy X?" conversations happen in text messages and get lost. There's no shared place to park a proposed purchase, agree on it together, and look back at what's coming up. The wishlist is a thin, low-stakes surface for that conversation. It intentionally does *not* try to project against the budget in v1 — the goal is to validate whether the workflow gets used before investing in tighter integration.

## 3. Requirements

### 3.1 Data Model

**REQ-001:** A wishlist item has the following fields:
- `id` — system-generated
- `name` — required, free text, short
- `estimatedAmount` — required, positive number, currency
- `estimatedMonth` — required, stored as `YYYY-MM`
- `categoryId` — required, references an existing spending category
- `status` — required, one of `PENDING` | `AGREED` | `REJECTED`
- `createdBy` — userId of the creator
- `urls` — optional list of reference links (see REQ-014)
- `notes` — optional free-text note (see REQ-017)
- `images` — optional list of attached photos (see REQ-018)
- `createdAt`, `updatedAt` — timestamps

**REQ-002:** `categoryId` must reference a category that is **not** income, **not** savings (`isSavings=false`), and **not** a transfer (per `isBudgetableCategory`). The category picker filters to spending categories only.

**REQ-003:** Newly created items default to `status = PENDING`.

### 3.2 Create / Edit / Delete

**REQ-004:** Any user can create a wishlist item. Required fields per REQ-001 must validate before save.

**REQ-005:** Any user can edit any field (name, amount, month, category, status) on any item — regardless of who created it.

**REQ-006:** Any user can delete any item. Delete is hard delete (no soft-delete state) and requires a confirmation dialog: *"Delete this wishlist item?"*

### 3.3 Status

**REQ-007:** Any user can transition an item to any of `PENDING`, `AGREED`, `REJECTED` at any time, with no workflow restrictions (e.g., REJECTED can be moved back to PENDING).

**REQ-008:** Status changes do not trigger notifications in v1.

### 3.4 Display

**REQ-009:** Wishlist lives on a new top-level page accessible from the main nav.

**REQ-010:** Items past their `estimatedMonth` remain visible in the default list. There is no auto-archive, hide, or "Past" section.

**REQ-011:** Each row displays at minimum: name, estimated amount, estimated month, category, status, and a delete affordance.

### 3.5 Links

**REQ-014:** An item may carry up to **5** reference links (`urls`), each at most 2048 characters. Links are optional; an item with none is normal, not incomplete.

**REQ-015:** Only `http` and `https` URLs may be stored. This is enforced server-side in `wishlistValidators.ts` and re-checked at the render site before a value becomes an `href`. Note that Zod's `z.string().url()` accepts *any* parseable scheme — `javascript:` and `data:` included — so the protocol allowlist is load-bearing, not decorative.

**REQ-016:** On update, `urls` is a **full replacement**, not a merge: omitting the field leaves existing links untouched, and sending `[]` clears them. Links display labelled by hostname (so the destination is visible before the click) and open in a new tab with `rel="noopener noreferrer"`.

### 3.6 Notes

**REQ-017:** An item may carry an optional free-text `notes` value of at most **1000 characters**, matching the cap budgets and project line items already use. Like `urls`, it is a full replacement on update: omitting the field leaves the existing note untouched, and sending `''` clears it. The note renders as a secondary line beneath the item name (truncated, full text on hover) rather than as its own column — free text is the widest thing on a row and an eighth column would squeeze the rest.

### 3.7 Photos

**REQ-018:** An item may carry attached photos as `images: ImageRef[]` (`{ id, mimeType, size, uploadedAt }`). The model is an array sized for a gallery, but **v1 caps it at one** (`WISHLIST_IMAGE_LIMITS.maxCount = 1`), enforced server-side. The UI has no multi-image handling; raising the cap is the only server change a gallery needs. Items stored before the field existed read as `images: []`.

**REQ-019:** Photos are attached and removed only through `POST /wishlist/:id/images` (multipart, field `image`) and `DELETE /wishlist/:id/images/:imageId` — never through the create/update JSON body, which ignores an `images` key. There is no replace operation: the UI offers remove, then add, so a failed upload can never silently cost the existing photo. In the modal, photo changes apply on **Save** (after the item itself is saved) and are discarded on Cancel; if the item saves but the photo does not, that is reported separately and the item is not re-created.

**REQ-020:** Accepted types are JPEG, PNG and WebP, at most **5 MB**, verified by magic bytes rather than the declared Content-Type. SVG is refused (it can carry script).

**REQ-021:** **Embedded metadata is stripped server-side before storage** — JPEG APP1 (EXIF and XMP) / APP13 (IPTC) / COM, PNG `eXIf`/`tEXt`/`zTXt`/`iTXt`, WebP `EXIF`/`XMP ` (with the VP8X flags cleared). The motivation is GPS: a photo taken at home carries the home's coordinates. Stripping copies kept segments byte-for-byte (no re-encode) and **fails closed**: a file whose structure cannot be walked is rejected, not stored as received (`backend/src/utils/imageMetadata.ts`).

**REQ-022:** Before upload the browser resizes to a longest side of 1600px and re-encodes (JPEG q0.85; WebP if the image uses transparency), applying EXIF orientation first. This also strips metadata, but it is a first layer for size and speed — REQ-021 is the guarantee, because an API caller can skip the browser. Consequence: a photo uploaded directly through the API loses its orientation tag and may render rotated.

**REQ-023:** Photos are stored by a generic, owner-agnostic image store (`backend/src/services/imageStore.ts`) at `images/{familyId}/{imageId}` under the data prefix — so bucket versioning, IAM scope and the off-bucket snapshot already cover them. Bytes are served by `GET /api/v1/images/:imageId`, scoped to the caller's family (another household's id is a 404) with `Cache-Control: private, immutable`. The frontend fetches them through the authenticated client into object URLs, because the API's Bearer auth cannot ride on a plain `<img src>`. **When the SPA gets a CSP (SA-27), `img-src` must include `blob:`.** The owner type and id are recorded as object metadata so a future sweep can find orphans.

**REQ-024:** Removing a photo or deleting its item deletes the stored object. The ref is removed first; if the object delete then fails, the result is a logged, findable orphan rather than an item pointing at nothing. Photos are not reachable by the assistant: the image store sits outside `ReadOnlyDataService`. In the list, an item's photo shows as a 40×40 thumbnail beside the name (opening the item); rows without a photo are unchanged.

### 3.8 Security & Scope

**REQ-012:** Wishlist data is family-shared (both users see the same list). It is not per-user private.

**REQ-013:** Wishlist items have no relationship to actual transactions, budgets, or BvA computations. Creating, editing, or deleting an item must have zero side effects on those systems.

## 4. Assumptions

- Currency is the same single currency the rest of the app uses (USD); no per-item currency field.
- `estimatedAmount` is stored as a plain number (same convention as `MonthlyBudget.amount`), not cents.
- "Spending category" is defined as: category is not income, `isSavings === false`, and `isBudgetableCategory(id) === true`.
- Past-month items remain in the list; the user is responsible for deleting or updating the month.
- No audit trail of who flipped status — only the current status is persisted. (Chat-action-style audit log is out of scope.)
- The feature ships behind no flag — both users get it on release.

## 5. Open Questions

- **Default sort order.** Likely `estimatedMonth` ascending, with PENDING grouped above AGREED/REJECTED — but unconfirmed.
- **Filters.** Should the list expose status filter chips (All / Pending / Agreed / Rejected) at launch, or just sort?
- **Nav placement and label.** New top-level page is agreed; exact nav slot and icon TBD in the implementation plan.
- **Empty state copy.** What does the page show when there are zero items?
- **Mobile interactions.** Whether rows get swipe affordances (delete, status change) on mobile, or just a kebab menu — defer to plan.

## 6. Out of Scope (v1)

- **Budget / BvA integration.** AGREED items do not appear in Budget vs. Actuals, do not reduce remaining budget headroom, and do not auto-create budget entries.
- **Linking to actual transactions.** When the purchase is eventually made, the system does not auto-match the transaction to the wishlist item or auto-archive the item.
- **Notifications.** No push, email, or in-app notification when an item is created, edited, or has its status changed.
- **Approval workflow restrictions.** No spouse-only approval, no creator-locked editing, no status state machine.
- **Auto-archive / soft delete / undo.** Past items linger; delete is permanent.
- **Audit history.** No per-item change log.
- **Comments / discussion thread** on an item. (REQ-017 is a single shared free-text note, not a threaded, attributed discussion.)
- **Priority / ranking** beyond default sort.
- **More than one photo per item, a lightbox, and link previews.** One uploaded photo shipped in v1.3 (REQ-018..024); the data model already holds an array.
- **Recurring wishlist items.**
