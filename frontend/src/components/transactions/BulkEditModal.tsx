import { useState } from 'react';
import {
  Stack,
  Select,
  RadioGroup,
  Radio,
  TextInput,
  TagsInput,
  Text,
  Group,
  Button,
  Alert,
  Badge,
  Divider,
} from '@mantine/core';
import { ResponsiveModal } from '../ResponsiveModal';
import { IconAlertCircle } from '@tabler/icons-react';

interface BulkEditModalProps {
  opened: boolean;
  onClose: () => void;
  mode: 'category' | 'description' | 'hidden' | 'flagged' | 'tags';
  selectedCount: number;
  categories: Array<{ value: string; label: string; group?: string }>;
  existingTags?: string[];
  onConfirm: (updates: BulkEditUpdates) => void;
}

export interface BulkEditUpdates {
  categoryId?: string | null;
  userDescription?: string | null;
  descriptionMode?: 'replace' | 'clear';
  isHidden?: boolean;
  isFlagged?: boolean;
  tagsToAdd?: string[];
  tagsToRemove?: string[];
  tagsMode?: 'add' | 'remove';
}

export function BulkEditModal({
  opened,
  onClose,
  mode,
  selectedCount,
  categories,
  existingTags = [],
  onConfirm,
}: BulkEditModalProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [descriptionMode, setDescriptionMode] = useState<'replace' | 'clear'>('replace');
  const [description, setDescription] = useState('');
  const [hiddenMode, setHiddenMode] = useState<'hide' | 'unhide'>('hide');
  const [flaggedMode, setFlaggedMode] = useState<'flag' | 'unflag'>('flag');
  const [tagsMode, setTagsMode] = useState<'add' | 'remove'>('add');
  const [tagValues, setTagValues] = useState<string[]>([]);

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
    } else if (mode === 'flagged') {
      updates.isFlagged = flaggedMode === 'flag';
    } else if (mode === 'tags') {
      updates.tagsMode = tagsMode;
      if (tagsMode === 'add') {
        updates.tagsToAdd = tagValues;
      } else {
        updates.tagsToRemove = tagValues;
      }
    }

    onConfirm(updates);
    handleClose();
  };

  const handleClose = () => {
    setCategoryId(null);
    setDescriptionMode('replace');
    setDescription('');
    setHiddenMode('hide');
    setFlaggedMode('flag');
    setTagsMode('add');
    setTagValues([]);
    onClose();
  };

  const isValid = () => {
    if (mode === 'category') {
      return categoryId !== null;
    } else if (mode === 'description') {
      if (descriptionMode === 'replace') {
        return description.trim().length > 0;
      }
      return true;
    } else if (mode === 'hidden') {
      return true;
    } else if (mode === 'flagged') {
      return true;
    } else if (mode === 'tags') {
      return tagValues.length > 0;
    }
    return false;
  };
  
  return (
    <ResponsiveModal
      opened={opened}
      onClose={handleClose}
      title={
        <Group>
          <Text fw={600}>
            Bulk Edit {mode === 'category' ? 'Category' : mode === 'description' ? 'Description' : mode === 'tags' ? 'Tags' : mode === 'flagged' ? 'Flag Status' : 'Visibility'}
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
            : mode === 'tags'
            ? ' Choose whether to add or remove tags below.'
            : mode === 'flagged'
            ? ' Choose whether to flag or unflag the selected transactions.'
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
        ) : mode === 'tags' ? (
          <Stack gap="md">
            <RadioGroup
              label="Choose Action"
              value={tagsMode}
              onChange={(value) => {
                setTagsMode(value as 'add' | 'remove');
                setTagValues([]);
              }}
              required
            >
              <Radio value="add" label="Add tags to selected transactions" />
              <Radio value="remove" label="Remove tags from selected transactions" />
            </RadioGroup>

            <TagsInput
              label={tagsMode === 'add' ? 'Tags to Add' : 'Tags to Remove'}
              placeholder={tagsMode === 'add' ? 'Type a tag and press Enter' : 'Select tags to remove'}
              data={existingTags}
              value={tagValues}
              onChange={setTagValues}
              clearable
            />
          </Stack>
        ) : mode === 'hidden' ? (
          <RadioGroup
            label="Choose Action"
            value={hiddenMode}
            onChange={(value) => setHiddenMode(value as 'hide' | 'unhide')}
            required
          >
            <Radio value="hide" label="Hide selected transactions from budgets and reports" />
            <Radio value="unhide" label="Unhide selected transactions (include in budgets and reports)" />
          </RadioGroup>
        ) : mode === 'flagged' ? (
          <RadioGroup
            label="Choose Action"
            value={flaggedMode}
            onChange={(value) => setFlaggedMode(value as 'flag' | 'unflag')}
            required
          >
            <Radio value="flag" label="Flag selected transactions for discussion" />
            <Radio value="unflag" label="Remove flag from selected transactions" />
          </RadioGroup>
        ) : null}
        
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
    </ResponsiveModal>
  );
}