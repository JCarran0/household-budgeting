/**
 * StatementPdf — @react-pdf/renderer document mirroring the page-1 layout.
 *
 * This file is LAZY-LOADED by StatementHistoryTable via dynamic import so it
 * does not bloat the main bundle for the personal app (D9). Only imported
 * at runtime when the user clicks "Export PDF".
 *
 * Layout: business + client header, royalty table, royalty subtotal,
 * "Other fees & charges" lines (all subtypes incl. $0), remittance total.
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import type { BusinessStatement } from '../../../../shared/types';

interface StatementPdfProps {
  statement: BusinessStatement;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
    color: '#1a1a1a',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    maxWidth: '55%',
  },
  headerRight: {
    maxWidth: '40%',
    alignItems: 'flex-end',
  },
  businessName: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  statementTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  dimmed: {
    color: '#666',
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
  },
  table: {
    width: '100%',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#aaa',
    backgroundColor: '#f5f5f5',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  colDate: { width: '25%' },
  colPayout: { width: '25%', textAlign: 'right' },
  colCommission: { width: '25%', textAlign: 'right' },
  colRoyalty: { width: '25%', textAlign: 'right' },
  colDescription: { width: '75%' },
  colAmount: { width: '25%', textAlign: 'right' },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
    marginBottom: 4,
  },
  subtotal: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  remittanceRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1.5,
    borderTopColor: '#333',
  },
  remittanceText: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1a6b5a',
  },
  notes: {
    marginTop: 24,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
  },
  notesText: {
    fontSize: 8,
    color: '#666',
    lineHeight: 1.4,
  },
});

export function StatementPdf({ statement }: StatementPdfProps) {
  const { clientHeader, lineItems, royaltySubtotal, charges, remittanceTotal } = statement;

  return (
    <Document
      title={`Statement #${String(statement.paymentNumber).padStart(3, '0')} — ${statement.periodMonth}`}
      author={clientHeader.businessName}
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.businessName}>{clientHeader.businessName}</Text>
            <Text style={styles.dimmed}>{clientHeader.businessAddress}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.statementTitle}>Statement of Account</Text>
            <Text>Payment #{String(statement.paymentNumber).padStart(3, '0')}</Text>
            <Text>Period: {statement.periodMonth}</Text>
            <Text>Date: {formatDate(statement.paymentDate)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Client */}
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Prepared for:</Text>
          <Text>{clientHeader.clientName}</Text>
          {clientHeader.clientCompany ? <Text style={styles.dimmed}>{clientHeader.clientCompany}</Text> : null}
          <Text style={styles.dimmed}>{clientHeader.clientAddress}</Text>
        </View>

        <View style={styles.divider} />

        {/* Royalty table */}
        <View style={{ marginBottom: 8 }}>
          <Text style={styles.sectionTitle}>Royalty Disbursements</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.colDate, { fontFamily: 'Helvetica-Bold' }]}>Date</Text>
              <Text style={[styles.colPayout, { fontFamily: 'Helvetica-Bold' }]}>Payout</Text>
              <Text style={[styles.colCommission, { fontFamily: 'Helvetica-Bold' }]}>
                Commission ({(statement.commissionRate * 100).toFixed(0)}%)
              </Text>
              <Text style={[styles.colRoyalty, { fontFamily: 'Helvetica-Bold' }]}>Royalty</Text>
            </View>
            {lineItems.map((item) => (
              <View key={item.transactionId} style={styles.tableRow}>
                <Text style={styles.colDate}>{formatDate(item.disbursementDate)}</Text>
                <Text style={styles.colPayout}>{formatMoney(item.payout)}</Text>
                <Text style={styles.colCommission}>{formatMoney(item.commission)}</Text>
                <Text style={styles.colRoyalty}>{formatMoney(item.royalty)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Royalty subtotal */}
        <View style={styles.totalsRow}>
          <Text style={styles.subtotal}>Royalty Subtotal: {formatMoney(royaltySubtotal)}</Text>
        </View>

        <View style={styles.divider} />

        {/* Other fees & charges */}
        <View style={{ marginBottom: 8 }}>
          <Text style={styles.sectionTitle}>Other Fees &amp; Charges</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.colDescription, { fontFamily: 'Helvetica-Bold' }]}>Description</Text>
              <Text style={[styles.colAmount, { fontFamily: 'Helvetica-Bold' }]}>Amount</Text>
            </View>
            {charges.map((charge) => (
              <View key={charge.subType} style={styles.tableRow}>
                <Text style={styles.colDescription}>{charge.label}</Text>
                <Text style={styles.colAmount}>{formatMoney(charge.amount)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Remittance total */}
        <View style={styles.remittanceRow}>
          <Text style={styles.remittanceText}>
            Remittance Total: {formatMoney(remittanceTotal)}
          </Text>
        </View>

        {/* Footer notes */}
        {clientHeader.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesText}>{clientHeader.notes}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
