import { useState, useMemo, useEffect } from 'react';
import {
  Container,
  Title,
  Stack,
  Group,
  Button,
  Select,
  TextInput,
  Accordion,
  Text,
  Loader,
  Center,
  Alert,
  ThemeIcon,
  Modal,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useSearchParams } from 'react-router-dom';
import {
  IconPlus,
  IconSearch,
  IconAlertCircle,
  IconCheck,
  IconX,
  IconHammer,
} from '@tabler/icons-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { TransactionPreviewModal } from '../components/transactions/TransactionPreviewModal';
import { TaskFormModal, TaskDetailModal } from './Tasks';
import { ProjectFormModal } from '../components/projects/ProjectFormModal';
import { ProjectCard, type DrillDownState } from '../components/projects/ProjectCard';
import type {
  ProjectSummary,
  StoredTask,
  FamilyMember,
  TaskStatus,
  UpdateTaskDto,
  SubTask,
} from '../../../shared/types';

/** Wide date range used when drilling into project transactions — the project
 *  tag is the primary filter; dates are intentionally unbounded so we don't miss
 *  any transactions tagged to this project outside the nominal project dates. */
const WIDE_DATE_RANGE = { startDate: '2020-01-01', endDate: '2030-12-31' };

// ---------------------------------------------------------------------------
// DeleteProjectModal — confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteProjectModalProps {
  opened: boolean;
  onClose: () => void;
  project: ProjectSummary | null;
}

function DeleteProjectModal({ opened, onClose, project }: DeleteProjectModalProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      notifications.show({
        title: 'Project deleted',
        message: 'The project has been removed.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      onClose();
    },
    onError: () => {
      notifications.show({
        title: 'Failed to delete project',
        message: 'An error occurred. Please try again.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  if (!project) return null;

  return (
    <Modal opened={opened} onClose={onClose} title="Delete Project" size="sm">
      <Stack gap="md">
        <Text>
          Are you sure you want to delete{' '}
          <Text component="span" fw={600}>
            {project.name}
          </Text>
          ? This will remove the project tag from all associated transactions. Transactions will not be deleted.
        </Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(project.id)}
          >
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Projects — main page component
// ---------------------------------------------------------------------------

export function Projects() {
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((s) => s.user);

  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  const [formModalOpened, { open: openFormModal, close: closeFormModal }] =
    useDisclosure(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);

  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] =
    useDisclosure(false);
  const [deletingProject, setDeletingProject] = useState<ProjectSummary | null>(null);

  const [
    previewModalOpened,
    { open: openPreviewModal, close: closePreviewModal },
  ] = useDisclosure(false);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);

  const [addTaskProject, setAddTaskProject] = useState<ProjectSummary | null>(null);
  const [addTaskOpened, { open: openAddTask, close: closeAddTask }] = useDisclosure(false);

  const [detailTask, setDetailTask] = useState<StoredTask | null>(null);
  const [editingTask, setEditingTask] = useState<StoredTask | null>(null);

  const queryClient = useQueryClient();

  const {
    data: projects,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['projects', 'summaries', null],
    queryFn: () => api.getProjectsSummaries(),
    staleTime: 1000 * 60 * 5,
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => api.getTasks(),
    staleTime: 1000 * 60 * 2,
  });

  const { data: familyData } = useQuery({
    queryKey: ['family'],
    queryFn: () => api.getFamily(),
  });
  const members: FamilyMember[] = familyData?.family?.members ?? [];

  const yearOptions = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    const years = Array.from(
      new Set(projects.map((p) => new Date(p.startDate).getFullYear())),
    ).sort((a, b) => b - a);
    return years.map((y) => ({ value: String(y), label: String(y) }));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (!projects) return [];

    const sorted = [...projects].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );

    return sorted.filter((project) => {
      const yearMatch =
        selectedYear === null ||
        new Date(project.startDate).getFullYear() === Number(selectedYear);

      const searchMatch =
        search.trim() === '' ||
        project.name.toLowerCase().includes(search.trim().toLowerCase());

      return yearMatch && searchMatch;
    });
  }, [projects, selectedYear, search]);

  useEffect(() => {
    const expandId = searchParams.get('expand');
    if (expandId && projects) {
      const found = projects.find((p) => p.id === expandId);
      if (found) {
        setExpandedProjectId(expandId);
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('expand');
          return next;
        }, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const createTaskMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      scope?: 'family' | 'personal';
      assigneeId?: string | null;
      dueDate?: string | null;
      tags?: string[];
    }) => api.createTask(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      closeAddTask();
      notifications.show({ message: 'Task created', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Failed to create task', color: 'red' });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDto }) => api.updateTask(id, data),
    onSuccess: (updatedTask) => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setDetailTask(updatedTask);
      setEditingTask(null);
      notifications.show({ message: 'Task updated', color: 'green' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.updateTaskStatus(id, status),
    onSuccess: (updatedTask) => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setDetailTask(updatedTask);
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setDetailTask(null);
      notifications.show({ message: 'Task deleted', color: 'red' });
    },
  });

  const handleOpenCreate = () => {
    setEditingProject(null);
    openFormModal();
  };

  const handleOpenEdit = (project: ProjectSummary) => {
    setEditingProject(project);
    openFormModal();
  };

  const handleOpenDelete = (project: ProjectSummary) => {
    setDeletingProject(project);
    openDeleteModal();
  };

  const handleCategoryClick = (state: DrillDownState) => {
    setDrillDown(state);
    openPreviewModal();
  };

  const handleFormClose = () => {
    closeFormModal();
    setTimeout(() => setEditingProject(null), 300);
  };

  const handleDeleteClose = () => {
    closeDeleteModal();
    setTimeout(() => setDeletingProject(null), 300);
  };

  const handleAddTask = (project: ProjectSummary) => {
    setAddTaskProject(project);
    openAddTask();
  };

  const handleAddTaskClose = () => {
    closeAddTask();
    setTimeout(() => setAddTaskProject(null), 300);
  };

  const handleSubTaskToggle = (taskId: string, subTaskId: string, completed: boolean) => {
    if (!detailTask) return;
    const updatedSubTasks: SubTask[] = (detailTask.subTasks ?? []).map((st) =>
      st.id === subTaskId ? { ...st, completed } : st,
    );
    setDetailTask({ ...detailTask, subTasks: updatedSubTasks });
    updateTaskMutation.mutate({ id: taskId, data: { subTasks: updatedSubTasks } });
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="sm">
            <ThemeIcon variant="light" size="lg" color="orange">
              <IconHammer size={20} />
            </ThemeIcon>
            <Title order={2}>Projects</Title>
          </Group>
          <Button leftSection={<IconPlus size={16} />} onClick={handleOpenCreate}>
            Create Project
          </Button>
        </Group>

        <Group gap="sm">
          <Select
            label="Year"
            placeholder="All years"
            data={yearOptions}
            value={selectedYear}
            onChange={setSelectedYear}
            clearable
            w={140}
          />
          <TextInput
            label="Search"
            placeholder="Search projects..."
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
        </Group>

        {isLoading && (
          <Center py="xl">
            <Loader />
          </Center>
        )}

        {error && !isLoading && (
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            title="Failed to load projects"
            color="red"
          >
            Unable to fetch project data. Please refresh and try again.
          </Alert>
        )}

        {!isLoading && !error && filteredProjects.length === 0 && (
          <Center py="xl">
            <Stack align="center" gap="sm">
              <ThemeIcon size="xl" variant="light" color="gray">
                <IconHammer size={24} />
              </ThemeIcon>
              <Text c="dimmed" size="lg">
                {projects && projects.length > 0
                  ? 'No projects match your filters'
                  : 'No projects yet'}
              </Text>
              {(!projects || projects.length === 0) && (
                <Text c="dimmed" size="sm" ta="center">
                  Create your first project to start tracking spending.
                </Text>
              )}
              {projects && projects.length > 0 && (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setSelectedYear(null);
                    setSearch('');
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Stack>
          </Center>
        )}

        {!isLoading && !error && filteredProjects.length > 0 && (
          <Accordion
            variant="separated"
            radius="md"
            value={expandedProjectId}
            onChange={setExpandedProjectId}
          >
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={handleOpenEdit}
                onDelete={handleOpenDelete}
                onCategoryClick={handleCategoryClick}
                tasks={allTasks}
                members={members}
                onAddTask={handleAddTask}
                onTaskClick={setDetailTask}
              />
            ))}
          </Accordion>
        )}
      </Stack>

      <ProjectFormModal
        opened={formModalOpened}
        onClose={handleFormClose}
        project={editingProject}
      />

      <DeleteProjectModal
        opened={deleteModalOpened}
        onClose={handleDeleteClose}
        project={deletingProject}
      />

      {drillDown && (
        <TransactionPreviewModal
          opened={previewModalOpened}
          onClose={closePreviewModal}
          categoryId={drillDown.categoryId}
          categoryName={drillDown.categoryName}
          dateRange={WIDE_DATE_RANGE}
          tags={[drillDown.projectTag]}
        />
      )}

      {addTaskProject && (
        <TaskFormModal
          opened={addTaskOpened}
          onClose={handleAddTaskClose}
          onSubmit={(data) => createTaskMutation.mutate(data as Parameters<typeof createTaskMutation.mutate>[0])}
          members={members}
          loading={createTaskMutation.isPending}
          title={`Add Task — ${addTaskProject.name}`}
          currentUserId={currentUser?.id ?? null}
          lockedTags={[addTaskProject.tag]}
        />
      )}

      <TaskDetailModal
        task={detailTask}
        onClose={() => setDetailTask(null)}
        members={members}
        onStatusChange={(status) => {
          if (!detailTask) return;
          statusMutation.mutate({ id: detailTask.id, status });
        }}
        onEdit={() => {
          if (detailTask) {
            setEditingTask(detailTask);
            setDetailTask(null);
          }
        }}
        onDelete={() => {
          if (detailTask) deleteTaskMutation.mutate(detailTask.id);
        }}
        onSubTaskToggle={handleSubTaskToggle}
      />

      <TaskFormModal
        opened={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSubmit={(data) => {
          if (!editingTask) return;
          updateTaskMutation.mutate({ id: editingTask.id, data: data as UpdateTaskDto });
        }}
        members={members}
        loading={updateTaskMutation.isPending}
        title="Edit Task"
        initialValues={editingTask ?? undefined}
      />
    </Container>
  );
}
