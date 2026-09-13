# Agent Learnings — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-09-13
**Version:** 1.0
**Parent:** [AI-CAPABILITY-PLATFORM-BRD.md](AI-CAPABILITY-PLATFORM-BRD.md) §15

---

## 1. Overview

### 1.1 Problem Statement

The assistant fails in two ways that never reach the person who could fix them.

**It hits walls silently.** Asked "what's on our list this weekend?", it has no task tools and improvises around the gap. The user shrugs and does it manually. The maintainer never learns that the most-wanted capability is missing, because nobody files a ticket about a chatbot being mildly unhelpful.

**It is occasionally wrong in ways that look right.** A user asked what the household's Subaru maintenance budget was. The assistant stated a monthly figure. The category had no budget set at all. Nothing about the answer looked wrong, and without the user happening to know better, it would have stood.

Both classes are invisible by default. The fix for each is an engineering change, but engineering changes require knowing what broke — and today that knowledge exists only in a conversation that scrolls away.

### 1.2 Solution Summary

A **learnings** collection: durable records of where the assistant fell short, reviewed offline by the maintainer and dispositioned through an `/evaluate-learnings` skill that operates on open items.

Capture is deliberately **split by class**, because the agent is a reliable reporter of one and an unreliable reporter of the other:

| Class | Written by | Why |
|-------|-----------|-----|
| **Capability gap** | The agent, autonomously | It knows its own tool list with certainty. "I was asked about trips and have no trip tools" is a verifiable fact, not an inference. |
| **Quality incident** | A user, by flagging a turn | Captures **evidence only** — the transcript and the tool-call ledger. No agent theory of cause. |

### 1.3 Why the Agent Does Not Diagnose Its Own Failures

The obvious design — let the agent notice it was wrong and write down why — is the one this document rejects. It is worth stating plainly, because the Subaru incident is exactly the case it would be aimed at, and exactly the case it handles worst.

That failure had three causes, all in tool design (see AI-CAPABILITY-PLATFORM-BRD §15.1): results carried category IDs but no names, forcing a join; a category with no budget was simply absent from the result, making "unbudgeted" indistinguishable from "not looked up"; and the tool description promised actuals it never returned.

**None of that is observable from inside the conversation.** An agent asked "why did you say $500?" would produce a fluent, confident, plausible account — which is the same failure mode that produced the $500, one level up. Confabulation about confabulation is not a diagnosis.

So the design captures what a wrong answer leaves behind — what the model was actually handed — and lets a human read it. **(D-L01)**

### 1.4 Users

| Actor | Role |
|-------|------|
| Both household users | Flag a turn as wrong. See an inline notice when the agent records a gap. Never review or disposition learnings. |
| Maintainer (Jared) | Reviews open learnings offline, decides disposition, implements fixes. |
| The agent | Writes capability-gap records. **Never reads them.** See SEC-L006. |

---

## 2. Capture

### 2.1 Capability Gaps — Agent-Written

The agent records a gap through a `record_learning` tool when it cannot do something a user asked for, or could have answered better with data it cannot reach.

| ID | Requirement |
|----|-------------|
| REQ-L001 | The agent may write a learning autonomously — no confirmation card, no click. |
| REQ-L002 | Every autonomous write must surface an inline notice in the conversation ("Noted — I can't see your tasks yet"). Nothing is written invisibly, and the notice doubles as an explanation of why the answer was thin. |
| REQ-L003 | The `record_learning` tool schema must accept **only** `kind: 'capability_gap'`. The tool is structurally incapable of expressing a quality incident, so D-L01 is enforced by the schema rather than by prompt instruction. **Implemented** by omitting `kind` from the tool schema entirely — the model has no field to set — and by the store exposing `recordCapabilityGap` rather than a generic `record(kind, …)`. Both are asserted in `agentLearningsToolSurface.test.ts`. |
| REQ-L004 | A learning must carry a `capabilityKey` — a coarse, enumerated slug (`tasks.read`, `trips.read`, `budgets.write`) — chosen from a server-side list. Free-text-only records cannot be clustered or counted. |
| REQ-L005 | A `capabilityKey` not in the enumerated list must be rejected at the edge and returned to the model as a tool error so it can self-correct within the existing iteration limit. |
| REQ-L006 | The agent must not record a gap for a capability it possesses but failed to use. That is a quality incident, and the user path handles it. |

### 2.2 Quality Incidents — User-Flagged

| ID | Requirement |
|----|-------------|
| REQ-L010 | Every assistant turn carries a lightweight "this is wrong" control. |
| REQ-L011 | Flagging captures the incident bundle defined in AI-CAPABILITY-PLATFORM-BRD §10.2: the verbatim transcript turn, the full tool-call ledger with raw results, model, token counts, and stop reason. |
| REQ-L012 | The user may add an optional free-text note ("the Subaru budget is actually zero"). The note is the user's, and must be stored distinctly from anything the model wrote. |
| REQ-L013 | Flagging must never invoke the LLM. It is a capture action, not a conversation — it costs nothing and cannot fail on a spent budget. |
| REQ-L014 | The flagged turn must be visibly marked in the conversation so the user knows the flag registered. |

### 2.3 Deduplication

A missing capability will be hit repeatedly. Without clustering, the collection becomes forty copies of "I can't see tasks" and stops being read.

| ID | Requirement |
|----|-------------|
| REQ-L020 | Every learning carries a `fingerprint` derived from `kind` + `capabilityKey` + a normalized summary. |
| REQ-L021 | A write whose fingerprint matches an existing **open** learning must increment `occurrenceCount` and update `lastSeenAt` rather than create a record. |
| REQ-L022 | A fingerprint matching a **rejected** learning must be dropped silently. Rejecting a gap means "we are not doing this"; it must not resurface weekly. |
| REQ-L023 | A fingerprint matching a **shipped** learning must create a new record. The same gap recurring after a fix is a regression and should be loud. |
| REQ-L024 | `occurrenceCount` must be surfaced in review — it is the closest thing to a demand signal this app will ever have. |

---

## 3. Data Model

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `familyId` | string | Scoping; learnings are family data. |
| `kind` | `'capability_gap' \| 'quality_incident'` | |
| `status` | `'open' \| 'accepted' \| 'rejected' \| 'shipped'` | §4.1 |
| `source` | `'agent' \| 'user_flag'` | Provenance; never inferred. |
| `capabilityKey` | string \| null | Enumerated; null for user flags. |
| `title` | string | Short, human-readable. |
| `detail` | string | Model-authored for gaps; **untrusted** (SEC-L002). |
| `userNote` | string \| null | User-authored; stored distinctly from `detail`. |
| `fingerprint` | string | §2.3 |
| `occurrenceCount` | number | |
| `firstSeenAt` / `lastSeenAt` | ISO string | |
| `conversationId` | string | |
| `traceIds` | string[] | Links to structured traces (platform §10.1). |
| `evidenceBundleId` | string \| null | Quality incidents only (platform §10.2). |
| `reportedByUserId` | string \| null | User flags only. |
| `resolution` | string \| null | Maintainer-authored on disposition. |
| `resolvedAt` | ISO string \| null | |

| ID | Requirement |
|----|-------------|
| REQ-L030 | Learnings persist in the existing JSON storage model as `agent_learnings_{familyId}`. |
| REQ-L031 | Learnings must **never** be written into the repository. The repo pushes to GitHub, which would route family financial evidence to a third party — the same reason SEC-L003 rules out `submit_github_issue`. |
| REQ-L032 | Retention: open and accepted learnings are kept indefinitely. Rejected and shipped learnings are kept 180 days, then pruned with their evidence bundles. |

---

## 4. Review

### 4.1 Lifecycle

```
                 ┌──────────► rejected ──► (fingerprint suppressed)
  open ──────────┤
                 └──────────► accepted ──► shipped ──► (recurrence = regression)
```

| Status | Meaning |
|--------|---------|
| `open` | Captured, not yet reviewed. The only status `/evaluate-learnings` operates on. |
| `accepted` | Real and worth fixing. Carries a resolution note. |
| `rejected` | Not worth fixing, or not a real gap. Suppresses the fingerprint permanently (REQ-L022). |
| `shipped` | A fix has landed. Recurrence creates a new record (REQ-L023). |

| ID | Requirement |
|----|-------------|
| REQ-L040 | Only the maintainer may change status. Status transitions are not exposed in the family-facing app. |
| REQ-L041 | Accepting or rejecting must require a resolution note. A rejected learning with no reason is indistinguishable from an unreviewed one six months later. |

### 4.2 `/evaluate-learnings`

| ID | Requirement |
|----|-------------|
| REQ-L050 | The skill reads **open** learnings only, grouped by `capabilityKey` and ordered by `occurrenceCount`. |
| REQ-L051 | Every item must display provenance alongside its content: agent-written vs user-flagged, which conversation, which traces, occurrence count, first and last seen. |
| REQ-L052 | For quality incidents, the skill must surface the **tool-call ledger** — what the model was actually handed — not just the transcript. That ledger is where causes are found; the prose is where narratives are. |
| REQ-L053 | The skill proposes a disposition and, where the fix is clear, an implementation. It must never apply a change without the maintainer's explicit approval (SEC-L001). |
| REQ-L054 | Accepted items should produce a regression test or eval case, not only a code change (§5). |

---

## 5. Eval Corpus

The durable value of this feature is not the backlog — it is that each real failure becomes a test that keeps it fixed.

| ID | Requirement |
|----|-------------|
| REQ-L060 | Each dispositioned quality incident should yield a reproducible case: the tool results that were returned, and the assertion that distinguishes a correct answer from the observed wrong one. |
| REQ-L061 | Cases derived from incidents must be scrubbed of real financial values before entering the test suite, since tests do live in the repository (REQ-L031). Preserve the *shape* that caused the failure, not the amounts. |
| REQ-L062 | The Subaru incident is the seed case; its coverage already exists in `chatbotDataService.getBudgetsForTool.test.ts`. |

---

## 6. Security

| ID | Requirement |
|----|-------------|
| SEC-L001 | **Learnings are advisory only and are never auto-applied.** A learning is model-authored text that a human later acts on, which makes it an injection path *through the maintainer*: adversarial content in an uploaded flyer could produce a learning arguing the agent needs broader unattended permissions. The human review step is the control, and it only works if nothing bypasses it. |
| SEC-L002 | `detail` and `title` are untrusted content. `/evaluate-learnings` must render them as data and must display provenance so a maintainer always knows whether a human or a model wrote what they are reading. |
| SEC-L003 | Learnings and evidence bundles must never be routed to GitHub or any external service, despite `submit_github_issue` already existing as a convenient path. Evidence contains family financial transcripts. |
| SEC-L004 | Learnings must never contain credentials, Plaid tokens, the encryption key, attachment bytes, or extracted attachment text (preserves SEC-A014, SEC-A016). |
| SEC-L005 | Agent-written learnings are rate-capped per conversation and per day. Exceeding a cap drops the write silently and logs it; it must never fail the user's turn. |
| SEC-L006 | **The agent must never read the learnings collection.** A learning shaped by injected content, if later fed back into the agent's context, becomes persistent injection — a prompt-injection payload with durable storage. The write path is append-only from the agent's side and there is no corresponding read tool. **Guarded by a test** asserting `record_learning` is the only learning-related tool in the surface. |
| SEC-L007 | Learnings are family-scoped and subject to the same authorization as the underlying data. Maintainer review happens through local tooling against local data, not through a privileged in-app role. |
| SEC-L008 | Recording a learning must never block, delay, or fail a user's turn. A failed write is logged and dropped. |

---

## 7. Phasing

| Phase | Scope |
|-------|-------|
| ~~**1**~~ | ~~Store, `record_learning` tool with enumerated `capabilityKey`, inline notice, dedup, rate caps.~~ **Done** — `backend/src/services/agentLearningsStore.ts`, tool in `chatbotPrompt.ts`, intercept in `chatbotService.ts`, notice in `ChatMessageBubble.tsx`. |
| **2** | User flag control, evidence bundle capture, flagged-turn marking. |
| **3** | `/evaluate-learnings` skill with provenance rendering and tool-ledger display. |
| **4** | Eval corpus conventions; backfill from dispositioned incidents. |

Phase 1 depends on the structured trace (platform §10.1) already existing, since `traceIds` is what makes a learning actionable. Phase 2 depends on incident bundles (platform §10.2).

---

## 8. Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-L01 | The agent never diagnoses its own quality failures. `record_learning` cannot express a quality incident. | Confabulation about confabulation (§1.3). Enforced by schema, not prompt. |
| D-L02 | Agent writes are autonomous but always produce an inline notice. | No click friction on a diagnostic nicety; nothing written invisibly. |
| D-L03 | The agent never reads learnings. | Prevents injected content from gaining durable residence in context (SEC-L006). |
| D-L04 | Rejected fingerprints are suppressed permanently; shipped ones are not. | "We're not doing this" should stay quiet; "this broke again" should be loud. |
| D-L05 | Learnings live in app storage, never in the repo. | The repo pushes to GitHub; evidence contains financial transcripts. |
| D-L06 | Capability keys are enumerated server-side. | Free text cannot be clustered, counted, or trusted. |

---

## 9. Open Questions

| ID | Question | Proposed default |
|----|----------|------------------|
| ~~Q-L01~~ | ~~Rate cap values for agent-written learnings.~~ | **Implemented** at 2 per conversation, 20 per day. Revisit after a week of real use. One refinement found while building: caps apply to **new** records only. A dedupe into an existing gap is free, because otherwise a genuinely recurring gap would stop counting exactly when demand for it is highest — and `occurrenceCount` is the whole demand signal. |
| Q-L02 | Should the family see a list of open learnings, or only the inline notices? | Inline notices only in v1. A visible backlog invites the users to manage it, which is the maintainer's job. |
| Q-L03 | Does `/evaluate-learnings` read app storage directly, or through a maintainer-only endpoint? | Directly against local data, consistent with the existing local-data workflow in AWS-LOCAL-SETUP.md. |
| Q-L04 | Should a user flag also be possible on an action card outcome, not just a message? | Defer to Phase 2; cards are lower-volume and their audit log already records params. |

---

## 10. References

- [AI-CAPABILITY-PLATFORM-BRD.md](AI-CAPABILITY-PLATFORM-BRD.md) — §10 observability, §15 reserved decisions, §15.1 the incident
- [AI-CHAT-ACTIONS-BRD.md](AI-CHAT-ACTIONS-BRD.md) — SEC-A014/A016 attachment handling
- [AI-CHATBOT-BRD.md](AI-CHATBOT-BRD.md) — cost cap and iteration limits
