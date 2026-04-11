# Family & Multi-User Support — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-11
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

The app currently supports a single login shared by two people (Jared and Jecoliah). There is no concept of individual identity — both users share one username, one password, and one session. This creates several problems:

- **No individual accountability** — There's no way to know who made a change (categorized a transaction, adjusted a budget, etc.).
- **No personal credentials** — Both people must know and share the same password. If one person wants to change it, they must coordinate with the other.
- **No individual preferences** — Display settings, theme choices, and any future per-person features are impossible.
- **Security weakness** — A shared credential cannot be rotated independently, and there's no way to revoke access for one person without affecting the other.

### 1.2 Solution Summary

Introduce a **Family** entity that groups multiple **Users** together. All financial data (transactions, budgets, categories, accounts, etc.) belongs to the family, not to any individual user. Each person gets their own login credentials and display name but sees the same complete household data.

### 1.3 Users

- Jared (existing user, currently the sole login)
- Jecoliah (will be added as a new user to the same family)
- Future household members as needed (the model supports N members)

### 1.4 Key Design Principle

**Shared data, individual identity.** Every user in a family sees and can modify all family data. There is no per-user data scoping or permissions within a family. The user's identity is used for authentication and (eventually) audit trails — not for data isolation.

---

## 2. Concepts

### 2.1 Family

A family is the unit of data ownership. Every piece of financial data in the system (transactions, budgets, categories, accounts, rules, projects, trips, etc.) belongs to exactly one family.

| Property | Description |
|----------|-------------|
| **Identity** | Unique identifier for the family |
| **Name** | A human-readable label (e.g., "Carrano Family") set at creation, editable by any member |
| **Members** | One or more users who belong to the family |
| **Data** | All financial entities previously scoped to a "user" are now scoped to this family |

A family is implicitly created when the first user registers. Every user belongs to exactly one family.

### 2.2 User

A user is an individual person who authenticates into the system.

| Property | Description |
|----------|-------------|
| **Identity** | Unique identifier for the person |
| **Username** | Used for login (existing field, unchanged) |
| **Password** | Individual credential (existing field, unchanged) |
| **Display name** | How the person is shown in the UI (new field, separate from username) |
| **Family membership** | The family this user belongs to |

### 2.3 Relationship Model

```
Family (1) ────── (*) User
  │
  └── owns all data:
      Transactions, Accounts, Budgets, Categories,
      Auto-Categorization Rules, Projects, Trips,
      Manual Accounts, Amazon Receipt Sessions,
      Actuals Overrides, Theme Preferences
```

- A family has 1..N users.
- A user belongs to exactly 1 family.
- All members are equal peers — no admin/member role distinction.
- There is no limit on the number of members in a family.

---

## 3. User Stories

### 3.1 Registration & Family Creation

**US-FAM-001: First user registration creates a family**

As a new user, when I register, a family is automatically created for me so I don't need a separate setup step.

| Acceptance Criteria |
|---|
| Registration creates both a user and a family in a single flow |
| The user is automatically added as a member of the new family |
| The user is prompted to provide a family name (with a sensible default, e.g., "[Username]'s Family") |
| The user provides a display name during registration (separate from username) |
| After registration, the user lands in the app as they do today — no additional setup required |

### 3.2 Adding Members

**US-FAM-002: Invite another person to the family**

As a family member, I can invite another person to join my family so they can access our shared financial data with their own login.

| Acceptance Criteria |
|---|
| Any family member can generate an invitation |
| The invitation mechanism is simple — a join code or shareable link |
| The invitation expires after a reasonable period (e.g., 48 hours) |
| A join code/link can only be used once |
| When the invited person registers using the code/link, they are added to the existing family instead of creating a new one |
| The invited person sets their own username, password, and display name during registration |
| There is no limit on the number of invitations or family members |

**US-FAM-003: Join an existing family**

As an invited person, I can use a join code or link to register and immediately access the family's financial data.

| Acceptance Criteria |
|---|
| The join flow is an alternative path through registration — not a separate workflow |
| If I use an invalid or expired code, I see a clear error message |
| After joining, I see the same data as all other family members |
| My login credentials are entirely my own — I don't inherit anything from the inviter |

### 3.3 User Profile Management

**US-FAM-004: Change my password**

As a user, I can change my own password without affecting other family members.

| Acceptance Criteria |
|---|
| I must provide my current password to set a new one |
| Password requirements are the same as registration (15+ character passphrase) |
| Other family members' sessions and credentials are unaffected |
| I remain logged in after changing my password |

**US-FAM-005: Change my display name**

As a user, I can update my display name at any time.

| Acceptance Criteria |
|---|
| Display name is editable from a user settings/profile area |
| The change is reflected wherever display name is shown |
| Display name has no uniqueness constraint (two people can have the same display name) |

### 3.4 Family Management

**US-FAM-006: View family members**

As a family member, I can see who belongs to my family.

| Acceptance Criteria |
|---|
| A family settings or members area shows all current members |
| Each member shows their display name and username |
| I can see when each member last logged in |

**US-FAM-007: Remove a family member**

As a family member, I can remove another member from the family.

| Acceptance Criteria |
|---|
| Any member can remove any other member (all peers are equal) |
| A confirmation prompt prevents accidental removal |
| The removed user's sessions are invalidated immediately |
| The removed user can no longer access the family's data |
| The removed user's account is not deleted — they could join another family or create a new one |
| A family must always have at least one member — the last member cannot remove themselves |
| Financial data is unaffected by member removal (data belongs to the family, not the user) |

### 3.5 Authentication Changes

**US-FAM-008: Log in with individual credentials**

As a user, I log in with my own username and password and am placed into my family's context.

| Acceptance Criteria |
|---|
| Login works the same as today — username + password |
| After login, I see the family's data (same as every other member would see) |
| My session is independent of other family members' sessions |

### 3.6 Data Access

**US-FAM-009: All family members see the same data**

As a family member, I see the complete set of financial data for my family — there is no filtering or hiding based on who I am.

| Acceptance Criteria |
|---|
| All data entities are visible to every family member |
| Any member can create, edit, and delete any data entity |
| Changes made by one member are visible to all other members |
| There is no per-user view filtering within a family |

---

## 4. Data Ownership Migration

### 4.1 Current State

Today, all data is scoped to a single user ID. The following entities are stored as `{entity}_{userId}`:

| Entity | File Pattern |
|--------|-------------|
| Transactions | `transactions_{userId}.json` |
| Accounts | `accounts_{userId}.json` |
| Budgets | `budgets_{userId}.json` |
| Categories | `categories_{userId}.json` |
| Auto-categorization rules | `autocategorize_rules_{userId}.json` |
| Projects | `projects_{userId}.json` |
| Trips | `trips_{userId}.json` |
| Manual accounts | `manual_accounts_{userId}.json` |
| Amazon receipt sessions | `amazon_receipts_{userId}.json` |
| Actuals overrides | `actuals_overrides_{userId}.json` |
| Theme preferences | `theme_preferences_{userId}.json` |

### 4.2 Target State

All of the above entities become scoped to a **family ID** instead of a user ID. The existing user's data must be migrated to belong to their family.

### 4.3 Migration Requirements

| # | Requirement |
|---|-------------|
| MIG-001 | The existing user ("jared") must be migrated into the new model with zero data loss |
| MIG-002 | A family must be created for the existing user, and all their data re-scoped to that family |
| MIG-003 | The migration must handle both filesystem (development) and S3 (production) storage backends |
| MIG-004 | The migration must be idempotent — running it twice produces the same result |
| MIG-005 | A rollback path must exist in case the migration fails partway through |
| MIG-006 | The app must continue to work for the existing user immediately after migration, before any new users are added |

---

## 5. Chatbot Cost Tracking

### 5.1 Current State

Chatbot API costs are tracked in a system-wide monthly file (`chatbot_costs_YYYY-MM.json`) shared across the entire system, with `userId` recorded on each cost entry for auditing.

### 5.2 Target State

Cost tracking should be scoped to the family level — the monthly spend cap ($20/month) applies per family, not per user and not system-wide. Individual cost entries should continue to record which user initiated the request.

| # | Requirement |
|---|-------------|
| COST-001 | The monthly spend cap applies to the family as a whole |
| COST-002 | Each cost entry records which user initiated the request |
| COST-003 | Any family member can view cost usage (already visible in the chatbot UI) |

---

## 6. Account Owner Mapping

### 6.1 Current State

Plaid provides an `accountOwner` field on transactions containing the card's last-4 digits. A hardcoded frontend mapping converts these to display names:

```
'7177' → 'Jecoliah'
'7245' → 'Joj'     (nanny's card)
'7008' → 'Jared'
```

This mapping is display-only — it appears as "Purchased by" in the transaction edit modal.

### 6.2 Target State

The account owner mapping should become a configurable data entity at the family level, replacing the hardcoded frontend mapping.

| # | Requirement |
|---|-------------|
| OWN-001 | Family members can manage a list of card-to-name mappings (add, edit, remove) |
| OWN-002 | A mapping entry contains: card identifier (last-4 digits), display name, and optionally a link to a family member |
| OWN-003 | Mappings that are NOT linked to a family member are supported — the nanny has a card but is not a user in the system |
| OWN-004 | The "Purchased by" display in the transaction edit modal uses the family's mappings instead of the hardcoded map |
| OWN-005 | The hardcoded frontend mapping is removed after this feature is implemented |

---

## 7. What Is Explicitly Out of Scope

| Item | Rationale |
|------|-----------|
| **Per-user data filtering** | All family members see all data. No "show only my transactions" view. |
| **Role-based permissions** | All family members are equal peers. No admin/member distinction. |
| **Multi-family support per user** | A user belongs to exactly one family. No switching between families. |
| **Audit trail of who changed what** | Display name is captured on the user model for future use, but tracking which user made each change is deferred. |
| **Email-based invitations** | The app has no email infrastructure. Invitations use a simple code or link. |
| **Family deletion** | No mechanism to delete an entire family and its data. |
| **User self-deletion** | A user can be removed from a family but cannot delete their own account entirely. |

---

## 8. Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| User registers without an invitation | A new family is created for them |
| User tries to join a family they're already in | Error: "You are already a member of this family" |
| User tries to use an expired join code | Error: "This invitation has expired. Ask a family member to create a new one" |
| Last family member tries to leave | Error: "A family must have at least one member" |
| Removed user tries to log in | Login succeeds but they have no family — they are prompted to create a new family or join one |
| Two users edit the same transaction simultaneously | Last-write-wins (existing behavior, no change) |
| User changes password while another user is logged in | No impact on other user's session |
| Join code is used by someone already in a different family | Error: "You already belong to a family. You must leave your current family before joining another" |

---

## 9. Success Criteria

| # | Criterion |
|---|-----------|
| SC-001 | Jared and Jecoliah can log in with separate credentials and see the same financial data |
| SC-002 | Existing data (all 11 entity types) is fully preserved and accessible after migration |
| SC-003 | A change made by one user is immediately visible to the other |
| SC-004 | Adding or removing a family member does not affect financial data |
| SC-005 | The "Purchased by" field on transactions uses configurable mappings instead of hardcoded values |
| SC-006 | Password changes are independent — one user changing their password does not affect the other |
