import { useState, useRef } from 'react';
import { Stack, Text, Button, Group, Paper, ActionIcon, ThemeIcon, Anchor, Image } from '@mantine/core';
import { IconUpload, IconFile, IconX, IconInfoCircle, IconCamera, IconPhoto } from '@tabler/icons-react';
import { compressImage } from '../../../utils/imageCompression';

interface UploadStepProps {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const ACCEPT_ATTR = 'application/pdf,image/jpeg,image/png';

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export function UploadStep({ onUpload, isUploading }: UploadStepProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const addPreview = (index: number, file: File) => {
    if (isImageFile(file)) {
      const url = URL.createObjectURL(file);
      setPreviews(prev => new Map(prev).set(index, url));
    }
  };

  const removePreview = (index: number) => {
    setPreviews(prev => {
      const next = new Map(prev);
      const url = next.get(index);
      if (url) URL.revokeObjectURL(url);
      next.delete(index);
      return next;
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setError(null);

    // Validate file types
    const invalid = selected.find(f => !(ACCEPTED_TYPES as readonly string[]).includes(f.type));
    if (invalid) {
      setError('Only PDF, JPEG, and PNG files are accepted.');
      return;
    }

    // Validate file sizes (before compression)
    const tooLarge = selected.find(f => f.size > MAX_FILE_SIZE);
    if (tooLarge) {
      setError('File too large. Maximum size is 20 MB per file.');
      return;
    }

    const total = [...files, ...selected];
    if (total.length > 2) {
      setError('Maximum 2 files per upload.');
      return;
    }

    // Compress images before adding
    setIsCompressing(true);
    try {
      const processed: File[] = [];
      for (const file of selected) {
        const compressed = await compressImage(file);
        processed.push(compressed);
      }

      const startIndex = files.length;
      const newFiles = [...files, ...processed];
      setFiles(newFiles);

      // Generate previews for images
      processed.forEach((file, i) => {
        addPreview(startIndex + i, file);
      });
    } catch {
      setError('Failed to process image. Please try again.');
    } finally {
      setIsCompressing(false);
    }

    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    removePreview(index);
    setFiles(prev => prev.filter((_, i) => i !== index));
    // Rebuild preview map with shifted indices
    setPreviews(prev => {
      const next = new Map<number, string>();
      for (const [key, value] of prev) {
        if (key < index) next.set(key, value);
        else if (key > index) next.set(key - 1, value);
      }
      return next;
    });
    setError(null);
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <Stack gap="md">
      <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-dark-7)' }}>
        <Group gap="xs" mb="xs">
          <ThemeIcon variant="light" size="sm" color="blue">
            <IconInfoCircle size={14} />
          </ThemeIcon>
          <Text size="sm" fw={500}>How to get your Amazon receipts</Text>
        </Group>
        <Text size="xs" c="dimmed">
          1. Go to{' '}
          <Anchor href="https://www.amazon.com/gp/css/order-history?ref_=nav_orders_first" target="_blank" size="xs">
            Amazon Order History
          </Anchor>
          {' '}and print the page to PDF (Orders page)
        </Text>
        <Text size="xs" c="dimmed">
          2. Optionally, go to{' '}
          <Anchor href="https://www.amazon.com/cpe/yourpayments/transactions" target="_blank" size="xs">
            Amazon Payment Transactions
          </Anchor>
          {' '}and print to PDF (Transactions page)
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          You can also take a photo of a printed receipt using your phone camera.
        </Text>
      </Paper>

      {/* File picker and camera buttons */}
      <Group grow gap="sm">
        <Paper
          p="lg"
          withBorder
          style={{
            borderStyle: 'dashed',
            cursor: 'pointer',
            textAlign: 'center',
            backgroundColor: 'var(--mantine-color-dark-7)',
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Stack align="center" gap="xs">
            <ThemeIcon variant="light" size="xl" radius="xl" color="blue">
              <IconUpload size={24} />
            </ThemeIcon>
            <Text size="sm" fw={500}>Select file</Text>
            <Text size="xs" c="dimmed">PDF or photo</Text>
          </Stack>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </Paper>

        <Paper
          p="lg"
          withBorder
          style={{
            borderStyle: 'dashed',
            cursor: 'pointer',
            textAlign: 'center',
            backgroundColor: 'var(--mantine-color-dark-7)',
          }}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Stack align="center" gap="xs">
            <ThemeIcon variant="light" size="xl" radius="xl" color="teal">
              <IconCamera size={24} />
            </ThemeIcon>
            <Text size="sm" fw={500}>Take photo</Text>
            <Text size="xs" c="dimmed">Use camera</Text>
          </Stack>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </Paper>
      </Group>

      {files.length > 0 && (
        <Stack gap="xs">
          {files.map((file, i) => (
            <Paper key={i} p="sm" withBorder>
              <Group justify="space-between" align="flex-start">
                <Group gap="xs" align="flex-start">
                  {previews.has(i) ? (
                    <Image
                      src={previews.get(i)}
                      alt={file.name}
                      w={48}
                      h={48}
                      radius="sm"
                      fit="cover"
                    />
                  ) : (
                    <ThemeIcon variant="light" size="lg" color="gray">
                      {isImageFile(file) ? <IconPhoto size={18} /> : <IconFile size={18} />}
                    </ThemeIcon>
                  )}
                  <Stack gap={2}>
                    <Text size="sm" lineClamp={1}>{file.name}</Text>
                    <Text size="xs" c="dimmed">{formatSize(file.size)}</Text>
                  </Stack>
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
        disabled={files.length === 0 || isCompressing}
        loading={isUploading || isCompressing}
        leftSection={<IconUpload size={16} />}
      >
        {isCompressing ? 'Compressing...' : 'Upload & Parse'}
      </Button>
    </Stack>
  );
}
