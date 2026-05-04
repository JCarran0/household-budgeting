# Auto-Categorization Rule Suggestions — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-05-04
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

Even with auto-categorization rules in place, uncategorized transactions accumulate. Many of them are recurring vendors the user *has* categorized in the past — just not via a rule. Each time the user manually categorizes a "Lola Pizza" transaction, the system has new evidence that a rule would help, but never asks. The user has to notice the pattern themselves and manually create the rule.

### 1.2 Solution Summary

Add a "Suggested Rules" section to the Auto Cat tab on the Categories page. The system scans uncategorized transactions, clusters them by a normalized merchant key against historical categorized transactions, and surfaces a card whenever a cluster meets the confidence bar — for example: *"You categorize Lola Pizza as Restaurants 87% of the time. Would you like to create an auto-cat rule?"* One click creates the rule and applies it to the matching uncategorized transactions.

The feature is **deterministic** (no LLM). The matching shape it uses is identical to the auto-cat rule format: case-insensitive substring search across `name`, `originalDescription`, and `merchantName` — so a suggestion's preview count equals the rule's actual match count when created.

### 1.3 How It Differs from AI Bulk Categorization

| Aspect | AI Bulk Categorization | Auto Cat Suggestions |
|--------|-----------------------|----------------------|
| **Trigger** | User-invoked, modal flow | Always-on section on Auto Cat tab |
| **Output** | Categorize transactions, then suggest rules | Suggest rules (which then categorize transactions) |
| **Backend** | Claude Sonnet, per-session cost | Pure deterministic scan, no API cost |
| **Confidence basis** | Claude's classification | User's own historical categorization patterns |
| **Volume** | Designed for large backlog cleanup | Steady, low-volume drip of suggestions |

The two features are complementary. Bulk categorization clears a backlog; rule suggestions prevent the backlog from re-forming.

---

## 2. User Flow

### 2.1 Entry Point

The Auto Cat tab on the Categories page. A new "Suggested Rules" section is pinned at the top of the tab, above the existing rules list. The section is hidden entirely when there are zero suggestions — it is not a permanent piece of chrome.

### 2.2 Suggestion Card

Each suggestion renders as a card:

```
┌──────────────────────────────────────────────────────────┐
│  Lola Pizza                                  [Dismiss ✕] │
│  You categorize this as Restaurants 87% of the time      │
│  (7 of 8 past matches in the last 180 days)              │
│                                                          │
│  Would categorize 3 pending uncategorized transactions   │
│                                                          │
│  [Preview matches]                       [Create rule]   │
└──────────────────────────────────────────────────────────┘
```

### 2.3 Step-by-Step Flow

1. **User opens the Auto Cat tab.** Frontend calls `GET /api/v1/categories/auto-cat/suggestions`.
2. **Backend scans** categorized transactions (last 180 days) and all active uncategorized transactions, clustering by normalized merchant key.
3. **Suggestions are returned** ranked by pending-uncategorized-match count, descending. Top 10 render as cards; remaining suggestions accessible via "Show N more".
4. **User clicks Preview matches** (optional) — the card expands to show the uncategorized transactions the rule would catch and a sample of the categorized transactions it learned from.
5. **User clicks Create rule** — system creates the auto-cat rule (pattern = normalized key, category = top category) and immediately applies it to the matching uncategorized transactions. Toast: *"Rule created. Categorized N transactions."* Card disappears.
6. **OR User clicks Dismiss ✕** — card disappears for this user only. Dismissal persists in localStorage keyed by normalized merchant key.

### 2.4 Edge Cases

- **Zero suggestions** — Section hidden entirely. No empty-state message.
- **User creates a conflicting rule** — If a rule with the same normalized pattern already exists pointing to a different category, surface a confirm dialog: *"A rule for 'lola pizza' already maps to {OldCategory}. Replace with {NewCategory}?"* Replace updates the existing rule's `categoryId`; Cancel aborts.
- **User creates a duplicate rule (same pattern, same category)** — No-op on the backend; toast *"Rule already exists"*. Defensive against tab/user races.
- **Cluster grows after dismissal** — Dismissal persists. If the user wants the suggestion back, they can clear localStorage; not a v1 affordance.
- **User bulk-categorizes a batch** — Manual "Refresh suggestions" button on the section header forces a re-scan. The query also auto-refetches on focus and 5-minute stale timeout.

---

## 3. Clustering & Matching Strategy

### 3.1 Normalized Merchant Key

For each transaction, derive a normalized key in priority order:

1. `merchantName` (Plaid's cleaned field) if present, lowercased and trimmed.
2. Else `name`, lowercased, with the following strips applied:
   - Leading payment-processor prefixes: `SQ *`, `TST*`, `PAYPAL *`, `SP *`, `PP*`, `CKE*`, `TST `
   - Trailing store/location noise: `#\d+`, ` \d{3,}` (store numbers), trailing 1–2 ALL-CAPS tokens of length ≥2 (city/state)
   - Whitespace collapsed to single spaces.
3. **Skip the transaction entirely** if the normalized key is < 4 characters or purely numeric — too generic to base a rule on.

The normalized key serves two purposes: (a) it is the cluster identifier, and (b) it is the pattern stored on the rule when the user accepts the suggestion.

### 3.2 Cluster Membership

A categorized transaction joins a cluster if its normalized key matches another transaction's normalized key (exact equality after normalization). Clusters pool transactions from **both users** — this is family-shared data and aligns with how the rest of the app treats household state.

### 3.3 Suggestion Eligibility

A cluster surfaces as a suggestion only if **all** of the following hold:

| # | Threshold |
|---|-----------|
| 1 | Cluster size ≥ **3** categorized matches in the last **180 days** |
| 2 | Top category share ≥ **80%** of the categorized matches |
| 3 | At least **1** active uncategorized transaction matches the same normalized key |
| 4 | No existing auto-cat rule already covers the cluster (see §3.4) |
| 5 | Normalized key is ≥ 4 characters and not purely numeric (see §3.1) |

### 3.4 Existing-Rule Dedup

A cluster is suppressed if there is an existing auto-cat rule whose pattern, when normalized via the §3.1 rules, equals the cluster's normalized key — regardless of which category that rule targets. If the existing rule simply hasn't been re-run, that's a re-run problem and not a suggestion problem.

### 3.5 Inclusions and Exclusions

| Category | Treatment |
|----------|-----------|
| Transfers (`TRANSFER_*`, `isTransfer`) | **Included.** Uncategorized transfers are real cleanup targets; "Transfer - In" / "Transfer - Out" are exactly the kind of consistent clusters this should surface. |
| Pending transactions | **Excluded** on both sides. Merchant strings can change on settlement. |
| Removed transactions | **Excluded** (already filtered by `transactionReader.getActiveTransactions()`). |
| `CUSTOM_AMAZON` category | **Included.** A consistent Amazon-bucket pattern is exactly what this should detect. Amazon receipt matching is orthogonal. |
| Hidden categories (`isHidden: true`) | **Included.** Hidden is a UI choice; the categorization signal is still valid. |

---

## 4. Rule Creation Semantics

### 4.1 Rule Pattern

The rule created from a suggestion uses the cluster's normalized merchant key (§3.1) as its pattern, with case-insensitive substring matching across `name`, `originalDescription`, and `merchantName` — identical to the auto-cat behavior established in commit dce0615.

### 4.2 Auto-Apply on Creation

When the user clicks Create, the system immediately applies the new rule to the matching active uncategorized transactions. The toast count reflects the actual number categorized, not a hypothetical projection. This is the same code path the existing Auto Cat tab uses to bulk-apply a rule retroactively.

### 4.3 Collision Handling

| Scenario | Behavior |
|----------|----------|
| No existing rule with the same pattern | Create rule, apply to pending matches, toast success. |
| Existing rule with same pattern + same `categoryId` | No-op create, toast *"Rule already exists"*. Suggestion card removed. |
| Existing rule with same pattern + different `categoryId` | Confirm dialog: *"A rule for 'X' already maps to {Old}. Replace with {New}?"* — Replace updates the existing rule's `categoryId`; Cancel aborts. |

---

## 5. UX Requirements

### 5.1 Suggested Rules Section

| # | Requirement |
|---|-------------|
| REQ-001 | A "Suggested Rules" section must render at the top of the Auto Cat tab when ≥1 suggestion exists. |
| REQ-002 | When zero suggestions exist, the section must be hidden entirely (no empty-state copy). |
| REQ-003 | Suggestions must sort by pending-uncategorized-match count, descending. |
| REQ-004 | The section must cap at 10 visible cards with a "Show N more" affordance for additional suggestions. |
| REQ-005 | A "Refresh suggestions" button on the section header must force a re-scan via the suggestions endpoint. |

### 5.2 Suggestion Card

| # | Requirement |
|---|-------------|
| REQ-006 | Each card must display: normalized merchant label, top category name, agreement percentage, cluster size, pending-match count. |
| REQ-007 | Each card must offer a "Preview matches" expansion showing the uncategorized transactions the rule would catch and a sample of the categorized transactions it learned from. |
| REQ-008 | Each card must offer a "Create rule" primary action. |
| REQ-009 | Each card must offer a "Dismiss" action that hides the suggestion for the current user only. |

### 5.3 Create Rule Action

| # | Requirement |
|---|-------------|
| REQ-010 | Clicking "Create rule" must create the rule and apply it to matching uncategorized transactions in a single transactional flow. |
| REQ-011 | On success, the card must disappear and a toast must confirm: *"Rule created. Categorized N transactions."* |
| REQ-012 | On collision (same pattern, different category), a confirm dialog must offer Replace / Cancel as defined in §4.3. |
| REQ-013 | After successful creation, the suggestions query must invalidate and refetch. |

### 5.4 Dismiss Action

| # | Requirement |
|---|-------------|
| REQ-014 | Dismissals must persist per-user in `localStorage`, keyed by normalized merchant key. |
| REQ-015 | Dismissals must NOT be shared with the other family user. |
| REQ-016 | A dismissed suggestion must remain hidden for the dismissing user even if the underlying cluster grows. |

---

## 6. API Design

### 6.1 New Endpoints

**GET `/api/v1/categories/auto-cat/suggestions`**
- Auth: required
- Query: none
- Response:
  ```typescript
  {
    suggestions: Array<{
      normalizedKey: string;          // also the proposed rule pattern
      displayLabel: string;           // human-readable merchant name
      topCategoryId: string;
      topCategoryName: string;
      agreementPct: number;           // 0–100, integer
      clusterSize: number;            // total categorized matches in window
      topCategoryCount: number;       // matches that voted for top category
      pendingMatchCount: number;      // active uncategorized matches
      sampleCategorizedTxnIds: string[]; // for the preview view, capped at 5
      pendingTxnIds: string[];        // for the preview view, no cap
    }>;
  }
  ```

### 6.2 Existing Endpoints Used

- **POST `/api/v1/autocategorize/rules`** — create the rule on confirmation.
- **PUT `/api/v1/autocategorize/rules/:id`** — used in the Replace path (§4.3).
- **GET `/api/v1/transactions?ids=...`** — for the Preview expansion.

### 6.3 Backend Computation

Suggestions are computed synchronously on each request. Single pass:

1. Fetch all active categorized transactions in the last 180 days via `transactionReader.getActiveTransactions()`.
2. Fetch all active uncategorized transactions (no time bound).
3. Normalize each transaction's merchant key (§3.1). Drop transactions whose key is too short or numeric.
4. Group by normalized key. For each group:
   - Drop if categorized count < 3.
   - Compute top category and agreement percentage.
   - Drop if agreement < 80%.
   - Drop if pending uncategorized matches < 1.
   - Drop if an existing auto-cat rule's normalized pattern equals the key.
5. Sort surviving groups by pending match count descending, return top 10 plus overflow.

For ~10K total transactions across 2 users, expected sub-100ms. No caching layer in v1.

---

## 7. Telemetry

Server-side structured logs only. No frontend analytics events.

| Event | Fields |
|-------|--------|
| `auto_cat_suggestions.scan` | `userId`, `totalCategorizedScanned`, `totalUncategorizedScanned`, `clustersFound`, `suggestionsReturned`, `durationMs` |
| `auto_cat_suggestions.rule_created` | `userId`, `normalizedKey`, `categoryId`, `agreementPct`, `clusterSize`, `pendingMatchCount`, `appliedToTxnCount`, `replacedExisting: boolean` |

The `rule_created` event must distinguish suggestion-driven creates from manual creates via a `source: 'suggestion' | 'manual'` field on the existing auto-cat creation log line, so dashboards can compare.

Dismissals are NOT logged (they live in `localStorage`).

---

## 8. Assumptions

| # | Assumption |
|---|------------|
| A-1 | The 3 / 80% / 180d defaults are appropriate for a 2-user app with a few thousand transactions per year. They are tunable in code, not user-facing settings. |
| A-2 | The normalized-key regex strips are sufficient for the long tail of merchant strings. Misses are acceptable because the user confirms each suggestion. |
| A-3 | Per-user localStorage dismissals are durable enough. "I cleared my browser data" is a recoverable annoyance, not a defect. |
| A-4 | A synchronous scan is fast enough at current data volume. A pre-computed cache can be added later if scans exceed ~200ms. |
| A-5 | The recently-fixed cross-field auto-cat matching (commit dce0615) is the canonical match shape. Suggestions and rules use the same shape; preview counts equal post-creation match counts. |

---

## 9. Out of Scope

| Item | Rationale |
|------|-----------|
| LLM-assisted merchant normalization | Decided in design: the rule we'd create is a string pattern anyway, so smarter clustering would be lost when serialized as a rule. Revisit only if auto-cat rules grow semantic capabilities. |
| Server-side dismissals shared between users | Adds schema migration and sync semantics for a low-stakes preference. localStorage is sufficient. |
| Suggestion creation from low-confidence clusters (< 80% agreement) | Would require surfacing confidence to the user and complicating the card UI. Holding for v1. |
| Background pre-computation / push notifications | Synchronous scan is fast enough. Push adds infra cost for a low-frequency feature. |
| Undo for "Create rule" | Rule deletion + manual re-uncategorization is the manual workaround. The Preview action is the pre-commit safeguard. |
| User-tunable thresholds (cluster size, agreement %) | Out of scope for v1; revisit if telemetry shows real-world creates cluster around different numbers. |
| Suggestions for *changing* an existing rule's category when the underlying pattern shifts | Different feature: rule maintenance, not rule discovery. |

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should the Preview expansion show the *categorized* sample transactions in addition to the pending ones, or just pending? Showing categorized helps the user verify the cluster's category is correct, but doubles the card height. | Open |
| 2 | If a user dismisses a suggestion and later creates the same rule manually, should the dismissal entry be cleaned up from localStorage? Probably yes, but requires a small hook on rule creation. | Open |
| 3 | Should the section render a small numeric badge on the Auto Cat tab itself (e.g., `Auto Cat (3)`) so the user knows there are pending suggestions without opening the tab? | Open |

---

## 11. Success Criteria

- Suggestions surface only when the user is highly likely to accept them (target ≥70% accept rate based on the 3 / 80% bar).
- Average scan duration stays under 200ms at current data volume.
- Suggestion-driven rule creation reduces the steady-state uncategorized-transaction count compared to manual-only rule creation (measure 30-day delta after rollout).
- Zero false-positive collisions: no instance of a created suggestion-rule conflicting with the user's intent in a way they can't easily fix.
- The feature requires no new infrastructure — endpoint, scan, and UI ship within the existing service boundaries.
