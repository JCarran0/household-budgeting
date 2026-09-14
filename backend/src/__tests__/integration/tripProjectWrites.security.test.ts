/**
 * Trip & project write actions — the guards that make them safe (plan task 3.2)
 *
 * Three properties are load-bearing here, and each has a positive control so a
 * blanket-deny implementation cannot pass:
 *
 * 1. The model cannot create a Stay. Lodging requires a Google-verified place
 *    with real coordinates; a fabricated one is plotted on the Map tab and
 *    queried for photos, so "well-formed" is precisely the dangerous case.
 * 2. Locations the model supplies are free text, never `kind: 'verified'`.
 *    "Verified" is a claim about provenance, and the provenance of a
 *    model-supplied address is the model.
 * 3. A line item can only be added to a category the project ALREADY budgets.
 *    Creating a budget means choosing an amount, and the project schema
 *    enforces totalBudget >= Σ amounts — a budgeting decision, not a
 *    bookkeeping one.
 *
 * Stay-overlap is the fourth: it is validated through the SHARED helper in its
 * own pre-execution pass, so a colliding move fails the batch cleanly instead
 * of throwing half-way through it (REQ-P023).
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import app from '../../app';
import {
  dataService,
  authService,
  tripService,
  projectService,
  categoryService,
} from '../../services';
import { registerUser } from '../helpers/apiHelper';
import {getChatAction } from '../../services/chatActions';
import { proposalStore } from '../../services';
import type { ProposalRow } from '../../shared/types';

async function createUser(prefix: string) {
  const rand = Math.random().toString(36).substring(2, 8);
  return registerUser(`${prefix}${rand}`, 'secure-test-passphrase-long-enough');
}

function issuePlan(user: { userId: string; familyId: string }, rows: ProposalRow[]) {
  return proposalStore.issue({
    userId: user.userId,
    familyId: user.familyId,
    conversationId: randomUUID(),
    traceId: 'trace_trip_project_test',
    proposalInput: { rows, reasoning: 'Test plan' },
  });
}

function row(
  index: number,
  actionId: ProposalRow['actionId'],
  params: Record<string, unknown>,
): ProposalRow {
  return {
    rowId: `row-${index}`,
    actionId,
    label: 'Test row',
    params,
    displaySummary: `${actionId} row`,
    // SEC-P010 requires a display field per param; these tests are about the
    // semantic guards, so the coverage is generated rather than hand-written.
    displayFields: Object.entries(params).map(([key, value]) => ({
      key,
      label: key,
      value: String(value),
      editable: false,
      type: 'text' as const,
    })),
  };
}

function confirm(token: string, proposalId: string, rows: ProposalRow[]) {
  return request(app)
    .post('/api/v1/chatbot/actions/confirm')
    .set('Authorization', `Bearer ${token}`)
    .send({ proposalId, rows: rows.map(r => ({ rowId: r.rowId, params: r.params })) });
}

async function seedTrip(user: { userId: string; familyId: string }) {
  return tripService.createTrip(
    { name: `Trip ${Math.random().toString(36).slice(2, 7)}`, startDate: '2026-10-01', endDate: '2026-10-10' },
    user.familyId,
    user.userId,
  );
}

const VERIFIED = {
  kind: 'verified' as const,
  label: 'Hotel Real',
  address: '1 Real St',
  lat: 41.38,
  lng: 2.19,
  placeId: 'place-real',
};

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
  authService.resetRateLimiting();
});

describe('add_trip_stop — what the model is not allowed to assert', () => {
  it('has no way to express a stay at all', () => {
    // The refusal lives in the params schema rather than in the handler, so no
    // future handler has to remember to check for it.
    const def = getChatAction('add_trip_stop');
    const parsed = def!.paramsSchema.safeParse({
      type: 'stay',
      tripId: 't1',
      date: '2026-10-02',
      name: 'Hotel Arts',
      endDate: '2026-10-04',
      location: VERIFIED,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts an eat stop — the schema is not refusing everything', async () => {
    const user = await createUser('trip');
    const trip = await seedTrip(user);
    const rows = [
      row(0, 'add_trip_stop', {
        type: 'eat',
        tripId: trip.id,
        date: '2026-10-02',
        name: 'Bar Cañete',
        locationLabel: 'Carrer de la Unió',
      }),
    ];
    const proposal = await issuePlan(user, rows);

    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const after = await tripService.getTrip(trip.id, user.familyId);
    expect(after?.stops).toHaveLength(1);
    expect(after?.stops[0]).toMatchObject({ type: 'eat', name: 'Bar Cañete', date: '2026-10-02' });
  });

  it('writes the location as free text, never as a verified place', async () => {
    const user = await createUser('trip');
    const trip = await seedTrip(user);
    const rows = [
      row(0, 'add_trip_stop', {
        type: 'play',
        tripId: trip.id,
        date: '2026-10-03',
        name: 'Sagrada Família',
        locationLabel: 'Carrer de Mallorca, 401',
      }),
    ];
    const proposal = await issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const after = await tripService.getTrip(trip.id, user.familyId);
    const stop = after!.stops[0];
    expect(stop.type).toBe('play');
    if (stop.type !== 'play') return;
    // A freeText location claims a label and nothing else. No placeId means
    // nothing downstream will plot it or query photos for it as though it were
    // a real, looked-up place.
    expect(stop.location).toEqual({ kind: 'freeText', label: 'Carrer de Mallorca, 401' });
    expect(JSON.stringify(stop)).not.toContain('verified');
  });

  it('refuses a trip belonging to another household, and says no more', async () => {
    const owner = await createUser('tripowner');
    const attacker = await createUser('tripother');
    const trip = await seedTrip(owner);

    const rows = [
      row(0, 'add_trip_stop', {
        type: 'eat',
        tripId: trip.id,
        date: '2026-10-02',
        name: 'Probe',
      }),
    ];
    const proposal = await issuePlan(attacker, rows);

    const res = await confirm(attacker.token, proposal.proposalId, rows).expect(400);
    // Reads exactly like a trip that never existed — which is the correct
    // amount of information to leak about another family's data: none.
    expect(res.body.error).toMatch(/no longer exists/i);
    expect(res.body.error).not.toContain(trip.name);

    const untouched = await tripService.getTrip(trip.id, owner.familyId);
    expect(untouched?.stops).toHaveLength(0);
  });
});

describe('move_trip_stop — overlap is caught before anything is written', () => {
  async function tripWithTwoStays(user: { userId: string; familyId: string }) {
    const trip = await seedTrip(user);
    const first = await tripService.createStop(
      trip.id,
      user.familyId,
      { type: 'stay', date: '2026-10-01', name: 'Hotel A', location: VERIFIED, endDate: '2026-10-03' },
      user.userId,
    );
    const second = await tripService.createStop(
      trip.id,
      user.familyId,
      {
        type: 'stay',
        date: '2026-10-06',
        name: 'Hotel B',
        location: { ...VERIFIED, placeId: 'place-b', label: 'Hotel B' },
        endDate: '2026-10-08',
      },
      user.userId,
    );
    return { trip, first, second };
  }

  it('rejects a move that would collide with another stay, and names the conflict', async () => {
    const user = await createUser('move');
    const { trip, second } = await tripWithTwoStays(user);

    const rows = [
      row(0, 'move_trip_stop', {
        tripId: trip.id,
        stopId: second.id,
        date: '2026-10-02',
        endDate: '2026-10-04',
      }),
    ];
    const proposal = await issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.errorCode).toBe('validation_failed');
    // Naming the blocker is the point — "rejected" alone leaves the user
    // guessing which stay is in the way.
    expect(res.body.error).toContain('Hotel A');

    const after = await tripService.getTrip(trip.id, user.familyId);
    expect(after?.stops.find(s => s.id === second.id)?.date).toBe('2026-10-06');
  });

  it('applies NOTHING when a later row collides — the batch is all-or-nothing', async () => {
    // This is the assertion that proves overlap runs in the pre-execution pass
    // rather than inside execute. Folding it into the execute loop leaves the
    // eat stop written and the batch half-applied.
    const user = await createUser('move');
    const { trip, second } = await tripWithTwoStays(user);

    const rows = [
      row(0, 'add_trip_stop', { type: 'eat', tripId: trip.id, date: '2026-10-02', name: 'Lunch' }),
      row(1, 'move_trip_stop', {
        tripId: trip.id,
        stopId: second.id,
        date: '2026-10-02',
        endDate: '2026-10-04',
      }),
    ];
    const proposal = await issuePlan(user, rows);

    await confirm(user.token, proposal.proposalId, rows).expect(400);

    const after = await tripService.getTrip(trip.id, user.familyId);
    expect(after?.stops.some(s => s.type === 'eat')).toBe(false);
    expect(after?.stops.find(s => s.id === second.id)?.date).toBe('2026-10-06');
  });

  it('allows a move into free space — overlap detection is not blanket-deny', async () => {
    const user = await createUser('move');
    const { trip, second } = await tripWithTwoStays(user);

    const rows = [
      row(0, 'move_trip_stop', {
        tripId: trip.id,
        stopId: second.id,
        date: '2026-10-05',
        endDate: '2026-10-07',
      }),
    ];
    const proposal = await issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const after = await tripService.getTrip(trip.id, user.familyId);
    const moved = after?.stops.find(s => s.id === second.id);
    expect(moved).toMatchObject({ date: '2026-10-05', endDate: '2026-10-07' });
  });

  it('refuses to move a stay without an end date rather than inventing one', async () => {
    // endDate is the LAST NIGHT (TRIP-ITINERARIES-BRD D2). Defaulting it would
    // silently shorten or extend a booking.
    const user = await createUser('move');
    const { trip, first } = await tripWithTwoStays(user);

    const rows = [row(0, 'move_trip_stop', { tripId: trip.id, stopId: first.id, date: '2026-10-02' })];
    const proposal = await issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    expect(res.body.error).toMatch(/end date/i);

    const after = await tripService.getTrip(trip.id, user.familyId);
    const unmoved = after?.stops.find(s => s.id === first.id);
    expect(unmoved).toMatchObject({ date: '2026-10-01', endDate: '2026-10-03' });
  });
});

describe('add_project_line_item — project-level estimates with unique tags', () => {
  async function seedProject(user: { userId: string; familyId: string }, budgeted: boolean) {
    await dataService.saveCategories(
      [{
        id: 'HOME_IMPROVEMENT',
        name: 'Home Improvement',
        parentId: null,
        isCustom: false,
        isHidden: false,
        isRollover: false,
        isIncome: false,
        isSavings: false,
      }],
      user.familyId,
    );
    const category = (await categoryService.getCategoryById('HOME_IMPROVEMENT', user.familyId))!;
    const project = await projectService.createProject(
      {
        name: `Kitchen ${Math.random().toString(36).slice(2, 7)}`,
        startDate: '2026-10-01',
        endDate: '2026-12-01',
        totalBudget: budgeted ? 50000 : null,
        categoryBudgets: budgeted ? [{ categoryId: category.id, amount: 50000 }] : [],
      },
      user.familyId,
      user.userId,
    );
    return { project, category };
  }

  // PROJECTS-BRD v2.0 §5.5.2 moved line items off category budgets and onto the
  // project. The old "refuses a category the project does not budget" case
  // guarded an attachment point that no longer exists; the refusal it was really
  // protecting — the action declines rather than inventing where an estimate
  // belongs — is now the duplicate-tag case below.

  it('refuses a tag the project already uses, and writes nothing', async () => {
    const user = await createUser('proj');
    const { project } = await seedProject(user, true);
    await projectService.updateProject(
      project.id,
      { lineItems: [{ id: 'li-existing', name: 'Cabinet boxes', estimatedCost: 3000, tag: 'cabinets' }] },
      user.familyId,
      user.userId,
    );

    const rows = [
      row(0, 'add_project_line_item', {
        projectId: project.id,
        name: 'Cabinet doors',
        estimatedCost: 4200,
        tag: 'Cabinets',
      }),
    ];
    const proposal = await issuePlan(user, rows);

    const res = await confirm(user.token, proposal.proposalId, rows).expect(400);
    // Normalization happens before the clash check, so a case variant is caught.
    expect(res.body.error).toMatch(/already has a line item tagged/i);

    const after = await projectService.getProject(project.id, user.familyId);
    expect(after?.lineItems).toHaveLength(1);
    expect(after?.lineItems[0].id).toBe('li-existing');
  });

  it('refuses the reserved project: tag prefix', async () => {
    const def = getChatAction('add_project_line_item');
    const parsed = def!.paramsSchema.safeParse({
      projectId: 'p1', name: 'Cabinets', estimatedCost: 4200, tag: 'project:kitchen',
    });
    expect(parsed.success).toBe(false);
  });

  it('adds a project-level line item and leaves every budget amount alone', async () => {
    const user = await createUser('proj');
    const { project, category } = await seedProject(user, true);

    const rows = [
      row(0, 'add_project_line_item', {
        projectId: project.id,
        name: 'Cabinets',
        estimatedCost: 4200,
        tag: 'Cabinets',
      }),
    ];
    const proposal = await issuePlan(user, rows);
    await confirm(user.token, proposal.proposalId, rows).expect(200);

    const after = await projectService.getProject(project.id, user.familyId);
    expect(after?.lineItems).toHaveLength(1);
    // Stored normalized, so it matches lowercase transaction tags.
    expect(after?.lineItems[0]).toMatchObject({
      name: 'Cabinets', estimatedCost: 4200, tag: 'cabinets',
    });
    // The estimating axis must not perturb the budgeting axis (§5.5.2).
    const budget = after!.categoryBudgets.find(cb => cb.categoryId === category.id);
    expect(budget?.amount).toBe(50000);
    expect(after?.totalBudget).toBe(50000);
    // And it never writes to a transaction — matching is derived at read time.
    expect(after?.lineItems[0]).not.toHaveProperty('transactionIds');
  });

  it('assigns the line item id server-side rather than taking one from the model', async () => {
    // A model-chosen UUID could collide with an existing item and overwrite it
    // when the whole array is saved back.
    const def = getChatAction('add_project_line_item');
    const parsed = def!.paramsSchema.safeParse({
      projectId: 'p1',
      name: 'Cabinets',
      estimatedCost: 4200,
      tag: 'cabinets',
      id: randomUUID(),
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty('id');
  });

  it('calls the change an estimate everywhere the user will read it back', async () => {
    const user = await createUser('proj');
    const { project } = await seedProject(user, true);

    const rows = [
      row(0, 'add_project_line_item', {
        projectId: project.id,
        name: 'Cabinets',
        estimatedCost: 4200,
        tag: 'cabinets',
      }),
    ];
    const proposal = await issuePlan(user, rows);
    const res = await confirm(user.token, proposal.proposalId, rows).expect(200);

    // The activity log shows resource.label. The figure written is an ESTIMATE;
    // a label reading "Cabinets $4,200" would be read as money spent. (An actual
    // exists now, but it is derived from tags, never from this number.)
    expect(res.body.resource.label).toMatch(/estimate/i);
  });
});
