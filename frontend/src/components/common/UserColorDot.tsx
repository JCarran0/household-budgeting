import { Box, Tooltip } from '@mantine/core';
import { userColor } from '../../utils/userColor';

interface UserColorDotProps {
  user: { id?: string; userId?: string; color?: string; displayName?: string } | null | undefined;
  size?: number;
  tooltip?: boolean;
}

/**
 * Small filled circle showing a user's identity color. Useful next to a
 * display name in lists where initials alone don't disambiguate two users
 * whose names start with the same letter.
 */
export function UserColorDot({ user, size = 10, tooltip = true }: UserColorDotProps) {
  const color = userColor(user);
  const dot = (
    <Box
      component="span"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: `var(--mantine-color-${color}-7)`,
        flexShrink: 0,
      }}
      aria-hidden
    />
  );
  if (!tooltip || !user?.displayName) return dot;
  return <Tooltip label={user.displayName} withArrow>{dot}</Tooltip>;
}
