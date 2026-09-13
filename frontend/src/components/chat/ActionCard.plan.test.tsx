/**
 * ActionCard — plan card consent invariants (REQ-P021, SEC-P011, SEC-P012, SEC-P013)
 *
 * A plan card is one click authorizing N writes. The properties that make that
 * trade honest all live in this component: the rows are actually rendered, the
 * checkboxes actually narrow what gets sent, the Confirm label actually states
 * the count being applied, and values come from the server rather than from a
 * frontend lookup table.
 *
 * These are behavioral tests, not snapshots — a cosmetic restyle should not
 * break them, but a card that sends more rows than the user checked should.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { ActionProposal, ProposalRow } from '../../../../shared/types';

import { ActionCard } from './ActionCard';

function row(
  index: number,
  title: string,
  label = 'Create a task',
  actionId: ProposalRow['actionId'] = 'create_task',
): ProposalRow {
  return {
    rowId: `row-${index}`,
    actionId,
    label,
    params: { title },
    displaySummary: `Create task: ${title}`,
    displayFields: [{ key: 'title', label: 'Title', value: title, editable: true, type: 'text' }],
  };
}

function proposal(rows: ProposalRow[]): ActionProposal {
  return {
    proposalId: '00000000-0000-4000-8000-000000000000',
    rows,
    reasoning: 'Because you asked',
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  };
}

function renderCard(rows: ProposalRow[], onConfirm = vi.fn().mockResolvedValue(undefined)) {
  render(
    <MantineProvider>
      <ActionCard
        proposal={proposal(rows)}
        status="pending"
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
      />
    </MantineProvider>,
  );
  return onConfirm;
}

describe('single-row card is unchanged', () => {
  it('renders without a checkbox and confirms the one row', async () => {
    const user = userEvent.setup();
    const onConfirm = renderCard([row(0, 'Pay PTA')]);

    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledWith([{ rowId: 'row-0', params: { title: 'Pay PTA' } }]);
  });

  it('shows the server-supplied label, not a frontend lookup (SEC-P010)', () => {
    renderCard([row(0, 'Pay PTA', 'Label from the registry')]);
    expect(screen.getByText('Label from the registry')).toBeTruthy();
  });
});

describe('plan card — per-row selection (REQ-P021)', () => {
  const rows = [row(0, 'Alpha'), row(1, 'Beta'), row(2, 'Gamma')];

  it('renders every row, not a summary that stands in for them', () => {
    renderCard(rows);
    expect(screen.getByText('Create task: Alpha')).toBeTruthy();
    expect(screen.getByText('Create task: Beta')).toBeTruthy();
    expect(screen.getByText('Create task: Gamma')).toBeTruthy();
  });

  it('starts with every row checked', () => {
    renderCard(rows);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes).toHaveLength(3);
    expect(boxes.every(b => b.checked)).toBe(true);
  });

  it('sends only the checked rows when one is de-selected', async () => {
    const user = userEvent.setup();
    const onConfirm = renderCard(rows);

    await user.click(screen.getByLabelText('Include: Create task: Beta'));
    await user.click(screen.getByRole('button', { name: /Apply 2 changes/ }));

    expect(onConfirm).toHaveBeenCalledWith([
      { rowId: 'row-0', params: { title: 'Alpha' } },
      { rowId: 'row-2', params: { title: 'Gamma' } },
    ]);
  });

  it('disables Confirm when nothing is checked rather than confirming everything', async () => {
    const user = userEvent.setup();
    const onConfirm = renderCard(rows);

    for (const r of rows) {
      await user.click(screen.getByLabelText(`Include: Create task: ${r.params.title as string}`));
    }

    const confirm = screen.getByRole('button', { name: /Apply 0 changes/ });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('plan card — confirm label states the real count (SEC-P013)', () => {
  it('counts checked rows at click time, not the proposal size', async () => {
    const user = userEvent.setup();
    renderCard([row(0, 'Alpha'), row(1, 'Beta'), row(2, 'Gamma'), row(3, 'Delta')]);

    expect(screen.getByRole('button', { name: /Apply 4 changes/ })).toBeTruthy();

    await user.click(screen.getByLabelText('Include: Create task: Delta'));
    expect(screen.getByRole('button', { name: /Apply 3 changes/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Apply 4 changes/ })).toBeNull();
  });
});

describe('plan card — current vs proposed (SEC-P011)', () => {
  it('shows the value being replaced alongside the new one', () => {
    const updating: ProposalRow = {
      ...row(0, 'New title'),
      currentValues: [
        { key: 'title', label: 'Title', value: 'Old title', editable: false, type: 'text' },
      ],
    };
    renderCard([updating]);

    expect(screen.getByText('Old title')).toBeTruthy();
    expect(screen.getByText('New title')).toBeTruthy();
  });

  it('omits the comparison when the value is unchanged', () => {
    const unchanged: ProposalRow = {
      ...row(0, 'Same'),
      currentValues: [
        { key: 'title', label: 'Title', value: 'Same', editable: false, type: 'text' },
      ],
    };
    renderCard([unchanged]);
    expect(screen.getAllByText('Same')).toHaveLength(1);
  });
});

describe('plan card — legibility above the threshold (SEC-P012)', () => {
  // Grouping keys on actionId, so a realistic mixed card uses two real actions.
  const many = Array.from({ length: 30 }, (_, i) =>
    i % 2 === 0
      ? row(i, `Task ${i}`, 'Create a task', 'create_task')
      : row(i, `Issue ${i}`, 'Report an issue', 'submit_github_issue'),
  );

  it('still renders every row — grouping supplements the rows, never replaces them', () => {
    renderCard(many);
    for (const r of many) {
      expect(screen.getByText(r.displaySummary)).toBeTruthy();
    }
  });

  it('surfaces a count-by-type summary', () => {
    renderCard(many);
    expect(screen.getByText('Create a task × 15')).toBeTruthy();
    expect(screen.getByText('Report an issue × 15')).toBeTruthy();
  });

  it('offers a per-group select-all that narrows the confirmation', async () => {
    const user = userEvent.setup();
    const onConfirm = renderCard(many);

    await user.click(screen.getByLabelText('Select all: Report an issue'));

    const confirm = screen.getByRole('button', { name: /Apply 15 changes/ });
    await user.click(confirm);

    const sent = onConfirm.mock.calls[0][0] as Array<{ rowId: string }>;
    expect(sent).toHaveLength(15);
    // Only the even-indexed "Create a task" rows survive.
    expect(sent.every(s => Number(s.rowId.split('-')[1]) % 2 === 0)).toBe(true);
  });
});

describe('confirmed state', () => {
  it('reports the number applied for a batch', () => {
    render(
      <MantineProvider>
        <ActionCard
          proposal={proposal([row(0, 'Alpha'), row(1, 'Beta')])}
          status="confirmed"
          resource={{ type: 'task', id: 't1', label: 'Alpha' }}
          results={[
            { rowId: 'row-0', actionId: 'create_task', resource: { type: 'task', id: 't1', label: 'Alpha' } },
            { rowId: 'row-1', actionId: 'create_task', resource: { type: 'task', id: 't2', label: 'Beta' } },
          ]}
          onConfirm={vi.fn()}
          onDismiss={vi.fn()}
        />
      </MantineProvider>,
    );

    expect(within(screen.getByText(/Applied/)).getByText('2 changes')).toBeTruthy();
  });
});

describe('failed confirm — the nonce is already spent', () => {
  function renderFailed(rows: ProposalRow[], onConfirm = vi.fn()) {
    render(
      <MantineProvider>
        <ActionCard
          proposal={proposal(rows)}
          status="failed"
          errorMessage="Stopped after applying 2 of 5 changes. The rest were not applied."
          onConfirm={onConfirm}
          onDismiss={vi.fn()}
        />
      </MantineProvider>,
    );
    return onConfirm;
  }

  it('shows the server-supplied error, not a generic failure', () => {
    renderFailed([row(0, 'Alpha')]);
    expect(screen.getByText(/Stopped after applying 2 of 5 changes/)).toBeTruthy();
  });

  it('offers no Confirm after a failure — the nonce is consumed either way', () => {
    renderFailed([row(0, 'Alpha'), row(1, 'Beta'), row(2, 'Gamma')]);
    expect(screen.queryByRole('button', { name: /Apply/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });

  it('offers no Edit-and-retry, which could only ever 409', () => {
    renderFailed([row(0, 'Alpha')]);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('says plainly that a fresh proposal is needed', () => {
    renderFailed([row(0, 'Alpha')]);
    expect(screen.getByText(/Ask me again to get a fresh one/)).toBeTruthy();
  });
});
