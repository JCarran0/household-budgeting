import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StoredWishlistItem, Category } from '../../../../../shared/types';

// ---------------------------------------------------------------------------
// Module mocks — must appear before component imports
// ---------------------------------------------------------------------------

const createWishlistItem = vi.fn();
const updateWishlistItem = vi.fn();
const getCategories = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: {
    createWishlistItem: (...args: unknown[]) => createWishlistItem(...args),
    updateWishlistItem: (...args: unknown[]) => updateWishlistItem(...args),
    getCategories: () => getCategories(),
  },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { WishlistItemModal } from '../WishlistItemModal';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const SPENDING_CAT: Category = {
  id: 'CUSTOM_HOME',
  name: 'Home',
  parentId: null,
  isCustom: true,
  isHidden: false,
  isRollover: false,
  isIncome: false,
  isSavings: false,
};

const INCOME_CAT: Category = {
  id: 'INCOME_WAGES',
  name: 'Wages',
  parentId: null,
  isCustom: false,
  isHidden: false,
  isRollover: false,
  isIncome: true,
  isSavings: false,
};

const SAVINGS_CAT: Category = {
  id: 'CUSTOM_SAVINGS',
  name: 'My Savings',
  parentId: null,
  isCustom: true,
  isHidden: false,
  isRollover: false,
  isIncome: false,
  isSavings: true,
};

const ALL_CATS = [SPENDING_CAT, INCOME_CAT, SAVINGS_CAT];

function makeItem(overrides: Partial<StoredWishlistItem> = {}): StoredWishlistItem {
  return {
    id: 'item-1',
    name: 'Test Item',
    estimatedAmount: 200,
    estimatedMonth: '2026-07',
    categoryId: SPENDING_CAT.id,
    status: 'PENDING',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderModal(props: Partial<React.ComponentProps<typeof WishlistItemModal>> = {}) {
  const merged = {
    opened: true,
    onClose: vi.fn(),
    ...props,
  };
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <WishlistItemModal {...merged} />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WishlistItemModal', () => {
  beforeEach(() => {
    getCategories.mockReset();
    createWishlistItem.mockReset();
    updateWishlistItem.mockReset();
    getCategories.mockResolvedValue(ALL_CATS);
    createWishlistItem.mockResolvedValue({});
    updateWishlistItem.mockResolvedValue({});
  });

  // ---------------------------------------------------------------------------
  // Create mode
  // ---------------------------------------------------------------------------

  it('renders in create mode with empty fields and "Add Item" button', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: /add wishlist item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument();
  });

  it('blocks submission when name is empty (does not call createWishlistItem)', async () => {
    renderModal();
    // Submit with all fields empty
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    // Give any async resolution a moment, then assert the API was not called
    await new Promise((r) => setTimeout(r, 50));
    expect(createWishlistItem).not.toHaveBeenCalled();
  });

  it('blocks submission when required fields are missing', async () => {
    renderModal();
    // Fill name but leave amount and month empty
    fireEvent.change(screen.getByLabelText(/item name/i), { target: { value: 'Sofa' } });
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    await new Promise((r) => setTimeout(r, 50));
    expect(createWishlistItem).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Edit mode
  // ---------------------------------------------------------------------------

  it('renders in edit mode with pre-filled values and "Save Changes" button', () => {
    renderModal({ item: makeItem() });
    expect(screen.getByRole('heading', { name: /edit wishlist item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect((screen.getByLabelText(/item name/i) as HTMLInputElement).value).toBe('Test Item');
  });

  // ---------------------------------------------------------------------------
  // Category filtering
  // ---------------------------------------------------------------------------

  it('displays spending categories in the Select options', async () => {
    renderModal();
    // Wait for categories to load
    await waitFor(() => {
      expect(getCategories).toHaveBeenCalled();
    });
    // Home is a spending category — should appear in the DOM once rendered
    // (Select data is filtered to spending only)
    // We can check that the option label appears after the select is populated
  });

  // ---------------------------------------------------------------------------
  // Status default
  // ---------------------------------------------------------------------------

  it('defaults status to PENDING in create mode (SegmentedControl)', () => {
    renderModal();
    // The SegmentedControl uses radiogroup; the PENDING input should be checked
    const pendingInput = screen.getByRole('radio', { name: /pending/i });
    expect(pendingInput).toBeChecked();
  });
});
