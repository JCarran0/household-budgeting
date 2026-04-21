import {
  Alert,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { ResponsiveModal } from '../../ResponsiveModal';
import {
  IconBed,
  IconBuildingSkyscraper,
  IconBeach,
  IconInfoCircle,
} from '@tabler/icons-react';

export type TripTemplateId = 'city_break' | 'multi_city' | 'beach_week';

/** Defaults fed into the Add Stay sheet when a template is picked. */
export interface TripTemplateDefaults {
  templateId: TripTemplateId;
  /** Nights to pre-fill in the Stay form. */
  defaultNights: number;
  /** Start date to pre-fill (always tripStart for V1). */
  defaultDate: string;
}

interface TripTemplateModalProps {
  opened: boolean;
  onClose: () => void;
  tripStartDate: string;
  tripEndDate: string;
  onApply: (defaults: TripTemplateDefaults) => void;
}

interface TemplateOption {
  id: TripTemplateId;
  label: string;
  description: string;
  icon: typeof IconBed;
  color: string;
}

const OPTIONS: TemplateOption[] = [
  {
    id: 'city_break',
    label: 'City break',
    description: 'One base for the whole trip',
    icon: IconBuildingSkyscraper,
    color: 'blue',
  },
  {
    id: 'multi_city',
    label: 'Multi-city',
    description: 'Two bases split roughly in half',
    icon: IconBed,
    color: 'grape',
  },
  {
    id: 'beach_week',
    label: 'Beach week',
    description: 'One relaxed base, all nights',
    icon: IconBeach,
    color: 'cyan',
  },
];

/**
 * Nights between two ISO dates. Night-based semantics: trip 2026-05-01 →
 * 2026-05-07 has 6 nights (check out morning of the 7th).
 */
function tripNights(start: string, end: string): number {
  if (end < start) return 1;
  const startMs = Date.parse(start + 'T00:00:00');
  const endMs = Date.parse(end + 'T00:00:00');
  return Math.max(1, Math.round((endMs - startMs) / 86400000));
}

function defaultsFor(
  template: TripTemplateId,
  tripStart: string,
  tripEnd: string,
): TripTemplateDefaults {
  const nights = tripNights(tripStart, tripEnd);
  switch (template) {
    case 'city_break':
      return { templateId: template, defaultDate: tripStart, defaultNights: nights };
    case 'beach_week':
      return { templateId: template, defaultDate: tripStart, defaultNights: nights };
    case 'multi_city':
      return {
        templateId: template,
        defaultDate: tripStart,
        defaultNights: Math.max(1, Math.floor(nights / 2)),
      };
  }
}

export function TripTemplateModal({
  opened,
  onClose,
  tripStartDate,
  tripEndDate,
  onApply,
}: TripTemplateModalProps) {
  const handleSelect = (id: TripTemplateId) => {
    const defaults = defaultsFor(id, tripStartDate, tripEndDate);
    onApply(defaults);
    onClose();
  };

  return (
    <ResponsiveModal opened={opened} onClose={onClose} title="Pick a template" size="lg">
      <Stack gap="sm">
        <Alert icon={<IconInfoCircle size={16} />} color="gray" variant="light">
          Templates pre-fill the Stay form so you can add your place in one click.
          For Multi-city, you'll add the second base + drive after the first one is saved.
        </Alert>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          {OPTIONS.map((opt) => (
            <UnstyledButton key={opt.id} onClick={() => handleSelect(opt.id)}>
              <Paper withBorder radius="md" p="md" h="100%">
                <Stack align="center" gap="xs">
                  <ThemeIcon variant="light" size="lg" color={opt.color}>
                    <opt.icon size={20} />
                  </ThemeIcon>
                  <Text fw={600} size="sm">
                    {opt.label}
                  </Text>
                  <Text size="xs" c="dimmed" ta="center">
                    {opt.description}
                  </Text>
                </Stack>
              </Paper>
            </UnstyledButton>
          ))}
        </SimpleGrid>
        <Group justify="flex-end" pt="xs">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </ResponsiveModal>
  );
}
