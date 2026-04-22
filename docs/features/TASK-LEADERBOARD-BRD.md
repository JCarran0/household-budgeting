# Task Leaderboard — Business Requirements Document

**Status:** Draft (v2.0 — expanded catalog, tier-driven polish, metallic medals)
**Author:** Jared Carrano
**Date:** 2026-04-22
**Version:** 2.0
**Extends:** `docs/features/TASK-MANAGEMENT-BRD.md` §5
**Supersedes:** v1.0 (2026-04-19)

**v2.0 deltas vs. v1.0:**
- Catalog expanded from 13 → 48 badges (4 original + 11 new motivational categories).
- "Capstone" / final-tier concept dissolved. All polish (medal finish, halo, sparkles, audio stinger) is driven by tier index alone — growth is free.
- Metallic medal visual (CSS-sculpted disc + SVG emblem) replaces flat artwork.
- Every tier earns a **hero modal** (no toast tier). Queue with de-dupe-by-category, ascending-rarity ordering, and three-cue audio crescendo.
- Per-badge required `shippedAt` field guards against retroactive celebration cascades on future category rollouts.
- Per-badge required `celebrationCopy` field — playful unlock text addressed to the viewer by name.
- Row slot selection uses a score-based rule (`rarity + recencyBoost`) replacing v1.0's hardcoded "drop Consistency first."
- Detail modal renders **full-screen** on all viewports (uses existing `ResponsiveModal`).
- Untouched categories have their **heading itself** hidden as `????` until the first badge is earned in that category; footer shows `N of M hidden categories`.
- Dev-only panel in the detail modal for local testing of modals, audio, cascade, and reduced-motion paths.

---

## 1. Overview

### 1.1 Problem Statement

The leaderboard shipped under Task Management v2.0/v2.1 (see `TASK-MANAGEMENT-BRD.md` §5) counts family-task completions across three fixed windows — today, this week, this month. This is a good *activity snapshot* but a weak *motivator*. The existing BRD already names the desired tone ("motivational and fun, not coldly competitive" — §5.4) and lists celebratory streak/milestone visuals as a Nice-to-Have (REQ-025). Neither was shipped. This BRD delivers on that intent.

### 1.2 Solution Summary

Add two motivational layers on top of the existing leaderboard:

- **Streaks.** A current-streak and best-streak column, measuring the number of consecutive calendar days on which a family member was credited with at least one family-task completion.
- **Badges.** A growing catalog of data-driven achievements — **48 badges across 15 categories** at v2.0 launch. Each badge carries a 1-based tier index mapped onto a Bronze/Silver/Gold/Platinum/Legendary metallic-medal finish. Unearned badges, and categories in which the user has not yet earned anything, render as `????` placeholders that pique curiosity.

Both layers compute from existing task data — no new persistence, no migrations. First leaderboard load after each deploy retroactively surfaces any badges members have already earned; a per-badge `shippedAt` timestamp prevents retroactive-earn celebration cascades on future category rollouts.

### 1.3 Users

All family members. Inherits the Family & Multi-User model (`FAMILY-MULTI-USER-BRD.md`) and the shared attribution rules from Task Management.

### 1.4 Relationship to the Existing Leaderboard

This BRD is **additive**. The shipped Today / This Week / This Month columns, the family-scope filter, the assignee-else-completer attribution rule, and the subtask counting rule (§5.3 of Task Management BRD) are unchanged. The new streak columns and badge slots sit alongside the existing columns on the same leaderboard panel.

---

## 2. Baseline — Shipped Leaderboard Behavior (reference)

The following is already implemented and unchanged by this BRD. It is summarized here so this document stands alone.

- **Scope filter.** Only `scope === 'family'` tasks count. Personal tasks are excluded entirely — they do not count for anyone.
- **Attribution.** A completion is credited to the task's `assigneeId` when one is set; otherwise to the user who moved the task to `done` (from the transition log).
- **Subtask credit.** A checked subtask on a family-scope parent contributes **one point**, attributed under the same rule (parent's `assigneeId` when set, else the subtask's `completedBy`). Unchecking removes the point. Legacy subtasks without a `completedAt` stamp are not retroactively credited.
- **Timezone.** Day, week, and month boundaries are computed in the viewer's local IANA timezone. Week boundary is Monday 00:00.
- **Double-counting rule.** A task moved `done` → `started` → `done` counts once, based on the most recent `completedAt`.

All new behavior in this BRD inherits these rules.

---

## 3. Streaks

### 3.1 Streak Day

A **streak day** for a user is a calendar day (in the viewer's IANA timezone) on which that user was credited with at least one family-task completion, where "completion" means either:

- A `Task` with `status === 'done'` whose `completedAt` falls on that day, or
- A `SubTask` with `completedAt` on that day (on a family-scope parent).

Attribution uses the same rule as the shipped leaderboard (§2). Personal tasks never contribute to a streak day.

### 3.2 Current Streak

**Current streak** is the number of consecutive streak days ending with the viewer's "anchor day," where the anchor is:

- **Today**, if the user has at least one credited completion today.
- **Yesterday**, otherwise (the "today-is-grace" rule).

Concretely: a user whose last completion was yesterday will see their streak number hold steady all day today. The streak only breaks at local midnight if today ends with zero completions. This matches Duolingo/Apple Fitness conventions and aligns with the motivational tone of §5.4 — users should not watch their streak tick to zero before they have a chance to act.

A user with zero credited completions ever has a current streak of `0`.

### 3.3 Best Streak

**Best streak** is the longest run of consecutive streak days ever observed for the user, computed from `Task.completedAt` + `SubTask.completedAt` values. The transition log is **not** scanned — completions that were later reversed (moved `done` → `started`) and then re-completed contribute only via their most recent `completedAt`. This keeps best-streak math consistent with the numbers shown in the Today/Week/Month columns: the same set of credit events drives both.

Best streak is monotonic non-decreasing over time. A user with zero credited completions ever has a best streak of `0`.

### 3.4 Display

The leaderboard table gains two columns to the right of This Month:

| Member | Today | This Week | This Month | Current 🔥 | Best |

- **Current 🔥** displays the current streak as a number. A flame glyph is rendered beside the number when the streak is ≥ 1; `0` renders as a dash or muted `0` without flame.
- **Best** displays the best streak as a number.
- The existing "highlight the max value in each column" treatment extends to both new columns.
- Streak cells have **no hover preview** (the existing hover preview on Today/Week/Month enumerates tasks; there is nothing analogous to enumerate for a streak summary stat).
- On narrow viewports, column headers may abbreviate (e.g., "Cur" / "Best", or flame icon only). The numeric cell content is never abbreviated.

---

## 4. Badges

### 4.1 Catalog

48 badges across 15 categories at v2.0 launch. All thresholds inherit the family-scope + attribution rules of the shipped leaderboard (§2) — `scope === 'family'` tasks only, attribution via assignee-else-completer, subtask credit as in §5.3 of `TASK-MANAGEMENT-BRD.md`, viewer's IANA timezone for all date boundaries.

Every badge definition carries:
- `tier: 1 | 2 | 3 | 4 | 5` — drives visual/audio polish (§4.6)
- `shippedAt: string` (ISO) — deploy time; gates celebration (§4.5)
- `celebrationCopy: string` — playful unlock message (§4.10)
- Optional `displayName` override — artistic label. When unset, label defaults to `"{categoryName} {finishName}"` (e.g., "Night Owl Bronze"). v2.0 catalog leaves this unset.

**Four original categories** (unchanged from v1.0):

**Volume — single-day bursts.** Credit with ≥ threshold completions on a single calendar day.

| ID | Tier | Threshold |
|----|------|-----------|
| `volume_5` | 1 | 5 in a day |
| `volume_10` | 2 | 10 in a day |
| `volume_20` | 3 | 20 in a day |

**Consistency — weekly rhythm.** ≥1 credited completion on ≥ threshold days within a single ISO week (Monday–Sunday).

| ID | Tier | Threshold |
|----|------|-----------|
| `consistency_4` | 1 | 4 days in a week |
| `consistency_5` | 2 | 5 days in a week |
| `consistency_7` | 3 | All 7 days in a week |

**Streak — all-time best.** Best streak (§3.3) reaches the threshold.

| ID | Tier | Threshold |
|----|------|-----------|
| `streak_7` | 1 | 7-day streak |
| `streak_30` | 2 | 30-day streak |
| `streak_100` | 3 | 100-day streak |

**Lifetime — cumulative.** Total family-task credit count reaches the threshold.

| ID | Tier | Threshold |
|----|------|-----------|
| `lifetime_10` | 1 | 10 delivered |
| `lifetime_50` | 2 | 50 delivered |
| `lifetime_100` | 3 | 100 delivered |
| `lifetime_500` | 4 | 500 delivered |
| `lifetime_1000` | 5 | 1000 delivered |

**Eleven new motivational categories** (v2.0):

**Weekday Warrior — M-F productivity.** Completions credited Mon-Fri (viewer's local TZ).

| ID | Tier | Threshold |
|----|------|-----------|
| `weekday_warrior_10` | 1 | 10 in a single Mon-Fri workweek |
| `weekday_warrior_25` | 2 | 25 across workdays in a single calendar month |
| `weekday_warrior_50` | 3 | 50 across workdays in a single calendar month |

**Night Owl — late-night closer.** Completions credited after 9 PM local time (all-time cumulative).

| ID | Tier | Threshold |
|----|------|-----------|
| `night_owl_10` | 1 | 10 closed after 9 PM |
| `night_owl_25` | 2 | 25 closed after 9 PM |
| `night_owl_50` | 3 | 50 closed after 9 PM |

**Early Bird — early-morning closer.** Completions credited before 7 AM local time (all-time cumulative).

| ID | Tier | Threshold |
|----|------|-----------|
| `early_bird_10` | 1 | 10 closed before 7 AM |
| `early_bird_25` | 2 | 25 closed before 7 AM |
| `early_bird_50` | 3 | 50 closed before 7 AM |

**Power Hour — 60-minute burst.** N completions within any single rolling 60-minute window (all-time best).

| ID | Tier | Threshold |
|----|------|-----------|
| `power_hour_5` | 1 | 5 within a 60-min window |
| `power_hour_10` | 2 | 10 within a 60-min window |
| `power_hour_15` | 3 | 15 within a 60-min window |

**Clean Sweep — zero-inbox moments.** Complete a family task that brings the family's total open-task count (non-done, non-cancelled, ignoring snoozed-until-future) to 0.

| ID | Tier | Threshold |
|----|------|-----------|
| `clean_sweep_1` | 1 | 1 zero-inbox occurrence |
| `clean_sweep_5` | 2 | 5 zero-inbox occurrences |
| `clean_sweep_10` | 3 | 10 zero-inbox occurrences |
| `clean_sweep_25` | 4 | 25 zero-inbox occurrences |

**Spring Cleaner — seasonal (Mar-Apr).** Credited completions within March 1 – April 30 of any single calendar year.

| ID | Tier | Threshold |
|----|------|-----------|
| `spring_cleaner_25` | 1 | 25 in a single Mar-Apr |
| `spring_cleaner_50` | 2 | 50 in a single Mar-Apr |
| `spring_cleaner_100` | 3 | 100 in a single Mar-Apr |

**Holiday Hero — seasonal (Dec).** Credited completions within December of any single calendar year.

| ID | Tier | Threshold |
|----|------|-----------|
| `holiday_hero_25` | 1 | 25 in a single December |
| `holiday_hero_50` | 2 | 50 in a single December |
| `holiday_hero_100` | 3 | 100 in a single December |

**Phoenix — comeback after a dry spell.** Close a family task when the user's previous credited completion was ≥14 calendar days ago.

| ID | Tier | Threshold |
|----|------|-----------|
| `phoenix_1` | 1 | 1 comeback |
| `phoenix_5` | 2 | 5 comebacks |
| `phoenix_10` | 3 | 10 comebacks |

**Clutch — overdue rescue.** Close a family task on or after its `dueDate`. Tasks without a `dueDate` are ineligible.

| ID | Tier | Threshold |
|----|------|-----------|
| `clutch_5` | 1 | 5 overdue closures |
| `clutch_25` | 2 | 25 overdue closures |
| `clutch_50` | 3 | 50 overdue closures |

**Partner in Crime — teamwork.** Calendar days on which both family members had ≥1 credited completion (family-scope).

| ID | Tier | Threshold |
|----|------|-----------|
| `partner_in_crime_5` | 1 | 5 shared-completion days |
| `partner_in_crime_25` | 2 | 25 shared-completion days |
| `partner_in_crime_50` | 3 | 50 shared-completion days |

**Comeback Kid — monthly reversal.** In a single calendar month, be behind the other family member in credited completions at end-of-day on the 15th (local TZ), then finish the month ≥1 ahead.

| ID | Tier | Threshold |
|----|------|-----------|
| `comeback_kid_1` | 1 | 1 month of reversal |
| `comeback_kid_3` | 2 | 3 months of reversal |
| `comeback_kid_5` | 3 | 5 months of reversal |

### 4.2 Earning Rules

- **Data-driven.** Badges reflect the user's current task dataset. If the user uncompletes a task (e.g., moves `done` → `started`) and that completion was the sole qualifier for a threshold, the badge disappears on the next leaderboard load. In practice this is vanishingly rare at family scale. Rationale: keeps the computation fully stateless (REQ-L-010). Badges are a live mirror, not a memorial plaque.
- **Cumulative across tiers.** A single qualifying event earns all lower tiers not yet held. Example: a user who completes 20 tasks in one day and currently holds no Volume badges earns `volume_5`, `volume_10`, and `volume_20` simultaneously. De-duplication semantics during celebration are in §4.5.
- **Independent across members.** Each user's badge collection is personal. Two members hitting 50 delivered on the same day both earn `lifetime_50` — there is no "first past the post."
- **No weighting.** Every qualifying completion counts equally (matching the shipped leaderboard's no-weighting assumption, `TASK-MANAGEMENT-BRD.md` §8 #3).
- **Per-badge `shippedAt` gates celebration, not earn state.** A user who qualifies for a newly-shipped badge from historical data receives the badge on their shelf silently; only events occurring after the badge's `shippedAt` trigger the hero modal. See §4.5.

### 4.3 Computation Model

Badges are **stateless — derived from task data on every leaderboard request**, not persisted in a separate collection. For each badge, both "earned?" and "earnedAt?" are computable from the same pass over tasks that the leaderboard already performs:

- **Volume / Consistency / Lifetime / Weekday Warrior / Night Owl / Early Bird / Power Hour / Spring Cleaner / Holiday Hero:** derivable from the stream of credit events `(userId, timestamp)` produced by scanning tasks and subtasks, filtered by whatever windowing predicate the category uses (time-of-day, day-of-week, season, rolling window).
- **Streak-tier badges:** derivable from the same streak computation (§3.3). A badge's `earnedAt` is the `completedAt` of the task that first pushed the best streak to the threshold.
- **Clean Sweep:** iterate credit events in chronological order and, after each completion, check whether the family's open-task count transitioned from >0 to 0.
- **Phoenix:** per-user, flag completions where the previous credited completion was ≥14 calendar days earlier.
- **Clutch:** completions where `completedAt ≥ dueDate` (tasks without `dueDate` skipped).
- **Partner in Crime:** group credit events by calendar day; count days where both `userId`s appear.
- **Comeback Kid:** per calendar month, compare running cumulative counts at end-of-day-15 vs. end-of-month.

Consequence: no new storage, no schema change, no migration script. The badge catalog is hardcoded in shared types.

### 4.4 Retroactive Awarding

Because computation is stateless, **all badges earned from historical task data appear populated on the first leaderboard load after the deploy that ships them**. A member with 200+ completed family tasks will see `lifetime_10`, `lifetime_50`, `lifetime_100` populated immediately, along with any day/week bursts that happened to meet thresholds.

No backfill job. No one-shot audit script. The first read *is* the backfill.

Retroactive badges **do not trigger celebrations** — the `shippedAt` guard in §4.5 silently advances the marker past historical earns.

### 4.5 Celebration on New Unlock

A newly earned badge triggers a **hero modal** celebration on the next leaderboard load. The modal is centered on a blurred backdrop, renders the earned medal at hero size (§4.8), shows a personalized message using the viewer's `displayName` and the badge's `celebrationCopy`, and requires explicit dismiss — no auto-close.

**Queue semantics.** A single leaderboard load may surface multiple newly earned badges. The client builds a celebration queue from them and applies two rules:

1. **De-duplicate by category.** When a single earning event produces multiple tiers in the same category (§4.2 cumulative rule — e.g., a 20-task day earns `volume_5`, `volume_10`, `volume_20` simultaneously), only the **highest-tier** earn in each category enters the queue. Lower tiers appear silently in the row + detail modal on the same load.
2. **Sort ascending by rarity.** Modals fire from smallest to biggest — the crescendo lands on the queue's most impressive badge. Rarity uses the same per-tier weighting as the row-slot score (§5.1): `[1, 2, 4, 8, 16]` for tiers 1 through 5.

Each modal is independently dismissed. A ~400ms transition separates consecutive modals.

**Audio, three cues:**
- **Small triumphant** (~1.5s, punchy) plays on every non-last modal in the queue.
- **Big triumphant** (~3s, full fanfare) plays on the final modal of the queue.
- **Legendary stinger** (distinct, most memorable cue in the system) replaces Big triumphant when the final modal is a **tier-5** badge.

Single-modal loads (the common case) always play the "final-modal" cue — Big triumphant, or Legendary stinger if tier-5. Rule of thumb: "the last modal of the load always gets the big treatment."

**Confetti** fires on every modal open. The final modal of the queue gets a larger, longer burst to reinforce the audio crescendo.

**Detection mechanism.** A `lastSeenBadgeEarnedAt` marker in `localStorage` (per browser). On every leaderboard load, the client computes `earnedAt` for each currently-earned badge and adds any `earnedAt > marker` entries to the celebration queue, then advances the marker to the maximum `earnedAt` seen.

**`shippedAt` guard.** Each badge definition carries a required `shippedAt: string` ISO timestamp (= deploy time of that badge). A badge contributes to the celebration queue only if `earnedAt ≥ shippedAt`. If `earnedAt < shippedAt`, the badge is populated in the detail modal and the marker silently advances past it. This prevents retroactive cascades when new categories or tiers are added in later deploys — users who already qualify from historical data get the badge on their shelf without fanfare.

**Day-1 seed.** On the first load after the v1.0 feature ships, the client sets `lastSeenBadgeEarnedAt` to `now` **before** rendering celebrations. This silently populates the initial v1.0 badge state (Volume / Consistency / Streak / Lifetime) without a welcome cascade. The `shippedAt` guard handles v2.0 badges and all future expansions cleanly without needing another one-time seed.

**Copy template.** Every hero modal renders:

```
{displayName}, you've earned {badgeLabel}!
{celebrationCopy}
```

`badgeLabel` defaults to `"{categoryName} {finishName}"` (e.g., "Night Owl Bronze") unless the catalog supplies a `displayName` override. `celebrationCopy` is a required per-badge playful string (§4.10).

**Cross-device gap.** `localStorage` is per-browser. Earn on phone, open on laptop → badge appears silently on the laptop. Acceptable for a two-user family app; not worth server-side state to solve.

### 4.6 Tier-Driven Visual & Audio Polish

Every badge carries a 1-based `tier` index (1 → 5). Tier index is the **sole** axis of polish — there is no separate "capstone" or "final-tier" concept. The previous v1.0 final-tier treatment is now an instance of the tier-index rules below.

| Treatment | Applies at tier |
|---|---|
| Hero modal on unlock | All (1+) |
| Medal finish (see §4.8) | 1 Bronze / 2 Silver / 3 Gold / 4 Platinum / 5 Legendary |
| Persistent finish-colored halo in row + detail modal | 3+ (Gold, Platinum, Legendary) |
| Sparkle particles in hero modal | 5 only |
| Legendary audio stinger on final modal of queue | 5 only |
| Optional artistic badge `displayName` override | Any tier (catalog-driven) |

**Growth is free.** Existing 3-tier categories can be extended without framework changes — adding, e.g., Volume tier 4 at "30 in a day" and tier 5 at "50 in a day" automatically grants the new tiers Platinum/Legendary finishes, extra halo, sparkle particles, and Legendary audio stinger.

### 4.7 Unearned Badge & Hidden Category Rendering (`????`)

Obfuscation operates at two levels:

**Unearned badges in an earned-in category.** Render as a ghost `????` placeholder tile — no artwork, no threshold label, no tooltip. Grid position implies tier index, but the threshold is hidden. Once earned, the tile transforms into the final medal with a tooltip showing `description` + `earnedAt`.

**Untouched categories (zero badges earned).** The category heading itself is hidden — rendered as `????` in place of the name. The category's tiles are **collapsed** to a single placeholder row (no per-tier `????` tiles — that would leak the tier count, and tier count varies across categories). Once the user earns their first badge in the category, the heading reveals and the full tier grid expands.

**Footer summary.** The detail modal footer displays `N of M hidden categories` so users know unseen progress exists without knowing what the categories are.

**No tooltips on hidden content.** Hovering any `????` — whether badge tile or category heading — reveals nothing.

**Row rendering is unchanged** — `????` placeholders live only in the detail modal; the leaderboard row shows fewer earned badges rather than ghosts (§5.1).

### 4.8 Metallic Medal Visual

Badges render as a **CSS-sculpted metallic disc** with a centered SVG emblem — intentionally distinct from flat sticker-style artwork. The target aesthetic is a "real medal" pressed-metal vibe.

**Disc chassis (CSS-only):**
- Radial-gradient fill tinted per finish.
- Inset `box-shadow` producing a beveled rim.
- Top-left highlight crescent faking a fixed light source.
- A single parameterized React component (`<MedalBadge tier={} emblem={} size={}>`).

**Finish color scale (by tier):**
| Tier | Finish | Visual intent |
|---|---|---|
| 1 | Bronze | Warm copper gradient |
| 2 | Silver | Cool neutral gradient |
| 3 | Gold | Warm yellow gradient |
| 4 | Platinum | Pale cool white-blue gradient |
| 5 | Legendary | Iridescent / oil-slick gradient |

**Emblem (SVG):** category-specific vector icon centered on the disc (moon for Night Owl, sunrise for Early Bird, broom for Clean Sweep, feather for Phoenix, hourglass for Clutch, etc.). Scales cleanly from row thumbnail (≈32px) to hero modal (≈240px).

**Hero modal motion:**
- **Entry** — scale from 0 → 1 with a single ~360° rotation over ~800ms, then settles. Fires once on modal open.
- **Ambient shimmer** — diagonal light gradient sweeps across the disc every ~3s. Pure CSS animation.
- **Ambient glow pulse** — halo breathes at ~2s cycle in the disc's finish color.
- **Legendary-only sparkle** — small SVG sparkle particles emanate from the disc; loops while modal is open.

**Row + detail modal motion:** medals render **static** — no shimmer, no ambient loops. Too much motion across a panel with many badges. Tier-3+ badges keep their persistent finish-colored halo; tier-5 halo adds a subtle extra glow.

**Accessibility.** `prefers-reduced-motion` replaces entry animation with a fade-in, pauses ambient loops, and drops sparkle particles. Confetti still fires — it's the celebration moment — but the disc motion disengages.

### 4.9 Dev Mode (Development Builds Only)

Gated by `import.meta.env.DEV`. A small `🛠 Dev` control appears in the detail modal footer in dev builds only; clicking expands a dev panel. Tree-shaken out of production bundles.

Controls:
- **Reveal all `????`** — show category names and badge thresholds that would otherwise be hidden. Scope: the currently-open detail modal only.
- **Trigger hero modal (per badge)** — a "Test" button next to every badge in the grid. Fires that badge's hero modal in isolation, including entry animation, ambient loops, audio, and confetti.
- **Simulate cascade** — fires a pre-canned sequence of 3 sequential modals (e.g., Night Owl Bronze → Volume Silver → Lifetime Legendary) to validate queue pacing, audio crescendo, and confetti escalation without needing lucky real data.
- **Reset `lastSeenBadgeEarnedAt`** — clears the localStorage marker. On the next leaderboard load, every currently-earned badge retroactively celebrates (ignoring the day-1 seed and `shippedAt` for this debugging path only).
- **Audio preview** — three buttons: Small / Big / Legendary stinger. Plays each cue in isolation.
- **Reduced-motion override** — toggle forces the `prefers-reduced-motion` pathway on without changing OS settings. Lets a sighted user QA the degraded state.
- **View as partner** — re-renders the detail modal as if viewing the other family member's badges. Exercises per-member state selectors without logging out.
- **Animation replay** — control inside an open hero modal that re-plays entry animation + confetti + audio without re-triggering the unlock event. Makes tweaking motion curves practical.

### 4.10 Celebration Copy Reference

All 48 `celebrationCopy` strings use `{displayName}` template token. Voice is playful, familial, a little absurd — matches the tone-of-voice cue in `TASK-MANAGEMENT-BRD.md` §5.4 ("motivational and fun, not coldly competitive").

**Volume**
- `volume_5` — "{displayName}, Volume Bronze! 5 tasks in a single day. Productivity is a vibe, and you're emitting."
- `volume_10` — "{displayName}, Volume Silver! Double digits in a single day. The to-do list is actively afraid of you."
- `volume_20` — "{displayName}, Volume Gold! 20 tasks in one day. Are you sure you breathed today?"

**Consistency**
- `consistency_4` — "{displayName}, Consistency Bronze! 4 days with a completion this week. Showing up is half the battle — you showed up."
- `consistency_5` — "{displayName}, Consistency Silver! 5 days this week with something crossed off. The rhythm is undeniable."
- `consistency_7` — "{displayName}, Consistency Gold! A completion every single day this week. Perfect attendance. Gold star. Literally."

**Streak**
- `streak_7` — "{displayName}, Streak Bronze! A full week of consecutive days. Habits are forming, and they are suspicious."
- `streak_30` — "{displayName}, Streak Silver! 30 days in a row. That's not a streak, that's a lifestyle."
- `streak_100` — "{displayName}, Streak Gold! 100-day streak. Stop and reflect on what's happening here — it's remarkable."

**Lifetime**
- `lifetime_10` — "{displayName}, Lifetime Bronze! 10 tasks delivered. The journey of a thousand completions begins with one."
- `lifetime_50` — "{displayName}, Lifetime Silver! 50 tasks delivered. You're not even breaking a sweat."
- `lifetime_100` — "{displayName}, Lifetime Gold! 100 family tasks delivered. Triple digits. Certified useful."
- `lifetime_500` — "{displayName}, Lifetime Platinum! 500 tasks delivered. Your family would be a logistical disaster without you."
- `lifetime_1000` — "{displayName}, LEGENDARY. 1,000 family tasks delivered. One thousand. You could retire here — but you won't, because you're you."

**Weekday Warrior**
- `weekday_warrior_10` — "{displayName}, you've earned your first Weekday Warrior badge. You don't let a little thing like a day job get in your way. Your family appreciates it."
- `weekday_warrior_25` — "{displayName}, Weekday Warrior Silver! 25 tasks across the workweek grind — productivity between meetings is an art form, and you've nailed it."
- `weekday_warrior_50` — "{displayName}, Weekday Warrior Gold! 50 tasks in a month of Mondays through Fridays. You didn't keep up — you lapped the workweek."

**Night Owl**
- `night_owl_10` — "{displayName}, Night Owl Bronze! 10 tasks closed after 9 PM. Your future self thanks you, even if your sleep schedule is suspicious."
- `night_owl_25` — "{displayName}, Night Owl Silver! 25 tasks in the quiet hours. The house is asleep, but the to-do list isn't safe."
- `night_owl_50` — "{displayName}, Night Owl Gold! 50 tasks closed after 9 PM. Are you okay? (Don't answer — the badge is proud of you.)"

**Early Bird**
- `early_bird_10` — "{displayName}, Early Bird Bronze! 10 tasks before 7 AM — while the rest of us were still negotiating with the snooze button."
- `early_bird_25` — "{displayName}, Early Bird Silver! 25 tasks before 7 AM. Sunrise sees you and says, 'oh, they're at it again.'"
- `early_bird_50` — "{displayName}, Early Bird Gold! 50 tasks before coffee has kicked in for most people. You are a menace to procrastinators everywhere."

**Power Hour**
- `power_hour_5` — "{displayName}, Power Hour Bronze! 5 tasks in a single hour. Someone was in the zone."
- `power_hour_10` — "{displayName}, Power Hour Silver! 10 tasks in 60 minutes — that's a task every 6 minutes. We checked the math. It's real."
- `power_hour_15` — "{displayName}, Power Hour Gold! 15 tasks in an hour. This isn't productivity, it's performance art."

**Clean Sweep**
- `clean_sweep_1` — "{displayName}, Clean Sweep Bronze! You brought the family task list to zero. For one glorious moment, there was nothing to do. Enjoy it — it won't last."
- `clean_sweep_5` — "{displayName}, Clean Sweep Silver! 5 times you've emptied the family inbox. You're a recurring threat to clutter."
- `clean_sweep_10` — "{displayName}, Clean Sweep Gold! 10 zero-inbox moments. The family task list sees you coming and sighs in defeat."
- `clean_sweep_25` — "{displayName}, Clean Sweep Platinum! 25 times you've left no task standing. This is a lifestyle now."

**Spring Cleaner**
- `spring_cleaner_25` — "{displayName}, Spring Cleaner Bronze! 25 completions between March and April. The house, the yard, the mental load — all getting brighter."
- `spring_cleaner_50` — "{displayName}, Spring Cleaner Silver! 50 completions in a single spring. Turns out it's not the flowers blooming — it's you."
- `spring_cleaner_100` — "{displayName}, Spring Cleaner Gold! 100 completions in two months. Winter hibernation is over, and the rest of us are tired just watching."

**Holiday Hero**
- `holiday_hero_25` — "{displayName}, Holiday Hero Bronze! 25 completions in December. Between the gifts, the gatherings, and the grocery runs — somehow you kept it together."
- `holiday_hero_50` — "{displayName}, Holiday Hero Silver! 50 completions in a single December. You didn't just survive the holidays — you conquered them."
- `holiday_hero_100` — "{displayName}, Holiday Hero Gold! 100 completions in December. Santa took notes."

**Phoenix**
- `phoenix_1` — "{displayName}, Phoenix Bronze! Your first comeback after two weeks quiet. Rising from the ashes — one task at a time."
- `phoenix_5` — "{displayName}, Phoenix Silver! 5 comebacks. Life gets loud, you go quiet, you come back swinging. A classic."
- `phoenix_10` — "{displayName}, Phoenix Gold! 10 epic returns from the void. No such thing as falling off — just a really long warm-up."

**Clutch**
- `clutch_5` — "{displayName}, Clutch Bronze! 5 overdue tasks closed before they could haunt you. The past forgives you."
- `clutch_25` — "{displayName}, Clutch Silver! 25 rescues from the overdue pile. You don't run from deadlines — you catch up to them."
- `clutch_50` — "{displayName}, Clutch Gold! 50 overdue tasks dispatched. The calendar trembles."

**Partner in Crime**
- `partner_in_crime_5` — "{displayName}, Partner in Crime Bronze! 5 days where both of you got things done. Teamwork, but make it household."
- `partner_in_crime_25` — "{displayName}, Partner in Crime Silver! 25 shared-completion days. The family flywheel is spinning."
- `partner_in_crime_50` — "{displayName}, Partner in Crime Gold! 50 days of synchronized chore-crushing. This marriage thing is going okay."

**Comeback Kid**
- `comeback_kid_1` — "{displayName}, Comeback Kid Bronze! Mid-month you were behind — end of month, you'd retaken the lead. Never count yourself out."
- `comeback_kid_3` — "{displayName}, Comeback Kid Silver! Three months of end-of-month reversals. The second half of the month is where you live."
- `comeback_kid_5` — "{displayName}, Comeback Kid Gold! Five come-from-behind monthly wins. You'd rather be chasing than leading, and it shows."

---

## 5. Display

### 5.1 Leaderboard Row

Each member's row gains a **badge slot area** rendering up to **3 earned badges**. No ghost placeholders on the row — `????` lives only in the detail modal. A member with earns in fewer than 3 categories displays fewer badges.

**Per-badge score** drives selection and ordering:

```
badgeScore = rarity + recencyBoost

rarity = {
  1: 1,
  2: 2,
  3: 4,
  4: 8,
  5: 16,
}[tier]  // accelerating geometric scale

recencyBoost = 10 * exp(-daysSinceEarnedAt / 7)
```

The geometric rarity curve makes tier-5 (Legendary) badges durable in the row: a fresh tier-1 earn (score 11 on day 0) cannot displace an old Legendary (score 16), but a fresh tier-3+ earn can temporarily outrank older Gold medals for roughly a week before steady-state rarity dominates again.

**Slot selection:**
1. For each category with ≥1 earned badge, pick the badge with the highest score — that's the category's **representative**.
2. Rank category representatives by score, descending.
3. Take the top 3. Tie-break by `earnedAt` descending.

The slot area is clickable; clicking opens the detail modal.

**Hover/long-press preview.** A minimal tooltip with the badge's `description` shows on hover-with-delay (desktop) or long-press (mobile). Full-size artwork, threshold, and `earnedAt` live in the detail modal.

### 5.2 Detail Modal

Clicking a member's name or badge slot area opens a **full-screen** per-member detail modal. Uses `<ResponsiveModal fullScreen={true}>` — the existing wrapper already forces full-screen on mobile (≤48em); v2.0 opts desktop in too. Rationale: ~48 tiles require the canvas.

**Layout:**

- **Header** — member avatar, display name, summary count (e.g., "14 of 48 earned").
- **Body — badge grid, grouped by category.** Category order is fixed:
  - Four v1 originals first: Volume, Consistency, Streak, Lifetime.
  - Eleven v2 categories in catalog order: Weekday Warrior, Night Owl, Early Bird, Power Hour, Clean Sweep, Spring Cleaner, Holiday Hero, Phoenix, Clutch, Partner in Crime, Comeback Kid.
- **Earned-in category (≥1 badge earned):** category heading visible. All tiers rendered. Earned tiles show the medal with tooltip (`description` + `earnedAt` date). Unearned tiles are `????` placeholders with no tooltip.
- **Untouched category (zero badges earned):** heading replaced with `????`; tiles collapsed to a single placeholder row — no per-tier grid (see §4.7).
- **Footer** — `N of M hidden categories` counter. In dev builds only, a `🛠 Dev` toggle expands the dev panel (§4.9).

**No "compare to other members" view** — the modal is a personal achievement shelf. Viewing another member's badges happens by clicking that member's row.

---

## 6. Requirements Summary

### 6.1 Must Have (P0)

| # | Requirement |
|---|-------------|
| REQ-L-001 | Leaderboard gains two columns: **Current** streak and **Best** streak, positioned to the right of This Month |
| REQ-L-002 | A streak day is any calendar day (viewer's IANA timezone) on which the user is credited with ≥1 family-task completion (tasks or subtasks, using the shipped attribution rule) |
| REQ-L-003 | Current streak uses **today-is-grace** semantics: the anchor day is today if today has ≥1 credited completion, else yesterday |
| REQ-L-004 | Best streak is computed from `Task.completedAt` + `SubTask.completedAt` only; the transition log is not scanned |
| REQ-L-005 | Streak cells display a flame glyph (🔥) when the value is ≥ 5; `0` renders as a muted dash without a flame; values 1-4 render as a plain number without a flame |
| REQ-L-006 | Streak cells have no hover preview; the column headers carry tooltips that explain today-is-grace and the monotonic best-streak rule |
| REQ-L-007 | Badge catalog contains 48 badges across 15 categories at v2.0 launch: 4 original (Volume/Consistency/Streak/Lifetime) + 11 new (Weekday Warrior, Night Owl, Early Bird, Power Hour, Clean Sweep, Spring Cleaner, Holiday Hero, Phoenix, Clutch, Partner in Crime, Comeback Kid). Every badge definition carries required fields `tier: 1..5`, `shippedAt: ISO string`, and `celebrationCopy: string` |
| REQ-L-008 | Badges are data-driven — if a completion that was the sole qualifier for a threshold is reverted, the badge disappears on the next leaderboard load; no separate persistence keeps revoked badges alive |
| REQ-L-009 | A single qualifying event earns all lower tiers in the same category not yet held |
| REQ-L-010 | Badges are computed stateless from existing task data on every leaderboard request; no new persistence collection is introduced |
| REQ-L-011 | Historical badges appear retroactively on the first leaderboard load after the deploy that ships them; no backfill job required |
| REQ-L-012 | Unearned badges in an earned-in category render as `????` placeholders (no artwork, no tooltip, no threshold label). Untouched categories (zero badges earned) render with the category heading itself replaced by `????` and tiles collapsed to a single placeholder row — no per-tier tiles (tier count is hidden because it varies across categories) |
| REQ-L-013 | Each leaderboard row displays up to 3 earned badges selected by per-badge score. Score = `rarity + recencyBoost` where `rarity = [1,2,4,8,16][tier-1]` (geometric) and `recencyBoost = 10 * exp(-daysSinceEarnedAt / 7)`. Per-category representative = highest-scoring earned badge in that category; rank representatives by score descending; take top 3; tie-break by `earnedAt` descending. No ghost placeholders on the row — fewer earns = fewer badges |
| REQ-L-014 | Clicking a member's row or badge slot area opens a per-member detail modal rendered **full-screen** via `<ResponsiveModal fullScreen={true}>`; grid is grouped by category in fixed order (4 original first, then 11 new in catalog order) |
| REQ-L-015 | Every newly earned badge triggers a **hero modal** (no toast tier). Queue semantics: (a) de-duplicate by category on a single load — only the highest-tier earn per category enters the queue; (b) sort the queue ascending by rarity (`[1,2,4,8,16][tier-1]`) so the most impressive modal lands last; (c) ~400ms transition between modals; each modal is independently dismissed; (d) modal requires explicit dismiss, no auto-close |
| REQ-L-016 | Hero modal renders the copy template `"{displayName}, you've earned {badgeLabel}!\n{celebrationCopy}"`. `badgeLabel` defaults to `"{categoryName} {finishName}"` unless the catalog supplies an artistic override. `celebrationCopy` is a required per-badge string |
| REQ-L-017 | Audio uses three cues: **Small triumphant** (~1.5s) on non-last modals in the queue; **Big triumphant** (~3s) on the final modal of the queue; **Legendary stinger** replaces Big when the final modal is a tier-5 badge. Single-modal loads always play the final-modal cue |
| REQ-L-018 | Confetti fires on every modal open. The final modal of the queue gets a larger, longer burst |
| REQ-L-019 | Celebration detection uses a `lastSeenBadgeEarnedAt` marker in `localStorage`. Per-badge `shippedAt` gates the queue — earns where `earnedAt < shippedAt` advance the marker silently without celebration. A day-1 seed sets the marker to `now` on first load after the v1.0 feature ships (the `shippedAt` guard handles v2.0 and all future expansions without requiring another seed) |
| REQ-L-020 | Tier index is the sole axis of polish — no separate "capstone" / final-tier code path exists. Polish applies per the table in §4.6: hero modal for all tiers; medal finish per tier (Bronze/Silver/Gold/Platinum/Legendary); persistent finish-colored halo at tier 3+; sparkle particles at tier 5; Legendary audio stinger at tier 5 |
| REQ-L-021 | Badges render as a CSS-sculpted metallic disc (radial gradient + inset beveled rim + highlight crescent) with a centered category-specific SVG emblem. One parameterized React component. Finish palette: Bronze (warm copper), Silver (cool neutral), Gold (warm yellow), Platinum (pale cool white-blue), Legendary (iridescent) |
| REQ-L-022 | Hero modal motion: **entry** = scale 0→1 + single ~360° rotation over ~800ms; **ambient** = diagonal shimmer sweep every ~3s + glow-pulse halo at ~2s cycle; **tier-5 only** adds SVG sparkle particles. `prefers-reduced-motion` replaces entry with fade, pauses ambient loops, drops sparkle particles (confetti still fires) |
| REQ-L-023 | Row + detail modal medals render static (no shimmer, no ambient loops). Tier-3+ badges carry a persistent finish-colored halo in the row slot and detail grid; tier-5 halo adds a subtle extra glow |
| REQ-L-024 | Detail modal footer shows `N of M hidden categories` counter |

### 6.2 Should Have (P1)

| # | Requirement |
|---|-------------|
| REQ-L-025 | On narrow viewports, the Current and Best column headers may abbreviate (icon-only or "Cur"/"Best"); numeric cell content is never abbreviated |
| REQ-L-026 | Detail modal displays `earnedAt` date in the tooltip for each earned badge |
| REQ-L-027 | Detail modal header shows a summary count ("14 of 48 earned") |
| REQ-L-028 | Dev mode panel gated to `import.meta.env.DEV` appears in detail modal footer in dev builds only. Controls: reveal-all-`????`, per-badge trigger hero modal, simulate 3-modal cascade, reset `lastSeenBadgeEarnedAt`, audio preview (small/big/legendary), reduced-motion override, view-as-partner, animation replay inside an open hero modal. Panel is tree-shaken out of production bundles |

### 6.3 Nice to Have (P2)

| # | Requirement |
|---|-------------|
| REQ-L-029 | A subtle "complete one today to keep it" hint beside a streak value when the anchor is yesterday (i.e., user is on grace-day) |
| REQ-L-030 | Haptic feedback on mobile on badge unlock — `navigator.vibrate([200, 100, 300])` on the celebration; cap to tier-5 unlocks to keep the cue scarce. iOS Safari ignores the API; degrades silently |
| REQ-L-031 | Animated `????` reveal in the detail modal when the user opens it after a tier-5 unlock — the unearned tile shakes, flashes, then flips to the earned medal artwork. Connects the "mystery" of the placeholder to the "reveal" of the unlock |
| REQ-L-032 | Partner-aware celebration: when one family member unlocks a tier-5 badge, the other member's app surfaces a soft in-app banner ("{Partner} just earned {badgeLabel}") on next leaderboard load. Cheap form: server returns `recentMilestones`; client compares to a per-partner `lastSeenPartnerMilestoneAt` marker in `localStorage`. Real-time form (push notifications via Service Worker) is a separate initiative |

---

## 7. Assumptions

| # | Assumption |
|---|------------|
| 1 | The shipped leaderboard's family-scope filter, attribution rule, subtask credit rule, and timezone handling are unchanged. This BRD inherits all of them from `TASK-MANAGEMENT-BRD.md` §5. |
| 2 | A two-user household does not require cross-device celebration sync. Users who earn a badge on one device and open the app on another will see the badge populated silently. |
| 3 | Per-leaderboard-request recomputation of 48 badge checks plus streak math is cheap at family-scale task volumes (hundreds, not millions of tasks). No caching layer needed for v2. |
| 4 | The metallic disc + SVG emblem system scales to future categories without new design assets per badge — the chassis is one component parameterized by finish, and the emblem icon can come from existing libraries (Tabler, Phosphor) or small custom SVGs. |
| 5 | The audio assets (Small / Big / Legendary stinger) are produced once during implementation; no runtime asset pipeline is required. |
| 6 | The "family-scope" definition used by streaks and badges matches the shipped leaderboard exactly — no divergent scope rules are introduced. |
| 7 | Future categories and/or extending existing 3-tier categories (e.g., adding Volume tier 4/5) requires only catalog entries with a fresh `shippedAt`. No framework or storage changes. The `shippedAt` guard ensures no retroactive celebration cascade. |

---

## 8. Out of Scope

| Item | Rationale |
|------|-----------|
| Leaderboard widget on the dashboard home | Separate initiative; the leaderboard panel remains on the Tasks page only. |
| Comparative badge views (e.g., "both members earned this badge") | Each modal is a personal achievement shelf; competitive badge comparisons would shift the tone away from "motivational, not coldly competitive" (§5.4 of Task Management BRD). |
| **Snooze Buster badge** ("close a task that was snoozed ≥3 times") | Requires a snooze counter or event log on the Task entity; the current `snoozedUntil` field is a single-value visibility modifier that does not track snooze history. Ship once the data model supports it. |
| Other "Firsts" or quirky one-off badges (first task ever, first Monday before 9am, last-minute streak save) | Deferred. Can be added without schema change since all computation is stateless. |
| User-selectable favorite badges to pin to the row | The score-based row selection (§5.1) balances rarity and recency data-drivenly — manual pinning adds UX surface without clear value for a 2-user app. |
| Badge leaderboard (ranking members by badge count) | Tone risk — would reintroduce ranking-table sterility the feature is trying to avoid. |
| Server-side celebration tracking or push notifications on badge unlock | `localStorage` diff is sufficient for in-app celebration. Push notifications are a separate initiative. |
| Retroactive celebration cascade on any deploy | Explicitly suppressed via the v1.0 day-1 seed + per-badge `shippedAt` guard (REQ-L-019). |
| Weighted completions (e.g., bigger tasks count more) | Rejected — matches existing leaderboard's no-weighting assumption; weighting would require a complexity field on the Task entity. |
| Streaks or badges for personal tasks | Family-scope only, matching the shipped leaderboard. Personal tasks remain visible but un-scored. |
| Bespoke per-badge 3D-rendered artwork | The CSS-sculpted metallic disc + SVG emblem system (§4.8) intentionally avoids a design pipeline of 48+ assets. Upgrade to a designed asset pipeline is a separate initiative. |

---

## 9. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Specific audio assets (Small triumphant, Big triumphant, Legendary stinger) | Deferred to implementation |
| 2 | Confetti color palette — one palette for all badges, or tinted by medal finish? | Proposed: tinted by the final-modal's finish color for visual coherence with the audio crescendo. Deferred to implementation. |
| 3 | When a task is moved `done` → `started` → `done`, should the badge's `earnedAt` reflect the first or most recent completion if the task was the threshold-tipping one? | Proposed: most recent `completedAt` (consistent with "transition log is not scanned" rule — §3.3) |
| 4 | Should the Consistency and seasonal (Spring Cleaner, Holiday Hero) badges consider partially-elapsed windows? | Proposed: yes, live during the window. The badge earns on the `completedAt` of the task that tips the threshold. Consistent across all time-windowed categories. |
| 5 | Should the detail modal expose any breadcrumb when a category is hidden (e.g., "earn any task on Saturday to unlock a hint")? | Proposed: no — only the `N of M hidden categories` counter is shown (REQ-L-024). The reveal happens via the first-earn celebration, which is the whole point of the obfuscation |
| 6 | When the other household member earns a tier-5 badge, should it appear in the viewer's celebration flow? | Proposed: no — celebrations only fire on the viewing user's own unlocks (matches per-browser `lastSeenBadgeEarnedAt` semantics). The partner-aware banner (REQ-L-032, P2) is the softer alternative. |
| 7 | Tuning for the recency boost: is `τ = 7 days` and `maxBoost = 10` the right aggressiveness for how long a fresh earn should dominate the row? | Proposed: yes — a fresh tier-3+ earn temporarily outranks older tier-5 for about a week, then rarity dominates again. Tunable in config; lock once live data is observed. |
| 8 | Catalog emblem design — do we source icons from an existing library (Tabler / Phosphor) or commission custom SVGs per category? | Proposed: library first for v2.0 (faster ship, consistent stroke); commission custom emblems in a separate designer pass if the aesthetic falls short. |

---

## 10. Success Criteria

- The leaderboard panel shows Current and Best streak columns for every member, updated in real time with task mutations.
- Today-is-grace semantics are verified end-to-end: a user who completed at least one task yesterday sees their streak number unchanged throughout the following day until they either complete a task (streak advances) or local midnight passes with no completion (streak resets).
- The **48-badge catalog across 15 categories** is exhaustively enumerated in shared types with `tier`, `shippedAt`, and `celebrationCopy` fields, and each definition produces a deterministic earned/not-earned answer from any task dataset.
- First leaderboard load after the v2.0 deploy retroactively populates earned badges for all 15 categories without triggering any celebration modals (v1.0 day-1 seed + per-badge `shippedAt` guard combine to suppress the cascade).
- Shipping a new category or tier in a later deploy populates earned state silently for users who qualify retroactively; only events occurring after the new badge's `shippedAt` trigger the hero modal.
- Each member's row displays up to 3 badges using the score-based selection (`rarity + recencyBoost`), with no ghost placeholders on the row.
- Clicking a member's name or badge slot area opens a **full-screen** per-member detail modal. Earned-in categories show the full tier grid; untouched categories show a collapsed `????` row; footer shows the hidden-categories count.
- Earning a new badge triggers a hero modal; queueing and de-duplication fire the appropriate Small / Big / Legendary audio cue and appropriately-scaled confetti burst per the rules in §4.5.
- Cumulative-tier earns (e.g., a 20-task day earning all three Volume tiers at once) produce exactly **one** modal for that category (the highest tier). Lower tiers appear silently in the row + detail modal.
- Tier-5 unlocks use the Legendary audio stinger, sparkle particles, and persistent Legendary halo. Tier 3 and 4 unlocks use the Big triumphant cue and carry the persistent Gold / Platinum halo in the row + detail modal. Tier 1 and 2 unlocks use Small-if-queued-else-Big and carry no persistent halo.
- Badge state reflects current task data: if a user uncompletes a task that was the sole qualifier for a threshold, the badge disappears on the next load.
- In dev builds only, the detail modal footer exposes the dev panel, and all dev controls (reveal, trigger, cascade, reset, audio preview, reduced-motion, view-as-partner, animation replay) are tree-shaken out of production bundles.
- Personal tasks never contribute to streaks or badges.
