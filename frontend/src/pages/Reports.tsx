import { useQuery } from '@tanstack/react-query';
import { useReportsFilters } from '../hooks/usePersistedFilters';
import { notifications } from '@mantine/notifications';
import { 
  Container, 
  Title, 
  Grid, 
  Card, 
  Text, 
  Stack, 
  Group, 
  Select,
  Paper,
  Badge,
  RingProgress,
  Progress,
  Loader,
  Center,
  ThemeIcon,
  SimpleGrid,
  Table,
  Tabs,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { 
  IconTrendingUp, 
  IconCash,
  IconChartBar,
  IconChartPie,
  IconArrowUpRight,
  IconArrowDownRight,
  IconFilterOff,
} from '@tabler/icons-react';
import { format, subMonths } from 'date-fns';
import { api } from '../lib/api';

// Color palette for charts
const COLORS = [
  '#4f46e5', // indigo
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
];

export function Reports() {
  // Use persisted filters from localStorage
  const { timeRange, setTimeRange, resetFilters } = useReportsFilters();
  
  // Calculate date ranges
  const endMonth = format(new Date(), 'yyyy-MM');
  const startMonth = format(subMonths(new Date(), parseInt(timeRange)), 'yyyy-MM');
  const startDate = `${startMonth}-01`;
  const endDate = format(new Date(), 'yyyy-MM-dd');

  // Fetch all report data
  const { data: ytdData, isLoading: ytdLoading } = useQuery({
    queryKey: ['reports', 'ytd'],
    queryFn: () => api.getYearToDate(),
  });

  const { data: cashFlowData, isLoading: cashFlowLoading } = useQuery({
    queryKey: ['reports', 'cashflow', startMonth, endMonth],
    queryFn: () => api.getCashFlow(startMonth, endMonth),
  });

  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['reports', 'trends', startMonth, endMonth],
    queryFn: () => api.getSpendingTrends(startMonth, endMonth),
  });

  const { data: breakdownData, isLoading: breakdownLoading } = useQuery({
    queryKey: ['reports', 'breakdown', startDate, endDate],
    queryFn: () => api.getCategoryBreakdown(startDate, endDate),
  });

  const { data: projectionsData, isLoading: projectionsLoading } = useQuery({
    queryKey: ['reports', 'projections'],
    queryFn: () => api.getProjections(6),
  });

  const isLoading = ytdLoading || cashFlowLoading || trendsLoading || breakdownLoading || projectionsLoading;

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  // Process data for charts
  const cashFlowChartData = cashFlowData?.summary?.map(item => ({
    month: format(new Date(item.month + '-01'), 'MMM'),
    income: item.income,
    expenses: item.expenses,
    netFlow: item.netFlow,
  })) || [];

  const projectionsChartData = projectionsData?.projections?.map(item => ({
    month: format(new Date(item.month + '-01'), 'MMM'),
    projected: item.projectedNetFlow,
    confidence: item.confidence,
    income: item.projectedIncome,
    expenses: item.projectedExpenses,
  })) || [];

  // Process spending trends by month
  const trendsByMonth = new Map<string, { [category: string]: number }>();
  trendsData?.trends?.forEach(trend => {
    if (!trendsByMonth.has(trend.month)) {
      trendsByMonth.set(trend.month, {});
    }
    const monthData = trendsByMonth.get(trend.month)!;
    monthData[trend.categoryName] = trend.amount;
  });

  const spendingTrendsData = Array.from(trendsByMonth.entries())
    .map(([month, categories]) => ({
      month: format(new Date(month + '-01'), 'MMM'),
      ...categories,
    }))
    .sort((a, b) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months.indexOf(a.month) - months.indexOf(b.month);
    });

  // Get unique categories for the trends chart
  const uniqueCategories = new Set<string>();
  trendsData?.trends?.forEach(trend => uniqueCategories.add(trend.categoryName));
  const categoryNames = Array.from(uniqueCategories).slice(0, 8); // Limit to top 8 for visibility

  // Prepare pie chart data
  const pieChartData = breakdownData?.breakdown
    ?.filter(item => item.amount > 0)
    .slice(0, 8) // Top 8 categories
    .map(item => ({
      name: item.categoryName,
      value: item.amount,
      percentage: item.percentage,
    })) || [];

  const ytd = ytdData?.summary;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>Financial Reports</Title>
          <Group gap="xs">
            <Select
              value={timeRange}
              onChange={(value) => setTimeRange(value || '6')}
              data={[
                { value: '3', label: 'Last 3 months' },
                { value: '6', label: 'Last 6 months' },
                { value: '12', label: 'Last 12 months' },
              ]}
              w={200}
            />
            <Tooltip label="Reset to default (6 months)">
              <ActionIcon
                variant="subtle"
                onClick={() => {
                  resetFilters();
                  notifications.show({
                    title: 'View Reset',
                    message: 'Reset to 6 months view',
                    color: 'blue',
                  });
                }}
                size="lg"
              >
                <IconFilterOff size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* YTD Summary Cards */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
          <Card withBorder>
            <Group justify="space-between">
              <div>
                <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
                  YTD Income
                </Text>
                <Text fw={700} size="xl">
                  ${ytd?.totalIncome ? Math.ceil(ytd.totalIncome).toLocaleString() : 0}
                </Text>
                <Text size="xs" c="dimmed" mt={7}>
                  ${ytd?.averageMonthlyIncome.toFixed(0) || 0}/month avg
                </Text>
              </div>
              <ThemeIcon color="green" variant="light" size={38} radius="md">
                <IconArrowDownRight size={22} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder>
            <Group justify="space-between">
              <div>
                <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
                  YTD Expenses
                </Text>
                <Text fw={700} size="xl">
                  ${ytd?.totalExpenses ? Math.ceil(ytd.totalExpenses).toLocaleString() : 0}
                </Text>
                <Text size="xs" c="dimmed" mt={7}>
                  ${ytd?.averageMonthlyExpenses.toFixed(0) || 0}/month avg
                </Text>
              </div>
              <ThemeIcon color="red" variant="light" size={38} radius="md">
                <IconArrowUpRight size={22} />
              </ThemeIcon>
            </Group>
          </Card>

          <Card withBorder>
            <Group justify="space-between">
              <div>
                <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
                  Net Income
                </Text>
                <Text fw={700} size="xl" c={ytd?.netIncome && ytd.netIncome > 0 ? 'green' : 'red'}>
                  {ytd?.netIncome ? (ytd.netIncome < 0 ? '-' : '') + '$' + Math.ceil(Math.abs(ytd.netIncome)).toLocaleString() : '$0'}
                </Text>
                <Text size="xs" c="dimmed" mt={7}>
                  This year
                </Text>
              </div>
              <ThemeIcon 
                color={ytd?.netIncome && ytd.netIncome > 0 ? 'green' : 'red'} 
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
                  {ytd?.savingsRate.toFixed(1) || 0}%
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
                  { value: ytd?.savingsRate || 0, color: 'teal' }
                ]}
              />
            </Group>
          </Card>
        </SimpleGrid>

        <Tabs defaultValue="cashflow">
          <Tabs.List>
            <Tabs.Tab value="cashflow" leftSection={<IconCash size={16} />}>
              Cash Flow
            </Tabs.Tab>
            <Tabs.Tab value="spending" leftSection={<IconChartBar size={16} />}>
              Spending Trends
            </Tabs.Tab>
            <Tabs.Tab value="categories" leftSection={<IconChartPie size={16} />}>
              Categories
            </Tabs.Tab>
            <Tabs.Tab value="projections" leftSection={<IconTrendingUp size={16} />}>
              Projections
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="cashflow" pt="xl">
            <Grid>
              <Grid.Col span={12}>
                <Paper withBorder p="md">
                  <Text size="lg" fw={600} mb="md">Income vs Expenses</Text>
                  {cashFlowChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={cashFlowChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <RechartsTooltip formatter={(value: number) => `$${value.toFixed(0)}`} />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="income" 
                          stroke="#10b981" 
                          fill="#10b981" 
                          fillOpacity={0.6}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="expenses" 
                          stroke="#ef4444" 
                          fill="#ef4444" 
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <Center h={300}>
                      <Text c="dimmed">No data available for the selected period</Text>
                    </Center>
                  )}
                </Paper>
              </Grid.Col>

              <Grid.Col span={12}>
                <Paper withBorder p="md">
                  <Text size="lg" fw={600} mb="md">Net Cash Flow</Text>
                  {cashFlowChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={cashFlowChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <RechartsTooltip formatter={(value: number) => `$${value.toFixed(0)}`} />
                        <Bar 
                          dataKey="netFlow" 
                          fill="#4f46e5"
                        >
                          {cashFlowChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.netFlow >= 0 ? '#10b981' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Center h={200}>
                      <Text c="dimmed">No data available for the selected period</Text>
                    </Center>
                  )}
                </Paper>
              </Grid.Col>
            </Grid>
          </Tabs.Panel>

          <Tabs.Panel value="spending" pt="xl">
            <Paper withBorder p="md">
              <Text size="lg" fw={600} mb="md">Spending by Category Over Time</Text>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={spendingTrendsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <RechartsTooltip formatter={(value: number) => `$${value.toFixed(0)}`} />
                  <Legend />
                  {categoryNames.map((category, index) => (
                    <Line
                      key={category}
                      type="monotone"
                      dataKey={category}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="categories" pt="xl">
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper withBorder p="md">
                  <Text size="lg" fw={600} mb="md">Category Breakdown</Text>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={entry => `${entry.percentage.toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(value: number) => `$${value.toFixed(0)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Legend */}
                  <SimpleGrid cols={2} spacing="xs" mt="md">
                    {pieChartData.map((entry, index) => (
                      <Group key={entry.name} gap="xs">
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            backgroundColor: COLORS[index % COLORS.length],
                            borderRadius: 2,
                          }}
                        />
                        <Text size="sm" truncate>
                          {entry.name}
                        </Text>
                      </Group>
                    ))}
                  </SimpleGrid>
                </Paper>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper withBorder p="md">
                  <Text size="lg" fw={600} mb="md">Top Spending Categories</Text>
                  <Stack gap="sm">
                    {ytd?.topCategories.map((category, index) => (
                      <div key={category.categoryId}>
                        <Group justify="space-between" mb={5}>
                          <Text size="sm">{category.categoryName}</Text>
                          <Text size="sm" fw={600}>
                            ${category.amount.toFixed(0)}
                          </Text>
                        </Group>
                        <Progress
                          value={category.percentage}
                          color={COLORS[index % COLORS.length]}
                          size="lg"
                        />
                      </div>
                    ))}
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>
          </Tabs.Panel>

          <Tabs.Panel value="projections" pt="xl">
            <Grid>
              <Grid.Col span={12}>
                <Paper withBorder p="md">
                  <Text size="lg" fw={600} mb="md">6-Month Cash Flow Projection</Text>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={projectionsChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <RechartsTooltip formatter={(value: number) => `$${value.toFixed(0)}`} />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="income"
                        stackId="1"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.3}
                      />
                      <Area
                        type="monotone"
                        dataKey="expenses"
                        stackId="2"
                        stroke="#ef4444"
                        fill="#ef4444"
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid.Col>

              <Grid.Col span={12}>
                <Paper withBorder p="md">
                  <Text size="lg" fw={600} mb="md">Projected Net Income</Text>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Month</Table.Th>
                        <Table.Th>Projected Income</Table.Th>
                        <Table.Th>Projected Expenses</Table.Th>
                        <Table.Th>Net Flow</Table.Th>
                        <Table.Th>Confidence</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {projectionsData?.projections?.map((projection) => (
                        <Table.Tr key={projection.month}>
                          <Table.Td>{format(new Date(projection.month + '-01'), 'MMM yyyy')}</Table.Td>
                          <Table.Td>${projection.projectedIncome.toFixed(0)}</Table.Td>
                          <Table.Td>${projection.projectedExpenses.toFixed(0)}</Table.Td>
                          <Table.Td>
                            <Text c={projection.projectedNetFlow >= 0 ? 'green' : 'red'} fw={600}>
                              ${projection.projectedNetFlow.toFixed(0)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              color={
                                projection.confidence === 'high' ? 'green' :
                                projection.confidence === 'medium' ? 'yellow' : 'red'
                              }
                            >
                              {projection.confidence}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Paper>
              </Grid.Col>
            </Grid>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}