# Wishlist — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-05-26
**Version:** 1.2 (2026-09-18 — links + notes, REQ-014..017)

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

### 3.7 Security & Scope

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
- **Image attachments.** Links to product pages shipped in v1.1 (REQ-014..016); uploaded images and link previews/thumbnails remain out of scope.
- **Recurring wishlist items.**
