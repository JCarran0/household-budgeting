# Security Audit — 2026-08-02

**Status**: Active burn-down
**Audit date**: 2026-08-02
**Scope**: Full application — dependencies, authentication/authorization, input validation and data handling, the AI/LLM boundary, and secrets/infrastructure.
**Method**: Dependency scan (`npm audit`, both packages) plus four parallel code reviews. Every finding below was confirmed by reading the code at the cited location. Nothing here is pattern-matched or inferred.

**Last Updated**: 2026-08-02

## Change log

- **2026-08-02** — Audit performed; 30 findings filed. Same day: SA-01 (dependencies), SA-03, SA-11, SA-12, SA-19, and SA-24 resolved. Backend suite 957 → **971 tests**, frontend 279, all passing; both packages typecheck clean.

---

## Start Here

**What this file is.** One entry per finding, `SA-NN`, grouped by area and numbered in discovery order — *not* priority order. Use the burn-down table for priority. Resolved items stay in place with the fix recorded.

**ID scheme.** `SA-NN` deliberately avoids `SEC-0NN` and `SEC-A0NN`, which are already taken by security *requirements* in the feature BRDs (`SEC-018` = chatbot read-only boundary, `SEC-A007`/`SEC-A008` = chat-action nonce and card-display contracts). Those are the promises; this file tracks where reality diverges from them.

**Severity is calibrated to this app, not to a generic threat model.** This is a two-user private app behind auth with no public signup surface anyone is hunting for. A finding rated Medium here would often be High in a multi-tenant product. Two things still justify real urgency regardless of user count: anything touching Plaid credentials (a bank connection is not recoverable by resetting a password) and anything that spends money without a ceiling.

**Line numbers rot.** Anchor on the symbol name, not the number.

### Status values

| Status | Meaning |
|--------|---------|
| **Open** | Confirmed, not yet addressed |
| **In Progress** | Actively being worked |
| **Resolved** | Fixed, with the fix recorded in the entry |
| **Accepted** | Real, deliberately not fixing — rationale recorded in the entry |
| **Duplicate** | Tracked elsewhere; entry points at the canonical item |

---

## Burn-down

Open items, ordered by value ÷ effort. The top four are one-line changes.

| ID | Finding | Severity | Effort | Status |
|----|---------|----------|--------|--------|
| SA-10 | Open registration chains into admin escalation | High | Low | Open |
| SA-20 | Dead Plaid routes with placeholder access token | Medium | Low | Open |
| SA-15 | Any family member can remove any other member | Medium | Low | Open |
| SA-05 | Action-card display can diverge from executed params | Medium | Medium | Open |
| SA-25 | Deploy tarballs in S3 contain the full production `.env` | High | Medium | Open |
| SA-06 | Three LLM tool outputs not Zod-validated | Medium | Low | Open |
| SA-04 | Chatbot timeout doesn't abort the tool loop; spend unrecorded | Medium | Low | Open |
| SA-13 | Password change doesn't invalidate existing JWTs | Medium | Medium | Open |
| SA-14 | `/auth/refresh` has no absolute cap and no rate limit | Medium | Low | Open |
| SA-27 | JWT in localStorage with no SPA-layer CSP | Medium | Medium | Open |
| SA-26 | Static long-lived AWS keys in GitHub Actions | Medium | Medium | Open |
| SA-22 | Storage adapters don't sanitize keys | Low | Trivial | Open |
| SA-21 | `photoAlbumUrl` accepts `javascript:` server-side | Low | Trivial | Open |
| SA-28 | Plain-HTTP origin in production CORS allowlist | Low | Trivial | Open |
| SA-30 | Vestigial `ENCRYPTION_KEY` env var invites wrong-key rotation | Low | Trivial | Open |
| SA-07 | Action confirm doesn't check the proposal's workspace | Low | Trivial | Open |
| SA-16 | `optionalAuthenticate` skips the membership check | Low | Trivial | Open |
| SA-23 | Zod gaps, led by an unbounded `csvContent` body | Low | Low | Open |
| SA-09 | Chatbot history message content uncapped | Low | Trivial | Open |
| SA-08 | One-active-card scoped to client-supplied `conversationId` | Low | Low | Open |
| SA-29 | Unauthenticated `/version` and `/changelog` | Low | Trivial | Open |
| SA-17 | Membership verification disabled by default under test | Low | Low | Open |
| SA-18 | Username enumeration by login timing | Low | Low | Open |

**Resolved 2026-08-02**: SA-01 (dependencies), SA-03 (cost-cap attribution), SA-11 (`trust proxy`), SA-12 (lockout casing), SA-19 (Plaid tokens off the wire), SA-24 (`/feedback/test` admin gate).
**Accepted**: SA-02. **Duplicate**: SA-31 (→ TD-025).

**Progress**: 6 of 30 closed, including 2 of 3 High. The one remaining High is **SA-25** (deploy tarballs in S3 contain the full production `.env`) — infrastructure work, not code.

### If you only have an hour

Start with **SA-10**, the last open High-severity *code* change: close registration and harden the `ADMIN_USERNAMES` bootstrap. Then **SA-20** (delete three dead placeholder routes) and **SA-15** (three guard clauses on member removal), both small and both closing destructive-action gaps.

**SA-25** is the highest-severity item left overall but needs production credentials and an SSM migration, so it does not fit in an hour. If you have prod access and only a few minutes, the interim mitigation — an S3 lifecycle rule expiring old deployment tarballs — meaningfully shrinks the exposure window on its own.

The trivial tier is done; what remains is small-to-medium work rather than one-liners.

### Cross-references into the tech-debt tracker

- **SA-27** overlaps [TD-004](AI-TECHNICAL-DEBT.md#td-004-no-content-security-policy-header)'s open follow-up. The backend JSON CSP shipped; the SPA-layer CSP at nginx never did. Fix them as one piece of work.
- **SA-31** is the same issue as [TD-025](AI-TECHNICAL-DEBT.md#td-025-production-secrets-exist-in-exactly-one-readable-place), whose primary risk was already closed on 2026-08-02. Not re-litigated here.
- **SA-06** is a plausible upstream contributor to the orphan-`categoryId` problem noted in TD-024's landmine list. Unvalidated model output produces a category ID; nothing at the write boundary checks the ID exists.

---

## Dependencies

### SA-01: Vulnerable production and dev dependencies
**Status**: **Resolved (2026-08-02)**
**Severity**: High (pre-fix)
**Effort**: Trivial

**Problem**:
`npm audit` reported 10 vulnerabilities in backend production dependencies (4 high) and 25 in the frontend (2 critical, 16 high). Notable: `multer` high-severity DoS via deeply nested field names and incomplete cleanup of aborted uploads — directly relevant since receipt upload is a real user-facing path; `axios`/`form-data` high-severity transitives; and a critical `@vitest/ui` advisory allowing arbitrary file read and execution while the Vitest UI server is listening.

Most of the frontend's alarming-looking entries (critical `tar`, critical `handlebars`) were transitive through the bundled `npm` package inside a `semantic-release` dev chain — never shipped to a browser. The two that mattered were `react-router-dom` and the Vitest pair.

**Fix**:
✅ Ran `npm audit fix` in both packages, then bumped `vitest` and `@vitest/ui` from a pinned `3.2.4` to `^3.2.7` — the critical Vitest advisory has no fix inside the pinned version, so `audit fix` alone could not clear it.

Result: backend 10 → **0** vulnerabilities; frontend 25 → **2** (both accepted, see SA-02). Verified afterward: backend typecheck clean and 957/957 tests pass; frontend typecheck clean and 279/279 tests pass.

**Files**:
- `backend/package-lock.json` ✅
- `frontend/package-lock.json` ✅
- `frontend/package.json` ✅ (`vitest` and `@vitest/ui` `3.2.4` → `^3.2.7`)

---

### SA-02: Two residual advisories deliberately not fixed
**Status**: **Accepted (2026-08-02)** — revisit if either dependency is upgraded for other reasons
**Severity**: Low (as applied to this app)
**Effort**: High (both require major-version migrations)

**Problem and rationale**:

**`react-router-dom@7.18.2`** — [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2), "RSC Mode CSRF Bypass Allows Action Execution Before 400 Response." The advisory range is `>=7.12.0 <8.3.0`, so there is no fix anywhere in the 7.x line — the only remedy is a major bump to 8.3.0. The vulnerability is specific to React Server Components mode. `frontend/src/App.tsx:1` imports `BrowserRouter` and the app is a client-rendered SPA with no RSC usage anywhere, so the vulnerable code path does not exist in this build. **Not applicable, not merely low-risk.**

**`@anthropic-ai/sdk@0.91.0`** — [GHSA-p7fg-763f-g4gf](https://github.com/advisories/GHSA-p7fg-763f-g4gf), insecure default file permissions in the local-filesystem memory tool. The app does not use the memory tool. The fix requires `0.115.0`, a breaking change across 24 minor versions that would need real migration work against `chatbotService.ts`, `amazonPdfParser.ts`, and `categorizationService.ts`.

**Re-evaluate when**: React Router 8 is adopted for other reasons, or the Anthropic SDK is upgraded to pick up a new API feature. Neither should be driven by these advisories alone.

---

## AI / LLM boundary

### SA-03: AI categorization spend escapes the monthly cost cap
**Status**: **Resolved (2026-08-02)**
**Severity**: **High** — real, unbounded money
**Effort**: Trivial

**Problem**:
`backend/src/services/categorizationService.ts:315` — `classifyBatch` records its Anthropic usage against the literal string `'system'`:

```ts
recordUsage('system', 'sonnet', ...)
```

The pre-flight gate at line 65 checks `checkBudget(familyId)`. Because classification spend accumulates under `chatbot_costs_system_{month}` and never under the family's bucket, the family's recorded spend never grows from classification, so `checkBudget` keeps passing no matter how much has actually been spent. `suggestRules` at line 186 passes `familyId` correctly, which makes this look like a copy-paste slip rather than a design decision.

**Exploit scenario**:
Loop `POST /api/chatbot/classify-transactions`. It is rate-limited to 5/min, but every call is a full Sonnet request carrying a large few-shot prompt. The $20/month ceiling never trips. This does not require an attacker — enthusiastic use of bulk categorization does it, and `/usage` under-reports so nothing surfaces the drift.

**Fix**:
✅ `familyId` turned out **not** to be in `classifyBatch`'s scope — the original triage was wrong about that, which is likely how the bug survived. It is threaded in as the first parameter from `classifyTransactions` (which already has it) and passed to `recordUsage`, matching what `suggestRules` does at line 186.

✅ Three regression cases in `backend/src/__tests__/unit/categorizationService.costAttribution.test.ts`, with the Anthropic client stubbed so no network call is made: usage is recorded against `familyId` and never the literal `'system'`; the record scope equals the scope `checkBudget` read (the actual invariant — divergence is what made the cap unenforceable); and an exhausted cap short-circuits before the Claude call so no spend occurs.

**Validated by reintroducing the bug**: both attribution assertions fail with `'system'` restored and pass with the fix. Worth noting that `noUnusedParameters` also catches the reverted state at compile time — the threaded parameter is now structurally load-bearing, so this cannot silently regress.

**Files**:
- `backend/src/services/categorizationService.ts` ✅
- `backend/src/__tests__/unit/categorizationService.costAttribution.test.ts` ✅ (new, 3 cases)

---

### SA-04: Request timeout doesn't cancel the tool loop, and its cost is never recorded
**Status**: Open
**Severity**: Medium
**Effort**: Low

**Problem**:
`backend/src/services/chatbotService.ts:515-522` uses `Promise.race` against `CHATBOT_REQUEST_TIMEOUT` (line 211). Losing the race abandons the *response*, not the *work* — the underlying `toolLoop` keeps running for up to 10 Claude iterations of continued spend. Separately, `recordUsage` runs only on the success path (line 147), so every timed-out or errored request's tokens are spent and never counted toward the cap.

**Exploit scenario**:
Same shape as SA-03 but smaller: a user (or a retry storm) triggering slow requests spends outside the ceiling. Bounded by the 5/min limit, but it compounds with SA-03 and it means the `/usage` number is structurally optimistic rather than merely stale.

**Fix**:
Pass an `AbortSignal` into `client.messages.create` and abort it when the timeout fires. Move `recordUsage` into a `finally` (or a catch path) so accumulated tokens are recorded regardless of outcome. The same treatment applies to the Amazon parse error paths in SA-06's neighborhood (`amazonReceiptService.ts:127-180`), where a `ValidationError` on a duplicate PDF type discards already-spent token accounting.

**Files**:
- `backend/src/services/chatbotService.ts`
- `backend/src/services/amazonReceiptService.ts`

---

### SA-05: Action-card display can diverge from executed params
**Status**: Open
**Severity**: Medium — the only finding with a data-exfiltration path to a public destination
**Effort**: Medium

**Problem**:
The confirmation card renders only the LLM-authored `displaySummary` and `displayFields` (`frontend/src/components/chat/ActionCard.tsx:271-286`), but Confirm submits `proposal.params` (`ActionCard.tsx:113`), and the backend executes whatever `confirmedParams` validates (`backend/src/routes/chatbot.ts:331-349`). Nothing server-side ever checks that the displayed fields faithfully represent the params that will execute.

`SEC-A008`'s promise that the card "displays every writable field" therefore holds only while the model is honest — which is exactly the assumption prompt injection is designed to break. And untrusted text genuinely reaches the model: merchant names, transaction `name` and `userDescription`, and uploaded receipt content all flow in as tool results (`chatbotService.ts:358-370`) and attachment blocks.

**Exploit scenario**:
A merchant controls its own name, which lands in your transaction data. A crafted name instructs the model to propose `submit_github_issue` with an innocuous `displaySummary` ("File a bug about the dashboard chart") while `params.body` — permitted up to 65,536 characters (`submitGithubIssueAction.ts:26`) — carries transaction rows and balances. The user sees a harmless card and clicks Confirm. The body is posted to `JCarran0/household-budgeting`, **which is a public repository** (verified). This is the one finding where a successful attack publishes financial data to the open internet rather than merely reaching it.

**Fix**:
Derive the card preview server-side from the Zod-parsed `params` rather than accepting the model's description of its own action. For GitHub issues specifically, render `params.body` itself in the card — if the user has to look at what will actually be posted, the attack has nowhere to hide. A weaker alternative is to reject proposals whose `displayFields` don't cover every key in `params`, which closes omission but not misdescription.

**Files**:
- `frontend/src/components/chat/ActionCard.tsx`
- `backend/src/routes/chatbot.ts`
- `backend/src/services/chatActions/submitGithubIssueAction.ts`

---

### SA-06: Three LLM tool outputs are cast, not validated
**Status**: Open
**Severity**: Medium
**Effort**: Low

**Problem**:
CLAUDE.md records Zod validation of model output as an architectural rule. Three sites use a bare `as` cast instead:

| Location | Cast |
|---|---|
| `categorizationService.ts:327` | `toolUse.input as { classifications: ... }` |
| `categorizationService.ts:196` | `toolUse.input as { suggestions: RuleSuggestion[] }` |
| `amazon/amazonCategorizerAdapter.ts:131` | `toolUse.input as ClaudeCategorizeOutput` |

Only the PDF-extraction step has real Zod (`amazonPdfParser.ts:112`), and that one is genuinely good.

Downstream, nothing catches the gap: the transaction category-update schema accepts any non-empty string with no existence check (`routes/transactions.ts:185`), as does the Amazon apply schema (`validators/amazonReceiptValidators.ts:87-97`).

**Exploit scenario**:
Less "attacker" than "the model is wrong occasionally, which is a certainty." A hallucinated or injected `suggestedCategoryId` approved in the bulk-review UI persists as an orphan `categoryId` — which is precisely the cell-vs-modal mismatch already observed in production and noted as a landmine in TD-024. The unvalidated path is a standing generator of the bad data you have scripts to clean up.

**Fix**:
Zod-validate all three tool outputs with bounded strings and confidence enums. Independently, validate that `categoryId` refers to an existing category at the write boundary — that check is worth having regardless of where the ID came from, and it closes the class rather than one source.

**Files**:
- `backend/src/services/categorizationService.ts`
- `backend/src/services/amazon/amazonCategorizerAdapter.ts`
- `backend/src/routes/transactions.ts`
- `backend/src/validators/amazonReceiptValidators.ts`

---

### SA-07: Action confirm doesn't check the proposal's workspace
**Status**: Open
**Severity**: Low
**Effort**: Trivial

**Problem**:
`backend/src/routes/chatbot.ts:289-349` — `consumeProposal` verifies `userId` but never compares `stored.familyId` against the active `familyId` from the JWT.

**Exploit scenario**:
Self-inflicted rather than adversarial: a user proposes an action in the family workspace, switches to the business workspace, then confirms. The `create_task` lands in the wrong workspace. Now that Business Workspace ships a live switcher, this is reachable in normal use.

**Fix**:
Reject when `stored.familyId !== familyId`.

**Files**:
- `backend/src/routes/chatbot.ts`

---

### SA-08: "One active card" is scoped to a client-supplied conversation ID
**Status**: Open
**Severity**: Low
**Effort**: Low

**Problem**:
`services/chatActions/proposalStore.ts:45-83` supersedes prior proposals per `conversationId`, but `validators/chatbotValidators.ts:32` accepts `conversationId` as an arbitrary client string. Varying it holds many live nonces concurrently.

**Impact**: The per-nonce replay protection of `SEC-A007` is unaffected — this only weakens the one-card UX invariant. Recorded for completeness rather than urgency.

**Fix**:
Server-issue the conversation ID, or cap concurrent live proposals per user.

**Files**:
- `backend/src/services/chatActions/proposalStore.ts`
- `backend/src/validators/chatbotValidators.ts`

---

### SA-09: Chatbot history message content is uncapped
**Status**: Open
**Severity**: Low
**Effort**: Trivial

**Problem**:
`backend/src/validators/chatbotValidators.ts:17` types history `content` as bare `z.string()`. The current `message` is capped at 10k, but the history array is not — so one request can carry roughly 50 arbitrarily large messages, inflating input-token spend per request.

**Impact**: Self-inflicted and bounded by the family's own cap (once SA-03 is fixed and the cap actually works). Add a per-message max.

**Files**:
- `backend/src/validators/chatbotValidators.ts`

---

## Authentication & authorization

### SA-10: Open registration chains into admin privilege escalation
**Status**: Open
**Severity**: **High**
**Effort**: Low

**Problem**:
Two individually-defensible decisions combine badly.

`backend/src/routes/authRoutes.ts:31-68` — `POST /api/v1/auth/register` is fully public, gated only by `rateLimitAuth` and Zod. There is no invite requirement and no env kill-switch (grep for `REGISTRATION_ENABLED` / `allowRegistration` returns nothing). Without a `joinCode` it provisions a brand-new user *and* a brand-new family (`authService.ts:147-166`).

`backend/src/middleware/adminMiddleware.ts:49-53` — any user whose username appears in `ADMIN_USERNAMES` is auto-promoted to `isAdmin: true` on their first admin request, and the flag is persisted. This was a deliberate bootstrap convenience in TD-006 and is documented there.

**Exploit scenario**:
The mild version: anyone on the internet creates accounts at will — storage growth, log noise, and a Plaid link-token surface that shouldn't be reachable by strangers.

The serious version: if `ADMIN_USERNAMES` ever contains a username that is not currently registered — a typo, a renamed account, a second account planned but not yet created — an attacker who registers that exact username is silently promoted to admin on their first admin request. That reaches everything under `/api/v1/admin`, including cross-family data migrations (`routes/admin.ts:316` `migrate-to-families`, `:420` cleanup). The bootstrap was designed assuming the named user already exists; open registration removes that assumption.

**Fix**:
Two independent changes, either of which breaks the chain — do both.
1. Gate `/register` behind a required `joinCode`, or an env flag defaulting to closed. The family is fully provisioned; open signup no longer serves a purpose.
2. Make the `ADMIN_USERNAMES` bootstrap require that the user already existed before promotion, or retire the auto-promotion path entirely now that `isAdmin` is persisted for the real admin.

**Files**:
- `backend/src/routes/authRoutes.ts`
- `backend/src/middleware/adminMiddleware.ts`

---

### SA-11: `trust proxy` unset — every per-IP limit is one global bucket
**Status**: **Resolved (2026-08-02)**
**Severity**: Medium
**Effort**: Trivial

**Problem**:
`app.set('trust proxy', ...)` appears nowhere in `backend/src` (verified by grep across `app.ts` and `index.ts`). The rate limiters key on `req.ip` (`middleware/rateLimit/index.ts:76,97`). Behind nginx (`terraform/user_data.sh:79`, `proxy_pass http://localhost:3001`), `req.ip` is the loopback address for every client on earth, because Express ignores the `X-Forwarded-For` nginx sets at line 85 unless `trust proxy` is configured.

**Exploit scenario**:
The `rateLimitAuth` budget of 10 requests per 15 minutes is effectively global. An attacker who burns 10 login attempts locks **both real users** out of logging in for 15 minutes, at a cost of one request every 90 seconds — a trivially cheap denial of service against authentication. Separately, `rateLimitGlobalApi` at 100/min is shared across both users plus any traffic, so ordinary concurrent use can 429 itself. And there is no per-attacker isolation at all, which is the entire point of the control.

**Partially mitigating**: nginx runs its own `limit_req_zone $binary_remote_addr ... rate=10r/s` (`terraform/user_data.sh:62`), so raw flooding is still capped per real IP. That limits volume; it does not restore the app-layer per-client semantics.

**Fix**:
✅ `app.set('trust proxy', 1)` added immediately after `express()` in `app.ts`, with a comment recording why the value is `1` and not `true` — `true` trusts an arbitrary client-supplied `X-Forwarded-For` chain, which would hand the attacker control of the very key the limiter buckets on. Exactly one hop is correct: nginx on the same host is the only proxy and it already sets the header.

**No test added.** The limiters are short-circuited entirely under `NODE_ENV=test` (`rateLimit/index.ts:43-46`), so a test asserting per-IP bucketing would exercise nothing. Making this properly testable is SA-17's job; doing it here would have meant changing the test-mode bypass as a side effect of a one-line fix.

**Verify in production** after deploy — this is the only fix in this batch whose behavior differs between dev and prod, since there is no proxy in front of the dev server:

```bash
curl -s https://budget.jaredcarrano.com/api/v1/version -H 'X-Forwarded-For: 203.0.113.9'
# then confirm the rate-limit bucket keys on the forwarded address, not 127.0.0.1
```

**Files**:
- `backend/src/app.ts` ✅

---

### SA-12: Account lockout is bypassable by varying username case
**Status**: **Resolved (2026-08-02)**
**Severity**: Medium
**Effort**: Trivial

**Problem**:
`services/authService.ts:877-910` — `recordFailedAttempt` and `isAccountLocked` key `failedAttempts` and `lockoutTime` off the **raw** username string. But `services/dataService.ts:103` and `:247` resolve users **case-insensitively**. And `validators/authValidators.ts` lowercases username on *registration* via a `usernameSchema` transform, while the `loginSchema` does not.

**Exploit scenario**:
Try passwords against `jared`, then `Jared`, then `jArEd`, then `JAred`. Each casing gets its own fresh five-attempt budget and its own independent lockout entry, while `getUserByUsername` resolves every one of them to the same account. The five-attempt lockout — the primary brute-force control — is effectively unbounded. Combined with SA-11 (no per-IP isolation) and SA-18 (timing enumeration), the login surface is weaker than the individual controls suggest.

**Fix**:
Both layers, deliberately — either alone closes the hole, but each covers a case the other doesn't.

✅ **Validator**: `loginSchema.username` gains `.transform(val => val.toLowerCase())`, matching what `usernameSchema` already did for registration.

✅ **Service**: a private `lockoutKey()` helper normalizes in `recordFailedAttempt`, `resetFailedAttempts`, `isAccountLocked`, and the public `getFailedAttempts`. This matters independently of the validator because internal callers and future routes can reach the lockout path without going through `loginSchema` — the control should not depend on which door the request came through.

✅ Six regression cases in `backend/src/__tests__/unit/authLockoutCasing.test.ts` covering both layers: the validator collapses all casing variants to one string and leaves the password untouched; the counter accumulates across variants into a single tally, locks the account regardless of which casing crossed the 5-attempt threshold, and clears for every variant on success.

**Files**:
- `backend/src/validators/authValidators.ts` ✅
- `backend/src/services/authService.ts` ✅
- `backend/src/__tests__/unit/authLockoutCasing.test.ts` ✅ (new, 6 cases)

---

### SA-13: Password change doesn't invalidate existing JWTs
**Status**: Open
**Severity**: Medium
**Effort**: Medium

**Problem**:
`authService.ts:484-551` (`changePassword`) and `:626-749` (`resetPassword`) update `passwordHash` and nothing else. There is no token version, no `passwordChangedAt` claim, and no deny-list; `authMiddleware.ts:100-203` validates signature plus workspace membership only. `routes/authRoutes.ts:217-237` — `/logout` writes a log line and nothing more; the token stays valid server-side for its full life.

**Exploit scenario**:
A token is stolen (see SA-27 for the most likely route). The victim notices something wrong and changes their password — the single action every user believes revokes access. The stolen token keeps working for the remainder of its 7 days, and via SA-14 can be refreshed indefinitely from there. Password rotation currently offers no recovery path, which inverts the user's reasonable expectation.

**Fix**:
Add a `tokenVersion` (or `passwordChangedAt`) field to `User`, embed it in the JWT, and reject stale values in `authenticate`. Bump it on password change, password reset, and explicit logout. Cost is near zero: the 60-second `membershipCache` lookup in `authMiddleware` already reads the user record.

**Files**:
- `backend/src/services/authService.ts`
- `backend/src/services/dataService.ts`
- `backend/src/middleware/authMiddleware.ts`

---

### SA-14: `/auth/refresh` has no absolute lifetime and no rate limit
**Status**: Open
**Severity**: Medium
**Effort**: Low

**Problem**:
`routes/authRoutes.ts:106-124` → `authService.refreshToken` (`:408-432`) validates the presented token and mints a fresh 7-day one from the same claims. There is no maximum session age, no re-check of workspace membership, no rotation or reuse detection — and unlike `/login`, `/register`, `/request-reset`, and `/reset-password`, the route carries **no `rateLimitAuth`**.

**Exploit scenario**:
One exfiltrated token becomes permanent access. The attacker calls `/auth/refresh` once a week, forever. Short of rotating `JWT_SECRET` — which logs out both real users — there is no revocation. This is what upgrades SA-13 and SA-27 from "bad day" to "unbounded compromise."

**Fix**:
Stamp an original-issue timestamp into the token and refuse to refresh past an absolute cap (30 days is generous for two users). Re-run `verifyFamilyMembership` inside `refreshToken`. Add `rateLimitAuth` to the route for consistency with every other auth endpoint.

**Files**:
- `backend/src/routes/authRoutes.ts`
- `backend/src/services/authService.ts`

---

### SA-15: Any family member can remove any other member
**Status**: Open
**Severity**: Medium
**Effort**: Low

**Problem**:
`backend/src/routes/family.ts:104-124` — `DELETE /family/members/:id` correctly takes `familyId` from `req.user` (so there is no cross-family reach), but passes an arbitrary `req.params.id` straight into `familyService.removeMember` with no check that the caller is an owner or admin, no check that the target isn't the caller, and no check that the target isn't the last remaining member. `services/familyService.ts:102-132` then clears the target's `workspaceIds` and blanks `familyId` and `activeWorkspaceId` when it was their last workspace.

**Exploit scenario**:
A single compromised token — or one mis-aimed API call — removes the spouse, instantly orphaning them from every budget, transaction, and linked account. On their next login, `authService.login:280-303` provisions them a **brand-new empty family**, so the UI presents as total data loss rather than as an access change. Self-removal is equally permitted and locks the caller out of their own data.

**Fix**:
Require the caller to be the family creator/admin; reject `targetUserId === req.user.userId`; reject removing the final member.

**Files**:
- `backend/src/routes/family.ts`
- `backend/src/services/familyService.ts`

---

### SA-16: `optionalAuthenticate` skips the membership check
**Status**: Open
**Severity**: Low (latent — currently unused)
**Effort**: Trivial

**Problem**:
`middleware/authMiddleware.ts:209-241` populates `req.user` from the JWT alone: no `verifyFamilyMembership` call, and it hardcodes `workspaceIds: [validation.decoded.familyId]`. Grep confirms nothing outside `authMiddleware.ts` imports it today.

**Exploit scenario**: None today. The risk is that the next route to adopt it silently inherits an authorization hole a removed member could ride — and it *looks* safe, which is what makes it worth removing rather than documenting.

**Fix**: Delete it. If a genuine optional-auth route appears later, mirror the membership verification from `authenticate` then.

**Files**:
- `backend/src/middleware/authMiddleware.ts`

---

### SA-17: Membership verification is disabled by default under test
**Status**: Open
**Severity**: Low
**Effort**: Low

**Problem**:
`middleware/authMiddleware.ts:56-59`: `if (process.env.NODE_ENV === 'test' && !process.env.TEST_MEMBERSHIP_VERIFICATION) return true;`. `rateLimit/index.ts:43-46` similarly short-circuits all limiters in test.

**Impact**: Not exploitable in production. It does mean the workspace-isolation boundary — the single most important control in the app, and the one SA-15 and SA-10 both stress — is unexercised by the suite that would catch a regression in it.

**Fix**: Flip the default so tests exercise the real path, and opt *out* explicitly in the handful of tests that need to.

**Files**:
- `backend/src/middleware/authMiddleware.ts`
- `backend/src/middleware/rateLimit/index.ts`

---

### SA-18: Username enumeration by login timing
**Status**: Open
**Severity**: Low
**Effort**: Low

**Problem**:
`authService.ts:245-274` returns immediately when the user is not found, but runs `bcrypt.compare` (cost 10, roughly 50-100 ms) when it is. The error string is identical; the latency is not.

**Impact**: Genuinely low here — two users with guessable usernames means there is little to enumerate. Fix if you are in the file anyway: compare against a fixed dummy hash on the not-found path.

**Files**:
- `backend/src/services/authService.ts`

---

## Input validation & data handling

### SA-19: Encrypted Plaid access tokens are returned to the browser
**Status**: **Resolved (2026-08-02)**
**Severity**: **High**
**Effort**: Low

**Problem**:
`backend/src/routes/accounts.ts:94-102` (GET `/api/v1/accounts` spreads `...account`) and `:69-72` (POST `/connect` returns `result.account`) serialize `StoredAccount` verbatim. That type includes `plaidAccessToken` (`services/accountService.ts:25`, AES-256-GCM ciphertext), plus `plaidItemId` and `plaidCursor`. Every account listing therefore ships the encrypted token blob to the client, where it sits in React Query caches, devtools, and any client-side logging.

**Exploit scenario**:
Not directly exploitable today — the encryption is strong (see "Verified sound" below). The problem is that it collapses two independent defenses into one. Anyone who obtains `PLAID_ENCRYPTION_SECRET` by any route — env leak, a deploy tarball per SA-25, a laptop — plus a captured API response now holds a live Plaid access token. The response should never have carried it. It also leaks Plaid item internals with no client-side purpose.

**Fix**:
✅ Added `toClientAccount()` plus an exported `ClientAccount` type in `accountService.ts`, driven by a single `CLIENT_OMITTED_ACCOUNT_FIELDS` list so the omission set is stated once and the type is derived from it (`Omit<StoredAccount, ...>`) rather than hand-maintained alongside it. The mapper copies before deleting — it runs against objects that may still be written back to storage, and stripping in place would destroy the real token.

✅ Applied at both serialization sites in `routes/accounts.ts`: GET `/` (which was spreading `...account`) and POST `/connect`.

**Scope check before changing anything**: those two are the *only* places a `StoredAccount` is serialized. `routes/plaid.ts:125` also returns accounts, but they are raw Plaid API objects from a dead placeholder handler slated for deletion under SA-20, not stored accounts.

**Four fields stripped, not three.** The original triage listed `plaidAccessToken`, `plaidCursor`, and `plaidItemId`; `plaidAccountId` is the same class of opaque Plaid identifier and is equally unread by the SPA, so it goes too. Only the first two are actually sensitive — the token is the live credential, and the cursor is a delivery receipt whose advancement is irreversible (TD-020). The two IDs are defense in depth.

**Contract updated to match.** `plaidAccountId` and `plaidItemId` were declared **required** on `PlaidAccount` in `shared/types/index.ts`. They are now optional with a docblock pointing here, because a type that promises a field the API no longer sends is worse than either sending it or removing it outright. Optional rather than deleted so existing fixtures still typecheck. Verified first that nothing outside test fixtures reads either field, and that the backend never consumes `PlaidAccount` at all — it is purely a wire type.

✅ Five regression cases in `backend/src/__tests__/critical/accountTokenLeak.test.ts`, filed under `critical/` because this guards a bank credential. They assert on the **serialized JSON**, not the mapper's return type — TypeScript's structural typing would happily let an extra field ride along at runtime, so the wire is the boundary worth testing. Cases: the four keys are absent; a sentinel token value appears nowhere in the serialized payload (catches a nested or renamed copy that a key-name check would miss); every field the UI renders survives; the input object is not mutated; and the leak stays closed through the spread-plus-alias shape GET `/` actually uses.

**Validated by reintroducing the leak**: reverting the mapper to a plain spread fails three of the five.

**Files**:
- `backend/src/services/accountService.ts` ✅
- `backend/src/routes/accounts.ts` ✅
- `shared/types/index.ts` ✅
- `backend/src/__tests__/critical/accountTokenLeak.test.ts` ✅ (new, 5 cases)

---

### SA-20: Dead Plaid routes with a placeholder access token
**Status**: Open
**Severity**: Medium
**Effort**: Low

**Problem**:
`backend/src/routes/plaid.ts:107, 149, 189` — `const accessToken = 'access-token-placeholder'` in GET `/plaid/accounts`, GET `/plaid/transactions`, and POST `/plaid/item/remove`. These are scaffolding-era endpoints that call the real `plaidService` with a fake token. They are authenticated but functionally broken.

**Exploit scenario**:
Not exploitable as written. The risk is the shape they invite: they take `itemId` from the query string rather than from the caller's own stored accounts, so anyone who "fixes" them by wiring in real token lookup — the obvious next step for whoever finds them — creates an unscoped cross-family Plaid operation, and `POST /plaid/item/remove` is destructive. Dead code that looks live is worse than dead code that looks dead.

**Fix**:
Delete all three handlers. The real flows already run through `routes/accounts.ts` → `accountService`.

**Files**:
- `backend/src/routes/plaid.ts`

---

### SA-21: `photoAlbumUrl` accepts `javascript:` server-side
**Status**: Open
**Severity**: Low
**Effort**: Trivial

**Problem**:
`backend/src/routes/trips.ts:17-20` validates with `z.string().url()`, which accepts any scheme including `javascript:`. The value is rendered as `href={trip.photoAlbumUrl}` at `frontend/src/pages/TripDetail.tsx:272-280`. The frontend form (`TripFormModal.tsx:201-210`) enforces http(s), but a direct API call bypasses it.

**Impact**: Small. The anchor carries `target="_blank" rel="noopener noreferrer"`, and modern browsers block `javascript:` navigation in that context. It matters more than it otherwise would because the JWT lives in localStorage (SA-27), so any stored-XSS foothold escalates to account takeover.

**Fix**:
Mirror the frontend check server-side: `.refine(u => { const p = new URL(u).protocol; return p === 'http:' || p === 'https:'; })`.

**Files**:
- `backend/src/routes/trips.ts`

---

### SA-22: Storage adapters don't sanitize keys
**Status**: Open
**Severity**: Low (defense in depth — no current exploit)
**Effort**: Trivial

**Problem**:
`services/storage/filesystemAdapter.ts:24-28` does `path.join(this.dataDir, fileName)` with no rejection of `..` or `/`, and `write()` calls `fs.ensureDir(path.dirname(filePath))`, so a traversing key would helpfully create the directories. `s3Adapter.ts:28-31` concatenates the prefix raw.

**Assessment**: Every storage key in the app was traced. All are template literals whose variable segment is `req.user.familyId` or `req.user.userId` **from the verified JWT** (`authMiddleware.ts:136-156`), or a fixed string like `chatbot_costs_YYYY-MM`. No `req.params`, `req.body`, or `req.query` value reaches a key today — checked `wishlistService.ts:41`, `themes.ts`, `notifications.ts:174`, and the rest. **There is no exploitable traversal.** The risk is that the property holding this safe is a convention nobody has written down: one future route with a key like `budgets_${req.params.month}` makes it a writable traversal.

**Fix**:
Reject keys failing `/^[A-Za-z0-9._-]+$/` inside `getFilePath` and `getS3Key`. One-time, cheap, and closes the class permanently rather than relying on every future author noticing.

**Files**:
- `backend/src/services/storage/filesystemAdapter.ts`
- `backend/src/services/storage/s3Adapter.ts`

---

### SA-23: Endpoints that skip Zod, led by an unbounded CSV body
**Status**: Open
**Severity**: Low
**Effort**: Low

**Problem**:
Zod coverage is broad — transactions, reports, tasks, trips, notifications, themes, business statements, auth, and chatbot all validate. These are the exceptions:

| Location | Gap |
|---|---|
| `routes/categories.ts:141` | `csvContent` — manual `typeof === 'string'` only, **no length cap**, while `express.json` allows 10 MB and `parseCSVContent` is synchronous line-by-line work over the whole payload |
| `routes/categories.ts:291` | `newCategoryId` — any string, no existence check (see SA-06) |
| `routes/autoCategorize.ts:315,346` | `forceRecategorize` / `transactionIds` destructured untyped; `transactionIds` could reach the service as a non-array |
| `routes/budgets.ts:133-152` | `startMonth` / `endMonth` cast `as string` from query (service does throw on bad format) |
| `routes/trips.ts:135,148`, `routes/projects.ts:111,124` | `parseInt(req.query.year)` with no `NaN` guard |

**Impact**: All are behind auth with JWT-derived family scoping, so these are robustness and data-integrity gaps rather than access-control holes. The worst concrete case is the unbounded `csvContent` — an authenticated user can pin a CPU with a 10 MB body, and the route sets a 5-minute `res.setTimeout`.

**Fix**:
`z.string().max(1_000_000)` on `csvContent`; small schemas for the rest; validate `newCategoryId` exists or is null before bulk recategorize.

**Files**:
- `backend/src/routes/categories.ts`, `autoCategorize.ts`, `budgets.ts`, `trips.ts`, `projects.ts`

---

### SA-24: `/feedback/test` is documented admin-only but isn't
**Status**: **Resolved (2026-08-02)**
**Severity**: Low
**Effort**: Trivial

**Problem**:
`backend/src/routes/feedback.ts:49-58` — the docblock says "(admin only)" but the route applies only `authenticate`, with no `adminMiddleware` (contrast `routes/admin.ts:16-17`, which applies both).

**Impact**: Any authenticated user can probe GitHub PAT connectivity status. The PAT itself is never returned, so this is information disclosure only. Worth fixing mainly because a comment asserting a control that doesn't exist is how the *next* person mis-reasons about the file.

**Fix**:
✅ `adminMiddleware` added after `authenticate`, matching the ordering in `routes/admin.ts:16-17`. Chose to honor the docblock rather than relax it — a connectivity probe against the GitHub PAT is an operator tool, not a user feature.

**Checked before changing**: `grep` for `feedback/test` across `frontend/src` and `backend/src` returns no callers, so tightening the gate breaks nothing. (Had the SPA called it for ordinary users, the right fix would have been correcting the comment instead.)

**Files**:
- `backend/src/routes/feedback.ts` ✅

---

## Secrets & infrastructure

### SA-25: Deploy tarballs in S3 contain the full production `.env`
**Status**: Open
**Severity**: **High**
**Effort**: Medium

**Problem**:
`.github/workflows/release-and-deploy.yml:293-322` writes a complete `.env` — `JWT_SECRET`, the Plaid secret, `PLAID_ENCRYPTION_SECRET`, `ANTHROPIC_API_KEY`, GitHub PATs, and the VAPID private key — into the deployment package. Lines `:347` and `:356-365` then tar it and upload to `s3://$PRODUCTION_S3_BACKUP_BUCKET/deployments/v*.tar.gz`. `scripts/server-rollback.sh` consumes these tarballs, so they are retained by design.

**Exploit scenario**:
Every historical deployment package is a complete, readable credential bundle at rest. Anyone who gains read access to the backup bucket — a leaked AWS key, an over-broad IAM policy, a bucket-policy mistake — obtains every production secret in one fetch, including the key that decrypts all Plaid access tokens. The retention makes it worse in a non-obvious way: **rotated secrets survive their own rotation** in old tarballs, so rotation stops being a remediation.

**Fix**:
Stop embedding `.env` in the artifact. Have `scripts/deploy-server.sh` pull secrets from SSM Parameter Store (SecureString) at deploy time — already sketched as a planned improvement in [AI-DEPLOYMENTS.md](AI-DEPLOYMENTS.md):697-702. Interim mitigation while that is built: an S3 lifecycle rule expiring old deployment tarballs, and re-verify the bucket is private and encrypted.

**Files**:
- `.github/workflows/release-and-deploy.yml`
- `scripts/deploy-server.sh`
- `scripts/server-rollback.sh`

---

### SA-26: Static long-lived AWS keys in GitHub Actions
**Status**: Open
**Severity**: Medium
**Effort**: Medium

**Problem**:
`release-and-deploy.yml:352-353`, `rollback.yml:31-32`, and `update-server-scripts.yml:27-28` all authenticate with `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` IAM user credentials.

**Exploit scenario**:
A GitHub org or repo compromise yields durable AWS access that outlives the incident. Note what that access reaches: `ssm send-command` against the EC2 instance is remote code execution as root, via the `sudo -u appuser` wrapper at `release-and-deploy.yml:374-377`.

**Fix**:
Switch `aws-actions/configure-aws-credentials` to GitHub OIDC federation with a role scoped to the deploy bucket plus SSM on that one instance. Credentials become short-lived and repo-scoped, and there is nothing durable left to steal.

**Files**:
- `.github/workflows/release-and-deploy.yml`, `rollback.yml`, `update-server-scripts.yml`

---

### SA-27: JWT in localStorage with no SPA-layer CSP
**Status**: Open — overlaps the open follow-up in [TD-004](AI-TECHNICAL-DEBT.md#td-004-no-content-security-policy-header)
**Severity**: Medium
**Effort**: Medium

**Problem**:
`frontend/src/stores/authStore.ts:212-220` persists the token into the zustand `auth-storage` localStorage key; `frontend/src/lib/api/client.ts:24-34` reads it back (with a legacy fallback to a bare `token` key).

The exposure is that the SPA has **no Content-Security-Policy at all**. `terraform/user_data.sh:101-104` sets `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, and `Referrer-Policy` on the SPA — but no CSP. The strict `default-src 'none'` policy in `app.ts:87-105` applies only to JSON API responses, as its own comment acknowledges ("The SPA's CSP is set separately at the static-asset layer"). That layer does not set one. TD-004 recorded this follow-up in April and it has not shipped.

**Exploit scenario**:
Any XSS in the SPA — or a compromised npm dependency, which is the more likely vector given the frontend dependency surface — reads `localStorage['auth-storage']` and exfiltrates a 7-day bearer token to a Plaid-linked financial account. Per SA-14 that token is then refreshable indefinitely, and per SA-13 changing the password does not revoke it. An `httpOnly` cookie would be unreadable by script and would break the chain at step one.

**Fix**:
Two stages, both worth doing.
1. **Now**: add a real CSP at the nginx static-asset block. TD-004 already lists the origins the SPA legitimately needs — `cdn.plaid.com`, `maps.googleapis.com` / `maps.gstatic.com`, `fonts.googleapis.com` / `fonts.gstatic.com`, and `'unsafe-inline'` for `style-src` (Mantine CSS-in-JS). Pair with a runtime walk through Plaid Link, the Trips map, and the chatbot before promoting.
2. **Later**: move the token to an `httpOnly; Secure; SameSite=Strict` cookie plus a CSRF token. CORS is already `credentials: true` and production is same-origin through the nginx proxy, so the migration is contained.

**Files**:
- `terraform/user_data.sh`
- `frontend/src/stores/authStore.ts`, `frontend/src/lib/api/client.ts` (stage 2)

---

### SA-28: Plain-HTTP origin in the production CORS allowlist
**Status**: Open
**Severity**: Low
**Effort**: Trivial

**Problem**:
`backend/src/app.ts:59` allows `http://budget.jaredcarrano.com` with `credentials: true`. HSTS (`app.ts:103`) largely neutralizes this for any browser that has visited once, but it is an unnecessary credentialed non-TLS origin.

**Fix**: Delete the `http://` entry. Consider sourcing the production origin from `FRONTEND_URL` instead of hardcoding it.

**Files**:
- `backend/src/app.ts`

---

### SA-29: Unauthenticated version and changelog endpoints
**Status**: Open
**Severity**: Low
**Effort**: Trivial

**Problem**:
`backend/src/app.ts:123-131` (`/health` — version and environment), `:166-191` (`/api/v1/version` — commit hash and unreleased changelog), and `:194-225` (full changelog) are public. They sit behind the global rate limit but require no auth.

**Impact**: Deployment fingerprinting. Entirely reasonable to accept for a two-user app; `/health` in particular should stay public for monitoring. Putting `/version` and `/changelog` behind auth is cheap if you want it.

**Files**:
- `backend/src/app.ts`

---

### SA-30: Vestigial `ENCRYPTION_KEY` invites rotating the wrong secret
**Status**: Open
**Severity**: Low (hygiene — but see the landmine)
**Effort**: Trivial

**Problem**:
`release-and-deploy.yml:305` writes `ENCRYPTION_KEY=...` and `scripts/generate-env.sh:17` references it, but `backend/src/config.ts:279-287` consumes only `PLAID_ENCRYPTION_SECRET`. The variable is dead. (This is residue from TD-001, which fixed the code and `.env.example` but left the workflow.)

**Why it is worth the five minutes**: two similarly-named "encryption key" secrets in GitHub is exactly the setup where someone rotates the wrong one during cleanup. Per TD-025's landmine, rotating the *real* one orphans every linked bank and requires re-linking every institution. The failure mode is disproportionate to the tidiness of the fix.

**Fix**: Remove `ENCRYPTION_KEY` from the workflow, from `scripts/generate-env.sh`, and from GitHub secrets.

**Files**:
- `.github/workflows/release-and-deploy.yml`
- `scripts/generate-env.sh`

---

### SA-31: Single readable copy of `PLAID_ENCRYPTION_SECRET`
**Status**: **Duplicate** — tracked as [TD-025](AI-TECHNICAL-DEBT.md#td-025-production-secrets-exist-in-exactly-one-readable-place), primary risk closed 2026-08-02

Re-surfaced independently by this audit; not re-litigated here. TD-025's remaining optional hardening (move to Secrets Manager / SSM) is the same work as SA-25's fix and should be done once, not twice.

---

## Verified sound

Recorded so a future audit doesn't re-derive it, and so nobody "hardens" something that is already correct.

**Multi-tenant isolation is clean.** Grepping every route and service for `req.query.familyId`, `req.body.familyId`, and `params.familyId` returns **zero hits**. Every handler scopes off `req.user.familyId`, which comes only from the verified JWT claim. This is the single most important control in the app and there is no gap in it.

**The workspace switcher cannot be abused.** `authService.switchWorkspace:757-806` asserts `workspaceIds.includes(targetFamilyId)` before persisting or re-issuing a token; `routes/authRoutes.ts:341-362` maps failure to 403. A forged switch request cannot mint a token for a family the user doesn't belong to.

**Membership is re-verified server-side on every request.** `authMiddleware.ts:55-90` re-checks the JWT's `familyId` against stored `workspaceIds` with a 60-second cache, so a removed member's outstanding token dies within a minute rather than at expiry. Many apps skip this.

**No unauthenticated data endpoints.** All 27 route modules were enumerated. Every data-bearing route carries authentication. The only public endpoints are `/health`, `/api/v1/version`, `/api/v1/changelog`, and `notifications.ts:65` `/vapid-public-key` — all correctly public (see SA-29 for the minor caveat).

**Plaid token encryption is textbook.** `utils/encryption.ts`: AES-256-GCM (AEAD), random 32-byte salt and random 16-byte IV per encryption, PBKDF2-SHA256 at 100k iterations, auth tag verified on decrypt, startup `validateEncryption()`. No ECB, no static IVs. `config.ts:281-287` refuses to boot in production without a `PLAID_ENCRYPTION_SECRET` distinct from `JWT_SECRET`.

**JWT handling is correct.** Algorithm pinned to HS256 on both sign and verify (`authService.ts:369,380`) — the `alg: none` and algorithm-confusion class is closed. `JWT_SECRET` is Zod-required at config load (`config.ts:46`) with no fallback anywhere.

**The SEC-018 read-only chatbot boundary is real, not aspirational.** `services/index.ts:92-96` wires `ChatbotDataService` with `ReadOnlyDataServiceImpl` only; `readOnlyDataService.ts` exposes just `getData` and `getCategories`; `chatbotDataService.ts` imports no write-capable service; every tool in `executeTool` (`chatbotService.ts:387-421`) is a read. `getAccounts` explicitly strips `plaidAccessToken` and Plaid IDs (`chatbotDataService.ts:410-431`).

**The chat-action nonce flow is solid.** `randomUUID` nonce, 15-minute TTL, single-use with mark-before-execute, cross-user attempts indistinguishable from missing (`proposalStore.ts:97-112`), supersede-on-new-proposal, the nonce is never sent to the LLM, and Zod revalidation on confirm is genuine (`routes/chatbot.ts:331`) against the same schema the HTTP route uses. The registry is a `Map` (prototype-pollution safe) with a duplicate-registration guard, and every success and rejection is audit-logged. SA-05 is a gap in what the *user sees*, not in this machinery.

**The injection surface is essentially empty.** No `eval`, `new Function`, or `child_process` anywhere in `backend/src` or `frontend/src`. Zero `dangerouslySetInnerHTML`, `innerHTML`, or `document.write` in the frontend (the `ChangelogModal.tsx` regex hits build React nodes, not raw HTML). No SQL. Outbound fetches are fixed-URL only — `chatActions/submitGithubIssueAction.ts:41` hardcodes the repo, so there is no SSRF.

**File uploads are genuinely hardened.** `pdfUpload.ts` and `chatAttachmentUpload.ts` both use multer `memoryStorage` (never written to disk or S3), a MIME allowlist, size caps (20 MB / 10 MB), a file-count cap, **magic-byte verification against the declared MIME**, a PDF page-count cap, and friendly error mapping. The expensive Claude-vision endpoints carry their own per-user rate limits (`amazonReceipts.ts:69-73`).

**Amazon vision extraction validates strictly.** `amazonPdfParser.ts` uses regex-constrained order numbers, bounded dates/amounts/arrays, card-number stripping to last-4 (`:195-202`), and per-row salvage. This is the model to copy for SA-06.

**Log redaction is a real backstop.** `utils/logger.ts:37-85` redacts tokens, passwords, Plaid tokens, account and routing numbers, emails, and the VAPID private key, including array-nested paths. `errorHandler.ts:47-48` hides stack traces in production.

**Helmet config on the API is unusually good.** `default-src 'none'` CSP for the JSON-only surface, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'none'`, HSTS at 1 year with `includeSubDomains`, and `no-referrer` (`app.ts:87-105`).

**No secrets in tracked files.** A full-repo sweep for `sk-ant`, `AKIA`, `ASIA`, `-----BEGIN`, `ghp_`, `xox*`, `AIza`, and generic `password=` / `secret=` literals found only test fixtures (`__tests__/unit/config.test.ts:51`, `logger.test.ts:47`). `.gitignore` covers `.env*`, `backend/data/`, and reconcile plans containing real transaction rows, plus belt-and-suspenders `*plaid*secret*` patterns. `git ls-files backend/data` confirms zero committed data files.

**Chat-action guardrails**: 10-iteration tool loop ceiling, 4096 max output tokens, 50-message history truncation, per-user 5/min rate limit persisted across restarts, a pre-flight cap check before any Claude call, and transaction rows capped at 50/500 per tool call.

---

## Audit method

Four independent reviews ran in parallel against the tree at `a60cf5b`, each scoped to one area and each required to cite `file:line` and verify by reading code rather than pattern-matching:

1. **Authentication and authorization** — `authService`, auth and admin middleware, all 27 route modules enumerated for unprotected endpoints, workspace isolation, frontend token storage, rate limiting, registration and reset flows.
2. **Input validation and data handling** — Zod coverage across routes, path traversal into the per-family JSON key space, injection surface, upload handling, Plaid token exposure, error-response leakage, CORS and CSRF posture.
3. **AI/LLM boundary** — the SEC-018 read-only contract, the chat-action registry and proposal/nonce flow, prompt injection via attacker-influenceable transaction data, cost controls, the Amazon vision path, and API key handling.
4. **Secrets and infrastructure** — repo-wide secret sweep, encryption implementation review, JWT secret handling, security headers, CI/CD workflows, logging, and committed data files. Code and repo only; no live AWS was touched.

Plus `npm audit` against both packages, resolved same-day as SA-01.

**Not covered by this audit** — worth knowing what the "comprehensive" label does *not* include: no live infrastructure review (IAM policies, bucket policies, security groups, and the actual nginx config on the instance were read only as they appear in `terraform/` and `docs/`, which may have drifted from reality); no dynamic testing or exploitation — every finding is from source reading, so the exploit scenarios are reasoned, not demonstrated; no Plaid-side configuration review; and no review of the two workspaces' data at rest.
