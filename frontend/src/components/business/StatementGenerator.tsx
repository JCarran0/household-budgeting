/**
 * StatementGenerator — month picker + optional payment# / date overrides.
 * Calls POST /business/statements, then surfaces the resulting statement
 * in the StatementPreview panel.
 */
import { useState } from 'react';
import {
  Stack,
  Group,
  Button,
  NumberInput,
  TextInput,
  Card,
  Title,
  Text,
  Collapse,
  Box,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { format } from 'date-fns';
import { api } from '../../lib/api';
import { StatementPreview } from './StatementPreview';
import type { BusinessStatement } from '../../../../shared/types';
import type { GenerateStatementPayload } from '../../lib/api/businessStatements';

export function StatementGenerator() {
  const queryClient = useQueryClient();

  // Month picker value — can be Date | string | null depending on Mantine version
  const [selectedMonth, setSelectedMonth] = useState<Date | string | null>(null);
  const [paymentNumber, setPaymentNumber] = useState<number | string>('');
  const [paymentDate, setPaymentDate] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewStatement, setPreviewStatement] = useState<BusinessStatement | null>(null);

  const generateMutation = useMutation({
    mutationFn: (payload: GenerateStatementPayload) => api.generateStatement(payload),
    onSuccess: (statement) => {
      setPreviewStatement(statement);
      // Invalidate the history list so the new statement appears immediately
      void queryClient.invalidateQueries({ queryKey: ['businessStatements'] });
      notifications.show({
        title: 'Statement Generated',
        message: `Payment #${statement.paymentNumber} — remittance ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(statement.remittanceTotal)}`,
        color: 'green',
      });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: 'Generation Failed',
        message: error instanceof Error ? error.message : 'Could not generate statement',
        color: 'red',
      });
    },
  });

  const handleGenerate = () => {
    if (!selectedMonth) return;

    // Normalize Date | string to YYYY-MM (mirrors CopyBudgetMonthModal pattern)
    const periodMonth =
      selectedMonth instanceof Date
        ? format(selectedMonth, 'yyyy-MM')
        : String(selectedMonth).slice(0, 7);

    const payload: GenerateStatementPayload = {
      periodMonth,
    };

    if (typeof paymentNumber === 'number' && paymentNumber > 0) {
      payload.paymentNumber = paymentNumber;
    }
    if (paymentDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      payload.paymentDate = paymentDate;
    }

    generateMutation.mutate(payload);
  };

  return (
    <Stack gap="lg">
      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Title order={3}>Generate Statement</Title>
          <Text size="sm" c="dimmed">
            Select a billing period. Tagged transactions for that month will be
            pulled automatically.
          </Text>

          <Group align="flex-end" gap="md">
            <MonthPickerInput
              label="Billing Period"
              placeholder="Select month"
              value={selectedMonth}
              onChange={setSelectedMonth}
              style={{ flexGrow: 1, maxWidth: 240 }}
            />
            <Button
              onClick={handleGenerate}
              disabled={selectedMonth === null || selectedMonth === ''}
              loading={generateMutation.isPending}
            >
              Generate
            </Button>
          </Group>

          {/* Advanced overrides — collapsed by default */}
          <Box>
            <Button
              variant="subtle"
              size="xs"
              rightSection={showAdvanced ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              Advanced options
            </Button>
            <Collapse in={showAdvanced}>
              <Group gap="md" mt="sm">
                <NumberInput
                  label="Override payment number"
                  placeholder="Auto"
                  min={1}
                  value={paymentNumber}
                  onChange={setPaymentNumber}
                  style={{ maxWidth: 180 }}
                />
                <TextInput
                  label="Override payment date"
                  placeholder="YYYY-MM-DD"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.currentTarget.value)}
                  style={{ maxWidth: 200 }}
                />
              </Group>
            </Collapse>
          </Box>
        </Stack>
      </Card>

      {/* Inline preview of the generated statement */}
      {previewStatement && (
        <Card withBorder padding="lg" radius="md">
          <Title order={3} mb="md">Preview</Title>
          <StatementPreview statement={previewStatement} />
        </Card>
      )}
    </Stack>
  );
}
