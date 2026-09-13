import { useMemo } from 'react';
import {
  Accordion,
  Stack,
  Group,
  Text,
  Badge,
  ThemeIcon,
  ActionIcon,
  Tooltip,
  Paper,
  Table,
  Code,
  Divider,
  Button,
  Tabs,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import {
  IconHammer,
  IconCalendar,
  IconCopy,
  IconEdit,
  IconTrash,
  IconPlus,
  IconListCheck,
  IconListDetails,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { formatCurrency } from '../../utils/formatters';
import { TaskCard } from '../tasks/TaskCard';
import {
  filterTasksForProject,
  computeProjectTaskSummary,
} from '../../lib/projectTaskFilters';
import { ProjectLineItems, type LineItemDrillDown } from './ProjectLineItems';
import type {
  ProjectSummary,
  StoredTask,
  FamilyMember,
} from '../../../../shared/types';

export interface DrillDownState {
  categoryId: string | null;
  categoryName: string;
  projectTag: string;
}

const STATUS_BADGE_COLOR: Record<ProjectSummary['status'], string> = {
  planning: 'blue',
  active: 'green',
  completed: 'gray',
};

const STATUS_SORT_ORDER: Record<StoredTask['status'], number> = {
  todo: 0,
  started: 1,
  done: 2,
  cancelled: 3,
};

function formatDateRange(start: string, end: string): string {
  try {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    if (sy === ey) {
      return `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d, yyyy')}`;
    }
    return `${format(startDate, 'MMM d, yyyy')} – ${format(endDate, 'MMM d, yyyy')}`;
  } catch {
    return `${start} – ${end}`;
  }
}

interface ProjectCardProps {
  project: ProjectSummary;
  onEdit: (project: ProjectSummary) => void;
  onLineItemClick: (drill: LineItemDrillDown) => void;
  onDelete: (project: ProjectSummary) => void;
  onCategoryClick: (state: DrillDownState) => void;
  tasks: StoredTask[];
  members: FamilyMember[];
  onAddTask: (project: ProjectSummary) => void;
  onTaskClick: (task: StoredTask) => void;
}

export function ProjectCard({
  project,
  onEdit,
  onLineItemClick,
  onDelete,
  onCategoryClick,
  tasks,
  members,
  onAddTask,
  onTaskClick,
}: ProjectCardProps) {
  const clipboard = useClipboard({ timeout: 1500 });

  const budgetLabel =
    project.totalBudget !== null
      ? `${formatCurrency(project.totalSpent)} / ${formatCurrency(project.totalBudget)}`
      : formatCurrency(project.totalSpent);

  const overBudget =
    project.totalBudget !== null && project.totalSpent > project.totalBudget;

  const lineItemCount = (project.lineItems ?? []).length;

  const projectTasks = useMemo(
    () => filterTasksForProject(tasks, project.tag),
    [tasks, project.tag],
  );
  const taskSummary = useMemo(
    () => computeProjectTaskSummary(projectTasks),
    [projectTasks],
  );

  const sortedProjectTasks = useMemo(() => {
    return [...projectTasks].sort((a, b) => {
      const statusDiff = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
      if (statusDiff !== 0) return statusDiff;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [projectTasks]);

  return (
    <Accordion.Item key={project.id} value={project.id}>
      <Accordion.Control>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <ThemeIcon variant="light" size="md" color="orange">
              <IconHammer size={16} />
            </ThemeIcon>
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap">
                <Text fw={600} truncate>
                  {project.name}
                </Text>
                <Badge
                  size="xs"
                  color={STATUS_BADGE_COLOR[project.status]}
                  variant="light"
                >
                  {project.status}
                </Badge>
              </Group>
              <Group gap="xs" c="dimmed">
                <IconCalendar size={12} />
                <Text size="xs">
                  {formatDateRange(project.startDate, project.endDate)}
                </Text>
              </Group>
            </Stack>
          </Group>

          <Group gap="sm" wrap="nowrap">
            <Stack gap={0} align="flex-end">
              <Text size="sm" fw={600} c={overBudget ? 'red' : undefined}>
                {budgetLabel}
              </Text>
            </Stack>
          </Group>
        </Group>
      </Accordion.Control>

      <Accordion.Panel>
        <Stack gap="md">
          {project.notes && (
            <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
              {project.notes}
            </Text>
          )}

          <Tabs defaultValue="spending">
            <Tabs.List>
              <Tabs.Tab value="spending" leftSection={<IconHammer size={14} />}>
                Spending
              </Tabs.Tab>
              <Tabs.Tab value="items" leftSection={<IconListDetails size={14} />}>
                Line Items
                {lineItemCount > 0 ? ` (${lineItemCount})` : ''}
              </Tabs.Tab>
              <Tabs.Tab value="tasks" leftSection={<IconListCheck size={14} />}>
                Tasks
                {taskSummary.total > 0
                  ? ` (${taskSummary.completed} of ${taskSummary.total} complete)`
                  : ''}
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="spending" pt="sm">
              {project.categorySpending.length > 0 ? (
                <Paper withBorder p="xs">
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Category</Table.Th>
                        <Table.Th ta="right">Spent</Table.Th>
                        <Table.Th ta="right">Budget</Table.Th>
                        <Table.Th ta="right">Variance</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {project.categorySpending.map((row) => {
                        const variance =
                          row.budgeted !== null ? row.budgeted - row.spent : null;
                        return (
                            <Table.Tr
                              key={row.categoryId}
                              style={{ cursor: 'pointer' }}
                              onClick={() =>
                                onCategoryClick({
                                  categoryId:
                                    row.categoryId === '__uncategorized__'
                                      ? null
                                      : row.categoryId,
                                  categoryName: row.categoryName,
                                  projectTag: project.tag,
                                })
                              }
                            >
                              <Table.Td>
                                <Text size="sm">{row.categoryName}</Text>
                              </Table.Td>
                              <Table.Td ta="right">
                                <Text size="sm">{formatCurrency(row.spent, true)}</Text>
                              </Table.Td>
                              <Table.Td ta="right">
                                <Text size="sm" c="dimmed">
                                  {row.budgeted !== null
                                    ? formatCurrency(row.budgeted, true)
                                    : '—'}
                                </Text>
                              </Table.Td>
                              <Table.Td ta="right">
                                {variance !== null ? (
                                  <Text size="sm" c={variance < 0 ? 'red' : 'green'}>
                                    {variance < 0 ? '-' : '+'}
                                    {formatCurrency(Math.abs(variance), true)}
                                  </Text>
                                ) : (
                                  <Text size="sm" c="dimmed">
                                    —
                                  </Text>
                                )}
                              </Table.Td>
                            </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Paper>
              ) : (
                <Text size="sm" c="dimmed">
                  No categorized spending or budgeted items found for this project.
                </Text>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="items" pt="sm">
              <ProjectLineItems project={project} onLineItemClick={onLineItemClick} />
            </Tabs.Panel>

            <Tabs.Panel value="tasks" pt="sm">
              <Stack gap="sm">
                <Group justify="flex-end">
                  <Button
                    size="xs"
                    leftSection={<IconPlus size={12} />}
                    onClick={() => onAddTask(project)}
                  >
                    Add Task
                  </Button>
                </Group>

                {sortedProjectTasks.length === 0 ? (
                  <Text size="sm" c="dimmed" ta="center" py="md">
                    No tasks yet for this project. Click + Add Task to create one.
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {sortedProjectTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        members={members}
                        onClick={() => onTaskClick(task)}
                      />
                    ))}
                  </Stack>
                )}
              </Stack>
            </Tabs.Panel>
          </Tabs>

          <Divider />

          <Group gap="xs" justify="flex-end">
            <Tooltip label={clipboard.copied ? 'Copied!' : 'Click to copy tag'}>
              <Code
                style={{ cursor: 'pointer', userSelect: 'none', marginRight: 'auto' }}
                onClick={() => clipboard.copy(project.tag)}
              >
                <Group gap={4} wrap="nowrap">
                  <IconCopy size={10} />
                  <Text size="xs" span>
                    {project.tag}
                  </Text>
                </Group>
              </Code>
            </Tooltip>
            <Tooltip label="Edit project">
              <ActionIcon
                variant="subtle"
                color="blue"
                onClick={() => onEdit(project)}
                aria-label="Edit project"
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete project">
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={() => onDelete(project)}
                aria-label="Delete project"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
