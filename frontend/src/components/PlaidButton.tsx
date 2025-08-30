import { Button } from '@mantine/core';
import { IconCreditCard } from '@tabler/icons-react';
import { usePlaid } from '../providers/PlaidLinkProvider';
import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';

interface PlaidButtonProps {
  variant?: 'filled' | 'light' | 'outline' | 'default';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function PlaidButton({ variant = 'filled', size = 'sm' }: PlaidButtonProps) {
  const { openPlaid, isLoading, error } = usePlaid();

  useEffect(() => {
    if (error) {
      notifications.show({
        title: 'Connection Error',
        message: error,
        color: 'red',
      });
    }
  }, [error]);

  return (
    <Button
      onClick={openPlaid}
      loading={isLoading}
      leftSection={<IconCreditCard size={16} />}
      variant={variant}
      size={size}
      gradient={{ from: 'blue', to: 'cyan' }}
    >
      Connect Bank Account
    </Button>
  );
}