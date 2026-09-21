# AI Agent Cost & Budget Guide

> **Document Purpose**: What this app costs to run, what the target is and why, what to monitor, and which AWS resources in this account are *not* this app. For deployment mechanics see [AI-DEPLOYMENTS.md](./AI-DEPLOYMENTS.md).

## Document Scope
- **What This Document Contains**: The cost target and its rationale, the current all-in cost breakdown, monitoring commands, the decision log, and the non-app resources sharing this AWS account
- **What This Document Doesn't Cover**: Deployment procedures (see [AI-DEPLOYMENTS.md](./AI-DEPLOYMENTS.md)), architecture decisions (see [CLAUDE.md](../CLAUDE.md))
- **Primary Audience**: AI agents or humans evaluating whether a cost is justified, or investigating a budget alert

---

## 1. The Target: subscription parity

**The budget is not an arbitrary dollar figure. It is "what we would otherwise pay a commercial budgeting app."**

| Alternative | Annual billing | Monthly billing |
|---|---|---|
| YNAB | $109/yr = $9.08/mo | $14.99/mo |
| Monarch Money | $99/yr = $8.25/mo | $14.99/mo |
| Copilot Money | ~$95/yr = $7.92/mo | ~$13/mo |

This app also replaces a shared task manager (Todoist Pro for two ≈ $8/mo) and has no commercial equivalent for trips, projects, or the wishlist. A like-for-like commercial bundle is **$12–16/mo**.

**Target: ≤ $15/mo all-in.** The AWS budget `budget-app-monthly-cost` is set to $15 with an alert at $8 (an early-warning threshold, *not* the ceiling — it will fire mid-month during normal operation).

> **Do not read an $8 alert email as "over budget."** Check the forecast, not the mid-month actual.

---

## 2. Current cost (verified 2026-09-21)

| Component | $/mo | Notes |
|---|---|---|
| EC2 `t4g.micro` | $6.25 | `i-05cd17258cce207a3`, 24/7, on-demand |
| Public IPv4 address | $3.72 | 744 hrs × $0.005 — unavoidable while the box needs a public IP |
| EBS 20 GB gp3 | $1.60 | single attached root volume |
| Plaid | $1.50 | not visible in AWS; per-item billing |
| Anthropic API | ~$0.50 | variable; see §4 |
| S3 (all app data) | ~$0.05 | every transaction, budget, task, trip, wishlist item |
| **All-in** | **~$13.62** | |
| **After the Savings Plan** | **~$11.36** | see §5 |

### The number that matters most

**The app's entire data footprint costs about five cents a month.** The cost is the *server*, not the data or the features. Adding a feature is effectively free — wishlist links and notes (v1.2) added $0.00. This is why "would this feature raise our costs?" is almost always answered **no**, and why re-platforming to save $3/mo is rarely worth the risk.

---

## 3. What is NOT this app

**This AWS account (`903733335979`) hosts at least four unrelated projects.** The budget has no cost filters, so it bills them all together. Do not attribute these to the app:

| Resource | $/mo | What it is |
|---|---|---|
| Route 53 hosted zones | ~$1.50 | `northishbrooklynparent.com` (live Squarespace site), `midhudsonvalleyrentals.com` (live Google Workspace MX), `undaunteddigital.com` (live, CloudFront + Workspace) |
| Amazon Registrar | $15 × 2/yr | domain renewals, lumpy — makes some months look like $29 |

`jaredcarrano.com` — the app's own domain — is **not** in this account's Route 53. Its DNS lives at another provider.

As of 2026-09-21 the `Project` and `Environment` cost allocation tags are **Active**, so from October 2026 onward costs can be filtered by `Project=household-budgeting`. **Tag activation is not retroactive** — September and earlier cannot be split this way.

---

## 4. What to monitor

**Anthropic API spend is the only genuinely variable cost.** Everything else is fixed infrastructure. The app tracks its own spend:

```
s3://budget-app-data-f5b52f89/data/chatbot_costs_{familyId}_{YYYY-MM}.json
```

Each file carries `totalEstimatedCost`, `totalInputTokens`, `totalOutputTokens`, and a `requests[]` array. History:

| Month | Cost | Requests |
|---|---|---|
| 2026-04 | $3.77 | 75 (opus + sonnet) |
| 2026-05 | $2.31 | 31 |
| 2026-06 | $0.16 | 3 |
| 2026-07 | $0.40 | 7 |
| 2026-08 | $0.16 | 4 |
| 2026-09 (MTD) | $0.98 | 17 |

April–May were build-and-test months; steady-state real usage is **under $1/mo**. The $20 interactive / $5 background caps have never bound. A month above ~$3 means either heavy development or something looping — check the trace ledger:

```bash
npx tsx backend/scripts/inspect-traces.ts --prod --family <id> --since 24h
```

Other checks worth running when a bill looks wrong:

```bash
# Month-by-month by service
aws ce get-cost-and-usage --time-period Start=2026-01-01,End=2026-12-31 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE

# Same month broken down by usage type (finds the actual line item)
aws ce get-cost-and-usage --time-period Start=2026-09-01,End=2026-10-01 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=USAGE_TYPE
```

---

## 5. Decisions

| Date | Decision | Rationale |
|---|---|---|
| 2026-09-21 | Budget raised $10 → **$15**, scoped to subscription parity | $10 was never achievable — the app alone is ~$11.60 of AWS. The redundant $5 "Monthly Budget" was deleted; it had been silently breached for months |
| 2026-09-21 | **Rejected** downsizing to `t4g.nano` | Saves ~$3/mo but halves RAM to 512 MB on a production box. Risking an OOM kill to save $36/yr is a bad trade at this budget. CPU is genuinely idle (0.3–0.75% avg, burst credits pinned at max) — RAM is the binding constraint and is unmeasured (no CloudWatch agent) |
| 2026-09-21 | **Rejected** shrinking the 20 GB EBS volume | $0.80/mo for a snapshot + volume swap + filesystem resize on prod |
| 2026-09-21 | Accepted the Public IPv4 charge as structural | $3.72/mo, 27% of the bill. IPv6-only breaks Plaid webhooks; an ALB costs ~$16/mo. No good escape |
| 2026-09-21 | EC2 Instance Savings Plan, 1-year, No Upfront, `$0.0053/hr` | ~$27/yr for zero architecture change. 1-year over 3-year: the extra ~$45 across the term is roughly what would be stranded by moving off `t4g`/`us-east-1`, and the app is committed but the instance shape is not |
| 2026-09-18 | Auto-renew disabled: `brooklynfamilies.com`, `midhudsonvalleyrentals.com` | ~$30/yr. Larger saving than the Savings Plan, at no cost. `undaunteddigital.com` left on |
| 2026-09-18 | Deleted the `madison_faye` stack and `music-db-2` | See §6 |

---

## 6. Cleanup performed 2026-09-18

**`madison_faye`** — a 2019 Squarespace ebook-to-Kindle mailer, discovered because its EventBridge rule `mfr-orders-monitor` had been invoking a **nodejs10.x** Lambda **once per minute since 2019** — 43,200 invocations/month, zero DynamoDB activity, zero errors. Its log group had reached **1.68 GB with no retention policy**. Deleted: the rule, `MFR_Book_Mailer`, the log group, both DynamoDB tables, 16 CloudWatch alarms, 4 auto-scaling registrations. Table contents were scanned to a backup file first; the `.mobi` files still live in the `mf-site-resources` bucket.

> The 16 alarms did **not** auto-delete with their tables, contrary to expectation. Always verify alarm cleanup after deleting a DynamoDB table with auto-scaling.

**`music-db-2`** — an Aurora PostgreSQL cluster from a 2023 music-venue project, `available` with **zero instances** since 2023-10-10, paying for storage and 7-day backups of a database nothing could connect to. Deleted with final snapshot `music-db-2-final-2026-09-18`. Three 2023 `music-venue-dev` manual snapshots were **kept** — they are the last copy of that data.

Combined saving: ~$0.95/mo.

---

## 7. Open items

- [ ] **Purchase the Savings Plan** — offering `06b483ca-7439-4367-883e-e0dea816f366`, commitment `0.0053`. Commits $46.43/yr, returns ~$27/yr
- [ ] **Delete the `brooklynfamilies.com` hosted zone** (`Z14RUUFOKNP1VU`) — NS + SOA only, nothing resolves from it, $0.50/mo
- [ ] **Decide on two live zones** — `northishbrooklynparent.com` serves a live Squarespace site; `midhudsonvalleyrentals.com` has live Google Workspace MX records. Deleting either breaks a running service. Its domain lapses August 2027 now that auto-renew is off
- [ ] **Fix the dangling A record** `www.midhudsonvalleyrentals.com` → `54.160.66.7`, an IP no longer in this account (mild subdomain-takeover exposure)
- [ ] **Find who registers `northishbrooklynparent.com`** — not AWS, so another registrar is billing for it
- [ ] **Correct [AI-DEPLOYMENTS.md](./AI-DEPLOYMENTS.md)** — it describes a `t3.small` instance; the actual instance is a `t4g.micro` (Graviton/arm64)
