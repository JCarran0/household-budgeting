# Household Task Management — Business Requirements Document

**Status:** Draft
**Author:** Jared Carrano
**Date:** 2026-04-11
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

The household has no shared system for tracking chores, errands, and to-dos. Tasks are communicated verbally, forgotten, or tracked in disparate personal tools. There is no visibility into who is doing what, no accountability for follow-through, and no way to recognize contribution over time.

### 1.2 Solution Summary

Add a **Kanban-style task board** to the app where family members can create, assign, and track household tasks through a simple status workflow. A **leaderboard** provides lightweight gamification around task completion. **Task templates** enable one-tap creation of frequently repeated tasks. Tasks are scoped as either family-visible or personal, with personal tasks visually distinguished but not hidden.

### 1.3 Users

All family members. This feature builds on the Family & Multi-User model (see FAMILY-MULTI-USER-BRD.md). Every family member can create, edit, assign, and complete any family task.

### 1.4 Relationship to Financial Data

None. Task management is an independent feature with no connection to transactions, budgets, categories, or any financial entity.

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

### 2.2 Scope

| Scope | Board Visibility | Leaderboard | Editable By |
|-------|-----------------|-------------|-------------|
| **Family** | Visible to all family members | Counts for assignee | Any family member |
| **Personal** | Visible to all family members, **visually distinguished** (e.g., dimmed, badge, or subtle indicator) | Counts only for the owner | Any family member |

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
| `startedAt` | Most recent transition to `started` |
| `completedAt` | Most recent transition to `done` |
| `cancelledAt` | Most recent transition to `cancelled` |
| `assignedAt` | Assignee is set or changed |

### 2.5 Task Template

A task template is a pre-configured shortcut for creating tasks that are repeated frequently (e.g., "Laundry", "Mow Lawn", "Grocery Run").

| Property | Required | Description |
|----------|----------|-------------|
| **Name** | Yes | Template name, used as the task title on creation |
| **Default assignee** | No | Pre-filled assignee (if blank, task is created unassigned) |
| **Default scope** | No | Pre-filled scope (defaults to `family`) |

A template does not include due date or description — those vary per instance.

---

## 3. Kanban Board

### 3.1 Layout

The board displays four columns corresponding to the four statuses:

| Todo | Started | Done | Cancelled |

Each column contains task cards. Cards are draggable between columns.

### 3.2 Task Cards

Each card displays:

- Task title
- Assignee (avatar or name, if assigned)
- Due date (if set, with overdue indicator when past due)
- Scope badge (visual indicator for personal tasks only — family tasks have no badge since family is the default)

### 3.3 Drag Behavior

| Action | Result |
|--------|--------|
| Drag **unassigned** task from Todo to Started | Status changes to `started` **and** task is auto-assigned to the user who dragged it |
| Drag **assigned** task from Todo to Started | Status changes to `started`, assignee unchanged |
| Drag task between any other columns | Status changes to the target column's status, assignee unchanged |
| Any family member can drag any task | No ownership restrictions on status changes |

### 3.4 Board Archiving

Tasks in `done` or `cancelled` status **disappear from the board after 14 days** from the time they entered that terminal status. This keeps the board focused on active work.

Archived tasks remain in the system and are accessible through a separate **Task History** view (see Section 6).

### 3.5 Filtering & Sorting

The board must support filtering by:

| Filter | Behavior |
|--------|----------|
| Assignee | Show only tasks assigned to a specific family member (or unassigned) |
| Scope | Show only family tasks, only personal tasks, or all |

Default view: all tasks (family + personal, all assignees).

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

---

## 5. Leaderboard

### 5.1 Location

The leaderboard is a **collapsible panel** on the Tasks page. It is visible by default but can be collapsed to maximize board space.

### 5.2 Metrics

The leaderboard shows tasks completed (status changed to `done`) per family member across three time windows:

| Period | Description |
|--------|-------------|
| Today | Tasks completed since midnight (user's local time) |
| This week | Tasks completed since the most recent Monday |
| This month | Tasks completed since the 1st of the current month |

Each family member's count is displayed. The member with the highest count in each period is visually highlighted.

### 5.3 Counting Rules

- A task counts toward the leaderboard of the **user who moved it to `done`**, regardless of assignee.
- If a task is moved to `done`, then back to `started`, then to `done` again, it counts **once** — based on the most recent `completedAt` timestamp.
- Personal tasks count only toward the task owner's leaderboard totals.
- Family tasks count toward the completing user's leaderboard totals.

### 5.4 Tone

The leaderboard should feel **motivational and fun**, not coldly competitive. Visual design and any copy should lean encouraging (e.g., streak indicators, celebratory icons for milestones) rather than ranking-table sterile.

---

## 6. Task History

### 6.1 Purpose

Task History provides access to all tasks that have been archived off the board (completed or cancelled for more than 14 days) as well as a searchable log of all tasks regardless of status.

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

---

## 7. Requirements Summary

### 7.1 Must Have (P0)

| # | Requirement |
|---|-------------|
| REQ-001 | Task entity with title, status, scope, assignee, due date, and description |
| REQ-002 | Four statuses: `todo`, `started`, `done`, `cancelled` — with unrestricted transitions |
| REQ-003 | Kanban board with four columns, one per status |
| REQ-004 | Drag-and-drop to change task status |
| REQ-005 | Dragging an unassigned task from Todo to Started auto-assigns to the dragging user |
| REQ-006 | Dragging an already-assigned task preserves the existing assignee |
| REQ-007 | Any family member can move any task to any status |
| REQ-008 | Full transition log recording every status change with from, to, timestamp, and userId |
| REQ-009 | Convenience timestamps: `createdAt`, `createdBy`, `startedAt`, `completedAt`, `cancelledAt`, `assignedAt` |
| REQ-010 | Scope field: `family` (default) or `personal` |
| REQ-011 | Personal tasks visually distinguished on the board but visible to all family members |
| REQ-012 | Tasks in `done` or `cancelled` status archived from the board after 14 days |
| REQ-013 | Task History view for accessing archived and all historical tasks |
| REQ-014 | Full task creation form (title, assignee, due date, scope, description) |
| REQ-015 | Leaderboard showing tasks completed per family member: today, this week, this month |
| REQ-016 | Leaderboard counts based on who moved the task to `done` |
| REQ-017 | Tasks page accessible from sidebar navigation |

### 7.2 Should Have (P1)

| # | Requirement |
|---|-------------|
| REQ-018 | Split button with dropdown for task templates (one-click creation from template) |
| REQ-019 | Task template management (create, edit, delete, reorder templates) |
| REQ-020 | Board filtering by assignee and scope |
| REQ-021 | Task History filtering by status, assignee, scope, and date range |
| REQ-022 | Overdue indicator on task cards when due date has passed |
| REQ-023 | Leaderboard is collapsible |

### 7.3 Nice to Have (P2)

| # | Requirement |
|---|-------------|
| REQ-024 | Task description field (markdown or plain text) |
| REQ-025 | Celebratory visual feedback on leaderboard milestones (streaks, personal bests) |
| REQ-026 | Sorting options within Kanban columns (e.g., by due date, by creation date) |

---

## 8. Assumptions

| # | Assumption |
|---|------------|
| 1 | The Family & Multi-User model (FAMILY-MULTI-USER-BRD.md) is implemented before or concurrently with this feature. Task assignment and leaderboard require individual user identity. |
| 2 | "Visually distinguished" for personal tasks means a subtle visual treatment (dimming, badge, or border) — the specific design is deferred to implementation. |
| 3 | The leaderboard uses a simple count of completed tasks with no weighting system. |
| 4 | Task templates are family-scoped — all family members see and can use all templates. |
| 5 | The 14-day archiving threshold is based on when the task entered its terminal status (`completedAt` or `cancelledAt`), not on a calendar boundary. |
| 6 | "Today", "this week", "this month" on the leaderboard use the user's local timezone. |

---

## 9. Out of Scope

| Item | Rationale |
|------|-----------|
| Recurring tasks | Deferred to post-MVP. The data model should not preclude adding recurrence rules later, but no recurrence logic is part of this work. |
| Task comments or discussion threads | Adds collaboration complexity beyond what a household board needs for MVP. |
| Notifications or reminders (push, email, in-app) | Valuable but independent feature. Due date reminders can be added later. |
| Subtasks or checklists within a task | Keep the task model flat for MVP. |
| Priority field | Four-status Kanban with drag ordering provides implicit prioritization. Explicit priority adds UI overhead without clear household value. |
| Integration with calendar apps | Future enhancement. |
| Task categories or labels beyond scope | The `family` / `personal` scope distinction is sufficient for MVP. Additional categorization can be layered on later. |
| Connection to financial data | Tasks are not linked to transactions, budgets, or any financial entity. |
| Mobile-specific task UI | Mobile app is a separate initiative. |
| Backlog column | Four columns (Todo, Started, Done, Cancelled) are sufficient. A backlog can be added if the Todo column proves too noisy. |

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should task templates support a default description, or only name/assignee/scope? | Open |
| 2 | Should the leaderboard be visible on the main dashboard as a widget, in addition to the Tasks page? | Open |
| 3 | What is the visual design for distinguishing personal tasks — dimmed card, colored border, badge, or something else? | Deferred to design |
| 4 | Should there be a limit on the number of task templates before the dropdown becomes unwieldy? | Open |
| 5 | Should the Done and Cancelled columns be visually collapsed by default on the board, with an expand toggle? | Open |
| 6 | When a task is moved back from `done` to `started` or `todo`, does it reset the `completedAt` timestamp? | Proposed: yes, clear it (the transition log preserves the history) |
| 7 | Should the Task History view support bulk actions (e.g., bulk delete old tasks)? | Open |
| 8 | For the recurring tasks post-MVP enhancement: should the data model reserve a field now (e.g., `recurrenceRule: null`) to avoid migration later? | Open |

---

## 11. Future Considerations — Recurring Tasks

Recurring tasks are explicitly out of scope for MVP but are a known future need. Key design considerations to be aware of:

- **Recurrence rule**: How to express frequency (daily, weekly, specific days, monthly, custom).
- **Instance creation**: Whether completing a recurring task auto-creates the next instance, or whether all instances are pre-generated.
- **Series management**: Whether editing or cancelling one instance affects the entire series, only future instances, or only that instance.
- **Template relationship**: Recurring tasks and task templates may overlap — a "Laundry" template that auto-creates weekly could replace both concepts. This relationship should be considered when designing recurrence.

The MVP data model should not actively preclude any of these approaches.

---

## 12. Success Criteria

- Family members can create tasks and move them across the Kanban board via drag-and-drop.
- Dragging an unassigned task to Started auto-assigns it to the dragger.
- The transition log accurately records every status change with user attribution.
- Personal tasks are visible to all family members with clear visual distinction from family tasks.
- The leaderboard accurately reflects completion counts across today, this week, and this month.
- Task templates enable one-tap task creation from the split button dropdown.
- The board stays clean — completed and cancelled tasks archive after 14 days.
- Task History provides full access to archived tasks with filtering.
