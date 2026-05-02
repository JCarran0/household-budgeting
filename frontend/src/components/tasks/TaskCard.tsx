import { useRef, useState, type ReactNode } from 'react';
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
import { useMediaQuery } from '@mantine/hooks';
import { DatePickerInput } from '@mantine/dates';
import { useSwipeable } from 'react-swipeable';
import {
  IconCalendar,
  IconCircleCheck,
  IconHammer,
  IconDotsVertical,
  IconBellZ,
  IconBan,
  IconEdit,
  IconBellOff,
  IconCheck,
  IconPlayerPlay,
  IconArrowBackUp,
} from '@tabler/icons-react';
import { format, isPast, formatDistanceToNowStrict } from 'date-fns';
import { parseDateString } from '../../utils/formatters';
import { useNavigate } from 'react-router-dom';
import type { StoredTask, FamilyMember, TaskStatus } from '../../../../shared/types';
import { isProjectTag } from '../../../../shared/utils/projectHelpers';
import { resolveSnoozeDate } from '../../../../shared/utils/taskSnooze';
import { userColor, userAvatarStyle } from '../../utils/userColor';
import { useProjectTagLookup } from '../../hooks/useProjectTagLookup';

interface TaskCardProps {
  task: StoredTask;
  members: FamilyMember[];
  onClick: () => void;
  /** v2.0 — card kebab menu callbacks. */
  onSnooze?: (taskId: string, snoozedUntil: string | null) => void;
  onCancel?: (taskId: string) => void;
  onEdit?: (task: StoredTask) => void;
  /** Swipe-action status change (mobile, REQ-050). Invoked on forward
   *  progress (Todo→Started, Started→Done) and backward undo (Done→Started). */
  onChangeStatus?: (taskId: string, newStatus: TaskStatus) => void;
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

export function TaskCard({ task, members, onClick, onSnooze, onCancel, onEdit, onChangeStatus, isSnoozedView }: TaskCardProps) {
  const navigate = useNavigate();
  const projectTagLookup = useProjectTagLookup();
  // Mobile kebab opens the Edit modal directly (REQ-054). Cancel / longer-
  // grain snooze / move-back transitions live inside the modal on mobile;
  // on desktop they stay in the dropdown menu.
  const isMobile = useMediaQuery('(max-width: 48em)', false, { getInitialValueInEffect: false }) ?? false;
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [customSnoozeOpen, setCustomSnoozeOpen] = useState(false);
  // Mantine 8's DatePickerInput emits YYYY-MM-DD strings. Keep state as a
  // string to avoid a Date round-trip that shifts the day in timezones west
  // of UTC (see formHelpers.dateToIso).
  const [customSnoozeDate, setCustomSnoozeDate] = useState<string | null>(null);

  const assignee = members.find((m) => m.userId === task.assigneeId);
  const isOverdue = task.dueDate && task.status !== 'done' && task.status !== 'cancelled'
    && isPast(parseDateString(task.dueDate));
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

  // === Mobile swipe actions (BRD §3.1.7.2, REQ-050..052) ===
  //
  // Right-swipe = forward progress or unsnooze (blue/green)
  // Left-swipe  = snooze tomorrow (orange) OR undo-from-done (red)
  // Past 40% of card width: release auto-commits. Before: snaps back.
  // Card translates with finger; colored action reveal sits behind.
  interface SwipeAction {
    color: 'blue' | 'green' | 'orange' | 'red';
    label: string;
    icon: ReactNode;
    onCommit: () => void;
  }

  const rightAction: SwipeAction | null = !isMobile
    ? null
    : isSnoozedView
      ? (onSnooze
        ? { color: 'blue', label: 'Unsnooze', icon: <IconBellOff size={20} />, onCommit: () => onSnooze(task.id, null) }
        : null)
      : task.status === 'todo' && onChangeStatus
        ? { color: 'blue', label: 'Start', icon: <IconPlayerPlay size={20} />, onCommit: () => onChangeStatus(task.id, 'started') }
        : task.status === 'started' && onChangeStatus
          ? { color: 'green', label: 'Done', icon: <IconCheck size={20} />, onCommit: () => onChangeStatus(task.id, 'done') }
          : null;

  const leftAction: SwipeAction | null = !isMobile || isSnoozedView
    ? null
    : task.status === 'done' && onChangeStatus
      ? { color: 'red', label: 'Undo', icon: <IconArrowBackUp size={20} />, onCommit: () => onChangeStatus(task.id, 'started') }
      : (task.status === 'todo' || task.status === 'started') && onSnooze
        ? {
            color: 'orange',
            label: 'Snooze',
            icon: <IconBellZ size={20} />,
            onCommit: () => {
              const iso = resolveSnoozeDate('tomorrow', new Date(), new Date().getTimezoneOffset());
              onSnooze(task.id, iso);
            },
          }
        : null;

  const swipeWrapperRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const swipeCommittedRef = useRef(false);

  const commitSwipe = (action: SwipeAction) => {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
    swipeCommittedRef.current = true;
    action.onCommit();
    // Leave dragX as-is — the task will transition away from this tab and
    // unmount. If it doesn't (e.g. unsnooze keeps it in view briefly), snap
    // back after a tick.
    setTimeout(() => {
      setDragX(0);
      swipeCommittedRef.current = false;
    }, 200);
  };

  const swipeHandlers = useSwipeable({
    onSwiping: (e) => {
      if (!isMobile) return;
      if (e.deltaX > 0 && !rightAction) return;
      if (e.deltaX < 0 && !leftAction) return;
      setDragX(e.deltaX);
    },
    onSwiped: (e) => {
      if (!isMobile) return;
      const width = swipeWrapperRef.current?.getBoundingClientRect().width ?? 300;
      const threshold = width * 0.4;
      if (e.deltaX > threshold && rightAction) {
        commitSwipe(rightAction);
      } else if (e.deltaX < -threshold && leftAction) {
        commitSwipe(leftAction);
      } else {
        setDragX(0);
      }
    },
    trackTouch: true,
    trackMouse: false,
    delta: 10,
    preventScrollOnSwipe: true,
  });

  const handleCustomSnoozeConfirm = () => {
    if (!onSnooze || !customSnoozeDate) return;
    const iso = resolveSnoozeDate('custom', new Date(), new Date().getTimezoneOffset(), customSnoozeDate);
    onSnooze(task.id, iso);
    setCustomSnoozeOpen(false);
    setCustomSnoozeDate(null);
  };

  const returnsChipLabel = task.snoozedUntil
    ? `Returns ${formatDistanceToNowStrict(new Date(task.snoozedUntil), { addSuffix: true })}`
    : null;

  const showsSwipeReveal = isMobile && dragX !== 0;
  const activeRevealAction = dragX > 0 ? rightAction : dragX < 0 ? leftAction : null;

  return (
    <>
      <div
        ref={swipeWrapperRef}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--mantine-radius-sm)',
        }}
      >
        {/* Colored action reveal behind the translated card. */}
        {showsSwipeReveal && activeRevealAction && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: dragX > 0 ? 'flex-start' : 'flex-end',
              padding: '0 20px',
              gap: 10,
              background: `var(--mantine-color-${activeRevealAction.color}-6)`,
              color: 'white',
              fontWeight: 600,
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          >
            {dragX > 0 ? activeRevealAction.icon : null}
            <span>{activeRevealAction.label}</span>
            {dragX < 0 ? activeRevealAction.icon : null}
          </div>
        )}
        {/* The Card itself — translated by the current swipe delta. */}
        <div
          {...swipeHandlers}
          style={{
            transform: `translateX(${dragX}px)`,
            transition: dragX === 0 ? 'transform 200ms ease-out' : undefined,
            willChange: isMobile ? 'transform' : undefined,
          }}
        >
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
          {isMobile && onEdit ? (
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onEdit(task); }}
              aria-label="Edit task"
            >
              <IconDotsVertical size={14} />
            </ActionIcon>
          ) : (onSnooze || onCancel || onEdit) && (
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
              <Avatar variant="filled" size="xs" radius="xl" color={userColor(assignee)} style={userAvatarStyle(assignee)}>
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
              {format(parseDateString(task.dueDate), 'MMM d')}
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
        </div>
      </div>

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
            onChange={setCustomSnoozeDate}
            minDate={new Date()}
            highlightToday
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
