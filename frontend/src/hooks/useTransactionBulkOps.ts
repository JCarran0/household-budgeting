import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Transaction } from '../../../shared/types';
import type { BulkEditUpdates } from '../components/transactions/BulkEditModal';
import { notifications } from '@mantine/notifications';

export function useTransactionBulkOps(
  paginatedTransactions: Transaction[],
  transactions: Transaction[],
) {
  const queryClient = useQueryClient();

  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [bulkEditMode, setBulkEditMode] = useState<'category' | 'description' | 'hidden' | 'flagged' | 'tags' | null>(null);

  const handleSelectAll = useCallback(() => {
    if (selectedTransactionIds.size === paginatedTransactions.length) {
      setSelectedTransactionIds(new Set());
    } else {
      const newSelection = new Set(paginatedTransactions.map(t => t.id));
      setSelectedTransactionIds(newSelection);
    }
  }, [selectedTransactionIds.size, paginatedTransactions]);

  const handleSelectTransaction = useCallback((
    transactionId: string,
    index: number,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const shiftKey = event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey;
    const ctrlKey = event.nativeEvent instanceof MouseEvent && (event.nativeEvent.ctrlKey || event.nativeEvent.metaKey);

    if (shiftKey && lastClickedId !== null) {
      const lastIndex = paginatedTransactions.findIndex(t => t.id === lastClickedId);
      if (lastIndex !== -1) {
        const startIndex = Math.min(lastIndex, index);
        const endIndex = Math.max(lastIndex, index);
        const newSelection = new Set(selectedTransactionIds);

        for (let i = startIndex; i <= endIndex; i++) {
          newSelection.add(paginatedTransactions[i].id);
        }

        setSelectedTransactionIds(newSelection);
      }
    } else if (ctrlKey) {
      const newSelection = new Set(selectedTransactionIds);
      if (newSelection.has(transactionId)) {
        newSelection.delete(transactionId);
      } else {
        newSelection.add(transactionId);
      }
      setSelectedTransactionIds(newSelection);
    } else {
      const newSelection = new Set(selectedTransactionIds);
      if (newSelection.has(transactionId)) {
        newSelection.delete(transactionId);
      } else {
        newSelection.add(transactionId);
      }
      setSelectedTransactionIds(newSelection);
    }

    setLastClickedId(transactionId);
  }, [paginatedTransactions, lastClickedId, selectedTransactionIds]);

  const handleBulkEditCategory = useCallback(() => setBulkEditMode('category'), []);
  const handleBulkEditDescription = useCallback(() => setBulkEditMode('description'), []);
  const handleBulkEditHidden = useCallback(() => setBulkEditMode('hidden'), []);
  const handleBulkEditTags = useCallback(() => setBulkEditMode('tags'), []);
  const handleBulkEditFlagged = useCallback(() => setBulkEditMode('flagged'), []);

  const handleClearSelection = useCallback(() => {
    setSelectedTransactionIds(new Set());
    setLastClickedId(null);
  }, []);

  const handleBulkEditConfirm = useCallback(async (updates: BulkEditUpdates) => {
    const selectedIds = Array.from(selectedTransactionIds);

    const notificationId = notifications.show({
      title: 'Processing',
      message: `Updating ${selectedIds.length} transactions...`,
      color: 'blue',
      loading: true,
      autoClose: false,
    });

    try {
      const apiUpdates: {
        categoryId?: string | null;
        userDescription?: string | null;
        isHidden?: boolean;
        isFlagged?: boolean;
        tagsToAdd?: string[];
        tagsToRemove?: string[];
      } = {};

      if (updates.categoryId !== undefined) {
        apiUpdates.categoryId = updates.categoryId;
      }

      if (updates.descriptionMode === 'replace' && updates.userDescription !== undefined) {
        apiUpdates.userDescription = updates.userDescription;
      } else if (updates.descriptionMode === 'clear') {
        apiUpdates.userDescription = null;
      }

      if (updates.isHidden !== undefined) {
        apiUpdates.isHidden = updates.isHidden;
      }

      if (updates.isFlagged !== undefined) {
        apiUpdates.isFlagged = updates.isFlagged;
      }

      if (updates.tagsToAdd && updates.tagsToAdd.length > 0) {
        apiUpdates.tagsToAdd = updates.tagsToAdd;
      }

      if (updates.tagsToRemove && updates.tagsToRemove.length > 0) {
        apiUpdates.tagsToRemove = updates.tagsToRemove;
      }

      if (Object.keys(apiUpdates).length > 0) {
        const result = await api.bulkUpdateTransactions(selectedIds, apiUpdates);

        notifications.update({
          id: notificationId,
          title: 'Success',
          message: `Updated ${result.updated} transactions${result.failed > 0 ? ` (${result.failed} failed)` : ''}`,
          color: result.failed > 0 ? 'yellow' : 'green',
          loading: false,
          autoClose: 5000,
        });

        if (result.errors && result.errors.length > 0) {
          console.error('Bulk update errors:', result.errors);
        }
      } else {
        notifications.update({
          id: notificationId,
          title: 'No Changes',
          message: 'No updates were made',
          color: 'gray',
          loading: false,
          autoClose: 3000,
        });
      }

      setSelectedTransactionIds(new Set());
      setBulkEditMode(null);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (error) {
      console.error('Bulk update failed:', error);
      notifications.update({
        id: notificationId,
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to update transactions',
        color: 'red',
        loading: false,
        autoClose: 5000,
      });
    }
  }, [selectedTransactionIds, queryClient]);

  // Calculate selected transaction amount
  const selectedAmount = useMemo(() => {
    let total = 0;
    for (const id of selectedTransactionIds) {
      const transaction = transactions.find(t => t.id === id);
      if (transaction) {
        total += transaction.amount;
      }
    }
    return total;
  }, [selectedTransactionIds, transactions]);

  return {
    selectedTransactionIds,
    selectedAmount,
    bulkEditMode,
    setBulkEditMode,
    handleSelectAll,
    handleSelectTransaction,
    handleBulkEditCategory,
    handleBulkEditDescription,
    handleBulkEditHidden,
    handleBulkEditTags,
    handleBulkEditFlagged,
    handleClearSelection,
    handleBulkEditConfirm,
  };
}
