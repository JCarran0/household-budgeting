/**
 * Planning Read Capabilities (T0) — tasks, trips, projects.
 *
 * AI-CAPABILITY-PLATFORM-BRD §9.2 / §9.3, Phase 2.
 *
 * REQ-P019 is the governing rule for everything in this file: a description
 * that promises a field the executor does not return is a defect of the same
 * severity as a wrong value. get_budgets advertised "actuals" it never returned
 * and that is how the Subaru incident happened (§15.1). Each description below
 * states the response shape, and the executors return exactly that.
 *
 * Descriptions are also where the non-additive tag rule is taught. The payloads
 * carry machine-readable flags, but the model reads prose first, so both say it.
 */

import type { ReadCapability } from './readCapabilities';
import type { QueryTasksInput } from '../chatbotReaders/taskReader';

export const PLANNING_CAPABILITIES: ReadCapability[] = [
  {
    name: 'query_tasks',
    tier: 'T0',
    domain: 'tasks',
    dataClass: 'metadata',
    definition: {
      name: 'query_tasks',
      description:
        'Search the household task list. Use this for anything about chores, to-dos, what is due, who is responsible, or "what is on our plate". ' +
        'Filters: status, scope, assigneeId, unassignedOnly, overdueOnly, dueBefore/dueAfter, includeSnoozed, tags, searchQuery, limit.\n\n' +
        'Response shape: { count, truncated, limit, appliedFilters, tasks, summary }. ' +
        '`count` is the TOTAL number of matches; `tasks` is capped at `limit` (default 50, hard max 200) and sorted overdue-first, then soonest due. ' +
        '`summary` carries byStatus / overdue / snoozed / unassigned counts over the FULL match set, so aggregate questions need no second call. ' +
        '`appliedFilters` echoes the filter actually used — check it before concluding a task does not exist, because an empty result may mean a narrow filter rather than an empty list.\n\n' +
        'Each task carries a resolved `assignee` object: {userId, name, unresolved}. name=null with unresolved=false means genuinely UNASSIGNED; unresolved=true means the task points at a person no longer in the family. These are different facts — never report an unresolved assignee as unassigned. ' +
        '`isOverdue` and `isSnoozed` are computed for you; do not derive them from dates yourself. ' +
        'Snoozed tasks are EXCLUDED by default, matching what the task board shows; pass includeSnoozed=true to see them.',
      input_schema: {
        type: 'object' as const,
        properties: {
          status: {
            type: 'array',
            items: { type: 'string', enum: ['todo', 'started', 'done', 'cancelled'] },
            description: 'Filter by status. Omit for all statuses.',
          },
          scope: {
            type: 'string',
            enum: ['family', 'personal'],
            description:
              'Filter by scope. Both household members can see both scopes; "personal" affects leaderboard credit, not visibility.',
          },
          assigneeId: { type: 'string', description: 'Filter to one assignee userId. Use get_family_members to resolve a name to an id.' },
          unassignedOnly: { type: 'boolean', description: 'If true, return only tasks with no assignee.' },
          overdueOnly: { type: 'boolean', description: 'If true, return only tasks past their due date that are not done or cancelled.' },
          dueBefore: { type: 'string', description: 'Only tasks with a due date strictly before this date (YYYY-MM-DD).' },
          dueAfter: { type: 'string', description: 'Only tasks with a due date strictly after this date (YYYY-MM-DD).' },
          includeSnoozed: { type: 'boolean', description: 'Include snoozed tasks. Default false, matching the task board.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (case-insensitive, any match).' },
          searchQuery: { type: 'string', description: 'Case-insensitive substring match on title, description, and tags.' },
          limit: { type: 'number', description: 'Max rows in `tasks` (default 50, hard max 200). Does not affect `count` or `summary`.' },
        },
        required: [],
      },
    },
    execute: (input, data, familyId) =>
      data.tasks.queryTasks(familyId, input as unknown as QueryTasksInput),
  },
  {
    name: 'get_family_members',
    tier: 'T0',
    domain: 'tasks',
    dataClass: 'metadata',
    definition: {
      name: 'get_family_members',
      description:
        'List the household members, as { members: [{ userId, displayName }] }. ' +
        'Use this to turn a name the user typed ("assign it to Jared") into the userId that query_tasks and task actions require. ' +
        'Returns only userId and displayName — no email, no account details.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    execute: (_input, data, familyId) => data.tasks.getFamilyMembers(familyId),
  },
  {
    name: 'list_trips',
    tier: 'T0',
    domain: 'trips',
    dataClass: 'financial',
    definition: {
      name: 'list_trips',
      description:
        'List all trips, newest first, as { count, trips }. Each trip carries id, name, tag, startDate, endDate, notes, totalBudget, hasBudget, stopCount, and spending. ' +
        'hasBudget=false means NO budget was set (treat as unset, not as zero-known). ' +
        'Pass includeSpending=true to populate `spending` with { totalSpent, transactionCount }; otherwise `spending` is null, meaning NOT REQUESTED — never read a null spending as "no money spent".\n\n' +
        'IMPORTANT: trip spending comes from a non-exclusive tag. One transaction can be tagged for a trip AND a project at once, so trip totals must never be added to each other or to a project total. The payload repeats this as crossTripTotalsAreNotAdditive. ' +
        'Use get_trip_itinerary for the day-by-day plan; this tool does not return stops.',
      input_schema: {
        type: 'object' as const,
        properties: {
          includeSpending: {
            type: 'boolean',
            description: 'Compute spending per trip from tagged transactions. Costs an extra scan; omit when the question is not about money.',
          },
        },
        required: [],
      },
    },
    execute: (input, data, familyId) =>
      data.trips.listTrips(familyId, input as { includeSpending?: boolean }),
  },
  {
    name: 'get_trip_itinerary',
    tier: 'T0',
    domain: 'trips',
    dataClass: 'financial',
    definition: {
      name: 'get_trip_itinerary',
      description:
        'Get one trip with its day-by-day agenda, as { found, query, trip, stopsTruncated, agenda }. ' +
        'Match by trip id, exact name, partial name, or tag via tripQuery.\n\n' +
        'found=false means NO trip matched — it does not mean the trip is empty. A matched trip with nothing planned returns found=true with an agenda of days that have no stops. Never conflate the two.\n\n' +
        '`agenda` is one entry per date: { date, stayingAt, stops }. `stayingAt` lists the lodging in effect that night — stays are NIGHT-BASED, so a stay from the 10th with endDate the 12th appears on the 10th, 11th and 12th, and checkout is the morning of the 13th. Do not recompute this; it is already expanded. ' +
        'Each stop carries type, name, date, time, notes, location, address, and for transit: fromLocation, toLocation, transitMode, durationMinutes. Fields that do not apply to a stop type are null rather than absent. ' +
        'Transit stops have name=null by design — describe them by their endpoints.',
      input_schema: {
        type: 'object' as const,
        properties: {
          tripQuery: { type: 'string', description: 'Trip id, name (exact or partial), or tag.' },
          includeSpending: { type: 'boolean', description: 'Also compute spending from tagged transactions.' },
        },
        required: ['tripQuery'],
      },
    },
    execute: (input, data, familyId) =>
      data.trips.getItinerary(familyId, input as unknown as { tripQuery: string; includeSpending?: boolean }),
  },
  {
    name: 'list_projects',
    tier: 'T0',
    domain: 'projects',
    dataClass: 'financial',
    definition: {
      name: 'list_projects',
      description:
        'List all projects with budget and spending, as { count, projects }. Each project carries id, name, tag, startDate, endDate, status (planning/active/completed), notes, totalBudget, hasBudget, totalSpent, transactionCount, and a per-category breakdown.\n\n' +
        'WITHIN one project the per-category `spent` values sum to `totalSpent`, so that total is safe to state. ACROSS projects they are NOT additive: spending is attributed by a non-exclusive tag, so one transaction can count fully toward two projects, or toward a project and a trip. Never sum totalSpent across projects, and never reconcile a project total against household spending for the same period — tagged transactions are included even when dated outside the project window. The payload repeats both caveats as crossProjectTotalsAreNotAdditive and includesTransactionsOutsideDateRange.\n\n' +
        'Category line items carry `estimatedCost` only. This app never links a line item to a transaction, so a line item is a plan, never a record of money spent.',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    execute: (_input, data, familyId) => data.projects.listProjects(familyId),
  },
  {
    name: 'get_project',
    tier: 'T0',
    domain: 'projects',
    dataClass: 'financial',
    definition: {
      name: 'get_project',
      description:
        'Get one project by id, name (exact or partial), or tag, as { found, query, project }. ' +
        'found=false means NO project matched; it never means the project has no spending. ' +
        'The project object has the same shape as a list_projects entry.\n\n' +
        'WITHIN this project the per-category `spent` values sum to `totalSpent`, so that total is safe to state. It must NEVER be added to another project total or to a trip total: attribution is by a non-exclusive tag, so one transaction can count fully toward several. It also must not be reconciled against household spending for the period, because tagged transactions are included even when dated outside the project window. The payload repeats both as crossProjectTotalsAreNotAdditive and includesTransactionsOutsideDateRange.\n\n' +
        'A category whose id no longer resolves is reported as "Unknown category (<id>)" rather than as a bare id — report it as unknown, do not guess what it was.',
      input_schema: {
        type: 'object' as const,
        properties: {
          projectQuery: { type: 'string', description: 'Project id, name (exact or partial), or tag.' },
        },
        required: ['projectQuery'],
      },
    },
    execute: (input, data, familyId) =>
      data.projects.getProject(familyId, input as unknown as { projectQuery: string }),
  },
];
