import { useState, useRef } from 'react';
import { Stack, Text, Button, Group, Paper, ActionIcon, ThemeIcon } from '@mantine/core';
import { IconUpload, IconFile, IconX, IconInfoCircle } from '@tabler/icons-react';

interface UploadStepProps {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export function UploadStep({ onUpload, isUploading }: UploadStepProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setError(null);

    // Validate
    const invalid = selected.find(f => f.type !== 'application/pdf');
    if (invalid) {
      setError('Only PDF files are accepted.');
      return;
    }

    const tooLarge = selected.find(f => f.size > MAX_FILE_SIZE);
    if (tooLarge) {
      setError('File too large. Maximum size is 20 MB per file.');
      return;
    }

    const total = [...files, ...selected];
    if (total.length > 2) {
      setError('Maximum 2 PDFs per upload (one Orders, one Transactions).');
      return;
    }

    setFiles(total);
    // Reset input so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setError(null);
  };

  return (
    <Stack gap="md">
      <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-7)' }}>
        <Group gap="xs" mb="xs">
          <ThemeIcon variant="light" size="sm" color="blue">
            <IconInfoCircle size={14} />
          </ThemeIcon>
          <Text size="sm" fw={500}>How to get your Amazon PDFs</Text>
        </Group>
        <Text size="xs" c="dimmed">
          1. Go to amazon.com/gp/css/order-history and print the page to PDF (Orders page)
        </Text>
        <Text size="xs" c="dimmed">
          2. Optionally, go to amazon.com/cpe/yourpayments/transactions and print to PDF (Transactions page)
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          Upload one or both — providing both gives the best matching accuracy.
        </Text>
      </Paper>

      <Paper
        p="xl"
        withBorder
        style={{
          borderStyle: 'dashed',
          cursor: 'pointer',
          textAlign: 'center',
          backgroundColor: 'var(--mantine-color-dark-7)',
        }}
        onClick={() => inputRef.current?.click()}
      >
        <Stack align="center" gap="xs">
          <ThemeIcon variant="light" size="xl" radius="xl" color="blue">
            <IconUpload size={24} />
          </ThemeIcon>
          <Text size="sm" fw={500}>Click to select PDF files</Text>
          <Text size="xs" c="dimmed">Up to 2 PDFs, 20 MB each</Text>
        </Stack>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </Paper>

      {files.length > 0 && (
        <Stack gap="xs">
          {files.map((file, i) => (
            <Paper key={i} p="sm" withBorder>
              <Group justify="space-between">
                <Group gap="xs">
                  <IconFile size={16} />
                  <Text size="sm">{file.name}</Text>
                  <Text size="xs" c="dimmed">({(file.size / 1024 / 1024).toFixed(1)} MB)</Text>
                </Group>
                <ActionIcon variant="subtle" size="sm" onClick={() => removeFile(i)}>
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      {error && <Text size="sm" c="red">{error}</Text>}

      <Button
        onClick={() => onUpload(files)}
        disabled={files.length === 0}
        loading={isUploading}
        leftSection={<IconUpload size={16} />}
      >
        Upload & Parse
      </Button>
    </Stack>
  );
}
