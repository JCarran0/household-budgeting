/**
 * Frontend workspace switcher tests — Phase 2.4
 *
 * Covers:
 *   - Switcher hidden when user has ≤1 workspace (REQ-004)
 *   - Switching invalidates React Query cache (queryClient.clear called)
 *   - Business workspace renders BUSINESS_NAV only (no Budgets/Trips/etc.)
 *   - Personal workspace does not show the Statements nav item
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import type { Family, User } from '../../../../shared/types';

// ---------------------------------------------------------------------------
// Mock heavy dependencies that don't need to run in unit tests
// ---------------------------------------------------------------------------

vi.mock('../../lib/api', () => ({
  api: {
    getVersion: vi.fn().mockResolvedValue({ current: '1.0.0' }),
    listWorkspaces: vi.fn().mockResolvedValue([]),
    switchWorkspace: vi.fn(),
  },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

vi.mock('../../hooks/useDailyInspiration', () => ({
  useDailyInspiration: () => ({ opened: false, close: vi.fn() }),
}));

vi.mock('../../hooks/useSharedAttachment', () => ({
  useSharedAttachment: () => null,
}));

vi.mock('../../components/ChangelogModal', () => ({
  ChangelogModal: () => null,
}));

vi.mock('../../components/feedback/FeedbackModal', () => ({
  FeedbackModal: () => null,
}));

vi.mock('../../components/chat/ChatFAB', () => ({
  ChatFAB: () => null,
}));

vi.mock('../../components/chat/ChatOverlay', () => ({
  ChatOverlay: () => null,
}));

vi.mock('../../components/InspirationModal', () => ({
  InspirationModal: () => null,
}));

vi.mock('../../components/AppLogo', () => ({
  AppLogo: () => <span>Logo</span>,
}));

vi.mock('../../lib/queryClient', () => ({
  queryClient: {
    cancelQueries: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { MantineLayout } from '../../components/MantineLayout';
import { useAuthStore } from '../authStore';
import { queryClient } from '../../lib/queryClient';
import { api } from '../../lib/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PERSONAL_FAMILY_ID = 'family-personal';
const BUSINESS_FAMILY_ID = 'family-business';

function makeUser(familyId: string, workspaceIds: string[]): User {
  return {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    familyId,
    workspaceIds,
    activeWorkspaceId: familyId,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function makeFamily(id: string, name: string, type: 'personal' | 'business' = 'personal'): Family {
  return {
    id,
    name,
    members: [],
    workspaceType: type,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function seedStore(opts: {
  user: User;
  workspaces: Family[];
  activeWorkspaceId: string;
}) {
  useAuthStore.setState({
    user: opts.user,
    token: 'tok',
    isAuthenticated: true,
    isLoading: false,
    error: null,
    workspaces: opts.workspaces,
    activeWorkspaceId: opts.activeWorkspaceId,
  });
}

function renderLayout() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <MantineLayout />
      </MemoryRouter>
    </MantineProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Workspace switcher visibility', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null, token: null, isAuthenticated: false,
      isLoading: false, error: null, workspaces: [], activeWorkspaceId: null,
    });
  });

  it('shows no Workspaces section in the account menu with a single workspace', async () => {
    const family = makeFamily(PERSONAL_FAMILY_ID, 'Personal');
    seedStore({
      user: makeUser(PERSONAL_FAMILY_ID, [PERSONAL_FAMILY_ID]),
      workspaces: [family],
      activeWorkspaceId: PERSONAL_FAMILY_ID,
    });

    renderLayout();

    // Open the account menu (the switcher now lives here, Chrome-profile style)
    fireEvent.click(screen.getByLabelText('Account menu'));
    // Menu is open (Settings is present) but there is no Workspaces section (REQ-004)
    expect(await screen.findByText('Settings')).toBeInTheDocument();
    expect(screen.queryByText('Workspaces')).toBeNull();
  });

  it('lists workspaces in the account menu when the user has multiple', async () => {
    const personal = makeFamily(PERSONAL_FAMILY_ID, 'Personal');
    const business = makeFamily(BUSINESS_FAMILY_ID, 'Business', 'business');
    seedStore({
      user: makeUser(PERSONAL_FAMILY_ID, [PERSONAL_FAMILY_ID, BUSINESS_FAMILY_ID]),
      workspaces: [personal, business],
      activeWorkspaceId: PERSONAL_FAMILY_ID,
    });

    renderLayout();

    fireEvent.click(screen.getByLabelText('Account menu'));
    expect(await screen.findByText('Workspaces')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('Business')).toBeInTheDocument();
  });
});

describe('Workspace switcher — cache invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null, token: null, isAuthenticated: false,
      isLoading: false, error: null, workspaces: [], activeWorkspaceId: null,
    });
  });

  it('calls queryClient.clear when switching workspaces', async () => {
    const personal = makeFamily(PERSONAL_FAMILY_ID, 'Personal');
    const business = makeFamily(BUSINESS_FAMILY_ID, 'Business', 'business');

    const newUser = makeUser(BUSINESS_FAMILY_ID, [PERSONAL_FAMILY_ID, BUSINESS_FAMILY_ID]);
    vi.mocked(api.switchWorkspace).mockResolvedValue({
      token: 'new-token',
      user: newUser,
    });
    vi.mocked(api.listWorkspaces).mockResolvedValue([personal, business]);

    seedStore({
      user: makeUser(PERSONAL_FAMILY_ID, [PERSONAL_FAMILY_ID, BUSINESS_FAMILY_ID]),
      workspaces: [personal, business],
      activeWorkspaceId: PERSONAL_FAMILY_ID,
    });

    // Invoke switchWorkspace directly on the store (the Select interaction is
    // difficult to drive in jsdom with Mantine's custom combobox; testing the
    // store action directly is the right granularity here).
    await useAuthStore.getState().switchWorkspace(BUSINESS_FAMILY_ID);

    expect(queryClient.clear).toHaveBeenCalled();
  });
});

describe('Nav gating by workspace type', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null, token: null, isAuthenticated: false,
      isLoading: false, error: null, workspaces: [], activeWorkspaceId: null,
    });
  });

  it('shows personal nav items (Dashboard, Budgets, Trips) for personal workspace', () => {
    const family = makeFamily(PERSONAL_FAMILY_ID, 'Personal');
    seedStore({
      user: makeUser(PERSONAL_FAMILY_ID, [PERSONAL_FAMILY_ID]),
      workspaces: [family],
      activeWorkspaceId: PERSONAL_FAMILY_ID,
    });

    renderLayout();

    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.getByText('Budgets')).toBeDefined();
    expect(screen.getByText('Trips')).toBeDefined();
    // Statements must NOT appear in personal workspace
    expect(screen.queryByText('Statements')).toBeNull();
  });

  it('shows business nav items (Statements) and hides family items (Budgets, Trips)', () => {
    const personal = makeFamily(PERSONAL_FAMILY_ID, 'Personal');
    const business = makeFamily(BUSINESS_FAMILY_ID, 'Business', 'business');
    seedStore({
      user: makeUser(BUSINESS_FAMILY_ID, [PERSONAL_FAMILY_ID, BUSINESS_FAMILY_ID]),
      workspaces: [personal, business],
      activeWorkspaceId: BUSINESS_FAMILY_ID,
    });

    renderLayout();

    expect(screen.getByText('Statements')).toBeDefined();
    // Family-only items must NOT appear in business workspace
    expect(screen.queryByText('Budgets')).toBeNull();
    expect(screen.queryByText('Trips')).toBeNull();
    expect(screen.queryByText('Dashboard')).toBeNull();
  });
});
