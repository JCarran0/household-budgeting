# Family Tracker — Project Plan

**This file is an index, not a plan.** The original 675-line build plan (Phases 1–14, every
checked box from `npm init` through production deployment) was retired on 2026-09-15. It had
not been updated since 2026-04-24 and had drifted badly — it still claimed v1.23.1 / 384
commits at a point when the app had passed v7 and a thousand commits, and described none of the
work shipped since.

Git history and `CHANGELOG.md` are the record of what was built. Per-feature requirements live
in the BRDs indexed in [CLAUDE.md](CLAUDE.md#-documentation-index). What remains here is the
cross-feature "what's next" view, which has no other home.

## What's next

Reconciled against the code on 2026-09-15.

| # | Item | Status |
|---|------|--------|
| 1 | **Subdomain migration** — `family.jaredcarrano.com` | Open — [SUBDOMAIN-MIGRATION.md](docs/features/SUBDOMAIN-MIGRATION.md) |
| 2 | **Bill reminders / recurring transactions** | Not started — no BRD yet |
| 3 | **Mobile Phase 2** — biometric login via Capacitor | Not started — no Capacitor dependency present |

Everything else on the old priority queue has shipped or been cancelled:

- **Task Management v2.0** (checklist, snooze, reorder) — shipped. `ChecklistView.tsx`,
  `SnoozedColumn.tsx`, `boardOrdering.ts`, `taskSnooze.test.ts`.
- **PWA Phase 6** (service worker offline persistence) — shipped. `PWA-MOBILE-PLAN.yaml` records
  all phases complete with manual device QA verified (offline via airplane mode, push + camera
  working in production).
- **Chat Action D-15** (`submit_github_issue` onto the action-card registry) — shipped.
  `backend/src/services/chatActions/submitGithubIssueAction.ts`; `chatbotService.ts:507` notes the
  migration off the bespoke intercept.
- **Transfer Linking** — won't do, 2026-04-20 (value not sufficient; see
  [TRANSFER-LINKING-BRD.md](docs/features/TRANSFER-LINKING-BRD.md)).
- **Optimistic locking** — not needed at 2 users; no conflicts observed in production.
- **Audit stray `?view=budget` / `?view=comparison` links** — effectively done. The only surviving
  references are the two deliberate legacy-normalization comments in `filterStore.ts:80` and
  `usePersistedFilters.ts:183`.

Phase 13's optional infrastructure wishlist (Route 53, CloudWatch detailed monitoring, AWS Backup,
PostgreSQL migration, Redis session caching, t4g.small upgrade) was dropped. None of it was ever
scheduled, and at 2 users and <$10/month none of it is close to earning its cost. It is in git
history if it ever becomes relevant.

## Parked ideas

### Chatbot — `read_brd` tool for design context

Give the chatbot `list_brds` + `read_brd` so it can pull BRD content into context on demand,
rather than statically injecting all BRDs into every turn. The security model is defense-in-depth
and server-enforced, so exposing BRDs doesn't create a bypass — the real risks are context drift
(BRD says X, code does Y → chatbot confidently misleads the user) and token cost.

Open questions before this gets scheduled:

- Scope: only `docs/features/*-BRD.md`, or implementation plans too? Completed/historical docs?
- How do we stop the chatbot asserting "the BRD says X" when the implementation has drifted?
- Caching / rate-limiting — do we need server-side controls on how often the tool fires?
- Any sensitive internals in BRDs we'd prefer not to surface, even read-only?

## Historical anchors

Referenced from code comments and older docs; kept so those pointers still resolve.

- **Budget Tab Retirement** — the `?view=budget` (Budget Setup) and `?view=comparison`
  (Budget vs Actual) tabs were deleted 2026-04-23 on branch `chore/tech-debt-sprint-5`, after a
  two-day soft-hide, once both users confirmed the Budget vs. Actuals tab covered their workflows.
  Five orphaned components, three backend routes, and one integration test file went with them.
  Full detail in git history; superseding feature in
  [BUDGET-VS-ACTUALS-II-BRD.md](docs/features/BUDGET-VS-ACTUALS-II-BRD.md).
- **Phase 7 (multi-user family collaboration)** — shipped. Referenced by `AI-CHATBOT-BRD.md` and
  `TRAVEL-TAGGING-PLAN.yaml`.
- **Phases 8–10 (production architecture, deployment, stabilization)** — shipped. Current
  operational detail lives in [AI-DEPLOYMENTS.md](docs/AI-DEPLOYMENTS.md), which is maintained;
  the historical cost analysis and early ADRs are in
  [docs/completed/AI-Architecture-Plan.md](docs/completed/AI-Architecture-Plan.md).
