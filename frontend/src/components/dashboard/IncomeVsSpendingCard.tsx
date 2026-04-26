import { Badge, Card, Group, Progress, Text, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatters';

interface IncomeVsSpendingCardProps {
  monthlySpending: number;
  monthlyIncome: number;
  spendingVsIncomeProgress: number;
}

export function IncomeVsSpendingCard({ monthlySpending, monthlyIncome, spendingVsIncomeProgress }: IncomeVsSpendingCardProps) {
  return (
    <Card padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={500}>Income vs Spending</Text>
        <Tooltip
          label={
            <Text size="xs" style={{ whiteSpace: 'pre-line', fontFamily: 'var(--mantine-font-family-monospace)' }}>
              {[
                'Progress = Spending ÷ Income × 100.',
                'Both exclude transfers and hidden categories.',
                'Spending also excludes savings contributions.',
                '',
                `Spending: ${formatCurrency(monthlySpending, true)}`,
                `Income:   ${formatCurrency(monthlyIncome, true)}`,
                `Progress: ${spendingVsIncomeProgress.toFixed(1)}%`,
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
        <Progress.Section value={spendingVsIncomeProgress} color={spendingVsIncomeProgress > 100 ? 'red' : spendingVsIncomeProgress > 80 ? 'orange' : 'green'}>
          <Progress.Label>{spendingVsIncomeProgress.toFixed(0)}%</Progress.Label>
        </Progress.Section>
      </Progress.Root>
      <Group justify="space-between">
        <Tooltip label={`Spent ${formatCurrency(monthlySpending, true)} of ${formatCurrency(monthlyIncome, true)} income`} openDelay={500}>
          <Text size="sm" c="dimmed" style={{ cursor: 'help' }}>
            Spent {formatCurrency(monthlySpending)} of {formatCurrency(monthlyIncome)} income
          </Text>
        </Tooltip>
        <Badge color={spendingVsIncomeProgress > 100 ? 'red' : spendingVsIncomeProgress > 80 ? 'orange' : 'green'}>
          {spendingVsIncomeProgress > 100 ? 'Overspending' : spendingVsIncomeProgress > 80 ? 'High Spending' : 'Within Income'}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed" mt="xs">
        <Link to="/budgets" style={{ color: 'inherit' }}>Create a budget</Link> to track spending against targets
      </Text>
    </Card>
  );
}
