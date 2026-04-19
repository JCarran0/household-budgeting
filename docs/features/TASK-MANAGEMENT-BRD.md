# Household Task Management — Business Requirements Document

**Status:** Draft (v2.0 enhancements)
**Author:** Jared Carrano
**Date:** 2026-04-19 (v2.0); originally 2026-04-11 (v1.0)
**Version:** 2.0

---

## 1. Overview

### 1.1 Problem Statement

The household has no shared system for tracking chores, errands, and to-dos. Tasks are communicated verbally, forgotten, or tracked in disparate personal tools. There is no visibility into who is doing what, no accountability for follow-through, and no way to recognize contribution over time.

### 1.2 Solution Summary

Add a **Kanban-style task board** to the app where family members can create, assign, and track household tasks through a simple status workflow. A **leaderboard** provides lightweight gamification around task completion. **Task templates** enable one-tap creation of frequently repeated tasks. Tasks are scoped as either family-visible or personal, with personal tasks visually distinguished but not hidden.

**v2.0 extends the feature** with:
- A **Checklist view** — an alternate presentation optimized for rapid entry and reordering, especially on mobile.
- **Snooze** — the ability to temporarily hide a task until a chosen date.
- **Manual vertical reorder** within Kanban columns.
- A layout change that **retires the Cancelled column** in favor of per-card cancel actions.
- A leaderboard scope change: **only family tasks count**.

### 1.3 Users

All family members. This feature builds on the Family & Multi-User model (see FAMILY-MULTI-USER-BRD.md). Every family member can create, edit, assign, and complete any family task.

### 1.4 Relationship to Financial Data

Tasks may carry a **project tag** (see PROJECTS-BRD.md §4.5) to associate a task with a home project for contextual grouping. This association is display-only — it allows a project's tasks to be viewed alongside the project's spending in the project detail view, and it allows a task card to show a chip linking back to its project. Beyond this tag-based grouping, tasks have no connection to transactions, budgets, categories, or any financial entity.

---

## 2. Concepts

### 2.1 Task

A task is a unit of work to be done by a family member.

| Property | Required | Description |
|----------|----------|-------------|
| **Title** | Yes | Short description of what needs to be done |
| **Status** | Yes | Current state: `todo`, `started`, `done`, `cancelled` (default: `todo`) |
| **Scope** | Yes | `family` or `personal` (default: `family`) |
| **Assignee** | No | The family member responsible for the task |
| **Due date** | No | When the task should be completed |
| **Description** | No | Additional detail or context |
| **Subtasks** | No | Ordered list of checklist items beneath the parent (see §2.6) |
| **Tags** | No | Free-form labels; includes project tags (see §1.4) |
| **Snoozed until** | No | ISO datetime at which the task re-emerges; null if not snoozed (see §2.7) |
| **Sort order** | Yes | Fractional float used for manual ordering within a status (see §3.1.5) |

### 2.2 Scope

| Scope | Board Visibility | Leaderboard | Editable By |
|-------|-----------------|-------------|-------------|
| **Family** | Visible to all family members | Counts for the assignee (or completer if unassigned — see §5.3) | Any family member |
| **Personal** | Visible to all family members, **visually distinguished** (e.g., dimmed, badge, or subtle indicator) | Does not count (see §5.3) | Any family member |

Personal tasks are never hidden. All family members can see all tasks. The visual distinction communicates "this is someone's personal item" without creating information silos.

### 2.3 Status Workflow

```
         ┌──────────────────────────┐
         │                          │
         ▼                          │
┌──────────────┐   ┌─────────┐   ┌──────┐
│     Todo     │──▶│ Started │──▶│ Done │
└──────────────┘   └─────────┘   └──────┘
         │              │
         │              │
         ▼              ▼
   ┌─────────────┐
   │  Cancelled  │
   └─────────────┘
```

- A task can move from `todo` to `started`, `done`, or `cancelled`.
- A task can move from `started` to `done` or `cancelled`.
- A task can move backward (e.g., `started` → `todo`) to correct mistakes.
- There are no enforced restrictions on transitions — any status can move to any other status.

**v2.0 change — cancellation UX:** `cancelled` remains a valid end state, but it is no longer reachable via a Kanban column (see §3.1). Cancel is triggered explicitly via the card kebab menu or the task detail view, each with a confirmation dialog. Checklist view checkboxes never produce a cancellation — they toggle between `todo`, `started`, and `done` only.

### 2.4 Transition Log

Every status change is recorded as a timestamped entry in a transition log on the task.

| Field | Description |
|-------|-------------|
| `fromStatus` | Status before the change |
| `toStatus` | Status after the change |
| `timestamp` | When the change occurred |
| `userId` | Who made the change |

The transition log is append-only. It is never edited or truncated. In addition to the log, the task stores convenience timestamps that reflect the **most recent** transition to each state:

| Field | Set When |
|-------|----------|
| `createdAt` | Task is created |
| `createdBy` | User who created the task |
| `startedAt` | Most recent transition to `started` (see §3.2.2 for the Checklist synthetic-start case) |
| `completedAt` | Most recent transition to `done` |
| `cancelledAt` | Most recent transition to `cancelled` |
| `assignedAt` | Assignee is set or changed |

Snoozing a task (setting or clearing `snoozedUntil`) is **not** a status change and produces **no** transition log entry (see §2.7).

### 2.5 Task Template

A task template is a pre-configured shortcut for creating tasks that are repeated frequently (e.g., "Laundry", "Mow Lawn", "Grocery Run").

| Property | Required | Description |
|----------|----------|-------------|
| **Name** | Yes | Template name, used as the task title on creation |
| **Default assignee** | No | Pre-filled assignee (if blank, task is created unassigned) |
| **Default scope** | No | Pre-filled scope (defaults to `family`) |

A template does not include due date or description — those vary per instance.

### 2.6 Subtasks

A task may contain zero or more **subtasks** — ordered checklist items beneath the parent.

| Property | Description |
|----------|-------------|
| `id` | UUID |
| `title` | Subtask title |
| `completed` | Boolean |
| `completedAt` | ISO datetime stamped server-side when `completed` transitions false → true; null otherwise. Client-supplied values are ignored. |
| `completedBy` | userId stamped server-side alongside `completedAt`; null when unchecked. |

Subtasks are:
- **Ordered.** Order is persisted on the parent task and is family-wide (shared).
- **Binary.** Subtasks have no `started` state — only `completed: true | false`.
- **Not independently assigned, scoped, or dated.** All metadata lives on the parent.
- **Counted on the leaderboard (v2.1+).** Each checked subtask on a family-scope parent contributes one additional point, attributed under the same rule as parent tasks (parent's `assigneeId` when set, else `completedBy`). Unchecking removes the point.
- **Displayed indented** beneath their parent in Checklist view (§3.2).
- **Displayed as a progress counter** ("2/5 complete") on Kanban cards.

Completing all subtasks does **not** auto-complete the parent. The two signals are independent — a user must explicitly mark the parent done.

### 2.7 Snooze

A task may be **snoozed** — temporarily hidden from default views until a chosen date.

| Property | Description |
|----------|-------------|
| `snoozedUntil` | ISO datetime; null when not snoozed |

**Model:**
- Snooze is a **visibility modifier**, not a workflow status. The task's underlying `status` is preserved across snooze/unsnooze.
- Snooze and unsnooze produce **no transition log entry** — the log is reserved for real status changes.
- A snoozed task is hidden from the default Kanban board and Checklist view. It re-emerges automatically on the next view load once `snoozedUntil <= now`.
- Snooze expiry is evaluated on view load — no server-side scheduler is required (see §8.8).
- Un-snooze (automatic or manual) restores the task to its original `sortOrder`, **not** the top of the destination column (see §3.1.3).
- Completing or cancelling a snoozed task auto-clears `snoozedUntil`.
- Snooze preserves `assigneeId`, `assignedAt`, `startedAt`, `sortOrder`, `scope`, and `tags`. Only `snoozedUntil` is touched.

**Snooze options** (from the card kebab menu "Snooze" submenu or the task detail view):

| Option | Resolves to |
|--------|-------------|
| Tomorrow | Next day at 06:00 local time |
| Next week | The next Monday at 06:00 local time; if today is Monday, the following Monday (always +7 days) |
| Next month | The 1st of the following month at 06:00 local time; if today is the 1st, the 1st of the month after (never same-day) |
| Custom | User-chosen date (date picker only — no time picker); time auto-set to 06:00 local |

**Snooze availability:**
- Allowed on `todo` and `started`.
- Disallowed on `done` and `cancelled` — snooze UI is hidden/disabled on these.

---

## 3. Views

Task data is presented in two interchangeable views: **Kanban Board** (§3.1) and **Checklist View** (§3.2). Both read and write the same underlying task records. The active view is a user preference persisted per user.

### 3.1 Kanban Board

#### 3.1.1 Layout

The board displays **three columns** by default, corresponding to the three active statuses:

| Todo | Started | Done |

A **"Show snoozed"** toggle in the board header reveals a fourth column, **Snoozed**, populated with tasks whose `snoozedUntil > now`. Toggle state is persisted per user.

The Cancelled column from v1.0 is retired. Cancel is triggered via per-card actions (§2.3); cancelled tasks live only in Task History (§6).

#### 3.1.2 Task Cards

Each card displays:

- Task title
- Assignee (avatar or name, if assigned)
- Due date (if set, with overdue indicator when past due)
- Scope badge (visual indicator for personal tasks only — family tasks have no badge since family is the default)
- Subtask progress counter ("2/5") if subtasks exist
- Project chip if a project tag is present (see REQ-017b)
- **Snoozed column only:** a "Returns in X" chip showing time until `snoozedUntil`
- **Kebab menu** (three-dot icon) exposing: Snooze ▸ submenu, Cancel task, Edit (opens detail view)

#### 3.1.3 Drag Behavior

Cards are draggable between columns **and vertically within a column** (v2.0 addition).

| Action | Result |
|--------|--------|
| Drag **unassigned** task from Todo to Started | Status changes to `started` **and** task is auto-assigned to the user who dragged it |
| Drag **assigned** task from Todo to Started | Status changes to `started`, assignee unchanged |
| Drag task between any other columns (except Done/Snoozed as noted below) | Status changes to the target column's status, assignee unchanged |
| Drag task vertically within Todo or Started | `sortOrder` is updated to the new position (fractional indexing) |
| Drop task at the **top** of a manually-sorted column | `sortOrder` floats above current minimum |
| Drop task at the **bottom** of a manually-sorted column | `sortOrder` falls below current maximum |
| Drop task between two siblings | `sortOrder` set to midpoint |
| Status change from any **non-drag** source (kebab menu, Checklist checkbox, detail view) | Task lands at the **top** of the destination column |
| Drop on Done column | Position determined by `completedAt DESC` (manual order in Done is not supported) |
| Drop on Snoozed column | Not supported — snooze is set via menu, not drag |
| Any family member can drag any task | No ownership restrictions on status changes |

**Auto-unsnooze exception:** When `snoozedUntil` expires and the task re-emerges, it is placed at its **original `sortOrder`** in the destination column (not top). This prevents long-snoozed tasks from leapfrogging newer priorities.

#### 3.1.4 Board Archiving

| Status | When archived off the board |
|--------|-----------------------------|
| `done` | 14 days after `completedAt` |
| `cancelled` | Immediately — cancelled tasks never appear on the Kanban board |

Archived tasks remain in the system and are accessible through the **Task History** view (§6).

#### 3.1.5 Column Sort Behavior

| Column | Sort |
|--------|------|
| Todo | Manual (`sortOrder` ASC) |
| Started | Manual (`sortOrder` ASC) |
| Done | Auto (`completedAt` DESC) — manual reorder disabled |
| Snoozed (when toggle on) | Auto (`snoozedUntil` ASC) — nearest expiry first; manual reorder disabled |

**`sortOrder` properties:**
- Fractional float (supports midpoint insertion without renumbering siblings).
- **Family-wide** — shared by all family members.
- **Scoped per status** — ordering is independent across Todo and Started. A task's `sortOrder` is preserved when it transitions between statuses but is interpreted only within the current status's column.
- **Shared with Checklist view** — the same field drives Kanban column order and Checklist active-list order (see §3.2.4).

#### 3.1.6 Filtering

The board supports filtering by:

| Filter | Behavior |
|--------|----------|
| Assignee | Show only tasks assigned to a specific family member (or unassigned) |
| Scope | Show only family tasks, only personal tasks, or all |
| Tags | Show only tasks that include all selected tags |

The filter bar lives in the **page header row** (next to the Board/History and Kanban/Checklist toggles) and applies uniformly to both Kanban and Checklist views.

Default view: all tasks (family + personal, all assignees). The "Show snoozed" control is a toggle, not a filter — in Kanban it adds the Snoozed column; Checklist surfaces snoozed tasks via its own collapsible accordion and is unaffected.

**Filter-inherited creation defaults.** To avoid the "where did my task go?" surprise when a freshly created task is hidden by the current filters, tasks created on the board inherit the filter values as defaults:

- **Assignee** — the filter's assignee when set (including the Unassigned filter); otherwise defaults to the **current user**.
- **Scope** — the filter's scope when narrowed to Family or Personal; otherwise the entity default (`family`).
- **Tags** — the currently filtered tags are pre-applied.

Users may override these in the full creation form. Checklist quick entry has no form surface, so the inherited defaults are applied silently.

**Hidden-by-filters fallback.** When the user overrides a pre-filled default and the resulting task would be hidden by the current filters (full creation form path only), a toast is shown: *"Task created — hidden by current filters"* with a one-click **Clear filters** action that resets Assignee, Scope, and Tags.

### 3.2 Checklist View

The Checklist view is a Google Keep–inspired flat list, optimized for rapid keyboard entry on both desktop and mobile. The initial v2.0 two-checkbox design proved cluttered in use — the redesign below replaces it with a single forward-progressing action button, removes placeholder metadata chips, and makes new-row creation implicit (no sticky "+ Add" input).

#### 3.2.1 Layout

Tasks render as a single flat list, top-to-bottom, with three zones:

- **Active tasks** (status `todo` or `started`) at the top, ordered by `sortOrder` ASC.
- A **blank "ghost row"** at the bottom of the active list. It renders as a faint placeholder and becomes an active input the moment the user clicks into it or Tabs to it. A new ghost row regenerates automatically after each new task is saved.
- Below the active list, a **collapsed accordion** labeled **"Completed (N)"**. Count always visible; list hidden until expanded. When expanded: tasks sorted by `completedAt` DESC, subject to the same 14-day archive window as Kanban. Accordion state is persisted per user.

Not surfaced in Checklist:

- **Cancelled tasks** — live only in Task History.
- **Snoozed tasks** — appear only in the Kanban Snoozed column (via "Show snoozed" toggle).

#### 3.2.2 Row Anatomy

The visual hierarchy mimics a paper checklist: minimal per-row chrome, content forward. Each **active task row** shows, left to right:

1. **Action button** — the single control that advances the task's status:
   - Status `todo` → button label **"Start"**. Click → status becomes `started`.
   - Status `started` → button label **"Done"**. Click → status becomes `done`, and if `startedAt` was previously null, `startedAt` is auto-stamped equal to `completedAt` (see "synthetic start" below).
   - The button only moves a task forward. To send a task backward (e.g. `started` → `todo`), use the kebab menu → "Move to todo" / "Reopen".
2. **Title** — always an inline-editable text input (click anywhere in the text to place a cursor).
3. **Metadata chips** — rendered **only when the value is set**:
   - Assignee avatar (if any).
   - Due date chip with overdue indicator (if any).
   - Project chip (if tagged).
   - No placeholder "+ assignee" / "+ due" chips — absent values are represented by absence, not by a call-to-action.
4. **Kebab menu** (appears on row hover/focus) — all field editing, backwards moves, Snooze, Cancel, and full Edit live here:
   - Set/change assignee
   - Set/change due date
   - Snooze ▸ submenu (Tomorrow / Next week / Next month / Custom)
   - Move to todo (if `started`) / Reopen (if `done`)
   - Cancel task (with confirm dialog)
   - Edit… (opens full detail modal)

**Subtasks** render **indented** beneath their parent (increased left padding; faint vertical guide line to the parent). Subtasks keep the current binary model:

- A simple **checkbox** on the left (no Start/Complete button, no kebab metadata — subtasks are intentionally lightweight).
- Title is inline-editable.
- A small × delete control on hover.
- Subtasks have no status, no assignee, no due date, no snooze. If a subtask needs rich state, the user promotes it to a top-level task (see §3.2.3 Tab behavior).

Subtasks belong to their parent's `subTasks[]` array. They are NOT independent `Task` entities — this keeps the data model unchanged from v2.0.

**Completed section** — tasks with status `done` that have moved out of the active list render here:

- Strikethrough title.
- A small check glyph where the action button was.
- Kebab menu remains (Reopen, Cancel, Edit).
- Sorted by `completedAt` DESC; subject to the 14-day archive window.
- Clicking "Done" on an active row **immediately removes it from the active list and inserts it into the Completed section**; the visual transition should be obvious (animate out of active, into completed) so the user confirms the state change.

**Synthetic start:** When "Done" is clicked on a `todo` task (i.e., `startedAt` was null), the task jumps `todo` → `done`. The transition log records the real `fromStatus: 'todo', toStatus: 'done'` entry. A synthetic `startedAt` equal to `completedAt` is stamped on the record so downstream consumers can rely on `startedAt` being non-null for any done task. No synthetic `started` transition is written to the log.

#### 3.2.3 Quick Entry

There is **no separate "+ Add task" input**. Entry happens inline, driven from the active-task rows themselves plus the trailing ghost row.

| Key | Context | Behavior |
|-----|---------|----------|
| **Enter** | Cursor at end of a **top-level** task title | Save current title; insert a **new empty top-level row** immediately **after the current task's subtree** (i.e., below the parent and all of its subtasks); focus the new row. The new task's `sortOrder` sorts between the current task and the next top-level task. |
| **Enter** | Cursor at end of a **subtask** title | Save current title; insert a **new empty subtask row** below, under the same parent; focus the new row. |
| **Enter** | Cursor **mid-title** | Save current title; insert a new empty row below. **Do not split the title text.** The cursor-original line keeps all of its text; the new row starts blank. |
| **Enter** | Empty row (no characters typed) | **Auto-promote** the empty row to top-level and stay focused. If already top-level, no-op. Exits the repeated-Enter-creates-blank-rows loop cleanly. |
| **Tab** | Empty new-row line | Demote to subtask of the task above (same as v2.0). |
| **Shift-Tab** | Empty subtask line | Promote to top-level task (same as v2.0). |
| **Escape** | Any row | Blur the input; save whatever is typed (if non-empty); abandon pending new-row creation. |

**Scope note:** Tab and Shift-Tab affect **empty new-row lines only**. Using Tab/Shift-Tab to promote or demote an **existing non-empty task** is out of scope for this iteration — users who want to reparent a task do so by deleting and re-typing, or by using drag-to-reorder. (Decision D21 below.)

Tasks created via quick entry are saved in `todo` status with the current user as `createdBy` and no due date. **Assignee, scope, and tags are inherited from the board filter bar** (see §3.1.6 "Filter-inherited creation defaults") — with assignee falling back to the current user when no filter is set. Blurring or clicking elsewhere saves whatever is typed (if non-empty); empty rows are discarded.

**Mobile accommodation:** On mobile browsers where Tab may not be exposed on the on-screen keyboard, a small **indent/outdent button pair** is rendered next to the focused line, providing equivalent functionality.

#### 3.2.4 Reorder

Tasks can be reordered by drag — each row exposes a drag handle on hover (desktop) or via long-press (mobile).

- Reordering updates `sortOrder` (fractional indexing — see §3.1.5).
- `sortOrder` is shared with Kanban: reorder in either view is reflected in both.
- **Subtask reorder** within a parent is also supported via drag. Subtask order is persisted on the parent task's `subTasks` array.
- Reorder is **disabled** inside the Completed accordion (auto-sorted by `completedAt` DESC).

#### 3.2.5 Inline Edit

- Task titles are always inline-editable — no explicit "click to edit" affordance; the row IS a text input styled to look like plain text.
- Edits autosave on blur, on Enter (which also creates a new row — see §3.2.3), or after a short debounce during typing.
- Metadata (assignee, due date, description, etc.) is edited exclusively through the kebab menu. There are no inline metadata pickers in the default row chrome.
- The full detail modal (kebab → Edit…) remains available for editing description, tags, full sub-task list, and other fields not exposed on the row.

---

## 4. Task Creation

### 4.1 Full Creation Form

The full task creation form collects all task properties (title, assignee, due date, scope, description). Status defaults to `todo` and is not selectable during creation. On open, the form pre-fills the assignee, scope, and tags from the current board filter bar (see §3.1.6) — with assignee falling back to the current user when no assignee filter is set. All pre-fills are editable. If the user overrides the pre-fills and the submitted task does not match current filters, a *"hidden by filters"* toast with a **Clear filters** action is shown.

### 4.2 Split Button — Create Task

The primary task creation control is a **split button**:

- **Primary click:** Opens the full creation form (Section 4.1)
- **Dropdown menu:** Lists all saved task templates as one-click actions. Selecting a template instantly creates a task in the `todo` column with the template's pre-configured values. No form is shown — the task appears on the board immediately.
- **Dropdown footer:** A "Manage Templates..." link that opens the template management view (Section 4.3)

### 4.3 Template Management

Template management is accessible from the split button dropdown. It provides:

- A list of all saved templates
- Ability to create a new template (name, default assignee, default scope)
- Ability to edit an existing template
- Ability to delete a template (with confirmation)
- Ability to reorder templates (controls display order in the dropdown)

### 4.4 Quick Entry (Checklist View)

See §3.2.3. Checklist quick entry is the fastest creation path for simple tasks and is the preferred path on mobile.

---

## 5. Leaderboard

### 5.1 Location

The leaderboard is a **collapsible panel** on the Tasks page. It is visible by default but can be collapsed to maximize board space.

### 5.2 Metrics

The leaderboard shows **family tasks** completed (status changed to `done`) per family member across three time windows:

| Period | Description |
|--------|-------------|
| Today | Family tasks completed since midnight (user's local time) |
| This week | Family tasks completed since the most recent Monday |
| This month | Family tasks completed since the 1st of the current month |

Each family member's count is displayed. The member with the highest count in each period is visually highlighted.

### 5.3 Counting Rules (**v2.0 change**)

- **Only tasks with `scope === 'family'` count toward the leaderboard.** Personal tasks are **excluded entirely** — they do not count for the owner, the completer, or any family member.
- A family task counts toward the leaderboard of its **assignee** when one is set; if unassigned, it falls through to the user who moved it to `done`.
- If a task is moved to `done`, then back to `started`, then to `done` again, it counts **once** — based on the most recent `completedAt` timestamp.
- **Subtasks (v2.1+) contribute independently.** Each checked subtask on a family-scope parent scores **one point** attributed under the same rule: the parent's `assigneeId` when set, else the user who checked the subtask (`completedBy`). Unchecking the subtask removes the point. Legacy subtasks that were checked before this feature shipped (no `completedAt` stamp) are not retroactively credited.

> **v1.0 → v2.0 behavior change:** In v1.0 personal tasks counted toward the owner's totals. They no longer count anywhere. See §9 for rationale.
>
> **v2.0 → v2.1 behavior change:** v2.0 attributed completions to whoever clicked Done. v2.1 attributes to the assignee when set, falling back to the completer only when no assignee is recorded. Rationale: in a shared household board one spouse often checks tasks off on the other's behalf, which hoarded credit under the v2.0 rule.
>
> **v2.1 addition:** Subtasks now count toward the leaderboard (one point per checked subtask, same attribution rule). Rationale: subtasks represent real completed work and excluding them under-counted members whose completions were dominated by checklist progress on long-running parent tasks.

### 5.4 Tone

The leaderboard should feel **motivational and fun**, not coldly competitive. Visual design and any copy should lean encouraging (e.g., streak indicators, celebratory icons for milestones) rather than ranking-table sterile.

---

## 6. Task History

### 6.1 Purpose

Task History provides access to all tasks that have been archived off the board (completed more than 14 days ago or cancelled at any point) as well as a searchable log of all tasks regardless of status.

### 6.2 View

A filterable, sortable list (not Kanban) showing:

- Task title
- Status
- Assignee
- Completed/cancelled date
- Created date

### 6.3 Filters

| Filter | Options |
|--------|---------|
| Status | Any, done, cancelled, todo, started |
| Assignee | Any family member, unassigned |
| Scope | Family, personal, all |
| Date range | Filter by `completedAt` / `cancelledAt` / `createdAt` |

### 6.4 Detail View

Clicking a task in history opens a detail view showing all task properties and the full transition log.

### 6.5 Recovery

A cancelled or archived done task can be moved back to `todo` or `started` from the detail view. Recovery restores the task to the active board/checklist at the **top** of the destination column (non-drag status change; see §3.1.3).

---

## 7. Requirements Summary

### 7.1 Must Have (P0)

| # | Requirement |
|---|-------------|
| REQ-001 | Task entity with title, status, scope, assignee, due date, description, tags, subtasks, `snoozedUntil`, and `sortOrder` |
| REQ-002 | Four statuses: `todo`, `started`, `done`, `cancelled` — with unrestricted transitions |
| REQ-003 | Kanban board with **three active columns** (Todo, Started, Done); no Cancelled column |
| REQ-004 | Drag-and-drop to change task status between columns |
| REQ-005 | Dragging an unassigned task from Todo to Started auto-assigns to the dragging user |
| REQ-006 | Dragging an already-assigned task preserves the existing assignee |
| REQ-007 | Any family member can move any task to any status |
| REQ-008 | Full transition log recording every real status change with from, to, timestamp, and userId. Snooze/unsnooze does not produce a log entry |
| REQ-009 | Convenience timestamps: `createdAt`, `createdBy`, `startedAt`, `completedAt`, `cancelledAt`, `assignedAt` |
| REQ-010 | Scope field: `family` (default) or `personal` |
| REQ-011 | Personal tasks visually distinguished on the board but visible to all family members |
| REQ-012 | `done` tasks archive from the board after 14 days; `cancelled` tasks archive **immediately** (never appear on board; live only in Task History) |
| REQ-013 | Task History view for accessing archived and all historical tasks; supports recovery back to active status |
| REQ-014 | Full task creation form (title, assignee, due date, scope, description) |
| REQ-015 | Leaderboard showing family tasks completed per family member: today, this week, this month |
| REQ-016 | **Leaderboard counts only family-scope tasks and their subtasks.** Parent tasks attributed to `assigneeId` when set, otherwise to the user who moved the task to `done`. Each checked subtask contributes one additional point under the same rule (parent's `assigneeId` when set, otherwise `completedBy`). Legacy subtasks without a `completedAt` stamp are not retroactively credited. Personal tasks are excluded entirely |
| REQ-017 | Tasks page accessible from sidebar navigation |
| REQ-017a | Tasks support a project tag in their `tags` array for contextual grouping (see PROJECTS-BRD.md §4.5); tag is applied via a project picker, not free-text entry |
| REQ-017b | Task cards and task detail view display a project chip that navigates to the associated project when a project tag is present |
| REQ-017c | Cancel action is available via (a) the card kebab menu and (b) the task detail view, each with a confirmation dialog. Drag-to-cancel is not supported |
| REQ-027 | Subtasks are first-class and documented: ordered (family-wide), binary (complete/incomplete), indented under parent in Checklist view, shown as a progress counter on Kanban cards. Completing all subtasks does not auto-complete the parent |
| REQ-028 | Checklist view — alternate flat-list presentation of tasks with active tasks at top and a collapsed "Completed (N)" accordion below |
| REQ-029 | Checklist row has a **single forward-only action button** — label "Start" when `todo`, "Done" when `started`. Clicking advances status (todo → started → done). The button does not move tasks backward; reversals happen via the kebab menu. Clicking "Done" on a `todo` task auto-stamps `startedAt = completedAt` (no synthetic transition log entry) |
| REQ-029a | After status reaches `done`, the row is **removed from the active list and inserted into the "Completed (N)" accordion** immediately. The Completed section sorts by `completedAt` DESC and is subject to the 14-day archive window |
| REQ-029b | Subtasks in Checklist keep the current binary model: a single checkbox per subtask (no Start/Complete button, no kebab, no status). Subtasks are not independent `Task` entities — they live in the parent's `subTasks[]` array |
| REQ-029c | Metadata chips (assignee, due date, project) render on a Checklist row **only when the value is set**. No placeholder "+ assignee" / "+ due" chips. Setting or changing metadata happens through the kebab menu |
| REQ-030 | Checklist quick-entry is driven from inline-editable task titles, not a separate input. Pressing **Enter** in a task title saves the current line and inserts a new empty row at the appropriate position: top-level → immediately after the current task's subtree (i.e., below its subtasks); subtask → immediately after the current subtask under the same parent. Enter mid-title does **not** split text — the new row starts blank |
| REQ-030a | **Tab** on an **empty** new-row line demotes it to a subtask of the task above. **Shift-Tab** on an empty subtask line promotes it to a top-level task. Tab/Shift-Tab on non-empty existing tasks is **out of scope** for v2.1 — users reparent via delete/retype or drag |
| REQ-030b | **Enter on an empty row auto-promotes it to top-level** (if it was a subtask). Repeated Enter on an empty top-level row is a no-op |
| REQ-030c | There is **no sticky "+ Add task" input**. A faint trailing "ghost row" at the bottom of the active list becomes the active input on click/focus; a fresh ghost row regenerates after each save |
| REQ-031 | Checklist supports drag-to-reorder for top-level tasks and for subtasks within a parent |
| REQ-032 | Checklist hides cancelled and snoozed tasks entirely (both surface only via their dedicated paths: Task History for cancelled, Kanban "Show snoozed" toggle for snoozed) |
| REQ-033 | Task has `sortOrder` (fractional float, family-wide, scoped per status) driving manual order in Kanban Todo/Started and Checklist active list. The same field powers both views |
| REQ-034 | Kanban supports vertical drag-reorder within Todo and Started columns |
| REQ-035 | Kanban Done column sorts by `completedAt` DESC; manual reorder disabled |
| REQ-036 | Task has `snoozedUntil: string \| null`. Snooze is a visibility modifier, not a status change |
| REQ-037 | Snooze options: Tomorrow / Next week / Next month / Custom — all resolve to 06:00 local on the target date. "Next week" = next Monday; if today is Monday, +7 days. "Next month" = 1st of following month; if today is the 1st, +1 month. Custom exposes a date picker only (no time picker) |
| REQ-038 | Snooze is allowed on `todo` and `started` only. Disallowed on `done` and `cancelled`. Completing or cancelling a snoozed task auto-clears `snoozedUntil` |
| REQ-039 | Snooze preserves `assigneeId`, `assignedAt`, `startedAt`, `sortOrder`, `scope`, and `tags` — only `snoozedUntil` is touched |
| REQ-040 | Snooze/unsnooze produces **no** transition log entry |
| REQ-041 | Auto-unsnooze (when `snoozedUntil <= now` on next view load) restores the task to its original status with its original `sortOrder` — **not** the top of the column |
| REQ-042 | Kanban "Show snoozed" toggle reveals a fourth Snoozed column, sorted by `snoozedUntil` ASC (nearest expiry first). Toggle state is persisted per user |
| REQ-043 | Status changes from **non-drag** sources (kebab menu, Checklist checkbox, detail view, Task History recovery) place the task at the **top** of the destination column's `sortOrder` range |

### 7.2 Should Have (P1)

| # | Requirement |
|---|-------------|
| REQ-018 | Split button with dropdown for task templates (one-click creation from template) |
| REQ-019 | Task template management (create, edit, delete, reorder templates) |
| REQ-020 | Board filtering by assignee, scope, and tags. The filter bar lives in the page header row and applies uniformly to both Kanban and Checklist views |
| REQ-020a | Tasks created on the board (quick entry or full creation form) inherit the current filter values as defaults — assignee → filter value when set, else current user; scope → filter value when narrowed to Family/Personal; tags → currently filtered tags. The full creation form exposes these as editable pre-fills; Checklist quick entry applies them silently |
| REQ-020b | When a task created via the full creation form does not match current filters (user overrode the pre-fills), a toast *"Task created — hidden by current filters"* is shown with a one-click **Clear filters** action that resets Assignee, Scope, and Tags |
| REQ-021 | Task History filtering by status, assignee, scope, and date range |
| REQ-022 | Overdue indicator on task cards when due date has passed |
| REQ-023 | Leaderboard is collapsible |
| REQ-044 | View preference (Kanban vs. Checklist) persisted per user |
| REQ-045 | Completed accordion expand/collapse state (Checklist view) persisted per user |
| REQ-046 | Snoozed column card shows a "Returns in X" chip computed from `snoozedUntil` |

### 7.3 Nice to Have (P2)

| # | Requirement |
|---|-------------|
| REQ-024 | Task description field (markdown or plain text) |
| REQ-025 | Celebratory visual feedback on leaderboard milestones (streaks, personal bests) |
| REQ-026 | Sorting options within Kanban columns (e.g., by due date, by creation date) — superseded by manual `sortOrder`; retained for possible future override toggle |

---

## 8. Assumptions

| # | Assumption |
|---|------------|
| 1 | The Family & Multi-User model (FAMILY-MULTI-USER-BRD.md) is implemented before or concurrently with this feature. Task assignment and leaderboard require individual user identity. |
| 2 | "Visually distinguished" for personal tasks means a subtle visual treatment (dimming, badge, or border) — the specific design is deferred to implementation. |
| 3 | The leaderboard uses a simple count of completed family tasks with no weighting system. |
| 4 | Task templates are family-scoped — all family members see and can use all templates. |
| 5 | The 14-day archiving threshold for `done` is based on `completedAt`, not on a calendar boundary. `cancelled` tasks do not use the 14-day rule — they archive immediately. |
| 6 | "Today", "this week", "this month" on the leaderboard use the user's local timezone. |
| 7 | Fractional indexing on `sortOrder` supports indefinite insertions without renumbering siblings. Float-precision exhaustion (after millions of inserts between two fixed siblings) is not an MVP concern. |
| 8 | Snooze expiry is evaluated on view load. No server-side scheduler is required — a task snoozed until 06:00 today simply appears on the next view load after 06:00. |
| 9 | A two-user household does not require conflict resolution on simultaneous reorders or simultaneous edits. Last-write-wins is acceptable. |

---

## 9. Out of Scope

| Item | Rationale |
|------|-----------|
| Recurring tasks | Deferred to post-MVP. The data model should not preclude adding recurrence rules later, but no recurrence logic is part of this work. |
| Task comments or discussion threads | Adds collaboration complexity beyond what a household board needs for MVP. |
| Push/email/in-app notifications on snooze expiry or due date | V2.0 uses silent re-emergence on next view load. Notifications are a separate initiative. |
| Custom snooze time-of-day | V2.0 fixes snooze expiry at 06:00 local. Per-task custom time adds UI overhead without clear value. |
| Sort toggles on Kanban (sort by due date, sort by creation date, etc.) | Manual `sortOrder` is the single prioritization signal. Sort toggles would undermine shared family order. |
| Per-user sort order in Kanban/Checklist | Family-wide order is the only order. Individual personal views are deferred. |
| Drag-to-cancel on Kanban | Cancellation is deliberately more friction-ful in v2.0 (kebab menu + confirm). |
| Priority field | Manual `sortOrder` provides explicit prioritization. An additional priority field would be redundant. |
| Integration with calendar apps | Future enhancement. |
| Task categories or labels beyond scope | The `family` / `personal` scope distinction plus tags is sufficient. |
| Direct linking to financial data | Tasks are not linked to individual transactions, budgets, or category entities. Tasks may carry a project tag for contextual grouping (see §1.4 and PROJECTS-BRD.md §4.5), but this is a display-only association — no data-level link to financial records is established. |
| Mobile-specific task UI beyond Checklist accommodations | The PWA (see PWA-MOBILE-BRD.md) is a separate initiative. Checklist view's mobile ergonomics are the v2.0 mobile story. |
| Backlog column | Three active columns (Todo, Started, Done) plus optional Snoozed are sufficient. |

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should task templates support a default description, or only name/assignee/scope? | Open |
| 2 | Should the leaderboard be visible on the main dashboard as a widget, in addition to the Tasks page? | Open |
| 3 | What is the visual design for distinguishing personal tasks — dimmed card, colored border, badge, or something else? | Deferred to design |
| 4 | Should there be a limit on the number of task templates before the dropdown becomes unwieldy? | Open |
| 5 | When a task is moved back from `done` to `started` or `todo`, does it clear `completedAt`? | Proposed: yes, clear it (the transition log preserves the history) |
| 6 | Should the Task History view support bulk actions (e.g., bulk delete old tasks)? | Open |
| 7 | For the recurring tasks post-MVP enhancement: should the data model reserve a field now (e.g., `recurrenceRule: null`) to avoid migration later? | Open |
| 8 | When an auto-unsnoozed task's original `sortOrder` is now out of range (e.g., all sibling tasks have been reordered above it), should it be renormalized? | Proposed: no — it sits where `sortOrder` places it; user can manually reorder if needed |
| 9 | Should the Checklist "Completed" accordion respect scope/assignee filters set elsewhere on the page? | Proposed: yes — filters apply uniformly to active list and accordion |
| 10 | Should a user be able to snooze multiple tasks at once (bulk snooze from a selection)? | Out of scope for v2.0; revisit if used heavily |

---

## 11. Future Considerations — Recurring Tasks

Recurring tasks are explicitly out of scope for MVP/v2.0 but are a known future need. Key design considerations to be aware of:

- **Recurrence rule**: How to express frequency (daily, weekly, specific days, monthly, custom).
- **Instance creation**: Whether completing a recurring task auto-creates the next instance, or whether all instances are pre-generated.
- **Series management**: Whether editing or cancelling one instance affects the entire series, only future instances, or only that instance.
- **Template relationship**: Recurring tasks and task templates may overlap — a "Laundry" template that auto-creates weekly could replace both concepts. This relationship should be considered when designing recurrence.
- **Snooze interaction**: Whether snoozing a recurring instance snoozes that instance only or shifts the series.

The MVP/v2.0 data model should not actively preclude any of these approaches.

---

## 12. Success Criteria

- Family members can create tasks and move them across the Kanban board via drag-and-drop.
- Dragging an unassigned task to Started auto-assigns it to the dragger.
- Kanban Todo and Started columns support vertical manual reorder; Done auto-sorts by `completedAt` DESC; Snoozed (when toggled on) auto-sorts by `snoozedUntil` ASC.
- The transition log accurately records every real status change with user attribution. Snooze/unsnooze produces no log entry.
- Personal tasks are visible to all family members with clear visual distinction from family tasks.
- The leaderboard accurately reflects **family-task** completion counts across today, this week, and this month. Personal tasks are excluded entirely.
- Task templates enable one-tap task creation from the split button dropdown.
- The Checklist view supports rapid task creation with zero clicks to save; Enter → new-line pattern works on desktop and mobile.
- Subtasks render indented in Checklist and as a progress counter on Kanban cards. Subtask reorder is supported.
- Snoozed tasks disappear from default views and re-emerge automatically at the scheduled date/time (06:00 local). Auto-unsnoozed tasks restore to their original `sortOrder`, not top.
- Cancelled tasks never appear on the Kanban board or in Checklist; Task History is the sole surface for retrieval.
- The board stays clean — completed tasks archive after 14 days; cancelled tasks archive immediately.
- Task History provides full access to archived tasks with filtering and recovery.
