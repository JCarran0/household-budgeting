import { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Modal,
  Stack,
  Group,
  Title,
  Text,
  TextInput,
  Textarea,
  Button,
  SegmentedControl,
  Alert,
  ThemeIcon,
  Divider,
  Badge,
  Paper,
  ScrollArea,
  Collapse,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconBug,
  IconBulb,
  IconAlertCircle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

interface FeedbackModalProps {
  opened: boolean;
  onClose: () => void;
}

type FeedbackType = 'bug' | 'feature';

interface ApplicationState {
  route: string;
  searchParams: string;
  userAgent: string;
  timestamp: string;
  username: string;
  windowSize: {
    width: number;
    height: number;
  };
  filters?: Record<string, unknown>;
}

const BUG_TEMPLATE = `**Steps to Reproduce:**
1.
2.
3.

**Expected Behavior:**


**Actual Behavior:**


**Additional Details:**
`;

const FEATURE_TEMPLATE = `**Problem/Need:**


**Proposed Solution:**


**Use Case:**


**Acceptance Criteria:**
- [ ]
- [ ]
`;

export function FeedbackModal({ opened, onClose }: FeedbackModalProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  const [feedbackType, setFeedbackType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [showStatePreview, setShowStatePreview] = useState(false);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (opened) {
      setTitle('');
      setDescription('');
      setEmail('');
      setFeedbackType('bug');
      setShowStatePreview(false);
    }
  }, [opened]);

  // Update description template when feedback type changes
  useEffect(() => {
    if (description === '' || description === BUG_TEMPLATE || description === FEATURE_TEMPLATE) {
      setDescription(feedbackType === 'bug' ? BUG_TEMPLATE : FEATURE_TEMPLATE);
    }
  }, [feedbackType, description]);

  // Capture application state
  const captureApplicationState = (): ApplicationState => {
    // Get filters from URL params if available
    const filters: Record<string, unknown> = {};
    searchParams.forEach((value, key) => {
      filters[key] = value;
    });

    return {
      route: location.pathname,
      searchParams: searchParams.toString(),
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      username: user?.username || 'unknown',
      windowSize: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };
  };

  const submitFeedbackMutation = useMutation({
    mutationFn: async (data: {
      type: FeedbackType;
      title: string;
      description: string;
      email?: string;
      applicationState?: ApplicationState;
    }) => {
      return api.submitFeedback(data);
    },
    onSuccess: () => {
      notifications.show({
        title: 'Feedback Submitted',
        message: 'Thank you for your feedback! We\'ll review it soon.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      onClose();
    },
    onError: (error: Error) => {
      notifications.show({
        title: 'Submission Failed',
        message: error.message || 'Failed to submit feedback. Please try again.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const handleSubmit = () => {
    if (!title.trim() || !description.trim()) {
      notifications.show({
        title: 'Required Fields',
        message: 'Please fill in both title and description.',
        color: 'orange',
        icon: <IconAlertCircle size={16} />,
      });
      return;
    }

    const applicationState = feedbackType === 'bug' ? captureApplicationState() : undefined;

    submitFeedbackMutation.mutate({
      type: feedbackType,
      title: title.trim(),
      description: description.trim(),
      email: email.trim() || undefined,
      applicationState,
    });
  };

  const applicationState = captureApplicationState();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <ThemeIcon
            variant="light"
            color={feedbackType === 'bug' ? 'red' : 'blue'}
            size="lg"
          >
            {feedbackType === 'bug' ? <IconBug size={18} /> : <IconBulb size={18} />}
          </ThemeIcon>
          <div>
            <Title order={3}>Submit Feedback</Title>
            <Text size="sm" c="dimmed">
              Help us improve the application
            </Text>
          </div>
        </Group>
      }
      size="lg"
      centered
      styles={{
        content: {
          maxHeight: '90vh',
        },
        body: {
          maxHeight: '75vh',
          overflow: 'hidden',
        },
      }}
    >
      <ScrollArea style={{ height: '75vh' }}>
        <Stack gap="md">
          {/* Feedback Type Toggle */}
          <div>
            <Text size="sm" fw={500} mb="xs">
              What kind of feedback are you providing?
            </Text>
            <SegmentedControl
              value={feedbackType}
              onChange={(value) => setFeedbackType(value as FeedbackType)}
              data={[
                {
                  label: (
                    <Group gap="xs">
                      <IconBug size={16} />
                      <span>Bug Report</span>
                    </Group>
                  ),
                  value: 'bug',
                },
                {
                  label: (
                    <Group gap="xs">
                      <IconBulb size={16} />
                      <span>Feature Request</span>
                    </Group>
                  ),
                  value: 'feature',
                },
              ]}
              fullWidth
            />
          </div>

          {/* Helpful Guidelines */}
          <Alert
            variant="light"
            color={feedbackType === 'bug' ? 'red' : 'blue'}
            title={feedbackType === 'bug' ? 'Bug Report Guidelines' : 'Feature Request Guidelines'}
            icon={<IconInfoCircle size={16} />}
          >
            {feedbackType === 'bug' ? (
              <Text size="sm">
                Please provide clear steps to reproduce the issue, what you expected to happen,
                and what actually happened. Application state will be automatically captured.
              </Text>
            ) : (
              <Text size="sm">
                Describe the problem you're trying to solve, your proposed solution,
                and how it would benefit you and other users.
              </Text>
            )}
          </Alert>

          <Divider />

          {/* Title Field */}
          <TextInput
            label="Title"
            placeholder={
              feedbackType === 'bug'
                ? 'Brief description of the bug (e.g., "Cannot save transaction category")'
                : 'Brief description of the feature (e.g., "Add transaction search filters")'
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={100}
            description={`${title.length}/100 characters`}
          />

          {/* Description Field */}
          <Textarea
            label="Description"
            placeholder="Please provide detailed information..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            minRows={8}
            maxRows={12}
            maxLength={2000}
            description={`${description.length}/2000 characters`}
          />

          {/* Optional Email */}
          <TextInput
            label="Email (Optional)"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            description="If you'd like to be contacted about this feedback"
          />

          {/* Application State Preview (Bug Reports Only) */}
          {feedbackType === 'bug' && (
            <div>
              <Group justify="space-between" align="center" mb="xs">
                <Text size="sm" fw={500}>
                  Application State
                  <Badge size="xs" variant="light" color="blue" ml="xs">
                    Auto-captured
                  </Badge>
                </Text>
                <Tooltip label={showStatePreview ? 'Hide details' : 'Show details'}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => setShowStatePreview(!showStatePreview)}
                  >
                    {showStatePreview ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                  </ActionIcon>
                </Tooltip>
              </Group>

              <Collapse in={showStatePreview}>
                <Paper withBorder p="sm" bg="gray.0" style={{ fontSize: '12px' }}>
                  <Stack gap={4}>
                    <Text><strong>Page:</strong> {applicationState.route}</Text>
                    <Text><strong>Time:</strong> {new Date(applicationState.timestamp).toLocaleString()}</Text>
                    <Text><strong>Browser:</strong> {applicationState.userAgent}</Text>
                    <Text><strong>Window:</strong> {applicationState.windowSize.width}×{applicationState.windowSize.height}</Text>
                    {applicationState.filters && Object.keys(applicationState.filters).length > 0 && (
                      <Text><strong>Filters:</strong> {JSON.stringify(applicationState.filters, null, 2)}</Text>
                    )}
                  </Stack>
                </Paper>
              </Collapse>
            </div>
          )}

          <Divider />

          {/* Submit Buttons */}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              loading={submitFeedbackMutation.isPending}
              leftSection={feedbackType === 'bug' ? <IconBug size={16} /> : <IconBulb size={16} />}
            >
              Submit {feedbackType === 'bug' ? 'Bug Report' : 'Feature Request'}
            </Button>
          </Group>
        </Stack>
      </ScrollArea>
    </Modal>
  );
}