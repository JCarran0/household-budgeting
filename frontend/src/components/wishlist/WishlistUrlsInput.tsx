import { Stack, Group, TextInput, ActionIcon, Button, Text, Tooltip } from '@mantine/core';
import { IconTrash, IconPlus, IconLink } from '@tabler/icons-react';
import { WISHLIST_URL_LIMITS } from '../../../../shared/types';
import { validateUrl } from './wishlistUrls';

interface WishlistUrlsInputProps {
  /** Draft rows, including blank ones the user has not filled in yet. */
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Repeatable link rows for the wishlist item form. Blank rows are allowed while
 * editing and stripped on submit, so "add a row then change your mind" does not
 * block saving.
 */
export function WishlistUrlsInput({ value, onChange }: WishlistUrlsInputProps) {
  const rows = value.length > 0 ? value : [''];
  const atLimit = rows.length >= WISHLIST_URL_LIMITS.maxCount;

  const setAt = (index: number, next: string) => {
    onChange(rows.map((row, i) => (i === index ? next : row)));
  };

  const removeAt = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : ['']);
  };

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        Links
      </Text>
      {rows.map((row, index) => {
        const error = validateUrl(row);
        return (
          <Group key={index} gap="xs" wrap="nowrap" align="flex-start">
            <TextInput
              style={{ flex: 1 }}
              type="url"
              inputMode="url"
              placeholder="https://example.com/product"
              leftSection={<IconLink size={14} />}
              value={row}
              error={error}
              onChange={(e) => setAt(index, e.currentTarget.value)}
              aria-label={`Link ${index + 1}`}
            />
            <Tooltip label="Remove link" withArrow>
              <ActionIcon
                variant="subtle"
                color="red"
                mt={4}
                onClick={() => removeAt(index)}
                aria-label={`Remove link ${index + 1}`}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        );
      })}
      <Group justify="space-between">
        <Button
          variant="subtle"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => onChange([...rows, ''])}
          disabled={atLimit}
        >
          Add link
        </Button>
        {atLimit && (
          <Text size="xs" c="dimmed">
            Limit {WISHLIST_URL_LIMITS.maxCount} links
          </Text>
        )}
      </Group>
    </Stack>
  );
}
