import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReportsFilters } from '../hooks/usePersistedFilters';
import { notifications } from '@mantine/notifications';
import { formatCurrency } from '../utils/formatters';
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
  Breadcrumbs,
  Anchor,
  SegmentedControl,
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
  IconArrowLeft,
} from '@tabler/icons-react';
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { api } from '../lib/api';
import { TransactionPreviewTrigger } from '../components/transactions';

// Color palette for charts (used for both income and expenses)
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

// Helper function to get date range based on option
function getDateRange(option: string): { startDate: string; endDate: string; startMonth: string; endMonth: string } {
  const now = new Date();
  
  switch(option) {
    case 'thisMonth': {
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      return {
        startDate: format(monthStart, 'yyyy-MM-dd'),
        endDate: format(monthEnd, 'yyyy-MM-dd'),
        startMonth: format(monthStart, 'yyyy-MM'),
        endMonth: format(monthEnd, 'yyyy-MM')
      };
    }
    case 'lastMonth': {
      const lastMonth = subMonths(now, 1);
      const monthStart = startOfMonth(lastMonth);
      const monthEnd = endOfMonth(lastMonth);
      return {
        startDate: format(monthStart, 'yyyy-MM-dd'),
        endDate: format(monthEnd, 'yyyy-MM-dd'),
        startMonth: format(monthStart, 'yyyy-MM'),
        endMonth: format(monthEnd, 'yyyy-MM')
      };
    }
    case 'thisYear': {
      const yearStart = startOfYear(now);
      const yearEnd = endOfYear(now);
      return {
        startDate: format(yearStart, 'yyyy-MM-dd'),
        endDate: format(yearEnd, 'yyyy-MM-dd'),
        startMonth: format(yearStart, 'yyyy-MM'),
        endMonth: format(yearEnd, 'yyyy-MM')
      };
    }
    case 'yearToDate': {
      const yearStart = startOfYear(now);
      return {
        startDate: format(yearStart, 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
        startMonth: format(yearStart, 'yyyy-MM'),
        endMonth: format(now, 'yyyy-MM')
      };
    }
    case 'last3':
    case 'last6':
    case 'last12': {
      const months = parseInt(option.replace('last', ''));
      const startDate = subMonths(now, months);
      return {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
        startMonth: format(startDate, 'yyyy-MM'),
        endMonth: format(now, 'yyyy-MM')
      };
    }
    default: {
      // Default to last 6 months for backwards compatibility
      const startDate = subMonths(now, 6);
      return {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
        startMonth: format(startDate, 'yyyy-MM'),
        endMonth: format(now, 'yyyy-MM')
      };
    }
  }
}

// Type for drill-down state
interface DrillDownState {
  level: 'parent' | 'child';
  parentId?: string;
  parentName?: string;
}

// Types for pie chart data
interface PieChartEntry {
  id?: string;
  name: string;
  value: number;
  percentage: number;
  clickable?: boolean;
  hasChildren?: boolean;
  childCount?: number;
}

interface ProcessedParentData {
  id: string;
  name: string;
  value: number;
  percentage: number;
  hasChildren: boolean;
  childCount: number;
  singleChildName?: string;
  singleChildId?: string;
}

interface ProcessedChildData {
  id: string;
  name: string;
  value: number;
  percentage: number;
}

export function Reports() {
  // Use persisted filters from localStorage
  const { timeRange, setTimeRange, resetFilters } = useReportsFilters();
  
  // Drill-down state for category breakdown
  const [drillDownState, setDrillDownState] = useState<DrillDownState>({
    level: 'parent'
  });
  
  // State for income vs expense view
  const [categoryView, setCategoryView] = useState<'expenses' | 'income'>('expenses');
  
  // State for active tab
  const [activeTab, setActiveTab] = useState<string | null>('cashflow');
  
  // Transaction preview is handled by TransactionPreviewTrigger components
  
  // Calculate date ranges based on selected option
  const { startDate, endDate, startMonth, endMonth } = getDateRange(timeRange);

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
    queryKey: ['reports', 'breakdown', startDate, endDate, categoryView],
    queryFn: () => {
      if (categoryView === 'income') {
        return api.getIncomeCategoryBreakdown(startDate, endDate, true);
      } else {
        return api.getCategoryBreakdown(startDate, endDate, true);
      }
    },
  });

  const { data: projectionsData, isLoading: projectionsLoading } = useQuery({
    queryKey: ['reports', 'projections'],
    queryFn: () => api.getProjections(6),
  });

  // Process and aggregate category data for drill-down
  const processedCategoryData = useMemo(() => {
    if (!breakdownData?.breakdown) return { parentData: [], childData: new Map() };
    
    const parentData: ProcessedParentData[] = [];
    const childData = new Map<string, ProcessedChildData[]>();
    
    // Process each parent category
    breakdownData.breakdown.forEach(parent => {
      if (parent.amount <= 0) return; // Skip negative amounts
      
      const children = parent.subcategories || [];
      const validChildren = children.filter(child => child.amount > 0);
      
      // Store parent data
      parentData.push({
        id: parent.categoryId,
        name: parent.categoryName,
        value: parent.amount,
        percentage: parent.percentage,
        hasChildren: validChildren.length > 0,
        childCount: validChildren.length,
        singleChildName: validChildren.length === 1 ? validChildren[0].categoryName : undefined,
        singleChildId: validChildren.length === 1 ? validChildren[0].categoryId : undefined
      });
      
      // Store children data if any
      if (validChildren.length > 0) {
        const childTotal = validChildren.reduce((sum, child) => sum + child.amount, 0);
        childData.set(parent.categoryId, validChildren.map(child => ({
          id: child.categoryId,
          name: child.categoryName,
          value: child.amount,
          percentage: (child.amount / childTotal) * 100
        })));
      }
    });
    
    return { parentData, childData };
  }, [breakdownData]);
  
  // Get current pie chart data based on drill-down state
  const pieChartData: PieChartEntry[] = useMemo(() => {
    if (drillDownState.level === 'parent') {
      // Show parent categories
      return processedCategoryData.parentData
        .slice(0, 8) // Top 8 categories
        .map(item => ({
          // Use child ID for single-child categories, parent ID otherwise
          id: item.singleChildId || item.id,
          name: item.childCount === 1 && item.singleChildName 
            ? `${item.name} (${item.singleChildName})`
            : item.name,
          value: item.value,
          percentage: item.percentage,
          clickable: item.childCount > 1, // Only clickable if multiple children
          hasChildren: item.hasChildren,
          childCount: item.childCount
        }));
    } else {
      // Show children of selected parent
      const children = processedCategoryData.childData.get(drillDownState.parentId || '');
      return children || [];
    }
  }, [drillDownState, processedCategoryData]);

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
  
  // Handle pie slice click - drill down to subcategories
  const handleSliceClick = (data: PieChartEntry) => {
    if (!data.clickable) return; // Don't drill down if not clickable
    
    if (drillDownState.level === 'parent' && data.childCount && data.childCount > 1) {
      // Drill down to children
      setDrillDownState({
        level: 'child',
        parentId: data.id || '',
        parentName: data.name
      });
    }
  };
  
  
  // Navigate back to parent view
  const navigateToParent = () => {
    setDrillDownState({ level: 'parent' });
  };
  
  // Custom tooltip for pie chart
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: PieChartEntry }> }) => {
    if (active && payload && payload[0]) {
      const data = payload[0].payload;
      return (
        <Paper p="xs" withBorder shadow="sm">
          <Text size="sm" fw={600}>{data.name}</Text>
          <Text size="xs" c="dimmed">
            ${data.value.toFixed(0)} ({data.percentage.toFixed(1)}%)
          </Text>
          {data.clickable && (
            <Text size="xs" c="blue" mt={4}>Click to view subcategories</Text>
          )}
        </Paper>
      );
    }
    return null;
  };

  const ytd = ytdData?.summary;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>Financial Reports</Title>
          <Group gap="xs">
            <Select
              value={timeRange}
              onChange={(value) => setTimeRange(value || 'thisMonth')}
              data={[
                { value: 'thisMonth', label: 'This Month' },
                { value: 'lastMonth', label: 'Last Month' },
                { value: 'yearToDate', label: 'Year to Date' },
                { value: 'thisYear', label: 'This Year' },
                { value: 'last3', label: 'Last 3 Months' },
                { value: 'last6', label: 'Last 6 Months' },
                { value: 'last12', label: 'Last 12 Months' },
              ]}
              w={200}
            />
            <Tooltip label="Reset to default (This Month)">
              <ActionIcon
                variant="subtle"
                onClick={() => {
                  resetFilters();
                  notifications.show({
                    title: 'View Reset',
                    message: 'Reset to This Month view',
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
                <IconArrowUpRight size={22} />
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
                <Text fw={700} size="xl" c={ytd?.netIncome && ytd.netIncome > 0 ? 'green' : 'red'}>
                  {ytd?.netIncome ? (ytd.netIncome < 0 ? '-' : '') + formatCurrency(Math.abs(ytd.netIncome)) : formatCurrency(0)}
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

        <Tabs value={activeTab} onChange={setActiveTab}>
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
            <Stack gap="md">
              {/* Income/Expense Toggle */}
              <Group justify="center">
                <SegmentedControl
                  value={categoryView}
                  onChange={(value: string) => {
                    setCategoryView(value as 'expenses' | 'income');
                    // Reset drill-down when switching views
                    setDrillDownState({ level: 'parent' });
                  }}
                  data={[
                    { label: 'Expenses', value: 'expenses' },
                    { label: 'Income', value: 'income' }
                  ]}
                  size="md"
                />
              </Group>

              <Grid>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Paper withBorder p="md">
                    <Group justify="space-between" mb="md">
                      <div>
                        <Text size="lg" fw={600}>
                          {categoryView === 'income' ? 'Income' : 'Category'} Breakdown
                        </Text>
                        {drillDownState.level === 'child' && (
                          <Breadcrumbs mt={4}>
                            <Anchor 
                              size="sm" 
                              onClick={navigateToParent}
                              style={{ cursor: 'pointer' }}
                            >
                              All Categories
                            </Anchor>
                            <Text size="sm">{drillDownState.parentName}</Text>
                          </Breadcrumbs>
                        )}
                      </div>
                      {drillDownState.level === 'child' && (
                        <ActionIcon
                          variant="subtle"
                          onClick={navigateToParent}
                          size="lg"
                        >
                          <IconArrowLeft size={20} />
                        </ActionIcon>
                      )}
                    </Group>
                  
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
                        onClick={handleSliceClick}
                        style={{ outline: 'none' }}
                      >
                        {pieChartData.map((entry: PieChartEntry, index: number) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={COLORS[index % COLORS.length]}
                            style={{ 
                              cursor: entry.clickable ? 'pointer' : 'default',
                              filter: 'brightness(1)',
                              transition: 'filter 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              if (entry.clickable) {
                                e.currentTarget.style.filter = 'brightness(1.1)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (entry.clickable) {
                                e.currentTarget.style.filter = 'brightness(1)';
                              }
                            }}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Legend */}
                  <SimpleGrid cols={2} spacing="xs" mt="md">
                    {pieChartData.map((entry: PieChartEntry, index: number) => (
                      <TransactionPreviewTrigger
                        key={entry.name}
                        categoryId={entry.id || null}
                        categoryName={entry.name}
                        dateRange={{ startDate, endDate }}
                        tooltipText="Click to preview transactions"
                        timeRangeFilter={timeRange}
                      >
                        <Group gap="xs" style={{ borderRadius: 'var(--mantine-radius-sm)', padding: '4px' }}>
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
                      </TransactionPreviewTrigger>
                    ))}
                  </SimpleGrid>
                </Paper>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 6 }}>
                <Paper withBorder p="md">
                  <Text size="lg" fw={600} mb="md">
                    {categoryView === 'income' ? 'Top Income Sources' : 'Top Spending Categories'}
                  </Text>
                  <Stack gap="sm">
                    {categoryView === 'income' ? (
                      // Show top income categories from current breakdown data
                      pieChartData.slice(0, 5).map((category, index) => (
                        <TransactionPreviewTrigger
                          key={category.id || category.name}
                          categoryId={category.id || null}
                          categoryName={category.name}
                          dateRange={{ startDate, endDate }}
                          tooltipText="Click to preview transactions"
                          timeRangeFilter={timeRange}
                        >
                          <div style={{ borderRadius: 'var(--mantine-radius-sm)', padding: '8px', margin: '-8px' }}>
                            <Group justify="space-between" mb={5}>
                              <Text size="sm">{category.name}</Text>
                              <Text size="sm" fw={600}>
                                ${category.value.toFixed(0)}
                              </Text>
                            </Group>
                            <Progress
                              value={category.percentage}
                              color={COLORS[index % COLORS.length]}
                              size="lg"
                            />
                          </div>
                        </TransactionPreviewTrigger>
                      ))
                    ) : (
                      // Show YTD top spending categories
                      ytd?.topCategories.map((category, index) => (
                        <TransactionPreviewTrigger
                          key={category.categoryId}
                          categoryId={category.categoryId}
                          categoryName={category.categoryName}
                          dateRange={{ startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }}
                          tooltipText="Click to preview YTD transactions"
                          timeRangeFilter="yearToDate"
                        >
                          <div style={{ borderRadius: 'var(--mantine-radius-sm)', padding: '8px', margin: '-8px' }}>
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
                        </TransactionPreviewTrigger>
                      ))
                    )}
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>
            </Stack>
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