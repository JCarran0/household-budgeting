/**
 * GithubIssueActionCardEditForm — title/body/labels form for the
 * submit_github_issue action card. Mirrors the shape of the action's Zod
 * schema in backend/src/services/chatActions/submitGithubIssueAction.ts.
 */
import { useEffect } from 'react';
import {
  Stack,
  TextInput,
  Textarea,
  SegmentedControl,
  Button,
  Group,
  Text,
} from '@mantine/core';
import { useForm } from '@mantine/form';

export interface GithubIssueActionCardEditFormValues {
  title: string;
  body: string;
  labels: ('bug' | 'enhancement')[];
}

interface GithubIssueActionCardEditFormProps {
  initialValues: Record<string, unknown>;
  onSubmit: (values: GithubIssueActionCardEditFormValues) => void;
  onCancel: () => void;
  loading: boolean;
}

function pickLabel(initial: unknown): 'bug' | 'enhancement' {
  if (Array.isArray(initial)) {
    const first = initial.find(
      (l): l is 'bug' | 'enhancement' => l === 'bug' || l === 'enhancement',
    );
    if (first) return first;
  }
  return 'bug';
}

export function GithubIssueActionCardEditForm({
  initialValues,
  onSubmit,
  onCancel,
  loading,
}: GithubIssueActionCardEditFormProps) {
  const form = useForm({
    initialValues: {
      title: typeof initialValues.title === 'string' ? initialValues.title : '',
      body: typeof initialValues.body === 'string' ? initialValues.body : '',
      label: pickLabel(initialValues.labels),
    },
    validate: {
      title: (v) => (v.trim().length === 0 ? 'Title is required' : null),
      body: (v) => (v.trim().length === 0 ? 'Body is required' : null),
    },
  });

  // Re-sync when the parent provides an updated proposal
  useEffect(() => {
    form.setValues({
      title: typeof initialValues.title === 'string' ? initialValues.title : '',
      body: typeof initialValues.body === 'string' ? initialValues.body : '',
      label: pickLabel(initialValues.labels),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  const handleSubmit = form.onSubmit((values) => {
    onSubmit({
      title: values.title.trim(),
      body: values.body.trim(),
      labels: [values.label],
    });
  });

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="xs">
        <TextInput
          label="Title"
          required
          maxLength={256}
          size="sm"
          {...form.getInputProps('title')}
        />
        <Textarea
          label="Body (markdown)"
          required
          autosize
          minRows={4}
          maxRows={10}
          size="sm"
          {...form.getInputProps('body')}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>Label</Text>
          <SegmentedControl
            fullWidth
            size="xs"
            value={form.values.label}
            onChange={(v) => form.setFieldValue('label', v as 'bug' | 'enhancement')}
            data={[
              { label: 'Bug', value: 'bug' },
              { label: 'Enhancement', value: 'enhancement' },
            ]}
          />
        </div>
        <Group gap="xs" mt="xs">
          <Button type="submit" size="xs" loading={loading}>
            Confirm
          </Button>
          <Button size="xs" variant="subtle" color="gray" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
