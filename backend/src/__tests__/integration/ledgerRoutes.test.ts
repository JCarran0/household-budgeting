/**
 * Household Ledger API — HOUSEHOLD-LEDGER-BRD §3.3, plan L5
 *
 * The source of a fact decides what may change it, and that is decided by the
 * server, not the request: a caller cannot claim to be a document or an app
 * event, cannot edit a document fact, and one person's snooze never hides an
 * item from anyone else.
 */

import request from 'supertest';
import app from '../../app';
import { authService, dataService, ledgerStore, taskService } from '../../services';
import { etDateString } from '../../shared/utils/easternTime';
import { addOffset } from '../../shared/utils/ledgerDates';
import { registerUser, type AuthenticatedUser } from '../helpers/apiHelper';
import { docFact } from '../helpers/ledgerFixtures';

const today = etDateString();
const inDays = (n: number): string => addOffset(today, { days: n });

async function createUser(): Promise<AuthenticatedUser> {
  return registerUser(`ledger${Math.random().toString(36).slice(2, 8)}`, 'secure-test-passphrase-long-enough');
}

const api = (user: AuthenticatedUser) => ({
  get: () => request(app).get('/api/v1/ledger').set('Authorization', `Bearer ${user.token}`),
  post: (path: string, body: object) =>
    request(app).post(`/api/v1/ledger${path}`).set('Authorization', `Bearer ${user.token}`).send(body),
  put: (path: string, body: object) =>
    request(app).put(`/api/v1/ledger${path}`).set('Authorization', `Bearer ${user.token}`).send(body),
  del: (path: string, body?: object) =>
    request(app).delete(`/api/v1/ledger${path}`).set('Authorization', `Bearer ${user.token}`).send(body),
});

beforeEach(() => {
  if ('clear' in dataService) (dataService as unknown as { clear: () => void }).clear();
  authService.resetRateLimiting();
});

describe('Household Ledger API', () => {
  it('creates a user fact, assigns its source server-side, and lists it on the Heads-up', async () => {
    const user = await createUser();
    const created = await api(user)
      .post('/facts', { subject: 'House', title: 'Renew insurance', schedule: { kind: 'deadline', due: { date: inDays(5) } } })
      .expect(201);
    expect(created.body.id).toMatch(/^f_/);
    expect(created.body.source).toEqual({ kind: 'user', userId: user.userId, via: 'form' });

    const view = await api(user).get().expect(200);
    expect(view.body.today).toBe(today);
    expect(view.body.headsUp.map((h: { title: string; phase: string }) => [h.title, h.phase])).toEqual([
      ['Renew insurance', 'upcoming'],
    ]);
  });

  it('refuses a request that tries to set the source, id or status itself', async () => {
    const user = await createUser();
    await api(user)
      .post('/facts', {
        subject: 'House',
        title: 'Sneaky',
        schedule: { kind: 'note' },
        source: { kind: 'document', docId: 'x', quotes: [{ page: 1, text: 'a fabricated quote' }] },
      })
      .expect(400);
    await api(user).post('/facts', { id: 'f_x', subject: 'House', title: 'Sneaky', schedule: { kind: 'note' } }).expect(400);
  });

  it('keeps a deadline that already passed when a person enters it', async () => {
    const user = await createUser();
    await api(user)
      .post('/facts', { subject: 'Car', title: 'Registration', schedule: { kind: 'deadline', due: { date: inDays(-3) } } })
      .expect(201);
    const view = await api(user).get().expect(200);
    expect(view.body.headsUp[0].phase).toBe('overdue');
  });

  it('never edits or deletes a document fact, but corrects it by override', async () => {
    const user = await createUser();
    const original = docFact('opt-out', { kind: 'deadline', due: { date: inDays(10) } });
    await ledgerStore.addFact(user.familyId, original);
    const body = { subject: '2026 Rivian R2', title: 'Opt-out deadline (corrected)', schedule: { kind: 'deadline', due: { date: inDays(12) } } };

    await api(user).put(`/facts/${original.id}`, body).expect(403);
    await api(user).del(`/facts/${original.id}`).expect(403);

    const fix = await api(user).post(`/facts/${original.id}/correct`, body).expect(201);
    expect(fix.body.overrides).toBe(original.id);
    await api(user).post(`/facts/${original.id}/correct`, body).expect(409);

    const view = await api(user).get().expect(200);
    expect(view.body.headsUp.map((h: { factId: string }) => h.factId)).toEqual([fix.body.id]);

    // Deleting the correction restores the original.
    await api(user).del(`/facts/${fix.body.id}`).expect(204);
    const after = await api(user).get().expect(200);
    expect(after.body.headsUp.map((h: { factId: string }) => h.factId)).toEqual([original.id]);
  });

  it('marks an occurrence handled, refuses a second mark, and undoes by withdrawing', async () => {
    const user = await createUser();
    const fact = docFact('opt-out', { kind: 'deadline', due: { date: inDays(10) } });
    await ledgerStore.addFact(user.familyId, fact);

    await api(user).post(`/facts/${fact.id}/handled`, { occurrenceDate: inDays(11) }).expect(400);
    const mark = await api(user).post(`/facts/${fact.id}/handled`, { occurrenceDate: inDays(10), note: 'Email sent' }).expect(201);
    expect(mark.body.source).toEqual({ kind: 'app', event: 'marked_handled', userId: user.userId });
    await api(user).post(`/facts/${fact.id}/handled`, { occurrenceDate: inDays(10) }).expect(409);
    expect((await api(user).get()).body.headsUp).toEqual([]);

    await api(user).del(`/handled/${mark.body.id}`).expect(204);
    expect((await api(user).get()).body.headsUp).toHaveLength(1);
    const stored = (await ledgerStore.read(user.familyId)).facts.find(f => f.id === mark.body.id);
    expect(stored?.status).toBe('withdrawn');
  });

  it('snoozes for the person who asked, and refuses a past date', async () => {
    const user = await createUser();
    const fact = docFact('opt-out', { kind: 'deadline', due: { date: inDays(10) } });
    await ledgerStore.addFact(user.familyId, fact);
    const key = `${fact.id}@${inDays(10)}`;

    await api(user).post('/snoozes', { occurrenceKey: key, until: today }).expect(400);
    await api(user).post('/snoozes', { occurrenceKey: key, until: inDays(3) }).expect(200);
    expect((await api(user).get()).body.headsUp).toEqual([]);
    expect(await ledgerStore.userPrefs(user.familyId, 'someone-else')).toEqual({ snoozes: [], mutedSubjects: [] });

    await api(user).del('/snoozes', { occurrenceKey: key }).expect(200);
    expect((await api(user).get()).body.headsUp).toHaveLength(1);
  });

  it('mutes a subject without removing it from the list', async () => {
    const user = await createUser();
    await ledgerStore.addFact(user.familyId, docFact('opt-out', { kind: 'deadline', due: { date: inDays(10) } }));
    const prefs = await api(user).put('/mutes', { subject: '2026 Rivian R2', muted: true }).expect(200);
    expect(prefs.body.mutedSubjects).toEqual(['2026 Rivian R2']);
    expect((await api(user).get()).body.headsUp).toHaveLength(1);
  });

  it('scopes every read and write to the caller’s family', async () => {
    const a = await createUser();
    const b = await createUser();
    const fact = docFact('opt-out', { kind: 'deadline', due: { date: inDays(10) } });
    await ledgerStore.addFact(a.familyId, fact);
    expect((await api(b).get()).body.facts).toEqual([]);
    await api(b).post(`/facts/${fact.id}/handled`, { occurrenceDate: inDays(10) }).expect(404);
  });

  it('makes one task per occurrence, and completing it marks the occurrence handled (REQ-H034)', async () => {
    const user = await createUser();
    const fact = docFact('opt-out', { kind: 'deadline', due: { date: inDays(10) } });
    await ledgerStore.addFact(user.familyId, fact);

    const task = await api(user).post(`/facts/${fact.id}/task`, { occurrenceDate: inDays(10) }).expect(201);
    expect(task.body.dueDate).toBe(inDays(10));
    expect(task.body.ledgerLink).toEqual({ factId: fact.id, occurrenceDate: inDays(10) });
    await api(user).post(`/facts/${fact.id}/task`, { occurrenceDate: inDays(10) }).expect(409);

    await taskService.updateTaskStatus(task.body.id, 'done', user.userId, user.familyId);
    const marks = (await ledgerStore.read(user.familyId)).facts.filter(f => f.handles);
    expect(marks).toHaveLength(1);
    expect(marks[0].source).toEqual({ kind: 'app', event: 'task_completed', userId: user.userId });
    expect((await api(user).get()).body.headsUp).toEqual([]);
  });

  it('cannot set a ledger link through the task routes', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Sneaky', ledgerLink: { factId: 'rivian-care:x', occurrenceDate: inDays(1) } })
      .expect(201);
    expect(res.body.ledgerLink ?? res.body.data?.ledgerLink).toBeUndefined();
  });

  it('rejects a malformed fact id in the path', async () => {
    const user = await createUser();
    await api(user).del('/facts/..%2F..%2Fusers').expect(400);
  });
});
