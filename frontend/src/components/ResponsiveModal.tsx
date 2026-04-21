import { Modal } from '@mantine/core';
import type { ModalProps } from '@mantine/core';
import { useIsMobileModal } from '../hooks/useIsMobileModal';

export type { ModalProps };

/**
 * Drop-in replacement for Mantine's <Modal> that renders full-screen on
 * viewports ≤ 48em (Mantine's `sm` breakpoint / 768px).
 *
 * Desktop behaviour is unchanged — all props pass through verbatim.
 * On mobile: `fullScreen` is forced true, `size` is suppressed (Mantine
 * ignores it when fullScreen, but we strip it to avoid the prop warning),
 * and `radius` is set to 0 so there are no rounded corners on a full-screen
 * sheet.
 *
 * If the caller explicitly passes `fullScreen={true}` it is always respected.
 */
export function ResponsiveModal({ fullScreen, radius, size, ...rest }: ModalProps) {
  const isMobile = useIsMobileModal();

  const resolvedFullScreen = fullScreen ?? isMobile;
  const resolvedRadius = isMobile ? 0 : radius;
  // When fullScreen, drop `size` to avoid Mantine's noisy console warning.
  const resolvedSize = resolvedFullScreen ? undefined : size;

  return (
    <Modal
      fullScreen={resolvedFullScreen}
      radius={resolvedRadius}
      size={resolvedSize}
      {...rest}
    />
  );
}
