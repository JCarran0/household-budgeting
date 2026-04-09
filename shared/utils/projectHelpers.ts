/**
 * Project tag generation and utility functions.
 * Used by both frontend (tag preview) and backend (tag creation).
 */

/**
 * Generate a project tag from a project name and start date.
 * Format: project:<slug>:<year>
 *
 * - Lowercases the name
 * - Strips colons (delimiter conflict)
 * - Replaces spaces and special chars with hyphens
 * - Strips consecutive/leading/trailing hyphens
 * - Extracts year from startDate
 */
export function generateProjectTag(name: string, startDate: string): string {
  const year = new Date(startDate).getFullYear();
  const slug = slugifyProjectName(name);
  return `project:${slug}:${year}`;
}

/**
 * Slugify a project name for use in a tag.
 */
export function slugifyProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/:/g, '')           // Strip colons (delimiter conflict)
    .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')         // Collapse consecutive hyphens
    .replace(/^-|-$/g, '');      // Strip leading/trailing hyphens
}

/**
 * Check if a tag string is a project tag.
 */
export function isProjectTag(tag: string): boolean {
  return /^project:[a-z0-9-]+:\d{4}$/.test(tag);
}

/**
 * Derive project status from dates relative to today.
 */
export function getProjectStatus(startDate: string, endDate: string): 'planning' | 'active' | 'completed' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (start > today) return 'planning';
  if (end < today) return 'completed';
  return 'active';
}
