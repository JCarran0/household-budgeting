/**
 * Household Ledger reminders — REQ-H030 – H032, REQ-H040/H041, SEC-H004
 *
 * Never send the same warning twice, never send a burst of stale ones after
 * downtime, respect each person's snooze and mute, keep quiet overnight, and
 * keep anything with a figure in it out of the push payload.
 */

import { InMemoryDataService } from '../../services/dataService';
import { LedgerStore } from '../../services/ledgerStore';
import { LedgerReminderJob } from '../../services/ledgerReminderJob';
import type { Family, FamilyMember, NotificationPayload } from '../../shared/types';
import { ledgerSentKey } from '../../validators/ledgerValidators';
import { docFact } from '../helpers/ledgerFixtures';

const FAMILY = '64a86709-6660-4393-b86c-e77c32dcff63';
const BUSINESS = '11111111-2222-3333-4444-555555555555';
const members: FamilyMember[] = [
  { userId: 'u1', displayName: 'One', joinedAt: '2026-01-01T00:00:00Z' },
  { userId: 'u2', displayName: 'Two', joinedAt: '2026-01-01T00:00:00Z' },
];

/** Noon Eastern on a date (16:00Z in EDT, 17:00Z in EST — both after quiet hours). */
const at = (date: string, utcHour = 17): Date => new Date(`${date}T${String(utcHour).padStart(2, '0')}:00:00Z`);

describe('LedgerReminderJob', () => {
  let data: InMemoryDataService;
  let store: LedgerStore;
  let sent: Array<{ userId: string; payload: NotificationPayload }>;
  let job: LedgerReminderJob;

  beforeEach(async () => {
    data = new InMemoryDataService();
    store = new LedgerStore(data);
    sent = [];
    const families = {
      getFamily: async (id: string) => ({ id, workspaceType: id === BUSINESS ? 'business' : 'personal' }) as Family,
      getFamilyMembers: async () => members,
    };
    job = new LedgerReminderJob(data, store, families, {
      sendNotification: async (userId: string, payload: NotificationPayload) => {
        sent.push({ userId, payload });
      },
    });
    await store.addFact(
      FAMILY,
      docFact('refund', { kind: 'window', opens: { date: '2026-10-17' }, closes: { date: '2026-12-16' } }, {
        title: 'Full refund of $4,411.38 if cancelled within 60 days',
        amount: '$4,411.38',
      }),
    );
  });

  it('sends each due warning to every member once, however often it runs', async () => {
    expect(await job.runOnce(at('2026-10-17'))).toBe(2);
    expect(sent.map(s => s.userId)).toEqual(['u1', 'u2']);
    expect(await job.runOnce(at('2026-10-17', 20))).toBe(0);
    expect(await job.runOnce(at('2026-10-20'))).toBe(0);
    expect(await job.runOnce(at('2026-11-16'))).toBe(2); // the 30-day closing warning
  });

  it('keeps figures out of the payload (SEC-H004)', async () => {
    await job.runOnce(at('2026-11-16'));
    const p = sent[0].payload;
    expect(p).toEqual({
      type: 'ledger_reminder',
      title: 'Heads-up: 2026 Rivian R2',
      body: 'A window closes in 30 days (Dec 16, 2026).',
      url: '/household?factId=rivian-care%3Arefund',
      tag: 'rivian-care:refund@2026-12-16#due-30',
    });
    expect(JSON.stringify(p)).not.toContain('4,411');
  });

  it('catches up after downtime with one notice, not a burst', async () => {
    // Down from before the window opened until after the 30-day warning.
    expect(await job.runOnce(at('2026-11-20'))).toBe(2);
    expect(sent[0].payload.tag).toBe('rivian-care:refund@2026-12-16#due-30');
    const log = (await data.getData<{ users: Record<string, string[]> }>(ledgerSentKey(FAMILY)))!;
    expect(log.users.u1.sort()).toEqual(['rivian-care:refund@2026-12-16#due-30', 'rivian-care:refund@2026-12-16#opens-0']);
    expect(await job.runOnce(at('2026-11-21'))).toBe(0);
  });

  it('sends nothing before 9am Eastern', async () => {
    expect(await job.runOnce(new Date('2026-10-17T12:00:00Z'))).toBe(0); // 8am EDT
    expect(await job.runOnce(new Date('2026-10-17T13:00:00Z'))).toBe(2); // 9am EDT
  });

  it('applies one person’s snooze and mute without affecting the other', async () => {
    await store.updateUserPrefs(FAMILY, 'u1', p => ({ ...p, mutedSubjects: ['2026 Rivian R2'] }));
    await job.runOnce(at('2026-10-17'));
    expect(sent.map(s => s.userId)).toEqual(['u2']);
  });

  it('skips the business workspace entirely (D-H07)', async () => {
    await store.addFact(BUSINESS, docFact('x', { kind: 'deadline', due: { date: '2026-10-20' } }));
    await job.runOnce(at('2026-10-17'));
    expect(sent.every(s => !s.payload.tag.startsWith('rivian-care:x'))).toBe(true);
  });

  it('refuses to run a family whose sent log is corrupt rather than re-sending everything', async () => {
    await data.saveData(ledgerSentKey(FAMILY), { formatVersion: 1, users: { u1: 'not-an-array' } });
    expect(await job.runOnce(at('2026-10-17'))).toBe(0);
  });
});
