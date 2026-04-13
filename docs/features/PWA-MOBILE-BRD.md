# Progressive Web App (PWA) & Mobile Experience — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-13
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

The budgeting app is a responsive web application, but on Android it requires opening a browser, navigating to the URL, and interacting through a browser tab. This creates friction for a tool that users check daily. There is no home screen presence, no push notifications for time-sensitive events (bill reminders, sync failures, budget alerts), and no native camera integration for capturing receipts or documents on the go.

### 1.2 Solution Summary

Convert the existing React + Mantine web application into a Progressive Web App (PWA) that can be installed on Android home screens and accessed like a native app. Phase 1 delivers installability, camera capture, and push notifications. Phase 2 adds biometric login via a native wrapper (Capacitor) for users who want fingerprint/face unlock.

### 1.3 Users

Both household users, primarily on Android devices. Desktop PWA installation is a free bonus but not a design driver.

### 1.4 Why PWA First

| Factor | PWA | Native App (Play Store) |
|--------|-----|------------------------|
| **Development effort** | Minimal — enhances existing web app | Significant — new build toolchain, store listing |
| **Distribution** | Direct install from browser | $25 fee, review process, ongoing SDK compliance |
| **Updates** | Instant on deploy | Store review cycle |
| **Discoverability** | Not needed — 2 known users | Overkill |
| **Camera access** | Web API sufficient for photo capture | Full native API |
| **Push notifications** | Supported on Android | Supported |
| **Biometric auth** | Not available | Available via Capacitor |

PWA covers all Phase 1 requirements with zero app store overhead. Capacitor can wrap the same PWA later for Phase 2 biometric support without rewriting anything.

---

## 2. Phasing

### Phase 1 — PWA: Install, Capture, Notify

The app becomes installable on Android home screens with full-screen experience, camera capture for receipt/document photos, and push notifications for budget and account events.

### Phase 2 — Biometric Login

Add fingerprint/face unlock as an alternative to passphrase entry. Requires a Capacitor native wrapper around the existing PWA to access device biometric APIs.

**The remainder of this BRD covers Phase 1. Phase 2 scope will be defined in a separate document when the time comes.**

---

## 3. Functional Requirements — Installability

### 3.1 Web App Manifest

| # | Requirement |
|---|-------------|
| REQ-001 | The app must include a valid web app manifest (`manifest.json`) with app name, short name, description, start URL, display mode, theme color, and background color. |
| REQ-002 | The manifest must specify `"display": "standalone"` so the installed app runs without browser chrome (no address bar, no tabs). |
| REQ-003 | The manifest must include icons at all required sizes for Android home screen, splash screen, and task switcher (minimum: 192x192 and 512x512, both maskable and any-purpose). |
| REQ-004 | The app must serve a valid service worker that satisfies Chrome's PWA installability criteria. |
| REQ-005 | The app must be served over HTTPS (already satisfied — `budget.jaredcarrano.com`). |

### 3.2 Install Experience

| # | Requirement |
|---|-------------|
| REQ-006 | The browser must trigger the native "Add to Home Screen" prompt when installability criteria are met. The app must not suppress this prompt. |
| REQ-007 | The app should display a subtle, dismissible install banner for users who haven't installed yet (detected via `display-mode: standalone` media query). The banner must not reappear after dismissal within the same session. |
| REQ-008 | Once installed, the app must launch in standalone mode with the app's theme color in the Android status bar. |

### 3.3 Offline Behavior

| # | Requirement |
|---|-------------|
| REQ-009 | The service worker must cache the app shell (HTML, CSS, JS, fonts, icons) so the app launches instantly even on slow or intermittent connections. |
| REQ-010 | When the device is offline, the app must display a clear offline indicator rather than a browser error page. Previously loaded data may be displayed as read-only. |
| REQ-011 | The app does not need to support offline data entry or queued mutations in Phase 1. Attempting actions that require network connectivity must show a clear message: "You're offline — connect to the internet to continue." |

### 3.4 Updates

| # | Requirement |
|---|-------------|
| REQ-012 | When a new version of the app is deployed, the service worker must detect the update and prompt the user to refresh. The prompt must not be intrusive — a dismissible toast or banner is appropriate. |
| REQ-013 | The app must not silently update mid-session in a way that could cause data loss or UI inconsistency. The user must trigger the refresh. |

---

## 4. Functional Requirements — Camera Capture

### 4.1 Photo Capture

| # | Requirement |
|---|-------------|
| REQ-014 | The app must allow users to capture photos using the device camera from within the app, without leaving the app or opening a separate camera application. |
| REQ-015 | Camera capture must use the rear (environment-facing) camera by default. |
| REQ-016 | Captured images must be usable anywhere the app currently accepts file uploads — specifically the Amazon Receipt Matching flow (PDF upload) and any future document upload features. |
| REQ-017 | The capture UI must support both taking a new photo and selecting an existing image from the device gallery. |
| REQ-018 | Captured images must be resized/compressed before upload to stay within reasonable file size limits (target: under 5MB per image). Original resolution is not needed for receipt/document processing. |

### 4.2 Integration with Existing Features

| # | Requirement |
|---|-------------|
| REQ-019 | The Amazon Receipt Matching upload flow must accept image files (JPEG, PNG) in addition to PDFs. When an image is uploaded, the backend must process it using Claude's vision capabilities the same way it processes PDF pages. |
| REQ-020 | The file upload UI on the Transactions page must indicate that both photos and PDFs are accepted (e.g., "Upload receipt photo or PDF"). |
| REQ-021 | Multiple photos may be uploaded in a single session to cover multi-page receipts or multiple orders. |

---

## 5. Functional Requirements — Push Notifications

### 5.1 Notification Infrastructure

| # | Requirement |
|---|-------------|
| REQ-022 | The app must request push notification permission from the user. The request must be contextual (triggered by a user action, not on first page load) and must explain what notifications will be used for. |
| REQ-023 | The backend must be able to send push notifications to registered devices via the Web Push API (VAPID protocol). |
| REQ-024 | Push notification subscriptions must be stored per-user and support multiple devices per user. |
| REQ-025 | Users must be able to manage their notification preferences (enable/disable by category) from a settings page within the app. |
| REQ-026 | Notifications must work when the app is not open (background notifications via service worker). |

### 5.2 Notification Types

| # | Requirement |
|---|-------------|
| REQ-027 | **Sync failures** — Notify the user when a bank account sync fails or when an account requires re-authentication. |
| REQ-028 | **Budget alerts** — Notify the user when spending in a category reaches a configurable threshold (e.g., 80%, 100%) of the monthly budget. |
| REQ-029 | **Bill reminders** — When bill reminders are implemented (see roadmap in CLAUDE.md), push notifications must be a delivery channel. This requirement establishes the notification infrastructure; the bill reminder feature itself is out of scope for this BRD. |
| REQ-030 | **Large transactions** — Optionally notify the user when a transaction above a configurable amount threshold is synced (e.g., any transaction over $500). |

### 5.3 Notification Behavior

| # | Requirement |
|---|-------------|
| REQ-031 | Tapping a notification must open the app to a relevant page (e.g., budget alert opens the Budget page for that category and month; sync failure opens the Accounts page). |
| REQ-032 | Notifications must include the app icon and be visually identifiable as coming from the budgeting app. |
| REQ-033 | The system must not send duplicate notifications for the same event (e.g., multiple budget threshold alerts for the same category in the same day). |
| REQ-034 | Notifications must respect quiet hours if the user configures them (stretch goal — not required for initial launch). |

---

## 6. Security Requirements

| # | Requirement |
|---|-------------|
| SEC-001 | Push notification subscriptions must be tied to authenticated users. Unauthenticated requests to register or send notifications must be rejected. |
| SEC-002 | VAPID keys must be stored as environment variables, not committed to the repository. |
| SEC-003 | Push notification payloads must not contain sensitive financial data (account numbers, balances, transaction amounts). Notifications should contain actionable summaries only (e.g., "Grocery spending is at 85% of budget" not "You spent $847.32 on groceries at Whole Foods"). |
| SEC-004 | Camera-captured images must follow the same security handling as PDF uploads — processed in memory, not persisted to disk after processing, no sensitive content logged (consistent with SEC-001 and SEC-006 from the Amazon Receipt BRD). |
| SEC-005 | The service worker cache must not store sensitive financial data. Only static app shell assets (HTML, CSS, JS, images, fonts) may be cached. API responses must not be cached by the service worker. |
| SEC-006 | Notification preference endpoints must be scoped to the authenticated user — a user must not be able to modify another user's notification settings. |

---

## 7. Assumptions

| # | Assumption |
|---|------------|
| A-1 | Both users are on Android. iOS PWA support is limited (no push notifications until iOS 16.4+, no install prompt) and is not a design driver. If an iOS user installs the PWA, degraded functionality is acceptable. |
| A-2 | The Web Push API (VAPID) is sufficient for notification delivery. No third-party push service (Firebase, OneSignal) is needed for 2 users. |
| A-3 | The existing `budget.jaredcarrano.com` HTTPS setup satisfies all PWA requirements. No infrastructure changes are needed for installability. |
| A-4 | Camera capture via `<input type="file" accept="image/*" capture="environment">` or the MediaDevices API provides sufficient quality for receipt processing. A custom camera UI is not needed. |
| A-5 | Claude's vision API handles JPEG/PNG images as well as it handles PDFs for receipt extraction. No quality degradation is expected. |
| A-6 | The Vite build toolchain supports PWA plugin integration without significant configuration changes. |
| A-7 | Capacitor can wrap the PWA in Phase 2 without requiring changes to the Phase 1 PWA implementation. Phase 1 decisions should not block Phase 2. |

---

## 8. Out of Scope

| Item | Rationale |
|------|-----------|
| iOS-specific PWA optimizations | Both users are on Android; iOS PWA limitations are accepted |
| Offline data entry / queued mutations | Adds significant complexity (conflict resolution, sync queue). Not needed for 2 users with reliable connectivity |
| App store listing (Google Play) | No discovery benefit for 2 users; adds cost and maintenance overhead |
| Biometric authentication | Phase 2 — requires Capacitor native wrapper |
| Background sync of transactions | Requires persistent background service; deferred to future enhancement |
| Notification scheduling / digest mode | V1 sends notifications in real-time as events occur |
| Custom camera UI with viewfinder overlay | Browser's native camera UI is sufficient for photo capture |
| Desktop PWA-specific features | Desktop install works automatically but is not optimized for |

---

## 9. Prerequisites

| # | Prerequisite | Dependency |
|---|-------------|------------|
| P-1 | HTTPS serving (already satisfied) | REQ-001 through REQ-008 |
| P-2 | VAPID key pair generated and stored as environment variables | REQ-022 through REQ-026 |
| P-3 | Amazon Receipt Matching feature deployed (for camera integration) | REQ-019 through REQ-021 |
| P-4 | Backend capability to trigger notifications on sync/budget events | REQ-027 through REQ-030 |

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | What budget threshold percentages should be the defaults? 80% and 100%? Should they be configurable per-category or global? | Open |
| 2 | Should the large transaction notification threshold be per-account or global? | Open |
| 3 | Should the app show an install tutorial/guide for users unfamiliar with PWA installation on Android? | Open |
| 4 | For camera capture of multi-page receipts, should the app support stitching multiple photos into a single document before sending to Claude, or send them as separate images? | Open |

---

## 11. Success Criteria

- Both users install the app on their Android home screens and use it as their primary access method (not the browser).
- Camera capture of Amazon receipts produces extraction results comparable to PDF uploads (measured by match rate and category accuracy).
- Push notifications are delivered within 60 seconds of the triggering event (sync failure, budget threshold crossed).
- Budget alert notifications reduce the time between overspending and user awareness from "whenever they check the app" to near-real-time.
- The installed app launches in under 3 seconds on a typical Android device, including on slow connections (app shell cached).
- Zero increase in deployment complexity — the same `git push` workflow deploys PWA updates automatically.

---

## 12. Future Considerations

**Phase 2 and beyond:**
- **Biometric login** — Fingerprint/face unlock via Capacitor's `@capacitor/biometrics` plugin. Requires wrapping the PWA in a native shell and distributing via direct APK install (sideload) or Play Store.
- **Background transaction sync** — Periodically sync transactions in the background and notify the user of new activity.
- **Offline mutations** — Queue budget edits and categorizations while offline, sync when connectivity returns.
- **Widget support** — Android home screen widget showing budget summary or recent transactions (requires Capacitor or native development).
- **Generalized document capture** — Extend camera capture beyond Amazon receipts to any receipt or financial document for AI-powered processing.
- **iOS PWA improvements** — If an iOS user joins the household, evaluate iOS PWA push notification support and installability.
