/**
 * Phase 2 planning read tools — scoping and absence invariants.
 *
 * AI-CAPABILITY-PLATFORM-BRD §9.2/§9.3, SEC-P031/P032/P033.
 *
 * These tests exist for three failure modes that are invisible in a happy-path
 * run and expensive in production:
 *
 *  1. CROSS-FAMILY LEAK. Families live in a single GLOBAL blob, not a
 *     per-family key. A read tool that forgets to select by id hands the model
 *     every household's roster in the deployment.
 *  2. REMOVED TRANSACTIONS. SEC-P031 — Plaid leaves replaced pending holds in
 *     storage as status:'removed'. A trip or project total that counts them
 *     overstates spending, and the model will state the overstated number.
 *  3. ABSENCE COLLAPSING. SEC-P033 — "not found", "none set" and "not
 *     requested" are three different facts. Collapsing any pair of them into
 *     an empty value is the Subaru mechanism.
 */

import { ChatbotDataService } from '../../services/chatbotDataService';
import { ReadOnlyDataServiceImpl } from '../../services/readOnlyDataService';
import { InMemoryDataService } from '../../services/dataService';
import type { Category, Family, StoredTask, Trip, StoredProject } from '../../shared/types';

const FAMILY_ID = 'fam-ours';
const OTHER_FAMILY_ID = 'fam-theirs';

const cat = (id: string, name: string): Category => ({
  id, name, parentId: null,
  isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
});

function task(over: Partial<StoredTask> & { id: string; title: string }): StoredTask {
  return {
    familyId: FAMILY_ID,
    description: '',
    status: 'todo',
    scope: 'family',
    assigneeId: null,
    dueDate: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    createdBy: 'u1',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    assignedAt: null,
    transitions: [],
    tags: [],
    subTasks: [],
    snoozedUntil: null,
    sortOrder: 1,
    ...over,
  } as StoredTask;
}

function txn(over: { id: string; amount: number; tags: string[]; status?: string; categoryId?: string | null }) {
  return {
    id: over.id,
    accountId: 'acct-1',
    date: '2026-05-01',
    name: over.id,
    merchantName: null,
    amount: over.amount,
    categoryId: over.categoryId ?? 'HOME',
    tags: over.tags,
    status: over.status ?? 'posted',
    pending: false,
    isHidden: false,
  };
}

describe('planning reads — family scoping, SEC-P031/P032/P033', () => {
  let dataService: InMemoryDataService;
  let chatbot: ChatbotDataService;

  beforeEach(async () => {
    dataService = new InMemoryDataService();
    chatbot = new ChatbotDataService(new ReadOnlyDataServiceImpl(dataService));
    await dataService.saveCategories([cat('HOME', 'Home Improvement')], FAMILY_ID);

    const ours: Family = {
      id: FAMILY_ID, name: 'Ours', createdAt: '', updatedAt: '',
      members: [
        { userId: 'u1', displayName: 'Jared', joinedAt: '' },
        { userId: 'u2', displayName: 'Spouse', joinedAt: '' },
      ],
    };
    const theirs: Family = {
      id: OTHER_FAMILY_ID, name: 'Theirs', createdAt: '', updatedAt: '',
      members: [{ userId: 'u99', displayName: 'Stranger', joinedAt: '' }],
    };
    await dataService.saveData('families', { families: [ours, theirs] });
  });

  describe('cross-family isolation', () => {
    it('never returns another family\'s members', async () => {
      const result = await chatbot.tasks.getFamilyMembers(FAMILY_ID);
      const names = result.members.map(m => m.displayName);

      expect(names).toEqual(expect.arrayContaining(['Jared', 'Spouse']));
      expect(names).not.toContain('Stranger');
      expect(result.members.map(m => m.userId)).not.toContain('u99');
    });

    it('returns an empty roster for an unknown family rather than everyone', () => {
      // Failing open here would be the severe direction: an unrecognised id
      // yielding every member in the deployment.
      return chatbot.tasks.getFamilyMembers('fam-does-not-exist').then(r => {
        expect(r.members).toEqual([]);
      });
    });

    it('exposes only userId and displayName, never the whole member record', async () => {
      const { members } = await chatbot.tasks.getFamilyMembers(FAMILY_ID);
      for (const m of members) {
        expect(Object.keys(m).sort()).toEqual(['displayName', 'userId']);
      }
    });

    it('does not read another family\'s tasks', async () => {
      await dataService.saveData(`tasks_${FAMILY_ID}`, [task({ id: 't1', title: 'Ours' })]);
      await dataService.saveData(`tasks_${OTHER_FAMILY_ID}`, [task({ id: 't2', title: 'Theirs' })]);

      const result = await chatbot.tasks.queryTasks(FAMILY_ID, {});
      expect(result.tasks.map(t => t.title)).toEqual(['Ours']);
    });
  });

  describe('assignee resolution (SEC-P032 / SEC-P033)', () => {
    beforeEach(async () => {
      await dataService.saveData(`tasks_${FAMILY_ID}`, [
        task({ id: 't-assigned', title: 'Assigned', assigneeId: 'u1' }),
        task({ id: 't-unassigned', title: 'Unassigned', assigneeId: null }),
        task({ id: 't-orphan', title: 'Orphan', assigneeId: 'u-departed' }),
      ]);
    });

    it('resolves a known assignee to a name so no join is needed', async () => {
      const { tasks } = await chatbot.tasks.queryTasks(FAMILY_ID, {});
      const assigned = tasks.find(t => t.title === 'Assigned');
      expect(assigned?.assignee).toEqual({ userId: 'u1', name: 'Jared', unresolved: false });
    });

    it('distinguishes unassigned from assigned-to-someone-unknown', async () => {
      // The whole point of SEC-P033. Both have name:null, and reporting the
      // orphan as "nobody is assigned" would be a confident false statement.
      const { tasks } = await chatbot.tasks.queryTasks(FAMILY_ID, {});
      const unassigned = tasks.find(t => t.title === 'Unassigned');
      const orphan = tasks.find(t => t.title === 'Orphan');

      expect(unassigned?.assignee).toEqual({ userId: null, name: null, unresolved: false });
      expect(orphan?.assignee).toEqual({ userId: 'u-departed', name: null, unresolved: true });
      expect(unassigned?.assignee.unresolved).not.toBe(orphan?.assignee.unresolved);
    });
  });

  describe('task filtering', () => {
    const NOW = new Date('2026-09-15T12:00:00.000Z');

    beforeEach(async () => {
      await dataService.saveData(`tasks_${FAMILY_ID}`, [
        task({ id: 'a', title: 'Overdue todo', dueDate: '2026-09-01' }),
        task({ id: 'b', title: 'Overdue but done', dueDate: '2026-09-01', status: 'done' }),
        task({ id: 'c', title: 'Future', dueDate: '2026-12-01' }),
        task({ id: 'd', title: 'Snoozed', snoozedUntil: '2026-10-01T00:00:00.000Z' }),
        task({ id: 'e', title: 'Expired snooze', snoozedUntil: '2026-09-01T00:00:00.000Z' }),
      ]);
    });

    it('does not call a completed task overdue', async () => {
      const { tasks } = await chatbot.tasks.queryTasks(FAMILY_ID, { includeSnoozed: true }, NOW);
      expect(tasks.find(t => t.title === 'Overdue todo')?.isOverdue).toBe(true);
      expect(tasks.find(t => t.title === 'Overdue but done')?.isOverdue).toBe(false);
    });

    it('hides snoozed tasks by default, matching the task board', async () => {
      const hidden = await chatbot.tasks.queryTasks(FAMILY_ID, {}, NOW);
      expect(hidden.tasks.map(t => t.title)).not.toContain('Snoozed');

      const shown = await chatbot.tasks.queryTasks(FAMILY_ID, { includeSnoozed: true }, NOW);
      expect(shown.tasks.map(t => t.title)).toContain('Snoozed');
    });

    it('treats an elapsed snooze as not snoozed', async () => {
      const { tasks } = await chatbot.tasks.queryTasks(FAMILY_ID, {}, NOW);
      expect(tasks.map(t => t.title)).toContain('Expired snooze');
    });

    it('reports total matches separately from the returned sample', async () => {
      const result = await chatbot.tasks.queryTasks(FAMILY_ID, { includeSnoozed: true, limit: 2 }, NOW);
      expect(result.count).toBe(5);
      expect(result.tasks).toHaveLength(2);
      expect(result.truncated).toBe(true);
      // The summary covers the FULL match set, not the sample — otherwise the
      // model answers "how many are overdue?" from two rows.
      expect(result.summary.byStatus.todo + result.summary.byStatus.done).toBe(5);
    });

    it('echoes the filter it applied so an empty result is interpretable', async () => {
      const result = await chatbot.tasks.queryTasks(FAMILY_ID, { searchQuery: 'nothing-matches' }, NOW);
      expect(result.count).toBe(0);
      expect(result.appliedFilters.searchQuery).toBe('nothing-matches');
    });

    it('caps limit at the hard maximum regardless of what was asked for', async () => {
      const result = await chatbot.tasks.queryTasks(FAMILY_ID, { limit: 100000 }, NOW);
      expect(result.limit).toBeLessThanOrEqual(200);
    });
  });

  describe('trips — night-based stays and tag totals', () => {
    const trip: Trip = {
      id: 'trip-1', name: 'Portland', tag: 'trip-portland',
      startDate: '2026-05-01', endDate: '2026-05-04',
      totalBudget: null, categoryBudgets: [], rating: null, notes: '',
      photoAlbumUrl: null, coverStopId: null,
      stops: [
        {
          id: 's1', type: 'stay', name: 'Hotel Deluxe',
          date: '2026-05-01', endDate: '2026-05-03',
          time: null, notes: '', sortOrder: 1,
          createdAt: '', updatedAt: '',
          location: { kind: 'verified', label: 'Hotel Deluxe', address: '1 Main St', lat: 0, lng: 0, placeId: 'p1' },
        },
      ],
    };

    beforeEach(async () => {
      await dataService.saveData(`trips_${FAMILY_ID}`, [trip]);
    });

    it('expands a stay across every night it covers, inclusive', async () => {
      // D2: endDate is the LAST NIGHT. A stay 05-01..05-03 means three nights,
      // checkout on the 4th. Off-by-one here silently loses a night of lodging.
      const result = await chatbot.trips.getItinerary(FAMILY_ID, { tripQuery: 'Portland' });
      const staying = new Map(result.agenda.map(d => [d.date, d.stayingAt]));

      expect(staying.get('2026-05-01')).toEqual(['Hotel Deluxe']);
      expect(staying.get('2026-05-02')).toEqual(['Hotel Deluxe']);
      expect(staying.get('2026-05-03')).toEqual(['Hotel Deluxe']);
      expect(staying.get('2026-05-04')).toEqual([]);
    });

    it('separates "no such trip" from "trip with nothing planned"', async () => {
      const missing = await chatbot.trips.getItinerary(FAMILY_ID, { tripQuery: 'Reykjavik' });
      expect(missing.found).toBe(false);
      expect(missing.trip).toBeNull();
      expect(missing.query).toBe('Reykjavik');

      const found = await chatbot.trips.getItinerary(FAMILY_ID, { tripQuery: 'Portland' });
      expect(found.found).toBe(true);
    });

    it('leaves spending null when it was not requested', async () => {
      // null must read as "not requested", never as "nothing was spent".
      const { trips } = await chatbot.trips.listTrips(FAMILY_ID, {});
      expect(trips[0].spending).toBeNull();
    });

    it('excludes removed transactions from trip totals (SEC-P031)', async () => {
      await dataService.saveData(`transactions_${FAMILY_ID}`, [
        txn({ id: 'live', amount: 100, tags: ['trip-portland'] }),
        txn({ id: 'ghost', amount: 500, tags: ['trip-portland'], status: 'removed' }),
      ]);
      const { trips } = await chatbot.trips.listTrips(FAMILY_ID, { includeSpending: true });
      expect(trips[0].spending?.totalSpent).toBe(100);
      expect(trips[0].spending?.transactionCount).toBe(1);
    });

    it('flags that trip totals cannot be summed across entities', async () => {
      await dataService.saveData(`transactions_${FAMILY_ID}`, [txn({ id: 't', amount: 10, tags: ['trip-portland'] })]);
      const { trips } = await chatbot.trips.listTrips(FAMILY_ID, { includeSpending: true });
      expect(trips[0].spending?.crossTripTotalsAreNotAdditive).toBe(true);
    });

    it('reports an unset budget as unset rather than as zero', async () => {
      const { trips } = await chatbot.trips.listTrips(FAMILY_ID, {});
      expect(trips[0].hasBudget).toBe(false);
      expect(trips[0].totalBudget).toBeNull();
    });
  });

  describe('projects — tag overlap and estimate-only line items', () => {
    const project: StoredProject = {
      id: 'proj-1', name: 'Kitchen Remodel', tag: 'proj-kitchen',
      startDate: '2026-04-01', endDate: '2026-08-01',
      totalBudget: 20000, notes: '',
      categoryBudgets: [
        { categoryId: 'HOME', amount: 15000, lineItems: [{ id: 'li1', name: 'Countertops', estimatedCost: 4000 }] },
      ],
      userId: 'u1', createdAt: '', updatedAt: '',
    };

    beforeEach(async () => {
      await dataService.saveData(`projects_${FAMILY_ID}`, [project]);
    });

    it('counts a transaction fully toward every tag it carries', async () => {
      // The landmine in one assertion: one $300 charge tagged for both the trip
      // and the project shows as $300 in BOTH. Summing them would report $600
      // of household spending that never happened.
      await dataService.saveData(`trips_${FAMILY_ID}`, [{
        id: 'trip-1', name: 'Portland', tag: 'trip-portland',
        startDate: '2026-05-01', endDate: '2026-05-04',
        totalBudget: null, categoryBudgets: [], rating: null, notes: '',
        photoAlbumUrl: null, coverStopId: null, stops: [],
      }]);
      await dataService.saveData(`transactions_${FAMILY_ID}`, [
        txn({ id: 'both', amount: 300, tags: ['proj-kitchen', 'trip-portland'] }),
      ]);

      const { projects } = await chatbot.projects.listProjects(FAMILY_ID);
      const { trips } = await chatbot.trips.listTrips(FAMILY_ID, { includeSpending: true });

      expect(projects[0].totalSpent).toBe(300);
      expect(trips[0].spending?.totalSpent).toBe(300);
      // Both payloads must carry the warning, because either could be read alone.
      expect(projects[0].crossProjectTotalsAreNotAdditive).toBe(true);
      expect(trips[0].spending?.crossTripTotalsAreNotAdditive).toBe(true);
    });

    it('reconciles per-category spend to the project total WITHIN one project', async () => {
      await dataService.saveData(`transactions_${FAMILY_ID}`, [
        txn({ id: 'a', amount: 100, tags: ['proj-kitchen'], categoryId: 'HOME' }),
        txn({ id: 'b', amount: 50, tags: ['proj-kitchen'], categoryId: null }),
      ]);
      const { projects } = await chatbot.projects.listProjects(FAMILY_ID);
      const sum = projects[0].categories.reduce((s, c) => s + c.spent, 0);
      expect(sum).toBe(projects[0].totalSpent);
    });

    it('excludes removed transactions from project totals (SEC-P031)', async () => {
      await dataService.saveData(`transactions_${FAMILY_ID}`, [
        txn({ id: 'live', amount: 100, tags: ['proj-kitchen'] }),
        txn({ id: 'ghost', amount: 900, tags: ['proj-kitchen'], status: 'removed' }),
      ]);
      const { projects } = await chatbot.projects.listProjects(FAMILY_ID);
      expect(projects[0].totalSpent).toBe(100);
    });

    it('names an orphaned category as unknown rather than echoing a bare id', async () => {
      await dataService.saveData(`transactions_${FAMILY_ID}`, [
        txn({ id: 'orphan', amount: 25, tags: ['proj-kitchen'], categoryId: 'GONE' }),
      ]);
      const { projects } = await chatbot.projects.listProjects(FAMILY_ID);
      const row = projects[0].categories.find(c => c.categoryId === 'GONE');
      expect(row?.categoryName).toMatch(/Unknown category/);
      expect(row?.categoryName).not.toBe('GONE');
    });

    it('keeps line items labelled as estimates and never as spend', async () => {
      const { projects } = await chatbot.projects.listProjects(FAMILY_ID);
      const home = projects[0].categories.find(c => c.categoryId === 'HOME');
      expect(home?.lineItems).toEqual([
        { id: 'li1', name: 'Countertops', estimatedCost: 4000, notes: null },
      ]);
      // If a `spent` ever appears on a line item, this app has started a
      // reconciliation PROJECTS-BRD §5.5.5 says it does not do.
      expect(home?.lineItems[0]).not.toHaveProperty('spent');
    });

    it('separates "no such project" from "project with no spending"', async () => {
      const missing = await chatbot.projects.getProject(FAMILY_ID, { projectQuery: 'Bathroom' });
      expect(missing.found).toBe(false);
      expect(missing.project).toBeNull();

      const found = await chatbot.projects.getProject(FAMILY_ID, { projectQuery: 'Kitchen' });
      expect(found.found).toBe(true);
      expect(found.project?.totalSpent).toBe(0);
    });
  });
});
