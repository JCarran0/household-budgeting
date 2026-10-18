# Household Ledger — Business Requirements Document

**Author:** Jared Carrano
**Date:** 2026-10-17
**Version:** 1.0 (discovery)
**Plan:** [HOUSEHOLD-LEDGER-PLAN.yaml](HOUSEHOLD-LEDGER-PLAN.yaml)
**Supersedes:** Family Library BRD roadmap Phase 2 ("Facts")

> This document states what the system must do and why. How it is built, what
> has shipped, and in what order lives in the plan.

---

## 1. Overview

### 1.1 Vision

The Family Library lets the assistant *answer* questions about what the family has signed. It cannot *notice* anything. The refund window on the Rivian Care contracts closes in December whether or not anyone asks about it; the solar production audit arrives in 2027 whether or not anyone remembers the guarantee; and the fact that the arbitration opt-out email went out on 2026-10-17 exists only in a Gmail sent folder.

The Household Ledger is the app's memory of **facts about the household that matter later**: dates, deadlines, terms and things the family did. It is the single place the assistant and the reminder system both read from.

### 1.2 Problem Statement

Three needs surfaced together during the first library import:

1. **Memory.** Events no document records ("we sent the opt-out email") need to be known to the assistant in later conversations.
2. **Facts.** Dates and terms buried in contracts should be held as structured records, so nobody re-reads 44 pages to learn a deadline — and so code, not a model, can do date arithmetic.
3. **Attention.** The app should surface what is coming due before it is due, rather than only answering when asked.

### 1.3 Solution Summary

One **ledger of facts**, each with a subject, an optional date rule, and a **source** that determines how it was allowed in. Document facts are extracted at import by two independent models and verified against the source text by code; user facts enter through a confirmation card or a form; app facts are written by deterministic code. A daily job applies **date rules** to the ledger and sends reminders. A **Household page** shows and edits everything the assistant can see.

### 1.4 Users

| User | Role |
|------|------|
| Household members (Jared, Johanna) | See the Heads-up list and Household page, mark items handled, snooze and mute their own reminders, add and correct facts, confirm "Remember this" cards |
| Maintainer (Jared) | Runs fact extraction at import, approves extracted facts, pushes them to production |
| Assistant | Reads the ledger (T0). Proposes facts and "handled" marks through confirmation cards (T1). Never writes on its own |

---

## 2. Roadmap

| Phase | Scope | Exit signal |
|-------|-------|-------------|
| **1. Ledger** (this BRD) | Fact store, date rules, two-model extraction for the six library documents, Household page, Heads-up card, daily push reminders, "Remember this" and "mark handled" chat cards | The refund-window reminder for the Rivian Care contracts fires before 2026-12-16, and the opt-out deadline shows as handled |
| **2. Measured obligations** | Compare app data against a fact: logged solar production vs. the guaranteed cumulative kWh; a recurring payment vs. the lease schedule | The solar shortfall is visible in the app before the first production audit (~May 2027) |
| **Later** | Weekly AI briefing over the ledger (D-H03 alternative); business workspace enablement (D-H07); "track a warranty?" prompts from purchases | Triggered by demand |

---

## 3. Requirements

### 3.1 The Fact Record

- **REQ-H001** A fact has: `id`, `subject` (the asset or area, matching library `subject` where one exists, e.g. "2027 Rivian R2"), `title`, optional `detail`, `kind`, an optional date rule, `source`, and `status`.
- **REQ-H002** `kind` is one of `deadline`, `expiration`, `recurring`, `window` (opens and closes) or `note` (undated). Undated free-text memories are `note` facts, not a second store (D-H01).
- **REQ-H003** Amounts are stored as **verbatim text** as printed ("$2,078.45"), never parsed into numbers the assistant could re-format.
- **REQ-H004** A date is either a literal calendar date or a **rule**: an anchor date plus an offset (days, months or years), optionally recurring every N months/years until an end. **Code computes every derived date; a model never does date arithmetic** (D-H05). Dates are calendar dates in the household's time zone, America/New_York — the zone the app already uses (`shared/utils/easternTime.ts`, `etDateString()`); the date engine takes `today` as an argument and never reads a clock.
- **REQ-H005** Stored `status` is `active` or `withdrawn` (a re-import no longer finds a document fact). *Handled* and *overridden* are **derived**, never stored: an occurrence is handled while an active fact `handles` it, and a fact is overridden while an active correction `overrides` it — so withdrawing the mark or the correction restores the original with no second write to keep in sync. History is never deleted for document facts.

### 3.2 Sources and Write Gates (D-H02)

Every write passes a human gate or is deterministic code. The gate depends on the source:

- **REQ-H010 Document facts** are proposed at import by `/import-document`, never by the live assistant. Each carries `docId`, `page` and a **quote**; a date rule carries the quote for its anchor too. **Code verifies every quote appears verbatim on the cited page** of the stored, redacted document body, at staging and again at push. A fact that fails is rejected, not flagged.
- **REQ-H011 Two models extract independently** (different model families). The maintainer reviews the union, with facts found by only one model marked. The point is recall: verification proves what was extracted is real; only a second reader catches what was missed (D-H05).
- **REQ-H012 User facts** enter through (a) a **"Remember this" confirmation card** the assistant proposes in chat, showing every field that will be written (the SEC-P010 rule), or (b) a form on the Household page. Either way a household member is the gate.
- **REQ-H013 App facts** are written by deterministic code only — e.g. "marked handled by Jared on 2026-10-19".
- **REQ-H014** The assistant **never writes a fact without a confirmed card**. Ledger writes are T1 and never T2-eligible.
- **REQ-H015** User-entered text passes the same shape-based redaction as library documents before storage, and the person saving it sees the result. Financial identifiers do not enter the ledger by any path.

### 3.3 Corrections and Handling

- **REQ-H020** A document fact cannot be edited in place — that would break its verbatim-quote guarantee. A **correction fact** overrides it; the original stays visible, marked overridden.
- **REQ-H021** User facts can be edited and deleted by household members.
- **REQ-H022** Marking a deadline **handled** is a household fact: it closes the occurrence for both members and is recorded as a fact (`handles: <factId>`, plus the occurrence date for recurring facts). A user fact can handle a deadline directly — "opt-out email sent 2026-10-17" closes the 2026-11-05 opt-out deadline.

### 3.4 Date Rules and Reminders (D-H03)

- **REQ-H030** Reminders are computed by deterministic date rules. No model is in the reminder path in v1.
- **REQ-H031** Default warning lead times by kind, overridable per fact:

  | Kind | Default warnings |
  |------|------------------|
  | `deadline` | 30 and 7 days before |
  | `expiration` | 90 and 30 days before |
  | `recurring` | 60 days before each occurrence |
  | `window` | when it opens, and 30 days before it closes |

- **REQ-H032** A daily job sends push notifications when a warning date is reached. It is **idempotent** (never sends the same warning twice) and **catches up** (a warning missed while the server was down is sent late, not skipped).
- **REQ-H033** The **Heads-up list** (what is due within its warning window, not handled) is computed on read from the same rules, so it is correct even if the job has not run.
- **REQ-H034** "Make a task" on a Heads-up item creates an ordinary, assignable task linked to the fact; completing that task marks the occurrence handled. Ownership lives in tasks, not in the ledger (D-H06).

### 3.5 Per-Person State (D-H06)

- **REQ-H040** **Handled is shared** (REQ-H022). **Snooze is per person** and stored server-side, because the server sends the notifications. One member's snooze never hides an item from the other.
- **REQ-H041** Notifications go to both members by default. Each member can **mute a subject** for themselves (e.g. one takes the solar reminders, the other the car).

### 3.6 Household Page and Dashboard (D-H04)

- **REQ-H050** A **Household page** lists facts grouped by subject, showing date, kind, status and source. Document facts link to the source document and page; user facts show who added them and when.
- **REQ-H051** Members can add, edit and delete user facts and add correction facts from the page.
- **REQ-H052** The dashboard shows a **Heads-up card** with done / snooze / make-a-task actions.
- **REQ-H053** The page shows everything the assistant can read from the ledger. There are no hidden facts.

### 3.7 Assistant

- **REQ-H060** A T0 read tool returns facts filtered by subject, kind or "due within N days", each with its source and computed next date and status.
- **REQ-H061** When an answer relies on a document fact, the assistant cites the document and page carried on the fact (Family Library REQ-F040). For anything beyond the quoted text it reads the document.
- **REQ-H062** T1 chat actions: **remember a fact** and **mark an occurrence handled**. Both show every field on the card. The assistant proposes "Remember this?" when the user states something that will matter later; it never proposes facts drawn from document text (that path is REQ-H010).

### 3.8 Scope

- **REQ-H070** Personal workspace only in v1 (D-H07). The ledger is stored per workspace so the business workspace can be enabled later without migration; the assistant never reads a business ledger regardless (existing route-level refusal).

---

## 4. Security

| ID | Requirement |
|----|-------------|
| SEC-H001 | **The ledger is an agent-readable store, which is safe only because every write is human-gated or deterministic (REQ-H010 – H014).** AI-AGENT-LEARNINGS SEC-L006 forbids the agent reading its own unattended writes because a readable store gives prompt injection durable storage. Any future write path that skips a human gate must not be readable by the agent. |
| SEC-H002 | Document facts are verified verbatim against the stored document by code, at stage and push. A document's text can reach the ledger only as a quoted, located, reviewed fact. |
| SEC-H003 | Ledger chat actions are T1. They must never be registered T2: they are `content`, and widening `T2_PERMITTED_DATA_CLASSES` to admit them would let an unattended run write memory the assistant later trusts. |
| SEC-H004 | **Push payloads carry the minimum**: subject, kind and date — never amounts, account numbers or quotes. Push travels through third-party delivery services. |
| SEC-H005 | Reads and writes are family-scoped by key; a missing or malformed family id fails rather than reading another household. |
| SEC-H006 | Redaction on user-entered text (REQ-H015) runs before storage, so nothing downstream — the assistant, traces, push — sees an unredacted identifier. |

---

## 5. Decisions

| ID | Decision | Rationale / cost |
|----|----------|------------------|
| D-H01 | **One ledger**, with memories as `note` facts — not a separate memory store | The reminder job and the assistant query one place; "deadline 11/5" and "email sent 10/17" sit together so the second can close the first. Cost: free-text notes fit the record loosely |
| D-H02 | **Human-gated writes**, gate chosen by source (document: code verification + maintainer review; user: card or form; app: deterministic code) | A readable store must not be writable without a human (SEC-H001). Cost: a click per memory. Rejected: auto-capture with an undo notice — one missed notice leaves a false "fact" shaping every later answer |
| D-H03 | **Deterministic date rules** for attention in v1; no model in the reminder path | A date is a date: code is free, never forgets and never invents urgency. Cost: only dated facts are caught — measured obligations (solar output) wait for Phase 2. Rejected for v1: a weekly AI briefing; it is the right second layer, not a replacement |
| D-H04 | **Household page with manual editing**; document facts corrected by override, not edit | Members must see and fix exactly what the assistant reads; an override keeps the verbatim-quote guarantee honest. Cost: a new page and a dashboard card |
| D-H05 | **Two-model extraction, quote-verified, code-computed dates** | Verification guarantees precision; the second independent reader is for recall, because a missed deadline is the expensive failure. Code computes anchor + offset so a model's arithmetic is never trusted. Cost: two passes per import and a review list |
| D-H06 | **Handled is shared; snooze and mute are per person**; ownership through tasks | Handled is a fact about the household; snooze is one person's preference — the BvA-dismiss lesson. Cost: server-side per-user preference state |
| D-H07 | **Personal workspace only in v1**; stored per workspace | No business deadline today that the ledger would catch; enabling later is configuration, not migration |

---

## 6. Open Questions

| Question | Note |
|----------|------|
| Re-import semantics | When a document is re-imported and its extracted facts change, stable fact ids (`{docId}:{slug}`) keep handled marks attached; a fact that disappears is marked withdrawn, not deleted. Confirm during the build |
| Scheduler | The backend has no job runner today. The plan proposes an in-process daily runner (single PM2 instance) with an idempotency log; revisit if the deployment ever runs more than one instance |
| Recall measurement | Extend the golden-set runner with "what is due before X?" questions so missed facts show up as failures |

---

## 7. References

- [FAMILY-LIBRARY-BRD.md](FAMILY-LIBRARY-BRD.md) — source documents, answer-trust rules, the solar shortfall motivating case
- [AI-CAPABILITY-PLATFORM-BRD.md](AI-CAPABILITY-PLATFORM-BRD.md) — tiers, confirmation cards, SEC-P010
- [AI-AGENT-LEARNINGS-BRD.md](AI-AGENT-LEARNINGS-BRD.md) — SEC-L006, why an agent must not read its own unattended writes
- [TASK-MANAGEMENT-BRD.md](TASK-MANAGEMENT-BRD.md) — tasks as the ownership mechanism
