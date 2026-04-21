import { Fragment, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Center,
  Chip,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  IconChevronRight,
  IconEdit,
  IconX,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, parse } from 'date-fns';
import { api } from '../../../lib/api';
import type { Category } from '../../../../../shared/types';
import { composeBvaII } from '../../../../../shared/utils/bvaIIDataComposition';
import {
  SECTION_LABEL,
  SECTION_ORDER,
  getSectionType,
  getVarianceTone,
  type SectionType,
  type VarianceTone,
} from '../../../../../shared/utils/bvaIIDisplay';
import {
  classifyTreeVariance,
  type VarianceFilter,
} from '../../../../../shared/utils/bvaIIFilters';
import { formatCurrency } from '../../../utils/formatters';
import { CATEGORY_TYPES, useBvaIIUrlState, type CategoryTypeFilter } from './useBvaIIUrlState';
import { useDismissedParentIds } from './useDismissedParentIds';
import type { TreeAggregation } from '../../../../../shared/utils/budgetCalculations';

interface BudgetVsActualsIIProps {
  /** Currently-selected month, shared with the parent Budgets page. YYYY-MM. */
  selectedMonth: string;
  /** Whether this tab is currently active. Gates fetches + expensive compute. */
  active: boolean;
}

interface FilteredTree {
  tree: TreeAggregation;
  section: SectionType;
  autoExpand: boolean;
  deEmphasizedChildIds: Set<string>;
}

interface FilteredSection {
  section: SectionType;
  trees: FilteredTree[];
}

function toneMantineColor(tone: VarianceTone): string | undefined {
  if (tone === 'favorable') return 'green';
  if (tone === 'unfavorable') return 'red';
  return undefined;
}

/** Signed variance formatter — never flips sign by section (REQ-032). */
function formatSignedVariance(variance: number): string {
  if (variance > 0) return `+${formatCurrency(variance)}`;
  if (variance < 0) return `−${formatCurrency(Math.abs(variance))}`;
  return formatCurrency(0);
}

/** A11y pair for color — icon carries direction for colorblind users (REQ-051). */
function toneIcon(tone: VarianceTone) {
  if (tone === 'favorable') return <IconTrendingUp size={14} />;
  if (tone === 'unfavorable') return <IconTrendingDown size={14} />;
  return <IconMinus size={14} />;
}

/**
 * BvA II — accordion-first, rollover-aware Budget vs. Actuals view.
 *
 * @see BUDGET-VS-ACTUALS-II-BRD.md
 */
export function BudgetVsActualsII({ selectedMonth, active }: BudgetVsActualsIIProps) {
  const urlState = useBvaIIUrlState();
  const dismissed = useDismissedParentIds();
  // Session-only accordion expand state (REQ-007). Not URL-persisted.
  // The effective expand state layers user-overrides on top of filter
  // auto-expand suggestions — see buildEffectiveExpanded below.
  const [userExpanded, setUserExpanded] = useState<Map<string, boolean>>(new Map());

  const selectedYear = Number(selectedMonth.slice(0, 4));
  const isJanuary = selectedMonth.slice(5, 7) === '01';
  const selectedDate = useMemo(
    () => parse(`${selectedMonth}-01`, 'yyyy-MM-dd', new Date()),
    [selectedMonth],
  );
  const ytdEnd = useMemo(() => format(endOfMonth(selectedDate), 'yyyy-MM-dd'), [selectedDate]);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: active,
  });

  const { data: yearlyBudgetData, isLoading: budgetsLoading } = useQuery({
    queryKey: ['budgets', 'year', selectedYear],
    queryFn: () => api.getYearlyBudgets(selectedYear),
    enabled: active,
  });

  const { data: ytdTransactionData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['bva-ii', 'transactions', selectedYear, selectedMonth],
    queryFn: () => api.getTransactions({
      startDate: `${selectedYear}-01-01`,
      endDate: ytdEnd,
    }),
    enabled: active,
  });

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    if (categories) for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const composition = useMemo(() => {
    if (!categories || !yearlyBudgetData || !ytdTransactionData) return null;
    return composeBvaII({
      categories,
      yearlyBudgets: yearlyBudgetData.budgets,
      yearlyTransactions: ytdTransactionData.transactions,
      selectedMonth,
      useRollover: urlState.rollover,
    });
  }, [categories, yearlyBudgetData, ytdTransactionData, selectedMonth, urlState.rollover]);

  const sections = useMemo<FilteredSection[]>(() => {
    if (!composition || categoryById.size === 0) return [];

    const buckets: Record<SectionType, FilteredTree[]> = {
      income: [],
      spending: [],
      savings: [],
    };

    for (const tree of composition.trees.values()) {
      const section = getSectionType(tree, categoryById);
      // Type filter strips entire subtrees whose section is deselected (REQ-015).
      if (!urlState.types.has(section)) continue;

      const decision = classifyTreeVariance(tree, section, urlState.variance);
      if (!decision.include) continue;

      buckets[section].push({
        tree,
        section,
        autoExpand: decision.autoExpand,
        deEmphasizedChildIds: decision.deEmphasizedChildIds,
      });
    }

    for (const key of Object.keys(buckets) as SectionType[]) {
      buckets[key].sort((a, b) => a.tree.parentName.localeCompare(b.tree.parentName));
    }

    return SECTION_ORDER
      .filter(section => urlState.types.has(section))
      .map(section => ({ section, trees: buckets[section] }));
  }, [composition, categoryById, urlState.types, urlState.variance]);

  // Filter-visible trees feed the summary strip. Matches the variance filter
  // intent: dismissed rows (when showDismissed is on) still display but are
  // muted; the summary already excludes them by default because dismissed
  // entries never enter the sections list unless showDismissed is on. Per
  // REQ-021, de-emphasized siblings are NOT counted — but they're children,
  // not parent rows, so the parent-level summary already excludes them.
  const visibleTrees = useMemo<FilteredTree[]>(() => {
    return sections.flatMap(({ trees }) =>
      trees.filter(t => dismissed.showDismissed || !dismissed.dismissedIds.has(t.tree.parentId)),
    );
  }, [sections, dismissed.showDismissed, dismissed.dismissedIds]);

  const summary = useMemo(() => {
    let actual = 0;
    let budgeted = 0;
    const mixedSections = new Set<SectionType>();
    for (const t of visibleTrees) {
      // Dismissed rows appear faded when showDismissed is on; exclude them
      // from the aggregate so totals reflect the user's focused set.
      if (dismissed.dismissedIds.has(t.tree.parentId)) continue;
      actual += t.tree.effectiveActual;
      budgeted += t.tree.effectiveBudget;
      mixedSections.add(t.section);
    }
    const variance = actual - budgeted;
    const sole = mixedSections.size === 1 ? [...mixedSections][0] : null;
    const tone: VarianceTone = sole ? getVarianceTone(sole, actual, budgeted) : 'neutral';
    return { actual, budgeted, variance, tone };
  }, [visibleTrees, dismissed.dismissedIds]);

  if (!active) return null;

  const loading = budgetsLoading || transactionsLoading || !categories;

  /**
   * Effective expand state per parent — user-override wins when present,
   * otherwise the filter's auto-expand suggestion applies. (Plan Phase 4
   * expansion-state design.)
   */
  const effectiveExpanded = (parentId: string, autoExpand: boolean): boolean => {
    const override = userExpanded.get(parentId);
    if (override !== undefined) return override;
    return autoExpand;
  };

  const toggleExpanded = (parentId: string, currentlyExpanded: boolean) => {
    setUserExpanded(prev => {
      const next = new Map(prev);
      next.set(parentId, !currentlyExpanded);
      return next;
    });
  };

  const toggleType = (type: CategoryTypeFilter) => {
    const next = new Set(urlState.types);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    urlState.setTypes(next);
  };

  const renderVarianceCell = (section: SectionType, actual: number, budgeted: number, dim?: boolean) => {
    const variance = actual - budgeted;
    const tone = getVarianceTone(section, actual, budgeted);
    const color = toneMantineColor(tone);
    return (
      <Group gap={4} wrap="nowrap" style={dim ? { opacity: 0.5 } : undefined}>
        <Text c={color} fw={500} component="span">
          {formatSignedVariance(variance)}
        </Text>
        <Text c={color} component="span" aria-hidden>{toneIcon(tone)}</Text>
      </Group>
    );
  };

  const renderSection = ({ section, trees }: FilteredSection) => {
    const visible = trees.filter(
      t => dismissed.showDismissed || !dismissed.dismissedIds.has(t.tree.parentId),
    );
    if (visible.length === 0) return null;

    return (
      <Paper key={section} withBorder p="sm">
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>{SECTION_LABEL[section]}</Title>
            <Badge variant="light" color={section === 'income' ? 'green' : section === 'savings' ? 'blue' : 'gray'}>
              {visible.length} {visible.length === 1 ? 'row' : 'rows'}
            </Badge>
          </Group>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: '40%' }}>Category</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Actual</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Budgeted</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Variance</Table.Th>
                <Table.Th style={{ width: 80, textAlign: 'right' }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map(({ tree, autoExpand, deEmphasizedChildIds }) => {
                const isExpanded = effectiveExpanded(tree.parentId, autoExpand);
                const isDismissed = dismissed.dismissedIds.has(tree.parentId);
                const hasChildren = tree.children.length > 0;
                const rowOpacity = isDismissed ? 0.5 : 1;

                return (
                  <Fragment key={tree.parentId}>
                    <Table.Tr style={{ opacity: rowOpacity, cursor: hasChildren ? 'pointer' : 'default' }}>
                      <Table.Td onClick={() => hasChildren && toggleExpanded(tree.parentId, isExpanded)}>
                        <Group gap="xs">
                          {hasChildren ? (
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(tree.parentId, isExpanded);
                              }}
                              aria-label={isExpanded ? 'Collapse' : 'Expand'}
                              style={{
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 120ms',
                              }}
                            >
                              <IconChevronRight size={14} />
                            </ActionIcon>
                          ) : (
                            <Box w={22} />
                          )}
                          <Text fw={500} td={isDismissed ? 'line-through' : undefined}>
                            {tree.parentName}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {formatCurrency(tree.effectiveActual)}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {formatCurrency(tree.effectiveBudget)}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {renderVarianceCell(section, tree.effectiveActual, tree.effectiveBudget)}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            aria-label="Edit budget"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            color={isDismissed ? 'blue' : 'gray'}
                            aria-label={isDismissed ? 'Restore row' : 'Dismiss row'}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isDismissed) dismissed.restore(tree.parentId);
                              else dismissed.dismiss(tree.parentId);
                            }}
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                    {isExpanded && tree.children.map(child => {
                      const dim = deEmphasizedChildIds.has(child.categoryId);
                      return (
                        <Table.Tr
                          key={`${tree.parentId}-${child.categoryId}`}
                          style={{ opacity: rowOpacity * (dim ? 0.5 : 1) }}
                        >
                          <Table.Td pl="xl">
                            <Text size="sm" pl="lg">↳ {child.categoryName}</Text>
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'right' }}>
                            {formatCurrency(child.actual)}
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'right' }}>
                            {formatCurrency(child.budgeted)}
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'right' }}>
                            {renderVarianceCell(section, child.actual, child.budgeted, dim)}
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'right' }}>
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              aria-label="Edit budget"
                            >
                              <IconEdit size={14} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </Table.Tbody>
          </Table>
        </Stack>
      </Paper>
    );
  };

  const allTypesOff = urlState.types.size === 0;

  return (
    <Stack gap="md">
      {/* Summary strip (BRD §9). Sums the filter-visible rows only. */}
      <Paper withBorder p="sm">
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text size="xs" c="dimmed">Total Actual</Text>
            <Text fw={600}>{formatCurrency(summary.actual)}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">Total Budgeted</Text>
            <Text fw={600}>{formatCurrency(summary.budgeted)}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">Total Variance</Text>
            <Group gap={4} wrap="nowrap">
              <Text fw={600} c={toneMantineColor(summary.tone)}>
                {formatSignedVariance(summary.variance)}
              </Text>
              <Text c={toneMantineColor(summary.tone)} component="span" aria-hidden>
                {toneIcon(summary.tone)}
              </Text>
            </Group>
          </div>
        </Group>
      </Paper>

      {/* Control row — type chips, rollover switch, variance filter. */}
      <Paper withBorder p="sm">
        <Stack gap="xs">
          <Group wrap="wrap" gap="md" align="flex-end">
            <Chip.Group
              multiple
              value={Array.from(urlState.types)}
              onChange={(next) => urlState.setTypes(new Set(next as CategoryTypeFilter[]))}
            >
              <Group gap="xs">
                {CATEGORY_TYPES.map(type => (
                  <Chip key={type} value={type} size="sm" onClick={() => toggleType(type)}>
                    {SECTION_LABEL[type]}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>

            <Stack gap={2}>
              <Switch
                label="Use Rollover"
                checked={urlState.rollover}
                onChange={(e) => urlState.setRollover(e.currentTarget.checked)}
              />
              {urlState.rollover && isJanuary && (
                <Text size="xs" c="dimmed">
                  January is the start of the rollover year — no carry applies yet.
                </Text>
              )}
            </Stack>

            <Select
              label="Variance"
              value={urlState.variance}
              onChange={(v) => urlState.setVariance((v as VarianceFilter) ?? 'all')}
              data={[
                { value: 'all', label: 'All' },
                { value: 'under', label: 'Under budget' },
                { value: 'over', label: 'Over budget' },
                { value: 'serious', label: 'Seriously over budget' },
              ]}
              allowDeselect={false}
              w={200}
            />
          </Group>

          {urlState.variance === 'serious' && (
            <Group gap={4}>
              <IconAlertTriangle size={14} />
              <Text size="xs" c="dimmed">
                "Seriously over" — spending ×3 of budget, or income/savings under 1/3 of budget.
                Categories with $0 budget excluded.
              </Text>
            </Group>
          )}
        </Stack>
      </Paper>

      {loading ? (
        <Center p="md"><Loader /></Center>
      ) : allTypesOff ? (
        <Paper withBorder p="md">
          <Text c="dimmed">
            No category types selected. Toggle Spending, Income, or Savings above to see your budget.
          </Text>
        </Paper>
      ) : sections.every(s => s.trees.length === 0) ? (
        <Paper withBorder p="md">
          <Text c="dimmed">No matching rows for this filter.</Text>
        </Paper>
      ) : (
        sections.map(renderSection)
      )}
    </Stack>
  );
}
