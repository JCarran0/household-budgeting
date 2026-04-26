import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { IconAlertCircle, IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { format, parse } from 'date-fns';
import type { Category, MonthlyBudget } from '../../../../shared/types';
import { api, type CreateBudgetDto } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatCurrency } from '../../utils/formatters';

interface CopyBudgetMonthModalProps {
  opened: boolean;
  onClose: () => void;
  /** Currently-viewed month on the Budgets page; used as the default TO month. */
  initialToMonth: string; // YYYY-MM
}

type SectionKey = 'income' | 'spending' | 'savings';

interface PreviewRow {
  categoryId: string;
  categoryName: string;
  parentName: string | null;
  section: SectionKey;
  fromAmount: number;
  toAmount: number | undefined;
}

const SECTION_ORDER: SectionKey[] = ['income', 'spending', 'savings'];
const SECTION_LABEL: Record<SectionKey, string> = {
  income: 'Income',
  spending: 'Spending',
  savings: 'Savings',
};

function monthLabel(month: string): string {
  const date = parse(`${month}-01`, 'yyyy-MM-dd', new Date());
  return format(date, 'MMMM yyyy');
}

function monthToDate(month: string): Date {
  return parse(`${month}-01`, 'yyyy-MM-dd', new Date());
}

function classifySection(cat: Category): SectionKey {
  if (cat.isIncome) return 'income';
  if (cat.isSavings) return 'savings';
  return 'spending';
}

/**
 * Bulk-copy every budget row from FROM month into TO month.
 *
 * Two-stage flow mirrors BudgetEditModal: input (FROM/TO pickers) → preview
 * (current vs. new, grouped by Income/Spending/Savings) → batch save.
 *
 * Semantics: every budget that exists in FROM is written to TO (overwriting
 * if present). Categories with no budget in FROM are untouched in TO.
 * Categories deleted since FROM are skipped silently.
 */
export function CopyBudgetMonthModal({
  opened,
  onClose,
  initialToMonth,
}: CopyBudgetMonthModalProps) {
  const queryClient = useQueryClient();

  // Default both pickers to the page's currently-selected month. User picks
  // the target explicitly — the FROM=TO guard prevents an accidental no-op.
  const [fromMonth, setFromMonth] = useState<string>(initialToMonth);
  const [toMonth, setToMonth] = useState<string>(initialToMonth);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (opened) {
      setFromMonth(initialToMonth);
      setToMonth(initialToMonth);
      setConfirming(false);
    }
  }, [opened, initialToMonth]);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: opened,
  });

  const fromQuery = useQuery({
    queryKey: ['budgets', 'month', fromMonth],
    queryFn: () => api.getMonthlyBudgets(fromMonth),
    enabled: opened,
  });

  const toQuery = useQuery({
    queryKey: ['budgets', 'month', toMonth],
    queryFn: () => api.getMonthlyBudgets(toMonth),
    enabled: opened,
  });

  const sameMonth = fromMonth === toMonth;
  const isLoading = fromQuery.isLoading || toQuery.isLoading || !categories;

  const previewBySection = useMemo<Record<SectionKey, PreviewRow[]>>(() => {
    const empty: Record<SectionKey, PreviewRow[]> = { income: [], spending: [], savings: [] };
    if (!categories || !fromQuery.data || !toQuery.data) return empty;

    const catById = new Map(categories.map(c => [c.id, c]));
    const toAmounts = new Map<string, number>(
      toQuery.data.budgets.map((b: MonthlyBudget) => [b.categoryId, b.amount]),
    );

    const rows: PreviewRow[] = [];
    for (const b of fromQuery.data.budgets) {
      const cat = catById.get(b.categoryId);
      if (!cat) continue; // category deleted since FROM month — skip silently
      const parent = cat.parentId ? catById.get(cat.parentId) ?? null : null;
      rows.push({
        categoryId: cat.id,
        categoryName: cat.name,
        parentName: parent?.name ?? null,
        section: classifySection(cat),
        fromAmount: b.amount,
        toAmount: toAmounts.get(cat.id),
      });
    }

    const buckets: Record<SectionKey, PreviewRow[]> = { income: [], spending: [], savings: [] };
    for (const r of rows) buckets[r.section].push(r);

    // Within each section: group children with their parent. Sort by the
    // parent's display name; within the same parent, parent row first then
    // children alphabetically.
    for (const k of SECTION_ORDER) {
      buckets[k].sort((a, b) => {
        const aGroup = a.parentName ?? a.categoryName;
        const bGroup = b.parentName ?? b.categoryName;
        const cmp = aGroup.localeCompare(bGroup);
        if (cmp !== 0) return cmp;
        if (!a.parentName && b.parentName) return -1;
        if (a.parentName && !b.parentName) return 1;
        return a.categoryName.localeCompare(b.categoryName);
      });
    }

    return buckets;
  }, [categories, fromQuery.data, toQuery.data]);

  const totalRows = SECTION_ORDER.reduce((n, k) => n + previewBySection[k].length, 0);
  const overwriteCount = useMemo(() => {
    let n = 0;
    for (const k of SECTION_ORDER) {
      for (const r of previewBySection[k]) {
        if (r.toAmount !== undefined && r.toAmount !== r.fromAmount) n++;
      }
    }
    return n;
  }, [previewBySection]);

  const fromIsEmpty = !isLoading && (fromQuery.data?.budgets.length ?? 0) === 0;

  const copyMutation = useMutation({
    mutationFn: (updates: CreateBudgetDto[]) => api.batchUpdateBudgets(updates),
  });

  const handleConfirm = async () => {
    const updates: CreateBudgetDto[] = SECTION_ORDER.flatMap(k =>
      previewBySection[k].map(r => ({
        categoryId: r.categoryId,
        month: toMonth,
        amount: r.fromAmount,
      })),
    );
    if (updates.length === 0) return;
    try {
      await copyMutation.mutateAsync(updates);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['budgets'] }),
        queryClient.invalidateQueries({ queryKey: ['bva'] }),
      ]);
      notifications.show({
        title: 'Budgets copied',
        message: `Copied ${updates.length} budget${updates.length === 1 ? '' : 's'} from ${monthLabel(fromMonth)} to ${monthLabel(toMonth)}.`,
        color: 'green',
      });
      onClose();
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: getApiErrorMessage(err, 'Failed to copy budgets'),
        color: 'red',
      });
    }
  };

  const fromDate = useMemo(() => monthToDate(fromMonth), [fromMonth]);
  const toDate = useMemo(() => monthToDate(toMonth), [toMonth]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={confirming ? 'Confirm copy' : 'Copy budget month'}
      size="xl"
    >
      {!confirming ? (
        <Stack>
          <Text size="sm" c="dimmed">
            Copy every budget from one month into another. Categories with no budget in the source month will be left unchanged in the target.
          </Text>

          <Group grow align="flex-end">
            <MonthPickerInput
              label="Copy from"
              value={fromDate}
              onChange={(v) => {
                if (!v) return;
                setFromMonth(String(v).slice(0, 7));
              }}
              valueFormat="MMMM YYYY"
            />
            <MonthPickerInput
              label="Copy to"
              value={toDate}
              onChange={(v) => {
                if (!v) return;
                setToMonth(String(v).slice(0, 7));
              }}
              valueFormat="MMMM YYYY"
            />
          </Group>

          {sameMonth && (
            <Text size="sm" c="orange">
              Source and target are the same month. Pick a different target.
            </Text>
          )}

          {isLoading ? (
            <Center py="xl"><Loader /></Center>
          ) : fromIsEmpty ? (
            <Alert icon={<IconAlertCircle size={16} />} color="yellow" variant="light">
              No budgets exist for {monthLabel(fromMonth)}. Pick a different source month.
            </Alert>
          ) : (
            <Text size="sm">
              <b>{totalRows}</b> budget{totalRows === 1 ? '' : 's'} will be written to {monthLabel(toMonth)}
              {overwriteCount > 0 && (
                <> — <Text span c="orange">{overwriteCount} existing value{overwriteCount === 1 ? '' : 's'} will be overwritten</Text></>
              )}.
            </Text>
          )}

          <Group justify="space-between" mt="md">
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => setConfirming(true)}
              disabled={isLoading || sameMonth || fromIsEmpty || totalRows === 0}
            >
              Preview changes
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <Group gap="xs" align="center">
            <Badge variant="light">{monthLabel(fromMonth)}</Badge>
            <IconArrowRight size={16} />
            <Badge variant="light" color="blue">{monthLabel(toMonth)}</Badge>
          </Group>

          <Text>
            About to write <b>{totalRows}</b> budget{totalRows === 1 ? '' : 's'} to {monthLabel(toMonth)}.
            {overwriteCount > 0 && (
              <> {overwriteCount} existing value{overwriteCount === 1 ? '' : 's'} will be overwritten.</>
            )}
          </Text>

          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Category</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Current ({monthLabel(toMonth)})</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>New</Table.Th>
                <Table.Th>Notes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {SECTION_ORDER.map(section => {
                const rows = previewBySection[section];
                if (rows.length === 0) return null;
                return (
                  <SectionRows key={section} label={SECTION_LABEL[section]} rows={rows} />
                );
              })}
            </Table.Tbody>
          </Table>

          <Text size="xs" c="dimmed">
            Categories not listed above had no budget in {monthLabel(fromMonth)} and will remain unchanged in {monthLabel(toMonth)}.
          </Text>

          <Group justify="space-between" mt="md">
            <Button variant="default" onClick={() => setConfirming(false)} disabled={copyMutation.isPending}>
              Back
            </Button>
            <Button onClick={handleConfirm} loading={copyMutation.isPending}>
              Confirm
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function SectionRows({ label, rows }: { label: string; rows: PreviewRow[] }) {
  return (
    <>
      <Table.Tr>
        <Table.Td colSpan={4} style={{ background: 'var(--mantine-color-gray-0)' }}>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed">{label}</Text>
        </Table.Td>
      </Table.Tr>
      {rows.map(r => {
        const isOverwrite = r.toAmount !== undefined && r.toAmount !== r.fromAmount;
        const isNoChange = r.toAmount !== undefined && r.toAmount === r.fromAmount;
        const isNew = r.toAmount === undefined;
        const indent = r.parentName ? 16 : 0;
        return (
          <Table.Tr key={r.categoryId}>
            <Table.Td>
              <Text size="sm" pl={indent}>
                {r.parentName ? `${r.parentName} → ${r.categoryName}` : r.categoryName}
              </Text>
            </Table.Td>
            <Table.Td style={{ textAlign: 'right' }}>
              {r.toAmount !== undefined
                ? formatCurrency(r.toAmount)
                : <Text size="sm" c="dimmed" component="span">(unset)</Text>}
            </Table.Td>
            <Table.Td style={{ textAlign: 'right' }}>{formatCurrency(r.fromAmount)}</Table.Td>
            <Table.Td>
              {isOverwrite && (
                <Badge color="orange" variant="light" size="sm">
                  ← existing value will be overwritten
                </Badge>
              )}
              {isNew && (
                <Badge color="blue" variant="light" size="sm">new allocation</Badge>
              )}
              {isNoChange && (
                <Text size="xs" c="dimmed">no change</Text>
              )}
            </Table.Td>
          </Table.Tr>
        );
      })}
      <Table.Tr><Table.Td colSpan={4} p={0}><Divider /></Table.Td></Table.Tr>
    </>
  );
}
