import { Alert, Button, Group, Text } from '@mantine/core';
import { IconAlertCircle, IconCategory } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useFilterStore } from '../../stores/filterStore';
import type { ExtendedPlaidAccount } from '../../lib/api';

interface DashboardAlertsProps {
  accounts: ExtendedPlaidAccount[] | undefined;
  uncategorizedData: { count: number; total: number } | undefined;
}

export function DashboardAlerts({ accounts, uncategorizedData }: DashboardAlertsProps) {
  const navigate = useNavigate();

  return (
    <>
      {/* Accounts Needing Sign-in Alert */}
      {accounts && accounts.filter(a => a.status === 'requires_reauth').length > 0 && (
        <Alert
          icon={<IconAlertCircle size={20} />}
          title="Bank Sign-in Required"
          color="orange"
          variant="filled"
          styles={{
            root: { cursor: 'pointer' },
          }}
          onClick={() => navigate('/accounts')}
        >
          <Text size="sm">
            {accounts.filter(a => a.status === 'requires_reauth').length === 1
              ? `${accounts.find(a => a.status === 'requires_reauth')?.nickname || accounts.find(a => a.status === 'requires_reauth')?.name} requires you to sign in again to continue syncing.`
              : `${accounts.filter(a => a.status === 'requires_reauth').length} accounts require you to sign in again to continue syncing.`}
            {' '}Click here to sign in.
          </Text>
        </Alert>
      )}

      {/* Uncategorized Transactions Alert */}
      {uncategorizedData && uncategorizedData.count > 0 && (
        <Alert
          icon={<IconAlertCircle size={20} />}
          title="Uncategorized Transactions"
          color={uncategorizedData.count > 10 ? 'red' : 'orange'}
          variant="filled"
          styles={{
            root: { cursor: 'pointer' },
          }}
          onClick={() => {
            useFilterStore.getState().resetTransactionFilters();
            useFilterStore.getState().setTransactionFilters({ onlyUncategorized: true });
            navigate('/transactions');
          }}
        >
          <Group justify="space-between">
            <Text size="sm">
              You have {uncategorizedData.count} uncategorized transaction{uncategorizedData.count !== 1 ? 's' : ''}
              {' '}({Math.round((uncategorizedData.count / uncategorizedData.total) * 100)}% of total).
              Click here to categorize them.
            </Text>
            <Button
              size="xs"
              variant="white"
              color={uncategorizedData.count > 10 ? 'red' : 'orange'}
              leftSection={<IconCategory size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                navigate('/categories');
              }}
            >
              Manage Categories
            </Button>
          </Group>
        </Alert>
      )}
    </>
  );
}
