import { Badge, Card, Group, Progress, Text, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatters';

interface BudgetStatusCardProps {
  monthlySpending: number;
  totalBudget: number;
  budgetProgress: number;
}

export function BudgetStatusCard({ monthlySpending, totalBudget, budgetProgress }: BudgetStatusCardProps) {
  return (
    <Card
      component={Link}
      to="/budgets?view=bva"
      padding="lg"
      radius="md"
      withBorder
      style={{ display: 'block', textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
    >
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={500}>Monthly Budget Status</Text>
        <Tooltip
          label={
            <Text size="xs" style={{ whiteSpace: 'pre-line', fontFamily: 'var(--mantine-font-family-monospace)' }}>
              {[
                'Progress = Spending ÷ Expense budget × 100.',
                'Spending excludes savings, transfers, and hidden categories.',
                'Expense budget is the sum of non-income, non-transfer budgets',
                'for the current month (savings categories included as expense here).',
                '',
                `Spending: ${formatCurrency(monthlySpending, true)}`,
                `Budget:   ${formatCurrency(totalBudget, true)}`,
                `Progress: ${budgetProgress.toFixed(1)}%`,
              ].join('\n')}
            </Text>
          }
          multiline
          w={360}
          openDelay={300}
          withArrow
        >
          <Text size="xs" c="dimmed" style={{ cursor: 'help' }}>How is this calculated?</Text>
        </Tooltip>
      </Group>
      <Progress.Root size="xl" mb="md">
        <Progress.Section value={budgetProgress} color={budgetProgress > 100 ? 'red' : budgetProgress > 80 ? 'orange' : 'green'}>
          <Progress.Label>{budgetProgress.toFixed(0)}%</Progress.Label>
        </Progress.Section>
      </Progress.Root>
      <Group justify="space-between">
        <Tooltip label={`Spent ${formatCurrency(monthlySpending, true)} of ${formatCurrency(totalBudget, true)} budgeted`} openDelay={500}>
          <Text size="sm" c="dimmed" style={{ cursor: 'help' }}>
            Spent {formatCurrency(monthlySpending)} of {formatCurrency(totalBudget)} budgeted
          </Text>
        </Tooltip>
        <Badge color={budgetProgress > 100 ? 'red' : budgetProgress > 80 ? 'orange' : 'green'}>
          {budgetProgress > 100 ? 'Over Budget' : budgetProgress > 80 ? 'Near Limit' : 'On Track'}
        </Badge>
      </Group>
    </Card>
  );
}
