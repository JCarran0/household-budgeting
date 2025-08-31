import { useState, useEffect } from 'react';
import {
  Stack,
  Group,
  Button,
  TextInput,
  Select,
  Switch,
  Paper,
  Text,
  ActionIcon,
  Badge,
  Table,
  Modal,
  Alert,
  Loader,
  Center,
  Tooltip,
  Card,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconRobot,
  IconAlertCircle,
  IconSearch,
} from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { AutoCategorizeRule } from '../../../../shared/types';

interface RuleFormValues {
  description: string;
  pattern: string;
  categoryId: string;
  userDescription: string;
  isActive: boolean;
}

export function AutoCategorization() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoCategorizeRule | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  // Fetch rules
  const { data: rules = [], isLoading: rulesLoading, error: rulesError } = useQuery({
    queryKey: ['autocategorize-rules'],
    queryFn: () => api.getAutoCategorizeRules(),
  });

  // Fetch categories for dropdown
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  });

  // Create/Update form
  const form = useForm<RuleFormValues>({
    initialValues: {
      description: '',
      pattern: '',
      categoryId: '',
      userDescription: '',
      isActive: true,
    },
    validate: {
      description: (value) => {
        if (!value.trim()) return 'Description is required';
        if (value.length > 200) return 'Description must be less than 200 characters';
        return null;
      },
      pattern: (value) => {
        if (!value.trim()) return 'Pattern is required';
        if (value.length > 100) return 'Pattern must be less than 100 characters';
        return null;
      },
      categoryId: (value) => {
        if (!value) return 'Category is required';
        return null;
      },
      userDescription: (value) => {
        if (value && value.length > 200) return 'User description must be less than 200 characters';
        return null;
      },
    },
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isFormOpen) {
      if (editingRule) {
        form.setValues({
          description: editingRule.description,
          pattern: editingRule.pattern,
          categoryId: editingRule.categoryId,
          userDescription: editingRule.userDescription || '',
          isActive: editingRule.isActive,
        });
      } else {
        form.reset();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormOpen, editingRule]);

  // Create rule mutation
  const createRuleMutation = useMutation({
    mutationFn: (data: RuleFormValues) => {
      const category = categories.find(c => c.id === data.categoryId);
      return api.createAutoCategorizeRule({
        ...data,
        categoryName: category?.name,
      });
    },
    onSuccess: () => {
      notifications.show({
        title: 'Rule Created',
        message: 'Auto-categorization rule has been created',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['autocategorize-rules'] });
      handleCloseForm();
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to create rule',
        color: 'red',
      });
    },
  });

  // Update rule mutation
  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RuleFormValues> }) => {
      const category = data.categoryId ? categories.find(c => c.id === data.categoryId) : undefined;
      return api.updateAutoCategorizeRule(id, {
        ...data,
        categoryName: category?.name,
      });
    },
    onSuccess: () => {
      notifications.show({
        title: 'Rule Updated',
        message: 'Auto-categorization rule has been updated',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['autocategorize-rules'] });
      handleCloseForm();
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update rule',
        color: 'red',
      });
    },
  });

  // Delete rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => api.deleteAutoCategorizeRule(id),
    onSuccess: () => {
      notifications.show({
        title: 'Rule Deleted',
        message: 'Auto-categorization rule has been deleted',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['autocategorize-rules'] });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to delete rule',
        color: 'red',
      });
    },
  });

  // Move rule up mutation
  const moveUpMutation = useMutation({
    mutationFn: (id: string) => api.moveAutoCategorizeRuleUp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autocategorize-rules'] });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to move rule',
        color: 'red',
      });
    },
  });

  // Move rule down mutation
  const moveDownMutation = useMutation({
    mutationFn: (id: string) => api.moveAutoCategorizeRuleDown(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autocategorize-rules'] });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to move rule',
        color: 'red',
      });
    },
  });

  // Apply rules mutation
  const applyRulesMutation = useMutation({
    mutationFn: () => api.applyAutoCategorizeRules(),
    onSuccess: (result) => {
      notifications.show({
        title: 'Rules Applied',
        message: `Categorized ${result.categorized} of ${result.total} uncategorized transactions`,
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to apply rules',
        color: 'red',
      });
    },
  });

  // Toggle rule active status
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateAutoCategorizeRule(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autocategorize-rules'] });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to update rule status',
        color: 'red',
      });
    },
  });

  const handleSubmit = (values: RuleFormValues) => {
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data: values });
    } else {
      createRuleMutation.mutate(values);
    }
  };

  const handleEdit = (rule: AutoCategorizeRule) => {
    setEditingRule(rule);
    setIsFormOpen(true);
  };

  const handleDelete = (rule: AutoCategorizeRule) => {
    if (window.confirm(`Are you sure you want to delete the rule "${rule.description}"?`)) {
      deleteRuleMutation.mutate(rule.id);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingRule(null);
    form.reset();
  };

  // Filter rules based on search
  const filteredRules = rules.filter(rule => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      rule.description.toLowerCase().includes(query) ||
      rule.pattern.toLowerCase().includes(query) ||
      rule.categoryName?.toLowerCase().includes(query)
    );
  });

  // Build category options for select
  const categoryOptions = categories
    .filter(cat => !cat.isHidden)
    .map(cat => {
      const parentCategory = cat.parentId
        ? categories.find(p => p.id === cat.parentId)
        : null;
      return {
        value: cat.id,
        label: parentCategory 
          ? `${parentCategory.name} → ${cat.name}` 
          : cat.name,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const isLoading = createRuleMutation.isPending || updateRuleMutation.isPending;

  if (rulesLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (rulesError) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="red">
        Failed to load auto-categorization rules. Please try again.
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      {/* Header with stats and apply button */}
      <Group justify="space-between">
        <div>
          <Text size="lg" fw={500}>Auto-Categorization Rules</Text>
          <Text size="sm" c="dimmed">
            {rules.length} rule{rules.length !== 1 ? 's' : ''} configured
            {rules.filter(r => r.isActive).length !== rules.length && 
              ` (${rules.filter(r => r.isActive).length} active)`}
          </Text>
        </div>
        <Group>
          <Tooltip 
            label="Applies your custom rules first, then uses Plaid categories as fallback for remaining uncategorized transactions"
            width={300}
            multiline
          >
            <Button
              leftSection={<IconRobot size={16} />}
              onClick={() => applyRulesMutation.mutate()}
              loading={applyRulesMutation.isPending}
              variant="light"
            >
              Apply Categorization
            </Button>
          </Tooltip>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setIsFormOpen(true)}
          >
            Add Rule
          </Button>
        </Group>
      </Group>

      {/* Info card */}
      <Card withBorder>
        <Group gap="xs" mb="xs">
          <IconAlertCircle size={16} color="var(--mantine-color-blue-6)" />
          <Text size="sm" fw={500}>How Auto-Categorization Works</Text>
        </Group>
        <Text size="sm" c="dimmed">
          Rules are applied in priority order. Each rule checks if a transaction's description 
          contains the specified pattern (case-insensitive). The first matching rule assigns 
          its category to the transaction and optionally replaces the description with a custom one. 
          Use the arrow buttons to adjust rule priority.
        </Text>
      </Card>

      {/* Search and filter */}
      <TextInput
        placeholder="Search rules..."
        leftSection={<IconSearch size={16} />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.currentTarget.value)}
      />

      {/* Rules table */}
      {filteredRules.length === 0 ? (
        <Paper p="xl" withBorder>
          <Center>
            <Stack align="center" gap="md">
              <IconRobot size={48} stroke={1.5} color="var(--mantine-color-gray-5)" />
              <Text c="dimmed">
                {searchQuery ? 'No rules match your search' : 'No custom rules created yet'}
              </Text>
              {!searchQuery && (
                <Text size="sm" c="dimmed">
                  Plaid categories will be used automatically for uncategorized transactions
                </Text>
              )}
              {!searchQuery && (
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => setIsFormOpen(true)}
                >
                  Create Your First Rule
                </Button>
              )}
            </Stack>
          </Center>
        </Paper>
      ) : (
        <Paper withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Priority</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Rule Description</Table.Th>
                <Table.Th>Pattern</Table.Th>
                <Table.Th>Category</Table.Th>
                <Table.Th>User Description</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredRules.map((rule, index) => (
                <Table.Tr key={rule.id}>
                  <Table.Td>
                    <Group gap="xs">
                      <Badge variant="filled" size="lg">{rule.priority}</Badge>
                      <Group gap={4}>
                        <Tooltip label="Move up (higher priority)">
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            onClick={() => moveUpMutation.mutate(rule.id)}
                            disabled={index === 0 || moveUpMutation.isPending || moveDownMutation.isPending}
                          >
                            <IconArrowUp size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Move down (lower priority)">
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            onClick={() => moveDownMutation.mutate(rule.id)}
                            disabled={index === filteredRules.length - 1 || moveUpMutation.isPending || moveDownMutation.isPending}
                          >
                            <IconArrowDown size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Switch
                      checked={rule.isActive}
                      onChange={(e) => toggleActiveMutation.mutate({ 
                        id: rule.id, 
                        isActive: e.currentTarget.checked 
                      })}
                      disabled={toggleActiveMutation.isPending}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{rule.description}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="blue">
                      contains "{rule.pattern}"
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="dot" color="green">
                      {rule.categoryName || 'Unknown'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {rule.userDescription ? (
                      <Text size="sm" c="blue">
                        "{rule.userDescription}"
                      </Text>
                    ) : (
                      <Text size="sm" c="dimmed" fs="italic">
                        None
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="Edit rule">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() => handleEdit(rule)}
                        >
                          <IconEdit size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete rule">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => handleDelete(rule)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {/* Create/Edit Rule Modal */}
      <Modal
        opened={isFormOpen}
        onClose={handleCloseForm}
        title={editingRule ? 'Edit Auto-Categorization Rule' : 'Create Auto-Categorization Rule'}
        size="md"
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput
              label="Rule Description"
              placeholder="e.g., Grocery stores"
              description="A friendly name for this rule"
              required
              {...form.getInputProps('description')}
            />

            <TextInput
              label="Pattern"
              placeholder="e.g., safeway"
              description="Text to search for in transaction descriptions (case-insensitive)"
              required
              {...form.getInputProps('pattern')}
            />

            <Select
              label="Category"
              placeholder="Select a category"
              description="Category to assign when pattern matches"
              data={categoryOptions}
              searchable
              required
              disabled={categoriesLoading}
              {...form.getInputProps('categoryId')}
            />

            <TextInput
              label="User Description (Optional)"
              placeholder="e.g., Grocery Shopping"
              description="Replace transaction description with this text when pattern matches"
              {...form.getInputProps('userDescription')}
            />

            <Switch
              label="Active"
              description="Only active rules are applied to transactions"
              {...form.getInputProps('isActive', { type: 'checkbox' })}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={handleCloseForm} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading}>
                {editingRule ? 'Update' : 'Create'} Rule
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}