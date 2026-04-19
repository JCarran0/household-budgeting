/**
 * ProjectService Integration Tests
 *
 * Covers:
 *   - Task tag sweep on project delete (D9 / D10)
 *   - Task tag rename on project rename (D9 / D10)
 *   - Line item persistence on create/update (round-trip)
 *   - Backward compatibility: existing projects without lineItems load correctly
 */

import request from 'supertest';
import app from '../../app';
import { dataService, authService } from '../../services';
import { StoredTask } from '../../shared/types';
import { registerUser } from '../helpers/apiHelper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createProject(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Kitchen Reno',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      ...overrides,
    })
    .expect(201);
  return res.body as { id: string; tag: string; categoryBudgets: unknown[] };
}

async function createTask(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/v1/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Buy tiles', ...overrides })
    .expect(201);
  return res.body as StoredTask;
}

async function getStoredTasks(familyId: string): Promise<StoredTask[]> {
  return (await dataService.getData<StoredTask[]>(`tasks_${familyId}`)) ?? [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectService — task tag sweeps (D9/D10)', () => {
  let authToken: string;
  let familyId: string;

  beforeEach(async () => {
    if ('clear' in dataService) {
      (dataService as unknown as { clear: () => void }).clear();
    }
    authService.resetRateLimiting();

    const rand = Math.random().toString(36).substring(2, 8);
    const user = await registerUser(`proj${rand}`, 'test-password-for-project-tests');
    authToken = user.token;
    familyId = user.familyId;
  });

  // -------------------------------------------------------------------------
  // Delete sweep
  // -------------------------------------------------------------------------

  it('deleting a project strips its tag from associated tasks', async () => {
    const project = await createProject(authToken);
    const task = await createTask(authToken, { tags: [project.tag] });

    await request(app)
      .delete(`/api/v1/projects/${project.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(204);

    const tasks = await getStoredTasks(familyId);
    const updated = tasks.find((t) => t.id === task.id);
    expect(updated).toBeDefined();
    expect(updated!.tags).not.toContain(project.tag);
  });

  it('deleting a project does NOT delete the tasks themselves', async () => {
    const project = await createProject(authToken);
    const task = await createTask(authToken, { tags: [project.tag] });

    await request(app)
      .delete(`/api/v1/projects/${project.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(204);

    const tasks = await getStoredTasks(familyId);
    const stillExists = tasks.find((t) => t.id === task.id);
    expect(stillExists).toBeDefined();
  });

  it('deleting a project with no associated tasks succeeds without error', async () => {
    const project = await createProject(authToken);
    // No tasks created

    await request(app)
      .delete(`/api/v1/projects/${project.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(204);
  });

  it('deleting a project does not affect tasks tagged with OTHER projects', async () => {
    const project1 = await createProject(authToken, { name: 'Kitchen Reno' });
    const project2 = await createProject(authToken, {
      name: 'Bathroom Remodel',
      startDate: '2026-02-01',
      endDate: '2026-06-30',
    });

    const taskForProject2 = await createTask(authToken, { tags: [project2.tag] });

    await request(app)
      .delete(`/api/v1/projects/${project1.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(204);

    const tasks = await getStoredTasks(familyId);
    const unchanged = tasks.find((t) => t.id === taskForProject2.id);
    expect(unchanged).toBeDefined();
    expect(unchanged!.tags).toContain(project2.tag);
  });

  // -------------------------------------------------------------------------
  // Rename sweep
  // -------------------------------------------------------------------------

  it('renaming a project updates the tag on associated tasks', async () => {
    const project = await createProject(authToken);
    const task = await createTask(authToken, { tags: [project.tag] });

    const updateRes = await request(app)
      .put(`/api/v1/projects/${project.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Kitchen Reno 2026 Updated' })
      .expect(200);

    const newTag = updateRes.body.tag as string;
    expect(newTag).not.toBe(project.tag); // tag changed

    const tasks = await getStoredTasks(familyId);
    const updated = tasks.find((t) => t.id === task.id);
    expect(updated).toBeDefined();
    expect(updated!.tags).toContain(newTag);
    expect(updated!.tags).not.toContain(project.tag);
  });

  it('renaming a project does not affect tasks from other projects', async () => {
    const project1 = await createProject(authToken, { name: 'Deck Build' });
    const project2 = await createProject(authToken, {
      name: 'Fence Replace',
      startDate: '2026-03-01',
      endDate: '2026-07-31',
    });
    const taskForProject2 = await createTask(authToken, { tags: [project2.tag] });

    await request(app)
      .put(`/api/v1/projects/${project1.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Deck Build Phase 2' })
      .expect(200);

    const tasks = await getStoredTasks(familyId);
    const unchanged = tasks.find((t) => t.id === taskForProject2.id);
    expect(unchanged).toBeDefined();
    expect(unchanged!.tags).toContain(project2.tag);
  });
});

// ---------------------------------------------------------------------------
// Line item persistence
// ---------------------------------------------------------------------------

describe('ProjectService — line item persistence', () => {
  let authToken: string;

  beforeEach(async () => {
    if ('clear' in dataService) {
      (dataService as unknown as { clear: () => void }).clear();
    }
    authService.resetRateLimiting();

    const rand = Math.random().toString(36).substring(2, 8);
    const user = await registerUser(`li${rand}`, 'test-password-for-lineitem-tests');
    authToken = user.token;
  });

  it('creates a project with line items and server assigns UUIDs', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Bath Reno',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        totalBudget: 5000,
        categoryBudgets: [
          {
            categoryId: 'HOME_IMPROVEMENT_HARDWARE',
            amount: 2000,
            lineItems: [
              { name: 'Sheetrock', estimatedCost: 180 },
              { name: 'Joint compound', estimatedCost: 45 },
            ],
          },
        ],
      })
      .expect(201);

    const cb = res.body.categoryBudgets[0];
    expect(cb.lineItems).toHaveLength(2);
    expect(cb.lineItems[0].id).toBeTruthy();
    expect(cb.lineItems[0].name).toBe('Sheetrock');
    expect(cb.lineItems[0].estimatedCost).toBe(180);
    expect(cb.lineItems[1].id).toBeTruthy();
    // IDs must be distinct
    expect(cb.lineItems[0].id).not.toBe(cb.lineItems[1].id);
  });

  it('preserves existing line item ids on update and assigns UUIDs for new items', async () => {
    const createRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Bath Reno',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        totalBudget: 5000,
        categoryBudgets: [
          {
            categoryId: 'HOME_IMPROVEMENT_HARDWARE',
            amount: 2000,
            lineItems: [{ name: 'Sheetrock', estimatedCost: 180 }],
          },
        ],
      })
      .expect(201);

    const existingId = createRes.body.categoryBudgets[0].lineItems[0].id as string;
    expect(existingId).toBeTruthy();

    const updateRes = await request(app)
      .put(`/api/v1/projects/${createRes.body.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        categoryBudgets: [
          {
            categoryId: 'HOME_IMPROVEMENT_HARDWARE',
            amount: 2000,
            lineItems: [
              { id: existingId, name: 'Sheetrock', estimatedCost: 180 }, // preserve id
              { name: 'Drill', estimatedCost: 120 }, // new item — no id
            ],
          },
        ],
      })
      .expect(200);

    const updatedCb = updateRes.body.categoryBudgets[0];
    expect(updatedCb.lineItems).toHaveLength(2);

    const preserved = updatedCb.lineItems.find((li: { id: string }) => li.id === existingId);
    expect(preserved).toBeDefined();
    expect(preserved.name).toBe('Sheetrock');

    const newItem = updatedCb.lineItems.find((li: { name: string }) => li.name === 'Drill');
    expect(newItem).toBeDefined();
    expect(newItem.id).toBeTruthy();
    expect(newItem.id).not.toBe(existingId);
  });

  it('removes line items that are not sent on update', async () => {
    const createRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Bath Reno',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        totalBudget: 5000,
        categoryBudgets: [
          {
            categoryId: 'HOME_IMPROVEMENT_HARDWARE',
            amount: 2000,
            lineItems: [
              { name: 'Sheetrock', estimatedCost: 180 },
              { name: 'Drill', estimatedCost: 120 },
            ],
          },
        ],
      })
      .expect(201);

    // Send update with only one line item
    const updateRes = await request(app)
      .put(`/api/v1/projects/${createRes.body.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        categoryBudgets: [
          {
            categoryId: 'HOME_IMPROVEMENT_HARDWARE',
            amount: 2000,
            lineItems: [{ name: 'Sheetrock', estimatedCost: 180 }],
          },
        ],
      })
      .expect(200);

    expect(updateRes.body.categoryBudgets[0].lineItems).toHaveLength(1);
    expect(updateRes.body.categoryBudgets[0].lineItems[0].name).toBe('Sheetrock');
  });

  it('rejects line items with negative estimatedCost', async () => {
    await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Bad Project',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        totalBudget: 500,
        categoryBudgets: [
          {
            categoryId: 'HOME_IMPROVEMENT_HARDWARE',
            amount: 500,
            lineItems: [{ name: 'Bad item', estimatedCost: -10 }],
          },
        ],
      })
      .expect(400);
  });

  it('rejects line items with empty name', async () => {
    await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Bad Project',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        totalBudget: 500,
        categoryBudgets: [
          {
            categoryId: 'HOME_IMPROVEMENT_HARDWARE',
            amount: 500,
            lineItems: [{ name: '', estimatedCost: 50 }],
          },
        ],
      })
      .expect(400);
  });

  it('backward compatibility: existing projects without lineItems load and update correctly', async () => {
    // Create a project without line items (totalBudget required when categoryBudgets are set)
    const createRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Legacy Project',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        totalBudget: 1000,
        categoryBudgets: [{ categoryId: 'HOME_IMPROVEMENT_HARDWARE', amount: 1000 }],
      })
      .expect(201);

    // The created project should not have lineItems key (or it's an empty array)
    const cb = createRes.body.categoryBudgets[0];
    expect(cb.lineItems === undefined || cb.lineItems.length === 0).toBe(true);

    // Update the same project — should work without error
    const updateRes = await request(app)
      .put(`/api/v1/projects/${createRes.body.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ notes: 'updated notes' })
      .expect(200);

    expect(updateRes.body.notes).toBe('updated notes');
    const updatedCb = updateRes.body.categoryBudgets[0];
    expect(updatedCb.lineItems === undefined || updatedCb.lineItems.length === 0).toBe(true);
  });
});
