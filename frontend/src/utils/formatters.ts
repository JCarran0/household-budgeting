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