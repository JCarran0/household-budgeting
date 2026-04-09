import {
  Group,
  Title,
  Button,
  Menu,
  ThemeIcon,
} from '@mantine/core';
import {
  IconRefresh,
  IconDatabaseImport,
  IconDownload,
  IconSparkles,
  IconReceipt2,
  IconChevronDown,
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
  const hasAnyAiTarget = uncategorizedCount > 0 || amazonTransactionCount > 0;

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
        <Menu shadow="md" width={280} position="bottom-end">
          <Menu.Target>
            <Button
              leftSection={<IconSparkles size={16} />}
              rightSection={<IconChevronDown size={14} />}
              variant="light"
              color="violet"
              disabled={!hasAnyAiTarget}
            >
              AI Categorize
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconSparkles size={16} />}
              onClick={onOpenCategorization}
              disabled={uncategorizedCount === 0}
            >
              Uncategorized Transactions
              {uncategorizedCount > 0 && (
                <span style={{ marginLeft: 8, opacity: 0.6 }}>({uncategorizedCount})</span>
              )}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconReceipt2 size={16} />}
              onClick={onOpenAmazonReceipts}
              disabled={amazonTransactionCount === 0}
            >
              Amazon Receipt Matching
              {amazonTransactionCount > 0 && (
                <span style={{ marginLeft: 8, opacity: 0.6 }}>({amazonTransactionCount})</span>
              )}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
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
