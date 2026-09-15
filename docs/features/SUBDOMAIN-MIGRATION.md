# Subdomain Migration — `budget.jaredcarrano.com` → `family.jaredcarrano.com`

**Status:** Not started. Extracted from `PROJECT_PLAN.md` Phase 14.5 on 2026-09-15 and
re-verified against the code at that time; the checklist below corrects several items that
had gone stale since it was written in April.

The rename follows the Family Tracker rebrand (14.1–14.4, shipped `f8f1e4f` / PR #4,
2026-04-17). Keep the old subdomain alive as a 301 redirect to the new one — both users have
it bookmarked, and it is the registered origin for several external integrations.

## Code / infra tasks

- [ ] **Backend CORS** — `backend/src/app.ts:74-75` lists only `https://budget.jaredcarrano.com`
      and `http://budget.jaredcarrano.com`. Add the `family.*` equivalents. Deploy this *first*,
      before DNS, so the new host works the moment it resolves.
      While here: the plaintext `http://` origin is allowed with `credentials: true` — flagged in
      `docs/SECURITY-AUDIT-2026-08-02.md` as an unnecessary credentialed non-TLS origin. Good
      moment to drop it rather than duplicate it onto the new host.
- [ ] **nginx** — add `family.*` to `server_name` on the app block. After cutover, add a separate
      server block that 301-redirects `budget.*` → `family.*`.
- [ ] **Frontend hardcoded reference** — `frontend/src/components/auth/ResetRequestForm.tsx:59`
      embeds the SSH hostname in recovery instructions.
- [ ] **Deploy workflows** — `release-and-deploy.yml` (lines 235, 509, 511, 539) and
      `rollback.yml` (lines 17, 89). Environment URL and post-deploy health/version curls.
- [ ] **Docs** — `README.md` (lines 10, 12, 73, 248, 336, 339), `docs/AI-DEPLOYMENTS.md`
      (583, 621), `CLAUDE.md` pending-work entry.

### Corrections to the original 14.5 list

- **`deploy-production.yml` does not exist.** The workflows are `pr-validation.yml`,
  `release-and-deploy.yml`, `rollback.yml`, `sync-secrets-to-ssm.yml`. Only the latter two of
  those four carry the hostname.
- **Chatbot prompts contain no hardcoded host.** `chatbotPrompt.ts` and the other chatbot
  services are clean; nothing to change.
- **The PWA manifest needs no change.** `frontend/vite.config.ts:19` uses a relative
  `start_url: '/'`, which follows whatever origin serves it.

## External / manual tasks (Jared)

- [ ] **DNS** — add `family.jaredcarrano.com` A record → the same EC2 Elastic IP.
- [ ] **TLS** — reissue the Let's Encrypt cert covering both hostnames (`certbot --expand`).
      Must happen *after* DNS resolves, or the HTTP-01 challenge fails.
- [ ] **Google Places API key referrer allowlist** — *not in the original checklist.* The key is
      referrer-restricted to `budget.jaredcarrano.com` + `localhost:5183`
      (`docs/features/TRIP-PLACE-PHOTOS-PLAN.yaml`, confirmed 2026-04-20). Trip maps and place
      photos break silently on the new origin until this is updated. Places API (New) matches
      referrers strictly: use the canonical `https://*.jaredcarrano.com` form, **no `/*` suffix**.
- [ ] **Plaid dashboard** — update registered redirect URIs if Plaid OAuth is in use.
- [ ] **UptimeRobot** — update the monitor hostname, or add a second monitor and retire the old
      one after the redirect is verified.

## Cutover sequence

Order matters — each step depends on the one before it.

1. Deploy code accepting **both** hosts (CORS, nginx `server_name`).
2. Add the DNS A record; wait for it to resolve.
3. `certbot --expand` to cover both hostnames.
4. Update the Google Places referrer allowlist, Plaid redirect URIs, UptimeRobot.
5. Verify `family.*` end to end — login, a Plaid sync, a trip map with place photos.
6. Update bookmarks; flip the 301 redirect on `budget.*`.

## Worth verifying before step 6

Web push subscriptions are bound to an origin. Once both users load the app on `family.*`, the
service worker registers fresh there and issues a new subscription; the subscriptions stored
against the old origin go stale. This has not been tested — expect to re-enable notifications in
settings on the new host, and check whether `pushNotificationService` accumulates dead endpoints
that need pruning.
