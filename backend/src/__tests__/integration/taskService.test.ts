import request from 'supertest';
import app from '../../app';
import { dataService, authService } from '../../services';
import { registerUser } from '../helpers/apiHelper';

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

  describe('Board archiving (14-day cutoff)', () => {
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
