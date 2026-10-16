# AI-Powered Bulk Categorization — Business Requirements Document

**Status:** v1.0 shipped (7e4c1ad, 2026-04-05) · v2.0 Draft
**Author:** Jared Carrano
**Date:** 2026-04-05 (v1.0) · 2026-10-15 (v2.0)
**Version:** 2.0

> **v2.0 (2026-10-15)** adds run transparency, Plaid-category evidence, a smarter rule step, and a durable run record with optional user notes. See [§12](#12-v20-enhancements). Sections 1–11 describe v1.0 as shipped, amended where v2.0 or the 2026-10-15 fix superseded them.

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
| A-3 | ~~Sonnet is the right model for classification.~~ **Superseded 2026-10-15:** Opus 5.5 at `effort: medium`, one constant in `categorizationService.ts`. The user still does not select the model (§12.3 D-V2-1). |
| A-4 | The existing bulk update endpoint (max 100 per request) is sufficient. Multiple requests can be chained for larger batches. |
| A-5 | This feature shares the chatbot's cost tracking and monthly cap. |

---

## 9. Out of Scope

| Item | Rationale |
|------|-----------|
| Auto-categorization on sync | Future enhancement — automatically categorize new transactions as they arrive |
| Category creation suggestions | V1 maps to existing categories only; suggesting new categories adds complexity |
| Confidence score display to user | Internal implementation detail; user sees grouped buckets, not scores. (v2.0 shows the model's one-sentence *reason* per row, not a score — §12.4.1) |
| Undo/rollback of applied categories | User can manually re-categorize; bulk undo adds complexity |
| Transaction description updates | This feature only changes `categoryId`, not descriptions |

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should the "Unsure" bucket allow the user to ask the chatbot for help on individual transactions? (e.g., "What do you think this one is?") | Folded into v2.1 chat-about-a-run (§12.2) |
| 2 | Should we show the AI's reasoning for each suggestion (the `reasoning` field), or is that visual clutter? | **Resolved v2.0:** show it, one sentence per row (REQ-101) |
| 3 | What's the right batch size for Claude calls — 50, 100, or 200 transactions per call? Tradeoff between cost/latency and context quality. | **Resolved 2026-10-15:** 50 per request, sent as 2 parallel calls of 25; a truncated call splits in half and retries |
| 4 | Should the feature auto-trigger on login if uncategorized count exceeds a threshold, or always be manual? | Open |

---

## 11. Success Criteria

- Users can categorize 100+ transactions in under 2 minutes (vs. 30+ minutes manually).
- AI classification accuracy is 80%+ for high-confidence suggestions (measured by user acceptance rate).
- Auto-categorization rule suggestions reduce future uncategorized transactions by 50%+.
- Cost per session stays under $0.50 for typical usage.
- The flow feels fast — classification completes in under 10 seconds for 100 transactions.

---

## 12. v2.0 Enhancements

### 12.1 Why

On 2026-10-15 a run over 70 uncategorized transactions reported **"Categorization Complete — 0 transactions categorized"** and charged $0.10. The model's output had been cut off at the token limit; the truncated tool input was accepted without validation and read as an empty result. Nothing on screen said so.

The silent failure itself is fixed (271ecd5: stop-reason handling, Zod validation, split-and-retry, every transaction reconciled to an outcome, and an error instead of an empty success). That fix also moved the feature to Opus 5.5. The incident exposed four gaps that v2.0 addresses:

1. **No visibility.** The user cannot see why a suggestion was made, or why a transaction was not classified.
2. **An unused signal.** Plaid tags every transaction with a category, which we store and never send to the model.
3. **No memory.** Nothing records what the AI suggested or what the user did instead, so accuracy cannot be measured and corrections cannot be learned from.
4. **A weak rule step.** The rule-suggestion call sees only the final categorizations, not what the AI got wrong or how messy the merchant names are.

### 12.2 Scope

| Item | Release |
|------|---------|
| Run report: per-row reasons, plain-language failure reasons, end-of-run summary | **v2.0** |
| Plaid category + the user's history with it, as evidence for the model | **v2.0** |
| Smarter AI rule suggestions | **v2.0** |
| Durable run record: suggestion vs. final outcome per transaction | **v2.0** |
| Optional "Why?" note when the user changes a suggestion (recorded only) | **v2.0** |
| Chat with the agent about a past run | v2.1 |
| Standing family "How we categorize" notes sent with every run | v2.1 |
| Feeding recorded corrections and notes back into classification | v2.1 or later, once there is data to evaluate it against |
| Live progress or the model's raw thinking during a run | **Dropped** (D-V2-2) |

### 12.3 Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D-V2-1 | One model, chosen by us — no user-facing model picker. Opus 5.5, `effort: medium`. | With two users, a picker hands over a decision nobody has data to make, and every option needs its own pricing and testing (REQ-P056). The run record (§12.4.4) gives us the data to change it. |
| D-V2-2 | Show **decisions**, not process: a reason per row and a summary at the end. No live progress line, no streamed thinking. | The useful part of the thinking is the one-sentence reason, read where the decision is made. Raw thinking for 25 transactions at once is long and would be skipped. |
| D-V2-3 | Plaid's category is **evidence, never a decision.** The model receives a table of how the family has categorized each Plaid category in the past, and decides. | The same restaurant can be a weekday lunch, a family outing, or a party pickup. Even an 80% pattern has outliers worth protecting. Only an auto-categorization rule the user explicitly created makes a decision automatic. |
| D-V2-4 | Rules stay AI-suggested in the flow, with better inputs. The deterministic suggestions on the Categories page stay as they are. | Rule-making is where judgment pays: messy processor names, split merchant histories, explaining a proposal. The Categories-page engine remains a free baseline; merge the two only if they visibly confuse. |
| D-V2-5 | Record every run in full — suggestion, confidence, reason, Plaid category, and final outcome for every transaction — kept 12 months. | One record serves learning (corrections), measurement (acceptance rate, whether Plaid evidence helped, model changes) and v2.1 chat. A corrections-only record loses the denominator. |
| D-V2-6 | An optional one-line note, offered only when the user changes a suggestion. Recorded, never sent to a model in v2.0. | The note captures *why*, which cannot be recovered later. Keeping v2.0 free of user-text feedback into the model keeps the Plaid-evidence measurement clean. Standing family notes (higher leverage, but they change behavior directly) follow in v2.1. |

### 12.4 Functional Requirements

#### 12.4.1 Run report

| # | Requirement |
|---|-------------|
| REQ-101 | Every row in bucket review must show the model's one-sentence reason for its suggestion. |
| REQ-102 | Every transaction that could not be classified must appear in Unsure with a plain-language reason (cut off, declined, skipped, unknown category, unexpected format) and no preselected category. *(Backend shipped in 271ecd5; the UI does not display the reason yet.)* |
| REQ-103 | A run that produces no usable suggestions must show an error with the reason. It must never show "Complete". *(Shipped in 271ecd5.)* |
| REQ-104 | The summary step must show: transactions classified, transactions in Unsure grouped by reason, transactions applied / changed / skipped, rules created, the run's cost, and the model used. |
| REQ-105 | The summary must stay accurate when the user closes the modal early: the counts reflect what was actually applied. |

#### 12.4.2 Plaid category evidence

| # | Requirement |
|---|-------------|
| REQ-110 | Each transaction sent for classification must include its Plaid category, both the broad and the detailed level, when present. |
| REQ-111 | Before the model call, code (not the model) must build a mapping table from the family's categorized, non-removed transactions of the last 12 months: for each Plaid category, the count of transactions in each of the family's categories. The detailed level is used when it has at least 3 examples; otherwise the broad level. Hidden categories are excluded. |
| REQ-112 | The mapping table is sent to the model as evidence. The prompt must say that it is a tendency, not a rule, and that the merchant, amount and date can outweigh it. |
| REQ-113 | When the mapping influenced a suggestion, the row's reason must say so (e.g., "Plaid says Restaurant; you file 89% of those under Dining"). |
| REQ-114 | No transaction may be categorized without the model, except by an auto-categorization rule the user created. |
| REQ-115 | Plaid category strings must be validated as Plaid's enumerated form (upper-case letters and underscores) before they reach the prompt; anything else is dropped. |

#### 12.4.3 Rule suggestions

| # | Requirement |
|---|-------------|
| REQ-120 | The rule-suggestion call must receive this run's outcomes: which suggestions were accepted, which were changed and to what, and which were skipped. |
| REQ-121 | It must not propose a rule for a merchant whose history is split across categories. It must list such merchants as "considered, no rule" with the split (e.g., "Blue Bottle: 9× Coffee, 3× Work Meals"), shown collapsed below the proposals. |
| REQ-122 | Proposed patterns must be normalized past payment-processor noise (`SQ *`, `TST*`, `PAYPAL *`, store numbers), e.g. `SQ *BLUE BOTTLE 0412` → `BLUE BOTTLE`. |
| REQ-123 | Each proposal must carry a one-sentence rationale shown to the user. |
| REQ-124 | It must not propose a rule that duplicates an existing rule. *(Existing REQ-020.)* |
| REQ-125 | Rules match merchant/description text only, never a Plaid category. |
| REQ-126 | The rule-suggestion output must be Zod-validated and its stop reason checked; a failure skips the rule step with a visible message rather than silently. |

#### 12.4.4 Run record

| # | Requirement |
|---|-------------|
| REQ-130 | Each classification request must create a run record and return its `runId`. The record holds, per transaction: suggested category, confidence, reason, Plaid category, and failure reason if any; and per run: model, effort, cost, duration, counts, and timestamp. |
| REQ-131 | As the user works through buckets, the client must report each row's outcome to the run: **accepted** (applied as suggested), **changed** (applied to a different category), or **skipped**, with the optional note. |
| REQ-132 | The server must validate reported outcomes: the transaction must belong to the run, and the category must exist and not be hidden. |
| REQ-133 | Recording an outcome must never block or fail applying a category. A recording failure is logged, not surfaced as an apply error. |
| REQ-134 | Runs are stored per family and pruned to the last 12 months on write. |
| REQ-135 | A maintainer script must print, per run: acceptance rate overall and by confidence, how often the Plaid mapping was cited and its acceptance rate, failures by reason, cost, and the notes left. |

#### 12.4.5 User notes

| # | Requirement |
|---|-------------|
| REQ-140 | When the user changes a row's category from the AI's suggestion, an optional one-line "Why?" field appears for that row. It never appears on an unchanged row. |
| REQ-141 | Notes are limited to 200 characters and stored with the row's outcome. |
| REQ-142 | In v2.0, notes are never sent to a model. They are read only by the maintainer script. |

### 12.5 Security Requirements

| # | Requirement |
|---|-------------|
| SEC-101 | Notes are untrusted text. They pass through `redaction.ts` before storage. When a later release feeds them to a model, they go in as data inside tool results, never as instructions (extends SEC-002). |
| SEC-102 | The run record is not reachable from the chatbot's `ReadOnlyDataService` in v2.0. Making it readable for v2.1 chat requires its own security review. |
| SEC-103 | The run record holds transaction descriptors and amounts; it is family-scoped and treated with the same care as transaction data. The classify and outcome routes stay behind `refuseBusinessWorkspace`. |
| SEC-104 | Outcome reporting can only write to the run record. It cannot change a transaction; applying categories continues through the existing bulk-update endpoint. |

### 12.6 Cost

Measured on 2026-10-15: one Opus 5.5 call on 2 transactions cost about $0.009. Estimated for a real run: **$0.30–0.40 per 50 transactions** (thinking tokens on messy descriptors dominate). The Plaid mapping table adds a few hundred input tokens per call, which is negligible. The rule step is one further Opus call, estimated $0.05–0.10. A 70-transaction backlog costs about $0.50–0.60 in total, well inside the $20/month interactive cap.

The cost tracker records this spend under its `opus` row, still priced for Opus 5 ($5/$25), so the cap overstates Opus 5.5 ($4/$20) by 25%. That is the safe direction; correct it when the chatbot also moves to 5.5 (REQ-P056).

### 12.7 Success Criteria

- No run ever reports an empty success. Every transaction sent ends with a suggestion or a stated reason.
- High-confidence suggestions are accepted unchanged at least 85% of the time, measured from run records.
- The acceptance rate of suggestions that cite the Plaid mapping is reported separately, so its effect can be judged against runs that do not.
- At least one rule is proposed or a merchant explicitly declined in most runs over 20 transactions.
- Cost stays under $0.50 per 50 transactions.

### 12.8 Open Questions

| # | Question | Default |
|---|----------|---------|
| V2-Q1 | Measuring whether Plaid evidence helps needs a baseline, and v1 kept no records. Ship the run record first and run a few times without the mapping? | Yes: ship the run record and run report first, Plaid evidence second (see the plan's implementation order). |
| V2-Q2 | Should the summary link to a list of past runs? | No in v2.0. A run history UI arrives with v2.1 chat, which needs it. |
