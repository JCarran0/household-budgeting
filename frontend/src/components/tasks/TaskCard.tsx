import { useState } from 'react';
import {
  Card,
  Text,
  Group,
  Badge,
  Avatar,
  Tooltip,
  ThemeIcon,
  Box,
  Menu,
  ActionIcon,
  Modal,
  Button,
  Stack,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconCalendar,
  IconCircleCheck,
  IconHammer,
  IconDotsVertical,
  IconBellZ,
  IconBan,
  IconEdit,
  IconBellOff,
} from '@tabler/icons-react';
import { format, isPast, parseISO, formatDistanceToNowStrict } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import type { StoredTask, FamilyMember } from '../../../../shared/types';
import { isProjectTag } from '../../../../shared/utils/projectHelpers';
import { resolveSnoozeDate } from '../../../../shared/utils/taskSnooze';
import { userColor } from '../../utils/userColor';
import { useProjectTagLookup } from '../../hooks/useProjectTagLookup';

interface TaskCardProps {
  task: StoredTask;
  members: FamilyMember[];
  onClick: () => void;
  /** v2.0 — card kebab menu callbacks. */
  onSnooze?: (taskId: string, snoozedUntil: string | null) => void;
  onCancel?: (taskId: string) => void;
  onEdit?: (task: StoredTask) => void;
  /** When true, renders a "Wake now" action instead of the Snooze submenu
   *  (used from the Snoozed column). */
  isSnoozedView?: boolean;
}

function SubTaskProgress({ subTasks }: { subTasks: StoredTask['subTasks'] }) {
  if (!subTasks || subTasks.length === 0) return null;
  const completed = subTasks.filter((s) => s.completed).length;

  return (
    <Tooltip label={`${completed}/${subTasks.length} sub-tasks done`}>
      <Group gap={3} wrap="nowrap">
        {subTasks.map((st) => (
          <Box
            key={st.id}
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: st.completed
                ? 'var(--mantine-color-green-6)'
                : 'transparent',
              border: st.completed
                ? '1.5px solid var(--mantine-color-green-6)'
                : '1.5px solid var(--mantine-color-dark-3)',
            }}
          />
        ))}
      </Group>
    </Tooltip>
  );
}

export function TaskCard({ task, members, onClick, onSnooze, onCancel, onEdit, isSnoozedView }: TaskCardProps) {
  const navigate = useNavigate();
  const projectTagLookup = useProjectTagLookup();
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [customSnoozeOpen, setCustomSnoozeOpen] = useState(false);
  const [customSnoozeDate, setCustomSnoozeDate] = useState<Date | null>(null);

  const assignee = members.find((m) => m.userId === task.assigneeId);
  const isOverdue = task.dueDate && task.status !== 'done' && task.status !== 'cancelled'
    && isPast(parseISO(task.dueDate));
  const isPersonal = task.scope === 'personal';
  const isDone = task.status === 'done';

  // Find the first project tag on this task (at most one per D6 UI policy)
  const projectTag = (task.tags ?? []).find(isProjectTag);
  const projectMeta = projectTag ? projectTagLookup.get(projectTag) : undefined;
  // Fallback: show raw tag if project was deleted but tag wasn't swept (shouldn't happen post-D9)
  const projectChipLabel = projectMeta?.name ?? projectTag;

  const snoozeAllowed = !isDone && task.status !== 'cancelled';

  const handleSnoozeOption = (option: 'tomorrow' | 'next_week' | 'next_month') => {
    if (!onSnooze) return;
    const iso = resolveSnoozeDate(option, new Date(), new Date().getTimezoneOffset());
    onSnooze(task.id, iso);
  };

  const handleCustomSnoozeConfirm = () => {
    if (!onSnooze || !customSnoozeDate) return;
    const ymd = format(customSnoozeDate, 'yyyy-MM-dd');
    const iso = resolveSnoozeDate('custom', new Date(), new Date().getTimezoneOffset(), ymd);
    onSnooze(task.id, iso);
    setCustomSnoozeOpen(false);
    setCustomSnoozeDate(null);
  };

  const returnsChipLabel = task.snoozedUntil
    ? `Returns ${formatDistanceToNowStrict(new Date(task.snoozedUntil), { addSuffix: true })}`
    : null;

  return (
    <>
      <Card
        shadow="xs"
        padding="xs"
        radius="sm"
        withBorder
        onClick={onClick}
        style={{
          cursor: 'pointer',
          opacity: isPersonal && !isDone ? 0.75 : isDone ? 0.65 : 1,
          borderLeft: isPersonal ? '3px solid var(--mantine-color-violet-6)' : undefined,
        }}
      >
        <Group gap="xs" wrap="nowrap" align="flex-start">
          {isDone && (
            <ThemeIcon size="sm" radius="xl" color="green" variant="filled" mt={2}>
              <IconCircleCheck size={14} />
            </ThemeIcon>
          )}
          <Text size="sm" fw={500} lineClamp={2} td={isDone ? 'line-through' : undefined} style={{ flex: 1 }}>
            {task.title}
          </Text>
          {(onSnooze || onCancel || onEdit) && (
            <Menu position="bottom-end" withinPortal shadow="md" width={180}>
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Task actions"
                >
                  <IconDotsVertical size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                {isSnoozedView && onSnooze && (
                  <Menu.Item
                    leftSection={<IconBellOff size={14} />}
                    onClick={() => onSnooze(task.id, null)}
                  >
                    Wake now
                  </Menu.Item>
                )}
                {!isSnoozedView && onSnooze && snoozeAllowed && (
                  <Menu.Sub>
                    <Menu.Sub.Target>
                      <Menu.Sub.Item leftSection={<IconBellZ size={14} />}>
                        Snooze
                      </Menu.Sub.Item>
                    </Menu.Sub.Target>
                    <Menu.Sub.Dropdown>
                      <Menu.Item onClick={() => handleSnoozeOption('tomorrow')}>
                        Tomorrow
                      </Menu.Item>
                      <Menu.Item onClick={() => handleSnoozeOption('next_week')}>
                        Next week
                      </Menu.Item>
                      <Menu.Item onClick={() => handleSnoozeOption('next_month')}>
                        Next month
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item onClick={() => setCustomSnoozeOpen(true)}>
                        Custom…
                      </Menu.Item>
                    </Menu.Sub.Dropdown>
                  </Menu.Sub>
                )}
                {onEdit && (
                  <Menu.Item
                    leftSection={<IconEdit size={14} />}
                    onClick={() => onEdit(task)}
                  >
                    Edit
                  </Menu.Item>
                )}
                {onCancel && !isDone && task.status !== 'cancelled' && (
                  <>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<IconBan size={14} />}
                      onClick={() => setConfirmCancelOpen(true)}
                    >
                      Cancel task
                    </Menu.Item>
                  </>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>

        {task.subTasks && task.subTasks.length > 0 && (
          <Group mt={4}>
            <SubTaskProgress subTasks={task.subTasks} />
          </Group>
        )}

        <Group gap="xs" mt={4}>
          {assignee && (
            <Tooltip label={assignee.displayName}>
              <Avatar size="xs" radius="xl" color={userColor(assignee)}>
                {assignee.displayName.charAt(0).toUpperCase()}
              </Avatar>
            </Tooltip>
          )}

          {task.dueDate && (
            <Badge
              size="xs"
              variant="light"
              color={isOverdue ? 'red' : 'gray'}
              leftSection={<IconCalendar size={10} />}
            >
              {format(parseISO(task.dueDate), 'MMM d')}
            </Badge>
          )}

          {isPersonal && (
            <Badge size="xs" variant="outline" color="violet">
              Personal
            </Badge>
          )}

          {returnsChipLabel && (
            <Badge size="xs" variant="light" color="indigo" leftSection={<IconBellZ size={10} />}>
              {returnsChipLabel}
            </Badge>
          )}

          {task.tags && task.tags.length > 0 && task.tags
            .filter((tag) => !isProjectTag(tag))
            .map((tag) => (
              <Badge key={tag} size="xs" variant="light" color="teal">
                {tag}
              </Badge>
            ))}

          {projectChipLabel && (
            <Tooltip label="Go to project">
              <Badge
                size="xs"
                variant="filled"
                color="orange"
                leftSection={<IconHammer size={9} />}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  const destination = projectMeta
                    ? `/projects?expand=${projectMeta.id}`
                    : '/projects';
                  navigate(destination);
                }}
              >
                {projectChipLabel}
              </Badge>
            </Tooltip>
          )}
        </Group>
      </Card>

      {/* Cancel confirmation */}
      <Modal
        opened={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        title="Cancel this task?"
        size="sm"
        withinPortal
      >
        <Stack gap="sm">
          <Text size="sm">It will move to Task History.</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setConfirmCancelOpen(false)}>
              Keep task
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (onCancel) onCancel(task.id);
                setConfirmCancelOpen(false);
              }}
            >
              Cancel task
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Custom snooze picker */}
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
