# Passwordless Login & Email Notifications — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-11
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

The app currently uses username/passphrase authentication with a minimum 15-character passphrase. While secure, this creates friction — especially on mobile — and the password reset flow relies on server-side token generation with no delivery mechanism (the reset token appears in server logs). There is also no way to notify users about important events: budget thresholds exceeded, bank connections needing re-authentication, bill reminders, or unusual transactions.

### 1.2 Solution Summary

Introduce two related capabilities in phases:

1. **Passwordless login via email OTP** — Users can log in by receiving a one-time code at their verified email address, as an alternative to passphrase login.
2. **Email notifications** — Leveraging the same verified email addresses and delivery infrastructure, send users actionable notifications about their financial data.

These features share infrastructure (email delivery, verified contact storage) and a prerequisite (collecting and verifying user email addresses), so they are scoped together.

### 1.3 Users

Both household users. Each user must have their own verified email address.

---

## 2. Phasing

### Phase 1 — Email Collection & OTP Login

Add email addresses to user profiles, verify them via OTP, and offer OTP as an alternative login method alongside the existing passphrase.

### Phase 2 — Email Notifications

Using verified email addresses from Phase 1, send transactional email notifications for financial events. User-configurable notification preferences.

### Phase 3 — SMS (Future, Optional)

Add phone number as an alternative OTP channel and notification delivery method. Deferred because email covers the core need at zero per-message cost.

**The remainder of this BRD covers Phases 1 and 2.**

---

## 3. Security Requirements

### 3.1 OTP Security

| # | Requirement |
|---|-------------|
| SEC-001 | OTP codes must be cryptographically random, 6 digits, and expire after **5 minutes**. |
| SEC-002 | OTP codes must be single-use. Once verified (successfully or expired), they must be deleted. |
| SEC-003 | A maximum of **5 OTP verification attempts** per code. After 5 failures, the code is invalidated and the user must request a new one. |
| SEC-004 | OTP request rate limiting: maximum **1 OTP per email address per 60 seconds**, and **5 OTPs per email address per 15 minutes**. |
| SEC-005 | OTP codes must be stored hashed (bcrypt or HMAC-SHA256), not in plaintext, in case of storage compromise. |
| SEC-006 | The OTP request endpoint must not reveal whether an email address is registered. Always return a generic success message. |
| SEC-007 | Failed OTP attempts must be logged as security events using the existing `logSecurityEvent` pattern. |

### 3.2 Email Verification

| # | Requirement |
|---|-------------|
| SEC-008 | Users must verify their email address via OTP before it can be used for login or notifications. An unverified email must not receive any communications other than the verification code itself. |
| SEC-009 | Changing an email address must require re-verification. The old email remains active until the new one is verified. |
| SEC-010 | Email addresses must be stored with a `verified` boolean and `verifiedAt` timestamp. |

### 3.3 Authentication Integrity

| # | Requirement |
|---|-------------|
| SEC-011 | OTP login must be an **alternative** to passphrase login, not a replacement. Both methods must remain available. Users who prefer passphrases must not be forced to add an email. |
| SEC-012 | After successful OTP verification, the system issues the same JWT token as passphrase login. No separate session mechanism. |
| SEC-013 | The existing account lockout mechanism (5 failed attempts → 15-minute lockout) must also apply to OTP login attempts, tracked per email address. |
| SEC-014 | OTP login must be gated behind the existing `rateLimitAuth` middleware. |

### 3.4 Email Delivery Security

| # | Requirement |
|---|-------------|
| SEC-015 | Email must be sent via AWS SES with a verified sender domain (e.g., `noreply@budget.jaredcarrano.com`). |
| SEC-016 | SES credentials must use the existing AWS IAM role / profile pattern — no separate API keys. The IAM policy must scope SES permissions to `ses:SendEmail` and `ses:SendRawEmail` only. |
| SEC-017 | Email content must not include sensitive financial data (account numbers, balances, transaction details). Notifications should be actionable summaries that link back to the app. |
| SEC-018 | All outbound emails must include unsubscribe headers (RFC 8058) and the notification preferences link. |

### 3.5 Notification Security

| # | Requirement |
|---|-------------|
| SEC-019 | Notification emails must never contain inline links that auto-authenticate. Users must log in through the normal flow after clicking a notification link. |
| SEC-020 | The notification service must not have access to PlaidService, encryption keys, or write operations on financial data. It receives pre-computed, sanitized notification payloads. |

---

## 4. Functional Requirements — Email & OTP Login (Phase 1)

### 4.1 Email Collection

| # | Requirement |
|---|-------------|
| REQ-001 | The Settings page must include an "Email Address" field where users can add or update their email. |
| REQ-002 | After entering an email, the system sends a 6-digit verification code to that address. The UI transitions to a code entry screen. |
| REQ-003 | After successful verification, the email is marked as verified and associated with the user's account. |
| REQ-004 | The registration flow may optionally prompt for email but must not require it. Email can always be added later via Settings. |

### 4.2 OTP Login Flow

| # | Requirement |
|---|-------------|
| REQ-005 | The login page must offer two tabs or modes: "Password" (default, existing) and "Email Code" (new). Password tab is shown first. |
| REQ-006 | In Email Code mode, the user enters their email address and clicks "Send Code." |
| REQ-007 | The system sends a 6-digit OTP to the email address if it belongs to a verified user. The UI transitions to a code entry input. |
| REQ-008 | The user enters the 6-digit code. On success, they receive a JWT and are redirected to the dashboard (same as passphrase login). |
| REQ-009 | The code entry UI must show: remaining time until expiration, a "Resend code" link (respecting rate limits), and a "Back" link to return to email entry. |
| REQ-010 | If the OTP expires or is exhausted, the UI must clearly indicate this and offer to send a new code. |

### 4.3 Password Reset Improvement

| # | Requirement |
|---|-------------|
| REQ-011 | With email verification in place, the password reset flow must send the reset token to the user's verified email instead of logging it to the server console. |
| REQ-012 | If the user has no verified email, the existing server-log reset flow remains as a fallback. |

### 4.4 User Model Changes

| # | Requirement |
|---|-------------|
| REQ-013 | The `User` interface must be extended with: `email?: string`, `emailVerified: boolean`, `emailVerifiedAt?: string`. |
| REQ-014 | Email addresses must be unique across all users. Two users cannot share the same verified email. |
| REQ-015 | A lookup method `getUserByEmail(email: string)` must be added to `DataService`. |

---

## 5. Functional Requirements — Email Notifications (Phase 2)

### 5.1 Notification Types

| # | Requirement | Trigger | Content |
|---|-------------|---------|---------|
| REQ-016 | **Budget threshold alert** | Spending in a category reaches 80% or 100% of budget | Category name, % used, remaining amount |
| REQ-017 | **Account re-auth needed** | Plaid item enters `requires_reauth` state | Account/institution name, link to app |
| REQ-018 | **Large transaction alert** | Transaction exceeds user-configured threshold (default: $500) | Transaction date, merchant name (no amounts in email — "a large transaction was detected") |
| REQ-019 | **Weekly spending summary** | Scheduled: Monday 8am ET (PM2 cron) | Total spent this week vs. last week, top categories, link to app |
| REQ-020 | **Sync failure alert** | Transaction sync fails for 24+ hours | Account name, last successful sync date |

### 5.2 Notification Preferences

| # | Requirement |
|---|-------------|
| REQ-021 | The Settings page must include a "Notifications" section where users can toggle each notification type on/off. |
| REQ-022 | Default state for new users: all notifications **off** (opt-in model). |
| REQ-023 | Users without a verified email must see the notification toggles as disabled with a prompt to add their email. |
| REQ-024 | Notification preferences must be stored per-user, not per-family. Each family member controls their own notifications. |
| REQ-024a | A "Send test notification" button must appear in Settings after email is verified. It sends a test email to confirm SES delivery works end-to-end. |

### 5.3 Notification Service

| # | Requirement |
|---|-------------|
| REQ-025 | A `NotificationService` must evaluate notification triggers after relevant operations (transaction sync, budget updates) and queue emails for delivery. |
| REQ-026 | Notifications must be deduplicated — e.g., a budget threshold alert for "Dining Out at 80%" sends once per month, not on every transaction that keeps it above 80%. |
| REQ-027 | The weekly summary must be generated via a scheduled task (cron or PM2 cron). |
| REQ-028 | All sent notifications must be logged (type, recipient, timestamp) for debugging. Email content itself is not stored. |

### 5.4 Email Templates

| # | Requirement |
|---|-------------|
| REQ-029 | Emails must be simple, responsive HTML with a plain-text fallback. No heavy frameworks — a lightweight template system or string interpolation. |
| REQ-030 | All emails must include: app name/logo, notification content, link to relevant app page, unsubscribe/preferences link, and a footer stating "This is an automated notification from your household budgeting app." |
| REQ-031 | Email "from" name must be the app name (e.g., "Household Budget"), not a personal name. |

---

## 6. API Design

### 6.1 New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/email/verify-request` | Authenticated | Send verification OTP to the provided email |
| POST | `/api/v1/auth/email/verify-confirm` | Authenticated | Confirm email with OTP code |
| POST | `/api/v1/auth/otp/request` | Public | Send login OTP to a verified email |
| POST | `/api/v1/auth/otp/login` | Public | Verify OTP and return JWT |
| GET | `/api/v1/user/notification-preferences` | Authenticated | Get notification settings |
| PUT | `/api/v1/user/notification-preferences` | Authenticated | Update notification settings |

### 6.2 Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/v1/auth/register` | Optional `email` field in body |
| `PUT /api/v1/auth/profile` | Add `email` field (triggers re-verification) |
| `POST /api/v1/auth/request-reset` | If user has verified email, send reset token via email instead of logging to console |

---

## 7. Infrastructure Requirements

All AWS resources are Terraform-managed (`terraform/`). SES infrastructure must follow the same pattern.

### 7.1 AWS SES Setup (Terraform-Managed)

| # | Requirement | Terraform Resource |
|---|-------------|-------------------|
| INFRA-001 | Verify sender domain `budget.jaredcarrano.com` in AWS SES. | `aws_ses_domain_identity` |
| INFRA-002 | Generate DKIM tokens for the domain. | `aws_ses_domain_dkim` |
| INFRA-003 | Stay in SES sandbox — verify both recipient email addresses manually. Production access is unnecessary for 2 known users and avoids the AWS support request + bounce/complaint monitoring overhead. | N/A (console or CLI) |
| INFRA-004 | Add `ses:SendEmail` and `ses:SendRawEmail` to the existing EC2 IAM role (`budget-app-ec2-s3-role`). | New policy statement in `main.tf` or new `ses.tf` |

### 7.2 DNS Records (Manual — at Domain Registrar)

DNS is managed outside Terraform (no Route53). These are one-time manual additions:

| Record | Type | Value |
|--------|------|-------|
| 3x DKIM tokens | CNAME | Generated by `aws_ses_domain_dkim` — Terraform outputs these |
| `_dmarc.budget.jaredcarrano.com` | TXT | `v=DMARC1; p=quarantine;` |
| `budget.jaredcarrano.com` | TXT | `v=spf1 include:amazonses.com ~all` (append to existing TXT record if one exists) |

### 7.3 Environment Variables

| Variable | Description | Where |
|----------|-------------|-------|
| `SES_SENDER_EMAIL` | Verified sender address (e.g., `noreply@budget.jaredcarrano.com`) | `.env`, GitHub Actions secrets |
| `SES_REGION` | AWS region for SES (default: `us-east-1`, same as EC2) | `.env`, GitHub Actions secrets |
| `OTP_EXPIRY_SECONDS` | OTP lifetime (default: 300) | `.env` |
| `NOTIFICATION_LARGE_TXN_THRESHOLD` | Dollar amount for large transaction alerts (default: 500) | `.env` |

No new AWS access keys needed — the EC2 instance role provides SES credentials automatically via the SDK credential chain.

### 7.4 Backend Dependency

`@aws-sdk/client-ses` — the SDK core (`@aws-sdk/credential-provider-*`, `@smithy/*`) is already in the dependency tree via `@aws-sdk/client-s3`.

---

## 8. Assumptions

| # | Assumption |
|---|------------|
| A-1 | AWS SES is the email provider. The app already runs on AWS, so SES is the natural fit and avoids a new vendor. |
| A-2 | OTP codes are 6 digits. This balances usability (easy to type, especially on mobile) with security (1M possibilities with attempt limits). |
| A-3 | Email is the only OTP channel for Phases 1-2. SMS is deferred to Phase 3 due to per-message cost and Twilio/SNS setup overhead — both unnecessary for 2 users who check email. |
| A-4 | SES free tier (62,000 emails/month from EC2) is more than sufficient. Expected volume: <50 emails/month. |
| A-5 | The existing PM2 process can handle scheduled notification evaluation (weekly summary). A separate worker process is not needed for 2 users. |
| A-6 | Passphrase login remains the primary auth method. OTP is a convenience alternative, not a deprecation path. |

---

## 9. Out of Scope

| Item | Rationale |
|------|-----------|
| SMS / phone OTP | Phase 3 — unnecessary for 2 users who check email |
| Mobile push notifications | Requires mobile app (not yet built) |
| Magic links (email link login) | OTP is simpler, avoids deep-link complexity, works across devices |
| WebAuthn / passkeys | Good future enhancement but significant implementation effort |
| In-app notification center | Phase 2 sends email only; an in-app notification feed is a separate feature |
| Real-time / WebSocket notifications | Email is sufficient for the notification types listed; real-time alerts are a future enhancement |
| Email-based 2FA (OTP as second factor) | OTP replaces the password here, not supplements it. True 2FA would be a separate feature |
| Rich HTML email templates | Simple, functional templates are sufficient for 2 users |

---

## 10. Decisions Log

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| D-1 | Should email be required at registration, or always optional? | **Optional** | Passphrase login remains primary. Users who prefer passphrases shouldn't be forced to add an email. Can always add later via Settings. (SEC-011) |
| D-2 | Should OTP login be the default tab on the login page, or secondary to passphrase? | **Password is default tab** | Passphrase is the established flow. OTP tab is secondary — users who want it will find it, and it avoids confusing users who haven't set up email yet. |
| D-3 | What is the right large transaction threshold default? | **$500, user-configurable** | High enough to avoid noise, low enough to catch meaningful surprises. Per-user configuration via notification preferences. |
| D-4 | Should the weekly summary run on a specific day/time, or be user-configurable? | **Fixed: Monday 8am ET** | Not worth the UI complexity for 2 users. Can be changed in PM2 cron config if needed. |
| D-5 | Should there be a "test notification" button in Settings? | **Yes** | Low-effort to implement, high-value for confirming SES delivery works end-to-end. Shows in Settings after email is verified. |
| D-6 | SES sandbox vs production access? | **Stay in sandbox** | Only 2 known recipients — verify both email addresses in SES sandbox. Avoids AWS support ticket, warm-up period, and bounce/complaint monitoring. Revisit if/when adding more users. |

---

## 11. Prerequisites

| # | Prerequisite | Dependency | How |
|---|-------------|------------|-----|
| P-1 | SES domain identity + DKIM via Terraform | All email functionality | New `ses.tf` with `aws_ses_domain_identity` and `aws_ses_domain_dkim` |
| P-2 | DNS records (SPF, DKIM, DMARC) at domain registrar | P-1 (DKIM tokens come from Terraform output) | Manual one-time addition |
| P-3 | Verify both recipient emails in SES sandbox | OTP delivery, notifications | AWS console or CLI (`aws ses verify-email-identity`) |
| P-4 | SES IAM permissions on EC2 role via Terraform | INFRA-004 | New policy statement in `main.tf` or `ses.tf` |
| P-5 | `@aws-sdk/client-ses` npm package added to backend | Email delivery | `npm install` |
| P-6 | User model extended with email fields | REQ-013 | Code change |

---

## 12. Success Criteria

- Users can add and verify an email address from the Settings page.
- Users can log in via email OTP as an alternative to passphrase, with the same JWT-based session.
- Password reset tokens are delivered via email instead of logged to the server console (for users with verified email).
- OTP security controls (rate limiting, expiration, hashing, attempt limits) pass manual security review.
- Budget threshold and account re-auth notifications are delivered within 5 minutes of the triggering event.
- Weekly spending summaries arrive consistently on the configured schedule.
- Email delivery failures are logged and visible in server logs.
- The entire feature adds <$1/month to infrastructure costs (SES free tier).
