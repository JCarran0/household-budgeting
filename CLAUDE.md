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

## 🤖 Critical Rules — Never Violate

1. **No `any` types** — use `unknown` with type guards, generics, or proper types
2. **No committed secrets** — sensitive data via env vars
3. **No skipped validation** — validate inputs with Zod, sanitize outputs
4. **No direct production edits** — all changes go through GitHub → CI/CD
5. **No suppressed TypeScript errors** — fix, don't suppress

## 🔧 Security-Sensitive & Shared-Utils Files

**Security boundaries — do not erode:**
- `backend/src/services/chatbotDataService.ts` — chatbot receives `ReadOnlyDataService` only (SEC-018). Writes flow through chat-action-card registry, never LLM-executed.
- `backend/src/services/chatActions/registry.ts` + `proposalStore.ts` — nonce-based, Zod-revalidated, audit-logged write path for chat actions
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
