/**
 * Formats a number as currency with commas and rounds to nearest dollar
 * @param amount - The amount to format
 * @param showCents - Whether to show cents (default: false for display, true for tooltips)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, showCents: boolean = false): string {
  const rounded = showCents ? amount : Math.round(amount);
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(rounded);
}

/**
 * Formats a number with commas
 * @param value - The number to format
 * @returns Formatted number string with commas
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Safely parses a month string in "yyyy-MM" format to a Date object.
 *
 * IMPORTANT: This avoids timezone bugs by creating a Date in local timezone
 * instead of UTC. Using `new Date("2025-11-01")` parses as UTC midnight,
 * which becomes the previous day in negative UTC offsets (EDT, PDT, etc).
 *
 * @param monthStr - Month string in "yyyy-MM" format (e.g., "2025-11")
 * @returns Date object set to the 1st of the month in local timezone
 *
 * @example
 * // Correct - uses local timezone
 * const date = parseMonthString("2025-11"); // Nov 1, 2025 00:00 local time
 *
 * // Wrong - creates UTC date that may shift to previous month
 * const date = new Date("2025-11-01"); // Nov 1, 2025 00:00 UTC = Oct 31 in EDT!
 */
export function parseMonthString(monthStr: string): Date {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month - 1, 1); // Month is 0-indexed in JavaScript
}