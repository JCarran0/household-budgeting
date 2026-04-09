import { format } from 'date-fns';
import type { Transaction, Category } from '../../../shared/types';
import type { ExtendedPlaidAccount } from '../lib/api';
import { formatCurrency } from './formatters';
import { notifications } from '@mantine/notifications';
import {
  isIncomeCategoryHierarchical,
  isTransferCategory,
  createCategoryLookup,
} from '../../../shared/utils/categoryHelpers';

export function exportTransactionsToTSV(
  transactions: Transaction[],
  accounts: ExtendedPlaidAccount[] | undefined,
  categories: Category[] | undefined,
): void {
  if (transactions.length === 0) {
    notifications.show({
      title: 'No Data',
      message: 'No transactions to export',
      color: 'yellow',
    });
    return;
  }

  const headers = [
    'Date',
    'Description',
    'Amount',
    'Category',
    'Type',
    'Category Hidden',
    'Category Rollover',
    'Account',
    'Institution',
    'Merchant',
    'Tags',
    'Notes',
    'Transaction Hidden',
  ];

  const escapeTSV = (value: string | null | undefined): string => {
    if (value == null) return '';
    const str = String(value);
    return str.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');
  };

  const getAccountInfo = (accountId: string) => {
    const account = accounts?.find(a => a.id === accountId);
    return {
      accountName: account?.nickname || account?.officialName || account?.accountName || account?.name || 'Unknown',
      institution: account?.institutionName || account?.institution || 'Unknown',
    };
  };

  const getCategoryDisplay = (transaction: Transaction) => {
    if (!transaction.categoryId || !categories) return null;
    const category = categories.find(c => c.id === transaction.categoryId);
    if (!category) return null;
    const parentCategory = category.parentId
      ? categories.find(p => p.id === category.parentId)
      : null;
    return parentCategory
      ? `${parentCategory.name} → ${category.name}`
      : category.name;
  };

  const categoryLookup = categories ? createCategoryLookup(categories) : new Map();

  const rows = transactions.map(transaction => {
    const { accountName, institution } = getAccountInfo(transaction.accountId);
    const categoryDisplay = getCategoryDisplay(transaction) || 'Uncategorized';
    const description = transaction.userDescription || transaction.name;
    const tags = transaction.tags?.join('; ') || '';
    const transactionHidden = transaction.isHidden ? 'Yes' : 'No';

    const category = transaction.categoryId && categories
      ? categories.find(c => c.id === transaction.categoryId)
      : null;

    const categoryType = !transaction.categoryId ? 'Uncategorized' :
      isIncomeCategoryHierarchical(transaction.categoryId, categoryLookup) ? 'Income' :
      isTransferCategory(transaction.categoryId) ? 'Transfer' : 'Expense';

    const categoryHidden = category?.isHidden ? 'Yes' : 'No';
    const categoryRollover = category?.isRollover ? 'Yes' : 'No';

    return [
      escapeTSV(transaction.date),
      escapeTSV(description),
      escapeTSV(formatCurrency(transaction.amount, true).replace('$', '')),
      escapeTSV(categoryDisplay),
      escapeTSV(categoryType),
      escapeTSV(categoryHidden),
      escapeTSV(categoryRollover),
      escapeTSV(accountName),
      escapeTSV(institution),
      escapeTSV(transaction.merchantName),
      escapeTSV(tags),
      escapeTSV(transaction.notes),
      escapeTSV(transactionHidden),
    ].join('\t');
  });

  const tsvContent = [headers.join('\t'), ...rows].join('\n');
  const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const today = format(new Date(), 'yyyy-MM-dd');
  link.download = `transactions-export-${today}.tsv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  notifications.show({
    title: 'Export Complete',
    message: `Exported ${transactions.length} transactions to TSV`,
    color: 'green',
  });
}
