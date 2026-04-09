# Amazon Receipt Matching — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-08
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

Amazon purchases are the largest source of opaque transactions in the household budget. Plaid reports them all as "Amazon" under `GENERAL_MERCHANDISE_ONLINE_MARKETPLACES` with no item-level detail. In March 2026 alone, 20+ transactions totaling ~$1,100 were categorized as the catch-all `CUSTOM_AMAZON`. These span pet supplies, kids clothing, home improvement, electronics, books, and more — but from the bank's perspective they're all just "Amazon."

Multi-item orders compound the problem. A single $135.54 charge might contain swim trunks (kids clothing), garden supplies (hobbies), and kids sandals (kids stuff). The user currently has two bad options: assign the entire amount to one category (inaccurate), or manually split the transaction and look up individual prices (tedious).

### 1.2 Solution Summary

Allow users to upload Amazon order data (PDF export from Amazon's Orders or Payments > Transactions page) and use Claude's vision and reasoning capabilities to:

1. **Parse** the PDF to extract order details (dates, amounts, items, order numbers)
2. **Match** parsed orders against Amazon-merchant transactions by amount and date
3. **Recommend** category assignments for each item, with confidence scores
4. **Suggest splits** for multi-item orders where items span different budget categories
5. **Detect recurring purchases** (Subscribe & Save) and suggest auto-categorization rules
6. **Apply** approved changes through the existing transaction update and split flows

### 1.3 Relationship to Existing AI Categorizer

This feature and the AI Categorizer are **separate entry points** that share downstream UI patterns. They solve different problems and are triggered differently, but the review/approve/skip experience should feel consistent.

| Aspect | AI Categorizer | Amazon Receipt Matcher |
|--------|---------------|----------------------|
| **Trigger** | "AI Categorize" button → processes immediately | "Match Amazon Receipts" button → upload PDF first |
| **Input** | Transaction data only (names, amounts) | External document (Amazon PDF) + transaction data |
| **Problem** | "What category is WHOLEFDS?" | "What's inside this $135.54 Amazon charge?" |
| **Output** | Category suggestions | Category suggestions + split recommendations + auto-rules |
| **Data source** | Plaid merchant names (often clear) | Amazon item descriptions from PDF (always clear) |
| **Accuracy** | Relies on merchant name heuristics | Has actual item names — much higher potential accuracy |
| **Scope** | All uncategorized transactions | Amazon-merchant transactions with uploaded receipt data |

The AI Categorizer handles the broad problem ("categorize everything uncategorized"). This feature solves the specific, high-value problem of Amazon transactions where Plaid data is fundamentally insufficient — the item detail simply doesn't exist in bank data and must come from an external source.

The AI Categorizer may surface a contextual hint when it encounters Amazon transactions: "15 of these are Amazon — upload your order history for better results?" This is a one-way pointer, not a shared flow. Each feature owns its own process end-to-end.

**This is not a chatbot feature.** It is a structured, button-driven flow with a deterministic backend process. The chatbot has no role in the upload, matching, or approval steps.

---

## 2. User Flow

### 2.1 Entry Point

A "Match Amazon Receipts" button on the Transactions page, visible when Amazon-merchant transactions exist. This is a standalone entry point — separate from the "AI Categorize" button, though both live in the same toolbar area near filter controls.

### 2.2 Step-by-Step Flow

1. **Upload** — User clicks "Match Amazon Receipts" and uploads 1–2 PDFs. The UI accepts:
   - **Orders page PDF** (amazon.com/gp/css/order-history) — contains item names, images, order dates, totals, and order numbers
   - **Payments > Transactions PDF** (amazon.com/cpe/yourpayments/transactions) — contains charge dates, amounts, order numbers, and card identifiers

   The system accepts up to two PDFs per upload session — one of each type. If both are provided, the system cross-references them on order number for higher-quality matching (exact charge dates from the transactions PDF + item details from the orders PDF). If only one is uploaded, the orders PDF is preferred because it contains item descriptions needed for categorization.

2. **Parse** — System sends the PDF to Claude with vision capabilities to extract structured data:
   - Order number, order date, charge amount
   - Item names and descriptions (from orders PDF)
   - Card last-4 digits (from transactions PDF)
   - Delivery dates

3. **Match** — System matches parsed orders against Amazon-merchant transactions in the database:
   - Primary match pool: transactions with Amazon-related merchant names (`AMAZON`, `AMZN`, `Amazon.com`, `Kindle Svcs`, etc.) regardless of current category
   - Primary key: exact amount match within a date window (charge date ± 3 days of bank posting date)
   - Disambiguation: if multiple transactions share an amount in the window, use order number patterns from bank descriptions (e.g., `AMAZON MKTPL*BD4694RU0`) or card last-4 digits
   - Result: each parsed order is either **matched** to a transaction, **ambiguous** (multiple candidates), or **unmatched** (no transaction found)

4. **Review matches** — Present matched pairs for user verification:
   - Left side: Amazon order (item names, order date, total)
   - Right side: Bank transaction (merchant description, post date, amount)
   - Match confidence indicator (exact/likely/uncertain)
   - User can confirm, reject, or manually reassign matches
   - Ambiguous and unmatched items shown separately for manual resolution

5. **Categorization recommendations** — For each confirmed match:
   - **Single-item orders**: Recommend a category based on item description. Show confidence score.
   - **Multi-item orders**: Recommend splitting the transaction. For each suggested split, show the item name, estimated price, and suggested category.
   - User reviews each recommendation: approve, edit category, or skip.

6. **Apply changes** — For approved recommendations:
   - Single-item recategorizations: update the transaction's `categoryId`
   - Splits: create child transactions via the existing split API, each with the recommended category

7. **Auto-categorization rule suggestions** — After all matches are processed:
   - The system identifies recurring Amazon purchases (Subscribe & Save items, repeated product orders) across the matched data
   - For each pattern, suggest an auto-categorization rule: "You've ordered Kaytee Paper Bedding 3 times — auto-categorize future Amazon charges matching this pattern as Pet Supplies?"
   - Uses the same approve/edit/dismiss flow as the existing AI Categorizer rule suggestions (REQ-016–020 from AI-CATEGORIZATION-BRD)
   - Approved rules are created via the existing auto-categorize rules API
   - Rules match on Amazon transaction description patterns (e.g., `AMAZON MKTPL*` + amount range) since item names aren't available in bank data — the rule triggers on amount + merchant pattern, not product name

8. **Summary** — "Recategorized X transactions. Split Y multi-item orders into Z line items. Created W auto-categorization rules."
   - Includes total dollar amount moved out of `CUSTOM_AMAZON` into specific categories

### 2.3 Edge Cases

- **No Amazon-merchant transactions** — Button disabled or hidden. Message: "No Amazon transactions to match."
- **PDF format not recognized** — Graceful error: "This doesn't look like an Amazon orders or transactions page. Please upload a PDF exported from your Amazon order history or payment transactions."
- **Orders PDF with no prices** — The Amazon orders page shows order totals but not per-item prices for multi-item orders. The system should flag this: "This order has N items totaling $X. I can suggest categories, but you'll need to provide or approve the price breakdown for the split."
- **Partial overlap** — PDF covers a different date range than existing transactions. Only process matches; ignore parsed orders with no corresponding transaction.
- **Already-decided transactions** — The system matches any Amazon-merchant transaction regardless of current category, but respects prior decisions. If a user previously skipped or rejected a recommendation for a specific transaction (tracked in session data), it is never re-suggested. Transactions the user already manually categorized are shown with their current category and flagged as "already categorized" — the user can choose to recategorize or skip, but the system does not push changes on transactions the user already handled.
- **Duplicate uploads** — If the user uploads the same PDF again, the system should detect that matched transactions have already been recategorized and skip them, showing only unprocessed matches.
- **Returns and refunds** — Amazon refunds appear as positive amounts. Match them separately and suggest keeping them in the same category as the original purchase, or let the user decide.
- **Multi-item orders without individual prices** — When the orders PDF doesn't show per-item prices (it shows order totals only), the system should:
  - Use Claude to estimate per-item prices based on product descriptions and public pricing knowledge
  - Present estimates clearly as estimates ("~$25" not "$25") with a note that they may not be exact
  - Allow the user to adjust amounts before confirming the split
  - Validate that adjusted amounts sum to the order total (existing split validation)

---

## 3. PDF Parsing Strategy

### 3.1 Supported Formats

| Format | Source URL | Key Data | Best For |
|--------|-----------|----------|----------|
| **Orders page** | amazon.com/gp/css/order-history | Item names, images, order dates, totals, order numbers | Categorization (has item details) |
| **Payments > Transactions** | amazon.com/cpe/yourpayments/transactions | Charge dates, amounts, order numbers, card last-4 | Matching (dates align better with bank) |

### 3.2 Parsing Approach

Use Claude's vision capabilities to extract structured data from the PDF. The PDF is sent as a document to the Claude API with a structured extraction prompt.

**Extracted structure (orders PDF):**

```typescript
interface ParsedAmazonOrder {
  orderNumber: string;
  orderDate: string;         // Date the order was placed
  totalAmount: number;       // Order total charged
  items: ParsedAmazonItem[];
}

interface ParsedAmazonItem {
  name: string;              // Full product name from Amazon
  estimatedPrice: number | null;  // null if not available (multi-item orders)
  quantity: number;
}
```

**Extracted structure (transactions PDF):**

```typescript
interface ParsedAmazonCharge {
  orderNumber: string;
  chargeDate: string;        // Date card was charged
  amount: number;
  cardLastFour: string;
  merchantLabel: string;     // "Amazon.com", "AMZN Mktp US", "AMAZON DIGITAL", etc.
}
```

### 3.3 Parsing Quality Considerations

- Amazon's print-to-PDF layout truncates the right sidebar — this is expected and doesn't affect order data in the main content area
- The orders PDF paginator ("past 3 months", specific year filters) determines scope — the system processes whatever is in the uploaded PDF
- Multi-page PDFs are supported — Claude can process the full document
- Item images in the orders PDF provide additional context for categorization but are not required

---

## 4. Matching Algorithm

### 4.1 Match Strategy

### 4.0 Match Pool

The system matches against all transactions with Amazon-related merchant names, identified by Plaid merchant name or original transaction description containing: `Amazon`, `AMZN`, `AMAZON`, `Kindle Svcs`, `AMZN MKTP`, `Amazon.com`, `AMAZON DIGITAL`, `AMAZON MKTPL`, `AMAZON RETA`.

This is broader than just `CUSTOM_AMAZON` — it includes Amazon transactions that may have been manually categorized to other categories (e.g., a user put a dog food order under "Pet Food" but didn't split a mixed order). To prevent churn, the system tracks user decisions (see §7) and never re-suggests changes for transactions the user previously skipped or rejected.

### 4.1 Match Tiers

Matching is performed in tiers, stopping at the first confident match:

**Tier 1 — Exact amount + date window (high confidence)**
- Amount matches exactly (to the cent)
- Bank transaction date is within ±3 days of the Amazon charge date (or order date if using orders PDF)
- If exactly one transaction matches: **confirmed match**

**Tier 2 — Exact amount + wider date window (medium confidence)**
- Amount matches exactly
- Date window expanded to ±7 days (accounts for holds, delayed posting)
- Present as "likely match" for user confirmation

**Tier 3 — Ambiguous (low confidence)**
- Multiple transactions match the same amount within the date window
- Present all candidates to the user for manual selection

**Tier 4 — Unmatched**
- No amount match found within any date window
- Could indicate: a different card, a different Amazon account, a charge that hasn't posted yet, or a return/adjustment
- Show in a separate "Unmatched" section — user can manually link or dismiss

### 4.2 Cross-Reference Enhancement

When both PDF types are uploaded in the same session, the system cross-references them:
- Transactions PDF provides `orderNumber` + exact `chargeDate` + `amount`
- Orders PDF provides `orderNumber` + `items`
- Join on `orderNumber` to get: exact charge date + item details → highest quality match

This is the recommended workflow when the user has both PDFs available. The orders PDF alone is sufficient for basic matching, but providing both significantly improves match confidence by combining exact charge dates with item-level detail.

---

## 5. Categorization Strategy

### 5.1 Input to Claude

For each matched order, send:
- Item name(s) from the parsed PDF
- The user's full category hierarchy (names + IDs)
- A sample of the user's previously categorized transactions as few-shot examples (reuse the pattern from the existing AI Categorizer)

### 5.2 Confidence Scoring

| Level | Criteria | UI Treatment |
|-------|----------|-------------|
| **High** (≥ 0.85) | Item clearly maps to one category. E.g., "NutriSource Adult Dry Dog Food" → Pet Food | Pre-selected, grouped for batch approval |
| **Medium** (0.5–0.84) | Reasonable guess but ambiguous. E.g., "ZOMAKE Lightweight Packable Backpack" → could be Kids Stuff, Travel, or Home Goods | Pre-selected but flagged for review |
| **Low** (< 0.5) | Unclear mapping. E.g., "FIETODK Epoxy Floor Spiked Shoes" — unusual item, no obvious category | No pre-selection, user must choose |

Confidence scores should be numeric (0.0–1.0) in the API response, displayed to the user as descriptive labels (High/Medium/Low) alongside the score.

### 5.3 Split Recommendations

For multi-item orders, the system should recommend a split when:
- The order contains 2+ items
- The items would map to **different** categories (if all items map to the same category, a simple recategorization is sufficient — no split needed)

**Split recommendation structure:**

```typescript
interface SplitRecommendation {
  originalTransactionId: string;
  splits: {
    itemName: string;
    estimatedAmount: number;
    suggestedCategoryId: string;
    confidence: number;
    isEstimatedPrice: boolean;  // true if price was inferred, not from PDF
  }[];
  totalMatchesOriginal: boolean;  // whether split amounts sum to transaction total
}
```

When per-item prices are not available from the PDF, the system should:
1. Use Claude to estimate prices based on product knowledge
2. Clearly label estimates vs. known prices
3. Adjust the last split amount to ensure the total matches exactly (absorb rounding)

---

## 6. Security Requirements

| # | Requirement |
|---|-------------|
| SEC-001 | Uploaded PDFs must be processed in memory and not persisted to disk or S3 after the parsing session completes (see §7 for session data persistence, which stores parsed results — not raw PDFs). |
| SEC-002 | PDF content sent to Claude must use the document/vision API — raw text must not be interpolated into system prompts (prompt injection defense, consistent with SEC-007 from chatbot BRD). |
| SEC-003 | The feature must only modify transactions belonging to the authenticated user. |
| SEC-004 | The feature must only modify `categoryId` and create splits — it must not alter transaction amounts, dates, descriptions, or other fields (except as required by the split API: setting `isSplit`, `isHidden`, `parentTransactionId`, `splitTransactionIds`). |
| SEC-005 | This feature shares the chatbot/categorizer monthly cost cap ($20/month, SEC-010 from chatbot BRD). PDF parsing and categorization costs count toward the same budget. |
| SEC-006 | Uploaded PDFs may contain personal information (name, address, partial card numbers). The system must not log PDF content. Structured parsing results may be logged for debugging but must not include card numbers. |
| SEC-007 | File upload must validate: PDF MIME type, maximum file size (20MB), and maximum page count (50 pages). Reject other file types. |

---

## 7. Data Persistence

### 7.1 Decision: Persist Parsed Results Per Session

Parsed Amazon order data should be persisted as a **session record** tied to the user, not discarded after each upload. This enables:

- **Incremental processing** — User uploads a PDF, categorizes some matches, comes back later to finish
- **Historical reference** — "What was in that $135 Amazon order?" is answerable without re-uploading
- **Duplicate detection** — Prevents re-processing the same orders on subsequent uploads
- **Audit trail** — User can see which Amazon items were mapped to which categories

### 7.2 What to Persist

```typescript
interface AmazonReceiptSession {
  id: string;
  userId: string;
  uploadedAt: string;               // ISO timestamp
  pdfType: 'orders' | 'transactions';
  parsedOrders: ParsedAmazonOrder[];
  matches: AmazonTransactionMatch[];
  status: 'parsed' | 'reviewed' | 'completed';
}

interface AmazonTransactionMatch {
  orderNumber: string;
  transactionId: string;            // Matched bank transaction
  matchConfidence: 'high' | 'medium' | 'low' | 'manual';
  items: {
    name: string;
    estimatedPrice: number | null;
    suggestedCategoryId: string | null;
    appliedCategoryId: string | null;  // null until user approves
    confidence: number;
  }[];
  splitTransactionIds: string[];     // Populated after split is applied
  status: 'pending' | 'categorized' | 'split' | 'skipped';
}
```

### 7.3 What NOT to Persist

- Raw PDF files (process in memory, discard after parsing)
- Card numbers (strip from parsed data before saving)
- Item images or thumbnails

### 7.4 Storage

Follow existing patterns — JSON file per user in `backend/data/`, e.g., `amazon_receipts_{userId}.json`. Managed through `StorageService` for filesystem/S3 compatibility.

---

## 8. Functional Requirements

### 8.1 Upload and Parse

| # | Requirement |
|---|-------------|
| REQ-001 | The system must accept PDF uploads from the Transactions page via a dedicated "Match Amazon Receipts" button. |
| REQ-002 | The system must auto-detect whether the uploaded PDF is an Amazon Orders page or a Payments > Transactions page based on content analysis. |
| REQ-003 | The system must extract structured order data (order numbers, dates, amounts, item names) from the PDF using Claude's vision/document capabilities. |
| REQ-004 | If the PDF cannot be parsed (unrecognized format, corrupted, not Amazon), the system must return a clear error message and not charge against the AI cost cap. |
| REQ-005 | The system must support multi-page PDFs (Amazon order history spanning multiple pages). |

### 8.2 Matching

| # | Requirement |
|---|-------------|
| REQ-006 | The system must match parsed orders against all Amazon-merchant transactions (identified by merchant name pattern, regardless of current category) using amount + date window matching. |
| REQ-007 | Each match must include a confidence level: high (exact amount, ±3 days), medium (exact amount, ±7 days), or low (ambiguous — multiple candidates). |
| REQ-008 | Unmatched orders (no corresponding transaction found) must be displayed separately and clearly labeled. |
| REQ-009 | The user must be able to manually link an unmatched order to any Amazon transaction, or dismiss it. |
| REQ-010 | The system must not re-suggest changes for transactions the user has previously skipped or rejected. User decisions are tracked in session data and persist across uploads. |
| REQ-010a | For matched transactions that already have a non-Amazon category, the system must display them with their current category and flag them as "already categorized." The user can choose to recategorize but the system must not default to changing them. |

### 8.3 Categorization

| # | Requirement |
|---|-------------|
| REQ-011 | For each matched order, the system must recommend a category based on item description(s), using the user's existing category hierarchy and categorization history as context. |
| REQ-012 | Each recommendation must include a numeric confidence score (0.0–1.0) displayed to the user as High/Medium/Low with the numeric value. |
| REQ-013 | Recommendations must be presented in confidence order (highest first) for efficient batch approval. |
| REQ-014 | The user must be able to approve, change the category, or skip each recommendation. |

### 8.4 Split Recommendations

| # | Requirement |
|---|-------------|
| REQ-015 | For multi-item orders where items span different categories, the system must recommend splitting the transaction. |
| REQ-016 | Each split recommendation must include: item name, estimated amount, and suggested category. |
| REQ-017 | When per-item prices are not available from the PDF, the system must clearly indicate that amounts are estimated. |
| REQ-018 | The user must be able to adjust split amounts before confirming. The system must validate that split amounts sum to the original transaction total. |
| REQ-019 | Approved splits must be created via the existing split transaction API, preserving all existing split behavior (parent hidden, children inherit metadata). |
| REQ-020 | If all items in a multi-item order map to the **same** category, the system should recommend a simple recategorization instead of a split. |

### 8.5 Auto-Categorization Rule Suggestions

| # | Requirement |
|---|-------------|
| REQ-020a | After all matches are processed, the system must identify recurring Amazon purchases (Subscribe & Save items, repeated products across sessions) and suggest auto-categorization rules. |
| REQ-020b | Each rule suggestion must include: the detected pattern, target category, frequency observed, and example transactions that would match. |
| REQ-020c | Since bank transaction descriptions for Amazon don't contain product names, rules must match on merchant pattern + amount range (e.g., "AMAZON MKTPL charge of $30–$32" → Pet Supplies for recurring bedding orders). |
| REQ-020d | The system must not suggest rules that duplicate existing auto-categorization rules. |
| REQ-020e | The user must be able to approve, edit, or dismiss each rule suggestion. Approved rules are created via the existing auto-categorize rules API. |
| REQ-020f | Rule suggestions should leverage session history — if the same product has been matched across multiple upload sessions, that strengthens the rule suggestion confidence. |

### 8.6 Session Management

| # | Requirement |
|---|-------------|
| REQ-021 | Parsed order data and match results must be persisted per-user for deduplication across uploads. The active review flow is single-session (complete or start over — no incremental resumption). |
| REQ-022 | On subsequent uploads, the system must detect previously processed orders (by order number) and skip them, showing only new matches. |
| REQ-023 | ~~The user must be able to view a history of past receipt matching sessions and their outcomes.~~ **Deferred** — session data persists for deduplication but no history browsing UI in V1. |
| REQ-024 | The user must be able to delete session data if they no longer want it stored. |

### 8.7 Summary and Feedback

| # | Requirement |
|---|-------------|
| REQ-025 | After processing, show a summary: transactions recategorized, transactions split, items skipped, unmatched orders, rules created. |
| REQ-026 | The summary should include total dollar amount moved out of `CUSTOM_AMAZON` into specific categories — this is the core value metric the user cares about. |

---

## 9. API Design

### 9.1 New Endpoints

**POST /api/v1/amazon-receipts/upload**
- Auth: required
- Body: multipart form data with 1–2 PDF files (field name: `pdfs`)
- Response: `{ sessionId: string, pdfTypes: ('orders' | 'transactions')[], parsedOrders: ParsedAmazonOrder[], parsedCharges: ParsedAmazonCharge[], costUsed: number }`
- Validates file type, size, page count per file
- Auto-detects PDF type (orders vs. transactions) per file
- Parses each PDF via Claude vision API
- Cross-references on order number when both types are provided
- Persists parsed results to session storage

**POST /api/v1/amazon-receipts/:sessionId/match**
- Auth: required
- Body: `{ }` (no additional input — matches against existing transactions)
- Response: `{ matches: AmazonTransactionMatch[], unmatched: ParsedAmazonOrder[], ambiguous: AmbiguousMatch[] }`
- Runs matching algorithm against `CUSTOM_AMAZON` transactions

**POST /api/v1/amazon-receipts/:sessionId/categorize**
- Auth: required
- Body: `{ matchIds: string[] }` (which matches to generate recommendations for)
- Response: `{ recommendations: CategoryRecommendation[], splitRecommendations: SplitRecommendation[], costUsed: number }`
- Calls Claude to categorize items based on descriptions

**POST /api/v1/amazon-receipts/:sessionId/apply**
- Auth: required
- Body: `{ actions: ApplyAction[] }` where each action is a recategorization or split approval with user-confirmed values
- Response: `{ applied: number, splits: number, skipped: number, summary: SessionSummary }`
- Executes category updates and splits via existing services

**GET /api/v1/amazon-receipts/sessions**
- Auth: required
- Response: `{ sessions: AmazonReceiptSession[] }`
- Returns session history for the user

**DELETE /api/v1/amazon-receipts/:sessionId**
- Auth: required
- Deletes session data

### 9.2 Existing Endpoints Used

- **PUT /api/v1/transactions/:id** — Update category on single transactions
- **POST /api/v1/transactions/:id/split** — Create split transactions
- **GET /api/v1/transactions** — Fetch Amazon transactions for matching
- **GET /api/v1/categories** — Fetch category hierarchy for recommendations

---

## 10. Cost Considerations

| Factor | Estimate |
|--------|----------|
| PDF parsing via Claude vision (5-page orders PDF) | ~$0.15–0.25 (image tokens + structured extraction) |
| Categorization call (~20 matched items + category context) | ~$0.05–0.10 |
| Total per upload session | ~$0.20–0.35 |
| Monthly estimate (2-3 uploads/month) | ~$0.60–1.05 |

Well within the $20/month shared cap. PDF vision parsing is the most expensive step — the actual categorization reuses the same patterns as the existing AI Categorizer and is inexpensive.

---

## 11. Assumptions

| # | Assumption |
|---|------------|
| A-1 | Users will upload PDFs via print-to-PDF from their browser. The system does not need to connect to Amazon directly or use Amazon's API. |
| A-2 | The Amazon Orders page PDF provides sufficient item detail for accurate categorization, even without per-item prices. |
| A-3 | Amount-based matching with a date window is reliable enough for V1. Our analysis of real data showed ~80% exact-match rate on amount alone. |
| A-4 | Claude's vision capabilities can reliably extract structured data from Amazon's print-to-PDF format. This should be validated with a spike before full implementation. |
| A-5 | Sonnet is the right model for both PDF parsing and categorization — fast enough, accurate enough, cost-effective. |
| A-6 | The system matches all Amazon-merchant transactions regardless of current category. User decisions (skip/reject) are persisted to prevent recommendation churn. Most actionable value comes from `CUSTOM_AMAZON` transactions, but already-categorized transactions may benefit from split recommendations. |
| A-7 | The existing split transaction infrastructure (API, UI patterns, parent/child model) is sufficient — this feature adds a new entry point for splits, not a new split mechanism. |

---

## 12. Out of Scope

| Item | Rationale |
|------|-----------|
| Amazon API integration | Privacy concerns, API complexity, and account linking overhead. PDF upload is simpler and user-controlled. |
| Amazon order history CSV import | Amazon's "Order History Reports" CSV export feature no longer exists as of 2026. Not a viable path. |
| Non-Amazon retailers | This BRD targets Amazon specifically due to its volume and opacity. The pattern could generalize to Walmart, Target, etc. in the future. |
| Automatic PDF fetching | No browser extensions, email parsing, or Amazon account connections. User manually uploads. |
| Per-item price lookup | The system estimates prices via Claude's knowledge, not by scraping Amazon product pages. |
| Retroactive split price verification | If the user uploads a PDF months later, the system won't verify whether estimated prices were accurate. |
| Real-time transaction matching | This is a batch process triggered by PDF upload, not a sync-time enhancement. |
| Chatbot integration | This is a structured button-driven flow, not a conversational feature. The chatbot does not participate in upload, matching, or approval steps. |

---

## 13. Decisions Log

| # | Decision | Resolution |
|---|----------|------------|
| D-1 | **UX model**: This is a structured, button-driven flow — not a chatbot feature. Separate entry point from AI Categorize, but shared downstream UI patterns (approve/edit/skip). The AI Categorizer may hint at this feature when it encounters Amazon transactions. | Resolved |
| D-2 | **Matching scope**: Match against all Amazon-merchant transactions regardless of current category, not just `CUSTOM_AMAZON`. User decisions (skip/reject) are persisted to prevent churn on transactions already decided. | Resolved |
| D-3 | **Amazon CSV export**: Amazon's "Order History Reports" feature no longer exists as of 2026. PDF upload is the only viable external data source. Removed from scope and future considerations. | Resolved |
| D-4 | **Auto-categorization rules**: Yes — the system should detect recurring Amazon purchases (Subscribe & Save, repeated orders) and suggest auto-categorization rules after the review flow. | Resolved |
| D-5 | **Multi-file upload**: Accept 1–2 PDFs per session (one orders, one transactions). When both provided, cross-reference on order number for highest-quality matching. Pulled from §4.2 future consideration into V1. | Resolved |
| D-6 | **Session resumability**: Single-session flow — complete the review or start over. No incremental resumption. Session data persists for deduplication only. | Resolved |
| D-7 | **Session history UI**: Deferred. No history browsing UI in V1. Session data persists for deduplication but is not user-visible. | Resolved |
| D-8 | **Auto-rule amount matching**: Deferred. V1 auto-categorization rules use existing pattern-only format (merchant name matching). Amount-range matching requires rule infrastructure changes and is low-value without more data. | Resolved |
| D-9 | **File upload infrastructure**: Multer with in-memory buffer. PDFs are held in memory during parsing, never written to disk or S3. Parsed results are persisted; raw PDFs are discarded. | Resolved |

## 14. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | What happens when the user has multiple Amazon accounts (e.g., personal + household)? Should sessions track which account the PDF came from? | Open |
| 2 | Is 20MB / 50 pages a reasonable file size limit? Need to validate with real-world PDFs — a full year of Amazon orders could be large. | Open |
| 3 | For auto-categorization rules on Amazon purchases: since bank descriptions don't contain product names, rules must match on merchant pattern + amount range. Is this too brittle for items with fluctuating prices? Should rules use a wider amount tolerance? | Open |

---

## 15. Success Criteria

- Users can recategorize 20+ Amazon transactions in under 5 minutes (vs. 30+ minutes of manual lookup and categorization).
- Amount-based matching achieves ≥80% confirmed match rate against real user data.
- Category recommendations achieve ≥75% user acceptance rate (approved without changes).
- Split recommendations correctly identify multi-category orders ≥70% of the time.
- The `CUSTOM_AMAZON` category balance decreases by ≥50% after a typical upload session.
- Auto-categorization rules from Subscribe & Save detection reduce future uncategorized Amazon transactions.
- Total cost per session stays under $0.50.
- PDF parsing succeeds on ≥95% of standard Amazon print-to-PDF exports.

---

## 16. Future Considerations

**V2 enhancements to evaluate after V1 usage:**
- ~~**Cross-PDF correlation**~~ — **Pulled into V1** (D-5). Upload 1–2 PDFs per session with automatic cross-referencing
- **Generalization** — Apply the same pattern to other high-volume opaque merchants (Walmart.com, Target.com, Costco.com)
- **AI Categorizer integration** — When the AI Categorizer encounters a batch of Amazon transactions, surface a contextual prompt: "15 of these are Amazon — upload your order history for better results?"
- **Email receipt parsing** — Parse Amazon order confirmation emails as an alternative to PDF upload
- **Smarter auto-rules** — Use item-level data across sessions to build richer auto-categorization rules (e.g., "Amazon charges around $31 every 6 weeks" → Pet Supplies, based on recurring Kaytee bedding orders)
