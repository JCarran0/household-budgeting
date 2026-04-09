import { useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useReportsFilters } from '../hooks/usePersistedFilters';
import { notifications } from '@mantine/notifications';
import { getDateRange } from '../utils/reportDateRange';
import {
  Container,
  Title,
  Stack,
  Group,
  Select,
  Tabs,
  ActionIcon,
  Tooltip,
  Paper,
  Text,
  Center,
  Loader,
} from '@mantine/core';
import {
  IconCash,
  IconChartBar,
  IconChartPie,
  IconFilterOff,
  IconSettings,
  IconTarget,
  IconTrendingUp,
} from '@tabler/icons-react';
import { format, addMonths } from 'date-fns';
import { api } from '../lib/api';
import { calculateBudgetTotals } from '../../../shared/utils/budgetCalculations';
import { ReportSettings } from '../components/reports/ReportSettings';
import { ReportsKpiCards } from '../components/reports/ReportsKpiCards';
import { CashflowSection } from '../components/reports/CashflowSection';
import { SpendingTrendsSection } from '../components/reports/SpendingTrendsSection';
import { CategoryBreakdownSection } from '../components/reports/CategoryBreakdownSection';
import { ProjectionsSection } from '../components/reports/ProjectionsSection';
import { BudgetPerformanceSection } from '../components/reports/BudgetPerformanceSection';

export function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Use persisted filters from localStorage as fallback
  const { timeRange: storedTimeRange, setTimeRange: setStoredTimeRange, activeTab: storedActiveTab, setActiveTab: setStoredActiveTab, resetFilters: resetStoredFilters } = useReportsFilters();

  // Valid values for URL params
  const validTimeRanges = ['thisMonth', 'lastMonth', 'thisYear', 'yearToDate', 'last3', 'last6', 'last12'];
  const validTypes = ['expenses', 'income'] as const;
  const validTabs = ['cashflow', 'spending', 'categories', 'projections', 'budgets', 'settings'];

  // URL params are source of truth, falling back to localStorage/defaults
  const timeRange = validTimeRanges.includes(searchParams.get('timeRange') || '')
    ? searchParams.get('timeRange')!
    : storedTimeRange;
  const categoryView: 'expenses' | 'income' = validTypes.includes(searchParams.get('type') as typeof validTypes[number])
    ? (searchParams.get('type') as 'expenses' | 'income')
    : 'expenses';
  const activeTab: string | null = validTabs.includes(searchParams.get('tab') || '')
    ? searchParams.get('tab')
    : validTabs.includes(storedActiveTab) ? storedActiveTab : 'cashflow';

  // Sync URL params on mount if they're missing
  useEffect(() => {
    const hasTimeRange = searchParams.has('timeRange');
    const hasType = searchParams.has('type');
    const hasTab = searchParams.has('tab');
    if (!hasTimeRange || !hasType || !hasTab) {
      setSearchParams((prev) => {
        if (!hasTimeRange) prev.set('timeRange', timeRange);
        if (!hasType) prev.set('type', categoryView);
        if (!hasTab) prev.set('tab', activeTab || 'cashflow');
        return prev;
      }, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setTimeRange = useCallback((range: string) => {
    setSearchParams((prev) => { prev.set('timeRange', range); return prev; }, { replace: true });
    setStoredTimeRange(range);
  }, [setSearchParams, setStoredTimeRange]);

  const setCategoryView = useCallback((view: 'expenses' | 'income') => {
    setSearchParams((prev) => { prev.set('type', view); return prev; }, { replace: true });
  }, [setSearchParams]);

  const setActiveTab = useCallback((tab: string | null) => {
    const value = tab || 'cashflow';
    setSearchParams((prev) => { prev.set('tab', value); return prev; }, { replace: true });
    setStoredActiveTab(value);
  }, [setSearchParams, setStoredActiveTab]);

  const resetFilters = useCallback(() => {
    setSearchParams((prev) => {
      prev.set('timeRange', 'yearToDate');
      prev.set('type', 'expenses');
      prev.set('tab', 'cashflow');
      return prev;
    }, { replace: true });
    resetStoredFilters();
  }, [setSearchParams, resetStoredFilters]);

  // Calculate date ranges based on selected option
  const { startDate, endDate, startMonth, endMonth } = getDateRange(timeRange);

  // Fetch all report data
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

  // Fetch categories for standardized calculations
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: api.getCategories,
  });

  // Fetch budget data for comparison dashboards
  const { data: budgetMonthlyData, isLoading: budgetLoading } = useQuery({
    queryKey: ['budgetComparison', startMonth, endMonth],
    queryFn: async () => {
      const months = [];
      const [startYear, startMonthNum] = startMonth.split('-').map(Number);
      const [endYear, endMonthNum] = endMonth.split('-').map(Number);

      let currentMonth = new Date(startYear, startMonthNum - 1, 1);
      const endMonthDate = new Date(endYear, endMonthNum - 1, 1);

      while (currentMonth <= endMonthDate) {
        months.push(format(currentMonth, 'yyyy-MM'));
        currentMonth = addMonths(currentMonth, 1);
      }

      const budgetPromises = months.map(async monthStr => {
        try {
          const budgetData = await api.getMonthlyBudgets(monthStr);
          return {
            monthKey: monthStr,
            month: budgetData.month,
            budgets: budgetData.budgets,
            total: budgetData.total
          };
        } catch {
          return { monthKey: monthStr, month: monthStr, budgets: [], total: 0 };
        }
      });

      return await Promise.all(budgetPromises);
    },
  });

  // Process spending trends by month with consistent timeline
  const spendingTrendsData = useMemo(() => {
    const expectedMonths = [];
    const [startYear, startMonthNum] = startMonth.split('-').map(Number);
    const [endYear, endMonthNum] = endMonth.split('-').map(Number);
    const startMonthDate = new Date(startYear, startMonthNum - 1, 1);
    const endMonthDate = new Date(endYear, endMonthNum - 1, 1);

    let currentMonth = startMonthDate;
    while (currentMonth <= endMonthDate) {
      expectedMonths.push(format(currentMonth, 'yyyy-MM'));
      currentMonth = addMonths(currentMonth, 1);
    }

    const trendsByMonth = new Map<string, { [category: string]: number }>();
    trendsData?.trends?.forEach(trend => {
      if (!trendsByMonth.has(trend.month)) {
        trendsByMonth.set(trend.month, {});
      }
      const monthData = trendsByMonth.get(trend.month)!;
      monthData[trend.categoryName] = trend.amount;
    });

    const allCategories = new Set<string>();
    trendsData?.trends?.forEach(trend => allCategories.add(trend.categoryName));

    return expectedMonths.map(month => {
      const monthData = trendsByMonth.get(month) || {};
      const [year, monthNum] = month.split('-').map(Number);
      const result: { month: string; [category: string]: number | string } = {
        month: format(new Date(year, monthNum - 1, 1), 'MMM'),
      };
      allCategories.forEach(category => {
        result[category] = monthData[category] || 0;
      });
      return result;
    });
  }, [trendsData, startMonth, endMonth]);

  // Get unique categories for the trends chart (limit to top 8 for visibility)
  const categoryNames = useMemo(() => {
    const uniqueCategories = new Set<string>();
    trendsData?.trends?.forEach(trend => uniqueCategories.add(trend.categoryName));
    return Array.from(uniqueCategories).slice(0, 8);
  }, [trendsData]);

  // Process budget vs actual data for cashflow and spending tab charts
  const budgetVsActualData = useMemo(() => {
    if (!budgetMonthlyData || !cashFlowData?.summary || !categories) return null;

    const result = budgetMonthlyData.map(monthData => {
      const cashFlowMonth = cashFlowData.summary?.find(cf => cf.month === monthData.month);
      const budgetTotals = monthData.budgets.length > 0
        ? calculateBudgetTotals(monthData.budgets, categories, { excludeHidden: false })
        : { income: 0, expense: 0 };

      return {
        month: (() => {
          const [year, monthNum] = monthData.month.split('-').map(Number);
          return format(new Date(year, monthNum - 1, 1), 'MMM');
        })(),
        budgetedIncome: budgetTotals.income,
        actualIncome: cashFlowMonth?.income || 0,
        budgetedExpenses: budgetTotals.expense,
        actualExpenses: cashFlowMonth?.expenses || 0,
        budgetedNetFlow: budgetTotals.income - budgetTotals.expense,
        actualNetFlow: cashFlowMonth?.netFlow || 0,
        budgets: monthData.budgets
      };
    }).sort((a, b) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months.indexOf(a.month) - months.indexOf(b.month);
    });

    return result;
  }, [budgetMonthlyData, cashFlowData, categories]);

  // Process cashflow chart data with a consistent month timeline
  const cashFlowChartData = useMemo(() => {
    const expectedMonths = [];
    const [startYear, startMonthNum] = startMonth.split('-').map(Number);
    const [endYear, endMonthNum] = endMonth.split('-').map(Number);
    const startMonthDate = new Date(startYear, startMonthNum - 1, 1);
    const endMonthDate = new Date(endYear, endMonthNum - 1, 1);

    let currentMonth = startMonthDate;
    while (currentMonth <= endMonthDate) {
      expectedMonths.push(format(currentMonth, 'yyyy-MM'));
      currentMonth = addMonths(currentMonth, 1);
    }

    const dataMap = new Map();
    cashFlowData?.summary?.forEach(item => {
      dataMap.set(item.month, { income: item.income, expenses: item.expenses, netFlow: item.netFlow });
    });

    return expectedMonths.map(month => {
      const [year, monthNum] = month.split('-').map(Number);
      return {
        month: format(new Date(year, monthNum - 1, 1), 'MMM'),
        income: dataMap.get(month)?.income || 0,
        expenses: dataMap.get(month)?.expenses || 0,
        netFlow: dataMap.get(month)?.netFlow || 0,
      };
    });
  }, [cashFlowData, startMonth, endMonth]);

  // Compute KPI summary from cash flow data (respects date filter)
  const kpiSummary = useMemo(() => {
    if (!cashFlowData?.summary) return null;
    const months = cashFlowData.summary;
    const totalIncome = months.reduce((sum, m) => sum + m.income, 0);
    const totalExpenses = months.reduce((sum, m) => sum + m.expenses, 0);
    const netIncome = totalIncome - totalExpenses;
    const now = new Date();
    const currentMonth = format(now, 'yyyy-MM');
    const completeMonths = months.filter(m => m.month < currentMonth && (m.income > 0 || m.expenses > 0));
    const monthCount = completeMonths.length || 1;
    const averageMonthlyIncome = completeMonths.reduce((sum, m) => sum + m.income, 0) / monthCount;
    const averageMonthlyExpenses = completeMonths.reduce((sum, m) => sum + m.expenses, 0) / monthCount;
    const savingsRate = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;
    return { totalIncome, totalExpenses, netIncome, averageMonthlyIncome, averageMonthlyExpenses, savingsRate };
  }, [cashFlowData]);

  // Dynamic label for KPI cards based on time range
  const timeRangeLabel = useMemo(() => {
    const labels: Record<string, string> = {
      thisMonth: 'This Month', lastMonth: 'Last Month', yearToDate: 'YTD',
      thisYear: 'Full Year', last3: 'Last 3 Mo', last6: 'Last 6 Mo', last12: 'Last 12 Mo',
    };
    return labels[timeRange] || 'Period';
  }, [timeRange]);

  const isLoading = cashFlowLoading || trendsLoading || breakdownLoading || projectionsLoading || budgetLoading;

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>Financial Reports</Title>
          <Group gap="xs">
            <Select
              value={timeRange}
              onChange={(value) => setTimeRange(value || 'yearToDate')}
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
            <Tooltip label="Reset to default (Year to Date)">
              <ActionIcon
                variant="subtle"
                onClick={() => {
                  resetFilters();
                  notifications.show({
                    title: 'View Reset',
                    message: 'Reset to Year to Date view',
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

        <ReportsKpiCards kpiSummary={kpiSummary} timeRangeLabel={timeRangeLabel} />

        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="cashflow" leftSection={<IconCash size={16} />}>Cash Flow</Tabs.Tab>
            <Tabs.Tab value="spending" leftSection={<IconChartBar size={16} />}>Spending Trends</Tabs.Tab>
            <Tabs.Tab value="categories" leftSection={<IconChartPie size={16} />}>Categories</Tabs.Tab>
            <Tabs.Tab value="projections" leftSection={<IconTrendingUp size={16} />}>Projections</Tabs.Tab>
            <Tabs.Tab value="budgets" leftSection={<IconTarget size={16} />}>Budgets</Tabs.Tab>
            <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>Settings</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="cashflow" pt="xl">
            <CashflowSection
              cashFlowChartData={cashFlowChartData}
              budgetVsActualData={budgetVsActualData}
            />
          </Tabs.Panel>

          <Tabs.Panel value="spending" pt="xl">
            <SpendingTrendsSection
              spendingTrendsData={spendingTrendsData}
              categoryNames={categoryNames}
              budgetVsActualData={budgetVsActualData}
            />
          </Tabs.Panel>

          <Tabs.Panel value="categories" pt="xl">
            <CategoryBreakdownSection
              breakdownData={breakdownData}
              categoryView={categoryView}
              setCategoryView={setCategoryView}
              startDate={startDate}
              endDate={endDate}
              timeRange={timeRange}
            />
          </Tabs.Panel>

          <Tabs.Panel value="projections" pt="xl">
            <ProjectionsSection projectionsData={projectionsData} />
          </Tabs.Panel>

          <Tabs.Panel value="budgets" pt="xl">
            <BudgetPerformanceSection
              budgetMonthlyData={budgetMonthlyData}
              budgetLoading={budgetLoading}
              trendsLoading={trendsLoading}
              trendsData={trendsData}
              categories={categories}
              startDate={startDate}
              endDate={endDate}
              timeRange={timeRange}
            />
          </Tabs.Panel>

          <Tabs.Panel value="settings" pt="xl">
            <Paper withBorder p="md">
              <Text size="lg" fw={600} mb="md">Report Settings</Text>
              <Text size="sm" c="dimmed" mb="lg">
                Configure manual income and expense totals for historical months where transaction data is incomplete.
              </Text>
              <ReportSettings />
            </Paper>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
