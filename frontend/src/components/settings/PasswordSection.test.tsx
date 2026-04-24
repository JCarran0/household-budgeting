import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

const changePassword = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    changePassword: (...args: unknown[]) => changePassword(...args),
  },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

import { PasswordSection } from './PasswordSection';

function renderSection() {
  return render(
    <MantineProvider>
      <PasswordSection />
    </MantineProvider>,
  );
}

function fillFields(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: confirm } });
}

describe('PasswordSection', () => {
  beforeEach(() => {
    changePassword.mockReset();
    changePassword.mockResolvedValue({ success: true, message: 'ok' });
  });

  it('disables the submit button until every field is non-empty', () => {
    renderSection();
    const submit = screen.getByRole('button', { name: /change password/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'current-password-long-enough' } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'new-password-long-enough' } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'new-password-long-enough' } });
    expect(submit).not.toBeDisabled();
  });

  // Validation order matters: the match check runs BEFORE the length check,
  // so a 5-char mismatched pair surfaces "do not match" rather than "too short".
  it('reports mismatch before length — fails on "do not match" when both are wrong', () => {
    renderSection();
    fillFields('current-password-long-enough', 'short', 'different');
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('rejects passwords under 15 characters', () => {
    renderSection();
    fillFields('current-password-long-enough', 'short1', 'short1');
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 15 characters');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('calls api.changePassword on valid submit and clears inputs on success', async () => {
    renderSection();
    fillFields('current-password-long-enough', 'new-password-15x', 'new-password-15x');
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(1));
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'current-password-long-enough',
      newPassword: 'new-password-15x',
      confirmPassword: 'new-password-15x',
    });

    await waitFor(() => {
      expect((screen.getByLabelText('Current Password') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('New Password') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('Confirm New Password') as HTMLInputElement).value).toBe('');
    });
  });

  it('surfaces the server-supplied error message on API failure', async () => {
    changePassword.mockRejectedValueOnce({ response: { data: { error: 'Current password is incorrect' } } });
    renderSection();
    fillFields('current-password-long-enough', 'new-password-15x', 'new-password-15x');
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Current password is incorrect');
    });
  });
});
