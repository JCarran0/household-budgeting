import {
  Card,
  Text,
  Group,
  ThemeIcon,
  SimpleGrid,
  RingProgress,
  Tooltip,
} from '@mantine/core';
import {
  IconCash,
  IconArrowUpRight,
  IconArrowDownRight,
  IconBuildingBank,
} from '@tabler/icons-react';
import { formatCurrency } from '../../utils/formatters';

interface KpiSummary {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  netCashflow: number;
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  savingsRate: number;
  contributionRate: number;
}

interface ReportsKpiCardsProps {
  kpiSummary: KpiSummary | null;
  timeRangeLabel: string;
}

function FormulaTooltip({ children, formula }: { children: React.ReactNode; formula: string }) {
  return (
    <Tooltip
      label={
        <Text size="xs" style={{ whiteSpace: 'pre-line', fontFamily: 'var(--mantine-font-family-monospace)' }}>
          {formula}
        </Text>
      }
      multiline
      w={380}
      openDelay={300}
      closeDelay={200}
      withArrow
    >
      <Text fw={700} size="xl" style={{ cursor: 'help' }}>
        {children}
      </Text>
    </Tooltip>
  );
}

function FormulaTooltipColored({
  children,
  formula,
  color,
}: {
  children: React.ReactNode;
  formula: string;
  color?: string;
}) {
  return (
    <Tooltip
      label={
        <Text size="xs" style={{ whiteSpace: 'pre-line', fontFamily: 'var(--mantine-font-family-monospace)' }}>
          {formula}
        </Text>
      }
      multiline
      w={380}
      openDelay={300}
      closeDelay={200}
      withArrow
    >
      <Text fw={700} size="xl" c={color} style={{ cursor: 'help' }}>
        {children}
      </Text>
    </Tooltip>
  );
}

export function ReportsKpiCards({ kpiSummary, timeRangeLabel }: ReportsKpiCardsProps) {
  const income = kpiSummary?.totalIncome ?? 0;
  const expenses = kpiSummary?.totalExpenses ?? 0;
  const savings = kpiSummary?.totalSavings ?? 0;
  const netCashflow = kpiSummary?.netCashflow ?? 0;
  const avgIncome = kpiSummary?.averageMonthlyIncome ?? 0;
  const avgExpenses = kpiSummary?.averageMonthlyExpenses ?? 0;
  const savingsRate = kpiSummary?.savingsRate ?? 0;
  const contributionRate = kpiSummary?.contributionRate ?? 0;

  const incomeFormula = [
    `Sum of monthly income across ${timeRangeLabel}.`,
    'Excludes transfers, hidden categories, and savings categories.',
    `Total:    ${formatCurrency(income, true)}`,
    `Avg/mo:   ${formatCurrency(avgIncome, true)} (complete months only)`,
  ].join('\n');

  const expensesFormula = [
    `Sum of monthly expenses across ${timeRangeLabel}.`,
    'Excludes transfers, hidden categories, and savings categories.',
    'Signed accumulation: refunds net against expense (a -$24 refund',
    'reduces this total by $24). Matches the Dashboard Monthly Spending',
    'KPI exactly when the date ranges align.',
    `Total:    ${formatCurrency(expenses, true)}`,
    `Avg/mo:   ${formatCurrency(avgExpenses, true)} (complete months only)`,
  ].join('\n');

  const savingsFormula = [
    `Sum of monthly savings contributions across ${timeRangeLabel}.`,
    'Categories with isSavings=true (and their subcategories).',
    'Excluded from the Expenses KPI above.',
    `Total:    ${formatCurrency(savings, true)}`,
  ].join('\n');

  const netFormula = [
    `Net Cashflow = Income − Spending − Savings.`,
    `True bottom line after both consumption and savings commitments.`,
    `Income:   ${formatCurrency(income, true)}`,
    `Spending: ${formatCurrency(expenses, true)}`,
    `Savings:  ${formatCurrency(savings, true)}`,
    `Net:      ${formatCurrency(netCashflow, true)}`,
  ].join('\n');

  const savingsRateFormula = [
    'Industry-standard savings rate: share of income not consumed.',
    '(Income − Expenses) ÷ Income × 100',
    'Counts both leftover cash AND explicit savings contributions.',
    `Income:   ${formatCurrency(income, true)}`,
    `Expenses: ${formatCurrency(expenses, true)}`,
    `Rate:     ${savingsRate.toFixed(2)}%`,
  ].join('\n');

  const contributionRateFormula = [
    'Share of income explicitly sent to savings categories.',
    'Savings ÷ Income × 100',
    `Savings:  ${formatCurrency(savings, true)}`,
    `Income:   ${formatCurrency(income, true)}`,
    `Rate:     ${contributionRate.toFixed(2)}%`,
  ].join('\n');

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 6 }} spacing="md">
      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
              {timeRangeLabel} Income
            </Text>
            <FormulaTooltip formula={incomeFormula}>
              ${Math.ceil(income).toLocaleString()}
            </FormulaTooltip>
            <Text size="xs" c="dimmed" mt={7}>
              ${avgIncome.toFixed(0)}/month avg
            </Text>
          </div>
          <ThemeIcon color="green" variant="light" size={38} radius="md">
            <IconArrowUpRight size={22} />
          </ThemeIcon>
        </Group>
      </Card>

      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
              {timeRangeLabel} Expenses
            </Text>
            <FormulaTooltip formula={expensesFormula}>
              ${Math.ceil(expenses).toLocaleString()}
            </FormulaTooltip>
            <Text size="xs" c="dimmed" mt={7}>
              ${avgExpenses.toFixed(0)}/month avg
            </Text>
          </div>
          <ThemeIcon color="red" variant="light" size={38} radius="md">
            <IconArrowDownRight size={22} />
          </ThemeIcon>
        </Group>
      </Card>

      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
              {timeRangeLabel} Savings
            </Text>
            <FormulaTooltipColored formula={savingsFormula} color="teal">
              ${Math.ceil(savings).toLocaleString()}
            </FormulaTooltipColored>
            <Text size="xs" c="dimmed" mt={7}>
              Excluded from spending
            </Text>
          </div>
          <ThemeIcon color="teal" variant="light" size={38} radius="md">
            <IconBuildingBank size={22} />
          </ThemeIcon>
        </Group>
      </Card>

      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
              Net Cashflow (Actuals)
            </Text>
            <FormulaTooltipColored formula={netFormula} color={netCashflow > 0 ? 'green' : 'red'}>
              {(netCashflow < 0 ? '-' : '') + formatCurrency(Math.abs(netCashflow))}
            </FormulaTooltipColored>
            <Text size="xs" c="dimmed" mt={7}>
              {timeRangeLabel}
            </Text>
          </div>
          <ThemeIcon
            color={netCashflow > 0 ? 'green' : 'red'}
            variant="light"
            size={38}
            radius="md"
          >
            <IconCash size={22} />
          </ThemeIcon>
        </Group>
      </Card>

      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
              Savings Rate
            </Text>
            <FormulaTooltip formula={savingsRateFormula}>
              {savingsRate.toFixed(1)}%
            </FormulaTooltip>
            <Text size="xs" c="dimmed" mt={7}>
              Of income not spent
            </Text>
          </div>
          <RingProgress
            size={60}
            thickness={6}
            roundCaps
            sections={[
              { value: Math.max(0, Math.min(100, savingsRate)), color: 'teal' }
            ]}
          />
        </Group>
      </Card>

      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
              Contribution Rate
            </Text>
            <FormulaTooltip formula={contributionRateFormula}>
              {contributionRate.toFixed(1)}%
            </FormulaTooltip>
            <Text size="xs" c="dimmed" mt={7}>
              Of income to savings accts
            </Text>
          </div>
          <RingProgress
            size={60}
            thickness={6}
            roundCaps
            sections={[
              { value: Math.max(0, Math.min(100, contributionRate)), color: 'teal' }
            ]}
          />
        </Group>
      </Card>
    </SimpleGrid>
  );
}
