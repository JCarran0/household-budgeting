/**
 * Statement CSV export — mirrors the transactionExport.ts client-side Blob
 * download pattern (D9). Produces a CSV with one row per deposit line item
 * followed by a totals block (royalty subtotal, each charge, remittance).
 *
 * Column ordering matches the shape of the legacy Google-Sheet import so the
 * exported file can drop directly into the existing template.
 */
import type { BusinessStatement } from '../../../shared/types';
import { notifications } from '@mantine/notifications';

/**
 * Escape a value for RFC-4180 CSV:
 * - Wrap in double quotes if it contains comma, newline, or double-quote.
 * - Escape embedded double-quotes by doubling them.
 */
function escapeCSV(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatMoney(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Download a BusinessStatement as a CSV file.
 *
 * Layout:
 *   Section 1 — header row + one row per deposit (disbursementDate, payout,
 *               commission, royalty)
 *   Section 2 — blank separator row
 *   Section 3 — totals block: royalty subtotal, each charge line, remittance
 */
export function exportStatementToCSV(statement: BusinessStatement): void {
  const depositHeaders = [
    'Disbursement Date',
    'Payout',
    'Commission (5%)',
    'Royalty',
  ];

  const rows: string[] = [];

  // Section 1: column headers + deposit rows
  rows.push(depositHeaders.map(escapeCSV).join(','));
  for (const item of statement.lineItems) {
    rows.push(
      [
        item.disbursementDate,
        formatMoney(item.payout),
        formatMoney(item.commission),
        formatMoney(item.royalty),
      ]
        .map(escapeCSV)
        .join(','),
    );
  }

  // Section 2: blank separator
  rows.push('');

  // Section 3: totals block
  rows.push(['Royalty Subtotal', '', '', formatMoney(statement.royaltySubtotal)].map(escapeCSV).join(','));
  for (const charge of statement.charges) {
    rows.push([charge.label, '', '', formatMoney(charge.amount)].map(escapeCSV).join(','));
  }
  rows.push(['Remittance Total', '', '', formatMoney(statement.remittanceTotal)].map(escapeCSV).join(','));

  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `statement-${String(statement.paymentNumber).padStart(3, '0')}-${statement.periodMonth}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  notifications.show({
    title: 'Export Complete',
    message: `Statement #${statement.paymentNumber} exported to CSV`,
    color: 'green',
  });
}
