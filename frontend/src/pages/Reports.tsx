import { useState, useMemo, useEffect, useRef } from 'react';
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
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear, addMonths } from 'date-fns';
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

// Type for hidden categories state
interface HiddenCategoriesState {
  [categoryId: string]: boolean;
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
  isOther?: boolean; // Special flag for "Other" category
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
  
  // State for hidden categories in pie chart
  const [hiddenCategories, setHiddenCategories] = useState<HiddenCategoriesState>({});
  
  // State for storing categories that are grouped into "Other"
  const [otherCategories, setOtherCategories] = useState<ProcessedParentData[]>([]);
  
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

  // Fetch budget data for comparison dashboards
  const { data: budgetMonthlyData, isLoading: budgetLoading } = useQuery({
    queryKey: ['budgetComparison', startMonth, endMonth],
    queryFn: async () => {
      // Get budget data for each month in range
      const months = [];
      let currentMonth = new Date(startMonth + '-01');
      const endMonthDate = new Date(endMonth + '-01');
      
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
        } catch (error) {
          return { monthKey: monthStr, month: monthStr, budgets: [], total: 0 };
        }
      });
      
      return await Promise.all(budgetPromises);
    },
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
  
  // Calculate pie chart data and other categories in one go
  const { pieChartData: calculatedPieChartData, otherCategoriesData } = useMemo(() => {
    if (drillDownState.level === 'parent') {
      // Check if we're viewing the "Other" breakdown
      if (drillDownState.parentId === 'other') {
        // Show pie of just the "other" categories with percentages relative to "other" total
        const otherTotal = otherCategories.reduce((sum, cat) => sum + cat.value, 0);
        return {
          pieChartData: otherCategories
            .filter((item: ProcessedParentData) => !hiddenCategories[item.id])
            .map((item: ProcessedParentData) => ({
              id: item.id,
              name: item.name,
              value: item.value,
              percentage: otherTotal > 0 ? (item.value / otherTotal) * 100 : 0,
              clickable: item.hasChildren,
              hasChildren: item.hasChildren,
              childCount: item.childCount
            })),
          otherCategoriesData: otherCategories
        };
      }
      
      // Normal parent view - implement 90% threshold logic
      const availableCategories = processedCategoryData.parentData.filter((item: ProcessedParentData) => !hiddenCategories[item.id]);
      
      if (availableCategories.length === 0) {
        return { pieChartData: [], otherCategoriesData: [] };
      }
      
      let cumulativePercentage = 0;
      const threshold = 90;
      const mainSlices: ProcessedParentData[] = [];
      const otherSlices: ProcessedParentData[] = [];
      
      // Accumulate categories until we reach the threshold
      for (const category of availableCategories) {
        if (cumulativePercentage < threshold && mainSlices.length < availableCategories.length - 1) {
          // Add to main slices if under threshold and not the last category
          mainSlices.push(category);
          cumulativePercentage += category.percentage;
        } else {
          // Add remaining categories to "Other"
          otherSlices.push(category);
        }
      }
      
      // If we only have otherSlices (edge case), move some back to mainSlices
      if (mainSlices.length === 0 && otherSlices.length > 0) {
        mainSlices.push(...otherSlices.splice(0, Math.min(3, otherSlices.length)));
      }
      
      const result: PieChartEntry[] = mainSlices.map((item: ProcessedParentData) => ({
        id: item.id,
        name: item.name,
        value: item.value,
        percentage: item.percentage,
        clickable: item.hasChildren,
        hasChildren: item.hasChildren,
        childCount: item.childCount
      }));
      
      // Create "Other" category if we have remaining categories with significant value
      if (otherSlices.length > 1) { // Only create "Other" if there are multiple categories to group
        const otherTotal = otherSlices.reduce((sum, cat) => sum + cat.value, 0);
        const otherPercentage = otherSlices.reduce((sum, cat) => sum + cat.percentage, 0);
        
        // Only create "Other" if it has meaningful value (at least 1% or $1)
        if (otherTotal > 1 && otherPercentage > 1) {
          result.push({
            id: 'other',
            name: `Other (${otherSlices.length} categories)`,
            value: otherTotal,
            percentage: otherPercentage,
            clickable: true,
            hasChildren: true,
            childCount: otherSlices.length,
            isOther: true
          });
        } else {
          // If "Other" would be insignificant, add categories back to main slices
          result.push(...otherSlices.map((item: ProcessedParentData) => ({
            id: item.id,
            name: item.name,
            value: item.value,
            percentage: item.percentage,
            clickable: item.hasChildren,
            hasChildren: item.hasChildren,
            childCount: item.childCount
          })));
          // Clear otherSlices since we're not creating an "Other" category
          otherSlices.length = 0;
        }
      } else if (otherSlices.length === 1) {
        // If there's only one category in "Other", just add it to main slices
        const item = otherSlices[0];
        result.push({
          id: item.id,
          name: item.name,
          value: item.value,
          percentage: item.percentage,
          clickable: item.hasChildren,
          hasChildren: item.hasChildren,
          childCount: item.childCount
        });
        // Clear otherSlices since we're not creating an "Other" category
        otherSlices.length = 0;
      }
      
      return { pieChartData: result, otherCategoriesData: otherSlices };
    } else {
      // Check if we're viewing the "Other" breakdown in child view
      if (drillDownState.parentId === 'other-child') {
        // Show pie of just the "other" child categories with percentages relative to "other" total
        const otherTotal = otherCategories.reduce((sum, cat) => sum + cat.value, 0);
        return {
          pieChartData: otherCategories
            .filter((item: ProcessedParentData) => !hiddenCategories[item.id])
            .map((item: ProcessedParentData) => ({
              id: item.id,
              name: item.name,
              value: item.value,
              percentage: otherTotal > 0 ? (item.value / otherTotal) * 100 : 0,
              clickable: false, // Child categories are not clickable for further drill-down
              hasChildren: false,
              childCount: 0
            })),
          otherCategoriesData: otherCategories
        };
      }
      
      // Show children of selected parent with "Other" category logic
      const children = processedCategoryData.childData.get(drillDownState.parentId || '') || [];
      const availableChildren = children.filter((child: ProcessedChildData) => !hiddenCategories[child.id]);
      
      if (availableChildren.length === 0) {
        return { pieChartData: [], otherCategoriesData: [] };
      }
      
      // Apply 90% threshold logic to child categories too
      let cumulativePercentage = 0;
      const threshold = 90;
      const mainSlices: ProcessedChildData[] = [];
      const otherSlices: ProcessedChildData[] = [];
      
      // Sort children by value descending for consistent ordering
      const sortedChildren = availableChildren.sort((a: ProcessedChildData, b: ProcessedChildData) => b.value - a.value);
      
      // Accumulate categories until we reach the threshold
      for (const child of sortedChildren) {
        if (cumulativePercentage < threshold && mainSlices.length < sortedChildren.length - 1) {
          // Add to main slices if under threshold and not the last category
          mainSlices.push(child);
          cumulativePercentage += child.percentage;
        } else {
          // Add remaining categories to "Other"
          otherSlices.push(child);
        }
      }
      
      // If we only have otherSlices (edge case), move some back to mainSlices
      if (mainSlices.length === 0 && otherSlices.length > 0) {
        mainSlices.push(...otherSlices.splice(0, Math.min(3, otherSlices.length)));
      }
      
      const result: PieChartEntry[] = mainSlices.map((child: ProcessedChildData) => ({
        id: child.id,
        name: child.name,
        value: child.value,
        percentage: child.percentage,
        clickable: false, // Children are not clickable for drill-down
        hasChildren: false
      }));
      
      // Create "Other" category if we have remaining children with significant value
      if (otherSlices.length > 1) { // Only create "Other" if there are multiple categories to group
        const otherTotal = otherSlices.reduce((sum, cat) => sum + cat.value, 0);
        const otherPercentage = otherSlices.reduce((sum, cat) => sum + cat.percentage, 0);
        
        // Only create "Other" if it has meaningful value (at least 1% or $1)
        if (otherTotal > 1 && otherPercentage > 1) {
          result.push({
            id: 'other-child',
            name: `Other (${otherSlices.length} categories)`,
            value: otherTotal,
            percentage: otherPercentage,
            clickable: true,
            hasChildren: true,
            childCount: otherSlices.length,
            isOther: true
          });
        } else {
          // If "Other" would be insignificant, add categories back to main slices
          result.push(...otherSlices.map((child: ProcessedChildData) => ({
            id: child.id,
            name: child.name,
            value: child.value,
            percentage: child.percentage,
            clickable: false,
            hasChildren: false
          })));
          // Clear otherSlices since we're not creating an "Other" category
          otherSlices.length = 0;
        }
      } else if (otherSlices.length === 1) {
        // If there's only one category in "Other", just add it to main slices
        const child = otherSlices[0];
        result.push({
          id: child.id,
          name: child.name,
          value: child.value,
          percentage: child.percentage,
          clickable: false,
          hasChildren: false
        });
        // Clear otherSlices since we're not creating an "Other" category
        otherSlices.length = 0;
      }
      
      // Convert otherSlices to the format expected by otherCategoriesData
      const otherCategoriesForChild = otherSlices.map(child => ({
        id: child.id,
        name: child.name,
        value: child.value,
        percentage: child.percentage,
        hasChildren: false,
        childCount: 0
      }));
      
      return { pieChartData: result, otherCategoriesData: otherCategoriesForChild };
    }
  }, [drillDownState, processedCategoryData, hiddenCategories, otherCategories]);
  
  // Use a ref to track the current other categories to prevent unnecessary state updates
  const otherCategoriesRef = useRef<ProcessedParentData[]>([]);
  
  // Update otherCategories state only when the data actually changes
  useEffect(() => {
    // Compare array contents, not references
    const hasChanged = otherCategoriesData.length !== otherCategoriesRef.current.length ||
      otherCategoriesData.some((item, index) => 
        !otherCategoriesRef.current[index] || 
        item.id !== otherCategoriesRef.current[index].id ||
        item.value !== otherCategoriesRef.current[index].value
      );
    
    if (hasChanged) {
      otherCategoriesRef.current = otherCategoriesData;
      setOtherCategories(otherCategoriesData);
    }
  }, [otherCategoriesData]);
  
  // Automatically drill down to subcategories for income view when there's only one parent with few children
  useEffect(() => {
    if (categoryView === 'income' && 
        drillDownState.level === 'parent' && 
        !drillDownState.parentId && // Only when we're at the top level
        processedCategoryData.parentData.length === 1) {
      
      const parentWithChildren = processedCategoryData.parentData[0];
      // Always auto-drill for income since there's typically only one Income parent category
      if (parentWithChildren.hasChildren) {
        setDrillDownState({
          level: 'child',
          parentId: parentWithChildren.id,
          parentName: parentWithChildren.name
        });
      }
    }
  }, [categoryView, processedCategoryData.parentData, drillDownState.level, drillDownState.parentId]);
  
  // Use the calculated pie chart data
  const pieChartData = calculatedPieChartData;

  // Process spending trends by month (moved here to be available for other useMemo hooks)
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

  // Get unique categories for the trends chart (moved here to be available for other useMemo hooks)
  const uniqueCategories = new Set<string>();
  trendsData?.trends?.forEach(trend => uniqueCategories.add(trend.categoryName));
  const categoryNames = Array.from(uniqueCategories).slice(0, 8); // Limit to top 8 for visibility

  // Process budget vs actual data for dashboards
  const budgetVsActualData = useMemo(() => {
    if (!budgetMonthlyData || !cashFlowData?.summary) return null;
    
    return budgetMonthlyData.map(monthData => {
      const cashFlowMonth = cashFlowData.summary?.find(cf => cf.month === monthData.month);
      
      // Calculate total budgeted amounts by type
      const budgetedIncome = monthData.budgets
        .filter((b: any) => b.categoryId?.startsWith('INCOME'))
        .reduce((sum: number, b: any) => sum + b.amount, 0);
      
      const budgetedExpenses = monthData.budgets
        .filter((b: any) => !b.categoryId?.startsWith('INCOME') && !b.categoryId?.includes('TRANSFER'))
        .reduce((sum: number, b: any) => sum + b.amount, 0);
      
      return {
        month: format(new Date(monthData.month + '-01'), 'MMM'),
        budgetedIncome,
        actualIncome: cashFlowMonth?.income || 0,
        budgetedExpenses,
        actualExpenses: cashFlowMonth?.expenses || 0,
        budgetedNetFlow: budgetedIncome - budgetedExpenses,
        actualNetFlow: cashFlowMonth?.netFlow || 0,
        budgets: monthData.budgets
      };
    });
  }, [budgetMonthlyData, cashFlowData]);


  const isLoading = ytdLoading || cashFlowLoading || trendsLoading || breakdownLoading || projectionsLoading || budgetLoading;

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

  
  // Handle pie slice click
  const handleSliceClick = (data: PieChartEntry) => {
    if (drillDownState.level === 'parent') {
      if (data.isOther) {
        // Special handling for "Other" category - drill down to show other categories
        setDrillDownState({
          level: 'parent', // Stay at parent level but show "Other" breakdown
          parentId: 'other',
          parentName: data.name
        });
        setHiddenCategories({}); // Reset hidden categories
      } else if (data.hasChildren) {
        // Normal drill down to subcategories
        setDrillDownState({
          level: 'child',
          parentId: data.id || '',
          parentName: data.name
        });
        setHiddenCategories({}); // Reset hidden categories when drilling down
      }
    } else {
      // In child view
      if (data.id === 'other-child' && data.isOther) {
        // Special handling for "Other" in child view - show breakdown of other child categories
        setDrillDownState({
          level: 'child', // Stay at child level but show "Other" breakdown
          parentId: 'other-child',
          parentName: data.name
        });
        setHiddenCategories({}); // Reset hidden categories
      } else if (data.id) {
        // Normal transaction preview for subcategory
        // Trigger transaction preview by finding and clicking the corresponding legend item
        const legendItems = document.querySelectorAll('[data-category-id="' + data.id + '"]');
        if (legendItems.length > 0) {
          (legendItems[0] as HTMLElement).click();
        }
      }
    }
  };
  
  // Toggle category visibility in pie chart
  const toggleCategoryVisibility = (categoryId: string) => {
    setHiddenCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };
  
  
  // Navigate back to parent view
  const navigateToParent = () => {
    if (drillDownState.parentId === 'other') {
      // If we're in "Other" view, go back to main parent view
      setDrillDownState({ level: 'parent' });
    } else if (drillDownState.parentId === 'other-child') {
      // If we're in "Other" child view, go back to the parent child view
      // We need to get the original parent ID - this is tricky since we don't store it
      // For now, just go back to parent level and let the auto-drill logic handle it
      setDrillDownState({ level: 'parent' });
    } else {
      // If we're in child view, go back to parent view
      setDrillDownState({ level: 'parent' });
    }
    setHiddenCategories({}); // Reset hidden categories when navigating back
  };
  
  // Custom tooltip for pie chart
  const CustomPieTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: PieChartEntry }> }) => {
    if (active && payload && payload[0]) {
      const data = payload[0].payload;
      return (
        <Paper p="xs" withBorder shadow="sm">
          <Text size="sm" fw={600}>{data.name}</Text>
          <Text size="xs" c="dimmed">
            ${data.value.toFixed(0)} ({data.percentage.toFixed(1)}%)
          </Text>
        </Paper>
      );
    }
    return null;
  };

  // Custom tooltip for line charts - shows only the hovered line's data
  const CustomLineTooltip = ({ active, payload, label }: { 
    active?: boolean; 
    payload?: Array<{ name: string; value: number; dataKey: string; color: string }>; 
    label?: string 
  }) => {
    if (active && payload && payload.length > 0) {
      // For line charts, recharts typically provides only the data for the line being hovered
      // But if multiple lines are provided, show only the ones with values
      const activeItems = payload.filter(item => item.value > 0);
      if (activeItems.length === 1) {
        const data = activeItems[0];
        return (
          <Paper p="xs" withBorder shadow="sm">
            <Text size="sm" fw={600}>{label}</Text>
            <Text size="xs" c="dimmed">
              {data.dataKey}: ${data.value.toFixed(0)}
            </Text>
          </Paper>
        );
      } else if (activeItems.length > 1) {
        // If multiple categories have values, show them all
        return (
          <Paper p="xs" withBorder shadow="sm">
            <Text size="sm" fw={600}>{label}</Text>
            {activeItems.map((item, index) => (
              <Text key={index} size="xs" c="dimmed">
                {item.dataKey}: ${item.value.toFixed(0)}
              </Text>
            ))}
          </Paper>
        );
      }
    }
    return null;
  };

  // Custom tooltip for area/bar charts
  const CustomAreaTooltip = ({ active, payload, label }: { 
    active?: boolean; 
    payload?: Array<{ name: string; value: number; dataKey: string }>; 
    label?: string 
  }) => {
    if (active && payload && payload.length > 0) {
      // For area/bar charts, show the specific data being hovered
      const activeItems = payload.filter(item => item.value !== undefined && item.value !== null);
      if (activeItems.length === 1) {
        const data = activeItems[0];
        return (
          <Paper p="xs" withBorder shadow="sm">
            <Text size="sm" fw={600}>{label}</Text>
            <Text size="xs" c="dimmed">
              {data.dataKey}: ${data.value.toFixed(0)}
            </Text>
          </Paper>
        );
      } else if (activeItems.length > 1) {
        // Show multiple values if they exist
        return (
          <Paper p="xs" withBorder shadow="sm">
            <Text size="sm" fw={600}>{label}</Text>
            {activeItems.map((item, index) => (
              <Text key={index} size="xs" c="dimmed">
                {item.dataKey}: ${item.value.toFixed(0)}
              </Text>
            ))}
          </Paper>
        );
      }
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
                        <RechartsTooltip content={<CustomAreaTooltip />} />
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


              {/* Budget vs Actual Dashboard */}
              {budgetVsActualData && budgetVsActualData.length > 0 && (
                <Grid.Col span={12}>
                  <Paper withBorder p="md">
                    <Text size="lg" fw={600} mb="md">Planned vs Actual Cash Flow</Text>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={budgetVsActualData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <RechartsTooltip content={<CustomAreaTooltip />} />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="budgetedNetFlow" 
                          stroke="#4f46e5" 
                          fill="#4f46e5" 
                          fillOpacity={0.6}
                          name="Planned Net Flow"
                        />
                        <Area 
                          type="monotone" 
                          dataKey="actualNetFlow" 
                          stroke="#10b981" 
                          fill="#10b981" 
                          fillOpacity={0.6}
                          name="Actual Net Flow"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Paper>
                </Grid.Col>
              )}
            </Grid>
          </Tabs.Panel>

          <Tabs.Panel value="spending" pt="xl">
            <Stack gap="md">
              <Paper withBorder p="md">
                <Text size="lg" fw={600} mb="md">Spending by Category Over Time</Text>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={spendingTrendsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <RechartsTooltip content={<CustomLineTooltip />} />
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

              {/* Budget vs Actual Spending */}
              {budgetVsActualData && budgetVsActualData.length > 0 && (
                <Paper withBorder p="md">
                  <Text size="lg" fw={600} mb="md">Planned vs Actual Spending</Text>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={budgetVsActualData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <RechartsTooltip content={<CustomAreaTooltip />} />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="budgetedExpenses" 
                        stroke="#ef4444" 
                        fill="#ef4444" 
                        fillOpacity={0.6}
                        name="Planned Spending"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="actualExpenses" 
                        stroke="#dc2626" 
                        fill="#dc2626" 
                        fillOpacity={0.6}
                        name="Actual Spending"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="categories" pt="xl">
            <Stack gap="md">
              {/* Income/Expense Toggle */}
              <Group justify="center">
                <SegmentedControl
                  value={categoryView}
                  onChange={(value: string) => {
                    setCategoryView(value as 'expenses' | 'income');
                    // Reset drill-down, hidden categories, and other categories when switching views
                    setDrillDownState({ level: 'parent' });
                    setHiddenCategories({});
                    setOtherCategories([]);
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
                          {categoryView === 'income' ? 'Income' : 'Expense'} Breakdown
                        </Text>
                        {(drillDownState.level === 'child' || drillDownState.parentId === 'other' || drillDownState.parentId === 'other-child') && (
                          <Breadcrumbs mt={4}>
                            <Anchor 
                              size="sm" 
                              onClick={navigateToParent}
                              style={{ cursor: 'pointer' }}
                            >
                              All Categories
                            </Anchor>
                            {drillDownState.parentId === 'other' && (
                              <Text size="sm">{drillDownState.parentName}</Text>
                            )}
                            {drillDownState.parentId === 'other-child' && (
                              <Text size="sm">{drillDownState.parentName}</Text>
                            )}
                            {drillDownState.level === 'child' && drillDownState.parentId !== 'other' && drillDownState.parentId !== 'other-child' && (
                              <Text size="sm">{drillDownState.parentName}</Text>
                            )}
                          </Breadcrumbs>
                        )}
                      </div>
                      {(drillDownState.level === 'child' || drillDownState.parentId === 'other' || drillDownState.parentId === 'other-child') && (
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
                      <RechartsTooltip content={<CustomPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Legend */}
                  <SimpleGrid cols={2} spacing="xs" mt="md">
                    {/* Show all categories for current view level, including hidden ones */}
                    {(() => {
                      if (drillDownState.level === 'parent' && drillDownState.parentId === 'other') {
                        // Show "other" categories
                        return otherCategories;
                      } else if (drillDownState.level === 'parent') {
                        // Show main parent categories (now dynamically calculated based on pieChartData)
                        return pieChartData.filter((item: PieChartEntry) => !item.isOther).map((item: PieChartEntry) => {
                          // Find the original category data
                          const originalCategory = processedCategoryData.parentData.find(cat => cat.id === item.id);
                          return originalCategory || {
                            id: item.id || '',
                            name: item.name,
                            value: item.value,
                            percentage: item.percentage,
                            hasChildren: item.hasChildren || false,
                            childCount: item.childCount || 0
                          };
                        }).concat(
                          // Add "Other" category if it exists in pieChartData
                          pieChartData.filter((item: PieChartEntry) => item.isOther).map((item: PieChartEntry) => ({
                            id: 'other',
                            name: item.name,
                            value: item.value,
                            percentage: item.percentage,
                            hasChildren: true,
                            childCount: item.childCount || 0
                          }))
                        );
                      } else {
                        // Child view
                        return processedCategoryData.childData.get(drillDownState.parentId || '') || [];
                      }
                    })().map((entry: ProcessedParentData | ProcessedChildData | { id: string; name: string; value: number; percentage: number; hasChildren: boolean; childCount: number }, index: number) => {
                      const isHidden = hiddenCategories[entry.id];
                      const isSubcategory = drillDownState.level === 'child';
                      
                      return (
                        <Group 
                          key={entry.id || entry.name}
                          gap="xs" 
                          style={{ 
                            borderRadius: 'var(--mantine-radius-sm)', 
                            padding: '4px',
                            cursor: 'pointer',
                            opacity: isHidden ? 0.5 : 1,
                            transition: 'opacity 0.2s'
                          }}
                          onClick={() => {
                            if (isSubcategory) {
                              // For subcategories, open transaction preview
                              const previewElement = document.querySelector(`[data-category-id="${entry.id}"]`);
                              if (previewElement) {
                                (previewElement as HTMLElement).click();
                              }
                            } else if (entry.id === 'other') {
                              // For "Other" category, don't toggle visibility (it's synthetic)
                              // Could add special handling here if needed
                            } else {
                              // For regular parent categories, toggle visibility
                              toggleCategoryVisibility(entry.id);
                            }
                          }}
                        >
                          <div
                            style={{
                              width: 12,
                              height: 12,
                              backgroundColor: COLORS[index % COLORS.length],
                              borderRadius: 2,
                              border: isHidden ? '2px solid transparent' : 'none',
                              opacity: isHidden ? 0.3 : 1
                            }}
                          />
                          <Text 
                            size="sm" 
                            truncate
                            td={isHidden ? 'line-through' : 'none'}
                          >
                            {entry.name}
                          </Text>
                          {!isSubcategory && entry.id !== 'other' && (
                            <Text size="xs" c="dimmed">
                              {isHidden ? 'Show' : 'Hide'}
                            </Text>
                          )}
                        </Group>
                      );
                    })}
                    
                    {/* Hidden transaction preview triggers for subcategories */}
                    {drillDownState.level === 'child' && 
                      (processedCategoryData.childData.get(drillDownState.parentId || '') || []).map((entry: ProcessedChildData) => (
                        <TransactionPreviewTrigger
                          key={`hidden-${entry.id}`}
                          categoryId={entry.id}
                          categoryName={entry.name}
                          dateRange={{ startDate, endDate }}
                          tooltipText="Click to preview transactions"
                          timeRangeFilter={timeRange}
                        >
                          <div 
                            data-category-id={entry.id}
                            style={{ display: 'none' }}
                          />
                        </TransactionPreviewTrigger>
                      ))
                    }
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
                      pieChartData.slice(0, 10).map((category: PieChartEntry, index: number) => (
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
                      ytd?.topCategories.slice(0, 10).map((category, index) => (
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
                      <RechartsTooltip content={<CustomAreaTooltip />} />
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