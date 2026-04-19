import { Modal } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useMemo } from 'react';
import { pickDailyQuote } from '../lib/inspirationQuotes';

interface InspirationModalProps {
  opened: boolean;
  onClose: () => void;
}

export function InspirationModal({ opened, onClose }: InspirationModalProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const quote = useMemo(() => pickDailyQuote(), []);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      padding={0}
      centered
      withCloseButton
      fullScreen={isMobile}
      size="auto"
      radius={isMobile ? 0 : 'lg'}
      overlayProps={{ backgroundOpacity: 0.65, blur: 3 }}
      styles={{
        body: { padding: 0 },
        content: { overflow: 'hidden' },
        header: {
          position: 'absolute',
          top: 0,
          right: 0,
          left: 'auto',
          zIndex: 2,
          background: 'transparent',
          padding: 8,
          minHeight: 0,
        },
        close: {
          color: 'white',
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(4px)',
        },
      }}
    >
      <div
        style={{
          position: 'relative',
          width: isMobile ? '100vw' : 'min(520px, 92vw)',
          height: isMobile ? '100dvh' : 'min(780px, 88vh)',
          aspectRatio: isMobile ? undefined : '2 / 3',
          backgroundImage: 'url(/inspiration/pilot.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#0b1b2b',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to bottom, transparent 42%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.65) 78%, rgba(0,0,0,0.8) 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '66%',
            padding: '0 28px',
            color: 'white',
            fontFamily: "'Fraunces', 'Georgia', serif",
            fontWeight: 600,
            fontSize: isMobile ? 32 : 28,
            lineHeight: 1.2,
            letterSpacing: '-0.015em',
            textAlign: 'center',
            textShadow: '0 2px 14px rgba(0,0,0,0.55)',
          }}
        >
          {quote}
        </div>
      </div>
    </Modal>
  );
}
