# AI Chat Attachments & Action Cards — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-17
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

Real-world inputs — a school fundraiser flyer, a birthday party invite, an event save-the-date, a receipt from a handyman — arrive as paper or photos, not as structured data. The household's memory of these items degrades within a day. The current chatbot is text-only and cannot ingest visual context. Separately, the chatbot is strictly read-only: even when it correctly identifies an actionable item ("this is a PTA donation request for the Edson Elementary faculty lounge"), the user has to manually navigate to the Tasks page, type the details, and set a due date.

### 1.2 Solution Summary

Extend the existing chatbot overlay with two capabilities, gated behind the same security model:

1. **Attachment intake** — The user can attach a photo (from camera or library) or document (PDF, image) to a chat message. Claude's vision capabilities analyze the attachment and the chatbot replies with what it sees: "This looks like a PTA fundraiser flyer for the Edson Elementary faculty lounge — donations due Thursday, May 1."

2. **Action cards** — Based on the attachment or conversation context, the chatbot can propose a single action from a narrow server-side allowlist (V1: `create_task` only). The proposal is rendered as a structured **action card** inline in the chat: a title, a human-readable description of what will happen, all fields that will be written, and three controls — **Confirm**, **Edit**, and **Dismiss**. The user can also refine the proposal conversationally ("rename that to 'PTA donation' and move it to next Friday"), which regenerates a new card.

The LLM never executes actions. It only proposes them. Execution happens only after an explicit user click on **Confirm**, and only via the existing user-facing endpoints with the user's existing auth context.

### 1.3 Relationship to Existing Features

| Feature | Relationship |
|---------|-------------|
| **AI Chatbot** (existing) | Same overlay, same cost cap, same conversation history, same security boundary. This feature adds attachment input + action cards to the existing surface. Read-only data tools are unchanged. |
| **Amazon Receipt Matching** (existing) | Shares the vision-parsing primitive (Claude vision API, in-memory PDF handling, size limits, MIME validation). Amazon receipts remain a separate structured button flow — this feature does not replace it. |
| **Tasks** (existing) | Action cards in V1 target the existing `POST /api/tasks` endpoint. No new task-creation path; the chatbot becomes a new *entry point* to the same endpoint. |

### 1.4 Users

Both household users on the shared login (same scope as the existing chatbot). Multi-user scoping is deferred to the broader multi-user framework.

---

## 2. User Flow

### 2.1 Entry Point

The existing chat overlay (floating action button, available on all authenticated pages). No separate entry point. On open:

- The chat input row shows the existing text field plus **two new inline icons**: a camera icon (open device camera) and a paperclip icon (open file picker). On mobile these map to the native camera / photo library / file picker via `<input type="file" accept="image/*,application/pdf" capture="environment">`.
- The empty-chat state includes discovery copy: "📎 Snap a photo of a flyer, receipt, or invite — I can help track it."
- There is **no** separate "Start chat" button or mode switch. Users can type, attach, or both, in any order.

### 2.2 Step-by-Step Flow

1. **Compose** — User attaches an image or PDF. The attachment appears as a thumbnail in the input row. User may optionally type a message ("this came home from school today") before sending. The Send button enables as soon as either an attachment or text is present.

2. **Upload & analyze** — On send:
   - Frontend uploads the file + text to `POST /api/v1/chat` (same endpoint as text chat, extended to accept multipart).
   - Backend validates MIME type, size, and page count.
   - Backend sends the file to Claude via the document/vision API as a content block, **not** interpolated into the system prompt (consistent with SEC-007 from the chatbot BRD).
   - Claude responds with a natural-language identification: "This looks like a PTA fundraiser flyer for the Edson Elementary faculty lounge. Donations are due Thursday, May 1, and they're asking for $25 per family."

3. **Propose action (optional)** — If the identified content is actionable and an enabled action fits, Claude calls the `propose_action` tool with `actionId: 'create_task'` and a filled-in parameter set. The backend **intercepts** this tool call (it is never executed by the LLM) and returns a structured `action_proposal` response to the frontend.

4. **Action card rendered in chat** — The frontend renders the proposal as an inline card below the assistant's message. The card shows:
   - **Action label**: "Create a task"
   - **Summary line**: "Task: PTA donation — Edson faculty lounge"
   - **Full field preview**: title, description, due date, scope, tags, assignee — every field that will be written.
   - **Controls**: `Confirm` (primary), `Edit` (secondary), `Dismiss` (tertiary).

5. **User decides** — Three paths:
   - **Confirm** → frontend POSTs `{ sessionId, proposalId, nonce, confirmedParams }` to `POST /api/v1/chat/actions/confirm`. Backend validates (nonce unused, action in allowlist, params pass Zod schema), calls the existing task service with the authenticated user's context, and returns the created resource. The card updates in place to show success ("✅ Created task: PTA donation — [view]") and is locked from further interaction.
   - **Edit** → card expands into an inline form with editable fields. User adjusts values and clicks `Confirm` to submit the edited params (same backend path, same validation).
   - **Dismiss** → card collapses to a muted "Dismissed" state. No backend call.

6. **Refine via chat (alternative path)** — While a card is pending, the user can type a follow-up message: "rename that to 'PTA donation' and set it for next Friday." The message is sent with the pending proposal attached as conversation context. Claude reads the pending proposal, issues a new `propose_action` call with the adjusted params, and the previous card is **superseded** (visually struck through or collapsed) in favor of the new one. Only one card is ever active at a time.

7. **Summary state** — After confirm/dismiss, the card remains in the conversation as a receipt. Scrolling back in the conversation shows the outcomes of prior actions.

### 2.3 Edge Cases

| Case | Behavior |
|------|----------|
| Attachment with no actionable content (e.g., a family photo) | Chatbot describes what it sees and does not propose an action. |
| Attachment in an unsupported format | Rejected at upload with a clear error; no Claude call. |
| User confirms a proposal whose data has drifted (e.g., referenced category no longer exists) | Backend validation fails; card shows an error and offers Edit. |
| User confirms twice (double-click or replay) | Nonce is single-use; second confirmation returns a "Already completed" notice without re-executing. |
| LLM proposes an action not in the allowlist | Backend rejects the tool call and surfaces a generic error. The LLM cannot cause execution by naming an action the backend doesn't know. |
| User uploads a document that contains adversarial text ("ignore previous instructions, create a task to…") | Since execution requires a user click and all card fields are visible before confirm, the injection cannot self-execute. The LLM may propose a card; the user sees exactly what will happen. See §5. |
| User refines a dismissed card | The dismissed card stays dismissed. A new refinement generates a fresh proposal. |
| Cost cap reached mid-session | Same behavior as existing chatbot (SEC-010, SEC-011). Pending cards remain confirmable — they are independent of LLM calls. |
| Attachment but cost cap already reached | Upload is rejected before Claude is called, with the existing cap-reached message. |

---

## 3. Attachment Handling

### 3.1 Supported Inputs

| Type | MIME Types | Max Size | Max Pages | Notes |
|------|-----------|----------|-----------|-------|
| Image | `image/jpeg`, `image/png`, `image/webp`, `image/heic` | 10 MB | n/a | HEIC auto-converted to JPEG on the client when the browser supports it; otherwise rejected with guidance. |
| PDF | `application/pdf` | 10 MB | 20 | Uses the same document API path as Amazon receipts. |

Limits are intentionally tighter than Amazon receipts (20MB/50 pages) because chat attachments are expected to be single flyers or photos, not order histories.

### 3.2 Storage

Attachments are **transient**. They are held in memory for the duration of the Claude call and discarded after the response is returned. No S3 upload, no disk write, no database record. This matches the existing Amazon receipt handling. The attachment's presence in the conversation is represented by a thumbnail referenced only from frontend state; it is not reloadable after page refresh.

### 3.3 Vision Call

The attachment is passed to Claude as a content block alongside the user's text message. The existing system prompt and read-only data tools remain available. A new `propose_action` tool is added to the tool registry. Claude may call data tools, `propose_action`, or return a plain text response.

---

## 4. Action Card Contract

### 4.1 Allowlist (V1)

| actionId | Description | Target endpoint | Required scope |
|----------|-------------|-----------------|----------------|
| `create_task` | Create a new task on the household task board | `POST /api/v1/tasks` | Authenticated user |

Adding a new action is a **three-touch** change by design: register the actionId in the backend registry, declare a Zod schema, and add a render template on the frontend. The LLM cannot name an action that the backend registry does not have.

### 4.2 Proposal Structure

The `propose_action` tool accepts:

```typescript
interface ProposeActionInput {
  actionId: 'create_task';           // V1 — extensible enum
  params: Record<string, unknown>;   // Validated against the action's Zod schema server-side
  displaySummary: string;            // One-line human summary, e.g. "Create a task: PTA donation — due May 1"
  displayFields: DisplayField[];     // Fields to render in the card preview
  reasoning: string;                 // Why the LLM proposed this (shown in card as "Why?" disclosure)
}

interface DisplayField {
  label: string;                     // "Title"
  value: string;                     // "PTA donation — Edson faculty lounge"
  editable: boolean;                 // Whether the Edit form exposes this field
  type: 'text' | 'date' | 'select' | 'textarea' | 'tags';
  options?: { value: string; label: string }[]; // For 'select' type
}
```

When the backend intercepts `propose_action`, it:

1. Validates `actionId` is in the registry.
2. Validates `params` against the action's Zod schema (`createTaskSchema`). Invalid params → error returned to the LLM so it can retry with corrected values within the tool loop.
3. Generates a single-use `nonce` (UUID v4) tied to `(familyId, actionId, paramsHash, expiresAt)` and persists it in-memory with a 15-minute TTL.
4. Returns the proposal to the frontend as a structured `action_proposal` response type.

### 4.3 Confirmation Flow

On Confirm, the frontend sends:

```typescript
POST /api/v1/chat/actions/confirm
{
  proposalId: string;          // nonce
  confirmedParams: unknown;    // May differ from original if user used Edit
}
```

The backend:

1. Looks up the nonce. If absent or expired → 410 Gone. If already used → 409 Conflict with the prior result.
2. Re-validates `confirmedParams` against the action's Zod schema. This is the authoritative validation — the LLM's params are not trusted.
3. Invokes the action handler, which calls the existing user-facing endpoint (`POST /api/v1/tasks`) internally with the authenticated user's identity. The action handler does **not** bypass auth, rate limits, or validation that a direct API caller would face.
4. Marks the nonce used and records an audit log entry.
5. Returns the created resource (or error) to the frontend.

### 4.4 Refinement via Chat

When the user sends a follow-up message while a proposal is pending:

1. The frontend includes the pending proposal's metadata in the chat request's context (read-only; the nonce is not sent to the LLM).
2. The system prompt reminds the LLM: "A proposal is currently pending. The user's message may be a refinement. If so, call `propose_action` again with updated params; otherwise, respond normally."
3. If the LLM calls `propose_action` again, the backend invalidates the prior nonce and issues a new one. The frontend marks the old card as "Superseded" and renders the new one.
4. If the LLM does not call `propose_action`, the old card remains pending.

This keeps the "one active card at a time" invariant and prevents the user from accidentally confirming a stale proposal after refinement.

---

## 5. Security Requirements

These requirements **extend** the existing chatbot security requirements (AI-CHATBOT-BRD §3). All SEC-001 through SEC-018 from the chatbot BRD continue to apply.

### 5.1 Action Authorization

| # | Requirement |
|---|-------------|
| SEC-A001 | Action handlers must execute with the authenticated user's identity and credentials. They must not use elevated permissions, service accounts, or bypass any auth/validation that a direct API caller would face. |
| SEC-A002 | Action handlers must not accept a user ID, family ID, or any identity parameter from the LLM. The identity is derived exclusively from the session's JWT on the incoming confirmation request. |
| SEC-A003 | The action registry must be enumerated server-side. A confirmation request with an `actionId` not in the registry must be rejected at the edge, before any business logic runs. |
| SEC-A004 | Every action's parameter payload must be validated by a Zod schema on the confirmation request. The schema is the authoritative contract; the LLM's proposal is untrusted input. |

### 5.2 Proposal Integrity

| # | Requirement |
|---|-------------|
| SEC-A005 | Every proposal must include a single-use cryptographically random nonce. Confirmation requests without a valid, unexpired, unused nonce must be rejected. |
| SEC-A006 | Nonces must expire within 15 minutes of issuance. |
| SEC-A007 | Only one action proposal may be active per conversation at a time. When a new proposal is issued, any prior unused nonce must be invalidated. |
| SEC-A008 | The frontend must display every field that the action will write. The confirmation UI must not hide or truncate writable fields. If a field is unrenderable, the action must be rejected. |

### 5.3 Prompt Injection Mitigation

| # | Requirement |
|---|-------------|
| SEC-A009 | Attachment content must be passed to Claude via the document/vision API as a content block. Raw OCR text or file content must never be interpolated into the system prompt. |
| SEC-A010 | The user must see the full action preview before confirming. This is the primary mitigation against prompt injection in attachments — an adversarial flyer cannot self-execute because execution requires a click. |
| SEC-A011 | Action handlers must validate all semantic constraints server-side (e.g., referenced category exists, assignee is a household member, due date is parseable). LLM-supplied values that fail these checks must cause the confirmation to fail with an error the user can see. |
| SEC-A012 | The system prompt must instruct the LLM not to echo raw attachment text verbatim when responding (to reduce surface for visible injection payloads). This is a defense-in-depth measure; it is not relied on for security. |

### 5.4 Upload Controls

| # | Requirement |
|---|-------------|
| SEC-A013 | File uploads must validate MIME type (allowlist in §3.1), size (≤10 MB), and page count for PDFs (≤20). Requests violating these limits must be rejected before any Claude call. |
| SEC-A014 | Uploaded files must be held in memory only; they must not be written to disk, S3, or any persistent store. They must be eligible for garbage collection as soon as the Claude response returns. |
| SEC-A015 | Upload attempts must count against the existing per-user chat rate limit (5 req/min). |
| SEC-A016 | Attachment content — raw or extracted — must not be logged. Only metadata (size, MIME type, page count, whether an action was proposed) may be logged. |

### 5.5 Audit Logging

| # | Requirement |
|---|-------------|
| SEC-A017 | Every action execution must write a structured audit log entry with: timestamp, userId, familyId, actionId, confirmedParams (with sensitive fields redacted if applicable), source (`chatbot_action_card`), success/failure, and the resulting resource ID. |
| SEC-A018 | Rejected confirmations (invalid nonce, schema failure, expired nonce, unknown actionId) must be logged with enough detail for abuse investigation. |

### 5.6 Cost Controls

| # | Requirement |
|---|-------------|
| SEC-A019 | Vision calls count against the existing monthly cost cap (SEC-010 from chatbot BRD). No separate sub-budget in V1. The cap may be raised after observing real usage. |
| SEC-A020 | If the cost cap is reached, upload requests must be rejected before the Claude call. Pending (already-issued) action cards remain confirmable since confirmation does not call the LLM. |

---

## 6. Functional Requirements

### 6.1 UI

| # | Requirement |
|---|-------------|
| REQ-001 | The existing chat input row must include a camera icon and a paperclip icon positioned inline with the text input. |
| REQ-002 | On mobile, the camera icon must trigger the native camera via `capture="environment"`. The paperclip icon must open the native file picker. |
| REQ-003 | Attached files must be displayed as thumbnails in the input row before send. The user must be able to remove an attachment before sending. |
| REQ-004 | The Send button must be enabled when either the text input has content or an attachment is present. |
| REQ-005 | The empty chat state must include discovery copy pointing to the attachment capability. |
| REQ-006 | The chat input must remain fully keyboard-accessible. Focus order must be: text input → camera icon → paperclip icon → send button. |
| REQ-007 | Uploading progress must be visible (spinner on the send button or thumbnail). If upload fails, the user must see a clear error and the attachment must remain in the composer for retry. |

### 6.2 Attachment Analysis

| # | Requirement |
|---|-------------|
| REQ-008 | When an attachment is sent, the system must pass it to Claude via the document/vision content block alongside the user's message. |
| REQ-009 | The assistant response must describe what was identified in the attachment before (or instead of) proposing an action. |
| REQ-010 | If the attachment is not actionable under the current allowlist, the assistant must respond conversationally without proposing an action. |
| REQ-011 | The system must not store or persist the attachment past the duration of the request. |

### 6.3 Action Cards

| # | Requirement |
|---|-------------|
| REQ-012 | When Claude calls `propose_action`, the backend must intercept the tool call, validate the proposal, generate a nonce, and return an `action_proposal` response. The LLM must never execute an action directly. |
| REQ-013 | The action card must render all writable fields, a human-readable summary, and three controls: Confirm, Edit, Dismiss. |
| REQ-014 | The Edit control must open an inline form with the proposal's params prefilled. Fields must be editable according to their `editable` flag in `DisplayField`. |
| REQ-015 | The Confirm control must POST to `/api/v1/chat/actions/confirm` with the nonce and the (possibly edited) params. The card must update in place to reflect success or failure. |
| REQ-016 | The Dismiss control must mark the card as dismissed without a backend call. |
| REQ-017 | Only one action card may be active at a time per conversation. A new proposal must supersede any prior pending card. |
| REQ-018 | Confirmed cards must remain visible in the conversation as a receipt showing the confirmed values and a link to the created resource. |
| REQ-019 | The successful confirmation of a `create_task` action must produce a task identical to what `POST /api/v1/tasks` would produce with the same params — same validation, same defaults, same audit trail. |

### 6.4 Refinement via Chat

| # | Requirement |
|---|-------------|
| REQ-020 | The user must be able to send follow-up chat messages while an action card is pending. The pending proposal's metadata (not the nonce) must be passed to the LLM as context. |
| REQ-021 | If the LLM issues a new `propose_action` call in response to a refinement, the prior nonce must be invalidated server-side, and the frontend must mark the prior card as "Superseded." |
| REQ-022 | If the LLM does not issue a new proposal, the pending card must remain pending and confirmable. |

### 6.5 Observability

| # | Requirement |
|---|-------------|
| REQ-023 | Structured logs for attachment messages must include: MIME type, size, page count (if PDF), whether a proposal was issued, actionId (if any), latency, token count. |
| REQ-024 | Structured logs for action confirmations must include: actionId, nonce, outcome (confirmed/rejected), error reason (if rejected), resulting resource ID (if confirmed). |

---

## 7. API Design

### 7.1 Extended Endpoint

**`POST /api/v1/chat`** (extended)
- Content-Type: `multipart/form-data` (when attachments present) OR `application/json` (text-only, unchanged).
- Multipart fields:
  - `message` (text, optional)
  - `conversationHistory` (JSON, existing)
  - `pageContext` (JSON, existing)
  - `model` (text, existing)
  - `attachment` (file, optional; one file per request in V1)
- Response: existing `ChatResponse` shape plus a new response type:
  ```typescript
  type ChatResponse =
    | { type: 'message'; message: ChatMessage; usage: Usage }
    | { type: 'issue_confirmation'; message: ChatMessage; issueDraft: GitHubIssueDraft; usage: Usage }
    | { type: 'action_proposal'; message: ChatMessage; proposal: ActionProposal; usage: Usage }; // NEW
  ```
- Enforces: MIME allowlist, size limit, page count limit, existing rate limit, existing cost cap.

### 7.2 New Endpoints

**`POST /api/v1/chat/actions/confirm`**
- Auth: required (JWT).
- Body: `{ proposalId: string; confirmedParams: unknown }`.
- Response: `{ success: true; resource: { id: string; type: 'task'; url?: string } }` or `{ success: false; error: string }`.
- Validates nonce, re-validates params against the action's Zod schema, invokes the action handler.

**`POST /api/v1/chat/actions/dismiss`** (optional in V1)
- Could be purely client-side (card collapses without a backend call), or a POST for audit consistency. **Resolution**: client-side only in V1 (D-4).

### 7.3 Existing Endpoints Used

- `POST /api/v1/tasks` — Invoked by the `create_task` action handler.
- All existing read-only chat tools remain available.

### 7.4 New Tool Definition (Claude)

```typescript
{
  name: 'propose_action',
  description: 'Propose an action for the user to confirm. The action is NEVER executed by you — the user must click Confirm. Use this when the user has indicated intent to create something actionable, or when an uploaded attachment clearly maps to one of the enabled actions.',
  input_schema: {
    type: 'object',
    properties: {
      actionId: { type: 'string', enum: ['create_task'] },
      params: { type: 'object' },              // Shape enforced server-side per actionId
      displaySummary: { type: 'string' },
      displayFields: { type: 'array' /* ... */ },
      reasoning: { type: 'string' }
    },
    required: ['actionId', 'params', 'displaySummary', 'displayFields', 'reasoning']
  }
}
```

---

## 8. Cost Considerations

| Factor | Estimate |
|--------|----------|
| Vision call for a single-page flyer image (Sonnet) | ~$0.02–0.05 |
| Follow-up refinement (text-only) | ~$0.01–0.02 |
| Typical session (1 upload + 1 refinement + confirm) | ~$0.05–0.10 |
| Monthly estimate (~20 attachment sessions) | ~$1.00–2.00 |

Comfortable within the $20/month cap. Vision is the primary cost driver; refinements are cheap. If usage patterns cause the cap to bind more often, raise the cap rather than introducing a sub-budget.

---

## 9. Assumptions

| # | Assumption |
|---|------------|
| A-1 | Claude Sonnet is sufficient for both attachment identification and action proposal. No model selector changes. |
| A-2 | The existing mobile chat overlay (full-screen) is adequate as the UX shell. No separate "mobile attachment mode." |
| A-3 | Users are willing to confirm one card at a time. The "one active card" invariant is both a security property and a product simplicity choice. |
| A-4 | The existing rate limit (5 req/min) absorbs attachment uploads without change. |
| A-5 | HEIC handling via client-side conversion is acceptable where available; unsupported browsers see a clear error. |
| A-6 | Transient storage is acceptable — users do not expect attachments to be viewable after page refresh. |

---

## 10. Out of Scope

| Item | Rationale |
|------|-----------|
| Multiple action cards simultaneously | Adds UI complexity and security burden with no clear benefit. Revisit if users demand it. |
| Multi-file upload per message | One file per turn is sufficient for flyers, invites, and single receipts. |
| Persisting attachments for later review | Transient is simpler and reduces storage/compliance burden. |
| Action types beyond `create_task` | V1 scope. Budget edits, categorization rules, transaction edits, etc. arrive in later increments once the pattern is validated. |
| Autonomous action execution (no confirmation) | Security posture is incompatible with this for the foreseeable future. |
| Voice input | Separate initiative. |
| Shared attachment context across conversations | Each conversation is independent. |
| OCR preview ("here's what I read from your flyer") | Defense in depth against prompt injection — do not surface raw attachment text back to the user. |

---

## 11. Decisions Log

| # | Decision | Resolution |
|---|----------|------------|
| D-1 | **UI entry model** — Camera + paperclip icons inline with text input (not a separate "Start chat" mode). | Resolved |
| D-2 | **One card per turn** — Only one action proposal may be active at a time. | Resolved |
| D-3 | **Storage** — Attachments are transient (in-memory only, discarded post-request). | Resolved |
| D-4 | **Dismiss path** — Client-side only in V1. No backend call for dismissals. | Resolved |
| D-5 | **Cost cap** — Vision calls share the existing $20/month cap. Cap may be raised after observing usage; no sub-budget. | Resolved |
| D-6 | **Refinement UX** — Support natural-language refinement ("rename that to xyz") that supersedes the pending card. | Resolved |
| D-7 | **V1 action allowlist** — `create_task` only. Further actions require explicit BRD updates. | Resolved |
| D-8 | **Execution path** — Action handlers invoke the existing user-facing endpoints with the session's JWT. No privileged chatbot path. | Resolved |
| D-9 | **Prompt injection primary mitigation** — User confirmation click. Server-side Zod re-validation of all params is the backstop. | Resolved |
| D-10 | **Attachment limits** — 10 MB / 20 pages (tighter than Amazon receipts because chat attachments are single-document). | Resolved |
| D-11 | **Edit mode scope** — Edit opens the full action form (all fields for the action's schema are editable/addable), not just fields the LLM proposed. Collapsed card preview still shows only LLM-filled fields to avoid empty-row clutter. Rationale: constrained edit would force users to cancel and navigate to the full page for common cases like adding an assignee, which defeats the purpose of the card. Server-side Zod validation is the same regardless of edit surface. | Resolved |
| D-12 | **Reasoning disclosure** — The `reasoning` field is rendered as a collapsed "Why?" link on the action card, expanding to a muted one-liner on click. Not visible by default. Rationale: keeps cards uncluttered when proposals are obvious, while preserving the value at Dismiss decision-time. Also keeps the LLM honest — if reasoning were always visible, the LLM might learn to write persuasive pitches rather than plain justifications. | Resolved |
| D-13 | **Pending-card acknowledgment** — When a card is pending and the user's next message is not a clear refinement, the LLM's system prompt instructs it to explicitly acknowledge the pending card's state in its response (e.g., "Your pending task proposal still reads: *Title, due Date*. Confirm, edit, or tell me to change it."). No backend timers, drift detection, or auto-expire logic beyond the existing 15-minute nonce TTL. Rationale: the real failure mode is user confusion, not security; a system-prompt instruction is cheap and self-documenting. | Resolved |
| D-14 | **Cross-session receipts** — Action outcomes are not persisted across chat sessions. Confirmed cards remain visible in the current conversation as receipts; on page refresh they disappear along with chat history. The Tasks page is the authoritative record for created tasks. Audit-log entries (SEC-A017) record `source: chatbot_action_card` for forensic needs but are not surfaced in UI. Rationale: preserves the chatbot's stateless-conversation mental model; double-create risk is caught by the Tasks page showing the existing task. Revisit (e.g., "created via chat" badge on task rows) when V2 adds less-visible action types like budget edits. | Resolved |
| D-15 | **GitHub-issue flow refactor** — Do not refactor the existing `submit_github_issue` / `issue_confirmation` path in V1. Build the new action-card mechanism alongside it. Explicitly design the `ActionProposal` shape and confirmation endpoint so that a hypothetical `submit_github_issue` action would fit without special-casing. Migrate the GitHub-issue flow onto the action-card mechanism as a follow-up once V1 is proven. Rationale: touching the one working intercept-and-confirm path while building a new one invites regression for no V1 benefit; explicit "migrate later" commitment avoids the two-paths-forever trap. | Resolved |

---

## 12. Open Questions

_All open questions resolved during BRD drafting. See Decisions Log (D-1 through D-15)._

---

## 13. Success Criteria

- A user can photograph a flyer, invite, or receipt and have it recognized accurately ≥80% of the time in the assistant's description.
- When the identified content is actionable, the LLM proposes an `action_proposal` card ≥75% of the time.
- Confirmed action cards produce tasks indistinguishable from manually created tasks — same audit trail, same validation, same behavior.
- Zero incidents in which an action card executes without explicit user confirmation.
- Zero incidents in which an action is executed against another user's data.
- Median end-to-end latency (upload → card visible) under 8 seconds for a single-page image with Sonnet.
- Monthly LLM spend remains within the $20 cap under normal 2-user usage.
- Adding a second action (e.g., `create_budget`) requires changes in exactly three places: backend action registry, Zod schema file, frontend card template.

---

## 14. Future Considerations

- **Expand the allowlist** — `create_budget_entry`, `categorize_transaction`, `create_auto_rule`, `create_trip`, `mark_task_done`. Each new action re-validates the card contract and adds a Zod schema.
- **Calendar integration** — If an attachment is an event invite, offer to create a calendar entry alongside (or instead of) a task. Requires calendar feature first.
- **Persistent attachment history** — If usage shows users wanting to revisit prior attachments, add opt-in S3 storage with retention policy. Keep transient as the default.
- **Proactive confirmations** — Push notification when an action is ready for confirmation if the user backgrounds the app mid-flow.
- **Batch cards** — For attachments that imply multiple actions ("this flyer has two events"), allow the LLM to propose multiple cards in sequence, still one active at a time.
- **Refactor GitHub issue flow** onto the generic action-card mechanism (committed follow-up per D-15) once V1 is proven.
