import { useState } from 'react';
import {
  Modal,
  Stack,
  Select,
  RadioGroup,
  Radio,
  TextInput,
  Text,
  Group,
  Button,
  Alert,
  Badge,
  Divider,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface BulkEditModalProps {
  opened: boolean;
  onClose: () => void;
  mode: 'category' | 'description' | 'hidden';
  selectedCount: number;
  categories: Array<{ value: string; label: string; group?: string }>;
  onConfirm: (updates: BulkEditUpdates) => void;
}

export interface BulkEditUpdates {
  categoryId?: string | null;
  userDescription?: string | null;
  descriptionMode?: 'replace' | 'clear';
  isHidden?: boolean;
}

export function BulkEditModal({
  opened,
  onClose,
  mode,
  selectedCount,
  categories,
  onConfirm,
}: BulkEditModalProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [descriptionMode, setDescriptionMode] = useState<'replace' | 'clear'>('replace');
  const [description, setDescription] = useState('');
  const [hiddenMode, setHiddenMode] = useState<'hide' | 'unhide'>('hide');
  
  const handleConfirm = () => {
    const updates: BulkEditUpdates = {};
    
    if (mode === 'category') {
      if (categoryId !== null) {
        updates.categoryId = categoryId === 'uncategorized' ? null : categoryId;
      }
    } else if (mode === 'description') {
      updates.descriptionMode = descriptionMode;
      if (descriptionMode === 'replace') {
        updates.userDescription = description;
      } else if (descriptionMode === 'clear') {
        updates.userDescription = null;
      }
    } else if (mode === 'hidden') {
      updates.isHidden = hiddenMode === 'hide';
    }
    
    onConfirm(updates);
    handleClose();
  };
  
  const handleClose = () => {
    setCategoryId(null);
    setDescriptionMode('replace');
    setDescription('');
    setHiddenMode('hide');
    onClose();
  };
  
  const isValid = () => {
    if (mode === 'category') {
      return categoryId !== null;
    } else if (mode === 'description') {
      if (descriptionMode === 'replace') {
        return description.trim().length > 0;
      }
      return true; // 'clear' mode is always valid
    } else if (mode === 'hidden') {
      return true; // hidden mode is always valid
    }
    return false;
  };
  
  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group>
          <Text fw={600}>
            Bulk Edit {mode === 'category' ? 'Category' : mode === 'description' ? 'Description' : 'Visibility'}
          </Text>
          <Badge variant="filled" size="lg">
            {selectedCount} selected
          </Badge>
        </Group>
      }
      size="md"
    >
      <Stack gap="md">
        <Alert icon={<IconAlertCircle size={16} />} variant="light">
          This action will update {selectedCount} transaction{selectedCount !== 1 ? 's' : ''}.
          {mode === 'category' 
            ? ' All selected transactions will be assigned to the chosen category.'
            : mode === 'description'
            ? ' Choose how to update the descriptions below.'
            : ' Choose whether to hide or unhide the selected transactions.'}
        </Alert>
        
        {mode === 'category' ? (
          <Select
            label="Select Category"
            placeholder="Choose a category"
            data={categories}
            value={categoryId}
            onChange={setCategoryId}
            searchable
            clearable
            required
          />
        ) : mode === 'description' ? (
          <Stack gap="md">
            <RadioGroup
              label="Choose Action"
              value={descriptionMode}
              onChange={(value) => setDescriptionMode(value as 'replace' | 'clear')}
              required
            >
              <Radio value="replace" label="Set new description for all" />
              <Radio value="clear" label="Clear all descriptions (revert to original)" />
            </RadioGroup>
            
            {descriptionMode === 'replace' && (
              <TextInput
                label="New Description"
                placeholder="Enter description for all selected transactions"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            )}
          </Stack>
        ) : (
          <RadioGroup
            label="Choose Action"
            value={hiddenMode}
            onChange={(value) => setHiddenMode(value as 'hide' | 'unhide')}
            required
          >
            <Radio value="hide" label="Hide selected transactions from budgets and reports" />
            <Radio value="unhide" label="Unhide selected transactions (include in budgets and reports)" />
          </RadioGroup>
        )}
        
        <Divider />
        
        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            variant="filled" 
            onClick={handleConfirm}
            disabled={!isValid()}
          >
            Update {selectedCount} Transaction{selectedCount !== 1 ? 's' : ''}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}