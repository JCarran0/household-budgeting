import {
  Paper,
  Group,
  Text,
  Button,
  Badge,
  Transition,
} from '@mantine/core';
import {
  IconCategory,
  IconEdit,
  IconX,
} from '@tabler/icons-react';

interface BulkEditBarProps {
  selectedCount: number;
  selectedAmount: number;
  onEditCategory: () => void;
  onEditDescription: () => void;
  onClearSelection: () => void;
}

export function BulkEditBar({
  selectedCount,
  selectedAmount,
  onEditCategory,
  onEditDescription,
  onClearSelection,
}: BulkEditBarProps) {
  const isVisible = selectedCount > 0;
  
  return (
    <Transition
      mounted={isVisible}
      transition="slide-down"
      duration={200}
      timingFunction="ease"
    >
      {(styles) => (
        <Paper
          p="md"
          withBorder
          mb="md"
          style={{
            ...styles,
            backgroundColor: 'var(--mantine-color-blue-light)',
          }}
        >
          <Group justify="space-between">
            <Group>
              <Badge size="lg" variant="filled">
                {selectedCount} selected
              </Badge>
              <Text size="sm" c="dimmed">
                Total: ${Math.abs(selectedAmount).toFixed(2)}
              </Text>
            </Group>
            
            <Group>
              <Button
                leftSection={<IconCategory size={16} />}
                variant="filled"
                size="sm"
                onClick={onEditCategory}
              >
                Edit Category
              </Button>
              
              <Button
                leftSection={<IconEdit size={16} />}
                variant="filled"
                size="sm"
                onClick={onEditDescription}
              >
                Edit Description
              </Button>
              
              <Button
                leftSection={<IconX size={16} />}
                variant="light"
                size="sm"
                onClick={onClearSelection}
              >
                Clear Selection
              </Button>
            </Group>
          </Group>
        </Paper>
      )}
    </Transition>
  );
}