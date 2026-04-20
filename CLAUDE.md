# Family Tracker — Development Guide

Family-scale app for 2 users: personal budgeting (with Plaid), shared tasks, trips, and projects. Formerly branded "Household Budgeting App" / "Budget Tracker"; the chatbot was renamed from "Budget Bot" to "Helper Bot" in the same rebrand. Risk-based testing, TypeScript strict mode.

## 📚 Documentation Index

| Document | Purpose |
|----------|---------|
| [AI-APPLICATION-ARCHITECTURE.md](docs/AI-APPLICATION-ARCHITECTURE.md) | Service patterns, API structure, data flow |
| [AI-DEPLOYMENTS.md](docs/AI-DEPLOYMENTS.md) | CI/CD, AWS infra, production ops |
| [AI-TESTING-STRATEGY.md](docs/AI-TESTING-STRATEGY.md) | Test philosophy, examples, troubleshooting |
| [AI-USER-STORIES.md](docs/AI-USER-STORIES.md) | Product requirements, acceptance criteria |
| [AWS-LOCAL-SETUP.md](docs/AWS-LOCAL-SETUP.md) | Local dev with synced production data |
| [completed/AI-TECHNICAL-DEBT.md](docs/completed/AI-TECHNICAL-DEBT.md) | Known issues, workarounds |
| [completed/AI-Architecture-Plan.md](docs/completed/AI-Architecture-Plan.md) | Historical cost analysis & ADRs |

### Feature BRDs & Plans
| Feature | BRD | Plan |
|---------|-----|------|
| AI Chatbot | [AI-CHATBOT-BRD.md](docs/features/AI-CHATBOT-BRD.md) | [AI-CHATBOT-PLAN.yaml](docs/features/AI-CHATBOT-PLAN.yaml) |
| AI Categorization | [AI-CATEGORIZATION-BRD.md](docs/features/AI-CATEGORIZATION-BRD.md) | [AI-CATEGORIZATION-PLAN.yaml](docs/features/AI-CATEGORIZATION-PLAN.yaml) |
| AI Amazon Receipts | [AI-AMAZON-RECEIPT-BRD.md](docs/features/AI-AMAZON-RECEIPT-BRD.md) | [AI-AMAZON-RECEIPT-PLAN.yaml](docs/features/AI-AMAZON-RECEIPT-PLAN.yaml) |
| AI Chat Actions | [AI-CHAT-ACTIONS-BRD.md](docs/features/AI-CHAT-ACTIONS-BRD.md) | [AI-CHAT-ACTIONS-PLAN.yaml](docs/features/AI-CHAT-ACTIONS-PLAN.yaml) |
| Category Hierarchy | [CATEGORY-HIERARCHY-BUDGETING-BRD.md](docs/features/CATEGORY-HIERARCHY-BUDGETING-BRD.md) | [CATEGORY-HIERARCHY-BUDGETING-PLAN.yaml](docs/features/CATEGORY-HIERARCHY-BUDGETING-PLAN.yaml) |
| Trip Itineraries | [TRIP-ITINERARIES-BRD.md](docs/features/TRIP-ITINERARIES-BRD.md) | [TRIP-ITINERARIES-PLAN.yaml](docs/features/TRIP-ITINERARIES-PLAN.yaml) |
| Trip Enhancements V2 (Map + Photos) | [TRIP-ENHANCEMENTS-V2-BRD.md](docs/features/TRIP-ENHANCEMENTS-V2-BRD.md) | [TRIP-ENHANCEMENTS-V2-PLAN.yaml](docs/features/TRIP-ENHANCEMENTS-V2-PLAN.yaml) |
| Trip Place Photos | [TRIP-PLACE-PHOTOS-BRD.md](docs/features/TRIP-PLACE-PHOTOS-BRD.md) | [TRIP-PLACE-PHOTOS-PLAN.yaml](docs/features/TRIP-PLACE-PHOTOS-PLAN.yaml) |
| Projects | [PROJECTS-BRD.md](docs/features/PROJECTS-BRD.md) | [PROJECTS-ENHANCEMENTS-PLAN.yaml](docs/features/PROJECTS-ENHANCEMENTS-PLAN.yaml) |
| Task Management v2.0 | [TASK-MANAGEMENT-BRD.md](docs/features/TASK-MANAGEMENT-BRD.md) | [TASK-MANAGEMENT-ENHANCEMENTS-PLAN.yaml](docs/features/TASK-MANAGEMENT-ENHANCEMENTS-PLAN.yaml) |
| Task Leaderboard (streaks + badges) | [TASK-LEADERBOARD-BRD.md](docs/features/TASK-LEADERBOARD-BRD.md) | — |

## 🤖 Critical Rules — Never Violate

1. **Never use `any` types** — use `unknown` with type guards, generics, or proper types
2. **Never commit secrets** — all sensitive data goes through environment variables
3. **Never skip security validation** — validate inputs (Zod), sanitize outputs
4. **Never modify production directly** — all changes go through GitHub → CI/CD
5. **Never ignore TypeScript errors** — fix them properly, don't suppress

## 🔧 Critical Files

**Core:**
- `backend/src/services/authService.ts` — JWT auth
- `backend/src/services/accountService.ts` — account management
- `frontend/src/App.tsx` — frontend entry
- `frontend/src/lib/api.ts` — API client

**Financial calculations (always use shared utils, never duplicate):**
- `shared/utils/transactionCalculations.ts` — transfer exclusion
- `shared/utils/budgetCalculations.ts` — budget rollup (`buildCategoryTreeAggregation`, `classifyTreeBudgetState`, `isTreeUnused`, `isTreeOverBudget`)
- `backend/src/services/transactionReader.ts` — canonical removed-transaction filter; all read paths must use this

**AI:**
- `backend/src/services/chatbotService.ts` + `chatbotDataService.ts` (read-only security boundary) + `chatbotPrompt.ts`
- `backend/src/services/chatActions/registry.ts` + `proposalStore.ts` — chat action cards
- `backend/src/services/categorizationService.ts` — bulk AI categorization
- `backend/src/services/amazonReceiptService.ts` + `amazonReceiptPrompt.ts`
- `frontend/src/components/chat/ChatOverlay.tsx` + `ActionCard.tsx`

**Trips:**
- `frontend/src/pages/TripDetail.tsx` — `/trips/:tripId` (Itinerary / Spending / Notes)
- `frontend/src/components/trips/agenda/Agenda.tsx`, `AddStopSheet.tsx`
- `frontend/src/components/trips/map/TripMap.tsx` — Map tab (pins, transit lines, day filter, popup deep-link)
- `backend/src/services/tripService.ts` — nested stop CRUD + `StayOverlapError`
- `shared/utils/tripHelpers.ts` — `validateNoStayOverlap`, `computeAgendaDayRange`, `groupStopsByDay`, `findActiveStay`, `isTransitBaseChange`, `hasVerifiedCoords`

## File Layout
```
backend/src/{routes,services,middleware,types,__tests__}/
frontend/src/{pages,components,lib,hooks}/
shared/{types,utils}/
docs/{features,AI-*.md,information-security}/
terraform/   scripts/
```

## Common Debugging
| Issue | Fix |
|-------|-----|
| Plaid: `invalid product names: [accounts]` | Remove `accounts` from `PLAID_PRODUCTS` — it's included automatically with `transactions` |
| Plaid Link phone validation | Enter with country code: `+15551234567` (no spaces/dashes) |
| Account shows `requires_reauth` | User re-auths via "Sign in to Bank" in account menu (Plaid Link update mode) |
| Sync returns success but account not updated | Check for `warning` field in response — account may need re-auth |
| Budget calculation inconsistencies | Use `shared/utils/budgetCalculations.ts`, never duplicate |
| Transfer double-counting | Use `shared/utils/transactionCalculations.ts` — it excludes transfers |
| TypeScript `any` errors | Use `unknown` + type guards; see [AI-APPLICATION-ARCHITECTURE.md](docs/AI-APPLICATION-ARCHITECTURE.md) |

## Development Philosophy
- **Risk-based testing** — test what could break the business or lose money (auth, financial calc, data integrity). Integration > unit tests; use real Plaid sandbox, not mocks. Add tests when you find bugs or complex logic. Skip trivial tests.
- **Spike and stabilize** — build fast, add tests for bugs/complexity.
- **Shared utilities** — `shared/utils/*` is the single source of truth for calculations. Duplicating logic is an anti-pattern.

## Security
Handles sensitive financial data — security is top priority.
- **At rest**: AES-256 encryption. **In transit**: TLS 1.3+.
- **Auth**: JWT with expiration, rate limiting, account lockout.
- **Input**: Zod schemas, parameterized queries, XSS prevention.
- **Compliance**: PCI DSS, GDPR/CCPA. 24-hour breach notification.
- Detailed policy: `docs/information-security/` (info_security_policy, incident_response_plan, risk_assessment_template, security_review_log).

## Development Environment

### Servers often already running
```bash
npm run dev:check     # check status
npm run dev:restart   # stop + start
```
Frontend: `http://localhost:5183` · Backend: `http://localhost:3021`

### Required env vars (backend/.env)
```bash
NODE_ENV=development
PORT=3001

# Plaid — IMPORTANT: don't include "accounts" in PLAID_PRODUCTS, it's automatic
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US

# Security (ENCRYPTION_KEY must be 32-byte hex)
JWT_SECRET=...
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=...

# Storage (filesystem for dev, s3 for prod)
DATA_DIR=./data
STORAGE_TYPE=filesystem
# S3_BUCKET_NAME / S3_PREFIX / AWS_REGION required if STORAGE_TYPE=s3

# AI
ANTHROPIC_API_KEY=...
# GITHUB_ISSUES_PAT=... (optional — for chatbot issue filing)
# CHATBOT_MONTHLY_LIMIT=20 (optional — $ cap)
```

### Production data locally
Must run from `backend/` with `budget-app-prod` AWS profile:
```bash
cd backend && AWS_PROFILE=budget-app-prod npm run sync:production:dry-run
cd backend && AWS_PROFILE=budget-app-prod npm run sync:production
npm run backup:local     # back up first
npm run backup:restore   # revert
```

## Commits & Releases

Conventional Commits required. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full spec. Types that affect versioning: `feat` → MINOR, `fix` → PATCH, `feat!` or `BREAKING CHANGE:` footer → MAJOR.

### Pushing to main — non-obvious
Every push to `main` triggers `standard-version`, which may create a `chore(release)` commit and push it back. The remote often has commits you don't have locally.

**Before every push**:
```bash
git pull --rebase origin main
```
If rebase conflicts on `CHANGELOG.md` / `package.json` / `package-lock.json`, accept incoming (they're machine-generated):
```bash
git checkout --theirs CHANGELOG.md package.json package-lock.json
git add CHANGELOG.md package.json package-lock.json
git rebase --continue
```

### Release flow
1. Daily dev on `main` with conventional commits.
2. Push → CHANGELOG auto-updates.
3. `npm run release:prepare` when ready to cut a new version.
4. GitHub Actions includes version in deployments.
5. Check `/version` or `/health` endpoints for deployed version.

## Common Tasks
- **Add API endpoint** → route in `backend/src/routes/`, service method in `backend/src/services/`, client method in `frontend/src/lib/api.ts` (see [AI-APPLICATION-ARCHITECTURE.md](docs/AI-APPLICATION-ARCHITECTURE.md#to-add-a-new-api-endpoint))
- **Add React page** → component in `frontend/src/pages/`, route in `frontend/src/App.tsx` (see [AI-APPLICATION-ARCHITECTURE.md](docs/AI-APPLICATION-ARCHITECTURE.md#to-add-a-new-page))
- **Run tests** → `npm test` (in backend or frontend); `npm test -- path/to/file.spec.ts` for single file; integration tests in `backend/src/__tests__/integration/`
- **Password reset lockout recovery** → request reset via UI; tokens are in-memory, 15-min expiry
- **⚠️ Category migration** → before deploying Plaid PFC changes, delete existing category data: `rm backend/data/categories_*.json`
- **Deploy** → GitHub Actions "Release and Deploy to Production" (full), "Deploy to Production" (no release), or `./scripts/deploy-server.sh` (manual); see [AI-DEPLOYMENTS.md](docs/AI-DEPLOYMENTS.md)

## Production Access

SSH:
```bash
ssh -i ~/.ssh/budget-app-key ubuntu@budget.jaredcarrano.com
sudo -u appuser bash
# App: /home/appuser/app — backend/ frontend/ ecosystem.config.js
# PM2: pm2 status, pm2 logs budget-backend, pm2 restart budget-backend, pm2 flush
```

Post-deploy validation (run as `appuser`):
```bash
cd /home/appuser/app && \
test -d backend/dist && test -f backend/dist/index.js && test -f backend/.env && \
test -f ecosystem.config.js && pm2 status | grep -q budget-backend && \
curl -s http://localhost:3021/health | grep -q "ok" && echo "OK" || echo "FAIL"
```

Debugging:
```bash
pm2 logs budget-backend --lines 50
pm2 env budget-backend | grep -E "(JWT|PLAID|NODE_ENV)"
curl -s http://localhost:3021/health | jq '.'
df -h /home/appuser
```

## 📝 Architecture Decisions

| Date | Decision | Why |
|------|----------|-----|
| 2026-04 | Task Management v2.0 — Checklist view, Snooze, manual reorder, Cancelled column retired, family-only leaderboard | Five concurrent enhancements. Snooze is `snoozedUntil: string \| null` (a visibility modifier, NOT a status). Manual reorder via `sortOrder` fractional float, family-wide, per-status. Leaderboard family-scope only (behavior change from v1.0). See [TASK-MANAGEMENT-BRD.md](docs/features/TASK-MANAGEMENT-BRD.md). |
| 2026-04 | Task Leaderboard gamification — streaks + 13-badge achievement system | Dedicated BRD extending `TASK-MANAGEMENT-BRD.md` §5. Current/best streak columns use today-is-grace semantics (streak survives a quiet morning; only breaks at local midnight). Flat 13-badge catalog across Volume/Consistency/Streak/Lifetime, earned-for-life, computed stateless from `completedAt` on every request (no new persistence, retroactive on first post-deploy load). Unearned badges render as `????` ghosts with no tooltip — category visible, threshold hidden for surprise. Celebration uses a fanfare sound distinct from the task-done chime + confetti; client `lastSeenBadgeEarnedAt` in `localStorage` is seeded to `now` on first post-deploy load to suppress historical-badge cascade. Row shows up to 3 highest-per-category badges (Consistency drops first on overflow). See [TASK-LEADERBOARD-BRD.md](docs/features/TASK-LEADERBOARD-BRD.md). |
| 2026-04 | Trip Itineraries — day-by-day agenda | Reverses original "not a travel planner" exclusion. `Stop` entity (Stay/Eat/Play/Transit) embedded in Trip. Stay dates are **night-based** (endDate = last night). System enforces no-overlap. Agenda derived, not stored. See [TRIP-ITINERARIES-BRD.md](docs/features/TRIP-ITINERARIES-BRD.md). |
| 2026-04 | Trip Place Photos — Google Places thumbnails on verified stops | `photoName` + `photoAttribution` captured on `VerifiedLocation` via `Place.fetchFields`; `LocationInput` migrated off the post-2025-03-01-deprecated `PlacesService.getDetails` + `AutocompleteService` to `Place.fetchFields` + `AutocompleteSuggestion.fetchAutocompleteSuggestions` (session token auto-links to fetchFields, one Places billing session per stop). Render: 48px Stay banner thumbnail, 32px Eat/Play card avatar, 200×100 Map popup header — all click to open a **hero modal** at `maxWidthPx=1600` with always-visible attribution caption (D10). **Candidate picker** strip (D11) in Stay + Eat/Play forms lets users swap Google's default index-0 photo to any of the ~10 candidates `fetchFields` returns — candidates are form-local, never persisted. **Requires "Places API (New)" enabled in GCP** (A-08) separately from legacy Places API the rest of V1 uses. Zod `verifiedLocationSchema` extended with two optional string fields. Backend untouched otherwise. No backfill — re-select address to capture. Attribution satisfied by hover tooltip + in-modal caption (D6). Transit stops never render photos. See [TRIP-PLACE-PHOTOS-BRD.md](docs/features/TRIP-PLACE-PHOTOS-BRD.md). |
| 2026-04 | Trip Enhancements V2 — Map tab + photo album link | Additive Map tab renders Stays + verified Eat/Play as pins and base-change transits as lines (flights = geodesic arcs). Provider = Google Maps JS via `@vis.gl/react-google-maps`, reusing V1 Places API key (lazy-loaded on tab mount). Photo integration collapsed to a `photoAlbumUrl` hyperlink after Google removed the `photoslibrary.*` scopes in March 2025; Picker API returns no EXIF/geo metadata. Map tab hidden when trip has zero geocoded stops. Pin popup deep-links to Itinerary via `?stop=<id>`. See [TRIP-ENHANCEMENTS-V2-BRD.md](docs/features/TRIP-ENHANCEMENTS-V2-BRD.md). |
| 2026-04 | Canonical parent rollup utilities + Reports widget refactor | Effective parent budget = `max(parent, sum(children))` for income AND expense; effective actual = additive. New Spending Composition widget for leaf-level intent. Behavior change: `BudgetComparison.tsx` switched from additive to max. See [CATEGORY-HIERARCHY-BUDGETING-BRD.md](docs/features/CATEGORY-HIERARCHY-BUDGETING-BRD.md). |
| 2026-04 | Chat action cards with registry-based allowlist | Extends chatbot from read-only to narrow write via user-confirmed cards. V1 actions: `create_task`, `submit_github_issue` (the latter migrated from bespoke intercept per AI-CHAT-ACTIONS-BRD D-15). Nonce-based single-use, server-side Zod re-validation, audit log with `source=chatbot_action_card`. See [AI-CHAT-ACTIONS-BRD.md](docs/features/AI-CHAT-ACTIONS-BRD.md). |
| 2026-04 | `isSavings` flag on top-level categories | Separate savings contributions (401k, IRA, brokerage) from consumption spending. All spending/net surfaces exclude savings by default. Cash Flow shows 3-line layout Income / Spending / Savings. See [SAVINGS-CATEGORY-BRD.md](docs/features/SAVINGS-CATEGORY-BRD.md). |
| 2026-04 | Centralized transaction reader utility | Eliminate duplicated `status !== 'removed'` filter across 4 services. New `transactionReader.ts` — all read paths use `excludeRemoved()` / `getActiveTransactions()`; mutation paths intentionally bypass. |
| 2026-04 | Amazon receipt matching via Claude vision | Upload PDFs/photos, extract items, match to bank transactions, split/categorize. Zod-validated Claude output; session dedup against completed sessions only; `CUSTOM_AMAZON` transactions always re-eligible. |
| 2026-04 | AI chatbot structural security boundary | `ChatbotDataService` receives `ReadOnlyDataService` only (SEC-018). `tool_use` for prompt-injection defense. $20/mo cap with mutex. Write actions flow through chat-action-card registry — never LLM-executed. See [AI-CHATBOT-BRD.md](docs/features/AI-CHATBOT-BRD.md). |
| 2026-04 | AI bulk categorization with few-shot learning | Batch classify uncategorized transactions using the user's own data. Bucket-based approve/edit/skip with auto-rule suggestions. |
| 2026-04 | URL-based page state | Chatbot context awareness + bookmarkable URLs. Budget, Reports, Transactions sync filter state via `useSearchParams`. |
| 2026-01 | Plaid Link update mode for re-auth | Allow re-auth of expired bank connections. Visual indicators on accounts page + dashboard. |
| 2025-09 | Shared transaction calculation utilities | Consistent transfer exclusion across app (`shared/utils/transactionCalculations.ts`). |
| 2025-09 | Rename `isSavings` → `isRollover` | Free up "savings" terminology for actual savings feature. |
| 2025-01 | SNAKE_CASE category IDs with Plaid PFC | Direct mapping eliminates complexity. **BREAKING**: must delete existing category data before deployment. |
| 2024-12 | User-specific categories | Multi-user support requirement — all categories have `userId`. |
| 2024-11 | Transaction pagination (50/page) | Performance with 800+ items. |
| 2024-10 | Service singletons (`getInstance()`) | Prevent auth token inconsistencies. |
| 2024-09 | S3 for production storage | Filesystem unreliable on EC2; `StorageService` abstracts backend. |
| 2024-09 | Mantine UI over Tailwind | Faster dev with pre-built dashboard components. |

## 🔄 Pending Architectural Changes

| Change | Notes |
|--------|-------|
| Transfer Linking | Pair two transfer transactions via shared `transferGroupId`; not yet started. See [TRANSFER-LINKING-BRD.md](docs/features/TRANSFER-LINKING-BRD.md). |
| Subdomain migration | `budget.jaredcarrano.com` → `family.jaredcarrano.com`. Code + DNS/TLS. See PROJECT_PLAN.md Phase 14.5. |
| Transaction caching | React Query or similar. Reduce API calls. |
| Webhook support | Plaid webhooks for real-time sync. |
| Data export | CSV/JSON export for portability. |
| Mobile app | React Native, future. |

## 🚨 Known Issues

No open issues currently tracked here. See [AI-TECHNICAL-DEBT.md](docs/completed/AI-TECHNICAL-DEBT.md) for the full debt tracker.

Full technical debt: [AI-TECHNICAL-DEBT.md](docs/completed/AI-TECHNICAL-DEBT.md).
