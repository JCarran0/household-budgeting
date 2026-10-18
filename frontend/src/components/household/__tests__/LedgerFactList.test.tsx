import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { LedgerFactList, type LedgerFactListProps } from '../LedgerFactList';
import type { LedgerFact } from '../../../../../shared/types';

const doc: LedgerFact = {
  id: 'rivian-r2-vehicle-service-contract:full-refund-window',
  subject: '2027 Rivian R2',
  title: 'Full refund of $4,411.38 if cancelled within 60 days',
  schedule: { kind: 'window', opens: { date: '2026-10-17' }, closes: { anchor: '2026-10-17', offset: { days: 60 } } },
  source: { kind: 'document', docId: 'rivian-r2-vehicle-service-contract', quotes: [{ page: 3, text: 'cancel within 60 days for a full refund' }] },
  trackFrom: '2026-10-17', status: 'active', createdAt: '2026-10-17T12:00:00Z', createdBy: 'import',
};
const note: LedgerFact = {
  id: 'f_0b6f3a52-1d2e-4c7a-9f10-3c5d2e8a0001',
  subject: 'Rooftop solar system',
  title: 'Sent the opt-out email',
  schedule: { kind: 'note' },
  source: { kind: 'user', userId: 'u1', via: 'card' },
  trackFrom: '2026-10-17', status: 'active', createdAt: '2026-10-17T12:00:00Z', createdBy: 'u1',
};
const mark: LedgerFact = {
  id: 'f_0b6f3a52-1d2e-4c7a-9f10-3c5d2e8a0002',
  subject: doc.subject, title: 'Handled', schedule: { kind: 'note' },
  handles: { factId: doc.id, occurrenceDate: '2026-12-16' }, detail: 'Decided to keep it',
  source: { kind: 'app', event: 'marked_handled', userId: 'u2' },
  trackFrom: '2026-10-17', status: 'active', createdAt: '2026-10-20T12:00:00Z', createdBy: 'u2',
};

function renderList(overrides: Partial<LedgerFactListProps> = {}) {
  const props: LedgerFactListProps = {
    facts: [doc, note, mark],
    documents: { 'rivian-r2-vehicle-service-contract': { title: 'Rivian Care VSC', sourceUrl: 'https://drive.google.com/file/d/x/view' } },
    memberNames: new Map([['u1', 'Jared'], ['u2', 'Sam']]),
    mutedSubjects: [],
    today: '2026-10-17',
    highlightId: null,
    showWithdrawn: false,
    onEdit: vi.fn(), onCorrect: vi.fn(), onDelete: vi.fn(), onUnmark: vi.fn(), onToggleMute: vi.fn(),
    ...overrides,
  };
  return render(<MantineProvider><LedgerFactList {...props} /></MantineProvider>);
}

describe('LedgerFactList (REQ-H050, H053)', () => {
  it('collapses each subject behind a summary with its fact count and next date', () => {
    renderList();
    expect(screen.getByRole('button', { name: /2027 Rivian R2\s*1 fact · next Dec 16, 2026/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Rooftop solar system\s*1 fact$/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the linked fact’s subject', () => {
    renderList({ highlightId: doc.id });
    expect(screen.getByRole('button', { name: /^2027 Rivian R2/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Rooftop solar system/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the computed date with its rule', () => {
    renderList();
    expect(screen.getByText('Open Oct 17, 2026 – Dec 16, 2026')).toBeInTheDocument();
    expect(screen.getByText('Computed: 60 days from Oct 17, 2026')).toBeInTheDocument();
  });

  it('cites the document page and discloses the link host', async () => {
    renderList({ highlightId: doc.id });
    expect(screen.getByText(/From Rivian Care VSC, p\. 3/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /open original \(drive\.google\.com\)/ })).toHaveAttribute('target', '_blank');
  });

  it('shows who added a user fact and folds the handled mark onto its fact instead of listing it', () => {
    renderList();
    expect(screen.getByText(/Added by Jared via Helper Bot/)).toBeInTheDocument();
    expect(screen.getByText(/handled by Sam .* Decided to keep it/)).toBeInTheDocument();
    expect(screen.queryByText('Handled')).not.toBeInTheDocument();
  });

  it('keeps a corrected document fact visible, marked as replaced', () => {
    const fix: LedgerFact = { ...note, id: 'f_0b6f3a52-1d2e-4c7a-9f10-3c5d2e8a0003', subject: doc.subject, title: 'Refund window (corrected)', overrides: doc.id, schedule: { kind: 'deadline', due: { date: '2026-12-18' } } };
    renderList({ facts: [doc, fix] });
    expect(screen.getByText('Replaced by your correction')).toBeInTheDocument();
    expect(screen.getByText(`Corrects: ${doc.title}`)).toBeInTheDocument();
  });
});
