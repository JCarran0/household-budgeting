# Task Leaderboard — Business Requirements Document

**Status:** Draft (v1.0 — streaks & badges)
**Author:** Jared Carrano
**Date:** 2026-04-19
**Version:** 1.0
**Extends:** `docs/features/TASK-MANAGEMENT-BRD.md` §5

---

## 1. Overview

### 1.1 Problem Statement

The leaderboard shipped under Task Management v2.0/v2.1 (see `TASK-MANAGEMENT-BRD.md` §5) counts family-task completions across three fixed windows — today, this week, this month. This is a good *activity snapshot* but a weak *motivator*. The existing BRD already names the desired tone ("motivational and fun, not coldly competitive" — §5.4) and lists celebratory streak/milestone visuals as a Nice-to-Have (REQ-025). Neither was shipped. This BRD delivers on that intent.

### 1.2 Solution Summary

Add two motivational layers on top of the existing leaderboard:

- **Streaks.** A current-streak and best-streak column, measuring the number of consecutive calendar days on which a family member was credited with at least one family-task completion.
- **Badges.** A flat collection of 13 data-driven achievements across four categories (Volume, Consistency, Streak, Lifetime). Unearned badges render as ghost `????` placeholders that pique curiosity without revealing the artwork or threshold.

Both layers compute from existing task data — no new persistence, no migrations. First leaderboard load after deploy retroactively surfaces any badges members have already earned.

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

Thirteen badges across four categories. All thresholds use the same family-scope + attribution rules as the shipped leaderboard (§2).

**Volume — single-day bursts.** Earn when the user is credited with ≥ threshold completions (tasks + subtasks) on a single calendar day (viewer's local TZ).

| ID | Threshold |
|----|-----------|
| `volume_5` | 5 in a day |
| `volume_10` | 10 in a day |
| `volume_20` | 20 in a day |

**Consistency — weekly rhythm.** Earn when the user has at least one credited completion on ≥ threshold days within a single ISO week (Monday–Sunday, viewer's local TZ).

| ID | Threshold |
|----|-----------|
| `consistency_4` | 4 days in a week |
| `consistency_5` | 5 days in a week |
| `consistency_7` | All 7 days in a week |

**Streak — all-time best.** Earn when the user's best streak (§3.3) reaches the threshold. Earned-once; subsequent streaks at the same or lower tier do not re-award.

| ID | Threshold |
|----|-----------|
| `streak_7` | 7-day streak |
| `streak_30` | 30-day streak |
| `streak_100` | 100-day streak |

**Lifetime — cumulative.** Earn when the user's total family-task credit count (tasks + subtasks, family-scope) reaches the threshold.

| ID | Threshold |
|----|-----------|
| `lifetime_10` | 10 delivered |
| `lifetime_50` | 50 delivered |
| `lifetime_100` | 100 delivered |
| `lifetime_500` | 500 delivered |
| `lifetime_1000` | 1000 delivered |

### 4.2 Earning Rules

- **Data-driven.** Badges reflect the user's current task dataset. If the user uncompletes a task (e.g., moves `done` → `started`) and that completion was the sole qualifier for a threshold, the badge disappears on the next leaderboard load. In practice this is vanishingly rare at family scale — the tipping completion would have to be the user's only qualifying event across the entire history. Rationale: keeps the computation fully stateless (REQ-L-010), consistent with the shipped leaderboard's principle that current task state drives current numbers. Badges are a live mirror, not a memorial plaque.
- **Cumulative across tiers.** A single qualifying event earns all lower tiers not yet held. Example: a user who completes 20 tasks in one day and currently holds no Volume badges earns `volume_5`, `volume_10`, and `volume_20` simultaneously.
- **Independent across members.** Each user's badge collection is personal. Two members hitting 50 delivered on the same day both earn `lifetime_50` — there is no "first past the post."
- **No weighting.** Every qualifying completion counts equally (matching the shipped leaderboard's no-weighting assumption, `TASK-MANAGEMENT-BRD.md` §8 #3).

### 4.3 Computation Model

Badges are **stateless — derived from task data on every leaderboard request**, not persisted in a separate collection. For each badge, both "earned?" and "earnedAt?" are computable from the same pass over tasks that the leaderboard already performs:

- **Volume / Consistency / Lifetime:** derivable from the stream of credit events `(userId, timestamp)` produced by scanning tasks and subtasks.
- **Streak-tier badges:** derivable from the same streak computation (§3.3). A badge's `earnedAt` is the `completedAt` of the task that first pushed the best streak to the threshold.

Consequence: no new storage, no schema change, no migration script. The badge catalog is hardcoded in shared types.

### 4.4 Retroactive Awarding

Because computation is stateless, **all badges earned from historical task data appear populated on the first leaderboard load after deploy**. A member with 200+ completed family tasks will see `lifetime_10`, `lifetime_50`, `lifetime_100` populated immediately, along with any day/week bursts that happened to meet thresholds.

No backfill job. No one-shot audit script. The first read *is* the backfill.

### 4.5 Celebration on New Unlock

A newly earned badge triggers a **celebration** distinct from the regular task-done chime. The celebration is tiered:

- **Tier 1 / 2 unlocks** fire a **toast** + fanfare + confetti — quick, dismissible.
- **Final-tier unlocks** (`volume_20`, `consistency_7`, `streak_100`, `lifetime_1000`) fire a **hero modal** instead of a toast — see §4.7.

Common to both:

- **Sound.** A higher-fanfare audio cue, distinct from the task-done chime (commit 39c2245). Rationale: badge unlocks are rarer than task completions and deserve a heavier reward tier.
- **Confetti.** A short confetti animation emitted from the newly-earned badge's position on the leaderboard.

**Detection mechanism:** the client persists a `lastSeenBadgeEarnedAt` marker per user in `localStorage`. On every leaderboard load, the client compares each earned badge's derived `earnedAt` against the marker; newer entries fire celebrations, then advance the marker.

**First-load-after-deploy seed.** On the very first load after shipping this feature, the client sets `lastSeenBadgeEarnedAt` to `now` **before** rendering celebrations. This ensures that retroactively-populated historical badges appear in the collection silently; only badges earned from this point forward trigger fanfare. Without this seed, every existing user would see a cascade of celebrations for badges earned months or years ago.

**Cross-device gap.** `localStorage` is per-browser. A badge earned on phone will not re-celebrate on laptop — it simply appears in the collection. Acceptable for a two-user family app; not worth server-side state to solve.

### 4.7 Final-Tier "Hero" Treatment

The four final-tier badges — one per category — are once-in-an-app-lifetime moments and get extra polish:

- **Tier names instead of counters.** Final-tier `label` values are descriptive titles, not threshold restatements:
  - `volume_20` → **Whirlwind**
  - `consistency_7` → **Perfect Week**
  - `streak_100` → **Centurion**
  - `lifetime_1000` → **Legend**
- **Hero modal on unlock.** Replaces the toast. Centered, blurred backdrop, large badge artwork at the hero size, personalized line ("{displayName}, {description}"), single dismiss button labeled "Heck yeah!". **No auto-close** — the modal stays open until the user dismisses it explicitly.
- **Persistent gold treatment.** Final-tier badges always render with a gold gradient + soft halo box-shadow, in both the per-row badge slot and the per-member detail modal. Distinct from the standard category-tinted variant — once earned, these tiles look "enshrined" forever.
- **Helper.** `isFinalTierBadge(id: BadgeId): boolean` lives in `shared/utils/leaderboardBadgeSlots.ts` and is computed from the per-category max threshold in `BADGE_CATALOG`.

### 4.6 Unearned Badge Rendering (`????` placeholder)

Unearned badges render as a **ghost `????` placeholder** wherever they appear (modal grid, leaderboard row fallback — see §5):

- The badge's artwork is hidden until earned — both the graphic and the threshold label are replaced with `????`.
- Ghost placeholders have **no tooltip**. Hovering reveals nothing.
- The placeholder's **category** is visible (i.e., ghost badges are still grouped under Volume / Consistency / Streak / Lifetime headings in the detail modal), so users can tell which direction to work without knowing the specific threshold.
- Once earned, the placeholder transforms into the final artwork with its tooltip.

Rationale: category grouping preserves enough progression signal (the user sees "I have 2 of 3 Volume badges"), while threshold-hiding preserves surprise. Combined with the fanfare of §4.5, each unlock reveals new information.

---

## 5. Display

### 5.1 Leaderboard Row

Each member's row on the leaderboard panel gains a **badge slot area** rendering up to **3 earned badges**, selected by the following rule:

1. For each of the four categories, determine the user's **highest earned tier** in that category.
2. Take up to 3 of those highest-per-category results.
3. If the user has earned in all 4 categories, drop **Consistency** first (it is the weakest standalone "wow" signal of the four).
4. Tie-break by recency (later `earnedAt` wins).
5. If the user has zero earned badges in a category, display a single `????` ghost for that category in the slot area (up to 3 ghosts, following the same category-priority order).

The slot area is clickable — clicking any badge (earned or ghost) opens the **detail modal** for that member (§5.2).

### 5.2 Detail Modal

Clicking a member's badge slot area or name opens a per-member **badge detail modal** showing the full 13-badge grid:

- **Grouped by category**, in order: Volume, Consistency, Streak, Lifetime.
- Within each category, tiers are displayed in ascending threshold order (left-to-right or top-to-bottom).
- Earned badges render with their artwork and tooltip ("3 tasks completed in a single day"). Tooltip includes the `earnedAt` date.
- Unearned badges render as `????` placeholders with no tooltip (§4.6).
- The modal header shows the member's avatar, display name, and summary counts (total earned / total possible).

No "compare to other members" view, no leaderboard of badges — the modal is a personal achievement shelf.

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
| REQ-L-007 | Badge catalog is a fixed set of 13 hardcoded badges across 4 categories: Volume (5/10/20), Consistency (4/5/7), Streak (7/30/100), Lifetime (10/50/100/500/1000) |
| REQ-L-008 | Badges are data-driven — if a completion that was the sole qualifier for a threshold is reverted, the badge disappears on the next leaderboard load; no separate persistence keeps revoked badges alive |
| REQ-L-009 | A single qualifying event earns all lower tiers in the same category not yet held |
| REQ-L-010 | Badges are computed stateless from existing task data on every leaderboard request; no new persistence collection is introduced |
| REQ-L-011 | Historical badges appear retroactively on the first leaderboard load after deploy (no backfill job required) |
| REQ-L-012 | Unearned badges render as ghost `????` placeholders — no artwork, no tooltip, no threshold label |
| REQ-L-013 | Each leaderboard row displays up to 3 earned badges using the highest-per-category rule with Consistency dropped first on overflow; rows with fewer than 3 categories earned simply render fewer badges (no ghost placeholders on the row — ghosts live only in the detail modal) |
| REQ-L-014 | Clicking a member's row or badge slot area opens a per-member detail modal showing the full 13-badge grid grouped by category |
| REQ-L-015 | Newly earned **tier 1 / 2** badges trigger a celebration: a distinct higher-fanfare sound (not the task-done chime), a confetti animation, and a toast naming the badge |
| REQ-L-016 | Celebration detection uses a `lastSeenBadgeEarnedAt` marker in `localStorage`; the marker is seeded to `now` on the first post-deploy load to suppress the historical-badge cascade |
| REQ-L-024 | Final-tier badges (`volume_20`, `consistency_7`, `streak_100`, `lifetime_1000`) carry hand-picked **tier names** as their `label` ("Whirlwind", "Perfect Week", "Centurion", "Legend") instead of generic threshold restatements |
| REQ-L-025 | Final-tier unlocks fire a **hero modal** instead of a toast: centered, blurred backdrop, large badge artwork, personalized line ("{displayName}, {description}"), single dismiss button. **No auto-close** — the modal stays open until the user dismisses it explicitly |
| REQ-L-026 | Final-tier badges render with a persistent gold-gradient + soft halo treatment in both the per-row badge slot and the per-member detail modal — the special look does not fade after the unlock moment |

### 6.2 Should Have (P1)

| # | Requirement |
|---|-------------|
| REQ-L-017 | On narrow viewports, the Current and Best column headers may abbreviate (icon-only or "Cur"/"Best"); numeric cell content is never abbreviated |
| REQ-L-018 | Detail modal displays `earnedAt` date in the tooltip for each earned badge |
| REQ-L-019 | Detail modal header shows a summary count ("7 of 13 earned") |

### 6.3 Nice to Have (P2)

| # | Requirement |
|---|-------------|
| REQ-L-020 | A subtle "complete one today to keep it" hint beside a streak value when the anchor is yesterday (i.e., user is on grace-day) |
| REQ-L-021 | Haptic feedback on mobile on badge unlock — `navigator.vibrate([200, 100, 300])` on the celebration; cap to final-tier unlocks to keep the cue scarce. iOS Safari ignores the API; degrades silently. |
| REQ-L-022 | Animated `????` reveal in the detail modal when the user opens it after a final-tier unlock — the unearned tile shakes, flashes, then flips to the earned artwork. Connects the "mystery" of the placeholder to the "reveal" of the unlock. |
| REQ-L-023 | Partner-aware celebration: when one family member unlocks a final-tier badge, the other member's app surfaces a soft in-app banner ("{Partner} just earned Legend") on next leaderboard load. Cheap form: server returns `recentMilestones`; client compares to a per-partner `lastSeenPartnerMilestoneAt` marker in `localStorage`. Real-time form (push notifications via Service Worker) is a larger lift and a separate initiative. |

---

## 7. Assumptions

| # | Assumption |
|---|------------|
| 1 | The shipped leaderboard's family-scope filter, attribution rule, subtask credit rule, and timezone handling are unchanged. This BRD inherits all of them from `TASK-MANAGEMENT-BRD.md` §5. |
| 2 | A two-user household does not require cross-device celebration sync. Users who earn a badge on one device and open the app on another will see the badge populated silently. |
| 3 | Per-leaderboard-request recomputation of 13 badge checks plus streak math is cheap at family-scale task volumes (hundreds, not millions of tasks). No caching layer needed for v1. |
| 4 | Badge artwork does not need to be internationalized or themed. A single set of graphics ships with the app. |
| 5 | The audio/confetti assets for celebrations are produced once during implementation; no runtime asset pipeline is required. |
| 6 | The "family-scope" definition used by streaks and badges matches the shipped leaderboard exactly — no divergent scope rules are introduced. |

---

## 8. Out of Scope

| Item | Rationale |
|------|-----------|
| Leaderboard widget on the dashboard home | Separate initiative; the leaderboard panel remains on the Tasks page only. |
| Comparative badge views (e.g., "both members earned this badge") | Each modal is a personal achievement shelf; competitive badge comparisons would shift the tone away from "motivational, not coldly competitive" (§5.4 of Task Management BRD). |
| "Firsts" or quirky badges (first task ever, first Monday before 9am, last-minute streak save) | Deferred. Can be added without schema change since all computation is stateless. |
| User-selectable favorite badges to pin to the row | Highest-per-category is sufficient for v1. User preference adds UX surface without clear value for a 2-user app. |
| Badge leaderboard (ranking members by badge count) | Tone risk — would reintroduce ranking-table sterility the feature is trying to avoid. |
| Server-side celebration tracking or push notifications on badge unlock | `localStorage` diff is sufficient for in-app celebration. Push notifications are a separate initiative. |
| Retroactive toast spam on the first post-deploy load | Explicitly suppressed via the `lastSeenBadgeEarnedAt` seed (REQ-L-016). |
| Weighted completions (e.g., bigger tasks count more) | Rejected — matches existing leaderboard's no-weighting assumption; weighting would require a complexity field on the Task entity. |
| Streaks or badges for personal tasks | Family-scope only, matching the shipped leaderboard. Personal tasks remain visible but un-scored. |

---

## 9. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Specific audio asset for the unlock fanfare | Deferred to implementation |
| 2 | Confetti color palette — one palette for all badges, or per-category colors? | Deferred to implementation |
| 3 | When a task is moved `done` → `started` → `done`, should the badge's `earnedAt` reflect the first or most recent completion if the task was the threshold-tipping one? | Proposed: most recent `completedAt` (consistent with "transition log is not scanned" rule — §3.3) |
| 4 | Should the Consistency badges consider partially-elapsed weeks (e.g., today is Wednesday with 3 days so far this week — is that progress toward a 4-day badge)? | Proposed: yes, but only observable retroactively after the week closes. The 4/5/7-day badge earns on the timestamp of the day that tips the threshold during the live week. |
| 5 | Does the modal show locked tier thresholds at any point (e.g., "next Lifetime: ???") | Proposed: no — `????` is the threshold label for unearned badges to preserve surprise |
| 6 | Should the celebration toast include the member avatar when another household member earns the badge? | Proposed: no — celebrations only fire on the viewing user's own unlocks (matches per-browser `lastSeenBadgeEarnedAt` semantics) |

---

## 10. Success Criteria

- The leaderboard panel shows Current and Best streak columns for every member, updated in real time with task mutations.
- Today-is-grace semantics are verified end-to-end: a user who completed at least one task yesterday sees their streak number unchanged throughout the following day until they either complete a task (streak advances) or local midnight passes with no completion (streak resets).
- The 13-badge catalog is exhaustively enumerated in shared types and each definition produces a deterministic earned/not-earned answer from any task dataset.
- First leaderboard load after deploy retroactively populates existing members' earned badges without triggering celebration toasts.
- Each member's row displays up to 3 badges per the highest-per-category rule; `????` ghost placeholders fill slots where the member has no earned badge in the category.
- Clicking a member's name or badge slot area opens a per-member detail modal with the full 13-badge grid grouped by category.
- Earning a new badge triggers fanfare audio, confetti animation, and a toast — distinct from the existing task-done chime.
- Badge state reflects current task data: if a user uncompletes a task that was the sole qualifier for a threshold, the badge disappears on the next load. (In practice, nearly every real-world uncomplete leaves the badge intact because other qualifying completions remain.)
- Personal tasks never contribute to streaks or badges.
