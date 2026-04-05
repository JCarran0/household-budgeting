# AI Financial Chatbot — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-05
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

Users have rich financial data in the app — transactions, budgets, spending trends — but extracting insight requires manually navigating pages, applying filters, and doing mental math. Questions like "Are we saving enough for retirement?" or "How much can we afford for this vacation?" have no direct answer in the current UI. Users must synthesize data across multiple views themselves.

### 1.2 Solution Summary

Add an AI-powered chatbot overlay that lets users ask natural-language questions about their financial data and receive conversational, personalized answers. The chatbot has **read-only access to locally-synced data only** (Phase 1) with a hard security boundary preventing any direct Plaid API interaction. Phase 2 adds write operations (categorization, budget edits, etc.) scoped to the same boundary.

### 1.3 Users

Both household users (currently sharing a single login). Multi-user access control deferred to the broader multi-user framework in PROJECT_PLAN.md.

### 1.4 Personality

The chatbot uses a playful amount of Gen Z / Gen Alpha slang and works in occasional puns. The goal is to make financial data review genuinely fun. The tone should be helpful first, funny second — never at the expense of clarity or accuracy with financial data.

---

## 2. Phasing

### Phase 1 — Read-Only Assistant + Issue Reporting

The chatbot can query and reason about financial data but cannot modify it. It can submit GitHub issues on behalf of the user.

### Phase 2 — Write Operations

The chatbot can perform any action the user can perform in the UI, **except** adding, editing, or removing bank account connections (Plaid operations). This includes:

- Categorizing and re-categorizing transactions
- Adding/editing tags and notes on transactions
- Creating and modifying budget amounts
- Splitting transactions
- Creating and editing auto-categorization rules
- Any future user-facing write operations that don't involve Plaid

Phase 2 scope will be defined in a separate document when the time comes.

**The remainder of this BRD covers Phase 1.**

---

## 3. Security Requirements

These are the highest-priority requirements for this feature. Financial data access by an LLM introduces risks that must be structurally mitigated, not just prompt-engineered away.

### 3.1 Plaid Isolation

| # | Requirement |
|---|-------------|
| SEC-001 | The chatbot service must have **zero access** to PlaidService, AccountService connection/disconnection methods, or any method that calls the Plaid API. |
| SEC-002 | The chatbot service must not receive, store, or have access to Plaid credentials (`PLAID_CLIENT_ID`, `PLAID_SECRET`), encrypted access tokens, or the encryption key (`PLAID_ENCRYPTION_SECRET`). |
| SEC-003 | The isolation in SEC-001 and SEC-002 must be enforced at the **service layer** (dependency injection / constructor), not solely via prompt instructions. The chatbot service must be structurally unable to reach Plaid, not merely instructed not to. |

### 3.2 Data Access Boundary

| # | Requirement |
|---|-------------|
| SEC-004 | The chatbot must access financial data exclusively through a purpose-built read-only data access service. It must not receive direct references to writable service methods. |
| SEC-005 | The read-only data access service must expose only query/read methods — no create, update, delete, sync, or connect operations on financial data. |
| SEC-006 | All data queries must be scoped to the authenticated user's data. (When multi-user is implemented, this must extend to household-level scoping with proper authorization.) |

### 3.3 Prompt Injection Mitigation

| # | Requirement |
|---|-------------|
| SEC-007 | Financial data passed to the LLM (transaction names, notes, merchant names) must be treated as untrusted input. The system must use Claude's tool_use architecture to separate data from instructions — raw financial data must never be interpolated into system prompts. |
| SEC-008 | The chatbot must not execute arbitrary code, access the filesystem, or make network requests beyond the Claude API and GitHub Issues API. |
| SEC-009 | The chatbot must not reveal its system prompt, tool definitions, or internal architecture when asked by the user. |

### 3.4 Cost Controls

| # | Requirement |
|---|-------------|
| SEC-010 | The system must enforce a **$20/month spending cap** on LLM API usage. |
| SEC-011 | When the spending cap is reached, the chatbot must inform the user and stop processing new messages until the next billing period. |
| SEC-012 | The system must track token usage and estimated cost per request. |

---

## 4. Functional Requirements — Chat Experience

### 4.1 UI

| # | Requirement |
|---|-------------|
| REQ-001 | The chatbot must be accessible via a floating action button visible on all authenticated pages. |
| REQ-002 | Clicking the button opens a chat overlay panel. The overlay must not obscure critical page content (position bottom-right or similar). |
| REQ-003 | The overlay must include a text input, a scrollable message history, and a close button. |
| REQ-004 | The overlay must include a "New conversation" button to clear the current conversation and start fresh. |
| REQ-005 | The user must be able to select which Claude model to use for responses (e.g., Haiku, Sonnet, Opus). The selection must persist across messages within a session. |

### 4.2 Conversation Behavior

| # | Requirement |
|---|-------------|
| REQ-006 | Conversation history must persist across overlay open/close and page navigation within the same browser session (React state or sessionStorage). |
| REQ-007 | Conversation history must be cleared on page refresh or logout. |
| REQ-008 | The chatbot must be aware of the user's current page context — the current URL, active filters, selected month/year, and any other state reflected in the URL or page. |
| REQ-009 | When the user asks a contextual question (e.g., "How does this compare to last month?" while on the March budget page), the chatbot must use page context to resolve ambiguity. |

### 4.3 Page Context Awareness

| # | Requirement |
|---|-------------|
| REQ-010 | **Prerequisite**: Application filter state, active views, and navigation context must be reflected in the page URL (via query parameters or similar mechanism) so that the chatbot can read current context from the URL without coupling to component state. |
| REQ-011 | The chatbot must receive the current page URL with each message and use it to inform responses. |

---

## 5. Functional Requirements — Data Access

### 5.1 Queryable Data

The chatbot must be able to query the following data through its read-only data access service:

| # | Requirement |
|---|-------------|
| REQ-012 | **Transactions** — Query transactions with filters: date range, category, account, tags, amount range, merchant/name search, status. |
| REQ-013 | **Categories** — Read the full category hierarchy (parents and subcategories), including custom categories. |
| REQ-014 | **Budgets** — Read monthly budget amounts, actuals, and variances for any month. |
| REQ-015 | **Reports** — Access category breakdowns, cash flow summaries, spending trends, and year-to-date analytics. |
| REQ-016 | **Accounts** — Read account names, types, institutions, and balances. Must **not** expose Plaid tokens, item IDs, or connection metadata. |
| REQ-017 | **Auto-categorization rules** — Read existing rules for context when answering categorization questions. |

### 5.2 Capabilities

The chatbot must be able to support these categories of questions:

| # | Requirement |
|---|-------------|
| REQ-018 | **Lookups** — Direct data queries ("How much did we spend at Costco last month?"). |
| REQ-019 | **Trends** — Comparative analysis across time periods ("How has grocery spending changed over 6 months?"). |
| REQ-020 | **Budget tracking** — Budget vs. actual analysis ("Am I on track for my food budget?"). |
| REQ-021 | **Recommendations** — Spending advice and budget review ("Review our March budget, what do you recommend?"). |
| REQ-022 | **Financial planning** — Reason about broader financial questions using transaction data plus conversational context provided by the user ("Are we saving enough for retirement?" — using user-provided goals and context within the conversation). |

---

## 6. Functional Requirements — GitHub Issue Submission

| # | Requirement |
|---|-------------|
| REQ-023 | The chatbot must be able to create GitHub issues on the repository `JCarran0/household-budgeting` when the user reports a bug or requests a feature. |
| REQ-024 | Before submitting, the chatbot must draft the issue (title, body, labels) and present it to the user for confirmation. No issue may be created without explicit user approval. |
| REQ-025 | The chatbot must auto-label issues as `bug` or `enhancement` based on the conversation context. |
| REQ-026 | The issue body should include relevant context: current page URL, browser info, and a summary of the conversation leading to the report. |
| REQ-027 | The GitHub API token used for issue creation must have the minimum required scope (`issues:write` on the single repository). It must not have access to code, deployments, or other repository operations. |

---

## 7. Assumptions

| # | Assumption |
|---|------------|
| A-1 | The Claude API (Anthropic) will be used as the LLM provider. Tool use (function calling) is the mechanism for data access. |
| A-2 | Both household users share a single login for Phase 1. Multi-user chatbot scoping will be addressed alongside the broader multi-user framework. |
| A-3 | URL-based page state (prerequisite REQ-010) will be implemented as a separate effort prior to or in parallel with the chatbot. |
| A-4 | The $20/month cost cap is sufficient for 2 users' conversational usage. This will be validated during initial rollout and adjusted if needed. |
| A-5 | Conversation history does not need server-side persistence for Phase 1. Session-scoped storage is acceptable. |
| A-6 | The chatbot's financial planning responses (retirement, vacation budgets) are conversational reasoning, not certified financial advice. No compliance framework is needed for a personal household tool. |

---

## 8. Out of Scope

| Item | Rationale |
|------|-----------|
| Direct Plaid API access | Core security requirement — chatbot only accesses synced data |
| Write operations on financial data | Phase 2 |
| Server-side conversation persistence | Deferred to future memory system (S3 markdown files) |
| Persistent chatbot memory across sessions | Future enhancement — conversational context is session-only for now |
| Suggested prompts / quick actions | Blank text input for MVP |
| Voice input | Future enhancement |
| Multi-user conversation isolation | Deferred to multi-user framework |
| Mobile-specific chat UI | Mobile app is a separate initiative |
| Streaming responses | Nice-to-have; not required for Phase 1 |

---

## 9. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should the cost cap be per-user or household-wide? (Moot while sharing a login, but relevant for multi-user.) | Open |
| 2 | Should the chatbot surface a cost indicator to the user (e.g., "You've used $X of $20 this month")? | Open |
| 3 | What model should be the default selection — Haiku (cheapest) or Sonnet (best balance)? | Open |
| 4 | Should the chatbot have access to transaction data from all time, or should there be a lookback window for performance? | Open |
| 5 | How should the GitHub PAT be stored and rotated? Environment variable like other secrets, or a separate mechanism? | Open |
| 6 | Should the overlay be resizable or have a fixed size? | Open |

---

## 10. Prerequisites

| # | Prerequisite | Dependency |
|---|-------------|------------|
| P-1 | URL-based page state (nuqs or similar) for filter/view context in URLs | REQ-010, REQ-011 |
| P-2 | GitHub PAT with `issues:write` scope configured as environment variable | REQ-023–027 |
| P-3 | Anthropic API key configured as environment variable | All chat functionality |

---

## 11. Success Criteria

- Users can ask natural-language questions about their spending, budgets, and trends and receive accurate, data-backed answers.
- The chatbot cannot reach Plaid APIs or modify financial data (verified by architectural review, not just testing).
- The chatbot uses page context to resolve ambiguous questions without requiring the user to re-specify filters.
- Users can report bugs and request features conversationally, with issues appearing on GitHub after confirmation.
- LLM costs stay within the $20/month cap under normal usage by 2 users.
- The chatbot makes at least one person laugh per session.
