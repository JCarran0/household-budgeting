import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DisconnectAccountModal } from './DisconnectAccountModal';

function renderModal(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('DisconnectAccountModal', () => {
  it('renders the header without crashing when target is null', () => {
    // Guards against a prior regression where `target.name` was read without a null
    // guard — rendered output relies on `target && (...)`, so null must be safe.
    renderModal(
      <DisconnectAccountModal
        opened
        onClose={() => {}}
        onConfirm={() => {}}
        isPending={false}
        target={null}
      />,
    );
    expect(screen.getByText('Are you sure you want to disconnect this account?')).toBeInTheDocument();
    // The dimmed "{name} from {institution}" line does not share its wording with
    // any other node — matching the exact pattern here instead of a loose /from/
    // regex, which would false-match the body paragraph.
    expect(
      screen.queryByText((content) => /^[^.]+ from [^.]+$/.test(content.trim())),
    ).not.toBeInTheDocument();
  });

  it('renders "{name} from {institution}" when target is provided', () => {
    renderModal(
      <DisconnectAccountModal
        opened
        onClose={() => {}}
        onConfirm={() => {}}
        isPending={false}
        target={{ id: 'acct-1', name: 'My Checking', institution: 'Big Bank' }}
      />,
    );
    expect(screen.getByText('My Checking from Big Bank')).toBeInTheDocument();
  });

  it('fires onClose on Cancel and onConfirm on the red Disconnect button', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderModal(
      <DisconnectAccountModal
        opened
        onClose={onClose}
        onConfirm={onConfirm}
        isPending={false}
        target={{ id: 'acct-1', name: 'X', institution: 'Y' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /disconnect account/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
