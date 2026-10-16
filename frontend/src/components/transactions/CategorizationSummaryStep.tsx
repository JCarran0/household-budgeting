import { Text, Stack, Button, Group, ThemeIcon, Divider } from '@mantine/core';
import { IconSparkles, IconCheck } from '@tabler/icons-react';

export interface CategorizationRunSummary {
  /** Transactions sent to the AI across this session's runs. */
  sentCount: number;
  /** Of those, how many got a suggestion (low-confidence ones included). */
  classifiedCount: number;
  appliedCount: number;
  changedCount: number;
  skippedCount: number;
  createdRulesCount: number;
  unsureReasons: Map<string, number>;
  costUsed: number;
  model: string | null;
  remainingUncategorized: number;
}

interface CategorizationSummaryStepProps {
  summary: CategorizationRunSummary;
  onNextBatch: () => void;
  isReclassifying: boolean;
  onDone: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;

/**
 * End-of-run report (AI-CATEGORIZATION-BRD REQ-104). Counts come from what was
 * actually applied, so closing early still reports accurately (REQ-105).
 */
export function CategorizationSummaryStep({ summary, onNextBatch, isReclassifying, onDone }: CategorizationSummaryStepProps) {
  const {
    sentCount, classifiedCount, appliedCount, changedCount, skippedCount, createdRulesCount,
    unsureReasons, costUsed, model, remainingUncategorized,
  } = summary;
  const unsureTotal = [...unsureReasons.values()].reduce((a, b) => a + b, 0);

  return (
    <Stack align="center" gap="md" py="xl">
      <ThemeIcon size={60} radius="xl" variant="light" color="green">
        <IconCheck size={30} />
      </ThemeIcon>
      <Text size="lg" fw={600}>Categorization Complete</Text>
      <Stack gap={4} align="center">
        <Text size="sm">{plural(appliedCount, 'transaction')} categorized</Text>
        {changedCount > 0 && (
          <Text size="sm" c="dimmed">{changedCount} of them with a category you changed from the AI’s suggestion</Text>
        )}
        {skippedCount > 0 && <Text size="sm" c="dimmed">{skippedCount} skipped</Text>}
        {createdRulesCount > 0 && (
          <Text size="sm" c="blue">{plural(createdRulesCount, 'new auto-categorization rule')} created</Text>
        )}
      </Stack>

      <Divider w="100%" maw={420} />

      <Stack gap={4} align="center" maw={420}>
        <Text size="sm">The AI suggested a category for {classifiedCount} of {sentCount}</Text>
        {unsureTotal > 0 && (
          <>
            <Text size="sm" c="dimmed">{unsureTotal} needed your help:</Text>
            {[...unsureReasons].map(([reason, count]) => (
              <Text key={reason} size="xs" c="dimmed" ta="center">{count}× {reason}</Text>
            ))}
          </>
        )}
        {(costUsed > 0 || model) && (
          <Text size="xs" c="dimmed" mt="xs">
            {model ? `${model} · ` : ''}AI cost ~${costUsed.toFixed(4)}
          </Text>
        )}
        {remainingUncategorized > 0 && (
          <Text size="sm" c="dimmed" mt="xs">
            {plural(remainingUncategorized, 'uncategorized transaction')} remaining
          </Text>
        )}
      </Stack>

      <Group>
        {remainingUncategorized > 0 && (
          <Button onClick={onNextBatch} loading={isReclassifying} leftSection={<IconSparkles size={16} />}>
            Categorize next {Math.min(50, remainingUncategorized)}
          </Button>
        )}
        <Button variant={remainingUncategorized > 0 ? 'subtle' : 'filled'} onClick={onDone}>Done</Button>
      </Group>
    </Stack>
  );
}
