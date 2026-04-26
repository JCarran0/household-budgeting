import { Table, NumberInput, Box, Text, ThemeIcon } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { formatCurrency } from '../../utils/formatters';
import { BudgetCellNotePopover } from './BudgetCellNotePopover';

export interface EditingCell {
  categoryId: string;
  month: string;
  value: number;
  originalValue: number;
}

interface YearlyBudgetCellProps {
  categoryId: string;
  categoryName: string;
  monthKey: string;
  monthName: string;
  currentValue: number;
  effectiveNote: string;
  hasPendingUpdate: boolean;
  isEditing: boolean;
  editingCell: EditingCell | null;
  onBeginEdit: (cell: EditingCell) => void;
  onChangeEditingValue: (value: number) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onTab: (shift: boolean) => void;
  onEnter: () => void;
  onSaveNote: (notes: string) => void;
}

export function YearlyBudgetCell({
  categoryId,
  categoryName,
  monthKey,
  monthName,
  currentValue,
  effectiveNote,
  hasPendingUpdate,
  isEditing,
  editingCell,
  onBeginEdit,
  onChangeEditingValue,
  onCommitEdit,
  onCancelEdit,
  onTab,
  onEnter,
  onSaveNote,
}: YearlyBudgetCellProps) {
  return (
    <Table.Td width={100}>
      {isEditing && editingCell ? (
        <NumberInput
          value={editingCell.value}
          onChange={(value) => onChangeEditingValue(Number(value) || 0)}
          onBlur={onCommitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              onTab(e.shiftKey);
            } else if (e.key === 'Enter') {
              onEnter();
            } else if (e.key === 'Escape') {
              onCancelEdit();
            }
          }}
          min={0}
          step={10}
          prefix="$"
          size="xs"
          styles={{ input: { textAlign: 'center' } }}
          autoFocus
        />
      ) : (
        <Box
          style={{
            cursor: 'pointer',
            textAlign: 'center',
            padding: '2px',
            borderRadius: '4px',
            backgroundColor: hasPendingUpdate ? 'var(--mantine-color-yellow-light)' : 'transparent',
            position: 'relative',
          }}
          onClick={() =>
            onBeginEdit({ categoryId, month: monthKey, value: currentValue, originalValue: currentValue })
          }
        >
          <Text size="xs" fw={currentValue > 0 ? 500 : 400} c={currentValue > 0 ? undefined : 'dimmed'}>
            {currentValue > 0 ? formatCurrency(currentValue) : '—'}
          </Text>
          <Box
            style={{ position: 'absolute', top: -2, left: -2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <BudgetCellNotePopover
              value={effectiveNote}
              label={`${categoryName} · ${monthName}`}
              onSave={onSaveNote}
            />
          </Box>
          {hasPendingUpdate && (
            <ThemeIcon
              size="xs"
              variant="light"
              color="yellow"
              style={{ position: 'absolute', top: -2, right: -2 }}
            >
              <IconDeviceFloppy size={8} />
            </ThemeIcon>
          )}
        </Box>
      )}
    </Table.Td>
  );
}
