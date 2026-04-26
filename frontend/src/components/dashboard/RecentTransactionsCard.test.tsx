import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { RecentTransactionsCard } from './RecentTransactionsCard';
import type { Transaction } from '../../../../shared/types';

function renderCard(transactions: Transaction[]) {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <RecentTransactionsCard transactions={transactions} />
      </MantineProvider>
    </MemoryRouter>,
  );
}

function makeTransaction(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    plaidTransactionId: null,
    accountId: 'acct-1',
    amount: overrides.amount ?? -50,
    date: overrides.date ?? '2026-04-20',
    name: overrides.name ?? `Transaction ${overrides.id}`,
    userDescription: null,
    merchantName: overrides.merchantName ?? null,
    category: [],
    plaidCategoryId: null,
    categoryId: null,
    pending: false,
    tags: [],
    notes: null,
    isHidden: false,
    isFlagged: false,
    isManual: false,
    isSplit: false,
    parentTransactionId: null,
    splitTransactionIds: [],
    accountOwner: null,
    originalDescription: null,
    location: null,
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
    ...overrides,
  };
}

describe('RecentTransactionsCard', () => {
  it('renders empty state when no transactions are passed', () => {
    renderCard([]);
    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
  });

  it('renders at most 5 transactions even when more are passed', () => {
    const transactions = Array.from({ length: 8 }, (_, i) =>
      makeTransaction({ id: `tx-${i}`, name: `Transaction ${i}` }),
    );
    renderCard(transactions);
    // 5 transactions should appear, not 8
    expect(screen.getAllByText(/^Transaction \d+$/).length).toBe(5);
    expect(screen.queryByText('Transaction 5')).not.toBeInTheDocument();
  });

  it('renders exactly the transactions passed when count ≤ 5', () => {
    const transactions = [
      makeTransaction({ id: 'tx-1', name: 'Coffee Shop' }),
      makeTransaction({ id: 'tx-2', name: 'Grocery Store' }),
    ];
    renderCard(transactions);
    expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
  });

  it('uses merchantName over name when merchantName is set', () => {
    const transactions = [
      makeTransaction({ id: 'tx-1', name: 'AMAZON.COM*XYZ', merchantName: 'Amazon' }),
    ];
    renderCard(transactions);
    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(screen.queryByText('AMAZON.COM*XYZ')).not.toBeInTheDocument();
  });

  it('renders "Recent Activity" heading and "View all" link', () => {
    renderCard([]);
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/transactions');
  });
});
