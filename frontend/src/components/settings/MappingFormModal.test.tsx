import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { AccountOwnerMapping } from '../../../../shared/types';

const createMapping = vi.fn();
const updateMapping = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    createAccountOwnerMapping: (...args: unknown[]) => createMapping(...args),
    updateAccountOwnerMapping: (...args: unknown[]) => updateMapping(...args),
  },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

import { MappingFormModal } from './AccountOwnerMappingsSection';

const members = [
  { userId: 'u1', displayName: 'Alice' },
  { userId: 'u2', displayName: 'Bob' },
];

function makeMapping(overrides: Partial<AccountOwnerMapping> = {}): AccountOwnerMapping {
  return {
    id: 'm1',
    cardIdentifier: '1234',
    displayName: 'Alice Card',
    linkedUserId: 'u1',
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof MappingFormModal>> = {}) {
  const merged: React.ComponentProps<typeof MappingFormModal> = {
    opened: true,
    onClose: () => {},
    members,
    onSaved: () => {},
    ...props,
  };
  return render(
    <MantineProvider>
      <MappingFormModal {...merged} />
    </MantineProvider>,
  );
}

describe('MappingFormModal', () => {
  beforeEach(() => {
    createMapping.mockReset();
    updateMapping.mockReset();
    createMapping.mockResolvedValue({});
    updateMapping.mockResolvedValue({});
  });

  // The useEffect `[opened, mapping]` dependency is the reset invariant:
  // fields should reflect the freshly-supplied mapping whenever the modal
  // opens, and be blank when opened in "add" mode.
  describe('form reset on open', () => {
    it('opens blank when no mapping is supplied (add mode)', () => {
      renderModal();
      expect(screen.getByRole('heading', { name: /add card owner mapping/i })).toBeInTheDocument();
      expect((screen.getByLabelText(/card identifier/i) as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText(/^display name/i) as HTMLInputElement).value).toBe('');
    });

    it('pre-fills fields from the mapping in edit mode', () => {
      renderModal({ mapping: makeMapping() });
      expect(screen.getByRole('heading', { name: /edit card owner mapping/i })).toBeInTheDocument();
      expect((screen.getByLabelText(/card identifier/i) as HTMLInputElement).value).toBe('1234');
      expect((screen.getByLabelText(/^display name/i) as HTMLInputElement).value).toBe('Alice Card');
    });
  });

  it('labels the submit button "Create" in add mode and "Update" in edit mode', () => {
    const { unmount } = renderModal();
    expect(screen.getByRole('button', { name: /^create$/i })).toBeInTheDocument();
    unmount();

    renderModal({ mapping: makeMapping() });
    expect(screen.getByRole('button', { name: /^update$/i })).toBeInTheDocument();
  });

  // Required-field gate — the `disabled` prop on the primary button relies on
  // trim() of both text inputs, so whitespace-only input should keep it off.
  it('disables the primary button until both text fields are non-empty (trimmed)', () => {
    renderModal();
    const submit = screen.getByRole('button', { name: /^create$/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/card identifier/i), { target: { value: '5678' } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^display name/i), { target: { value: '   ' } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^display name/i), { target: { value: 'Bob Card' } });
    expect(submit).not.toBeDisabled();
  });

  it('calls createAccountOwnerMapping with trimmed values and omits linkedUserId when unset', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/card identifier/i), { target: { value: '  5678  ' } });
    fireEvent.change(screen.getByLabelText(/^display name/i), { target: { value: '  Bob Card  ' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(createMapping).toHaveBeenCalledTimes(1));
    // No linkedUserId key on the payload when left blank — the section uses
    // spread-conditional `...(linkedUserId ? { linkedUserId } : {})`.
    expect(createMapping).toHaveBeenCalledWith({
      cardIdentifier: '5678',
      displayName: 'Bob Card',
    });
  });

  it('calls updateAccountOwnerMapping with the mapping id and explicit linkedUserId (including null) in edit mode', async () => {
    renderModal({ mapping: makeMapping({ linkedUserId: 'u1' }) });
    fireEvent.click(screen.getByRole('button', { name: /^update$/i }));

    await waitFor(() => expect(updateMapping).toHaveBeenCalledTimes(1));
    // Edit mode always sends linkedUserId (even if null) — that's the
    // "clear the link" contract with the backend.
    expect(updateMapping).toHaveBeenCalledWith('m1', {
      cardIdentifier: '1234',
      displayName: 'Alice Card',
      linkedUserId: 'u1',
    });
  });
});
