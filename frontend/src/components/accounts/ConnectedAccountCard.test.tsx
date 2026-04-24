import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ConnectedAccountCard } from './ConnectedAccountCard';
import type { ExtendedPlaidAccount } from '../../lib/api';

function renderCard(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function makeAccount(overrides: Partial<ExtendedPlaidAccount> = {}): ExtendedPlaidAccount {
  return {
    id: 'acct-1',
    plaidAccountId: 'plaid-1',
    plaidItemId: 'item-1',
    name: 'Primary Checking',
    nickname: null,
    type: 'checking',
    subtype: 'checking',
    institution: 'Test Bank',
    mask: '4242',
    currentBalance: 1500,
    availableBalance: 1500,
    isActive: true,
    status: 'active',
    lastSynced: '2026-04-20T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
    officialName: 'Primary Checking Account',
    ...overrides,
  };
}

async function openAccountMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /account menu/i }));
  return user;
}

describe('ConnectedAccountCard — reauth branch', () => {
  it('shows Sign-in Required badge and Sign in to Bank menu item when status=requires_reauth', async () => {
    renderCard(
      <ConnectedAccountCard
        account={makeAccount({ status: 'requires_reauth' })}
        isSyncing={false}
        onSync={() => {}}
        onReauth={() => {}}
        onEditNickname={() => {}}
        onDisconnect={() => {}}
      />,
    );
    expect(screen.getByText('Sign-in Required')).toBeInTheDocument();

    await openAccountMenu();
    expect(await screen.findByRole('menuitem', { name: /sign in to bank/i })).toBeInTheDocument();
  });

  it('omits Sign-in Required badge and Sign in to Bank menu item when status=active', async () => {
    renderCard(
      <ConnectedAccountCard
        account={makeAccount({ status: 'active' })}
        isSyncing={false}
        onSync={() => {}}
        onReauth={() => {}}
        onEditNickname={() => {}}
        onDisconnect={() => {}}
      />,
    );
    expect(screen.queryByText('Sign-in Required')).not.toBeInTheDocument();

    await openAccountMenu();
    expect(await screen.findByRole('menuitem', { name: /disconnect account/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /sign in to bank/i })).not.toBeInTheDocument();
  });

  it('fires onReauth with accountId when Sign in to Bank is clicked', async () => {
    const onReauth = vi.fn();
    renderCard(
      <ConnectedAccountCard
        account={makeAccount({ id: 'acct-99', status: 'requires_reauth' })}
        isSyncing={false}
        onSync={() => {}}
        onReauth={onReauth}
        onEditNickname={() => {}}
        onDisconnect={() => {}}
      />,
    );
    const user = await openAccountMenu();
    await user.click(await screen.findByRole('menuitem', { name: /sign in to bank/i }));
    expect(onReauth).toHaveBeenCalledWith('acct-99');
  });
});

describe('ConnectedAccountCard — nickname vs official name', () => {
  it('renders nickname as primary and "Official: {officialName}" as secondary', () => {
    renderCard(
      <ConnectedAccountCard
        account={makeAccount({ nickname: 'Pocket Money', officialName: 'Primary Checking Account' })}
        isSyncing={false}
        onSync={() => {}}
        onReauth={() => {}}
        onEditNickname={() => {}}
        onDisconnect={() => {}}
      />,
    );
    expect(screen.getByText('Pocket Money')).toBeInTheDocument();
    expect(screen.getByText(/^Official: Primary Checking Account ••4242$/)).toBeInTheDocument();
  });

  it('renders name as primary and official name without "Official:" prefix when nickname is absent', () => {
    renderCard(
      <ConnectedAccountCard
        account={makeAccount({ nickname: null, name: 'Primary Checking', officialName: 'Primary Checking Account' })}
        isSyncing={false}
        onSync={() => {}}
        onReauth={() => {}}
        onEditNickname={() => {}}
        onDisconnect={() => {}}
      />,
    );
    expect(screen.getByText('Primary Checking')).toBeInTheDocument();
    expect(screen.getByText(/^Primary Checking Account ••4242$/)).toBeInTheDocument();
    expect(screen.queryByText(/^Official:/)).not.toBeInTheDocument();
  });
});

describe('ConnectedAccountCard — available balance hide-when-equal', () => {
  it('hides Available row when availableBalance equals currentBalance', () => {
    renderCard(
      <ConnectedAccountCard
        account={makeAccount({ currentBalance: 1500, availableBalance: 1500 })}
        isSyncing={false}
        onSync={() => {}}
        onReauth={() => {}}
        onEditNickname={() => {}}
        onDisconnect={() => {}}
      />,
    );
    expect(screen.queryByText(/^Available:/)).not.toBeInTheDocument();
  });

  it('hides Available row when availableBalance is null', () => {
    renderCard(
      <ConnectedAccountCard
        account={makeAccount({ currentBalance: 1500, availableBalance: null })}
        isSyncing={false}
        onSync={() => {}}
        onReauth={() => {}}
        onEditNickname={() => {}}
        onDisconnect={() => {}}
      />,
    );
    expect(screen.queryByText(/^Available:/)).not.toBeInTheDocument();
  });

  it('shows Available row when availableBalance differs from currentBalance', () => {
    renderCard(
      <ConnectedAccountCard
        account={makeAccount({ currentBalance: 1500, availableBalance: 1200 })}
        isSyncing={false}
        onSync={() => {}}
        onReauth={() => {}}
        onEditNickname={() => {}}
        onDisconnect={() => {}}
      />,
    );
    // formatCurrency defaults to no-cents, so "$1,200".
    expect(screen.getByText(/Available: \$1,200/)).toBeInTheDocument();
  });
});

describe('ConnectedAccountCard — handler dispatch', () => {
  it('fires onSync with accountId when sync button is clicked', () => {
    const onSync = vi.fn();
    renderCard(
      <ConnectedAccountCard
        account={makeAccount({ id: 'acct-77' })}
        isSyncing={false}
        onSync={onSync}
        onReauth={() => {}}
        onEditNickname={() => {}}
        onDisconnect={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /sync transactions/i }));
    expect(onSync).toHaveBeenCalledWith('acct-77');
  });

  it('passes a synthetic disconnect target (id/name/institution) — not the whole account', async () => {
    // The page-level state expects a narrow target shape, not the full ExtendedPlaidAccount.
    // Regressions in that shape would leak either too much or too little into the modal.
    const onDisconnect = vi.fn();
    const account = makeAccount({
      id: 'acct-42',
      name: 'My Checking',
      institution: 'Big Bank',
      // Fields that must NOT leak to the modal:
      plaidAccountId: 'plaid-SECRET',
      currentBalance: 9999,
    });
    renderCard(
      <ConnectedAccountCard
        account={account}
        isSyncing={false}
        onSync={() => {}}
        onReauth={() => {}}
        onEditNickname={() => {}}
        onDisconnect={onDisconnect}
      />,
    );
    const user = await openAccountMenu();
    await user.click(await screen.findByRole('menuitem', { name: /disconnect account/i }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledWith({
      id: 'acct-42',
      name: 'My Checking',
      institution: 'Big Bank',
    });
  });

  it('fires onEditNickname with the full account when the edit icon is clicked', () => {
    const onEditNickname = vi.fn();
    const account = makeAccount({ id: 'acct-55' });
    renderCard(
      <ConnectedAccountCard
        account={account}
        isSyncing={false}
        onSync={() => {}}
        onReauth={() => {}}
        onEditNickname={onEditNickname}
        onDisconnect={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /edit nickname/i }));
    expect(onEditNickname).toHaveBeenCalledWith(account);
  });

  it('renders "Last synced: Never" when lastSynced is null', () => {
    renderCard(
      <ConnectedAccountCard
        account={makeAccount({ lastSynced: null })}
        isSyncing={false}
        onSync={() => {}}
        onReauth={() => {}}
        onEditNickname={() => {}}
        onDisconnect={() => {}}
      />,
    );
    const footer = screen.getByText(/Last synced:/);
    expect(within(footer).getByText(/Never/)).toBeInTheDocument();
  });
});
