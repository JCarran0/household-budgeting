import {
  Group,
  Stack,
  TextInput,
  NumberInput,
  ActionIcon,
  Button,
  Text,
  Autocomplete,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconX, IconTag } from '@tabler/icons-react';
import type { ProjectLineItemInput } from '../../../../shared/types';
import {
  computeAllocationHint,
  slugifyLineItemTag,
} from '../../../../shared/utils/projectHelpers';
import { formatCurrency } from '../../utils/formatters';

interface LineItemEditorProps {
  lineItems: ProjectLineItemInput[];
  /** Project total budget — the allocation hint is anchored here (BRD §5.5.7) */
  totalBudget: number | null;
  /** Existing transaction tags, for autocomplete */
  tagSuggestions: string[];
  onChange: (items: ProjectLineItemInput[]) => void;
}

export function LineItemEditor({
  lineItems,
  totalBudget,
  tagSuggestions,
  onChange,
}: LineItemEditorProps) {
  const update = (index: number, patch: Partial<ProjectLineItemInput>) => {
    onChange(lineItems.map((li, i) => (i === index ? { ...li, ...patch } : li)));
  };

  /**
   * Pre-fill the tag from the name, but only while the user hasn't touched the
   * tag themselves — once it diverges from the slug of the previous name we stop
   * tracking, so a deliberate short tag survives further edits to the name.
   */
  const updateName = (index: number, name: string) => {
    const current = lineItems[index];
    const wasAutoFilled =
      !current.tag || current.tag === slugifyLineItemTag(current.name);
    update(index, {
      name,
      ...(wasAutoFilled ? { tag: slugifyLineItemTag(name) } : {}),
    });
  };

  const remove = (index: number) => {
    onChange(lineItems.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...lineItems, { name: '', estimatedCost: 0, tag: '' }]);
  };

  const hint =
    totalBudget !== null
      ? computeAllocationHint(totalBudget, lineItems, formatCurrency)
      : null;

  return (
    <Stack gap="xs">
      {lineItems.map((li, index) => (
        <Stack
          key={li.id ?? index}
          gap={4}
          style={{
            borderLeft: '2px solid var(--mantine-color-blue-3)',
            paddingLeft: 8,
          }}
        >
          <Group gap="xs">
            <TextInput
              style={{ flex: 2 }}
              placeholder="Item name"
              size="xs"
              value={li.name}
              onChange={(e) => updateName(index, e.currentTarget.value)}
            />
            <NumberInput
              style={{ flex: 1 }}
              placeholder="Est. cost"
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

          <Group gap="xs" wrap="nowrap">
            <Tooltip
              label="Tag the matching transactions with this to track actual spend"
              position="left"
            >
              <IconTag size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
            </Tooltip>
            <Autocomplete
              style={{ flex: 1 }}
              size="xs"
              placeholder="match tag"
              data={tagSuggestions}
              value={li.tag}
              onChange={(val) => update(index, { tag: val })}
              aria-label="Line item match tag"
            />
          </Group>
        </Stack>
      ))}

      {hint?.label && (
        <Text size="xs" c={hint.kind === 'over' ? 'orange' : 'dimmed'}>
          {hint.label}
        </Text>
      )}

      <Button
        size="xs"
        variant="subtle"
        color="gray"
        leftSection={<IconPlus size={10} />}
        onClick={add}
        style={{ alignSelf: 'flex-start' }}
      >
        Add line item
      </Button>
    </Stack>
  );
}
