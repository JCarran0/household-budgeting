# AI-Powered Bulk Categorization — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-05
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

Users accumulate uncategorized transactions over time — currently 132 (7% of total). Categorizing them one-by-one through the transaction edit modal is tedious. The existing auto-categorization rules help for known merchants, but don't cover new or ambiguous transactions. Users need a faster way to categorize in bulk with AI assistance.

### 1.2 Solution Summary

Add an AI-powered categorization assistant accessible from the Transactions page. When triggered, it uses Claude to analyze uncategorized transactions, groups them into suggested category buckets, and walks the user through an approve/edit flow for each bucket. At the end, it suggests new auto-categorization rules based on patterns discovered during the session.

### 1.3 How It Differs from the Chatbot

| Aspect | AI Chatbot | AI Categorizer |
|--------|-----------|----------------|
| **Purpose** | Ask questions, get analysis | Do work — categorize transactions |
| **UI** | Chat overlay (conversational) | Modal flow on Transactions page |
| **API usage** | Conversational tool_use loop | Single batch classification call |
| **Data access** | Read-only (Phase 1) | Read + write (applies categories) |
| **Interaction** | Free-form Q&A | Structured approve/edit/skip |

The chatbot can reference this feature: "You have 132 uncategorized transactions — want to use the AI categorizer?"

---

## 2. User Flow

### 2.1 Entry Point

An "AI Categorize" button on the Transactions page (near the existing filter controls). The button shows a badge with the uncategorized count when > 0.

### 2.2 Step-by-Step Flow

1. **User clicks "AI Categorize"** — system fetches all uncategorized transactions.
2. **Loading state** — "Analyzing N transactions..." while Claude classifies them.
3. **Classification** — Claude analyzes each transaction (name, merchant, amount, date patterns) against the user's existing category hierarchy and previously categorized transactions. It returns groups:
   - Each group has a suggested category and a list of transactions
   - Each transaction has a confidence score (high/medium/low)
   - Transactions below the confidence threshold go into an "Unsure" bucket
4. **Bucket review modal** — For each suggested category bucket (highest confidence first):
   - Header: "Suggestion: Categorize these N transactions as [Category Name]?"
   - Table/list showing each transaction: date, name/merchant, amount
   - Each row has a category dropdown pre-selected to the suggestion (user can change per-row)
   - "Apply All" button — applies the category to all transactions in the bucket
   - "Skip" button — moves to next bucket without changes
   - Progress indicator: "Bucket 3 of 8"
5. **"Unsure" bucket** (last) — Transactions the AI wasn't confident about:
   - Same UI but category dropdowns default to empty (no pre-selection)
   - User assigns categories manually or skips
6. **Rule suggestions** — After all buckets are processed:
   - "Based on your categorizations, I suggest these auto-categorization rules:"
   - List of suggested rules with pattern, category, and example transactions
   - User can approve, edit, or dismiss each rule
   - Approved rules are created via the existing auto-categorize rules API
7. **Summary** — "Done! Categorized X of Y transactions. Created Z new rules."

### 2.3 Edge Cases

- **Zero uncategorized transactions** — Button disabled or shows "All categorized!"
- **User closes modal mid-flow** — Changes already applied are kept. Unapplied buckets are not lost — user can re-trigger to pick up where they left off (remaining uncategorized).
- **Very large batch (500+)** — Process in chunks. Show progress. Consider a limit per session with "Continue later" option.
- **Category doesn't exist** — If Claude suggests a category that doesn't exist in the user's hierarchy, present it as a suggestion to create, or map to the nearest existing category.

---

## 3. Classification Strategy

### 3.1 Input to Claude

For each uncategorized transaction, send:
- Transaction name (original Plaid description)
- Merchant name (if available)
- Amount
- Date
- Account name

Also provide as context:
- The user's full category hierarchy (names + IDs + parent/child structure)
- A sample of previously categorized transactions (as few-shot examples) — e.g., the 50 most recent categorized transactions, grouped by category
- Existing auto-categorization rules (so the AI doesn't suggest duplicates)

### 3.2 Classification Approach

Use a single Claude API call with structured output (tool_use) to classify all transactions at once (or in batches of ~100 for large sets). The tool returns:

```typescript
interface ClassificationResult {
  transactionId: string;
  suggestedCategoryId: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;  // brief explanation for the suggestion
}
```

### 3.3 Confidence Thresholds

- **High** — Clear merchant/pattern match (e.g., "STARBUCKS" → Coffee). Pre-select and group together.
- **Medium** — Reasonable guess from amount/description patterns. Pre-select but flag for review.
- **Low** — Uncertain. Place in "Unsure" bucket with no pre-selection.

### 3.4 Learning from User Data

The AI should prioritize patterns from the user's own data:
- If "WHOLEFDS" has been categorized as "Groceries" 15 times before, that's a strong signal
- If the user has a custom category "Wine Budget" and a transaction says "TOTAL WINE", suggest it
- Amount patterns matter: $5 at Starbucks → Coffee, $50 at Starbucks → probably still Coffee

---

## 4. Security Requirements

| # | Requirement |
|---|-------------|
| SEC-001 | The AI categorizer must NOT have access to Plaid credentials, tokens, or connection methods. It accesses transaction and category data only. |
| SEC-002 | Transaction data sent to Claude must use the tool_use architecture (data in tool results, not interpolated into prompts) to mitigate prompt injection from transaction names. |
| SEC-003 | The categorizer must only modify categories (and optionally create auto-categorize rules). It must not modify amounts, dates, descriptions, or other transaction fields. |
| SEC-004 | All operations must be scoped to the authenticated user's data. |
| SEC-005 | The categorizer shares the chatbot's monthly cost cap ($20/month, SEC-010 from chatbot BRD). Classification costs count toward the same budget. |

---

## 5. Functional Requirements

### 5.1 Entry Point

| # | Requirement |
|---|-------------|
| REQ-001 | An "AI Categorize" button must be visible on the Transactions page when uncategorized transactions exist. |
| REQ-002 | The button must display the current uncategorized transaction count as a badge. |
| REQ-003 | Clicking the button opens the categorization flow modal. |

### 5.2 Classification

| # | Requirement |
|---|-------------|
| REQ-004 | The system must classify all uncategorized transactions against the user's existing category hierarchy. |
| REQ-005 | Classification must use the user's previously categorized transactions as context for better suggestions. |
| REQ-006 | Each suggestion must include a confidence level (high/medium/low). |
| REQ-007 | Transactions with low confidence must be grouped in a separate "Unsure" bucket presented last. |
| REQ-008 | The system must handle batching for large transaction sets (100+ transactions per Claude call). |

### 5.3 Bucket Review

| # | Requirement |
|---|-------------|
| REQ-009 | Suggested categories must be presented one bucket at a time, highest confidence first. |
| REQ-010 | Each bucket must show the suggested category, transaction count, and total amount. |
| REQ-011 | Each transaction row must display: date, name/merchant, amount, and a category dropdown pre-selected to the suggestion. |
| REQ-012 | The user must be able to change the category for any individual transaction before applying. |
| REQ-013 | "Apply All" applies the selected categories for all transactions in the current bucket. |
| REQ-014 | "Skip" moves to the next bucket without making changes. Skipped transactions remain uncategorized. |
| REQ-015 | A progress indicator must show current bucket position (e.g., "3 of 8"). |

### 5.4 Rule Suggestions

| # | Requirement |
|---|-------------|
| REQ-016 | After all buckets are processed, the system must suggest auto-categorization rules based on patterns observed during the session. |
| REQ-017 | Each rule suggestion must show: the pattern(s), target category, and example transactions that would match. |
| REQ-018 | The user must be able to approve, edit (change pattern or category), or dismiss each rule suggestion. |
| REQ-019 | Approved rules must be created via the existing auto-categorization rules API. |
| REQ-020 | The system must not suggest rules that duplicate existing auto-categorization rules. |

### 5.5 Summary

| # | Requirement |
|---|-------------|
| REQ-021 | After the flow completes, show a summary: transactions categorized, transactions skipped, rules created. |

---

## 6. API Design

### 6.1 New Endpoints

**POST /api/v1/chatbot/classify-transactions**
- Auth: required
- Body: `{ transactionIds?: string[] }` (optional — defaults to all uncategorized)
- Response: `{ buckets: ClassificationBucket[], unsureBucket: ClassificationBucket, costUsed: number }`
- Shares the chatbot's cost cap and rate limiting

**POST /api/v1/chatbot/suggest-rules**
- Auth: required
- Body: `{ categorizations: { transactionId: string, categoryId: string }[] }`
- Response: `{ suggestions: RuleSuggestion[] }`

### 6.2 Existing Endpoints Used

- **PUT /api/v1/transactions/bulk** — Apply category changes (already supports bulk category updates, max 100)
- **POST /api/v1/autocategorize/rules** — Create approved rules
- **GET /api/v1/transactions?onlyUncategorized=true** — Fetch uncategorized transactions
- **GET /api/v1/categories** — Fetch category hierarchy
- **GET /api/v1/autocategorize/rules** — Fetch existing rules (to avoid duplicates)

---

## 7. Cost Considerations

| Factor | Estimate |
|--------|----------|
| Input per classification call (~100 transactions + category context) | ~3,000-5,000 tokens |
| Output per classification call | ~2,000-4,000 tokens |
| Sonnet cost per 100 transactions | ~$0.07-0.10 |
| Full session (132 transactions, 2 calls) | ~$0.15-0.20 |
| Rule suggestion call | ~$0.03-0.05 |

Well within the $20/month shared cap for occasional use.

---

## 8. Assumptions

| # | Assumption |
|---|------------|
| A-1 | The existing category hierarchy is sufficient — the AI maps to existing categories, not creates new ones (with the exception of flagging when no good match exists). |
| A-2 | The user's previously categorized transactions are a reliable signal for classification. |
| A-3 | Sonnet is the right model for classification — fast enough for batch use, smart enough for accurate suggestions. User does not select model for this feature (unlike the chatbot). |
| A-4 | The existing bulk update endpoint (max 100 per request) is sufficient. Multiple requests can be chained for larger batches. |
| A-5 | This feature shares the chatbot's cost tracking and monthly cap. |

---

## 9. Out of Scope

| Item | Rationale |
|------|-----------|
| Auto-categorization on sync | Future enhancement — automatically categorize new transactions as they arrive |
| Category creation suggestions | V1 maps to existing categories only; suggesting new categories adds complexity |
| Confidence score display to user | Internal implementation detail; user sees grouped buckets, not scores |
| Undo/rollback of applied categories | User can manually re-categorize; bulk undo adds complexity |
| Transaction description updates | This feature only changes `categoryId`, not descriptions |

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should the "Unsure" bucket allow the user to ask the chatbot for help on individual transactions? (e.g., "What do you think this one is?") | Open |
| 2 | Should we show the AI's reasoning for each suggestion (the `reasoning` field), or is that visual clutter? | Open |
| 3 | What's the right batch size for Claude calls — 50, 100, or 200 transactions per call? Tradeoff between cost/latency and context quality. | Open |
| 4 | Should the feature auto-trigger on login if uncategorized count exceeds a threshold, or always be manual? | Open |

---

## 11. Success Criteria

- Users can categorize 100+ transactions in under 2 minutes (vs. 30+ minutes manually).
- AI classification accuracy is 80%+ for high-confidence suggestions (measured by user acceptance rate).
- Auto-categorization rule suggestions reduce future uncategorized transactions by 50%+.
- Cost per session stays under $0.50 for typical usage.
- The flow feels fast — classification completes in under 10 seconds for 100 transactions.
