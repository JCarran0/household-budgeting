import {
  Card,
  Text,
  Group,
  ThemeIcon,
  SimpleGrid,
  RingProgress,
} from '@mantine/core';
import {
  IconCash,
  IconArrowUpRight,
  IconArrowDownRight,
} from '@tabler/icons-react';
import { formatCurrency } from '../../utils/formatters';

interface KpiSummary {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  savingsRate: number;
}

interface ReportsKpiCardsProps {
  kpiSummary: KpiSummary | null;
  timeRangeLabel: string;
}

export function ReportsKpiCards({ kpiSummary, timeRangeLabel }: ReportsKpiCardsProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
              {timeRangeLabel} Income
            </Text>
            <Text fw={700} size="xl">
              ${kpiSummary?.totalIncome ? Math.ceil(kpiSummary.totalIncome).toLocaleString() : 0}
            </Text>
            <Text size="xs" c="dimmed" mt={7}>
              ${kpiSummary?.averageMonthlyIncome.toFixed(0) || 0}/month avg
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
            <Text fw={700} size="xl">
              ${kpiSummary?.totalExpenses ? Math.ceil(kpiSummary.totalExpenses).toLocaleString() : 0}
            </Text>
            <Text size="xs" c="dimmed" mt={7}>
              ${kpiSummary?.averageMonthlyExpenses.toFixed(0) || 0}/month avg
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
              Net Income
            </Text>
            <Text fw={700} size="xl" c={kpiSummary?.netIncome && kpiSummary.netIncome > 0 ? 'green' : 'red'}>
              {kpiSummary?.netIncome ? (kpiSummary.netIncome < 0 ? '-' : '') + formatCurrency(Math.abs(kpiSummary.netIncome)) : formatCurrency(0)}
            </Text>
            <Text size="xs" c="dimmed" mt={7}>
              {timeRangeLabel}
            </Text>
          </div>
          <ThemeIcon
            color={kpiSummary?.netIncome && kpiSummary.netIncome > 0 ? 'green' : 'red'}
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
            <Text fw={700} size="xl">
              {kpiSummary?.savingsRate.toFixed(1) || 0}%
            </Text>
            <Text size="xs" c="dimmed" mt={7}>
              Of income saved
            </Text>
          </div>
          <RingProgress
            size={60}
            thickness={6}
            roundCaps
            sections={[
              { value: kpiSummary?.savingsRate || 0, color: 'teal' }
            ]}
          />
        </Group>
      </Card>
    </SimpleGrid>
  );
}
