/**
 * Household Ledger and the assistant — REQ-H060 – H062, SEC-H001, SEC-H003
 *
 * The assistant reads the ledger through ReadOnlyDataService and writes it only
 * through two confirmed cards. These tests pin the read view (computed dates,
 * folded marks, corrections, fail-closed on a corrupt file, family scoping) and
 * the write path (source assigned server-side, batch-wide validation).
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import app from '../../app';
import { authService, chatbotDataService, dataService, ledgerService, ledgerStore, proposalStore } from '../../services';
import { buildProposalRows } from '../../services/chatActions';
import { etDateString } from '../../shared/utils/easternTime';
import { addOffset } from '../../shared/utils/ledgerDates';
import type { ProposalRow } from '../../shared/types';
import { ledgerKey } from '../../validators/ledgerValidators';
import { registerUser } from '../helpers/apiHelper';
import { docFact } from '../helpers/ledgerFixtures';

const today = etDateString();
const inDays = (n: number): string => addOffset(today, { days: n });

async function createUser() {
  return registerUser(`ledgerai${Math.random().toString(36).slice(2, 8)}`, 'secure-test-passphrase-long-enough');
}

function row(index: number, actionId: ProposalRow['actionId'], params: Record<string, unknown>): ProposalRow {
  return {
    rowId: `row-${index}`,
    actionId,
    label: actionId,
    params,
    displaySummary: actionId,
    displayFields: Object.entries(params).map(([key, value]) => ({
      key, label: key, value: String(value), editable: false, type: 'text' as const,
    })),
  };
}

async function confirm(user: { userId: string; familyId: string; token: string }, rows: ProposalRow[], status: number) {
  const proposal = await proposalStore.issue({
    userId: user.userId,
    familyId: user.familyId,
    conversationId: randomUUID(),
    traceId: 'trace_ledger_test',
    proposalInput: { rows, reasoning: 'Test plan' },
  });
  return request(app)
    .post('/api/v1/chatbot/actions/confirm')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ proposalId: proposal.proposalId, rows: rows.map(r => ({ rowId: r.rowId, params: r.params })) })
    .expect(status);
}

beforeEach(() => {
  if ('clear' in dataService) (dataService as unknown as { clear: () => void }).clear();
  authService.resetRateLimiting();
});

describe('read_ledger (REQ-H060)', () => {
  it('returns computed dates, folds handled marks, and shows a correction in place of the original', async () => {
    const user = await createUser();
    const refund = docFact('refund', { kind: 'deadline', due: { anchor: inDays(-10), offset: { days: 60 } } });
    const optOut = docFact('opt-out', { kind: 'deadline', due: { date: inDays(5) } });
    await ledgerStore.addFact(user.familyId, refund);
    await ledgerStore.addFact(user.familyId, optOut);
    await ledgerService.markHandled(user.familyId, user.userId, optOut.id, inDays(5), 'Email sent');
    const fix = await ledgerService.correctFact(user.familyId, user.userId, refund.id, {
      subject: refund.subject, title: 'Refund deadline (corrected)', schedule: { kind: 'deadline', due: { date: inDays(55) } },
    });

    const result = await chatbotDataService.ledger.readLedger(user.familyId);
    if (result.status !== 'ok') throw new Error('expected ok');
    const ids = result.facts.map(f => f.id);
    expect(ids).toEqual([optOut.id, fix.id]);
    expect(result.facts[0].handled).toEqual([{ occurrenceDate: inDays(5), markedOn: expect.any(String), note: 'Email sent' }]);
    expect(result.facts[0].source).toEqual({ kind: 'document', docId: 'rivian-care', quotes: optOut.source.kind === 'document' ? optOut.source.quotes : [] });
    expect(result.facts[1].corrects).toEqual({ id: refund.id, title: refund.title, source: 'document' });
    expect(result.upcoming.map(u => [u.factId, u.dueDate, u.handled])).toEqual([
      [optOut.id, inDays(5), true],
      [fix.id, inDays(55), false],
    ]);
  });

  it('shows a computed rule date with its derivation', async () => {
    const user = await createUser();
    await ledgerStore.addFact(user.familyId, docFact('refund', { kind: 'deadline', due: { anchor: '2026-10-17', offset: { days: 60 } } }));
    const result = await chatbotDataService.ledger.readLedger(user.familyId);
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.facts[0].dates).toEqual({ due: '2026-12-16', dueRule: '{"days":60} from 2026-10-17' });
  });

  it('reports a corrupt ledger as unreadable, never as empty', async () => {
    const user = await createUser();
    await dataService.saveData(ledgerKey(user.familyId), { formatVersion: 1, facts: [{ id: 'broken' }] });
    expect(await chatbotDataService.ledger.readLedger(user.familyId)).toEqual({ status: 'unreadable' });
  });

  it('reads only the caller’s family and refuses a malformed id', async () => {
    const a = await createUser();
    const b = await createUser();
    await ledgerStore.addFact(a.familyId, docFact('opt-out', { kind: 'deadline', due: { date: inDays(5) } }));
    const result = await chatbotDataService.ledger.readLedger(b.familyId);
    expect(result.status === 'ok' && result.facts).toEqual([]);
    await expect(chatbotDataService.ledger.readLedger('../ledger_')).rejects.toThrow('invalid familyId');
  });
});

describe('remember_fact and mark_fact_handled (REQ-H062)', () => {
  it('remembers a user-stated fact as a user fact entered by card', async () => {
    const user = await createUser();
    const res = await confirm(user, [
      row(0, 'remember_fact', { subject: '2026 Rivian R2', title: 'Sent arbitration opt-out email', kind: 'note' }),
    ], 200);
    expect(res.body.success).toBe(true);
    const [fact] = (await ledgerStore.read(user.familyId)).facts;
    expect(fact.source).toEqual({ kind: 'user', userId: user.userId, via: 'card' });
  });

  it('rejects a note with a date and a deadline without one', async () => {
    const user = await createUser();
    await confirm(user, [row(0, 'remember_fact', { subject: 'Car', title: 'Registration', kind: 'deadline' })], 400);
    await confirm(user, [row(0, 'remember_fact', { subject: 'Car', title: 'Registration', kind: 'note', date: inDays(3) })], 400);
  });

  it('cannot smuggle a source, an anchor rule or a window through remember_fact', async () => {
    const user = await createUser();
    const params = { subject: 'Car', title: 'Registration', kind: 'note', source: { kind: 'document' } };
    const built = await buildProposalRows(
      { actionId: 'remember_fact', params, displaySummary: 'x', displayFields: [], reasoning: 'x' },
      { userId: user.userId, familyId: user.familyId },
    );
    expect(built.ok).toBe(false);
    await confirm(user, [row(0, 'remember_fact', { subject: 'Car', title: 'Window', kind: 'window', date: inDays(3) })], 400);
  });

  it('marks an occurrence handled, and a batch with one bad occurrence writes nothing', async () => {
    const user = await createUser();
    const fact = docFact('opt-out', { kind: 'deadline', due: { date: inDays(5) } });
    await ledgerStore.addFact(user.familyId, fact);

    const bad = await confirm(user, [
      row(0, 'remember_fact', { subject: 'Car', title: 'Should not be written', kind: 'note' }),
      row(1, 'mark_fact_handled', { factId: fact.id, occurrenceDate: inDays(6) }),
    ], 400);
    expect(bad.body.errorCode).toBe('validation_failed');
    expect((await ledgerStore.read(user.familyId)).facts).toHaveLength(1);

    await confirm(user, [row(0, 'mark_fact_handled', { factId: fact.id, occurrenceDate: inDays(5), note: 'Emailed' })], 200);
    const marks = (await ledgerStore.read(user.familyId)).facts.filter(f => f.handles);
    expect(marks).toHaveLength(1);
    expect(marks[0].source).toEqual({ kind: 'app', event: 'marked_handled', userId: user.userId });

    const again = await confirm(user, [row(0, 'mark_fact_handled', { factId: fact.id, occurrenceDate: inDays(5) })], 400);
    expect(again.body.error).toMatch(/already marked handled/);
  });

  it('cannot mark another family’s fact handled', async () => {
    const a = await createUser();
    const b = await createUser();
    const fact = docFact('opt-out', { kind: 'deadline', due: { date: inDays(5) } });
    await ledgerStore.addFact(a.familyId, fact);
    await confirm(b, [row(0, 'mark_fact_handled', { factId: fact.id, occurrenceDate: inDays(5) })], 400);
    expect((await ledgerStore.read(a.familyId)).facts).toHaveLength(1);
  });
});
