# Wrapped — Business Requirements Document

**Status:** Draft (v1.0)
**Author:** Jared Carrano
**Date:** 2026-04-24
**Version:** 1.0
**Depends on:** `docs/features/TASK-MANAGEMENT-BRD.md`, `docs/features/TASK-LEADERBOARD-BRD.md`, `docs/features/TRIP-ITINERARIES-BRD.md`

---

## 1. Overview

### 1.1 Problem Statement

Task completion, leaderboard progress, and badge earns are all visible *if the user goes looking for them*, but there is no recurring moment where the app celebrates a day's effort without being asked. For a two-user family app whose primary engagement driver is validation and playful competition between spouses, the absence of a push-initiated celebration surface leaves the app's best emotional beats accidental — a badge earn gets noticed only if the user happens to open the leaderboard, and a "good day" gets no recognition at all.

### 1.2 Solution Summary

**Wrapped** is a daily and weekly household recap, delivered via push notification at 9 PM local time, styled after Spotify Wrapped: a compact celebratory view summarizing what the family got done, with motivational tone calibrated to activity level and 1–2 highlights chosen by a scored rule engine.

- **Daily Wrapped** fires Monday–Saturday. Viewable 9 PM – midnight. Ephemeral (not archived).
- **Weekly Wrapped** fires Sunday only, in place of a daily. Viewable Sun 9 PM – Mon midnight (27 hours). **Archived forever** — scroll back over past weeks builds a Year-in-Review surface for free over time.
- Framing is **family-level** ("you two closed 14 tasks today"); **highlights credit individuals by name**, preserving the validation beat for the recipient while letting the other spouse share in the moment.
- Content is tasks-forward (the primary emotional beat), with non-task highlights from trips / budgets / projects admitted only when they clear a remarkability threshold.
- Copy is **templated with tier-indexed pools**; Claude-generated copy is a planned v2 layer, not v1.
- Gated by a per-user `wrappedEnabled` feature flag so the primary author can dogfood before exposing the feature to the spouse as the actual launch moment.

### 1.3 Users

All family members. Inherits the Family & Multi-User model (see `TASK-MANAGEMENT-BRD.md` §5.2 scope filter + attribution rule — the same rule-set used by the leaderboard).

### 1.4 Relationship to Existing Features

Wrapped is **additive** and **presentation-only**. No new persistent data is introduced for daily Wrappeds. Weekly Wrappeds are persisted (§8). The feature derives entirely from:

- `Task.completedAt` + `SubTask.completedAt` (Task Management)
- Attribution rule: assignee-else-completer (`TASK-MANAGEMENT-BRD.md` §5.3)
- Streak + badge computations (`TASK-LEADERBOARD-BRD.md` §§3–4)
- `Trip.stops[].createdAt` and active-trip calendar windows (`TRIP-ITINERARIES-BRD.md`)
- Transaction categorization events (for receipt-sweep highlight)
- `Project.items[].completedAt` (for project-progress highlight)

No new Plaid calls. No new auth surface. No new write paths from LLMs.

---

## 2. Cadence & Timing

### 2.1 Daily vs. Weekly

| Day of week | Which Wrapped fires |
|---|---|
| Monday – Saturday | **Daily Wrapped** at 9 PM (local time) |
| Sunday | **Weekly Wrapped** at 9 PM (local time) — supersedes daily; no separate daily on Sundays |

Sunday's task activity is not lost — it is rolled into the weekly totals and can win any weekly highlight rule (§5.1).

### 2.2 Viewing Windows

| Surface | Window opens | Window closes | Behavior after close |
|---|---|---|---|
| Daily Wrapped | 9:00 PM same day (viewer's local IANA TZ) | 11:59 PM same day | Gone; **not archived**, no catch-up view |
| Weekly Wrapped | 9:00 PM Sunday (viewer's local IANA TZ) | 11:59 PM Monday (27-hour window, wider to accommodate Monday-morning openers) | Archived forever; browsable via `/wrapped` archive page, no push reminder |

The ephemerality of the daily is intentional — the push + scarcity is what makes the 9 PM moment feel like a ritual. See §13 for why this asymmetry is deliberate.

All day/week boundaries use the **viewer's local IANA timezone**, consistent with leaderboard and task-management conventions. A Wrapped record is generated per-household per-calendar-day; when spouses are in different timezones on the same day, both see the same content but may see it appear at different absolute times.

### 2.3 Vacation Suppression

When the household has an **active trip** (any `Trip` with `startDate ≤ today ≤ endDate`) that includes the current calendar day, **no Wrapped fires** — neither push nor in-app entry point renders. If the user opens the app during what would have been the viewing window, a muted placeholder shows:

> "On the road 🌍 — Wrapped paused until you're home. See you Monday."

Rationale: task completion drops by design during travel, so a "Quiet day" Wrapped would be both wrong and demoralizing. The trip itself is the celebration.

Vacation suppression applies to both daily and weekly. A week that contains any active-trip day still generates a weekly *record* (data is computed), but no push fires and the archive entry is flagged `suppressed: true` (entry shown with "Trip week — activity paused" label in the archive list).

### 2.4 Household Enablement Precondition

A Wrapped fires for a household only when **at least one** member has `wrappedEnabled === true` (§9). When only one member is enabled, that member receives push + sees the in-app Wrapped; the other member sees no entry point at all. This is the dogfood path — author enabled, spouse disabled, for 1–2 weeks of polish before flipping the spouse on.

---

## 3. Content — Daily Wrapped

### 3.1 Headline

The headline is the **family task-completion count for today**:

> **"You two closed {N} {tasks|task} today."**

Below the headline, a **tier-indexed motivational line** selected from a pool (§6.1):

| Tier | Range (family-wide count) | Tone |
|---|---|---|
| 0 | 0 | Gentle permission: rest day framing |
| 1 | 1–2 | Encouraging: slow-and-steady |
| 2 | 3–5 | Solid: good-day framing |
| 3 | 6–9 | Strong: crushing-it framing |
| 4 | 10+ | Playful awe: unhinged-output framing |

Exact copy variants per tier live in §6.1.

### 3.2 Highlights

Below the headline, **0–2 highlights** chosen by the rule engine (§5). Each highlight is one sentence naming the spouse who earned it.

**Example output** (tier 3 headline + 2 highlights):

> **You two closed 8 tasks today.**
> Strong day. Keep it up.
>
> 🐌 Sarah finally closed "Schedule the dentist appt" — that one was 12 days old.
> 🏆 Sarah lapped Jared today, 6 vs. 2. Suck it, Jared.

**Display order within the Wrapped card:**
1. Date ("Friday, Apr 24")
2. Headline + count
3. Motivational line (tier-pool pick)
4. Highlight #1 (if present)
5. Highlight #2 (if present, score ≥40, different category from #1)
6. Footer: "See you tomorrow at 9 PM" or a soft CTA

If zero rules cleared score threshold, the Wrapped renders only headline + motivational line. This is fine — reaching for filler makes it worse.

---

## 4. Content — Weekly Wrapped

Weekly Wrapped is a **richer, swipeable, multi-card surface** — intentionally different from daily's single-card compactness. The ceremony earns it.

### 4.1 Card Sequence

Fixed order, one per screen, swipe-through (think Spotify Wrapped story mode):

| # | Card | Content |
|---|---|---|
| 1 | **Headline** | "Your week in tasks" — family total for the week + week-over-week delta ("+3 vs last week" or "−4 vs last week") |
| 2 | **Best day** | "{Day of week} was your day — {N} closes." Names the single highest-completion day (ties → most recent). |
| 3 | **Leaderboard** | Cumulative Sarah vs. Jared for the week. Names the leader playfully. Includes a tied-week copy variant. |
| 4 | **Streak status** | Each spouse's current streak (from leaderboard) + whether the streak grew this week. |
| 5 | **Highlight reel** | Up to 3 highlights from the weekly rule engine (§5.2). May include weekly-only rules (week-over-week gain, comeback, new longest streak). |
| 6 | **Closer** | "Next week's Wrapped drops Sunday at 9 PM." |

### 4.2 Weekly-Only Rules

These rules evaluate over a 7-day window and are **never** evaluated for daily Wrappeds:

- **Week-over-week gain** — family total ≥20% more than prior week
- **Midweek comeback** — one spouse was behind the other at end-of-day Wednesday, finished the week ahead (scoped to family scale; see Comeback Kid badge in leaderboard for analogous monthly rule)
- **New longest streak** — either spouse set a new personal best-streak this week
- **Category sweep** — ≥1 task closed on all 7 days of the week (either spouse) — "Perfect attendance"

Daily rules (§5.1) also evaluate for weekly, aggregated over the week's data — e.g., "Sarah killed 3 zombie tasks this week" substitutes for the daily single-zombie copy.

---

## 5. Highlight Rule Engine

### 5.1 Rule Catalog (v1)

Each rule produces a **candidate highlight** when its trigger fires today (daily) or this week (weekly). Each candidate carries a `score` (0–100), a `category` (for de-dup), and a `cadence` tag (daily / weekly / both).

| # | Rule | Trigger | Score | Category | Cadence |
|---|------|---------|-------|----------|---------|
| 1 | **Zombie slain** | Closed a task with `completedAt − createdAt ≥ 7 days` | 90 | `zombie` | both |
| 2 | **Badge earned** | Newly-earned leaderboard badge (any tier) in the window, per `earnedAt ≥ window start` | 85 + (tier × 2) | `badge` | both |
| 3 | **Streak milestone** | A streak crossed {3, 7, 14, 30, 100} days within the window | 80 | `streak` | both |
| 4 | **Personal best day** | Daily only: today's per-spouse count is ≥ max(rolling 30-day, current week) for that spouse | 75 | `personal_best` | daily |
| 5 | **Leaderboard win** | One spouse's count > the other's, AND differential ≥3, AND loser ≤ winner/2 (lopsided days get louder copy; close days = no highlight) | 70 | `leaderboard` | both |
| 6 | **Week-over-week gain** | Weekly only: family total ≥ 120% of prior week's total, AND prior week's total ≥ 5 (avoid noisy swings off a small base) | 85 | `wow` | weekly |
| 7 | **Midweek comeback** | Weekly only: one spouse was behind at end-of-day Wednesday, finished the week ≥1 ahead | 85 | `comeback` | weekly |
| 8 | **Category sweep** | Weekly only: ≥1 task closed on all 7 days of the week by the household | 75 | `sweep` | weekly |
| 9 | **Project progress** | ≥3 items closed on the same project in the window | 55 | `project` | both |
| 10 | **Trip momentum** | ≥3 stops added to the same trip in the window | 50 | `trip` | both |
| 11 | **Receipt sweep** | ≥10 transactions categorized in the window (any categorization path) | 45 | `receipts` | both |

**Zombie threshold note.** The current `Task` model tracks `createdAt` and `completedAt` but does **not** track snooze history (see `TASK-LEADERBOARD-BRD.md` §8, "Snooze Buster badge" out-of-scope). Zombie is therefore age-only in v1. If a snooze counter is added in a future deploy, the Zombie rule should be extended to: "age ≥7 days **OR** snoozed ≥3 times" — see §14 open question 3.

### 5.2 Scoring, Selection, De-dup

**Daily Wrapped selects up to 2 highlights; Weekly Wrapped selects up to 3.**

**Algorithm:**

1. Evaluate every applicable rule against the window's data. Rules that don't trigger yield no candidate.
2. Rank candidates by `score` descending.
3. Pick candidate #1 unconditionally.
4. For each subsequent slot (up to cadence's limit): pick the next candidate whose `category` has not already appeared in the selected set **AND** whose score is **≥ 40**.
5. Stop when slots are full, or when no candidate meets the threshold + category-dedup requirement.
6. If zero candidates cleared, zero highlights are shown. The Wrapped renders only headline + motivational line.

**Why the score floor.** The tier-4 "10+ tasks" motivational line is already the big celebration on busy days; reaching for a weak highlight dilutes it. A Wrapped with one strong highlight reads better than one with a strong + a weak.

**Why category de-dup.** Two highlights in the same category (e.g., "Personal best day" + "Leaderboard win" — both numeric-triumph flavored) feel same-y. The rule engine is designed so two highlights on one Wrapped tell different stories (e.g., narrative-triumph + numeric-triumph, or badge + streak).

### 5.3 Attribution in Highlight Copy

Every highlight names the earning spouse by `displayName`. Rules 5 (leaderboard win), 7 (midweek comeback) name both spouses explicitly. Rules 1–4, 6, 8–11 credit a single spouse (the one whose data triggered the rule).

Copy voice matches the `celebrationCopy` voice in the leaderboard BRD (playful, familial, a little absurd). Specific copy pools in §6.2.

### 5.4 Tie-Breaking

- Multiple candidates with the same score: tie-break by cadence tag ("both" before cadence-specific), then by category alphabetical (deterministic). The user should never see different Wrapped content on two refreshes of the same day.
- Multiple spouses could theoretically trigger the same rule on the same day (e.g., both hit a streak milestone). In that case, the rule fires **once per spouse** as separate candidates; both may be selected if they survive de-dup (same category → only the higher-scoring earn survives; score tie → alphabetical by displayName for determinism).

---

## 6. Copy

### 6.1 Headline Tier Pools

Each tier has a pool of **≥8 variants**. The daily job picks one, avoiding any variant used in the household's last 7 days (per-household `recentCopyIds` in the Wrapped record).

**Tier 0 (0 tasks):**
- "Rest day. Earned or not, it counts."
- "Quiet one. Tomorrow's a new shot."
- "A zero-task day is sometimes the most productive one 🧘"
- "Nothing crossed off, and that's fine."
- "The to-do list got a day off. So did you."
- "Pause is a feature, not a bug."
- "Not every day needs a scoreboard."
- "Tomorrow then. 🌙"

**Tier 1 (1–2 tasks):**
- "Slow and steady. {N} down."
- "Momentum is momentum — {N} on the board."
- "A modest day. Every one counts."
- "{N} in the books. That's {N} more than yesterday's Mondays."
- "Not your loudest day, but the list got shorter."
- "{N} closed. The compounding starts with the small days."
- "Respect to the {N}-task days — they're underrated."
- "Small wins stack."

**Tier 2 (3–5 tasks):**
- "Solid day. {N} closed."
- "{N} in a day — the list is taking damage."
- "Respectable. Very respectable."
- "{N} tasks lighter tonight. Nice."
- "Methodical. {N} on the board."
- "A good, working day. {N} done."
- "Nothing flashy — just {N} tasks dispatched."
- "{N} closed, which is more than most humans did today."

**Tier 3 (6–9 tasks):**
- "Strong day. {N} closed. Keep it up."
- "{N} in a day — someone was in a mood."
- "Machine mode engaged. {N} down."
- "{N} tasks closed, zero mercy."
- "A real productive-ish afternoon, apparently."
- "{N} down. The list is in retreat."
- "Big day. {N} closed before bedtime."
- "{N} closed. You're making the rest of us look bad."

**Tier 4 (10+ tasks):**
- "OK you lady. {N} tasks in a single day?"
- "Unhinged output today. {N} closed."
- "{N} in one day. Are you okay? (Don't answer.)"
- "Someone had coffee. {N} closes."
- "{N} tasks. You broke the scoreboard."
- "{N} closed. This isn't productivity — it's performance art."
- "{N} in a day. Your future self is clapping from the couch."
- "We checked the math. {N} is correct. Stunning."

### 6.2 Highlight Copy Pools

Each rule has a pool of **≥5 variants** with slot-fills: `{displayName}`, `{taskName}`, `{ageInDays}`, `{tierLabel}`, `{badgeLabel}`, `{tripName}`, `{projectName}`, `{N}`, `{M}`.

**Rule 1 — Zombie slain:**
- "🐌 {displayName} finally closed '{taskName}' — that one was {ageInDays} days old."
- "🐌 {displayName} killed the zombie task. '{taskName}' had been lurking for {ageInDays} days."
- "🐌 '{taskName}' has been on the list for {ageInDays} days. {displayName} just put it down."
- "🐌 {displayName} cleared '{taskName}' after {ageInDays} days. That must feel good."
- "🐌 Zombie task slain: '{taskName}' ({ageInDays} days). {displayName} with the kill shot."

**Rule 2 — Badge earned:**
- "🏅 {displayName} earned {badgeLabel}. {celebrationCopy excerpt}"
- "🏅 New badge for {displayName}: {badgeLabel}."
- "🏅 {displayName} unlocked {badgeLabel}. Casual."
- "🏅 {badgeLabel} goes to {displayName}."
- "🏅 {displayName} clinched {badgeLabel} today. Shelf's getting heavier."

(The second-line snippet pulls the first sentence from the badge's `celebrationCopy` where useful — the leaderboard BRD already mandates these strings, so reuse is free.)

**Rule 3 — Streak milestone:**
- "🔥 {displayName} hit a {N}-day streak."
- "🔥 Day {N} in a row for {displayName}. The rhythm is real."
- "🔥 {displayName}'s streak ticked over to {N} days."
- "🔥 {N} consecutive days of closes for {displayName}."
- "🔥 {displayName}, {N} days straight. Impressive."

**Rule 4 — Personal best day:**
- "⭐ {N} tasks in a day — {displayName}'s best in a month."
- "⭐ {displayName} just set a personal record: {N} closes in one day."
- "⭐ New personal best for {displayName}. {N} in a day."
- "⭐ {displayName} hit {N} tasks today — a month-high."
- "⭐ {N} in a day is {displayName}'s best in 30 days."

**Rule 5 — Leaderboard win:**
- "🏆 {winner} lapped {loser} today, {N} vs {M}. Suck it, {loser}."
- "🏆 {winner} out-closed {loser} {N}–{M}. Ouch."
- "🏆 The scoreboard says {winner} {N}, {loser} {M}. Don't shoot the messenger."
- "🏆 {winner} ran away with it today. {N}–{M}."
- "🏆 {winner} {N}, {loser} {M}. We don't make the rules, we just report them."

**Rule 6 — Week-over-week gain (weekly only):**
- "📈 Family total up {pct}% from last week. Somebody's lighting a fire."
- "📈 {N} closes this week vs {M} last week. Real movement."
- "📈 Week-over-week: +{delta}. Nice lift."
- "📈 {pct}% more tasks than last week. Keep it going."
- "📈 The household just had its best week in a while. +{pct}% on last week."

**Rule 7 — Midweek comeback (weekly only):**
- "⚡ {winner} was down at hump day. Finished the week ahead. Classic heel turn."
- "⚡ {winner} came from behind — trailing Wed, leading Sunday."
- "⚡ Midweek comeback for {winner}. Down mid-week, up by Sunday."
- "⚡ Wednesday: {winner} was losing. Sunday: {winner} was winning. Storybook."
- "⚡ {winner} pulled a reversal — behind Wednesday, ahead by end of week."

**Rule 8 — Category sweep (weekly only):**
- "📅 A task closed every single day this week. Perfect attendance."
- "📅 7 for 7 — at least one close every day this week."
- "📅 No zeroes this week. Daily rhythm intact."
- "📅 Full-week sweep: a completion on every day."
- "📅 You two showed up every day this week. That's the whole game."

**Rule 9 — Project progress:**
- "📁 {N} items closed on {projectName} — real progress."
- "📁 {displayName} knocked out {N} on {projectName}."
- "📁 {projectName} lost {N} items today. {displayName}'s doing."
- "📁 Big day on {projectName} — {N} closed."
- "📁 {N} down on {projectName}. The finish line's closer."

**Rule 10 — Trip momentum:**
- "🌍 {N} new stops on the {tripName} trip — taking shape."
- "🌍 {displayName} added {N} stops to {tripName}. Planning mode unlocked."
- "🌍 {tripName} just got {N} new entries. Exciting."
- "🌍 The {tripName} itinerary grew by {N}."
- "🌍 {N} stops added to {tripName}. The vibes are building."

**Rule 11 — Receipt sweep:**
- "🧾 {N} transactions categorized — receipt inbox tamed."
- "🧾 {displayName} plowed through {N} uncategorized transactions."
- "🧾 {N} down in categorization. Finances less chaotic."
- "🧾 {N} transactions sorted. Future-you thanks present-you."
- "🧾 Receipts: {N} categorized. Clean."

### 6.3 Voice Guide

Voice rules for anyone adding copy later:

- **Validating, never guilt-trippy.** "Rest day, earned or not" not "you slacked off."
- **Playful, occasionally absurd.** "The to-do list is actively afraid of you" — yes.
- **Mildly snarky only at the spouse-vs-spouse moment.** "Suck it, Jared" is allowed because it's framed as playful competition between two consenting adults. Don't extend snark to zero-task days or low-activity days.
- **Second-person to the household**, not first-person-plural. "You two closed 8" not "we closed 8."
- **Never apologetic.** No "sorry you didn't get to X."
- **No emoji spam in prose.** Emoji at the start of highlights is a genre convention; don't sprinkle through sentences.

### 6.4 Repetition Avoidance

Wrapped record stores `usedCopyIds: string[]` — the IDs of every copy variant rendered in the last 7 days for this household. Tier pools filter out already-used IDs before picking. When a pool is exhausted (all 8 variants used in 7 days), the filter relaxes and reuse is allowed. In practice this only hits if you get 8 consecutive days in the same tier, which itself is notable.

---

## 7. Delivery

### 7.1 Push Notifications

**Fire time:** 9:00 PM in the viewer's local IANA timezone, on a per-user basis.

**Payload:**
- Title: "Your Wrapped is ready" (daily) / "Your Weekly Wrapped is ready" (weekly)
- Body: Short teaser — family task count. e.g., "You two closed 8 today. 2 highlights inside."
- Deep link: `/wrapped/today` (daily) or `/wrapped/week` (weekly)

**Not fired:**
- When `wrappedEnabled === false` for that user
- When the household has an active trip covering today (vacation suppression, §2.3)
- When the viewing window has already passed on the server at fire time (edge case: scheduler runs late; skip rather than fire stale)

**Only one push per user per day.** Sunday weekly push replaces the would-be daily push.

**No morning follow-up push in v1.** Explored early in design as a "missed it" nudge at 9 AM, rejected to keep the 9 PM moment the sole ritual. Revisit in v2 if open rates are low.

### 7.2 Entry Points

During an active window, the Wrapped is also accessible without the push, via:

- **Home / dashboard**: a dismissible Wrapped banner at the top of the dashboard during the viewing window, replacing whatever banner normally occupies that slot. Click opens the Wrapped.
- **Navigation**: a "Wrapped" item in the main nav with a small dot indicator when an unopened Wrapped exists in-window.
- **Deep link**: `/wrapped/today`, `/wrapped/week`, `/wrapped/archive`.

After the window closes (daily) or after archive (weekly), the dashboard banner disappears. The nav item remains but routes to `/wrapped/archive`.

### 7.3 Visual Design

**Daily Wrapped — single card:**
- ≤1 viewport height on mobile; no scrolling required for the common case (headline + 1–2 highlights).
- Large headline number, centered.
- Motivational line below in a muted voice.
- Highlights as stacked rows with a leading emoji, bold spouse name, then the copy.
- Footer: "Tap to dismiss" / "See you tomorrow at 9 PM."
- Screenshot-friendly: all crucial content above the fold, no ephemeral toasts overlap the card, no loading shimmers in the captured state.

**Weekly Wrapped — swipeable cards (§4.1):**
- 6 cards, swipe horizontally or tap right edge to advance.
- Each card is full-screen on mobile; centered max-width ~480px on desktop.
- Progress indicator at the top (6 pips, Spotify-Stories style).
- Final card includes a "Share a screenshot" prompt — no explicit share button wiring in v1, just a visual suggestion.

**Both variants:**
- Follow the household's active color theme.
- Dark-mode aware.
- `prefers-reduced-motion` disables card-transition animation; swipe still works, just without easing.

Exact visual spec (spacing, typography, motion curves) is a design follow-on, not in scope for this BRD.

---

## 8. History & Archive

### 8.1 Daily Wrapped: Ephemeral

Not persisted beyond its viewing window. After midnight, the Wrapped record is either deleted or soft-flagged (`expired: true`) to reclaim UI surface; either way, no UI path shows it.

**Why no archive.** The ritual moment *is* the feature. An archive of 30 ephemeral dailies adds storage and UI surface without meaningful reuse value — nobody scrolls back through 30 days of single-sentence recaps.

### 8.2 Weekly Wrapped: Archived Forever

Persisted per-household, one record per ISO week (Monday–Sunday). Browsable via the `/wrapped/archive` route:

- **List view** — chronological descending (most recent first), one row per week showing week-of date + headline stat ("Apr 14–20 · 47 tasks · +8 vs prior week").
- **Detail view** — re-renders the 6-card sequence from the stored record. Navigation is back/forward between weeks.
- **Trip-suppressed weeks** — labeled "Trip week — paused" in the list, clicking shows a single card explaining the pause (no card sequence).

**Year-in-Review for free.** Accumulated weekly archives naturally form a yearly summary — an end-of-year digest view could aggregate them cheaply in a future deploy, without any new data model.

**No deletion UI in v1.** Users can't delete past weekly Wrappeds. (The whole point is accumulation.)

### 8.3 Data Model

**New: `WeeklyWrapped` record.** Minimal, JSON-serializable:

```ts
interface WeeklyWrapped {
  id: string;
  householdId: string;
  weekStart: string; // ISO date, Monday
  weekEnd: string;   // ISO date, Sunday
  tz: string;        // IANA timezone used for window computation
  suppressed: boolean; // true if vacation-suppressed
  // Snapshotted card content (so past Wrappeds don't change if rules change):
  cards: {
    headline: { count: number; wowDelta: number; copyVariantId: string };
    bestDay: { dayOfWeek: string; count: number };
    leaderboard: { sarahCount: number; jaredCount: number; winnerId: string | null };
    streaks: { byUserId: Record<string, { current: number; grew: boolean }> };
    highlights: Array<{ ruleId: string; category: string; score: number; copyVariantId: string; fills: Record<string, string | number> }>;
  } | null; // null when suppressed
  createdAt: string;
  usedCopyIds: string[]; // carried forward to seed the next-week's repetition filter
}
```

Rationale for snapshotting: if copy pools or rule thresholds change in a later deploy, past Wrappeds should not retroactively mutate. A user flipping through archive in July 2027 sees the April 2026 Wrapped exactly as it appeared on April 26, 2026. This is the same philosophy used in the leaderboard BRD's per-badge `shippedAt` — bounded immutability per shipped record.

**No `DailyWrapped` persistent record.** Daily Wrappeds are computed on the fly from task data when the viewing window opens and thrown away at midnight. If a user refreshes the Wrapped mid-window, it re-computes and may re-roll to a different motivational-line variant — acceptable: the rule-engine output is deterministic given the same data, only the copy-pool pick has deliberate randomness, and the repetition-avoidance filter shared with weekly reads from a per-user `recentCopyIds` cache.

---

## 9. Feature Flag & Rollout

### 9.1 Per-User Flag

Add `wrappedEnabled: boolean` to the user profile (`User` entity). Default: `false` for all existing users at deploy time.

**Admin surface:** A hidden settings panel on the account page accessible to the primary author only (gated by `isAdmin`-equivalent — likely hardcoded to `user.email === env.ADMIN_EMAIL` in v1, consistent with other admin-only surfaces in the app). Shows a toggle per household member.

**Effect when `false`:**
- No push notification fires for that user at 9 PM.
- No dashboard banner renders.
- No nav item renders.
- `/wrapped/*` routes return the app's standard 404 (not a "feature disabled" page — the feature shouldn't exist at all from that user's perspective).

**Effect when `true`:**
- Everything in §7 activates.

### 9.2 Rollout Plan

1. **Deploy** with both household users `wrappedEnabled: false`. Feature is dark by default.
2. **Author enables self-only.** Author receives 9 PM push that night. Author dogfoods for 1–2 weeks — observes copy, tunes thresholds, catches bugs.
3. **Launch day:** Author enables spouse's flag during the dinner hour. Spouse's first push lands at 9 PM that night — the launch moment.
4. **Iteration:** Copy pools and rule scores live in `wrappedConfig.ts` constants; hot-editable via PR.

**No per-household flag.** Flag is per-user. In a two-user household the difference is theoretical, but the per-user granularity is what enables the "dogfood for a week, then surprise the spouse" rollout mechanic that is the whole rationale for the flag existing.

### 9.3 Observability

Minimal — this is a two-user app:
- Log each push send (who, when, cadence, whether delivered, payload size).
- Log each Wrapped open (from push vs. from in-app entry).
- Log window-expired-without-open events (useful to tune engagement).
- No dashboards, no metrics pipeline. Tail logs when needed.

---

## 10. Scheduler

### 10.1 Nightly Job

A server-side scheduled job runs every 15 minutes and, for each household-user pair with `wrappedEnabled === true`:

1. Check whether the user's local time is currently within [9:00 PM, 9:15 PM]. (Using the user's IANA TZ stored on the profile.)
2. Skip if already fired for this user today.
3. Skip if household has an active-trip day covering today.
4. Skip if Sunday daily (weekly replaces).
5. Compute the Wrapped payload (runs the rule engine, selects copy, fills slots).
6. For weekly, persist the `WeeklyWrapped` record.
7. Send the push.

The 15-minute cadence (rather than precise 9 PM firing) accommodates scheduler skew and timezone edges cheaply. Users in two different timezones receive their pushes at their respective local 9 PMs, which may be several hours apart.

### 10.2 Idempotency

Push-send deduplication is keyed on `(userId, cadence, localCalendarDate)`. A crash-and-retry of the scheduler job does not double-push.

### 10.3 Catch-up on Boot

If the server was down across 9 PM and comes back up before midnight, the next scheduler tick still fires pushes that haven't fired yet. After midnight, missed pushes are dropped (better no push than a 1 AM push).

---

## 11. Requirements Summary

### 11.1 Must Have (P0)

| # | Requirement |
|---|-------------|
| REQ-W-001 | Wrapped fires once daily at 9:00 PM (viewer's local IANA TZ): daily variant Monday–Saturday, weekly variant Sunday (weekly supersedes daily on Sundays) |
| REQ-W-002 | Daily Wrapped is viewable from 9:00 PM until 11:59 PM same-day local; outside this window no daily entry point renders and no archive exists |
| REQ-W-003 | Weekly Wrapped is viewable from Sunday 9:00 PM through Monday 11:59 PM local (27-hour window); after the window it is archived and browsable via `/wrapped/archive` |
| REQ-W-004 | Per-user `wrappedEnabled` boolean flag on the `User` entity, default `false`, gates all Wrapped surfaces (push, dashboard banner, nav item, routes) for that user |
| REQ-W-005 | When the household has any active trip (`Trip.startDate ≤ today ≤ Trip.endDate`) covering today, no Wrapped fires (vacation suppression); the weekly archive entry for a trip-containing week is flagged `suppressed: true` |
| REQ-W-006 | Daily headline = family-wide task completion count for today, paired with a motivational line picked from a tier-indexed pool based on the count: tier 0 (0), tier 1 (1–2), tier 2 (3–5), tier 3 (6–9), tier 4 (10+); each tier carries ≥8 copy variants |
| REQ-W-007 | Highlight rule engine evaluates all applicable rules against the window's data, producing candidates with score (0–100), category, and cadence tag; selection ranks by score desc, applies a ≥40 score floor for slots 2+, enforces category de-dup, and stops at the cadence's slot limit (daily: 2; weekly: 3) |
| REQ-W-008 | Rule catalog contains the 11 rules in §5.1; each rule declares cadence (daily / weekly / both), category (for dedup), and a score formula. Zombie rule is age-only in v1 (`completedAt − createdAt ≥ 7 days`) pending snooze-counter data model |
| REQ-W-009 | Each highlight rule has ≥5 copy variants with slot-fills; repetition avoidance uses a per-household `recentCopyIds` rolling-7-day filter that excludes recently-used variants |
| REQ-W-010 | Framing is family-level in headline ("You two closed N tasks") and individual in highlights (spouse named by `displayName`); leaderboard-win rule names both spouses |
| REQ-W-011 | Push notification payload includes a title, a one-line teaser including the family count + highlight count, and a deep link to `/wrapped/today` (daily) or `/wrapped/week` (weekly) |
| REQ-W-012 | Only one push per user per calendar day (Sunday weekly replaces would-be daily); push send is idempotent on `(userId, cadence, localCalendarDate)` — a scheduler retry does not double-fire |
| REQ-W-013 | Weekly Wrapped renders as a 6-card swipeable sequence in fixed order: Headline, Best Day, Leaderboard, Streak Status, Highlight Reel, Closer |
| REQ-W-014 | Weekly Wrapped persists as a `WeeklyWrapped` record with snapshotted card content (`cards` field), so past weekly Wrappeds in the archive are immutable even when copy pools or rule thresholds change in later deploys |
| REQ-W-015 | `/wrapped/archive` renders past weekly Wrappeds in reverse chronological order; a trip-suppressed week renders as a single "Trip week — paused" card |
| REQ-W-016 | If zero rules clear the score threshold, the Wrapped renders with only headline + motivational line (no highlights, no filler) |
| REQ-W-017 | All day/week boundaries use the viewer's local IANA timezone, consistent with leaderboard and task-management conventions |
| REQ-W-018 | Dashboard banner entry point renders only during the active viewing window for users with `wrappedEnabled === true`; outside the window the banner disappears and nav routes to `/wrapped/archive` |
| REQ-W-019 | Leaderboard-win rule (rule 5) fires only when `|N − M| ≥ 3` AND `min(N, M) ≤ max(N, M) / 2` — close days produce no highlight, lopsided days produce louder copy |
| REQ-W-020 | Wrapped is screenshot-friendly: content fits above the fold for the common case (daily headline + ≤2 highlights), no ephemeral toasts overlap card content, no loading shimmers in the captured state |

### 11.2 Should Have (P1)

| # | Requirement |
|---|-------------|
| REQ-W-021 | Nav item shows a dot indicator when an unopened Wrapped exists in-window |
| REQ-W-022 | `prefers-reduced-motion` disables card-transition animation on weekly; swipe still functions |
| REQ-W-023 | Scheduler window-expired-without-open events are logged to aid future engagement tuning |
| REQ-W-024 | Weekly Wrapped final card includes a visual "Share a screenshot" prompt (no programmatic share sheet in v1) |
| REQ-W-025 | Admin-only settings panel (gated by admin email match) exposes a toggle per household member for `wrappedEnabled` |
| REQ-W-026 | Tier-0 ("0 tasks") Wrapped always fires (not suppressed), using the gentle rest-day copy pool — the ritual's reliability matters more than a token silence |

### 11.3 Nice to Have (P2)

| # | Requirement |
|---|-------------|
| REQ-W-027 | Claude-generated highlight copy layer — nightly job asks the model for one fresh line given the day's data + voice guide, stored in the Wrapped record with template fallback on error. Gated by a separate `wrappedAiCopyEnabled` flag so the templated v1 path remains the default |
| REQ-W-028 | Year-in-Review view aggregating the prior 52 weekly Wrappeds — uses existing `WeeklyWrapped` records, no new data |
| REQ-W-029 | Haptic feedback on mobile when opening the weekly Wrapped (short triple-tap) |
| REQ-W-030 | Morning catch-up push at 9 AM when the prior night's Wrapped went unopened — only fires if engagement data shows low open rates on the 9 PM-only cadence |
| REQ-W-031 | Extend Zombie rule to "age ≥7 days OR snoozed ≥3 times" once a snooze counter is added to the Task model |

---

## 12. Assumptions

| # | Assumption |
|---|------------|
| 1 | Household has exactly 2 users. Copy variants ("You two closed…") and leaderboard framing ("Suck it, Jared") would need genericization if this expands; deferred until the app supports >2 users, which it does not today. |
| 2 | Per-user IANA timezone is stored on the `User` profile. If not, scheduler falls back to a household default TZ configured at setup. |
| 3 | Task `createdAt` and `completedAt` timestamps are reliable and not back-dated by any existing code path (confirmed via shipped leaderboard behavior). |
| 4 | Push notification infrastructure exists or is in scope for the feature's first deploy. If not, v1 can ship push-less (relying on dashboard banner + in-app nav) until push is wired. In that case REQ-W-011/012 are deferred; other requirements stand. |
| 5 | Claude API budget is not a blocker for a hypothetical v2 AI-copy layer — the scale is 1 call per household per day at most, cost ≪ $1/year at current pricing. |
| 6 | Admin gate via email match is acceptable in v1 for the `wrappedEnabled` toggle surface. If a real admin role system is added later, this migrates trivially. |
| 7 | The existing leaderboard's badge-earn timestamp (`earnedAt`) is queryable per-user within a date range. |

---

## 13. Out of Scope

| Item | Rationale |
|------|-----------|
| Daily Wrapped archive | Intentionally ephemeral — the 9 PM ritual's scarcity is what makes it work. Weekly ceremony earns its archive. |
| Explicit in-app share button (to iMessage, email, etc.) | Both spouses already see the same family-level Wrapped; external sharing has no v1 use case. Screenshot-friendly design covers the "send it to mom" path. |
| Per-user Wrapped (each spouse gets a separate Wrapped about themselves only) | Explicitly rejected in favor of Family Wrapped (§1.2). Individual validation survives via highlights that name the earning spouse. |
| Wrapped for personal (non-family-scope) tasks | Family-scope only, matching the shipped leaderboard. |
| Push notification sound / category customization | Uses the app's default push settings. Custom sounds for Wrapped is a polish pass. |
| Live preview / "see what today's Wrapped would look like right now" before 9 PM | Undermines the ritual; the 9 PM moment should remain the moment. |
| Server-side cross-device tracking of "opened Wrapped on phone, don't show banner on laptop" | Same rationale as the leaderboard BRD's partial cross-device gap — acceptable for a two-user family app. |
| Custom threshold tuning per household (e.g., settings page for "what counts as a good day") | Config is global across households in v1. Per-household tuning is pointless at 1-household scale. |
| A/B testing infrastructure for copy variants | Two users, no statistical power. Edit copy by vibes. |
| Wrapped for individual trips, projects, or financial milestones (e.g., "Italy trip wrap-up when it ends") | Separate initiative. This BRD is the daily/weekly cadence only. |
| Snooze-history-based Zombie rule (closed a task snoozed ≥3 times) | Deferred — current Task model does not track snooze history (see leaderboard BRD §8). Age-only Zombie in v1. |
| "Beat last week" gamified goals | Wrapped is a recap, not a goal system. Goal-setting is out of character. |

---

## 14. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Exact push fire tolerance — is 9:00 PM acceptable when the scheduler runs every 15 minutes (meaning actual fire time could be up to 9:15)? | Proposed: yes, 15-minute scheduler cadence is acceptable. Users will not perceive a 0–15 minute skew as anything other than "around 9." Tighter firing requires a second scheduler pass or a queue, not worth it. |
| 2 | Does the motivational-line tier-4 threshold start at 10 (as drafted) or scale by household size? | Proposed: fixed 10 for two-user households. Revisit if household size ever changes. |
| 3 | Zombie rule v2 — once a snooze counter lands on the Task model, should Zombie's OR condition be ≥3 snoozes or scale with age/snooze combined score? | Proposed: simple OR — `ageInDays ≥ 7 OR snoozeCount ≥ 3`. Combined scoring is over-engineering for a household app. |
| 4 | Should the weekly Wrapped's Leaderboard card handle a perfectly-tied week with a special copy pool? | Proposed: yes — a dedicated "You two split it down the middle" pool (≥3 variants). Ties are rare but landing a generic-sounding "Sarah wins 14 vs 14" would feel wrong. |
| 5 | Deep-link behavior when user opens the 9 PM push at 11:58 PM — does the Wrapped render anyway, or redirect to a "missed it" state? | Proposed: render if the user taps within the window (9 PM – midnight); redirect to archive (weekly) or a "See you tomorrow" screen (daily) if tapped after. The push carries an invisible timestamp so the client can enforce. |
| 6 | Should the weekly archive list show a count of "surprise moments" per week (badge earns, streak milestones) as a preview in the row? | Proposed: yes, a small badge/streak icon cluster at the right edge of each archive row, if the week's highlights include any. Makes the archive list visually richer without revealing copy. |
| 7 | Push notification text for tier-0 days — does "You two closed 0 today. Rest day." land, or does it read as guilt-bait even when the in-app copy is gentle? | Proposed: substitute for tier-0 push body — "Your Wrapped is ready 🌙" without mentioning the 0 count. Open the app for the gentle framing. |
| 8 | Should the feature flag be removed after spouse rollout, or kept for future household members (none planned but possible)? | Proposed: keep the flag indefinitely. Zero cost to leave it. Also preserves the dogfood path for any future feature variant. |
| 9 | Scheduler tick cadence — 15 minutes adequate, or drop to 5 minutes for tighter 9 PM firing? | Proposed: 15 minutes is fine. A 5-minute cadence is 3× the compute for imperceptible UX gain. |

---

## 15. Success Criteria

- Wrapped pushes fire at 9 PM local on every applicable day for every `wrappedEnabled === true` user, with vacation suppression and Sunday daily-supersede rules enforced.
- Daily Wrapped renders within 2 seconds of the viewer tapping the push, on both mobile and desktop browsers.
- The tier-indexed motivational line varies across ≥7 of 7 consecutive same-tier days without manual intervention (repetition avoidance working).
- Highlight rule engine, given a representative week of task + trip + project + transaction data, produces highlights that read as "surprising-but-true" to a human reviewer — no nonsensical or misleading statements.
- Zero-task days fire a Wrapped with the tier-0 pool and never read as guilt-inducing to the recipient.
- Trip-week suppression works end-to-end — no push fires, dashboard banner stays hidden, weekly archive entry exists with `suppressed: true`.
- The `wrappedEnabled` flag cleanly isolates the feature: with `false` the user sees no trace of Wrapped anywhere in the app, including the nav item and direct `/wrapped/*` routes.
- Dogfood path works: author enables self, receives push that night at 9 PM, can tune copy and rules via PR edits; spouse's subsequent enablement surfaces the feature as a first-time experience with no stale banners or phantom archive entries.
- Weekly archive accumulates one record per week; re-opening a 2-month-old Wrapped renders identical content to the original (snapshot immutability).
- Screenshots of the Wrapped (daily card or weekly individual cards) are cleanly captured without UI chrome, suitable for sending elsewhere unedited.
- The ritual holds: after 30 days of dogfood, the author reports Wrappeds as something looked-forward-to, not ignored.
