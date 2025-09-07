import { useState, useRef } from 'react';
import {
  Modal,
  Button,
  Stack,
  Text,
  Alert,
  Group,
  List,
  ThemeIcon,
  Textarea,
  Paper,
  Title,
  Badge,
  ScrollArea,
  Code,
  Progress,
  Divider,
  Card,
  SimpleGrid,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconFileUpload,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconFileText,
  IconEye,
  IconDatabaseImport,
  IconRefresh,
  IconEdit,
} from '@tabler/icons-react';
import { api } from '../../lib/api';

interface TransactionImportProps {
  opened: boolean;
  onClose: () => void;
}

interface ImportPreviewResult {
  imported: number;
  skipped: number;
  errors: string[];
  warnings: string[];
}

export function TransactionImport({ opened, onClose }: TransactionImportProps) {
  const [csvContent, setCsvContent] = useState('');
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<'import' | 'updateCategories'>('import');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Preview mutation (dry run)
  const previewMutation = useMutation({
    mutationFn: ({ content, mode }: { content: string; mode: 'import' | 'updateCategories' }) => 
      api.importTransactionsFromCSV(content, { 
        preview: true, 
        updateCategoriesOnly: mode === 'updateCategories' 
      }),
    onSuccess: (result) => {
      if (result.success) {
        setPreviewResult({
          imported: result.data?.imported || 0,
          skipped: result.data?.skipped || 0,
          errors: result.data?.errors || [],
          warnings: result.data?.warnings || [],
        });
        setShowPreview(true);
        setErrors([]);
      } else {
        setErrors([result.error || 'Unknown error', ...(result.details || [])]);
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to preview import';
      setErrors([message]);
    },
  });

  // Import mutation (actual import)
  const importMutation = useMutation({
    mutationFn: (content: string) => api.importTransactionsFromCSV(content, { preview: false }),
    onSuccess: (result) => {
      if (result.success) {
        notifications.show({
          title: 'Import Successful',
          message: result.message,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        
        // Refresh transaction data
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        
        // Close modal and reset state
        handleClose();
      } else {
        setErrors([result.error || 'Unknown error', ...(result.details || [])]);
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to import transactions';
      setErrors([message]);
    },
  });

  // Update categories mutation (only update categories on matched transactions)
  const updateCategoriesMutation = useMutation({
    mutationFn: (content: string) => api.importTransactionsFromCSV(content, { updateCategoriesOnly: true }),
    onSuccess: (result) => {
      if (result.success) {
        notifications.show({
          title: 'Categories Updated',
          message: result.message || 'Transaction categories updated successfully',
          color: 'green',
          icon: <IconCheck size={16} />
        });
        
        // Close modal and reset state
        handleClose();
      } else {
        setErrors([result.error || 'Unknown error', ...(result.details || [])]);
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to update categories';
      setErrors([message]);
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    const validTypes = ['.csv', '.tsv', '.txt'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!validTypes.includes(fileExtension)) {
      setErrors(['Please select a CSV, TSV, or text file']);
      return;
    }

    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrors(['File size must be less than 10MB']);
      return;
    }

    setFileInfo({ name: file.name, size: file.size });
    setErrors([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCsvContent(content);
    };
    reader.readAsText(file);
  };

  const handlePreview = (mode: 'import' | 'updateCategories' = 'import') => {
    if (!csvContent.trim()) {
      setErrors(['Please select a file or enter CSV content']);
      return;
    }

    setPreviewMode(mode);
    previewMutation.mutate({ content: csvContent, mode });
  };

  const handleImport = () => {
    if (!csvContent.trim()) {
      setErrors(['Please select a file or enter CSV content']);
      return;
    }

    importMutation.mutate(csvContent);
  };

  const handleUpdateCategories = () => {
    if (!csvContent.trim()) {
      setErrors(['Please select a file or enter CSV content']);
      return;
    }

    updateCategoriesMutation.mutate(csvContent);
  };

  const handleClose = () => {
    setCsvContent('');
    setFileInfo(null);
    setPreviewResult(null);
    setErrors([]);
    setShowPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group>
          <IconDatabaseImport size={20} />
          <Text fw={600}>Import Transactions</Text>
        </Group>
      }
      size="lg"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        {/* Instructions */}
        <Alert icon={<IconAlertCircle size={16} />} color="blue">
          <Text size="sm" fw={500} mb="xs">Import transactions from another budgeting app</Text>
          <Text size="sm">
            Upload a CSV or TSV file with columns: Date, Description, Category, Amount, Institution.
            We'll automatically detect duplicates and map categories to your existing ones.
          </Text>
        </Alert>

        {/* Expected Format */}
        <Paper p="md" withBorder>
          <Title order={6} mb="xs">Expected Format (TSV recommended)</Title>
          <Code block>
            {`Date	Description	Category	Amount	Institution
9/5/2025	STARBUCKS COFFEE	Takeout	-4.50	Capital One
9/5/2025	SALARY DEPOSIT	Income	2500.00	Bank of America`}
          </Code>
          <Text size="xs" mt="xs" c="dimmed">
            • Tab-separated (TSV) or comma-separated (CSV)
            • Negative amounts = expenses, Positive = income/credits
            • Date format: M/D/YYYY or YYYY-MM-DD
          </Text>
        </Paper>

        {/* File Upload */}
        <Stack gap="xs">
          <Text fw={500}>Upload File</Text>
          <Group>
            <Button
              variant="outline"
              leftSection={<IconFileUpload size={16} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={previewMutation.isPending || importMutation.isPending}
            >
              Choose File
            </Button>
            {fileInfo && (
              <Group gap="xs">
                <ThemeIcon variant="light" color="blue">
                  <IconFileText size={16} />
                </ThemeIcon>
                <Text size="sm">
                  {fileInfo.name} ({formatFileSize(fileInfo.size)})
                </Text>
              </Group>
            )}
          </Group>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </Stack>

        {/* Manual Input */}
        <Stack gap="xs">
          <Text fw={500}>Or Paste Content</Text>
          <Textarea
            placeholder="Paste your CSV/TSV content here..."
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            minRows={6}
            disabled={previewMutation.isPending || importMutation.isPending}
          />
        </Stack>

        {/* Errors */}
        {errors.length > 0 && (
          <Alert icon={<IconX size={16} />} color="red">
            <Text fw={500} mb="xs">Import Errors</Text>
            <List size="sm">
              {errors.map((error, index) => (
                <List.Item key={index}>{error}</List.Item>
              ))}
            </List>
          </Alert>
        )}

        {/* Preview Results */}
        {showPreview && previewResult && (
          <Card withBorder>
            <Stack gap="md">
              <Group>
                <IconEye size={20} />
                <Text fw={600}>
                  {previewMode === 'updateCategories' ? 'Category Update Preview' : 'Import Preview'}
                </Text>
              </Group>

              <SimpleGrid cols={2} spacing="md">
                <Paper p="md" withBorder>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      {previewMode === 'updateCategories' ? 'Categories to Update' : 'New Transactions'}
                    </Text>
                    <Badge color={previewMode === 'updateCategories' ? 'orange' : 'green'} size="lg">
                      {previewMode === 'updateCategories' ? previewResult.skipped : previewResult.imported}
                    </Badge>
                  </Group>
                </Paper>
                <Paper p="md" withBorder>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      {previewMode === 'updateCategories' ? 'Transactions Unchanged' : 'Potential Duplicates'}
                    </Text>
                    <Badge color={previewMode === 'updateCategories' ? 'gray' : 'orange'} size="lg">
                      {previewMode === 'updateCategories' ? 0 : previewResult.skipped}
                    </Badge>
                  </Group>
                </Paper>
              </SimpleGrid>

              {previewResult.warnings.length > 0 && (
                <Alert icon={<IconAlertCircle size={16} />} color="yellow">
                  <Text fw={500} mb="xs">Preview Details</Text>
                  <List size="sm">
                    {previewResult.warnings.map((warning, index) => (
                      <List.Item key={index}>{warning}</List.Item>
                    ))}
                  </List>
                </Alert>
              )}

              {previewResult.errors.length > 0 && (
                <Alert icon={<IconX size={16} />} color="red">
                  <Text fw={500} mb="xs">Preview Issues</Text>
                  <List size="sm">
                    {previewResult.errors.map((error, index) => (
                      <List.Item key={index}>{error}</List.Item>
                    ))}
                  </List>
                </Alert>
              )}
            </Stack>
          </Card>
        )}

        <Divider />

        {/* Action Buttons */}
        <Group justify="space-between">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>

          <Group>
            {!showPreview ? (
              <Group>
                <Button
                  leftSection={<IconEye size={16} />}
                  onClick={() => handlePreview('import')}
                  loading={previewMutation.isPending}
                  disabled={!csvContent.trim()}
                  variant="outline"
                >
                  Preview Import
                </Button>
                <Button
                  leftSection={<IconEye size={16} />}
                  onClick={() => handlePreview('updateCategories')}
                  loading={previewMutation.isPending}
                  disabled={!csvContent.trim()}
                  variant="outline"
                  color="orange"
                >
                  Preview Categories Update
                </Button>
              </Group>
            ) : (
              <Button
                leftSection={<IconRefresh size={16} />}
                onClick={() => handlePreview(previewMode)}
                loading={previewMutation.isPending}
                variant="outline"
                size="sm"
              >
                Refresh Preview
              </Button>
            )}

            <Button
              leftSection={<IconDatabaseImport size={16} />}
              onClick={handleImport}
              loading={importMutation.isPending}
              disabled={!csvContent.trim()}
            >
              Import Transactions
            </Button>

            <Button
              leftSection={<IconEdit size={16} />}
              onClick={handleUpdateCategories}
              loading={updateCategoriesMutation.isPending}
              disabled={!csvContent.trim()}
              variant="outline"
              color="orange"
            >
              Update Categories
            </Button>
          </Group>
        </Group>

        {(previewMutation.isPending || importMutation.isPending || updateCategoriesMutation.isPending) && (
          <Progress value={100} animated />
        )}
      </Stack>
    </Modal>
  );
}