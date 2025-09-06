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
  Checkbox,
  CloseButton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
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
  patterns: string[];
  categoryId: string;
  userDescription: string;
  isActive: boolean;
}

export function AutoCategorization() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoCategorizeRule | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [forceRecategorize, setForceRecategorize] = useState(false);
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
      patterns: [''],
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
      patterns: (value) => {
        if (!value || value.length === 0) return 'At least one pattern is required';
        const nonEmptyPatterns = value.filter((p: string) => p.trim());
        if (nonEmptyPatterns.length === 0) return 'At least one pattern is required';
        if (value.length > 5) return 'Maximum 5 patterns allowed';
        
        // Validate individual patterns
        for (let i = 0; i < value.length; i++) {
          const pattern = value[i];
          if (!pattern || !pattern.trim()) return `Pattern ${i + 1} cannot be empty`;
          if (pattern.length > 100) return `Pattern ${i + 1} must be less than 100 characters`;
        }
        
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
          patterns: editingRule.patterns && editingRule.patterns.length > 0 
            ? editingRule.patterns 
            : [''], // Ensure at least one pattern field
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

  // Add pattern field
  const addPatternField = () => {
    if (form.values.patterns.length < 5) {
      form.insertListItem('patterns', '');
    }
  };

  // Remove pattern field
  const removePatternField = (index: number) => {
    if (form.values.patterns.length > 1) {
      form.removeListItem('patterns', index);
    }
  };

  // Create rule mutation
  const createRuleMutation = useMutation({
    mutationFn: (data: RuleFormValues) => {
      const category = categories.find(c => c.id === data.categoryId);
      // Filter out empty patterns
      const cleanPatterns = data.patterns.filter(p => p.trim());
      return api.createAutoCategorizeRule({
        ...data,
        patterns: cleanPatterns,
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
    onError: (error: unknown) => {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to create rule',
        color: 'red',
      });
    },
  });

  // Update rule mutation
  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RuleFormValues> }) => {
      const category = data.categoryId ? categories.find(c => c.id === data.categoryId) : undefined;
      // Filter out empty patterns if patterns are being updated
      const cleanData = {
        ...data,
        patterns: data.patterns ? data.patterns.filter(p => p.trim()) : undefined,
        categoryName: category?.name,
      };
      return api.updateAutoCategorizeRule(id, cleanData);
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
    onError: (error: unknown) => {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to update rule',
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
    onError: (error: unknown) => {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to delete rule',
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
    onError: (error: unknown) => {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to move rule',
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
    onError: (error: unknown) => {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to move rule',
        color: 'red',
      });
    },
  });

  // Apply rules mutation
  const applyRulesMutation = useMutation({
    mutationFn: (force: boolean) => api.applyAutoCategorizeRules(force),
    onSuccess: (result) => {
      const message = forceRecategorize
        ? `Categorized ${result.categorized} new and recategorized ${result.recategorized} existing transactions`
        : `Categorized ${result.categorized} of ${result.total} transactions`;
      
      notifications.show({
        title: 'Rules Applied',
        message,
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to apply rules',
        color: 'red',
      });
    },
  });

  // Preview mutation for getting counts
  const previewMutation = useMutation({
    mutationFn: (force: boolean) => api.previewAutoCategorization(force),
  });

  // Toggle rule active status
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateAutoCategorizeRule(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autocategorize-rules'] });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to update rule status',
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
      rule.patterns?.some(p => p.toLowerCase().includes(query)) ||
      rule.categoryName?.toLowerCase().includes(query)
    );
  });

  // Build category options for select
  const categoryOptions = categories
    .map(cat => {
      const parentCategory = cat.parentId
        ? categories.find(p => p.id === cat.parentId)
        : null;
      const label = parentCategory 
        ? `${parentCategory.name} → ${cat.name}` 
        : cat.name;
      // Add indicator for hidden categories
      const displayLabel = cat.isHidden 
        ? `${label} (Excluded from budgets)`
        : label;
      return {
        value: cat.id,
        label: displayLabel,
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
          <Checkbox
            label="Recategorize all transactions"
            checked={forceRecategorize}
            onChange={(event) => setForceRecategorize(event.currentTarget.checked)}
            mt="xs"
            size="sm"
          />
        </div>
        <Group>
          <Tooltip 
            label={forceRecategorize 
              ? "Will recategorize ALL transactions using your rules and Plaid categories"
              : "Applies your custom rules first, then uses Plaid categories as fallback for uncategorized transactions"}
            multiline
          >
            <Button
              leftSection={<IconRobot size={16} />}
              onClick={async () => {
                // Get preview of what will be categorized
                const preview = await previewMutation.mutateAsync(forceRecategorize);
                
                if (forceRecategorize && preview.wouldRecategorize > 0) {
                  // Show confirmation dialog for recategorization
                  modals.openConfirmModal({
                    title: 'Recategorize Transactions?',
                    children: (
                      <Text size="sm">
                        This will recategorize {preview.wouldRecategorize} transactions that already have categories.
                        {preview.wouldCategorize > 0 && ` It will also categorize ${preview.wouldCategorize} new transactions.`}
                        {' '}Continue?
                      </Text>
                    ),
                    labels: { confirm: 'Yes, Recategorize', cancel: 'Cancel' },
                    confirmProps: { color: 'blue' },
                    onConfirm: () => applyRulesMutation.mutate(forceRecategorize),
                  });
                } else if (preview.wouldCategorize > 0) {
                  // Just categorize new transactions
                  applyRulesMutation.mutate(forceRecategorize);
                } else {
                  notifications.show({
                    title: 'No Transactions to Categorize',
                    message: 'All transactions are already categorized.',
                    color: 'blue',
                  });
                }
              }}
              loading={applyRulesMutation.isPending || previewMutation.isPending}
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
          contains ANY of the specified patterns (OR logic). The first matching rule assigns 
          its category to the transaction and optionally replaces the description with a custom one. 
          By default, only uncategorized transactions are processed. When "Recategorize all transactions" 
          is checked, existing categories will be overwritten based on your rules. 
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
                <Table.Th>Patterns</Table.Th>
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
                    {rule.patterns && rule.patterns.length > 0 ? (
                      <Group gap="xs">
                        {rule.patterns.map((pattern, idx) => (
                          <Badge key={idx} variant="light" color="blue" size="sm">
                            {pattern}
                          </Badge>
                        ))}
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed" fs="italic">No patterns</Text>
                    )}
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
        <form onSubmit={form.onSubmit((values) => handleSubmit(values))}>
          <Stack>
            <TextInput
              label="Rule Description"
              placeholder="e.g., Coffee shops"
              description="A friendly name for this rule"
              required
              {...form.getInputProps('description')}
            />

            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Patterns
                <Text span c="dimmed" fw={400}> (Matches transaction description/merchant name - case insensitive)</Text>
              </Text>
              {form.values.patterns.map((_, index) => (
                <Group key={index} gap="xs">
                  <TextInput
                    placeholder={index === 0 ? "e.g., starbucks" : `Pattern ${index + 1}`}
                    style={{ flex: 1 }}
                    {...form.getInputProps(`patterns.${index}`)}
                  />
                  {form.values.patterns.length > 1 && (
                    <Tooltip label="Remove pattern">
                      <CloseButton
                        onClick={() => removePatternField(index)}
                        aria-label="Remove pattern"
                      />
                    </Tooltip>
                  )}
                </Group>
              ))}
              {form.values.patterns.length < 5 && (
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={addPatternField}
                  disabled={!form.values.patterns[form.values.patterns.length - 1]?.trim()}
                >
                  Add OR pattern
                </Button>
              )}
              {form.errors.patterns && (
                <Text size="xs" c="red">{form.errors.patterns as string}</Text>
              )}
            </Stack>

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
              placeholder="e.g., Coffee Shopping"
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