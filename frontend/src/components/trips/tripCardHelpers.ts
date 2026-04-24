import { format } from 'date-fns';
import type { TripSummary } from '../../../../shared/types';

export const STATUS_BADGE_COLOR: Record<TripSummary['status'], string> = {
  upcoming: 'blue',
  active: 'green',
  completed: 'gray',
};

export function formatTripDateRange(start: string, end: string): string {
  try {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);

    if (sy === ey) {
      return `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d, yyyy')}`;
    }
    return `${format(startDate, 'MMM d, yyyy')} – ${format(endDate, 'MMM d, yyyy')}`;
  } catch {
    return `${start} – ${end}`;
  }
}
