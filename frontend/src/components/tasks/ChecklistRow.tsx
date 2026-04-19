import { useState, useRef, useEffect } from 'react';
import {
  Checkbox,
  Group,
  TextInput,
  Text,
  Menu,
  ActionIcon,
  Avatar,
  Badge,
  Tooltip,
  Modal,
  Button,
  Stack,
  Popover,
  Select,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconDotsVertical,
  IconBellZ,
  IconBellOff,
  IconBan,
  IconEdit,
  IconGripVertical,
  IconCalendar,
  IconHammer,
} from '@tabler/icons-react';
import { format, parseISO, formatDistanceToNowStrict } from 'date-fns';
import type { StoredTask, FamilyMember, SubTask } from '../../../../shared/types';
import { resolveSnoozeDate } from '../../../../shared/utils/taskSnooze';
import { isProjectTag } from '../../../../shared/utils/projectHelpers';
import { userColor } from '../../utils/userColor';
import { useProjectTagLookup } from '../../hooks/useProjectTagLookup';

export interface ChecklistRowProps {
  task: StoredTask;
  members: FamilyMember[];
  dragHandleProps?: Record<string, unknown>;
  /** Called when user toggles Started checkbox. Send new status ('todo' or 'started'). */
  onStartedToggle: (task: StoredTask, started: boolean) => void;
  /** Called when user toggles Done checkbox. Send new status and optional startedAt. */
  onDoneToggle: (task: StoredTask, done: boolean) => void;
  /** Called to save a title edit. */
  onTitleSave: (task: StoredTask, title: string) => void;
  /** Called to save metadata (assignee/dueDate). */
  onMetadataSave: (task: StoredTask, patch: { assigneeId?: string | null; dueDate?: string | null }) => void;
  onSnooze: (task: StoredTask, snoozedUntil: string | null) => void;
  onCancel: (task: StoredTask) => void;
  onEdit: (task: StoredTask) => void;
  onSubTaskToggle: (task: StoredTask, subTaskId: string, completed: boolean) => void;
  onProjectClick?: (projectTag: string) => void;
}

export function ChecklistRow(props: ChecklistRowProps) {
  const {
    task,
    members,
    dragHandleProps,
    onStartedToggle,
    onDoneToggle,
    onTitleSave,
    onMetadataSave,
    onSnooze,
    onCancel,
    onEdit,
    onSubTaskToggle,
    onProjectClick,
  } = props;

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [customSnoozeOpen, setCustomSnoozeOpen] = useState(false);
  const [customSnoozeDate, setCustomSnoozeDate] = useState<Date | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const projectTagLookup = useProjectTagLookup();
  const assignee = members.find((m) => m.userId === task.assigneeId);

  const isDone = task.status === 'done';
  const isStarted = task.status === 'started' || task.status === 'done';
  const snoozeAllowed = !isDone && task.status !== 'cancelled';

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (trimmed && trimmed !== task.title) {
      onTitleSave(task, trimmed);
    } else {
      setTitleDraft(task.title);
    }
  };

  const handleSnoozeOption = (option: 'tomorrow' | 'next_week' | 'next_month') => {
    const iso = resolveSnoozeDate(option, new Date(), new Date().getTimezoneOffset());
    onSnooze(task, iso);
  };

  const handleCustomSnoozeConfirm = () => {
    if (!customSnoozeDate) return;
    const ymd = format(customSnoozeDate, 'yyyy-MM-dd');
    const iso = resolveSnoozeDate('custom', new Date(), new Date().getTimezoneOffset(), ymd);
    onSnooze(task, iso);
    setCustomSnoozeOpen(false);
    setCustomSnoozeDate(null);
  };

  const projectTag = (task.tags ?? []).find(isProjectTag);
  const projectMeta = projectTag ? projectTagLookup.get(projectTag) : undefined;
  const projectChipLabel = projectMeta?.name ?? projectTag;

  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({ value: m.userId, label: m.displayName })),
  ];

  return (
    <>
      <Group
        wrap="nowrap"
        gap="xs"
        px="xs"
        py={4}
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          opacity: isDone ? 0.6 : 1,
        }}
      >
        {dragHandleProps && (
          <ActionIcon variant="subtle" size="xs" {...dragHandleProps} aria-label="Drag handle">
            <IconGripVertical size={14} />
          </ActionIcon>
        )}

        <Checkbox
          size="sm"
          checked={isStarted}
          disabled={isDone}
          onChange={(e) => onStartedToggle(task, e.currentTarget.checked)}
          aria-label="Started"
        />

        <Checkbox
          size="sm"
          checked={isDone}
          onChange={(e) => onDoneToggle(task, e.currentTarget.checked)}
          aria-label="Done"
        />

        {editingTitle ? (
          <TextInput
            ref={titleInputRef}
            size="xs"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.currentTarget.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
              else if (e.key === 'Escape') { setTitleDraft(task.title); setEditingTitle(false); }
            }}
            style={{ flex: 1 }}
          />
        ) : (
          <Text
            size="sm"
            td={isDone ? 'line-through' : undefined}
            style={{ flex: 1, cursor: 'text' }}
            onClick={() => setEditingTitle(true)}
          >
            {task.title}
          </Text>
        )}

        {/* Assignee chip (clickable) */}
        <Popover position="bottom" withArrow withinPortal>
          <Popover.Target>
            {assignee ? (
              <Tooltip label={`Assigned to ${assignee.displayName}`}>
                <Avatar size="xs" radius="xl" color={userColor(assignee)} style={{ cursor: 'pointer' }}>
                  {assignee.displayName.charAt(0).toUpperCase()}
                </Avatar>
              </Tooltip>
            ) : (
              <Badge size="xs" variant="outline" color="gray" style={{ cursor: 'pointer' }}>
                +assignee
              </Badge>
            )}
          </Popover.Target>
          <Popover.Dropdown>
            <Select
              size="xs"
              data={assigneeOptions}
              value={task.assigneeId ?? ''}
              onChange={(val) => onMetadataSave(task, { assigneeId: val || null })}
            />
          </Popover.Dropdown>
        </Popover>

        {/* Due date chip */}
        <Popover position="bottom" withArrow withinPortal>
          <Popover.Target>
            {task.dueDate ? (
              <Badge size="xs" variant="light" color="gray" leftSection={<IconCalendar size={10} />} style={{ cursor: 'pointer' }}>
                {format(parseISO(task.dueDate), 'MMM d')}
              </Badge>
            ) : (
              <Badge size="xs" variant="outline" color="gray" style={{ cursor: 'pointer' }}>
                +due
              </Badge>
            )}
          </Popover.Target>
          <Popover.Dropdown>
            <DatePickerInput
              size="xs"
              value={task.dueDate ? new Date(task.dueDate) : null}
              onChange={(val) =>
                onMetadataSave(task, {
                  dueDate: val ? format(new Date(val), 'yyyy-MM-dd') : null,
                })
              }
              clearable
              popoverProps={{ withinPortal: true }}
            />
          </Popover.Dropdown>
        </Popover>

        {task.snoozedUntil && new Date(task.snoozedUntil).getTime() > Date.now() && (
          <Badge size="xs" variant="light" color="indigo" leftSection={<IconBellZ size={10} />}>
            {formatDistanceToNowStrict(new Date(task.snoozedUntil), { addSuffix: true })}
          </Badge>
        )}

        {projectChipLabel && (
          <Tooltip label="Go to project">
            <Badge
              size="xs"
              variant="filled"
              color="orange"
              leftSection={<IconHammer size={9} />}
              style={{ cursor: 'pointer' }}
              onClick={() => projectTag && onProjectClick?.(projectTag)}
            >
              {projectChipLabel}
            </Badge>
          </Tooltip>
        )}

        <Menu position="bottom-end" withinPortal shadow="md" width={180}>
          <Menu.Target>
            <ActionIcon variant="subtle" size="sm" aria-label="Row actions">
              <IconDotsVertical size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {snoozeAllowed && (
              <Menu.Sub>
                <Menu.Sub.Target>
                  <Menu.Sub.Item leftSection={<IconBellZ size={14} />}>
                    Snooze
                  </Menu.Sub.Item>
                </Menu.Sub.Target>
                <Menu.Sub.Dropdown>
                  <Menu.Item onClick={() => handleSnoozeOption('tomorrow')}>Tomorrow</Menu.Item>
                  <Menu.Item onClick={() => handleSnoozeOption('next_week')}>Next week</Menu.Item>
                  <Menu.Item onClick={() => handleSnoozeOption('next_month')}>Next month</Menu.Item>
                  <Menu.Divider />
                  <Menu.Item onClick={() => setCustomSnoozeOpen(true)}>Custom…</Menu.Item>
                </Menu.Sub.Dropdown>
              </Menu.Sub>
            )}
            {task.snoozedUntil && (
              <Menu.Item leftSection={<IconBellOff size={14} />} onClick={() => onSnooze(task, null)}>
                Wake now
              </Menu.Item>
            )}
            <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onEdit(task)}>
              Edit
            </Menu.Item>
            {!isDone && task.status !== 'cancelled' && (
              <>
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconBan size={14} />} onClick={() => setConfirmCancel(true)}>
                  Cancel task
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>

      {/* Subtasks indented */}
      {task.subTasks && task.subTasks.length > 0 && (
        <Stack gap={2} pl="xl">
          {task.subTasks.map((st) => (
            <ChecklistSubTaskRow
              key={st.id}
              subTask={st}
              onToggle={(completed) => onSubTaskToggle(task, st.id, completed)}
            />
          ))}
        </Stack>
      )}

      {/* Cancel confirmation */}
      <Modal
        opened={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this task?"
        size="sm"
        withinPortal
      >
        <Stack gap="sm">
          <Text size="sm">It will move to Task History.</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setConfirmCancel(false)}>Keep task</Button>
            <Button color="red" onClick={() => { onCancel(task); setConfirmCancel(false); }}>
              Cancel task
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Custom snooze */}
      <Modal
        opened={customSnoozeOpen}
        onClose={() => { setCustomSnoozeOpen(false); setCustomSnoozeDate(null); }}
        title="Snooze until…"
        size="sm"
        withinPortal
      >
        <Stack gap="sm">
          <DatePickerInput
            label="Wake date"
            value={customSnoozeDate}
            onChange={(val) => setCustomSnoozeDate(val ? new Date(val) : null)}
            minDate={new Date()}
            popoverProps={{ withinPortal: true }}
          />
          <Text size="xs" c="dimmed">Task will reappear at 6am local.</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => { setCustomSnoozeOpen(false); setCustomSnoozeDate(null); }}>
              Cancel
            </Button>
            <Button disabled={!customSnoozeDate} onClick={handleCustomSnoozeConfirm}>
              Snooze
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function ChecklistSubTaskRow({
  subTask,
  onToggle,
}: {
  subTask: SubTask;
  onToggle: (completed: boolean) => void;
}) {
  return (
    <Group wrap="nowrap" gap="xs">
      <Checkbox
        size="sm"
        checked={subTask.completed}
        onChange={(e) => onToggle(e.currentTarget.checked)}
      />
      <Text size="sm" td={subTask.completed ? 'line-through' : undefined} c={subTask.completed ? 'dimmed' : undefined}>
        {subTask.title}
      </Text>
    </Group>
  );
}
