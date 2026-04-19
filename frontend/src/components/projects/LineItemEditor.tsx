import { Group, Stack, TextInput, NumberInput, ActionIcon, Button, Text } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import type { ProjectLineItemInput } from '../../../../shared/types';
import { computeAllocationHint } from '../../../../shared/utils/projectHelpers';
import { formatCurrency } from '../../utils/formatters';

interface LineItemEditorProps {
  lineItems: ProjectLineItemInput[];
  amount: number;
  onChange: (items: ProjectLineItemInput[]) => void;
}

export function LineItemEditor({ lineItems, amount, onChange }: LineItemEditorProps) {
  const update = (index: number, patch: Partial<ProjectLineItemInput>) => {
    onChange(lineItems.map((li, i) => (i === index ? { ...li, ...patch } : li)));
  };

  const remove = (index: number) => {
    onChange(lineItems.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...lineItems, { name: '', estimatedCost: 0 }]);
  };

  const hint = computeAllocationHint(amount, lineItems, formatCurrency);

  return (
    <Stack gap="xs">
      {lineItems.map((li, index) => (
        <Group key={li.id ?? index} gap="xs" pl={8}>
          <TextInput
            style={{ flex: 2 }}
            placeholder="Item name"
            size="xs"
            value={li.name}
            onChange={(e) => update(index, { name: e.currentTarget.value })}
          />
          <NumberInput
            style={{ flex: 1 }}
            placeholder="Cost"
            size="xs"
            min={0}
            decimalScale={2}
            prefix="$"
            value={li.estimatedCost}
            onChange={(val) => update(index, { estimatedCost: Number(val) || 0 })}
          />
          <ActionIcon
            size="xs"
            color="red"
            variant="subtle"
            aria-label="Remove line item"
            onClick={() => remove(index)}
          >
            <IconX size={12} />
          </ActionIcon>
        </Group>
      ))}

      {hint.label && (
        <Text size="xs" c={hint.kind === 'over' ? 'orange' : 'dimmed'} pl={8}>
          {hint.label}
        </Text>
      )}

      <Button
        size="xs"
        variant="subtle"
        color="gray"
        leftSection={<IconPlus size={10} />}
        ml={8}
        onClick={add}
      >
        Add line item
      </Button>
    </Stack>
  );
}
