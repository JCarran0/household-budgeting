import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { User } from '../../../../shared/types';

const updateProfile = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    updateProfile: (...args: unknown[]) => updateProfile(...args),
  },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

import { ProfileSection } from './ProfileSection';
import { useAuthStore } from '../../stores/authStore';

function seedUser(partial: Partial<User> = {}) {
  const user: User = {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    familyId: 'fam-1',
    color: 'blue',
    createdAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
  useAuthStore.setState({
    user,
    token: 'tok',
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
}

function renderSection() {
  return render(
    <MantineProvider>
      <ProfileSection />
    </MantineProvider>,
  );
}

describe('ProfileSection', () => {
  beforeEach(() => {
    updateProfile.mockReset();
    updateProfile.mockResolvedValue({});
  });

  // canSave truth table: enabled only when name has content AND something changed.
  describe('Save enablement', () => {
    it('is disabled when nothing has changed', () => {
      seedUser({ displayName: 'Alice', color: 'blue' });
      renderSection();
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('is disabled when display name is whitespace-only', () => {
      seedUser({ displayName: 'Alice', color: 'blue' });
      renderSection();
      fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: '   ' } });
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('is enabled when only the name changes', () => {
      seedUser({ displayName: 'Alice', color: 'blue' });
      renderSection();
      fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Alicia' } });
      expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
    });

    it('is enabled when only the color changes', () => {
      seedUser({ displayName: 'Alice', color: 'blue' });
      renderSection();
      fireEvent.click(screen.getByRole('button', { name: /choose green/i }));
      expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
    });
  });

  // The `colorChanged ? color : undefined` branch — if the user only edits
  // their name, we must NOT overwrite color. Equally, if only the color
  // changes, the trimmed current name still goes through (it's required).
  describe('Save payload selectivity', () => {
    it('omits color when only the name was changed', async () => {
      seedUser({ displayName: 'Alice', color: 'blue' });
      renderSection();
      fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Alicia' } });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
      expect(updateProfile).toHaveBeenCalledWith('Alicia', undefined);
    });

    it('passes the new color when only the color was changed', async () => {
      seedUser({ displayName: 'Alice', color: 'blue' });
      renderSection();
      fireEvent.click(screen.getByRole('button', { name: /choose green/i }));
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
      expect(updateProfile).toHaveBeenCalledWith('Alice', 'green');
    });

    it('trims whitespace from the display name before saving', async () => {
      seedUser({ displayName: 'Alice', color: 'blue' });
      renderSection();
      fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: '  Alicia  ' } });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
      expect(updateProfile).toHaveBeenCalledWith('Alicia', undefined);
    });
  });
});
