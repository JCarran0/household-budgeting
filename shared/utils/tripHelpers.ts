/**
 * Trip tag generation and utility functions.
 * Used by both frontend (tag preview) and backend (tag creation).
 */

/**
 * Generate a trip tag from a trip name and start date.
 * Format: trip:<slug>:<year>
 *
 * - Lowercases the name
 * - Strips colons (delimiter conflict)
 * - Replaces spaces and special chars with hyphens
 * - Strips consecutive/leading/trailing hyphens
 * - Extracts year from startDate
 */
export function generateTripTag(name: string, startDate: string): string {
  const year = new Date(startDate).getFullYear();
  const slug = slugifyTripName(name);
  return `trip:${slug}:${year}`;
}

/**
 * Slugify a trip name for use in a tag.
 */
export function slugifyTripName(name: string): string {
  return name
    .toLowerCase()
    .replace(/:/g, '')           // Strip colons (delimiter conflict — D7)
    .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')         // Collapse consecutive hyphens
    .replace(/^-|-$/g, '');      // Strip leading/trailing hyphens
}

/**
 * Check if a tag string is a trip tag.
 */
export function isTripTag(tag: string): boolean {
  return /^trip:[a-z0-9-]+:\d{4}$/.test(tag);
}

/**
 * Derive trip status from dates relative to today.
 */
export function getTripStatus(startDate: string, endDate: string): 'upcoming' | 'active' | 'completed' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (start > today) return 'upcoming';
  if (end < today) return 'completed';
  return 'active';
}
