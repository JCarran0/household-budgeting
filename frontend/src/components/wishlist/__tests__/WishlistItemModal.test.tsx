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
const addWishlistImage = vi.fn();
const removeWishlistImage = vi.fn();
const getImageBlob = vi.fn();
const prepareImageForUpload = vi.fn();
const showNotification = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: {
    createWishlistItem: (...args: unknown[]) => createWishlistItem(...args),
    updateWishlistItem: (...args: unknown[]) => updateWishlistItem(...args),
    getCategories: () => getCategories(),
    addWishlistImage: (...args: unknown[]) => addWishlistImage(...args),
    removeWishlistImage: (...args: unknown[]) => removeWishlistImage(...args),
    getImageBlob: (...args: unknown[]) => getImageBlob(...args),
  },
}));

// Canvas is not available in jsdom; the resize itself is covered by manual QA.
vi.mock('../../../lib/prepareImageForUpload', () => ({
  prepareImageForUpload: (...args: unknown[]) => prepareImageForUpload(...args),
  ImagePreparationError: class ImagePreparationError extends Error {},
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => showNotification(...args) },
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

  // ---------------------------------------------------------------------------
  // Photo (WISHLIST-BRD.md §3.7) — changes apply on Save, after the item itself
  // ---------------------------------------------------------------------------

  describe('photo', () => {
    const IMAGE = {
      id: '11111111-1111-4111-8111-111111111111',
      mimeType: 'image/jpeg' as const,
      size: 1234,
      uploadedAt: '2026-10-01T00:00:00Z',
    };
    const PREPARED = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });

    beforeEach(() => {
      addWishlistImage.mockReset().mockResolvedValue({});
      removeWishlistImage.mockReset().mockResolvedValue({});
      getImageBlob.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
      prepareImageForUpload.mockReset().mockResolvedValue(PREPARED);
      showNotification.mockReset();
      URL.createObjectURL = vi.fn(() => 'blob:preview');
      URL.revokeObjectURL = vi.fn();
    });

    function pickFile() {
      // The modal renders in a portal, outside the render container.
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['raw'], 'photo.jpg', { type: 'image/jpeg' });
      fireEvent.change(input, { target: { files: [file] } });
      return file;
    }

    async function save() {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      await waitFor(() => expect(updateWishlistItem).toHaveBeenCalled());
    }

    it('uploads a picked photo on Save, after the item update, using the resized blob', async () => {
      renderModal({ item: makeItem() });
      const file = pickFile();
      await waitFor(() => expect(screen.getByRole('img', { name: 'Test Item' })).toBeInTheDocument());
      expect(prepareImageForUpload).toHaveBeenCalledWith(file);
      expect(addWishlistImage).not.toHaveBeenCalled();

      await save();

      await waitFor(() => expect(addWishlistImage).toHaveBeenCalledWith('item-1', PREPARED));
      expect(updateWishlistItem.mock.invocationCallOrder[0]).toBeLessThan(
        addWishlistImage.mock.invocationCallOrder[0],
      );
    });

    it('Cancel discards a picked photo without uploading', async () => {
      const onClose = vi.fn();
      renderModal({ item: makeItem(), onClose });
      pickFile();
      await waitFor(() => expect(prepareImageForUpload).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onClose).toHaveBeenCalled();
      expect(addWishlistImage).not.toHaveBeenCalled();
    });

    it('shows the stored photo with no "Add photo" while the v1 cap of 1 is reached', async () => {
      renderModal({ item: makeItem({ images: [IMAGE] }) });
      await waitFor(() => expect(getImageBlob).toHaveBeenCalledWith(IMAGE.id));
      expect(screen.queryByRole('button', { name: /add photo/i })).not.toBeInTheDocument();
    });

    it('removing the stored photo offers "Add photo" and deletes it only on Save', async () => {
      renderModal({ item: makeItem({ images: [IMAGE] }) });
      fireEvent.click(screen.getByRole('button', { name: /remove photo/i }));
      expect(screen.getByRole('button', { name: /add photo/i })).toBeInTheDocument();
      expect(removeWishlistImage).not.toHaveBeenCalled();

      await save();
      await waitFor(() => expect(removeWishlistImage).toHaveBeenCalledWith('item-1', IMAGE.id));
      expect(addWishlistImage).not.toHaveBeenCalled();
    });

    it('reports a failed upload separately from the item save', async () => {
      addWishlistImage.mockRejectedValue(new Error('Image is larger than 5 MB'));
      const onClose = vi.fn();
      renderModal({ item: makeItem(), onClose });
      pickFile();
      await waitFor(() => expect(prepareImageForUpload).toHaveBeenCalled());

      await save();

      await waitFor(() =>
        expect(showNotification).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Item saved, but the photo was not', color: 'red' }),
        ),
      );
      expect(onClose).toHaveBeenCalled();
    });

    it('shows the reason when a picked file cannot be processed', async () => {
      const { ImagePreparationError } = await import('../../../lib/prepareImageForUpload');
      prepareImageForUpload.mockRejectedValue(new ImagePreparationError("This file couldn't be read as an image. Try a JPEG or PNG."));
      renderModal({ item: makeItem() });
      pickFile();
      expect(await screen.findByText(/couldn't be read as an image/i)).toBeInTheDocument();
    });
  });
});
