import {
  Group,
  Title,
  Button,
  ThemeIcon,
} from '@mantine/core';
import {
  IconRefresh,
  IconDatabaseImport,
  IconDownload,
  IconSparkles,
  IconReceipt2,
} from '@tabler/icons-react';

interface TransactionToolbarProps {
  isFetching: boolean;
  hasTransactions: boolean;
  isSyncing: boolean;
  uncategorizedCount: number;
  amazonTransactionCount: number;
  onSync: () => void;
  onOpenCategorization: () => void;
  onOpenAmazonReceipts: () => void;
  onOpenImport: () => void;
  onExportTSV: () => void;
}

export function TransactionToolbar({
  isFetching,
  hasTransactions,
  isSyncing,
  uncategorizedCount,
  amazonTransactionCount,
  onSync,
  onOpenCategorization,
  onOpenAmazonReceipts,
  onOpenImport,
  onExportTSV,
}: TransactionToolbarProps) {
  return (
    <Group justify="space-between">
      <Group gap="xs">
        <Title order={2}>Transactions</Title>
        {isFetching && hasTransactions && (
          <ThemeIcon variant="subtle" size="sm" radius="xl">
            <IconRefresh size={14} style={{ animation: 'spin 1s linear infinite' }} />
          </ThemeIcon>
        )}
      </Group>
      <Group>
        <Button
          leftSection={<IconSparkles size={16} />}
          onClick={onOpenCategorization}
          variant="light"
          color="violet"
          disabled={uncategorizedCount === 0}
        >
          AI Categorize{uncategorizedCount > 0 ? ` (${uncategorizedCount})` : ''}
        </Button>
        <Button
          leftSection={<IconReceipt2 size={16} />}
          onClick={onOpenAmazonReceipts}
          variant="light"
          color="orange"
          disabled={amazonTransactionCount === 0}
        >
          Amazon Receipts{amazonTransactionCount > 0 ? ` (${amazonTransactionCount})` : ''}
        </Button>
        <Button
          leftSection={<IconDatabaseImport size={16} />}
          onClick={onOpenImport}
          variant="light"
        >
          Import CSV
        </Button>
        <Button
          leftSection={<IconDownload size={16} />}
          onClick={onExportTSV}
          variant="light"
          disabled={!hasTransactions}
        >
          Export TSV
        </Button>
        <Button
          leftSection={<IconRefresh size={16} />}
          onClick={onSync}
          loading={isSyncing}
        >
          Sync Transactions
        </Button>
      </Group>
    </Group>
  );
}
