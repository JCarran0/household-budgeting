import {
  Table,
  Text,
  Progress,
  Badge,
  Group,
  Stack,
  Paper,
  Title,
  ThemeIcon,
  Tooltip,
  Button,
} from '@mantine/core';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconAlertCircle,
  IconDownload,
  IconCheck,
} from '@tabler/icons-react';
import type { BudgetComparisonResponse } from '../../lib/api';
import type { Category } from '../../../../shared/types';

interface BudgetComparisonProps {
  comparison: BudgetComparisonResponse;
  categories: Category[];
}

export function BudgetComparison({ comparison, categories }: BudgetComparisonProps) {
  const getCategoryName = (categoryId: string): string => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return 'Unknown Category';
    
    if (category.parentId) {
      const parent = categories.find(c => c.id === category.parentId);
      return parent ? `${parent.name} → ${category.name}` : category.name;
    }
    
    return category.name;
  };

  const getProgressColor = (percentUsed: number): string => {
    if (percentUsed <= 50) return 'green';
    if (percentUsed <= 80) return 'yellow';
    if (percentUsed <= 100) return 'orange';
    return 'red';
  };

  const exportToCSV = (): void => {
    const headers = ['Category', 'Budgeted', 'Actual', 'Remaining', 'Percent Used', 'Status'];
    const rows = comparison.comparisons.map(comp => [
      getCategoryName(comp.categoryId),
      comp.budgeted.toFixed(2),
      comp.actual.toFixed(2),
      comp.remaining.toFixed(2),
      `${comp.percentUsed}%`,
      comp.isOverBudget ? 'Over Budget' : 'On Track'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-comparison-${comparison.month}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Sort comparisons by variance (most over budget first)
  const sortedComparisons = [...comparison.comparisons].sort((a, b) => {
    if (a.isOverBudget && !b.isOverBudget) return -1;
    if (!a.isOverBudget && b.isOverBudget) return 1;
    return a.remaining - b.remaining;
  });

  return (
    <Stack gap="lg">
      <Paper p="md" withBorder>
        <Group justify="space-between" mb="md">
          <Title order={4}>Budget Performance Summary</Title>
          <Button
            variant="light"
            size="sm"
            leftSection={<IconDownload size={16} />}
            onClick={exportToCSV}
          >
            Export CSV
          </Button>
        </Group>
        
        <Group grow>
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Total Budgeted</Text>
            <Text size="xl" fw={600}>
              ${comparison.totals.budgeted.toFixed(2)}
            </Text>
          </Stack>
          
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Total Spent</Text>
            <Text 
              size="xl" 
              fw={600}
              c={comparison.totals.isOverBudget ? 'red' : undefined}
            >
              ${comparison.totals.actual.toFixed(2)}
            </Text>
          </Stack>
          
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Remaining</Text>
            <Text 
              size="xl" 
              fw={600}
              c={comparison.totals.remaining < 0 ? 'red' : 'green'}
            >
              {comparison.totals.remaining < 0 ? '-' : ''}
              ${Math.abs(comparison.totals.remaining).toFixed(2)}
            </Text>
          </Stack>
          
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Overall Usage</Text>
            <Group gap="xs">
              <Text size="xl" fw={600}>
                {comparison.totals.percentUsed}%
              </Text>
              {comparison.totals.isOverBudget ? (
                <ThemeIcon color="red" size="sm">
                  <IconAlertCircle size={16} />
                </ThemeIcon>
              ) : (
                <ThemeIcon color="green" size="sm">
                  <IconCheck size={16} />
                </ThemeIcon>
              )}
            </Group>
          </Stack>
        </Group>
        
        <Progress
          value={Math.min(comparison.totals.percentUsed, 100)}
          color={getProgressColor(comparison.totals.percentUsed)}
          size="lg"
          mt="md"
          striped={comparison.totals.isOverBudget}
          animated={comparison.totals.isOverBudget}
        />
      </Paper>

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Category</Table.Th>
            <Table.Th width={120}>Budgeted</Table.Th>
            <Table.Th width={120}>Actual</Table.Th>
            <Table.Th width={120}>Remaining</Table.Th>
            <Table.Th width={200}>Progress</Table.Th>
            <Table.Th width={100}>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sortedComparisons.map((comp) => {
            const categoryName = getCategoryName(comp.categoryId);
            const progressColor = getProgressColor(comp.percentUsed);
            
            return (
              <Table.Tr key={comp.categoryId}>
                <Table.Td>
                  <Text fw={500}>{categoryName}</Text>
                </Table.Td>
                
                <Table.Td>
                  <Text>${comp.budgeted.toFixed(2)}</Text>
                </Table.Td>
                
                <Table.Td>
                  <Text fw={500}>${comp.actual.toFixed(2)}</Text>
                </Table.Td>
                
                <Table.Td>
                  <Text 
                    fw={500}
                    c={comp.remaining < 0 ? 'red' : 'green'}
                  >
                    {comp.remaining < 0 ? '-' : ''}
                    ${Math.abs(comp.remaining).toFixed(2)}
                  </Text>
                </Table.Td>
                
                <Table.Td>
                  <Stack gap={4}>
                    <Progress
                      value={Math.min(comp.percentUsed, 100)}
                      color={progressColor}
                      size="sm"
                      striped={comp.isOverBudget}
                    />
                    <Text size="xs" c="dimmed" ta="center">
                      {comp.percentUsed}%
                    </Text>
                  </Stack>
                </Table.Td>
                
                <Table.Td>
                  {comp.isOverBudget ? (
                    <Tooltip label={`${comp.percentUsed - 100}% over budget`}>
                      <Badge
                        color="red"
                        variant="light"
                        leftSection={<IconTrendingUp size={12} />}
                      >
                        Over
                      </Badge>
                    </Tooltip>
                  ) : comp.percentUsed > 80 ? (
                    <Tooltip label="Approaching budget limit">
                      <Badge
                        color="yellow"
                        variant="light"
                        leftSection={<IconAlertCircle size={12} />}
                      >
                        Warning
                      </Badge>
                    </Tooltip>
                  ) : (
                    <Tooltip label={`${100 - comp.percentUsed}% remaining`}>
                      <Badge
                        color="green"
                        variant="light"
                        leftSection={<IconTrendingDown size={12} />}
                      >
                        On Track
                      </Badge>
                    </Tooltip>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}