/**
 * authStore login ordering — regression test for the double-login bug.
 *
 * Bug: login() fetched the workspace list BEFORE committing the new token to
 * the store/localStorage. The request interceptor reads the token from
 * localStorage, so listWorkspaces() went out with the stale (just-cleared)
 * token, 401'd, and the response interceptor hard-redirected to /login — so the
 * first login appeared to fail and the user had to log in twice.
 *
 * Fix: commit auth state first, then fetch workspaces. These tests assert the
 * token is already in the store when listWorkspaces runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RegisterCredentials } from '../../../../shared/types';

vi.mock('../../lib/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
    listWorkspaces: vi.fn(),
  },
}));

vi.mock('../../lib/queryClient', () => ({
  queryClient: {
    cancelQueries: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
  },
}));

import { useAuthStore } from '../authStore';
import { api } from '../../lib/api';

const mockUser = {
  id: 'u1',
  username: 'alice',
  displayName: 'Alice',
  familyId: 'fam-1',
  workspaceIds: ['fam-1'],
  activeWorkspaceId: 'fam-1',
  createdAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    workspaces: [],
    activeWorkspaceId: null,
  });
  localStorage.clear();
});

describe('authStore.login — token committed before workspace fetch', () => {
  it('has the new token in the store when listWorkspaces is called', async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      token: 'new-token',
      user: mockUser,
    });

    let tokenWhenListCalled: string | null = 'UNSET';
    (api.listWorkspaces as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      tokenWhenListCalled = useAuthStore.getState().token;
      return [];
    });

    await useAuthStore.getState().login({ username: 'alice', password: 'pw' });

    // The regression: this was null before the fix (set() ran after the fetch).
    expect(tokenWhenListCalled).toBe('new-token');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().token).toBe('new-token');
  });

  it('stays authenticated even if listWorkspaces fails (non-fatal)', async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      token: 'new-token',
      user: mockUser,
    });
    (api.listWorkspaces as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

    await useAuthStore.getState().login({ username: 'alice', password: 'pw' });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().token).toBe('new-token');
  });

  it('register also commits the token before fetching workspaces', async () => {
    (api.register as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      token: 'reg-token',
      user: mockUser,
    });

    let tokenWhenListCalled: string | null = 'UNSET';
    (api.listWorkspaces as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      tokenWhenListCalled = useAuthStore.getState().token;
      return [];
    });

    await useAuthStore.getState().register(
      { username: 'alice', password: 'pw' } as unknown as RegisterCredentials,
    );

    expect(tokenWhenListCalled).toBe('reg-token');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
