/**
 * Test helper for seeding family-task storage directly with backdated
 * completions. Bypasses the API so tests can control `completedAt` precisely
 * (the API stamps `now` on transitions; integration tests for streaks /
 * badges need historical timestamps).
 */

import request from 'supertest';
import app from '../../app';
import { dataService } from '../../services';
import type { LeaderboardEntry, LeaderboardResponse, StoredTask } from '../../shared/types';

/**
 * Per-task overrides accepted by `seedTasks`. Anything omitted gets a
 * sensible default (family-scope, status=done, assignee = ownerUserId).
 */
export type TaskSeed = Partial<StoredTask> & { completedAt?: string | null };

interface SeedTasksParams {
  authToken: string;
  ownerUserId: string;
  tasks: TaskSeed[];
}

/**
 * Resolve the auth'd user's familyId via the /api/v1/family endpoint.
 * Cached per call — every test resets `dataService` between runs.
 */
async function getFamilyId(authToken: string): Promise<string> {
  const res = await request(app)
    .get('/api/v1/family')
    .set('Authorization', `Bearer ${authToken}`)
    .expect(200);
  return res.body.family.id as string;
}

/**
 * Seed `tasks` for the given user's family. Returns the resolved familyId
 * so callers can do further direct dataService manipulation.
 */
export async function seedTasks(params: SeedTasksParams): Promise<string> {
  const { authToken, ownerUserId, tasks } = params;
  const familyId = await getFamilyId(authToken);

  const epoch = new Date('2024-01-01T00:00:00.000Z').toISOString();
  const full = tasks.map((t, i) => ({
    id: t.id ?? `seeded-${i}-${Math.random().toString(36).slice(2, 8)}`,
    title: t.title ?? 'Seeded',
    description: t.description ?? null,
    status: t.status ?? 'done',
    scope: t.scope ?? 'family',
    assigneeId: t.assigneeId ?? ownerUserId,
    createdBy: t.createdBy ?? ownerUserId,
    createdAt: t.createdAt ?? epoch,
    assignedAt: t.assignedAt ?? epoch,
    completedAt: t.completedAt ?? null,
    dueDate: t.dueDate ?? null,
    tags: t.tags ?? [],
    subTasks: t.subTasks ?? [],
    snoozedUntil: t.snoozedUntil ?? null,
    sortOrder: t.sortOrder ?? i + 1,
    transitions: t.transitions ?? [
      { fromStatus: null, toStatus: 'todo', userId: ownerUserId, timestamp: epoch },
      {
        fromStatus: 'todo',
        toStatus: 'done',
        userId: ownerUserId,
        timestamp: (t.completedAt as string | undefined) ?? new Date().toISOString(),
      },
    ],
  }));

  await dataService.saveData(`tasks_${familyId}`, full);
  return familyId;
}

/**
 * Fetch the leaderboard and return the entry for the requested user.
 * Throws if the entry isn't present — keeps tests assertive.
 */
export async function getLeaderboardEntry(
  authToken: string,
  userId: string,
  timezone = 'America/New_York'
): Promise<LeaderboardEntry> {
  const res = await request(app)
    .get('/api/v1/tasks/leaderboard')
    .query({ timezone })
    .set('Authorization', `Bearer ${authToken}`)
    .expect(200);
  const body = res.body as LeaderboardResponse;
  const entry = body.entries.find((e) => e.userId === userId);
  if (!entry) {
    throw new Error(`No leaderboard entry for userId=${userId}`);
  }
  return entry;
}
