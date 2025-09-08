import { Grid, Card, Group, ThemeIcon, Text, Stack } from '@mantine/core';
import {
  IconTrendingUp,
  IconCurrencyDollar,
  IconChartBar,
} from '@tabler/icons-react';
import { formatCurrency } from '../../utils/formatters';

interface BudgetSummaryCardsProps {
  budgetedIncome: number;
  actualIncome: number;
  budgetedSpending: number;
  actualSpending: number;
}

export function BudgetSummaryCards({ 
  budgetedIncome, 
  actualIncome, 
  budgetedSpending, 
  actualSpending 
}: BudgetSummaryCardsProps) {
  // Calculate cashflow values
  const plannedCashflow = budgetedIncome - budgetedSpending;
  const actualCashflow = actualIncome - actualSpending;
  
  // Calculate differences
  const cashflowDifference = actualCashflow - plannedCashflow;
  const spendingDifference = actualSpending - budgetedSpending;
  const incomeDifference = actualIncome - budgetedIncome;
  
  // Color logic for differences
  const getCashflowColor = (difference: number): string => {
    // For cashflow: positive difference (actual > planned) is good (green)
    return difference >= 0 ? 'green' : 'red';
  };
  
  const getSpendingColor = (difference: number): string => {
    // For spending: negative difference (actual < planned) is good (green)
    return difference <= 0 ? 'green' : 'red';
  };
  
  const getIncomeColor = (difference: number): string => {
    // For income: positive difference (actual > planned) is good (green)
    return difference >= 0 ? 'green' : 'red';
  };

  return (
    <Grid mb="lg">
      {/* Planned Cashflow vs Actual Cashflow */}
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <Card>
          <Stack gap="xs">
            <Group gap="xs">
              <ThemeIcon color="blue" variant="light" size="lg">
                <IconChartBar size={20} />
              </ThemeIcon>
              <div>
                <Text size="xs" c="dimmed">Cashflow</Text>
              </div>
            </Group>
            
            <Group justify="center" gap="xl">
              <div style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed">Planned</Text>
                <Text fw={500} size="md">{formatCurrency(plannedCashflow)}</Text>
              </div>
              <Text size="sm" c="dimmed">vs</Text>
              <div style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed">Actual</Text>
                <Text fw={500} size="md">{formatCurrency(actualCashflow)}</Text>
              </div>
            </Group>
            
            <Text 
              size="sm" 
              fw={600}
              c={getCashflowColor(cashflowDifference)}
              ta="center"
            >
              {cashflowDifference >= 0 ? '+' : ''}{formatCurrency(cashflowDifference)} difference
            </Text>
          </Stack>
        </Card>
      </Grid.Col>

      {/* Budgeted Spending vs Actual Spending */}
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <Card>
          <Stack gap="xs">
            <Group gap="xs">
              <ThemeIcon color="blue" variant="light" size="lg">
                <IconCurrencyDollar size={20} />
              </ThemeIcon>
              <div>
                <Text size="xs" c="dimmed">Spending</Text>
              </div>
            </Group>
            
            <Group justify="center" gap="xl">
              <div style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed">Budgeted</Text>
                <Text fw={500} size="md">{formatCurrency(budgetedSpending)}</Text>
              </div>
              <Text size="sm" c="dimmed">vs</Text>
              <div style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed">Actual</Text>
                <Text fw={500} size="md">{formatCurrency(actualSpending)}</Text>
              </div>
            </Group>
            
            <Text 
              size="sm" 
              fw={600}
              c={getSpendingColor(spendingDifference)}
              ta="center"
            >
              {spendingDifference >= 0 ? '+' : ''}{formatCurrency(spendingDifference)} difference
            </Text>
          </Stack>
        </Card>
      </Grid.Col>

      {/* Budgeted Income vs Actual Income */}
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <Card>
          <Stack gap="xs">
            <Group gap="xs">
              <ThemeIcon color="green" variant="light" size="lg">
                <IconTrendingUp size={20} />
              </ThemeIcon>
              <div>
                <Text size="xs" c="dimmed">Income</Text>
              </div>
            </Group>
            
            <Group justify="center" gap="xl">
              <div style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed">Budgeted</Text>
                <Text fw={500} size="md">{formatCurrency(budgetedIncome)}</Text>
              </div>
              <Text size="sm" c="dimmed">vs</Text>
              <div style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed">Actual</Text>
                <Text fw={500} size="md">{formatCurrency(actualIncome)}</Text>
              </div>
            </Group>
            
            <Text 
              size="sm" 
              fw={600}
              c={getIncomeColor(incomeDifference)}
              ta="center"
            >
              {incomeDifference >= 0 ? '+' : ''}{formatCurrency(incomeDifference)} difference
            </Text>
          </Stack>
        </Card>
      </Grid.Col>
    </Grid>
  );
}