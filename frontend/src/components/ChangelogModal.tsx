import { useQuery } from '@tanstack/react-query';
import { 
  Modal, 
  Text, 
  Stack, 
  Skeleton, 
  Center, 
  ScrollArea,
  Alert,
  ThemeIcon,
} from '@mantine/core';
import { 
  IconAlertCircle,
  IconBook,
} from '@tabler/icons-react';
import { api } from '../lib/api';

interface ChangelogModalProps {
  opened: boolean;
  onClose: () => void;
}

export function ChangelogModal({
  opened,
  onClose,
}: ChangelogModalProps) {
  const {
    data: changelogData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['changelog'],
    queryFn: api.getChangelog,
    enabled: opened, // Only fetch when modal is opened
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const renderMarkdownText = (text: string) => {
    // Process markdown formatting in text
    const parts = [];
    const currentText = text;
    let key = 0;

    // Process bold text (**text**)
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(currentText)) !== null) {
      // Add text before the bold
      if (match.index > lastIndex) {
        const beforeText = currentText.substring(lastIndex, match.index);
        if (beforeText) {
          parts.push(<span key={key++}>{beforeText}</span>);
        }
      }
      
      // Add the bold text
      parts.push(
        <Text key={key++} component="span" fw={600} c="blue">
          {match[1]}
        </Text>
      );
      
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last bold
    if (lastIndex < currentText.length) {
      const remainingText = currentText.substring(lastIndex);
      
      // Process links in the remaining text
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let linkLastIndex = 0;
      let linkMatch;
      
      while ((linkMatch = linkRegex.exec(remainingText)) !== null) {
        // Add text before the link
        if (linkMatch.index > linkLastIndex) {
          const beforeLink = remainingText.substring(linkLastIndex, linkMatch.index);
          if (beforeLink) {
            parts.push(<span key={key++}>{beforeLink}</span>);
          }
        }
        
        // Add the link as clickable text
        parts.push(
          <Text 
            key={key++} 
            component="a" 
            href={linkMatch[2]} 
            target="_blank" 
            rel="noopener noreferrer"
            c="blue"
            td="underline"
            style={{ cursor: 'pointer' }}
          >
            {linkMatch[1]}
          </Text>
        );
        
        linkLastIndex = linkMatch.index + linkMatch[0].length;
      }
      
      // Add remaining text after last link
      if (linkLastIndex < remainingText.length) {
        const finalText = remainingText.substring(linkLastIndex);
        if (finalText) {
          parts.push(<span key={key++}>{finalText}</span>);
        }
      } else if (parts.length === 0) {
        // No links found, add the entire remaining text
        parts.push(<span key={key++}>{remainingText}</span>);
      }
    }

    return parts.length > 0 ? parts : text;
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <Stack gap="md">
          <Skeleton height={20} />
          <Skeleton height={20} />
          <Skeleton height={20} />
          <Skeleton height={20} />
          <Skeleton height={20} />
        </Stack>
      );
    }

    if (isError || !changelogData?.success) {
      return (
        <Center>
          <Alert 
            variant="light" 
            color="red" 
            title="Error Loading Changelog"
            icon={<IconAlertCircle size={16} />}
          >
            {error instanceof Error 
              ? error.message 
              : changelogData?.error || 'Failed to load changelog content'
            }
          </Alert>
        </Center>
      );
    }

    // Render changelog content with better formatting
    const content = changelogData.content;
    const lines = content.split('\n').filter(line => line.trim() !== ''); // Remove empty lines

    return (
      <Stack gap="xs" style={{ fontFamily: 'system-ui', fontSize: '14px', lineHeight: 1.6 }}>
        {lines.map((line, index) => {
          const trimmedLine = line.trim();
          
          // Skip completely empty lines
          if (!trimmedLine) return null;

          // Main header (# Changelog)
          if (trimmedLine.startsWith('# ')) {
            return (
              <Text key={index} size="xl" fw={700} mt="xl" mb="lg" c="blue">
                {trimmedLine.substring(2)}
              </Text>
            );
          }

          // Version headers (## [1.12.0] or ### [1.10.3])
          if (trimmedLine.startsWith('## ')) {
            const versionText = trimmedLine.substring(3);
            return (
              <Text key={index} size="lg" fw={600} mt="xl" mb="md" c="green">
                {renderMarkdownText(versionText)}
              </Text>
            );
          }

          // Check if ### line is a version header (contains [version](link)) or section header
          if (trimmedLine.startsWith('### ')) {
            const content = trimmedLine.substring(4);
            // If it contains a version pattern [x.x.x](url), treat as version header
            if (/\[\d+\.\d+\.\d+\]/.test(content)) {
              return (
                <Text key={index} size="lg" fw={600} mt="xl" mb="md" c="green">
                  {renderMarkdownText(content)}
                </Text>
              );
            } else {
              // Regular section header (Features, Bug Fixes, etc.)
              return (
                <Text key={index} size="md" fw={500} mt="lg" mb="sm" c="orange">
                  {content}
                </Text>
              );
            }
          }
          
          // List items with better bullet formatting
          if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
            const listContent = trimmedLine.substring(2);
            return (
              <Text key={index} size="sm" ml="lg" style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ marginRight: '8px', color: 'var(--mantine-color-blue-6)' }}>•</span>
                <span>{renderMarkdownText(listContent)}</span>
              </Text>
            );
          }

          // Check for metadata lines before processing
          if (trimmedLine.startsWith('The format is based on') || 
              trimmedLine.startsWith('and this project adheres to')) {
            return (
              <Text key={index} size="xs" c="dimmed" mt="sm">
                {renderMarkdownText(trimmedLine)}
              </Text>
            );
          }

          // Regular text - process markdown
          return (
            <Text key={index} size="sm" mt="xs">
              {renderMarkdownText(trimmedLine)}
            </Text>
          );
        }).filter(Boolean)}
      </Stack>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Stack gap={4}>
          <Text size="lg" fw={600}>
            <ThemeIcon variant="light" size="sm" mr="xs" style={{ display: 'inline-flex' }}>
              <IconBook size={16} />
            </ThemeIcon>
            Changelog
          </Text>
          <Text size="xs" c="dimmed">
            Version history and release notes
          </Text>
        </Stack>
      }
      size="xl"
      centered
      styles={{
        content: {
          maxHeight: '90vh',
        },
        body: {
          maxHeight: '70vh',
          overflow: 'hidden',
        },
      }}
    >
      <ScrollArea style={{ height: '70vh' }} type="scroll">
        {renderContent()}
      </ScrollArea>
    </Modal>
  );
}