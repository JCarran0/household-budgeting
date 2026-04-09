import { Stack, Text, Paper, Group, ThemeIcon, Button } from '@mantine/core';
import { IconCheck, IconCurrencyDollar, IconCategory, IconCut, IconPlayerSkipForward } from '@tabler/icons-react';
import type { AmazonApplyResponse } from '../../../../../shared/types';

interface SummaryStepProps {
  result: AmazonApplyResponse;
  unmatchedCount: number;
  rulesCreated: number;
  onClose: () => void;
}

export function SummaryStep({ result, unmatchedCount, rulesCreated, onClose }: SummaryStepProps) {
  return (
    <Stack gap="md">
      <Group gap="xs" mb="sm">
        <ThemeIcon color="green" size="lg" radius="xl">
          <IconCheck size={20} />
        </ThemeIcon>
        <Text fw={600} size="lg">Receipt Matching Complete</Text>
      </Group>

      <Paper p="md" withBorder>
        <Stack gap="sm">
          <SummaryRow
            icon={<IconCategory size={16} />}
            label="Transactions recategorized"
            value={result.applied}
            color="blue"
          />
          <SummaryRow
            icon={<IconCut size={16} />}
            label="Transactions split"
            value={result.splits}
            color="violet"
          />
          <SummaryRow
            icon={<IconPlayerSkipForward size={16} />}
            label="Items skipped"
            value={result.skipped}
            color="gray"
          />
          <SummaryRow
            icon={<IconCategory size={16} />}
            label="Unmatched orders"
            value={unmatchedCount}
            color="gray"
          />
          {rulesCreated > 0 && (
            <SummaryRow
              icon={<IconCheck size={16} />}
              label="Auto-categorization rules created"
              value={rulesCreated}
              color="green"
            />
          )}
        </Stack>
      </Paper>

      {result.summary.totalDollarsRecategorized > 0 && (
        <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-green-9)', borderColor: 'var(--mantine-color-green-7)' }}>
          <Group gap="xs">
            <ThemeIcon color="green" variant="light" size="sm">
              <IconCurrencyDollar size={14} />
            </ThemeIcon>
            <Text size="sm" fw={500}>
              ${result.summary.totalDollarsRecategorized.toFixed(2)} moved out of Amazon catch-all into specific categories
            </Text>
          </Group>
        </Paper>
      )}

      <Button onClick={onClose} mt="md">
        Close
      </Button>
    </Stack>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Group justify="space-between">
      <Group gap="xs">
        <ThemeIcon variant="light" size="sm" color={color}>
          {icon}
        </ThemeIcon>
        <Text size="sm">{label}</Text>
      </Group>
      <Text size="sm" fw={600}>{value}</Text>
    </Group>
  );
}
