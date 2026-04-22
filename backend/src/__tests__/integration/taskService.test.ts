import request from 'supertest';
import app from '../../app';
import { dataService, authService } from '../../services';
import { registerUser } from '../helpers/apiHelper';
import { seedTasks, getLeaderboardEntry, type TaskSeed } from '../helpers/seedTasks';
import type { StoredTask } from '../../shared/types';

describe('Task Service Integration Tests', () => {
  let authToken: string;
  let userId: string;

  beforeEach(async () => {
    if ('clear' in dataService) {
      (dataService as unknown as { clear: () => void }).clear();
    }
    authService.resetRateLimiting();

    const rand = Math.random().toString(36).substring(2, 8);
    const user = await registerUser(`task${rand}`, 'test-password-for-task-tests');
    authToken = user.token;
    userId = user.userId;
  });

  // -------------------------------------------------------------------------
  // Task CRUD
  // -------------------------------------------------------------------------

  describe('POST /api/v1/tasks — create task', () => {
    it('should create a task with defaults', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Do laundry' })
        .expect(201);

      expect(res.body.title).toBe('Do laundry');
      expect(res.body.status).toBe('todo');
      expect(res.body.scope).toBe('family');
      expect(res.body.assigneeId).toBeNull();
      expect(res.body.createdBy).toBe(userId);
      expect(res.body.transitions).toHaveLength(1);
      expect(res.body.transitions[0].fromStatus).toBeNull();
      expect(res.body.transitions[0].toStatus).toBe('todo');
    });

    it('should create a personal task with assignee', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'My personal task',
          scope: 'personal',
          assigneeId: userId,
          dueDate: '2026-05-01',
        })
        .expect(201);

      expect(res.body.scope).toBe('personal');
      expect(res.body.assigneeId).toBe(userId);
      expect(res.body.dueDate).toBe('2026-05-01');
      expect(res.body.assignedAt).toBeTruthy();
    });

    it('should reject invalid title', async () => {
      await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: '' })
        .expect(400);
    });
  });

  describe('GET /api/v1/tasks/board — board tasks', () => {
    it('should return tasks on the board', async () => {
      await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Task A' })
        .expect(201);

      const res = await request(app)
        .get('/api/v1/tasks/board')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Task A');
    });
  });

  // -------------------------------------------------------------------------
  // Status transitions
  // -------------------------------------------------------------------------

  describe('PATCH /api/v1/tasks/:id/status — status transitions', () => {
    it('should move task to started and log transition', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Start me' })
        .expect(201);

      const res = await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'started' })
        .expect(200);

      expect(res.body.status).toBe('started');
      expect(res.body.startedAt).toBeTruthy();
      expect(res.body.transitions).toHaveLength(2);
      expect(res.body.transitions[1].fromStatus).toBe('todo');
      expect(res.body.transitions[1].toStatus).toBe('started');
    });

    it('should move task to done and set completedAt', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Complete me' })
        .expect(201);

      const res = await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      expect(res.body.status).toBe('done');
      expect(res.body.completedAt).toBeTruthy();
    });

    it('should move task to cancelled and set cancelledAt', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Cancel me' })
        .expect(201);

      const res = await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'cancelled' })
        .expect(200);

      expect(res.body.status).toBe('cancelled');
      expect(res.body.cancelledAt).toBeTruthy();
    });

    it('should clear convenience timestamps when moving back to todo', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Back to todo' })
        .expect(201);

      // Move to started
      await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'started' })
        .expect(200);

      // Move back to todo
      const res = await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'todo' })
        .expect(200);

      expect(res.body.status).toBe('todo');
      expect(res.body.startedAt).toBeNull();
      expect(res.body.completedAt).toBeNull();
      expect(res.body.cancelledAt).toBeNull();
      expect(res.body.transitions).toHaveLength(3);
    });

    it('should record full transition log for done→started→done cycle', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Cycle task' })
        .expect(201);

      // todo → done
      await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      // done → started
      await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'started' })
        .expect(200);

      // started → done
      const finalRes = await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      expect(finalRes.body.transitions).toHaveLength(4);
      expect(finalRes.body.completedAt).toBeTruthy();
      // completedAt should be the LATEST done transition
      expect(finalRes.body.completedAt).toBe(finalRes.body.transitions[3].timestamp);
    });
  });

  // -------------------------------------------------------------------------
  // Auto-assignment
  // -------------------------------------------------------------------------

  describe('Auto-assignment on drag to started', () => {
    it('should auto-assign unassigned task when moved to started', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Unassigned task' })
        .expect(201);

      expect(createRes.body.assigneeId).toBeNull();

      const res = await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'started' })
        .expect(200);

      expect(res.body.assigneeId).toBe(userId);
      expect(res.body.assignedAt).toBeTruthy();
    });

    it('should NOT reassign already-assigned task when moved to started', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Assigned task', assigneeId: 'other-user-id' })
        .expect(201);

      const res = await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'started' })
        .expect(200);

      expect(res.body.assigneeId).toBe('other-user-id');
    });
  });

  // -------------------------------------------------------------------------
  // Board archiving
  // -------------------------------------------------------------------------

  describe('Board archiving (v2.0 rules)', () => {
    it('should exclude done tasks older than 14 days from board', async () => {
      // Create task and complete it
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Old task' })
        .expect(201);

      // Complete it
      await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      // Manually backdate the completedAt to 15 days ago
      const familyId = (await request(app)
        .get('/api/v1/family')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)).body.family.id;

      const tasks = await dataService.getData<any[]>(`tasks_${familyId}`);
      if (tasks) {
        const old = new Date();
        old.setDate(old.getDate() - 15);
        tasks[0].completedAt = old.toISOString();
        await dataService.saveData(`tasks_${familyId}`, tasks);
      }

      // Board should not include this task
      const boardRes = await request(app)
        .get('/api/v1/tasks/board')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(boardRes.body).toHaveLength(0);

      // But full list should include it
      const allRes = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(allRes.body).toHaveLength(1);
    });

    it('should keep done tasks within 14-day window on board', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Recent done' })
        .expect(201);

      await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      const boardRes = await request(app)
        .get('/api/v1/tasks/board')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(boardRes.body).toHaveLength(1);
    });

    it('should exclude cancelled tasks from board immediately (no 14-day window)', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Just cancelled' })
        .expect(201);

      await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'cancelled' })
        .expect(200);

      const boardRes = await request(app)
        .get('/api/v1/tasks/board')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(boardRes.body).toHaveLength(0);

      // History still has it
      const allRes = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(allRes.body).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // v2.0 — Snooze
  // -------------------------------------------------------------------------

  describe('POST /api/v1/tasks/:id/snooze', () => {
    const futureISO = (msFromNow = 60 * 60 * 1000): string =>
      new Date(Date.now() + msFromNow).toISOString();

    it('should set snoozedUntil without touching status or sortOrder or logging a transition', async () => {
      const create = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Snooze me' })
        .expect(201);

      const before = create.body;

      const res = await request(app)
        .post(`/api/v1/tasks/${before.id}/snooze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ snoozedUntil: futureISO() })
        .expect(200);

      expect(res.body.snoozedUntil).toBeTruthy();
      expect(res.body.status).toBe(before.status);
      expect(res.body.sortOrder).toBe(before.sortOrder);
      expect(res.body.transitions).toHaveLength(before.transitions.length);
    });

    it('should clear snooze when snoozedUntil=null', async () => {
      const create = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Snooze clear' })
        .expect(201);

      await request(app)
        .post(`/api/v1/tasks/${create.body.id}/snooze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ snoozedUntil: futureISO() })
        .expect(200);

      const cleared = await request(app)
        .post(`/api/v1/tasks/${create.body.id}/snooze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ snoozedUntil: null })
        .expect(200);

      expect(cleared.body.snoozedUntil).toBeNull();
    });

    it('should hide snoozed task from default board list, include with ?includeSnoozed=true', async () => {
      const create = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Hidden when snoozed' })
        .expect(201);

      await request(app)
        .post(`/api/v1/tasks/${create.body.id}/snooze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ snoozedUntil: futureISO() })
        .expect(200);

      const hidden = await request(app)
        .get('/api/v1/tasks/board')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(hidden.body).toHaveLength(0);

      const shown = await request(app)
        .get('/api/v1/tasks/board')
        .query({ includeSnoozed: 'true' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(shown.body).toHaveLength(1);
    });

    it('should auto-unsnooze once snoozedUntil has passed', async () => {
      await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Expires' })
        .expect(201);

      // Manually backdate snoozedUntil via storage
      const familyId = (await request(app)
        .get('/api/v1/family')
        .set('Authorization', `Bearer ${authToken}`)).body.family.id;
      const tasks = await dataService.getData<any[]>(`tasks_${familyId}`);
      if (tasks) {
        const past = new Date(Date.now() - 60_000).toISOString();
        tasks[0].snoozedUntil = past;
        await dataService.saveData(`tasks_${familyId}`, tasks);
      }

      const res = await request(app)
        .get('/api/v1/tasks/board')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
    });

    it('should clear snoozedUntil when task transitions to done', async () => {
      const create = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Snoozed then done' })
        .expect(201);

      await request(app)
        .post(`/api/v1/tasks/${create.body.id}/snooze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ snoozedUntil: futureISO() })
        .expect(200);

      const res = await request(app)
        .patch(`/api/v1/tasks/${create.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      expect(res.body.snoozedUntil).toBeNull();
    });

    it('should clear snoozedUntil when task transitions to cancelled', async () => {
      const create = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Snoozed then cancel' })
        .expect(201);

      await request(app)
        .post(`/api/v1/tasks/${create.body.id}/snooze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ snoozedUntil: futureISO() })
        .expect(200);

      const res = await request(app)
        .patch(`/api/v1/tasks/${create.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'cancelled' })
        .expect(200);

      expect(res.body.snoozedUntil).toBeNull();
    });

    it('should reject snooze on done task', async () => {
      const create = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Done already' })
        .expect(201);

      await request(app)
        .patch(`/api/v1/tasks/${create.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      await request(app)
        .post(`/api/v1/tasks/${create.body.id}/snooze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ snoozedUntil: futureISO() })
        .expect(400);
    });

    it('should reject snoozedUntil in the past', async () => {
      const create = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'In the past' })
        .expect(201);

      await request(app)
        .post(`/api/v1/tasks/${create.body.id}/snooze`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ snoozedUntil: new Date(Date.now() - 60_000).toISOString() })
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------
  // v2.0 — Reorder
  // -------------------------------------------------------------------------

  describe('POST /api/v1/tasks/:id/reorder', () => {
    it('should update sortOrder within same status without logging a transition', async () => {
      const a = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'A' })
        .expect(201);

      const beforeTransitions = a.body.transitions.length;

      const res = await request(app)
        .post(`/api/v1/tasks/${a.body.id}/reorder`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'todo', sortOrder: 123.5 })
        .expect(200);

      expect(res.body.sortOrder).toBe(123.5);
      expect(res.body.status).toBe('todo');
      expect(res.body.transitions).toHaveLength(beforeTransitions);
    });

    it('should combine status change + reorder in one call and log the transition', async () => {
      const a = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'To start' })
        .expect(201);

      const res = await request(app)
        .post(`/api/v1/tasks/${a.body.id}/reorder`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'started', sortOrder: 7.5 })
        .expect(200);

      expect(res.body.status).toBe('started');
      expect(res.body.sortOrder).toBe(7.5);
      expect(res.body.transitions.length).toBe(a.body.transitions.length + 1);
      expect(res.body.startedAt).toBeTruthy();
    });

    it('should reject reorder into done', async () => {
      const a = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'No reorder to done' })
        .expect(201);

      await request(app)
        .post(`/api/v1/tasks/${a.body.id}/reorder`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done', sortOrder: 1 })
        .expect(400);
    });

    it('should reject reorder into cancelled', async () => {
      const a = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'No reorder to cancelled' })
        .expect(201);

      await request(app)
        .post(`/api/v1/tasks/${a.body.id}/reorder`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'cancelled', sortOrder: 1 })
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------
  // v2.0 — Top-of-column on non-drag status change
  // -------------------------------------------------------------------------

  describe('Non-drag status change positions task at top of destination column', () => {
    it('should place a transitioned task above existing siblings', async () => {
      // Seed: two tasks in 'started'
      const a = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'A' })
        .expect(201);
      const b = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'B' })
        .expect(201);

      await request(app)
        .patch(`/api/v1/tasks/${a.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'started' })
        .expect(200);
      await request(app)
        .patch(`/api/v1/tasks/${b.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'started' })
        .expect(200);

      // Now move a third task to started via status endpoint — it should be above both
      const c = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'C' })
        .expect(201);

      const transitioned = await request(app)
        .patch(`/api/v1/tasks/${c.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'started' })
        .expect(200);

      // All three tasks now in started; c should have the smallest sortOrder
      const sorted = [a.body, b.body, transitioned.body]
        .map((t) => t.sortOrder as number)
        .sort((x, y) => x - y);
      expect(sorted[0]).toBe(transitioned.body.sortOrder);
    });
  });

  // -------------------------------------------------------------------------
  // v2.0 — Leaderboard family-scope filter (D13)
  // -------------------------------------------------------------------------

  describe('Leaderboard family-scope (v2.0 behavior change)', () => {
    it('should NOT count personal tasks toward any user, including the creator', async () => {
      const create = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Personal task', scope: 'personal', assigneeId: userId })
        .expect(201);

      await request(app)
        .patch(`/api/v1/tasks/${create.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      const res = await request(app)
        .get('/api/v1/tasks/leaderboard')
        .query({ timezone: 'America/New_York' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const userEntry = res.body.entries.find((e: any) => e.userId === userId);
      expect(userEntry).toBeDefined();
      expect(userEntry.completedToday).toBe(0);
      expect(userEntry.completedThisWeek).toBe(0);
      expect(userEntry.completedThisMonth).toBe(0);
    });

    it('should count family tasks toward the completer', async () => {
      const create = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Family task' })
        .expect(201);

      await request(app)
        .patch(`/api/v1/tasks/${create.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      const res = await request(app)
        .get('/api/v1/tasks/leaderboard')
        .query({ timezone: 'America/New_York' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const userEntry = res.body.entries.find((e: any) => e.userId === userId);
      expect(userEntry.completedToday).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Leaderboard
  // -------------------------------------------------------------------------

  describe('GET /api/v1/tasks/leaderboard', () => {
    it('should return leaderboard with completion counts', async () => {
      // Create and complete a task
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Completed task' })
        .expect(201);

      await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      const res = await request(app)
        .get('/api/v1/tasks/leaderboard')
        .query({ timezone: 'America/New_York' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.entries).toBeDefined();
      expect(res.body.boundaries).toBeDefined();

      // Find the current user in entries
      const userEntry = res.body.entries.find((e: any) => e.userId === userId);
      expect(userEntry).toBeDefined();
      expect(userEntry.completedToday).toBe(1);
      expect(userEntry.completedThisWeek).toBeGreaterThanOrEqual(1);
      expect(userEntry.completedThisMonth).toBeGreaterThanOrEqual(1);
    });

    it('should require timezone parameter', async () => {
      await request(app)
        .get('/api/v1/tasks/leaderboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should credit the assignee, not the completer, when assignee is set', async () => {
      // Create a family task assigned to a different user, then complete it
      // as the authenticated user. The credit should land on the assignee.
      const OTHER_USER = '11111111-2222-3333-4444-555555555555';

      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Task for someone else', assigneeId: OTHER_USER })
        .expect(201);

      await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      const res = await request(app)
        .get('/api/v1/tasks/leaderboard')
        .query({ timezone: 'America/New_York' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const completerEntry = res.body.entries.find((e: any) => e.userId === userId);
      const assigneeEntry = res.body.entries.find((e: any) => e.userId === OTHER_USER);

      expect(completerEntry.completedToday).toBe(0);
      expect(assigneeEntry).toBeDefined();
      expect(assigneeEntry.completedToday).toBe(1);
    });

    it('should credit each checked subtask toward the leaderboard', async () => {
      // Parent stays in 'todo' so it doesn't contribute a parent-task point.
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Laundry routine',
          subTasks: [{ title: 'Wash' }, { title: 'Dry' }, { title: 'Fold' }],
        })
        .expect(201);

      // Check two of three subtasks.
      const subTasks = createRes.body.subTasks.map(
        (st: { id: string; title: string; completed: boolean }, i: number) => ({
          id: st.id,
          title: st.title,
          completed: i < 2,
        }),
      );
      await request(app)
        .put(`/api/v1/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ subTasks })
        .expect(200);

      const res = await request(app)
        .get('/api/v1/tasks/leaderboard')
        .query({ timezone: 'America/New_York' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const entry = res.body.entries.find((e: any) => e.userId === userId);
      expect(entry.completedToday).toBe(2);
    });

    it('should credit subtasks to the parent assignee when set', async () => {
      const OTHER_USER = '22222222-3333-4444-5555-666666666666';

      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Shared chore with subs',
          assigneeId: OTHER_USER,
          subTasks: [{ title: 'Step 1' }],
        })
        .expect(201);

      const subTasks = createRes.body.subTasks.map(
        (st: { id: string; title: string }) => ({
          id: st.id,
          title: st.title,
          completed: true,
        }),
      );
      await request(app)
        .put(`/api/v1/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ subTasks })
        .expect(200);

      const res = await request(app)
        .get('/api/v1/tasks/leaderboard')
        .query({ timezone: 'America/New_York' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const completerEntry = res.body.entries.find((e: any) => e.userId === userId);
      const assigneeEntry = res.body.entries.find((e: any) => e.userId === OTHER_USER);

      expect(completerEntry.completedToday).toBe(0);
      expect(assigneeEntry.completedToday).toBe(1);
    });

    it('should un-credit a subtask when it is unchecked', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Toggle test', subTasks: [{ title: 'A' }] })
        .expect(201);

      const subId = createRes.body.subTasks[0].id;

      // Check
      await request(app)
        .put(`/api/v1/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ subTasks: [{ id: subId, title: 'A', completed: true }] })
        .expect(200);

      // Uncheck
      await request(app)
        .put(`/api/v1/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ subTasks: [{ id: subId, title: 'A', completed: false }] })
        .expect(200);

      const res = await request(app)
        .get('/api/v1/tasks/leaderboard')
        .query({ timezone: 'America/New_York' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const entry = res.body.entries.find((e: any) => e.userId === userId);
      expect(entry.completedToday).toBe(0);
    });

    it('should ignore client-supplied subtask timestamps (server stamps authoritatively)', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Stamp test', subTasks: [{ title: 'A' }] })
        .expect(201);

      const subId = createRes.body.subTasks[0].id;

      // Client tries to backdate the subtask to last year; server must ignore.
      const updateRes = await request(app)
        .put(`/api/v1/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subTasks: [
            {
              id: subId,
              title: 'A',
              completed: true,
              completedAt: '2025-01-01T00:00:00.000Z',
              completedBy: 'attacker-user-id',
            },
          ],
        })
        .expect(200);

      const stored = updateRes.body.subTasks[0];
      expect(stored.completed).toBe(true);
      // Server stamps its own timestamp — not what the client sent.
      expect(stored.completedAt).not.toBe('2025-01-01T00:00:00.000Z');
      expect(stored.completedBy).toBe(userId);

      // And it lands in today, not a year ago.
      const res = await request(app)
        .get('/api/v1/tasks/leaderboard')
        .query({ timezone: 'America/New_York' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const entry = res.body.entries.find((e: any) => e.userId === userId);
      expect(entry.completedToday).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Leaderboard — streaks & badges (v2.2)
  // -------------------------------------------------------------------------

  describe('GET /api/v1/tasks/leaderboard — streaks & badges', () => {
    /** Repeated `{ completedAt: todayIso }` factory for batch volume tests. */
    const completedTodayN = (n: number, completedAt: string): TaskSeed[] =>
      Array.from({ length: n }, () => ({ completedAt }));

    it('response includes currentStreak, bestStreak, earnedBadges per entry', async () => {
      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.currentStreak).toBe(0);
      expect(entry.bestStreak).toBe(0);
      expect(entry.earnedBadges).toEqual([]);
    });

    it('user with 1 completion today: currentStreak=1, bestStreak=1', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'One today' })
        .expect(201);
      await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.currentStreak).toBe(1);
      expect(entry.bestStreak).toBe(1);
    });

    it('user with 1 completion yesterday (no today): grace → currentStreak=1', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Yesterday' })
        .expect(201);
      await request(app)
        .patch(`/api/v1/tasks/${createRes.body.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'done' })
        .expect(200);

      // Backdate the stored completedAt to ~24h ago.
      const familyId = (
        await request(app)
          .get('/api/v1/family')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200)
      ).body.family.id as string;
      const tasks = (await dataService.getData<StoredTask[]>(`tasks_${familyId}`))!;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      tasks[0].completedAt = yesterday.toISOString();
      await dataService.saveData(`tasks_${familyId}`, tasks);

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.currentStreak).toBe(1);
      expect(entry.bestStreak).toBe(1);
    });

    it('5 completions today → volume_5 present in earnedBadges', async () => {
      const todayIso = new Date().toISOString();
      await seedTasks({ authToken, ownerUserId: userId, tasks: completedTodayN(5, todayIso) });

      const entry = await getLeaderboardEntry(authToken, userId);
      const ids = entry.earnedBadges.map((b) => b.id);
      expect(ids).toContain('volume_5');
      expect(ids).not.toContain('volume_10');
      expect(ids).not.toContain('volume_20');
    });

    it('20 completions today → volume_5, volume_10, volume_20 all present (cumulative)', async () => {
      const todayIso = new Date().toISOString();
      await seedTasks({ authToken, ownerUserId: userId, tasks: completedTodayN(20, todayIso) });

      const entry = await getLeaderboardEntry(authToken, userId);
      const ids = entry.earnedBadges.map((b) => b.id);
      expect(ids).toContain('volume_5');
      expect(ids).toContain('volume_10');
      expect(ids).toContain('volume_20');
      expect(ids).toContain('lifetime_10');
    });

    it('personal tasks never contribute to streaks or badges (regression guard)', async () => {
      const todayIso = new Date().toISOString();
      await seedTasks({
        authToken,
        ownerUserId: userId,
        tasks: [
          { scope: 'personal', completedAt: todayIso },
          { scope: 'personal', completedAt: todayIso },
          { scope: 'personal', completedAt: todayIso },
        ],
      });

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.currentStreak).toBe(0);
      expect(entry.earnedBadges).toEqual([]);
    });

    it('data-driven revoke: reverting a sole-qualifier task drops the badge', async () => {
      // Single task with 4 completed subtasks today → 1 parent + 4 subtask
      // credits = 5 → earns volume_5.
      const now = new Date().toISOString();
      const taskId = 'revoke-test-task';
      const familyId = await seedTasks({
        authToken,
        ownerUserId: userId,
        tasks: [
          {
            id: taskId,
            title: 'Revoke test',
            completedAt: now,
            subTasks: [
              { id: 'a', title: 'A', completed: true, completedAt: now, completedBy: userId },
              { id: 'b', title: 'B', completed: true, completedAt: now, completedBy: userId },
              { id: 'c', title: 'C', completed: true, completedAt: now, completedBy: userId },
              { id: 'd', title: 'D', completed: true, completedAt: now, completedBy: userId },
            ],
          },
        ],
      });

      const before = await getLeaderboardEntry(authToken, userId);
      expect(before.earnedBadges.map((b) => b.id)).toContain('volume_5');

      // Revert: move done → started (clears completedAt) and uncheck subtasks.
      await request(app)
        .patch(`/api/v1/tasks/${taskId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'started' })
        .expect(200);
      const current = (await dataService.getData<StoredTask[]>(`tasks_${familyId}`))!;
      current[0].subTasks = current[0].subTasks.map((st) => ({
        ...st,
        completed: false,
        completedAt: null,
        completedBy: null,
      }));
      await dataService.saveData(`tasks_${familyId}`, current);

      const after = await getLeaderboardEntry(authToken, userId);
      expect(after.earnedBadges.map((b) => b.id)).not.toContain('volume_5');
    });

    it('common-case invariant: reverting one of many qualifying completions keeps the badge', async () => {
      const todayIso = new Date().toISOString();
      // 7 completions today — well past the volume_5 tip.
      const familyId = await seedTasks({
        authToken,
        ownerUserId: userId,
        tasks: completedTodayN(7, todayIso),
      });

      const tasks = (await dataService.getData<StoredTask[]>(`tasks_${familyId}`))!;
      tasks[0].completedAt = null;
      tasks[0].status = 'started';
      await dataService.saveData(`tasks_${familyId}`, tasks);

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.earnedBadges.map((b) => b.id)).toContain('volume_5');
    });

    it('lifetime_10 earns when cumulative count reaches 10', async () => {
      // Spread across 10 distinct days so no volume badges confuse the assertion.
      const events: TaskSeed[] = Array.from({ length: 10 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return { completedAt: d.toISOString() };
      });
      await seedTasks({ authToken, ownerUserId: userId, tasks: events });

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.earnedBadges.map((b) => b.id)).toContain('lifetime_10');
    });
  });

  // -------------------------------------------------------------------------
  // Leaderboard — v2.0 badge categories (representative integration coverage)
  // -------------------------------------------------------------------------

  describe('GET /api/v1/tasks/leaderboard — v2.0 badge categories', () => {
    it('night_owl_10: 10 completions after 9 PM local surfaces night_owl_10', async () => {
      // 02:00 UTC = 22:00 EDT the previous day (April is EDT, UTC-4).
      const events: TaskSeed[] = [];
      for (let d = 2; d <= 11; d++) {
        events.push({ completedAt: `2026-04-${String(d).padStart(2, '0')}T02:00:00.000Z` });
      }
      await seedTasks({ authToken, ownerUserId: userId, tasks: events });

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.earnedBadges.map((b) => b.id)).toContain('night_owl_10');
    });

    it('early_bird_10: 10 completions before 7 AM local surfaces early_bird_10', async () => {
      // 10:00 UTC = 06:00 EDT → qualifies.
      const events: TaskSeed[] = [];
      for (let d = 1; d <= 10; d++) {
        events.push({ completedAt: `2026-04-${String(d).padStart(2, '0')}T10:00:00.000Z` });
      }
      await seedTasks({ authToken, ownerUserId: userId, tasks: events });

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.earnedBadges.map((b) => b.id)).toContain('early_bird_10');
    });

    it('power_hour_5: 5 completions within a rolling 60-min window surfaces power_hour_5', async () => {
      const base = new Date('2026-04-15T15:00:00.000Z').getTime();
      const events: TaskSeed[] = [0, 10, 20, 30, 55].map((m) => ({
        completedAt: new Date(base + m * 60_000).toISOString(),
      }));
      await seedTasks({ authToken, ownerUserId: userId, tasks: events });

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.earnedBadges.map((b) => b.id)).toContain('power_hour_5');
    });

    it('phoenix_1: 14-day calendar gap surfaces phoenix_1', async () => {
      const events: TaskSeed[] = [
        { completedAt: '2026-04-01T15:00:00.000Z' },
        { completedAt: '2026-04-15T15:00:00.000Z' },
      ];
      await seedTasks({ authToken, ownerUserId: userId, tasks: events });

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.earnedBadges.map((b) => b.id)).toContain('phoenix_1');
    });

    it('clutch_5: 5 completions on or after dueDate surfaces clutch_5', async () => {
      const events: TaskSeed[] = [];
      for (let i = 0; i < 5; i++) {
        events.push({
          completedAt: `2026-04-${String(15 + i).padStart(2, '0')}T15:00:00.000Z`,
          dueDate: `2026-04-${String(10 + i).padStart(2, '0')}T15:00:00.000Z`,
        });
      }
      await seedTasks({ authToken, ownerUserId: userId, tasks: events });

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.earnedBadges.map((b) => b.id)).toContain('clutch_5');
    });

    it('spring_cleaner_25: 25 credits across Mar/Apr surfaces spring_cleaner_25', async () => {
      const events: TaskSeed[] = [];
      for (let i = 0; i < 25; i++) {
        const day = 1 + (i % 28);
        const month = i < 20 ? '03' : '04';
        events.push({
          completedAt: `2026-${month}-${String(day).padStart(2, '0')}T15:00:00.000Z`,
        });
      }
      await seedTasks({ authToken, ownerUserId: userId, tasks: events });

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.earnedBadges.map((b) => b.id)).toContain('spring_cleaner_25');
    });

    it('clean_sweep_1: single-user family completing their lone open task surfaces clean_sweep_1', async () => {
      // Single family task that gets closed → open count drops from 1 to 0.
      const events: TaskSeed[] = [
        {
          createdAt: '2026-04-01T10:00:00.000Z',
          completedAt: '2026-04-02T15:00:00.000Z',
          transitions: [
            { fromStatus: null, toStatus: 'todo', userId, timestamp: '2026-04-01T10:00:00.000Z' },
            { fromStatus: 'todo', toStatus: 'done', userId, timestamp: '2026-04-02T15:00:00.000Z' },
          ],
        },
      ];
      await seedTasks({ authToken, ownerUserId: userId, tasks: events });

      const entry = await getLeaderboardEntry(authToken, userId);
      expect(entry.earnedBadges.map((b) => b.id)).toContain('clean_sweep_1');
    });
  });

  // -------------------------------------------------------------------------
  // Task templates
  // -------------------------------------------------------------------------

  describe('Task Templates CRUD', () => {
    it('should create, list, and delete templates', async () => {
      // Create
      const createRes = await request(app)
        .post('/api/v1/task-templates')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Laundry' })
        .expect(201);

      expect(createRes.body.name).toBe('Laundry');
      expect(createRes.body.defaultScope).toBe('family');
      expect(createRes.body.sortOrder).toBe(1);

      // List
      const listRes = await request(app)
        .get('/api/v1/task-templates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(listRes.body).toHaveLength(1);

      // Delete
      await request(app)
        .delete(`/api/v1/task-templates/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify deleted
      const afterDelete = await request(app)
        .get('/api/v1/task-templates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(afterDelete.body).toHaveLength(0);
    });

    it('should reorder templates', async () => {
      const t1 = await request(app)
        .post('/api/v1/task-templates')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'First' })
        .expect(201);

      const t2 = await request(app)
        .post('/api/v1/task-templates')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Second' })
        .expect(201);

      // Reorder: second before first
      const reorderRes = await request(app)
        .put('/api/v1/task-templates/reorder')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ orderedIds: [t2.body.id, t1.body.id] })
        .expect(200);

      expect(reorderRes.body[0].name).toBe('Second');
      expect(reorderRes.body[1].name).toBe('First');
    });
  });

  // -------------------------------------------------------------------------
  // Update and Delete
  // -------------------------------------------------------------------------

  describe('PUT /api/v1/tasks/:id — update task', () => {
    it('should update task fields', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Original title' })
        .expect(201);

      const res = await request(app)
        .put(`/api/v1/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated title', scope: 'personal' })
        .expect(200);

      expect(res.body.title).toBe('Updated title');
      expect(res.body.scope).toBe('personal');
    });

    it('should update assignedAt when assignee changes', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Assign me' })
        .expect(201);

      expect(createRes.body.assignedAt).toBeNull();

      const res = await request(app)
        .put(`/api/v1/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ assigneeId: userId })
        .expect(200);

      expect(res.body.assigneeId).toBe(userId);
      expect(res.body.assignedAt).toBeTruthy();
    });
  });

  describe('DELETE /api/v1/tasks/:id — delete task', () => {
    it('should delete a task', async () => {
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Delete me' })
        .expect(201);

      await request(app)
        .delete(`/api/v1/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify gone
      await request(app)
        .get(`/api/v1/tasks/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  // -------------------------------------------------------------------------
  // Auth protection
  // -------------------------------------------------------------------------

  describe('Auth protection', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app).get('/api/v1/tasks/board').expect(401);
      await request(app).post('/api/v1/tasks').send({ title: 'Test' }).expect(401);
      await request(app).get('/api/v1/task-templates').expect(401);
    });
  });
});
