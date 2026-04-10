import { useState } from 'react';
import {
  Grid,
  Paper,
  Text,
  Group,
  Badge,
  Table,
  Tooltip,
  Stack,
} from '@mantine/core';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { parseMonthString } from '../../utils/formatters';
import { defaultPalette } from '../../theme';
import { createNearestLineTooltip, useChartMouseTracker } from './NearestLineTooltip';

interface ProjectionItem {
  month: string;
  budgetedCashflow: number | null;
  priorYearCashflow: number | null;
  averageCashflow: number;
  isBudgetExtrapolated: boolean;
}

interface ProjectionsData {
  projections: ProjectionItem[];
  hasPriorYearData: boolean;
}

interface ProjectionsSectionProps {
  projectionsData: ProjectionsData | undefined;
}

export function ProjectionsSection({ projectionsData }: ProjectionsSectionProps) {
  const [showBudgetedLine, setShowBudgetedLine] = useState(true);
  const [showPriorYearLine, setShowPriorYearLine] = useState(true);
  const [showAverageLine, setShowAverageLine] = useState(true);
  const projectionsTracker = useChartMouseTracker();

  const projectionsChartData = projectionsData?.projections?.map(item => ({
    month: format(parseMonthString(item.month), 'MMM'),
    budgeted: item.budgetedCashflow,
    priorYear: item.priorYearCashflow,
    average: item.averageCashflow,
    isBudgetExtrapolated: item.isBudgetExtrapolated,
  })) || [];

  const CHART_HEIGHT = 300;
  const projectionsYMax = Math.max(
    ...projectionsChartData.flatMap(d => [d.budgeted ?? 0, d.priorYear ?? 0, d.average]),
    1,
  );
  const ProjectionsTooltip = createNearestLineTooltip(projectionsTracker.mouseYRef, projectionsYMax, CHART_HEIGHT);

  return (
    <Grid>
      <Grid.Col span={12}>
        <Paper withBorder p="md">
          <Group justify="space-between" align="start" mb="md">
            <div>
              <Text size="lg" fw={600}>Cash Flow Outlook (Next 6 Months)</Text>
              <Text size="xs" c="dimmed" mt={4}>
                Compare your budgeted, prior year, and average cash flow trends
              </Text>
            </div>

            {/* Toggle Controls */}
            <Group gap="xs">
              <Badge
                variant={showBudgetedLine ? "filled" : "outline"}
                color="indigo"
                style={{ cursor: 'pointer' }}
                onClick={() => setShowBudgetedLine(!showBudgetedLine)}
              >
                Budgeted
              </Badge>
              {projectionsData?.hasPriorYearData && (
                <Badge
                  variant={showPriorYearLine ? "filled" : "outline"}
                  color="orange"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setShowPriorYearLine(!showPriorYearLine)}
                >
                  Prior Year
                </Badge>
              )}
              <Badge
                variant={showAverageLine ? "filled" : "outline"}
                color="green"
                style={{ cursor: 'pointer' }}
                onClick={() => setShowAverageLine(!showAverageLine)}
              >
                6-Mo Avg
              </Badge>
            </Group>
          </Group>

          <div {...projectionsTracker.containerProps}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={projectionsChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <RechartsTooltip content={<ProjectionsTooltip />} />
              <Legend />

              {/* Budgeted Line */}
              {showBudgetedLine && projectionsChartData.some(d => d.budgeted !== null) && (
                <Line
                  type="monotone"
                  dataKey="budgeted"
                  stroke={defaultPalette.chart.budgeted}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Budgeted"
                  strokeDasharray={projectionsChartData.some(d => d.isBudgetExtrapolated) ? "5 5" : "0"}
                  connectNulls
                />
              )}

              {/* Prior Year Line */}
              {showPriorYearLine && projectionsData?.hasPriorYearData && (
                <Line
                  type="monotone"
                  dataKey="priorYear"
                  stroke={defaultPalette.chart.priorYear}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Prior Year"
                  connectNulls
                />
              )}

              {/* Average Line */}
              {showAverageLine && (
                <Line
                  type="monotone"
                  dataKey="average"
                  stroke={defaultPalette.chart.average}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="6-Month Average"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          </div>

          {/* Legend Explanation */}
          <Stack gap="xs" mt="md" style={{ fontSize: '0.85rem', color: 'var(--mantine-color-dimmed)' }}>
            <Text size="xs">
              <strong style={{ color: defaultPalette.chart.budgeted }}>Budgeted:</strong> Your planned income minus expenses{' '}
              <span style={{ fontSize: '0.75rem' }}>(dashed = copied from last budget)</span>
            </Text>
            {projectionsData?.hasPriorYearData && (
              <Text size="xs">
                <strong style={{ color: defaultPalette.chart.priorYear }}>Prior Year:</strong> Actual cash flow from the same month last year
              </Text>
            )}
            <Text size="xs">
              <strong style={{ color: defaultPalette.chart.average }}>6-Month Average:</strong> Rolling average of recent cash flow
            </Text>
          </Stack>
        </Paper>
      </Grid.Col>

      <Grid.Col span={12}>
        <Paper withBorder p="md">
          <Text size="lg" fw={600} mb="md">Cash Flow Outlook Details</Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Month</Table.Th>
                <Table.Th>Budgeted</Table.Th>
                {projectionsData?.hasPriorYearData && <Table.Th>Prior Year</Table.Th>}
                <Table.Th>6-Mo Average</Table.Th>
                <Table.Th>Variance (Budget vs Avg)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {projectionsData?.projections?.map((projection) => {
                const variance = projection.budgetedCashflow !== null
                  ? projection.budgetedCashflow - projection.averageCashflow
                  : null;

                return (
                  <Table.Tr key={projection.month}>
                    <Table.Td>{format(parseMonthString(projection.month), 'MMM yyyy')}</Table.Td>
                    <Table.Td>
                      {projection.budgetedCashflow !== null ? (
                        <Group gap={4}>
                          <Text c={projection.budgetedCashflow >= 0 ? 'green' : 'red'} fw={500}>
                            ${projection.budgetedCashflow.toFixed(0)}
                          </Text>
                          {projection.isBudgetExtrapolated && (
                            <Tooltip label="Copied from last known budget">
                              <Text size="xs" c="dimmed">†</Text>
                            </Tooltip>
                          )}
                        </Group>
                      ) : (
                        <Text c="dimmed" size="sm">-</Text>
                      )}
                    </Table.Td>
                    {projectionsData?.hasPriorYearData && (
                      <Table.Td>
                        {projection.priorYearCashflow !== null ? (
                          <Text c={projection.priorYearCashflow >= 0 ? 'green' : 'red'} fw={500}>
                            ${projection.priorYearCashflow.toFixed(0)}
                          </Text>
                        ) : (
                          <Text c="dimmed" size="sm">-</Text>
                        )}
                      </Table.Td>
                    )}
                    <Table.Td>
                      <Text c={projection.averageCashflow >= 0 ? 'green' : 'red'} fw={500}>
                        ${projection.averageCashflow.toFixed(0)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {variance !== null ? (
                        <Text c={variance >= 0 ? 'green' : 'red'} fw={500}>
                          {variance >= 0 ? '+' : ''}${variance.toFixed(0)}
                        </Text>
                      ) : (
                        <Text c="dimmed" size="sm">-</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Paper>
      </Grid.Col>
    </Grid>
  );
}
