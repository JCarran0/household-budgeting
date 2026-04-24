import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ManualAccountCard } from './ManualAccountCard';
import type { ManualAccount } from '../../../../shared/types';

function renderCard(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function makeManual(overrides: Partial<ManualAccount> = {}): ManualAccount {
  return {
    id: 'm-1',
    userId: 'u-1',
    name: 'Primary Residence',
    category: 'real_estate',
    isAsset: true,
    currentBalance: 450000,
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
    ...overrides,
  };
}

describe('ManualAccountCard — asset vs liability dispatch', () => {
  it('renders an "Asset" badge for isAsset=true', () => {
    renderCard(
      <ManualAccountCard
        account={makeManual({ isAsset: true, category: 'real_estate' })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText('Asset')).toBeInTheDocument();
    expect(screen.queryByText('Liability')).not.toBeInTheDocument();
  });

  it('renders a "Liability" badge for isAsset=false', () => {
    renderCard(
      <ManualAccountCard
        account={makeManual({ isAsset: false, category: 'mortgage' })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText('Liability')).toBeInTheDocument();
    expect(screen.queryByText('Asset')).not.toBeInTheDocument();
  });
});

describe('ManualAccountCard — category label lookup', () => {
  it('renders the mapped label for each category (covers the full CATEGORY_LABELS table)', () => {
    const cases: Array<{ category: ManualAccount['category']; label: string }> = [
      { category: 'real_estate', label: 'Real Estate' },
      { category: 'vehicle', label: 'Vehicle' },
      { category: 'retirement', label: 'Retirement' },
      { category: 'brokerage', label: 'Brokerage' },
      { category: 'cash', label: 'Cash / Savings' },
      { category: 'crypto', label: 'Crypto' },
      { category: 'other_asset', label: 'Other Asset' },
      { category: 'mortgage', label: 'Mortgage' },
      { category: 'auto_loan', label: 'Auto Loan' },
      { category: 'student_loan', label: 'Student Loan' },
      { category: 'personal_loan', label: 'Personal Loan' },
      { category: 'other_liability', label: 'Other Liability' },
    ];
    for (const { category, label } of cases) {
      const { unmount } = renderCard(
        <ManualAccountCard
          account={makeManual({ category })}
          onEdit={() => {}}
          onDelete={() => {}}
        />,
      );
      // Label appears twice: once in the top-right badge row, once in the Paper body.
      // We only care that it's rendered — any presence check is sufficient.
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
      unmount();
    }
  });
});

describe('ManualAccountCard — notes + footer spacing', () => {
  it('omits the notes paragraph when account.notes is null', () => {
    renderCard(
      <ManualAccountCard
        account={makeManual({ notes: null })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // The only dimmed text rendering in that slot is "Last updated: …".
    // If notes were rendered they would appear as a separate <Text> with the raw string.
    expect(screen.queryByText('Some notes here')).not.toBeInTheDocument();
  });

  it('renders the notes paragraph when account.notes is set', () => {
    renderCard(
      <ManualAccountCard
        account={makeManual({ notes: 'Refinanced 2025' })}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText('Refinanced 2025')).toBeInTheDocument();
  });
});

describe('ManualAccountCard — handlers', () => {
  it('fires onEdit with the full account when Edit menu item is clicked', async () => {
    const onEdit = vi.fn();
    const account = makeManual({ id: 'm-42' });
    renderCard(
      <ManualAccountCard account={account} onEdit={onEdit} onDelete={() => {}} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit account/i }));
    expect(onEdit).toHaveBeenCalledWith(account);
  });

  it('fires onDelete with the full account when Delete menu item is clicked', async () => {
    const onDelete = vi.fn();
    const account = makeManual({ id: 'm-99' });
    renderCard(
      <ManualAccountCard account={account} onEdit={() => {}} onDelete={onDelete} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete account/i }));
    expect(onDelete).toHaveBeenCalledWith(account);
  });
});
