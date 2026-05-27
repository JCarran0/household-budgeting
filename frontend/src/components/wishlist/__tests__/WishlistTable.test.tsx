import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StoredWishlistItem } from '../../../../../shared/types';

// ---------------------------------------------------------------------------
// Module mocks — before component import
// ---------------------------------------------------------------------------

const updateWishlistItem = vi.fn();
const deleteWishlistItem = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: {
    updateWishlistItem: (...args: unknown[]) => updateWishlistItem(...args),
    deleteWishlistItem: (...args: unknown[]) => deleteWishlistItem(...args),
  },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { WishlistTable } from '../WishlistTable';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<StoredWishlistItem> & { id: string }): StoredWishlistItem {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Test Item',
    estimatedAmount: overrides.estimatedAmount ?? 100,
    estimatedMonth: overrides.estimatedMonth ?? '2026-06',
    categoryId: overrides.categoryId ?? 'CUSTOM_CAT',
    status: overrides.status ?? 'PENDING',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const CAT_LABELS = new Map([['CUSTOM_CAT', 'Home']]);

function renderTable(
  items: StoredWishlistItem[],
  overrides: Partial<React.ComponentProps<typeof WishlistTable>> = {},
) {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <WishlistTable
            items={items}
            categoryLabels={CAT_LABELS}
            onEdit={vi.fn()}
            onAddNew={vi.fn()}
            {...overrides}
          />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WishlistTable', () => {
  beforeEach(() => {
    updateWishlistItem.mockReset();
    deleteWishlistItem.mockReset();
    updateWishlistItem.mockResolvedValue({});
    deleteWishlistItem.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  it('renders empty state with "Add Wishlist Item" button when no items', () => {
    renderTable([]);
    expect(screen.getByText(/no wishlist items yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add wishlist item/i })).toBeInTheDocument();
  });

  it('calls onAddNew when empty-state button is clicked', () => {
    const onAddNew = vi.fn();
    renderTable([], { onAddNew });
    fireEvent.click(screen.getByRole('button', { name: /add wishlist item/i }));
    expect(onAddNew).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Rendering items
  // ---------------------------------------------------------------------------

  it('renders item name in the table', () => {
    renderTable([makeItem({ id: 'a', name: 'My Sofa' })]);
    expect(screen.getByText('My Sofa')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Status quick-toggle
  // ---------------------------------------------------------------------------

  it('calls updateWishlistItem with { status: AGREED } when AGREED is clicked', async () => {
    const item = makeItem({ id: 'item-1', status: 'PENDING' });
    renderTable([item]);

    // Find the AGREED radio in the SegmentedControl
    const agreedRadio = screen.getByRole('radio', { name: /agreed/i });
    fireEvent.click(agreedRadio);

    await waitFor(() => {
      expect(updateWishlistItem).toHaveBeenCalledWith('item-1', { status: 'AGREED' });
    });
  });

  // ---------------------------------------------------------------------------
  // Edit action
  // ---------------------------------------------------------------------------

  it('calls onEdit with the item when edit button is clicked', () => {
    const onEdit = vi.fn();
    const item = makeItem({ id: 'item-1', name: 'Fancy Lamp' });
    renderTable([item], { onEdit });

    fireEvent.click(screen.getByRole('button', { name: /edit fancy lamp/i }));
    expect(onEdit).toHaveBeenCalledWith(item);
  });

  // ---------------------------------------------------------------------------
  // Delete action
  // ---------------------------------------------------------------------------

  it('opens confirm modal when delete button is clicked', async () => {
    const item = makeItem({ id: 'item-1', name: 'Old Chair' });
    renderTable([item]);

    fireEvent.click(screen.getByRole('button', { name: /delete old chair/i }));
    // Mantine confirm modals render into a shared portal attached to document.body
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/delete wishlist item/i);
    });
  });

  it('calls deleteWishlistItem when confirm is clicked in the modal', async () => {
    const item = makeItem({ id: 'item-1', name: 'Old Chair' });
    renderTable([item]);

    fireEvent.click(screen.getByRole('button', { name: /delete old chair/i }));
    // Wait for the modal to appear then click the confirm button
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/delete wishlist item/i);
    });
    const confirmButton = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Delete',
    );
    expect(confirmButton).toBeTruthy();
    fireEvent.click(confirmButton!);

    await waitFor(() => {
      expect(deleteWishlistItem).toHaveBeenCalledWith('item-1');
    });
  });

  it('does NOT call deleteWishlistItem when Cancel is clicked in the modal', async () => {
    const item = makeItem({ id: 'item-1', name: 'Old Chair' });
    renderTable([item]);

    fireEvent.click(screen.getByRole('button', { name: /delete old chair/i }));
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/delete wishlist item/i);
    });
    const cancelButton = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    );
    expect(cancelButton).toBeTruthy();
    fireEvent.click(cancelButton!);

    // Give any async handlers a chance to fire; then assert no delete call
    await waitFor(() => {
      expect(deleteWishlistItem).not.toHaveBeenCalled();
    });
  });
});
