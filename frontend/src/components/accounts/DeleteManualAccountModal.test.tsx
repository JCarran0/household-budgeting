import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DeleteManualAccountModal } from './DeleteManualAccountModal';
import type { ManualAccount } from '../../../../shared/types';

function renderModal(ui: React.ReactElement) {
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

describe('DeleteManualAccountModal', () => {
  it('renders target name + translated category label (not raw enum)', () => {
    renderModal(
      <DeleteManualAccountModal
        opened
        onClose={() => {}}
        onConfirm={() => {}}
        isPending={false}
        target={makeManual({ name: 'Primary Residence', category: 'real_estate' })}
      />,
    );
    expect(screen.getByText('Primary Residence (Real Estate)')).toBeInTheDocument();
    // Ensure the raw enum does not leak through.
    expect(screen.queryByText(/real_estate/)).not.toBeInTheDocument();
  });

  it('suppresses the target line when target is null', () => {
    renderModal(
      <DeleteManualAccountModal
        opened
        onClose={() => {}}
        onConfirm={() => {}}
        isPending={false}
        target={null}
      />,
    );
    expect(screen.getByText('Are you sure you want to delete this account?')).toBeInTheDocument();
    expect(screen.queryByText(/\(.+\)/)).not.toBeInTheDocument();
  });

  it('fires onClose on Cancel and onConfirm on the red Delete button', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderModal(
      <DeleteManualAccountModal
        opened
        onClose={onClose}
        onConfirm={onConfirm}
        isPending={false}
        target={makeManual()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /delete account/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
