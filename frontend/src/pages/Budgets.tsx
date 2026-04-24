import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBudgetFilters } from '../hooks/usePersistedFilters';
import {
  Container,
  Title,
  Paper,
  Group,
  Stack,
  Loader,
  Center,
  ActionIcon,
  Tooltip,
  Tabs,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconChartBar,
  IconChevronLeft,
  IconChevronRight,
  IconRefresh,
  IconFilterOff,
  IconCalendar,
} from '@tabler/icons-react';
import { format, addMonths, subMonths, startOfMonth } from 'date-fns';
import { api } from '../lib/api';
import { YearlyBudgetGrid } from '../components/budgets/YearlyBudgetGrid';
import { BudgetVsActualsII } from '../components/budgets/BudgetVsActualsII/BudgetVsActualsII';

export function Budgets() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Use persisted filters from localStorage as fallback
  const {
    selectedDate: storedDate,
    activeTab: storedActiveTab,
    setSelectedDate: setStoredDate,
    setActiveTab: setStoredActiveTab,
    resetFilters: resetStoredFilters,
  } = useBudgetFilters();

  // URL params are source of truth, falling back to localStorage
  const selectedDate = useMemo(() => {
    const monthParam = searchParams.get('month');
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [year, month] = monthParam.split('-').map(Number);
      return new Date(year, month - 1, 1);
    }
    return storedDate;
  }, [searchParams, storedDate]);

  const activeTab = searchParams.get('view') || storedActiveTab;

  // Sync URL params on mount if they're missing (populate from localStorage)
  useEffect(() => {
    const monthParam = searchParams.get('month');
    const viewParam = searchParams.get('view');
    if (!monthParam || !viewParam) {
      setSearchParams((prev) => {
        if (!monthParam) prev.set('month', format(selectedDate, 'yyyy-MM'));
        if (!viewParam) prev.set('view', activeTab);
        return prev;
      }, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update both URL and localStorage when date changes
  const handleDateChange = useCallback((date: Date | string) => {
    let dateObj: Date;
    if (typeof date === 'string') {
      const [year, month, day] = date.split('-').map(Number);
      dateObj = new Date(year, month - 1, day || 1);
    } else {
      dateObj = date;
    }

    setSearchParams((prev) => {
      prev.set('month', format(dateObj, 'yyyy-MM'));
      return prev;
    }, { replace: true });
    setStoredDate(dateObj);
  }, [setSearchParams, setStoredDate]);

  const setActiveTab = useCallback((tab: string) => {
    setSearchParams((prev) => {
      prev.set('view', tab);
      return prev;
    }, { replace: true });
    setStoredActiveTab(tab);
  }, [setSearchParams, setStoredActiveTab]);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const queryClient = useQueryClient();

  const selectedMonth = format(selectedDate, 'yyyy-MM');

  // Fetch categories (consumed by YearlyBudgetGrid; BvA II fetches its own)
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  });

  // Fetch yearly budgets
  const { data: yearlyBudgetData, isLoading: yearlyBudgetsLoading } = useQuery({
    queryKey: ['budgets', 'year', selectedYear],
    queryFn: () => api.getYearlyBudgets(selectedYear),
    enabled: activeTab === 'yearly',
  });

  const handlePreviousMonth = (): void => {
    handleDateChange(subMonths(selectedDate, 1));
  };

  const handleNextMonth = (): void => {
    handleDateChange(addMonths(selectedDate, 1));
  };

  const handlePreviousYear = (): void => {
    setSelectedYear(selectedYear - 1);
  };

  const handleNextYear = (): void => {
    setSelectedYear(selectedYear + 1);
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>Monthly Budget</Title>
        </Group>

        <Paper p="md" shadow="xs">
          <Group justify="space-between" mb="md">
            <Group>
              <ActionIcon onClick={handlePreviousMonth} size="lg" variant="default">
                <IconChevronLeft size={16} />
              </ActionIcon>

              <MonthPickerInput
                value={selectedDate}
                onChange={(date) => {
                  if (date) {
                    handleDateChange(date);
                  }
                }}
                size="md"
                styles={{ input: { width: 200, textAlign: 'center' } }}
                clearable={false}
                popoverProps={{ withinPortal: true }}
              />

              <ActionIcon onClick={handleNextMonth} size="lg" variant="default">
                <IconChevronRight size={16} />
              </ActionIcon>
            </Group>

            <Group>
              <Tooltip label="Refresh data">
                <ActionIcon
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['budgets'] })}
                  size="lg"
                  variant="default"
                >
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Reset to current month">
                <ActionIcon
                  onClick={() => {
                    const currentMonth = startOfMonth(new Date());
                    handleDateChange(currentMonth);
                    setActiveTab('bva-ii');
                    resetStoredFilters();
                    notifications.show({
                      title: 'View Reset',
                      message: 'Reset to current month view',
                      color: 'blue',
                    });
                  }}
                  size="lg"
                  variant="default"
                >
                  <IconFilterOff size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'bva-ii')}>
            <Tabs.List>
              <Tabs.Tab value="bva-ii" leftSection={<IconChartBar size={16} />}>
                Budget vs. Actuals
              </Tabs.Tab>
              <Tabs.Tab value="yearly" leftSection={<IconCalendar size={16} />}>
                Yearly View
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="yearly" pt="md">
              {yearlyBudgetsLoading ? (
                <Center h={400}>
                  <Loader size="lg" />
                </Center>
              ) : (
                <YearlyBudgetGrid
                  budgets={yearlyBudgetData?.budgets || []}
                  categories={categories || []}
                  year={selectedYear}
                  isLoading={yearlyBudgetsLoading}
                  onPreviousYear={handlePreviousYear}
                  onNextYear={handleNextYear}
                  onResetYear={() => {
                    setSelectedYear(new Date().getFullYear());
                    notifications.show({
                      title: 'View Reset',
                      message: 'Reset to current year view',
                      color: 'blue',
                    });
                  }}
                />
              )}
            </Tabs.Panel>

            <Tabs.Panel value="bva-ii" pt="md">
              <BudgetVsActualsII selectedMonth={selectedMonth} active={activeTab === 'bva-ii'} />
            </Tabs.Panel>
          </Tabs>
        </Paper>
      </Stack>
    </Container>
  );
}
