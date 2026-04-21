import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Text,
  Button,
  Group,
  Alert,
  Loader,
  Badge,
  Paper,
  List,
  Divider,
  Title,
} from '@mantine/core';
import { ResponsiveModal } from '../ResponsiveModal';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconAlertCircle, IconCheck, IconTrash } from '@tabler/icons-react';
import { api } from '../../lib/api';
import { CategoryPicker } from './CategoryPicker';
import type { Category } from '../../../../shared/types';

interface CategoryDeletionModalProps {
  category: Category | null;
  opened: boolean;
  onClose: () => void;
}

type ModalStep =
  | 'loading'      // Loading dependency counts
  | 'overview'     // Show what needs cleanup
  | 'budgets'      // Confirm budget deletion
  | 'rules'        // Choose: delete or skip
  | 'transactions' // Pick replacement category
  | 'confirm'      // Final confirmation
  | 'processing'   // Executing deletion
  | 'complete';    // Success!

interface Dependencies {
  budgetCount: number;
  ruleCount: number;
  transactionCount: number;
}

export function CategoryDeletionModal({
  category,
  opened,
  onClose,
}: CategoryDeletionModalProps) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<ModalStep>('loading');
  const [dependencies, setDependencies] = useState<Dependencies>({
    budgetCount: 0,
    ruleCount: 0,
    transactionCount: 0,
  });
  const [replacementCategoryId, setReplacementCategoryId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  // Load dependency counts
  const loadDependencies = useCallback(async () => {
    if (!category) return;

    try {
      // Check each dependency type
      const [budgets, rules, transactions] = await Promise.all([
        api.getCategoryBudgets(category.id).catch(() => []),
        api.getAutoCategorizeRules().catch(() => []),
        api.getTransactions({}).catch(() => ({ transactions: [], totalCount: 0 })),
      ]);

      const budgetCount = Array.isArray(budgets) ? budgets.length : 0;
      const ruleCount = Array.isArray(rules)
        ? rules.filter(r => r.categoryId === category.id).length
        : 0;
      const transactionCount = transactions.transactions
        ? transactions.transactions.filter(t => t.categoryId === category.id).length
        : 0;

      setDependencies({ budgetCount, ruleCount, transactionCount });
      setCurrentStep('overview');
    } catch (error) {
      console.error('Error loading dependencies:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load category dependencies',
        color: 'red',
      });
      onClose();
    }
  }, [category, onClose]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (opened && category) {
      setCurrentStep('loading');
      setCompletedSteps(new Set());
      setReplacementCategoryId(null);
      loadDependencies();
    }
  }, [opened, category, loadDependencies]);

  // Mutation: Delete budgets
  const deleteBudgetsMutation = useMutation({
    mutationFn: () => api.deleteCategoryBudgets(category!.id),
    onSuccess: (data) => {
      notifications.show({
        title: 'Budgets Deleted',
        message: `Deleted ${data.deleted} budget(s)`,
        color: 'green',
      });
      const updatedSteps = new Set(completedSteps).add('budgets');
      setCompletedSteps(updatedSteps);
      moveToNextStep(updatedSteps);
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete budgets',
        color: 'red',
      });
    },
  });

  // Mutation: Delete rules
  const deleteRulesMutation = useMutation({
    mutationFn: () => api.deleteCategoryRules(category!.id),
    onSuccess: (data) => {
      notifications.show({
        title: 'Rules Deleted',
        message: `Deleted ${data.deleted} rule(s)`,
        color: 'green',
      });
      const updatedSteps = new Set(completedSteps).add('rules');
      setCompletedSteps(updatedSteps);
      moveToNextStep(updatedSteps);
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete rules',
        color: 'red',
      });
    },
  });

  // Mutation: Recategorize transactions
  const recategorizeMutation = useMutation({
    mutationFn: (newCategoryId: string | null) =>
      api.recategorizeCategoryTransactions(category!.id, newCategoryId),
    onSuccess: (data) => {
      notifications.show({
        title: 'Transactions Recategorized',
        message: `Updated ${data.updated} transaction(s)`,
        color: 'green',
      });
      const updatedSteps = new Set(completedSteps).add('transactions');
      setCompletedSteps(updatedSteps);
      moveToNextStep(updatedSteps);
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to recategorize transactions',
        color: 'red',
      });
    },
  });

  // Mutation: Final category deletion
  const deleteCategoryMutation = useMutation({
    mutationFn: () => api.deleteCategory(category!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setCurrentStep('complete');
    },
    onError: (error: unknown) => {
      const errorMessage =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to delete category';
      notifications.show({
        title: 'Error',
        message: errorMessage,
        color: 'red',
        autoClose: false,
      });
    },
  });

  const moveToNextStep = (updatedCompletedSteps?: Set<string>) => {
    // Use the provided set or fall back to state (for initial call from overview)
    const completed = updatedCompletedSteps || completedSteps;

    // Determine next step based on dependencies and completed steps
    if (dependencies.budgetCount > 0 && !completed.has('budgets')) {
      setCurrentStep('budgets');
    } else if (dependencies.ruleCount > 0 && !completed.has('rules')) {
      setCurrentStep('rules');
    } else if (dependencies.transactionCount > 0 && !completed.has('transactions')) {
      setCurrentStep('transactions');
    } else {
      setCurrentStep('confirm');
    }
  };

  const handleOverviewContinue = () => {
    moveToNextStep();
  };

  const handleBudgetsDelete = () => {
    deleteBudgetsMutation.mutate();
  };

  const handleRulesDelete = () => {
    deleteRulesMutation.mutate();
  };

  const handleRulesSkip = () => {
    const updatedSteps = new Set(completedSteps).add('rules');
    setCompletedSteps(updatedSteps);
    moveToNextStep(updatedSteps);
  };

  const handleTransactionsRecategorize = () => {
    const categoryId = replacementCategoryId === 'uncategorized' ? null : replacementCategoryId;
    recategorizeMutation.mutate(categoryId);
  };

  const handleFinalDelete = () => {
    setCurrentStep('processing');
    deleteCategoryMutation.mutate();
  };

  const handleComplete = () => {
    onClose();
  };

  if (!category) return null;

  const isProcessing =
    deleteBudgetsMutation.isPending ||
    deleteRulesMutation.isPending ||
    recategorizeMutation.isPending ||
    deleteCategoryMutation.isPending;

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>Delete Category: {category.name}</Title>}
      size="lg"
      closeOnClickOutside={!isProcessing}
      closeOnEscape={!isProcessing}
    >
      <Stack gap="md">
        {currentStep === 'loading' && (
          <Paper p="xl">
            <Stack align="center" gap="md">
              <Loader size="lg" />
              <Text>Loading category dependencies...</Text>
            </Stack>
          </Paper>
        )}

        {currentStep === 'overview' && (
          <>
            <Alert icon={<IconAlertCircle size={16} />} color="blue">
              <Text size="sm">
                Before deleting "{category.name}", we need to clean up its dependencies.
              </Text>
            </Alert>

            <Paper p="md" withBorder>
              <Stack gap="sm">
                <Text fw={500}>Dependencies to resolve:</Text>
                <List>
                  {dependencies.budgetCount > 0 && (
                    <List.Item>
                      <Badge color="orange" variant="light">{dependencies.budgetCount}</Badge> budget(s)
                    </List.Item>
                  )}
                  {dependencies.ruleCount > 0 && (
                    <List.Item>
                      <Badge color="blue" variant="light">{dependencies.ruleCount}</Badge> auto-categorization rule(s)
                    </List.Item>
                  )}
                  {dependencies.transactionCount > 0 && (
                    <List.Item>
                      <Badge color="grape" variant="light">{dependencies.transactionCount}</Badge> transaction(s)
                    </List.Item>
                  )}
                  {dependencies.budgetCount === 0 && dependencies.ruleCount === 0 && dependencies.transactionCount === 0 && (
                    <List.Item>
                      <Badge color="green" variant="light">None</Badge> - Category is ready to delete
                    </List.Item>
                  )}
                </List>
              </Stack>
            </Paper>

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleOverviewContinue}>
                Continue
              </Button>
            </Group>
          </>
        )}

        {currentStep === 'budgets' && (
          <>
            <Alert icon={<IconAlertCircle size={16} />} color="orange">
              <Text size="sm" fw={500} mb="xs">Delete Budgets</Text>
              <Text size="sm">
                This category has {dependencies.budgetCount} budget(s) that will be permanently deleted.
              </Text>
            </Alert>

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button
                color="red"
                leftSection={<IconTrash size={16} />}
                loading={deleteBudgetsMutation.isPending}
                onClick={handleBudgetsDelete}
              >
                Delete {dependencies.budgetCount} Budget(s)
              </Button>
            </Group>
          </>
        )}

        {currentStep === 'rules' && (
          <>
            <Alert icon={<IconAlertCircle size={16} />} color="blue">
              <Text size="sm" fw={500} mb="xs">Auto-Categorization Rules</Text>
              <Text size="sm">
                This category has {dependencies.ruleCount} auto-categorization rule(s).
                You can delete them now or update them manually later.
              </Text>
            </Alert>

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="light"
                onClick={handleRulesSkip}
              >
                Skip (Update Manually Later)
              </Button>
              <Button
                color="red"
                leftSection={<IconTrash size={16} />}
                loading={deleteRulesMutation.isPending}
                onClick={handleRulesDelete}
              >
                Delete {dependencies.ruleCount} Rule(s)
              </Button>
            </Group>
          </>
        )}

        {currentStep === 'transactions' && (
          <>
            <Alert icon={<IconAlertCircle size={16} />} color="grape">
              <Text size="sm" fw={500} mb="xs">Recategorize Transactions</Text>
              <Text size="sm">
                This category has {dependencies.transactionCount} transaction(s).
                Please select a new category for these transactions.
              </Text>
            </Alert>

            <Stack gap="sm">
              <Text size="sm" fw={500}>Select replacement category:</Text>
              <CategoryPicker
                value={replacementCategoryId}
                onChange={setReplacementCategoryId}
                excludeCategoryId={category.id}
                includeUncategorized={true}
                placeholder="Choose a category..."
              />
            </Stack>

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleTransactionsRecategorize}
                disabled={!replacementCategoryId}
                loading={recategorizeMutation.isPending}
              >
                Recategorize {dependencies.transactionCount} Transaction(s)
              </Button>
            </Group>
          </>
        )}

        {currentStep === 'confirm' && (
          <>
            <Alert icon={<IconCheck size={16} />} color="green">
              <Text size="sm" fw={500} mb="xs">Ready to Delete</Text>
              <Text size="sm">
                All dependencies have been resolved. You can now safely delete "{category.name}".
              </Text>
            </Alert>

            <Paper p="md" withBorder>
              <Stack gap="xs">
                <Text size="sm" fw={500}>Completed:</Text>
                <List size="sm">
                  {completedSteps.has('budgets') && (
                    <List.Item icon={<IconCheck size={16} color="green" />}>
                      Deleted {dependencies.budgetCount} budget(s)
                    </List.Item>
                  )}
                  {completedSteps.has('rules') && (
                    <List.Item icon={<IconCheck size={16} color="green" />}>
                      {deleteRulesMutation.isSuccess ? `Deleted ${dependencies.ruleCount} rule(s)` : 'Skipped rules (for manual update)'}
                    </List.Item>
                  )}
                  {completedSteps.has('transactions') && (
                    <List.Item icon={<IconCheck size={16} color="green" />}>
                      Recategorized {dependencies.transactionCount} transaction(s)
                    </List.Item>
                  )}
                </List>
              </Stack>
            </Paper>

            <Divider />

            <Alert icon={<IconAlertCircle size={16} />} color="red">
              <Text size="sm" fw={500}>
                This action cannot be undone.
              </Text>
            </Alert>

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={handleFinalDelete}
              >
                Delete Category
              </Button>
            </Group>
          </>
        )}

        {currentStep === 'processing' && (
          <Paper p="xl">
            <Stack align="center" gap="md">
              <Loader size="lg" />
              <Text>Deleting category...</Text>
            </Stack>
          </Paper>
        )}

        {currentStep === 'complete' && (
          <>
            <Alert icon={<IconCheck size={16} />} color="green">
              <Text size="sm" fw={500} mb="xs">Success!</Text>
              <Text size="sm">
                The category "{category.name}" has been deleted successfully.
              </Text>
            </Alert>

            <Group justify="flex-end">
              <Button onClick={handleComplete}>
                Close
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </ResponsiveModal>
  );
}
