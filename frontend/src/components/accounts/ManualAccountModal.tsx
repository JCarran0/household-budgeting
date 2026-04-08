import { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Select,
  NumberInput,
  Textarea,
  Button,
  Group,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX } from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { ManualAccount, ManualAccountCategory } from '../../../../shared/types';

const CATEGORY_OPTIONS = [
  {
    group: 'Assets',
    items: [
      { value: 'real_estate', label: 'Real Estate' },
      { value: 'vehicle', label: 'Vehicle' },
      { value: 'retirement', label: 'Retirement Account' },
      { value: 'brokerage', label: 'Brokerage Account' },
      { value: 'cash', label: 'Cash / Savings' },
      { value: 'crypto', label: 'Cryptocurrency' },
      { value: 'other_asset', label: 'Other Asset' },
    ],
  },
  {
    group: 'Liabilities',
    items: [
      { value: 'mortgage', label: 'Mortgage' },
      { value: 'auto_loan', label: 'Auto Loan' },
      { value: 'student_loan', label: 'Student Loan' },
      { value: 'personal_loan', label: 'Personal Loan' },
      { value: 'other_liability', label: 'Other Liability' },
    ],
  },
];

const LIABILITY_CATEGORIES: ManualAccountCategory[] = [
  'mortgage', 'auto_loan', 'student_loan', 'personal_loan', 'other_liability',
];

interface ManualAccountModalProps {
  opened: boolean;
  onClose: () => void;
  account?: ManualAccount | null;
}

export function ManualAccountModal({ opened, onClose, account }: ManualAccountModalProps) {
  const queryClient = useQueryClient();
  const isEditing = !!account;

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ManualAccountCategory | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number | string>(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (opened) {
      if (account) {
        setName(account.name);
        setCategory(account.category);
        setCurrentBalance(account.currentBalance);
        setNotes(account.notes || '');
      } else {
        setName('');
        setCategory(null);
        setCurrentBalance(0);
        setNotes('');
      }
    }
  }, [opened, account]);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; category: ManualAccountCategory; isAsset: boolean; currentBalance: number; notes: string | null }) =>
      api.createManualAccount(data),
    onSuccess: () => {
      notifications.show({ title: 'Account Added', message: 'Manual account created successfully', color: 'green', icon: <IconCheck size={16} /> });
      queryClient.invalidateQueries({ queryKey: ['manualAccounts'] });
      onClose();
    },
    onError: () => {
      notifications.show({ title: 'Error', message: 'Failed to create manual account', color: 'red', icon: <IconX size={16} /> });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; dto: { name?: string; category?: ManualAccountCategory; isAsset?: boolean; currentBalance?: number; notes?: string | null } }) =>
      api.updateManualAccount(data.id, data.dto),
    onSuccess: () => {
      notifications.show({ title: 'Account Updated', message: 'Manual account updated successfully', color: 'green', icon: <IconCheck size={16} /> });
      queryClient.invalidateQueries({ queryKey: ['manualAccounts'] });
      onClose();
    },
    onError: () => {
      notifications.show({ title: 'Error', message: 'Failed to update manual account', color: 'red', icon: <IconX size={16} /> });
    },
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    if (!name.trim() || !category) return;

    const isAsset = !LIABILITY_CATEGORIES.includes(category);
    const balanceNum = typeof currentBalance === 'string' ? parseFloat(currentBalance) || 0 : currentBalance;

    if (isEditing && account) {
      updateMutation.mutate({
        id: account.id,
        dto: {
          name: name.trim(),
          category,
          isAsset,
          currentBalance: balanceNum,
          notes: notes.trim() || null,
        },
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        category,
        isAsset,
        currentBalance: balanceNum,
        notes: notes.trim() || null,
      });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEditing ? 'Edit Manual Account' : 'Add Manual Account'}
      size="md"
    >
      <Stack>
        <TextInput
          label="Name"
          placeholder="e.g., Primary Residence, 401(k)"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          maxLength={100}
          required
        />

        <Select
          label="Category"
          placeholder="Select a category"
          data={CATEGORY_OPTIONS}
          value={category}
          onChange={(val) => setCategory(val as ManualAccountCategory)}
          required
        />

        <NumberInput
          label="Current Value"
          placeholder="0.00"
          prefix="$"
          value={currentBalance}
          onChange={setCurrentBalance}
          min={0}
          decimalScale={2}
          fixedDecimalScale
          thousandSeparator=","
          required
        />

        <Textarea
          label="Notes"
          placeholder="Optional notes (e.g., source of valuation)"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          maxLength={500}
          rows={2}
        />

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isLoading}
            disabled={!name.trim() || !category}
          >
            {isEditing ? 'Save Changes' : 'Add Account'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
