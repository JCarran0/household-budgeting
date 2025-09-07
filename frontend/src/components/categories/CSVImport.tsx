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
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconFileUpload,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconFileText,
} from '@tabler/icons-react';
import { api } from '../../lib/api';

interface CSVImportProps {
  opened: boolean;
  onClose: () => void;
}

export function CSVImport({ opened, onClose }: CSVImportProps) {
  const [csvContent, setCsvContent] = useState('');
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: (content: string) => api.importCategoriesFromCSV(content),
    onSuccess: (result) => {
      if (result.success) {
        notifications.show({
          title: 'Import Successful',
          message: result.message,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        queryClient.invalidateQueries({ queryKey: ['categories'] });
        handleClose();
      } else {
        setErrors(result.errors || [result.message]);
      }
    },
    onError: (error: unknown) => {
      const errorMessage = 
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 
        'Failed to import categories';
      notifications.show({
        title: 'Import Failed',
        message: errorMessage,
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      notifications.show({
        title: 'Invalid File',
        message: 'Please select a CSV file',
        color: 'red',
      });
      return;
    }

    setFileInfo({ name: file.name, size: file.size });
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCsvContent(content);
      setErrors([]);
    };
    reader.onerror = () => {
      notifications.show({
        title: 'File Read Error',
        message: 'Failed to read the CSV file',
        color: 'red',
      });
    };
    reader.readAsText(file);
  };

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCsvContent(event.target.value);
    setErrors([]);
    setFileInfo(null);
  };

  const handleImport = () => {
    if (!csvContent.trim()) {
      notifications.show({
        title: 'No Content',
        message: 'Please provide CSV content to import',
        color: 'yellow',
      });
      return;
    }
    importMutation.mutate(csvContent);
  };

  const handleClose = () => {
    setCsvContent('');
    setFileInfo(null);
    setErrors([]);
    onClose();
  };

  const sampleCSV = `Parent,Child,Type,Hidden,Savings,Description
Entertainment,Movies,,No,No,Cinema and streaming services
Entertainment,Games,,No,No,Video games and gaming subscriptions
Savings,Emergency Fund,,No,Yes,Emergency savings fund
,Groceries,,No,No,Food and household items
Travel,Flights,,Yes,No,Air travel expenses`;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Import Categories from CSV"
      size="lg"
    >
      <Stack gap="md">
        <Alert icon={<IconAlertCircle size={16} />} color="blue">
          <Text size="sm">
            Upload a CSV file with the following columns: Parent, Child, Type, Hidden, Savings, Description.
            If a parent category doesn't exist, it will be created automatically.
          </Text>
        </Alert>

        <Paper p="sm" withBorder>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={6}>CSV Format Example</Title>
              <Badge variant="light">Required: Parent, Child</Badge>
            </Group>
            <ScrollArea>
              <Code block>{sampleCSV}</Code>
            </ScrollArea>
            <Text size="xs" c="dimmed">
              Hidden and Savings columns accept: yes, true, 1, y (case-insensitive)
            </Text>
          </Stack>
        </Paper>

        <Stack gap="xs">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          
          <Button
            leftSection={<IconFileUpload size={16} />}
            onClick={() => fileInputRef.current?.click()}
            variant="light"
            fullWidth
          >
            Upload CSV File
          </Button>

          {fileInfo && (
            <Group gap="xs">
              <ThemeIcon size="sm" variant="light">
                <IconFileText size={14} />
              </ThemeIcon>
              <Text size="sm">{fileInfo.name}</Text>
              <Text size="xs" c="dimmed">
                ({(fileInfo.size / 1024).toFixed(1)} KB)
              </Text>
            </Group>
          )}

          <Text size="sm" c="dimmed" ta="center">
            OR
          </Text>

          <Textarea
            placeholder="Paste CSV content here..."
            value={csvContent}
            onChange={handleTextareaChange}
            minRows={6}
            maxRows={12}
            autosize
          />
        </Stack>

        {errors.length > 0 && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            <Stack gap="xs">
              <Text size="sm" fw={500}>Import Errors:</Text>
              <List size="sm">
                {errors.map((error, index) => (
                  <List.Item key={index}>{error}</List.Item>
                ))}
              </List>
            </Stack>
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="light" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            leftSection={<IconFileUpload size={16} />}
            onClick={handleImport}
            loading={importMutation.isPending}
            disabled={!csvContent.trim()}
          >
            Import Categories
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}