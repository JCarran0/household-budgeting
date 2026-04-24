import {
  IconHome2,
  IconCar,
  IconPigMoney,
  IconChartLine,
  IconCurrencyDollar,
  IconCurrencyBitcoin,
  IconWallet,
  IconReceipt,
} from '@tabler/icons-react';
import type { ManualAccountCategory } from '../../../../shared/types';

export const CATEGORY_ICON_MAP: Record<ManualAccountCategory, typeof IconWallet> = {
  real_estate: IconHome2,
  vehicle: IconCar,
  retirement: IconPigMoney,
  brokerage: IconChartLine,
  cash: IconCurrencyDollar,
  crypto: IconCurrencyBitcoin,
  other_asset: IconWallet,
  mortgage: IconHome2,
  auto_loan: IconCar,
  student_loan: IconReceipt,
  personal_loan: IconReceipt,
  other_liability: IconReceipt,
};

export const CATEGORY_LABELS: Record<ManualAccountCategory, string> = {
  real_estate: 'Real Estate',
  vehicle: 'Vehicle',
  retirement: 'Retirement',
  brokerage: 'Brokerage',
  cash: 'Cash / Savings',
  crypto: 'Crypto',
  other_asset: 'Other Asset',
  mortgage: 'Mortgage',
  auto_loan: 'Auto Loan',
  student_loan: 'Student Loan',
  personal_loan: 'Personal Loan',
  other_liability: 'Other Liability',
};
