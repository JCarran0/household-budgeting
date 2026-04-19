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
| **Family** | Visible to all family members | Counts for the completer (see §5.3) | Any family member |
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

Subtasks are:
- **Ordered.** Order is persisted on the parent task and is family-wide (shared).
- **Binary.** Subtasks have no `started` state — only `completed: true | false`.
- **Not independently assigned, scoped, or dated.** All metadata lives on the parent.
- **Not counted on the leaderboard.** Completing a subtask is not a leaderboard event.
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

Default view: all tasks (family + personal, all assignees). The "Show snoozed" control is a toggle, not a filter — it adds the Snoozed column rather than restricting other columns.

### 3.2 Checklist View

The Checklist view is an alternate presentation of the same task data, optimized for rapid entry and reordering on both desktop and mobile.

#### 3.2.1 Layout

Tasks render as a single flat list, top-to-bottom:

- **Active tasks** (status `todo` or `started`) render at the top, ordered by `sortOrder` ASC.
- Below active tasks, a **collapsed accordion** labeled **"Completed (N)"** — the count is always visible; the list is hidden until the user expands the accordion. When expanded: tasks sorted by `completedAt` DESC, subject to the same 14-day archive window as Kanban. Accordion expand/collapse state is persisted per user.
- **Cancelled tasks are not surfaced** in the Checklist view. They live only in Task History.
- **Snoozed tasks are not surfaced** in the Checklist view. They appear only in the Kanban Snoozed column (via the "Show snoozed" toggle).

#### 3.2.2 Row Anatomy

Each active-task row shows, left to right:

1. **Started checkbox** — checked when status is `started` or `done`. Unchecking moves a `started` task back to `todo`. The started checkbox is **locked** while the done checkbox is checked (done implies started; the user cannot uncheck started on a done task without first un-doing).
2. **Done checkbox** — checked when status is `done`. Checking it moves status to `done` and, if `startedAt` was previously null, **auto-stamps `startedAt` equal to `completedAt`** (see "synthetic start" below). Unchecking moves status back to `started` (preserving the stamped `startedAt`).
3. **Title** — click/tap to edit inline.
4. **Metadata chips:** assignee avatar, due date (with overdue indicator), project chip (if tagged).
5. **Kebab menu** — Snooze ▸ submenu, Cancel task, Edit (opens detail view).

**Synthetic start:** When a user checks done without ever checking started, the task jumps from `todo` → `done`. The transition log records this real transition (`fromStatus: 'todo'`, `toStatus: 'done'`). A synthetic `startedAt` equal to `completedAt` is stamped on the task record so downstream consumers can rely on the field being non-null for any done task. No synthetic `started` transition is written to the log.

**Subtasks** render **indented** beneath their parent. Each subtask has a single done checkbox (subtasks are binary — no started state).

#### 3.2.3 Quick Entry

A persistent **"+ Add task"** input at the top of the active list supports keyboard-driven rapid entry:

| Key | Context | Behavior |
|-----|---------|----------|
| **Enter** | Top-level task input | Save the current line as a new task; create a new top-level input below, cursor focused |
| **Enter** | Subtask input | Save the current subtask; create a new subtask under the same parent, cursor focused |
| **Tab** | Empty new-task line | Demote to subtask of the task above |
| **Shift-Tab** | Empty subtask line | Promote to top-level task |
| **Escape** | Empty line | Exit quick-entry mode |

**Mobile accommodation:** On mobile browsers where Tab may not be exposed on the on-screen keyboard, a small **indent/outdent button pair** is rendered next to the focused line, providing equivalent functionality.

Tasks created via quick entry are saved in `todo` status with the current user as `createdBy`, no assignee, no due date, and default scope. Rich fields (assignee, due date, description) can be edited later via inline chips or the full detail view.

#### 3.2.4 Reorder

Tasks can be reordered by drag — each row exposes a drag handle on hover (desktop) or via long-press (mobile).

- Reordering updates `sortOrder` (fractional indexing — see §3.1.5).
- `sortOrder` is shared with Kanban: reorder in either view is reflected in both.
- **Subtask reorder** within a parent is also supported via drag. Subtask order is persisted on the parent task's `subTasks` array.
- Reorder is **disabled** inside the Completed accordion (auto-sorted by `completedAt` DESC).

#### 3.2.5 Inline Edit

- Click/tap a task title to edit it in place.
- Click/tap a metadata chip to open a small popover (assignee picker, date picker, project picker).
- Edits autosave on blur or Enter. There is no explicit save button.
- Full edit (description, all fields) is available via the kebab menu → Edit, which opens the task detail view.

---

## 4. Task Creation

### 4.1 Full Creation Form

The full task creation form collects all task properties (title, assignee, due date, scope, description). Status defaults to `todo` and is not selectable during creation.

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
- A family task counts toward the leaderboard of the **user who moved it to `done`**, regardless of assignee.
- If a task is moved to `done`, then back to `started`, then to `done` again, it counts **once** — based on the most recent `completedAt` timestamp.

> **v1.0 → v2.0 behavior change:** In v1.0 personal tasks counted toward the owner's totals. They no longer count anywhere. See §9 for rationale.

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
| REQ-016 | **Leaderboard counts only family-scope tasks**, attributed to the user who moved the task to `done`. Personal tasks are excluded entirely |
| REQ-017 | Tasks page accessible from sidebar navigation |
| REQ-017a | Tasks support a project tag in their `tags` array for contextual grouping (see PROJECTS-BRD.md §4.5); tag is applied via a project picker, not free-text entry |
| REQ-017b | Task cards and task detail view display a project chip that navigates to the associated project when a project tag is present |
| REQ-017c | Cancel action is available via (a) the card kebab menu and (b) the task detail view, each with a confirmation dialog. Drag-to-cancel is not supported |
| REQ-027 | Subtasks are first-class and documented: ordered (family-wide), binary (complete/incomplete), indented under parent in Checklist view, shown as a progress counter on Kanban cards. Completing all subtasks does not auto-complete the parent |
| REQ-028 | Checklist view — alternate flat-list presentation of tasks with active tasks at top and a collapsed "Completed (N)" accordion below |
| REQ-029 | Checklist row has two checkboxes (started, done). Checking done on a task with `startedAt == null` auto-stamps `startedAt = completedAt` (no synthetic transition log entry). Started checkbox is locked while done is checked |
| REQ-030 | Checklist quick-entry: Enter saves the current line and creates the next; Tab/Shift-Tab demote/promote within top-level/subtask; Escape exits. Mobile exposes indent/outdent buttons next to the focused line |
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
| REQ-020 | Board filtering by assignee and scope |
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
