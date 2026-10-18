import type { LedgerFact, LedgerSchedule } from '../../shared/types';

/** Builders for ledger tests. Shared by the ledger date, schema and store tests. */

const UUID = '0b6f3a52-1d2e-4c7a-9f10-3c5d2e8a7b61';
let counter = 0;

export function userFactId(): string {
  counter += 1;
  return `f_${UUID.slice(0, -4)}${String(counter).padStart(4, '0')}`;
}

export function docFact(slug: string, schedule: LedgerSchedule, overrides: Partial<LedgerFact> = {}): LedgerFact {
  return {
    id: `rivian-care:${slug}`,
    subject: '2026 Rivian R2',
    title: `Fact ${slug}`,
    schedule,
    source: { kind: 'document', docId: 'rivian-care', quotes: [{ page: 1, text: 'Cancel within 60 days for a full refund.' }] },
    trackFrom: '2026-01-01',
    status: 'active',
    createdAt: '2026-10-17T12:00:00Z',
    createdBy: 'import',
    ...overrides,
  };
}

export function userFact(schedule: LedgerSchedule, overrides: Partial<LedgerFact> = {}): LedgerFact {
  return {
    id: userFactId(),
    subject: '2026 Rivian R2',
    title: 'A user fact',
    schedule,
    source: { kind: 'user', userId: 'u1', via: 'form' },
    trackFrom: '2026-01-01',
    status: 'active',
    createdAt: '2026-10-17T12:00:00Z',
    createdBy: 'u1',
    ...overrides,
  };
}

export function handledFact(target: LedgerFact, occurrenceDate: string): LedgerFact {
  return {
    id: userFactId(),
    subject: target.subject,
    title: `Handled: ${target.title}`,
    schedule: { kind: 'note' },
    handles: { factId: target.id, occurrenceDate },
    source: { kind: 'app', event: 'marked_handled', userId: 'u1' },
    trackFrom: '2026-01-01',
    status: 'active',
    createdAt: '2026-10-17T12:00:00Z',
    createdBy: 'u1',
  };
}
