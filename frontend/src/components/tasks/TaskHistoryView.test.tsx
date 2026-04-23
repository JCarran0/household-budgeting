import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { TaskHistoryView } from './TaskHistoryView';
import type { FamilyMember, StoredTask } from '../../../../shared/types';

function renderWithMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

const members: FamilyMember[] = [
  { userId: 'user-1', displayName: 'Alice', joinedAt: '2026-01-01T00:00:00Z' },
  { userId: 'user-2', displayName: 'Bob', joinedAt: '2026-01-01T00:00:00Z' },
];

function makeTask(overrides: Partial<StoredTask> & { id: string }): StoredTask {
  return {
    id: overrides.id,
    familyId: 'fam-1',
    title: overrides.title ?? `task-${overrides.id}`,
    description: '',
    status: overrides.status ?? 'todo',
    scope: overrides.scope ?? 'family',
    assigneeId: overrides.assigneeId ?? null,
    dueDate: null,
    createdAt: overrides.createdAt ?? '2026-04-01T00:00:00Z',
    createdBy: 'user-1',
    startedAt: null,
    completedAt: overrides.completedAt ?? null,
    cancelledAt: null,
    assignedAt: null,
    transitions: [],
    tags: [],
    subTasks: [],
    snoozedUntil: null,
    sortOrder: 0,
  };
}

describe('TaskHistoryView', () => {
  it('renders all tasks and their computed count when no filter is active', () => {
    renderWithMantine(
      <TaskHistoryView
        tasks={[
          makeTask({ id: 'a', title: 'First' }),
          makeTask({ id: 'b', title: 'Second' }),
          makeTask({ id: 'c', title: 'Third' }),
        ]}
        members={members}
        onTaskClick={() => {}}
      />,
    );
    expect(screen.getByText('3 tasks')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
  });

  it('sorts rows by createdAt DESC (newest first)', () => {
    renderWithMantine(
      <TaskHistoryView
        tasks={[
          makeTask({ id: 'old', title: 'OLD', createdAt: '2026-01-01T00:00:00Z' }),
          makeTask({ id: 'new', title: 'NEW', createdAt: '2026-04-01T00:00:00Z' }),
          makeTask({ id: 'mid', title: 'MID', createdAt: '2026-03-01T00:00:00Z' }),
        ]}
        members={members}
        onTaskClick={() => {}}
      />,
    );
    // Row order in the DOM should be NEW, MID, OLD
    const titles = screen.getAllByText(/^(NEW|MID|OLD)$/).map((el) => el.textContent);
    expect(titles).toEqual(['NEW', 'MID', 'OLD']);
  });

  it('filtering by scope "Personal" hides family tasks', () => {
    renderWithMantine(
      <TaskHistoryView
        tasks={[
          makeTask({ id: 'fam', title: 'Family task', scope: 'family' }),
          makeTask({ id: 'per', title: 'Personal task', scope: 'personal' }),
        ]}
        members={members}
        onTaskClick={() => {}}
      />,
    );
    // SegmentedControl renders as radio inputs under the hood; pick by value.
    const personalRadio = screen
      .getAllByRole('radio')
      .find((el) => (el as HTMLInputElement).value === 'personal');
    expect(personalRadio).toBeDefined();
    fireEvent.click(personalRadio!);

    expect(screen.getByText('Personal task')).toBeInTheDocument();
    expect(screen.queryByText('Family task')).not.toBeInTheDocument();
    expect(screen.getByText('1 tasks')).toBeInTheDocument();
  });

  it('renders "Unassigned" for tasks with null assigneeId', () => {
    renderWithMantine(
      <TaskHistoryView
        tasks={[makeTask({ id: 'a', title: 'Orphan', assigneeId: null })]}
        members={members}
        onTaskClick={() => {}}
      />,
    );
    // "Unassigned" also appears in the closed Assignee Select's options list,
    // so scope the assertion to the table row for the rendered task.
    const row = screen.getByText('Orphan').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders the assignee display name when assigneeId matches a member', () => {
    renderWithMantine(
      <TaskHistoryView
        tasks={[makeTask({ id: 'a', title: 'Bobs task', assigneeId: 'user-2' })]}
        members={members}
        onTaskClick={() => {}}
      />,
    );
    // Alice is in the assignee filter dropdown options and Bob is too — scope
    // the assertion to the table row for the rendered task.
    const row = screen.getByText('Bobs task').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('Bob')).toBeInTheDocument();
  });

  it('fires onTaskClick with the clicked task', () => {
    const onTaskClick = vi.fn();
    const task = makeTask({ id: 'clicked', title: 'Clickme' });
    renderWithMantine(
      <TaskHistoryView
        tasks={[task]}
        members={members}
        onTaskClick={onTaskClick}
      />,
    );
    fireEvent.click(screen.getByText('Clickme'));
    expect(onTaskClick).toHaveBeenCalledWith(task);
  });
});
