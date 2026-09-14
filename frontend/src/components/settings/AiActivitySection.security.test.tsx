/**
 * AI activity log — link rendering & undo reporting
 *
 * Two things are locked here.
 *
 * 1. SEC-P025 applies to this surface too. The activity log renders a
 *    `resource.url` that, for submit_github_issue, originated OFF-SITE — it is
 *    whatever GitHub's API returned. ChatMessageBubble's rule (host in plain
 *    sight, no exotic schemes) has to hold anywhere an AI-adjacent URL becomes
 *    a clickable element, or the invariant is only as strong as the one
 *    component that remembers it.
 *
 * 2. REQ-P027's skipped undo must not read as a failure. A record the user
 *    edited after the AI touched it is deliberately left alone; reporting that
 *    as an error would teach them to distrust a protection that worked.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import type { ActivityEntry } from '../../lib/api/aiActivity';

const getAiActivity = vi.fn();
const undoAiActivityEntry = vi.fn();
const showNotification = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    getAiActivity: (...args: unknown[]) => getAiActivity(...args),
    undoAiActivityEntry: (...args: unknown[]) => undoAiActivityEntry(...args),
  },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => showNotification(...args) },
}));

import { AiActivitySection } from './AiActivitySection';

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    entryId: 'entry-1',
    createdAt: new Date('2026-09-13T12:00:00Z').toISOString(),
    origin: 'confirmed',
    conversationId: 'conv-1',
    rows: [
      {
        rowId: 'row-1',
        actionId: 'update_task',
        displaySummary: 'Due date → Sep 20',
        resource: { type: 'task', id: 't1', url: '/tasks?taskId=t1', label: 'Take out trash' },
        undoable: true,
      },
    ],
    ...overrides,
  };
}

function renderSection() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <AiActivitySection />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AiActivitySection link rendering', () => {
  it('renders an in-app resource path as a router link with no target', async () => {
    getAiActivity.mockResolvedValue([entry()]);
    renderSection();

    const link = await screen.findByRole('link', { name: 'Take out trash' });
    expect(link.getAttribute('href')).toBe('/tasks?taskId=t1');
    // An internal navigation must not open a new tab, and has no host to disclose.
    expect(link.getAttribute('target')).toBeNull();
  });

  it('discloses the host of an off-site resource and severs the opener', async () => {
    getAiActivity.mockResolvedValue([
      entry({
        rows: [
          {
            rowId: 'row-gh',
            actionId: 'submit_github_issue',
            displaySummary: 'Filed "Budget page crashes"',
            resource: {
              type: 'issue',
              id: '42',
              url: 'https://github.com/example/repo/issues/42',
              label: 'Issue #42',
            },
            undoable: false,
            undoUnavailableReason: 'Issues have to be closed on GitHub.',
          },
        ],
      }),
    ]);
    renderSection();

    const link = await screen.findByRole('link', { name: 'Issue #42' });
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(screen.getByText(/github\.com/)).toBeTruthy();
  });

  it('refuses to linkify a non-http scheme, rendering the label as text', async () => {
    getAiActivity.mockResolvedValue([
      entry({
        rows: [
          {
            rowId: 'row-js',
            actionId: 'update_task',
            resource: { type: 'task', id: 'x', url: 'javascript:alert(1)', label: 'Sneaky' },
            displaySummary: 'nope',
            undoable: false,
            undoUnavailableReason: 'n/a',
          },
        ],
      }),
    ]);
    renderSection();

    expect(await screen.findByText(/Sneaky/)).toBeTruthy();
    // The label still appears — it is just not clickable.
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('offers no undo control when nothing in the batch can be reversed', async () => {
    getAiActivity.mockResolvedValue([
      entry({
        rows: [
          {
            rowId: 'row-gh',
            actionId: 'submit_github_issue',
            displaySummary: 'Filed an issue',
            resource: { type: 'issue', id: '42', label: 'Issue #42' },
            undoable: false,
            undoUnavailableReason: 'Issues have to be closed on GitHub.',
          },
        ],
      }),
    ]);
    renderSection();

    await screen.findByText(/Filed an issue/);
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
  });
});

describe('AiActivitySection undo reporting', () => {
  it('reports a skipped row as protection, not as an error', async () => {
    getAiActivity.mockResolvedValue([entry()]);
    undoAiActivityEntry.mockResolvedValue({
      entryId: 'entry-1',
      changed: false,
      outcomes: [
        {
          rowId: 'row-1',
          status: 'skipped_modified',
          detail: '"Take out trash" has changed since then, so it was left alone.',
        },
      ],
    });
    renderSection();

    await userEvent.click(await screen.findByRole('button', { name: /undo/i }));

    await waitFor(() => expect(showNotification).toHaveBeenCalled());
    const arg = showNotification.mock.calls[0][0] as { message: string; color: string };
    expect(arg.color).not.toBe('red');
    expect(arg.message).toContain('left alone');
  });

  it('marks an unattended batch so it cannot be mistaken for an approved one', async () => {
    getAiActivity.mockResolvedValue([entry({ origin: 'unattended' })]);
    renderSection();

    expect(await screen.findByText('Automatic')).toBeTruthy();
  });
});
