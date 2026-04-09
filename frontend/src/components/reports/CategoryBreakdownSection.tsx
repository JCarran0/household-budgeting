import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Grid,
  Paper,
  Text,
  Stack,
  Group,
  SimpleGrid,
  Progress,
  ActionIcon,
  Breadcrumbs,
  Anchor,
  SegmentedControl,
} from '@mantine/core';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  IconArrowLeft,
} from '@tabler/icons-react';
import { TransactionPreviewTrigger } from '../transactions';
import { defaultPalette } from '../../theme';

// Color palette for charts — sourced from centralized color config
const COLORS = defaultPalette.chart.series;

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
  isOther?: boolean;
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

interface BreakdownItem {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  subcategories?: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
  }>;
}

interface BreakdownData {
  breakdown: BreakdownItem[];
}

interface CustomPieTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PieChartEntry }>;
}

function CustomPieTooltip({ active, payload }: CustomPieTooltipProps) {
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
}

interface CategoryBreakdownSectionProps {
  breakdownData: BreakdownData | undefined;
  categoryView: 'expenses' | 'income';
  setCategoryView: (view: 'expenses' | 'income') => void;
  startDate: string;
  endDate: string;
  timeRange: string;
}

export function CategoryBreakdownSection({
  breakdownData,
  categoryView,
  setCategoryView,
  startDate,
  endDate,
  timeRange,
}: CategoryBreakdownSectionProps) {
  // Drill-down state for category breakdown
  const [drillDownState, setDrillDownState] = useState<DrillDownState>({
    level: 'parent'
  });

  // State for hidden categories in pie chart
  const [hiddenCategories, setHiddenCategories] = useState<HiddenCategoriesState>({});

  // State for storing categories that are grouped into "Other"
  const [otherCategories, setOtherCategories] = useState<ProcessedParentData[]>([]);

  // Process and aggregate category data for drill-down
  const processedCategoryData = useMemo(() => {
    if (!breakdownData?.breakdown) return { parentData: [], childData: new Map<string, ProcessedChildData[]>() };

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
          mainSlices.push(category);
          cumulativePercentage += category.percentage;
        } else {
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
      if (otherSlices.length > 1) {
        const otherTotal = otherSlices.reduce((sum, cat) => sum + cat.value, 0);
        const otherPercentage = otherSlices.reduce((sum, cat) => sum + cat.percentage, 0);

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
          otherSlices.length = 0;
        }
      } else if (otherSlices.length === 1) {
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
        otherSlices.length = 0;
      }

      return { pieChartData: result, otherCategoriesData: otherSlices };
    } else {
      // Check if we're viewing the "Other" breakdown in child view
      if (drillDownState.parentId === 'other-child') {
        const otherTotal = otherCategories.reduce((sum, cat) => sum + cat.value, 0);
        return {
          pieChartData: otherCategories
            .filter((item: ProcessedParentData) => !hiddenCategories[item.id])
            .map((item: ProcessedParentData) => ({
              id: item.id,
              name: item.name,
              value: item.value,
              percentage: otherTotal > 0 ? (item.value / otherTotal) * 100 : 0,
              clickable: false,
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

      for (const child of sortedChildren) {
        if (cumulativePercentage < threshold && mainSlices.length < sortedChildren.length - 1) {
          mainSlices.push(child);
          cumulativePercentage += child.percentage;
        } else {
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
        clickable: false,
        hasChildren: false
      }));

      // Create "Other" category if we have remaining children with significant value
      if (otherSlices.length > 1) {
        const otherTotal = otherSlices.reduce((sum, cat) => sum + cat.value, 0);
        const otherPercentage = otherSlices.reduce((sum, cat) => sum + cat.percentage, 0);

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
          result.push(...otherSlices.map((child: ProcessedChildData) => ({
            id: child.id,
            name: child.name,
            value: child.value,
            percentage: child.percentage,
            clickable: false,
            hasChildren: false
          })));
          otherSlices.length = 0;
        }
      } else if (otherSlices.length === 1) {
        const child = otherSlices[0];
        result.push({
          id: child.id,
          name: child.name,
          value: child.value,
          percentage: child.percentage,
          clickable: false,
          hasChildren: false
        });
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
        !drillDownState.parentId &&
        processedCategoryData.parentData.length === 1) {

      const parentWithChildren = processedCategoryData.parentData[0];
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

  // Handle pie slice click
  const handleSliceClick = (data: PieChartEntry) => {
    if (drillDownState.level === 'parent') {
      if (data.isOther) {
        setDrillDownState({
          level: 'parent',
          parentId: 'other',
          parentName: data.name
        });
        setHiddenCategories({});
      } else if (data.hasChildren) {
        setDrillDownState({
          level: 'child',
          parentId: data.id || '',
          parentName: data.name
        });
        setHiddenCategories({});
      }
    } else {
      if (data.id === 'other-child' && data.isOther) {
        setDrillDownState({
          level: 'child',
          parentId: 'other-child',
          parentName: data.name
        });
        setHiddenCategories({});
      } else if (data.id) {
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
    setDrillDownState({ level: 'parent' });
    setHiddenCategories({});
  };

  return (
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
                  fill={defaultPalette.chart.barFill}
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
                  return otherCategories;
                } else if (drillDownState.level === 'parent') {
                  return pieChartData.filter((item: PieChartEntry) => !item.isOther).map((item: PieChartEntry) => {
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
                        const previewElement = document.querySelector(`[data-category-id="${entry.id}"]`);
                        if (previewElement) {
                          (previewElement as HTMLElement).click();
                        }
                      } else if (entry.id === 'other') {
                        // For "Other" category, don't toggle visibility (it's synthetic)
                      } else {
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
                // Show top spending categories from current breakdown data
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
              )}
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
