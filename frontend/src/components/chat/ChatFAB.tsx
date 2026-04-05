import { ActionIcon, Affix, Tooltip } from '@mantine/core';
import { IconMessageChatbot } from '@tabler/icons-react';

interface ChatFABProps {
  onClick: () => void;
  isOpen: boolean;
}

export function ChatFAB({ onClick, isOpen }: ChatFABProps) {
  if (isOpen) return null;

  return (
    <Affix position={{ bottom: 20, right: 20 }} zIndex={999}>
      <Tooltip label="Chat with Budget Bot" position="left">
        <ActionIcon
          size={56}
          radius="xl"
          variant="filled"
          onClick={onClick}
          style={{ boxShadow: 'var(--mantine-shadow-lg)' }}
        >
          <IconMessageChatbot size={28} />
        </ActionIcon>
      </Tooltip>
    </Affix>
  );
}
