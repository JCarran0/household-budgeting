import { Grid, Card, Group, ThemeIcon, Text, Stack } from '@mantine/core';
import {
  IconTrendingUp,
  IconCurrencyDollar,
  IconChartBar,
} from '@tabler/icons-react';
import { formatCurrency } from '../../utils/formatters';

// Fun message arrays for budget feedback
const POSITIVE_MESSAGES = ['Nice!', 'Slay!', 'Fire!', 'Gucci!', 'Lit!', 'Bussin\'!'];
const NEUTRAL_MESSAGES = ['Mid', 'Meh', 'It\'s fine'];
const NEGATIVE_MESSAGES = ['Uh oh', 'Not great', 'Yeesh', 'Yikes', 'Cooked', 'Cringe', 'Chopped'];

// Helper function to get a random message from an array
const getRandomMessage = (messages: string[]): string => {
  return messages[Math.floor(Math.random() * messages.length)];
};

// Helper function to determine if a difference is within 5% tolerance
const isWithinTolerance = (actual: number, planned: number): boolean => {
  if (planned === 0) return actual === 0;
  return Math.abs(actual - planned) / Math.abs(planned) <= 0.05;
};

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
  
  // Color logic and fun messages for differences
  const getCashflowColor = (difference: number): string => {
    // For cashflow: positive difference (actual > planned) is good (green)
    if (difference >= 0) return 'green';
    if (isWithinTolerance(actualCashflow, plannedCashflow)) return 'yellow';
    return 'red';
  };
  
  const getCashflowMessage = (difference: number): string => {
    // For cashflow: positive difference (actual > planned) is good
    if (difference >= 0) return getRandomMessage(POSITIVE_MESSAGES);
    if (isWithinTolerance(actualCashflow, plannedCashflow)) return getRandomMessage(NEUTRAL_MESSAGES);
    return getRandomMessage(NEGATIVE_MESSAGES);
  };
  
  const getSpendingColor = (difference: number): string => {
    // For spending: negative difference (actual < planned) is good (green)
    if (difference <= 0) return 'green';
    if (isWithinTolerance(actualSpending, budgetedSpending)) return 'yellow';
    return 'red';
  };
  
  const getSpendingMessage = (difference: number): string => {
    // For spending: negative difference (actual < planned) is good
    if (difference <= 0) return getRandomMessage(POSITIVE_MESSAGES);
    if (isWithinTolerance(actualSpending, budgetedSpending)) return getRandomMessage(NEUTRAL_MESSAGES);
    return getRandomMessage(NEGATIVE_MESSAGES);
  };
  
  const getIncomeColor = (difference: number): string => {
    // For income: positive difference (actual > planned) is good (green)
    if (difference >= 0) return 'green';
    if (isWithinTolerance(actualIncome, budgetedIncome)) return 'yellow';
    return 'red';
  };
  
  const getIncomeMessage = (difference: number): string => {
    // For income: positive difference (actual > planned) is good
    if (difference >= 0) return getRandomMessage(POSITIVE_MESSAGES);
    if (isWithinTolerance(actualIncome, budgetedIncome)) return getRandomMessage(NEUTRAL_MESSAGES);
    return getRandomMessage(NEGATIVE_MESSAGES);
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
            
            <div style={{ textAlign: 'center' }}>
              <Text 
                size="sm" 
                fw={500}
                c={getCashflowColor(cashflowDifference)}
              >
                {cashflowDifference >= 0 ? '+' : ''}{formatCurrency(cashflowDifference)}
              </Text>
              <Text 
                size="xs" 
                fw={600}
                c={getCashflowColor(cashflowDifference)}
              >
                {getCashflowMessage(cashflowDifference)}
              </Text>
            </div>
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
            
            <div style={{ textAlign: 'center' }}>
              <Text 
                size="sm" 
                fw={500}
                c={getSpendingColor(spendingDifference)}
              >
                {spendingDifference >= 0 ? '+' : ''}{formatCurrency(spendingDifference)}
              </Text>
              <Text 
                size="xs" 
                fw={600}
                c={getSpendingColor(spendingDifference)}
              >
                {getSpendingMessage(spendingDifference)}
              </Text>
            </div>
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
            
            <div style={{ textAlign: 'center' }}>
              <Text 
                size="sm" 
                fw={500}
                c={getIncomeColor(incomeDifference)}
              >
                {incomeDifference >= 0 ? '+' : ''}{formatCurrency(incomeDifference)}
              </Text>
              <Text 
                size="xs" 
                fw={600}
                c={getIncomeColor(incomeDifference)}
              >
                {getIncomeMessage(incomeDifference)}
              </Text>
            </div>
          </Stack>
        </Card>
      </Grid.Col>
    </Grid>
  );
}