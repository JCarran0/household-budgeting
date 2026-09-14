# Family Tracker — Development Guide

Family-scale app for 2 users: personal budgeting (with Plaid), shared tasks, trips, and projects. Formerly "Household Budgeting App" / "Budget Tracker"; chatbot renamed "Budget Bot" → "Helper Bot" in the same rebrand. TypeScript strict, risk-based testing.

## 📚 Documentation Index

| Document | Purpose |
|----------|---------|
| [AI-APPLICATION-ARCHITECTURE.md](docs/AI-APPLICATION-ARCHITECTURE.md) | Service patterns, API structure, data flow, common tasks |
| [AI-DEPLOYMENTS.md](docs/AI-DEPLOYMENTS.md) | CI/CD, AWS infra, production ops, SSH/PM2 |
| [AI-TESTING-STRATEGY.md](docs/AI-TESTING-STRATEGY.md) | Test philosophy, examples, troubleshooting |
| [AI-USER-STORIES.md](docs/AI-USER-STORIES.md) | Product requirements, acceptance criteria |
| [AWS-LOCAL-SETUP.md](docs/AWS-LOCAL-SETUP.md) | Local dev with synced production data |
| [completed/AI-Architecture-Plan.md](docs/completed/AI-Architecture-Plan.md) | Historical cost analysis & early ADRs |
| `backend/.env.example` | Required environment variables |

### Feature BRDs & Plans
| Feature | BRD | Plan |
|---------|-----|------|
| AI Chatbot | [AI-CHATBOT-BRD.md](docs/features/AI-CHATBOT-BRD.md) | [AI-CHATBOT-PLAN.yaml](docs/features/AI-CHATBOT-PLAN.yaml) |
| AI Categorization | [AI-CATEGORIZATION-BRD.md](docs/features/AI-CATEGORIZATION-BRD.md) | [AI-CATEGORIZATION-PLAN.yaml](docs/features/AI-CATEGORIZATION-PLAN.yaml) |
| AI Amazon Receipts | [AI-AMAZON-RECEIPT-BRD.md](docs/features/AI-AMAZON-RECEIPT-BRD.md) | [AI-AMAZON-RECEIPT-PLAN.yaml](docs/features/AI-AMAZON-RECEIPT-PLAN.yaml) |
| AI Chat Actions | [AI-CHAT-ACTIONS-BRD.md](docs/features/AI-CHAT-ACTIONS-BRD.md) | [AI-CHAT-ACTIONS-PLAN.yaml](docs/features/AI-CHAT-ACTIONS-PLAN.yaml) |
| AI Capability Platform | [AI-CAPABILITY-PLATFORM-BRD.md](docs/features/AI-CAPABILITY-PLATFORM-BRD.md) | [AI-CAPABILITY-PLATFORM-PLAN.yaml](docs/features/AI-CAPABILITY-PLATFORM-PLAN.yaml) |
| AI Agent Learnings | [AI-AGENT-LEARNINGS-BRD.md](docs/features/AI-AGENT-LEARNINGS-BRD.md) | [AI-AGENT-LEARNINGS-PLAN.yaml](docs/features/AI-AGENT-LEARNINGS-PLAN.yaml) |
| Auto-Cat Suggestions | [AUTO-CAT-SUGGESTIONS-BRD.md](docs/features/AUTO-CAT-SUGGESTIONS-BRD.md) | [AUTO-CAT-SUGGESTIONS-PLAN.yaml](docs/features/AUTO-CAT-SUGGESTIONS-PLAN.yaml) |
| Category Hierarchy | [CATEGORY-HIERARCHY-BUDGETING-BRD.md](docs/features/CATEGORY-HIERARCHY-BUDGETING-BRD.md) | [CATEGORY-HIERARCHY-BUDGETING-PLAN.yaml](docs/features/CATEGORY-HIERARCHY-BUDGETING-PLAN.yaml) |
| Savings Categories | [SAVINGS-CATEGORY-BRD.md](docs/features/SAVINGS-CATEGORY-BRD.md) | [SAVINGS-CATEGORY-PLAN.yaml](docs/features/SAVINGS-CATEGORY-PLAN.yaml) |
| Rollover Budgets | [ROLLOVER-BUDGETS-BRD.md](docs/features/ROLLOVER-BUDGETS-BRD.md) | — |
| Budget vs. Actuals II | [BUDGET-VS-ACTUALS-II-BRD.md](docs/features/BUDGET-VS-ACTUALS-II-BRD.md) | — |
| Trip Itineraries | [TRIP-ITINERARIES-BRD.md](docs/features/TRIP-ITINERARIES-BRD.md) | [TRIP-ITINERARIES-PLAN.yaml](docs/features/TRIP-ITINERARIES-PLAN.yaml) |
| Trip Enhancements V2 | [TRIP-ENHANCEMENTS-V2-BRD.md](docs/features/TRIP-ENHANCEMENTS-V2-BRD.md) | [TRIP-ENHANCEMENTS-V2-PLAN.yaml](docs/features/TRIP-ENHANCEMENTS-V2-PLAN.yaml) |
| Trip Place Photos | [TRIP-PLACE-PHOTOS-BRD.md](docs/features/TRIP-PLACE-PHOTOS-BRD.md) | [TRIP-PLACE-PHOTOS-PLAN.yaml](docs/features/TRIP-PLACE-PHOTOS-PLAN.yaml) |
| Projects | [PROJECTS-BRD.md](docs/features/PROJECTS-BRD.md) | [PROJECTS-ENHANCEMENTS-PLAN.yaml](docs/features/PROJECTS-ENHANCEMENTS-PLAN.yaml) |
| Task Management v2.0 | [TASK-MANAGEMENT-BRD.md](docs/features/TASK-MANAGEMENT-BRD.md) | [TASK-MANAGEMENT-ENHANCEMENTS-PLAN.yaml](docs/features/TASK-MANAGEMENT-ENHANCEMENTS-PLAN.yaml) |
| Task Leaderboard v2.0 | [TASK-LEADERBOARD-BRD.md](docs/features/TASK-LEADERBOARD-BRD.md) | — |
| Stale Data Mitigation | [STALE-DATA-MITIGATION-BRD.md](docs/features/STALE-DATA-MITIGATION-BRD.md) | [STALE-DATA-MITIGATION-PLAN.yaml](docs/features/STALE-DATA-MITIGATION-PLAN.yaml) |
| Wishlist | [WISHLIST-BRD.md](docs/features/WISHLIST-BRD.md) | [WISHLIST-PLAN.yaml](docs/features/WISHLIST-PLAN.yaml) |
| Business Workspace | [BUSINESS-WORKSPACE-BRD.md](docs/features/BUSINESS-WORKSPACE-BRD.md) | [BUSINESS-WORKSPACE-PLAN.yaml](docs/features/BUSINESS-WORKSPACE-PLAN.yaml) |

## 🤖 Critical Rules — Never Violate

1. **No `any` types** — use `unknown` with type guards, generics, or proper types
2. **No committed secrets** — sensitive data via env vars
3. **No skipped validation** — validate inputs with Zod, sanitize outputs
4. **No direct production edits** — all changes go through GitHub → CI/CD
5. **No suppressed TypeScript errors** — fix, don't suppress
6. **File size budgets** — frontend pages ≤600 LOC, backend services ≤800 LOC. If a change pushes you over the budget, extract a collaborator (sibling component, helper module) *before* adding more lines. Do not silence with `// eslint-disable max-lines` or split a file just to slip under. Pre-existing offenders are tracked in the tech-debt plan, not grandfathered for new growth. Frontend ESLint warns on overage; backend has no lint-time enforcement, so the rule lives here.

## 🔧 Security-Sensitive & Shared-Utils Files

**Security boundaries — do not erode:**
- `backend/src/services/chatbotDataService.ts` — chatbot receives `ReadOnlyDataService` only (SEC-018). Writes flow through chat-action-card registry, never LLM-executed.
- `backend/src/services/chatActions/registry.ts` + `proposalStore.ts` — nonce-based, Zod-revalidated, audit-logged write path for chat actions
- `backend/src/services/chatActions/tiers.ts` — `T2_PERMITTED_DATA_CLASSES`. Widening this is the single highest-leverage mistake available in this codebase: it is what keeps unattended, unconfirmed writes away from financial data
- `backend/src/services/chatActions/executionGrant.ts` — proof that authorization happened. Only `proposalStore` may mint a confirmation grant; `executionGrantCallSites.test.ts` scans the source and fails if anything else does, or if any handler is called outside `executeChatAction`
- `backend/src/services/chatActions/tripStopActions.ts` — the model has no way to add a Stay or to write a `kind: 'verified'` location. A verified location is a Google Places record (placeId/lat/lng) that the Map tab plots and the photo lookup queries; a model-supplied one is a fabrication wearing a provenance claim. The refusal lives in the params schema, not in a handler
- `backend/src/services/chatActions/proposalRows.ts` — SEC-P010. Rejects any proposal row that would write a param the action card does not display; without it a plausible-looking card can carry an unseen payload to an outbound action
- `backend/src/middleware/refuseBusinessWorkspace.ts` — gates every AI route, chatbot and activity/undo alike. Shared on purpose: when it lived inside `routes/chatbot.ts`, a second AI router could be written without it and nothing would catch the omission The business workspace holds money held in trust for a client and is excluded from AI entirely, reads included
- `frontend/src/components/chat/ChatMessageBubble.tsx` — the output-rendering invariant (no remote images, host disclosure on external links). Locked by `ChatMessageBubble.security.test.tsx`; treat that test as part of the boundary
- `backend/src/services/chatActions/undoSnapshot.ts` + `actionUndoService.ts` — REQ-P027. Undo must SKIP a record a human edited after the AI touched it, never clobber it. The fingerprint check lives in the service so no action can implement the rule subtly wrong; undoing a create is the one destructive reversal and that check is what stops it deleting a task somebody filled in
- `backend/src/services/actionActivityStore.ts` — the record of every AI write, and the undo handles. Not reachable by the model: an agent-reachable undo is a write primitive outside the proposal mechanism
- `backend/src/services/chatbotReaders/familyMemberReader.ts` — the ONLY AI path to the global `families` blob. Families are not stored per-family, so a read that forgets to select by id leaks every household's roster
- `backend/src/services/authService.ts` — JWT + account lockout
- `backend/src/services/transactionReader.ts` — canonical removed-transaction filter. **All read paths must use `excludeRemoved()` / `getActiveTransactions()`**; mutation paths intentionally bypass.

**Shared calculation utilities — single source of truth, never duplicate:**
- `shared/utils/transactionCalculations.ts` — transfer exclusion
- `shared/utils/budgetCalculations.ts` — parent rollup (`max(parent, Σ children)`) + rollover math (`computeRolloverBalance`, `computeEffectiveBudget`, `buildEffectiveBudgetsMap`, `findRolloverSubtreeConflicts`). Type-agnostic; goodness coloring lives in the consumer.
- `shared/utils/bva*.ts` — Budget vs. Actuals composition, display, filters, serialization. BvA is the **sole v1 consumer of rollover math**.
- `shared/utils/tripHelpers.ts` — stay-overlap validation, agenda composition

**One landmine to know about:**
- `frontend/src/components/budgets/BudgetVsActuals/useDismissedParentIds.ts` — dismiss is **per-user localStorage, NOT `Category.isHidden`**. Conflating them would leak one user's dismissals into the spouse's view. Docblock at the hook; guard every touchpoint in review.

## Common Debugging

| Issue | Fix |
|-------|-----|
| Plaid: `invalid product names: [accounts]` | Remove `accounts` from `PLAID_PRODUCTS` — included automatically with `transactions` |
| Plaid Link phone validation | Enter with country code: `+15551234567` (no spaces/dashes) |
| Account shows `requires_reauth` | User re-auths via "Sign in to Bank" (Plaid Link update mode) |
| Sync succeeds but account unchanged | Check for `warning` field in response — may need re-auth |
| Budget calculation inconsistencies | Use `shared/utils/budgetCalculations.ts`, never duplicate |
| Transfer double-counting | Use `shared/utils/transactionCalculations.ts` — excludes transfers |
| TypeScript `any` errors | `unknown` + type guards; see [AI-APPLICATION-ARCHITECTURE.md](docs/AI-APPLICATION-ARCHITECTURE.md) |
| Body-less POST returns `Invalid request data` | Express 5 leaves `req.body` **undefined** when the request has no body (Express 4 left `{}`), so `schema.safeParse(req.body)` fails an all-optional object schema. Use `safeParse(req.body ?? {})`. Has bitten twice (`/transactions/sync`, then `/accounts/:id/sync-transactions`); ~23 routes still use the bare form and are safe only while every caller sends a body |
| A route starts rejecting every valid body after a chat action imports its schema | Import cycle: `services/index -> chatActions -> routes/X -> services/index`. The route's Zod schema resolves to **undefined** at module-eval time, so `schema.parse` throws and every request 400s — with a `TypeError: Cannot read properties of undefined` downstream rather than anything naming the cycle. Move the schema to `backend/src/validators/` and have BOTH the route and the action import it (see `ruleValidators.ts`, `budgetValidators.ts`, `stopValidators.ts`). `updateTaskSchema` in `routes/tasks.ts` and the transaction schemas in `routes/transactions.ts` are still imported route-side and work only by import order |
| Deploy aborts fetching secrets from SSM | Read the error the script now prints — it is the AWS message, not a guess. Verify from the instance before redeploying; see [AI-DEPLOYMENTS.md](docs/AI-DEPLOYMENTS.md) "First-time setup / disaster recovery" |

## Development

- **Servers often already running** — `npm run dev:check`, `npm run dev:restart`. Frontend `:5183`, backend `:3021`.
- **Env vars** — see `backend/.env.example`. **Do not** include `accounts` in `PLAID_PRODUCTS` (auto-included with `transactions`). `ENCRYPTION_KEY` must be 32-byte hex.
- **Production data locally** — see [AWS-LOCAL-SETUP.md](docs/AWS-LOCAL-SETUP.md). Always `npm run backup:local` first.
- **Testing** — `npm test` in backend/frontend; single file: `npm test -- path/to/file.spec.ts`; integration tests hit real Plaid sandbox, not mocks.
- **Philosophy** — risk-based: test what could lose money or break auth. Integration > unit. Spike and stabilize; add tests on bugs and complex logic.
- **⚠️ Category migration** — before deploying Plaid PFC changes: `rm backend/data/categories_*.json`
- **Production ops** (SSH, PM2, post-deploy validation) — see [AI-DEPLOYMENTS.md](docs/AI-DEPLOYMENTS.md)

## Commits & Releases

Conventional Commits required (`feat` → MINOR, `fix` → PATCH, `feat!` / `BREAKING CHANGE:` → MAJOR). See [CONTRIBUTING.md](CONTRIBUTING.md).

### Pushing to main — non-obvious

Every push to `main` triggers `standard-version`, which may create a `chore(release)` commit and push back. Remote often has commits you don't have.

**Before every push:** `git pull --rebase origin main`

If rebase conflicts on `CHANGELOG.md` / `package.json` / `package-lock.json` (machine-generated), accept incoming:
```bash
git checkout --theirs CHANGELOG.md package.json package-lock.json
git add CHANGELOG.md package.json package-lock.json
git rebase --continue
```

## Architecture Decisions (recent)

Entries link the BRD for full context. Older decisions live in git history.

| Date | Decision | BRD |
|------|----------|-----|
| 2026-09-13 | AI capability platform — LLM is a **planner, never an executor**. Capability tiers (T0 read / T1 confirmed write / T2 unattended / T3 forbidden) declared in the registry and enforced at execution time by branded `ExecutionGrant`s, not by handlers. Plan cards carry 1..N individually de-selectable rows under one nonce; every param that will be written must appear on the card. Split spend caps ($20 interactive / $5 background) now priced to include cached and failed-request tokens. Business Workspace excluded from AI entirely, enforced at the route. External links clickable with mandatory host disclosure (SEC-P024 amended). Sonnet/Opus moved to the 5 series | [AI-CAPABILITY-PLATFORM-BRD.md](docs/features/AI-CAPABILITY-PLATFORM-BRD.md) |
| 2026-09-13 | AI read coverage + confirmed writes — assistant can now read tasks, trips and projects (it could previously see only money) and write task updates/completions and transaction category/name. Every model-supplied identifier is resolved against live data in its own pass before any row executes (SEC-P030), so a batch with one bad id writes nothing. Every AI write lands in a durable activity log with a one-click undo that SKIPS records a human edited in the meantime. Trip/project spending is tag-derived and non-additive — totals must never be summed across entities | [AI-CAPABILITY-PLATFORM-BRD.md](docs/features/AI-CAPABILITY-PLATFORM-BRD.md) |
| 2026-09-13 | Agent learnings — the agent may record its own **capability gaps** to a maintainer-facing store, never diagnose its own quality failures (schema-enforced) and never read the store back (a readable store would give prompt injection durable storage). Rejected fingerprints are suppressed permanently; the trace behind a learning is pinned so evidence outlives the 30-day trace window | [AI-AGENT-LEARNINGS-BRD.md](docs/features/AI-AGENT-LEARNINGS-BRD.md) |
| 2026-06-05 | Business Workspace — second isolated workspace (= second `familyId`) reached by in-app switcher; trust-ledger category seed (NOT family INCOME/EXPENSES/SAVINGS); Amazon royalties are held-in-trust pass-through, never OoT income/expense; tag-driven monthly client statement (5% per-row commission, billable-charge tags, persisted/numbered) → PDF+CSV; payment automation explicitly excluded (fiduciary risk; Stripe is wrong tool); manual txns / sweep redesign / tax export deferred to Phase 2 | [BUSINESS-WORKSPACE-BRD.md](docs/features/BUSINESS-WORKSPACE-BRD.md) |
| 2026-05-27 | Wishlist v1 — standalone shared list (PENDING/AGREED/REJECTED); spending categories only; per-family JSON (`wishlist_{familyId}`); no budget/BvA/transaction integration; hard delete; sort: status-group → month asc → createdAt asc | [WISHLIST-BRD.md](docs/features/WISHLIST-BRD.md) |
| 2026-05-04 | Auto-cat rule suggestions — deterministic merchant clustering on the user's own categorized transactions; 3 / 80% / 180-day bar; per-user localStorage dismissals (NOT a shared flag); BRD-listed match fields corrected to `userDescription` / `merchantName` / `name` per dce0615 | [AUTO-CAT-SUGGESTIONS-BRD.md](docs/features/AUTO-CAT-SUGGESTIONS-BRD.md) |
| 2026-04-25 | Net terminology — **Pre-Savings Net** (`Income − Spending`) and **Net Cashflow** (`Income − Spending − Savings`) are the two canonical labels. "Net Income" is retired from new work; surfaces showing a net must label it with one of these two and show the formula in a tooltip | [SAVINGS-CATEGORY-BRD.md](docs/features/SAVINGS-CATEGORY-BRD.md) §2.6 REQ-017/018 |
| 2026-04-25 | Spending/income/savings aggregations bucketed by category type with signed accumulation; refunds net within bucket; uncategorized excluded. Aligns `calculateSpending`/`calculateIncome`/`calculateSavings` with `calculateActualTotals` so Dashboard and Reports KPIs agree | [SAVINGS-CATEGORY-BRD.md](docs/features/SAVINGS-CATEGORY-BRD.md) §2.2 REQ-005a |
| 2026-04 | Rollover Budgets — derive-on-fly carry math on existing `isRollover` flag; calendar-year reset; symmetric signed carry; subtree exclusivity; BvA II is sole v1 consumer | [ROLLOVER-BUDGETS-BRD.md](docs/features/ROLLOVER-BUDGETS-BRD.md) |
| 2026-04 | Budget vs. Actuals II — additive tab; accordion-first; Income→Spending→Savings sections; dismiss is per-user localStorage (NOT `isHidden`) | [BUDGET-VS-ACTUALS-II-BRD.md](docs/features/BUDGET-VS-ACTUALS-II-BRD.md) |
| 2026-04 | Task Management v2.0 — Checklist view, Snooze (visibility modifier, not status), manual `sortOrder`, Cancelled column retired, family-only leaderboard | [TASK-MANAGEMENT-BRD.md](docs/features/TASK-MANAGEMENT-BRD.md) |
| 2026-04 | Mobile Kanban — below 48em: 4 tabs (Todo/Started/Done/Snoozed, always-on), card swipe actions with 40% auto-commit (right=forward, left=snooze/undo), swipe-snooze=Tomorrow, long-press=within-column reorder only, kebab→Edit-modal direct. Desktop unchanged | [TASK-MANAGEMENT-BRD.md](docs/features/TASK-MANAGEMENT-BRD.md) |
| 2026-04 | Task Leaderboard v2.0 — 48 badges, tier-driven polish, stateless computation, per-badge `shippedAt` + `celebrationCopy`, score-based slot selection | [TASK-LEADERBOARD-BRD.md](docs/features/TASK-LEADERBOARD-BRD.md) |
| 2026-04 | Trip Itineraries — day-by-day agenda; `Stop` entity (Stay/Eat/Play/Transit) with night-based Stay dates; no-overlap enforced | [TRIP-ITINERARIES-BRD.md](docs/features/TRIP-ITINERARIES-BRD.md) |
| 2026-04 | Trip Place Photos — Google Places thumbnails on `VerifiedLocation`; requires "Places API (New)" in GCP | [TRIP-PLACE-PHOTOS-BRD.md](docs/features/TRIP-PLACE-PHOTOS-BRD.md) |
| 2026-04 | Trip Enhancements V2 — Map tab (`@vis.gl/react-google-maps`); photo album as hyperlink after 2025-03 `photoslibrary` scope removal | [TRIP-ENHANCEMENTS-V2-BRD.md](docs/features/TRIP-ENHANCEMENTS-V2-BRD.md) |
| 2026-04 | Canonical parent rollup — `max(parent, Σ children)` for income AND expense; `BudgetComparison.tsx` switched from additive to max | [CATEGORY-HIERARCHY-BUDGETING-BRD.md](docs/features/CATEGORY-HIERARCHY-BUDGETING-BRD.md) |
| 2026-04 | Chat action cards — registry-based allowlist extends chatbot from read-only to narrow write via user-confirmed nonce cards | [AI-CHAT-ACTIONS-BRD.md](docs/features/AI-CHAT-ACTIONS-BRD.md) |
| 2026-04 | `isSavings` top-level flag — separates savings contributions from spending; 3-line Cash Flow | [SAVINGS-CATEGORY-BRD.md](docs/features/SAVINGS-CATEGORY-BRD.md) |
| 2026-04 | Centralized `transactionReader.ts` — eliminate duplicated `status !== 'removed'` filter across services | — |
| 2026-04 | Amazon receipt matching — Claude vision; Zod-validated; session dedup excludes `CUSTOM_AMAZON` | [AI-AMAZON-RECEIPT-BRD.md](docs/features/AI-AMAZON-RECEIPT-BRD.md) |
| 2026-04 | AI chatbot security boundary — `ChatbotDataService` receives `ReadOnlyDataService` only (SEC-018); `tool_use` for injection defense; $20/mo cap with mutex | [AI-CHATBOT-BRD.md](docs/features/AI-CHATBOT-BRD.md) |
| 2026-04 | AI bulk categorization — few-shot on user's own data; bucket approve/edit/skip | [AI-CATEGORIZATION-BRD.md](docs/features/AI-CATEGORIZATION-BRD.md) |
| 2026-04 | URL-based page state — chatbot context + bookmarkable URLs via `useSearchParams` | — |
| 2026-01 | Plaid Link update mode for re-auth | — |
| 2025-09 | Rename `isSavings` → `isRollover` — frees "savings" for the later savings feature | — |

## 🔄 Pending

- **Subdomain migration** — `budget.jaredcarrano.com` → `family.jaredcarrano.com`. Details in `PROJECT_PLAN.md` Phase 14.5.

## 🚨 Known Issues

Active debt in [docs/AI-TECHNICAL-DEBT.md](docs/AI-TECHNICAL-DEBT.md). Execution sequencing in [docs/TECH-DEBT-EXECUTION-PLAN-2026-04.md](docs/TECH-DEBT-EXECUTION-PLAN-2026-04.md). Resolved items in [docs/completed/AI-TECHNICAL-DEBT.md](docs/completed/AI-TECHNICAL-DEBT.md).
