import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { TaskFormModal } from './TaskFormModal';
import type { FamilyMember, StoredTask } from '../../../../shared/types';

// Minimal Mantine wrapper — modal renders portal children into document.body
// which testing-library queries pick up via `screen`.
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
    title: overrides.title ?? 'existing task',
    description: overrides.description ?? '',
    status: overrides.status ?? 'todo',
    scope: overrides.scope ?? 'family',
    assigneeId: overrides.assigneeId ?? null,
    dueDate: overrides.dueDate ?? null,
    createdAt: overrides.createdAt ?? '2026-04-01T00:00:00Z',
    createdBy: overrides.createdBy ?? 'user-1',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    assignedAt: null,
    transitions: [],
    tags: overrides.tags ?? [],
    subTasks: overrides.subTasks ?? [],
    snoozedUntil: null,
    sortOrder: 0,
  };
}

describe('TaskFormModal', () => {
  // -------------------------------------------------------------------------
  // Create-mode assignee defaulting — the landmine here is filter-inheritance:
  // if createDefaults.assigneeId is explicitly `null` (Unassigned), we must
  // honor it rather than falling through to currentUserId. Getting this wrong
  // means a new task created on the Unassigned filter immediately becomes
  // hidden (it gets auto-assigned to the creator).
  // -------------------------------------------------------------------------
  describe('create-mode assignee default', () => {
    it('falls back to currentUserId when no createDefaults provided', () => {
      const onSubmit = vi.fn();
      renderWithMantine(
        <TaskFormModal
          opened
          onClose={() => {}}
          onSubmit={onSubmit}
          members={members}
          loading={false}
          title="Create Task"
          currentUserId="user-1"
        />,
      );
      // Type a title to pass the required validation
      const titleInput = screen.getByLabelText(/title/i);
      fireEvent.change(titleInput, { target: { value: 'New task' } });
      // Submit via the Create button
      fireEvent.click(screen.getByRole('button', { name: /create task/i }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        title: 'New task',
        assigneeId: 'user-1',
      });
    });

    it('honors explicit null from createDefaults.assigneeId (Unassigned filter)', () => {
      const onSubmit = vi.fn();
      renderWithMantine(
        <TaskFormModal
          opened
          onClose={() => {}}
          onSubmit={onSubmit}
          members={members}
          loading={false}
          title="Create Task"
          currentUserId="user-1"
          createDefaults={{ assigneeId: null }}
        />,
      );
      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Unassigned task' } });
      fireEvent.click(screen.getByRole('button', { name: /create task/i }));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Unassigned task',
          assigneeId: null,
        }),
      );
    });

    it('uses createDefaults.assigneeId when a specific user is passed', () => {
      const onSubmit = vi.fn();
      renderWithMantine(
        <TaskFormModal
          opened
          onClose={() => {}}
          onSubmit={onSubmit}
          members={members}
          loading={false}
          title="Create Task"
          currentUserId="user-1"
          createDefaults={{ assigneeId: 'user-2' }}
        />,
      );
      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Task for Bob' } });
      fireEvent.click(screen.getByRole('button', { name: /create task/i }));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeId: 'user-2' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Edit mode preserves initial values — specifically, the stored assignee
  // must win over any createDefaults that happen to leak in.
  // -------------------------------------------------------------------------
  describe('edit mode', () => {
    it('uses initialValues.assigneeId, not createDefaults', () => {
      const onSubmit = vi.fn();
      const task = makeTask({ id: 't1', title: 'Editing me', assigneeId: 'user-2' });
      renderWithMantine(
        <TaskFormModal
          opened
          onClose={() => {}}
          onSubmit={onSubmit}
          members={members}
          loading={false}
          title="Edit Task"
          initialValues={task}
          currentUserId="user-1"
          // Even if createDefaults is present, edit mode should ignore it.
          createDefaults={{ assigneeId: null }}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Editing me',
          assigneeId: 'user-2',
        }),
      );
    });

    it('shows only the Save Changes button (no Start Task button in edit mode)', () => {
      const task = makeTask({ id: 't1' });
      renderWithMantine(
        <TaskFormModal
          opened
          onClose={() => {}}
          onSubmit={() => {}}
          members={members}
          loading={false}
          title="Edit Task"
          initialValues={task}
        />,
      );
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /start task/i })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // lockedTags — the prop is set by Projects.tsx so a task created in a
  // project's Tasks tab gets the project's tag baked in and can't be removed.
  // -------------------------------------------------------------------------
  describe('lockedTags', () => {
    it('pre-populates the submission with locked tags', () => {
      const onSubmit = vi.fn();
      renderWithMantine(
        <TaskFormModal
          opened
          onClose={() => {}}
          onSubmit={onSubmit}
          members={members}
          loading={false}
          title="Create Task"
          currentUserId="user-1"
          lockedTags={['project-foo']}
        />,
      );
      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Scoped task' } });
      fireEvent.click(screen.getByRole('button', { name: /create task/i }));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['project-foo'] }),
      );
    });

    it('merges lockedTags with existing tags on edit (deduped)', () => {
      const onSubmit = vi.fn();
      const task = makeTask({ id: 't1', tags: ['project-foo', 'urgent'] });
      renderWithMantine(
        <TaskFormModal
          opened
          onClose={() => {}}
          onSubmit={onSubmit}
          members={members}
          loading={false}
          title="Edit Task"
          initialValues={task}
          lockedTags={['project-foo']}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      const payload = onSubmit.mock.calls[0][0];
      // Deduped — 'project-foo' appears exactly once
      expect(payload.tags).toEqual(['project-foo', 'urgent']);
    });
  });
});
