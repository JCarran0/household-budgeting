import { Modal } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EASTERN_TIME_ZONE } from '../../../shared/utils/easternTime';
import { api } from '../lib/api';
import { pickDailyQuote } from '../lib/inspirationQuotes';
import { pickVillainTaunt, type TauntContext } from '../lib/villainTaunts';
import { playVillainSting } from '../lib/villainSting';
import { useAuthStore } from '../stores/authStore';

interface InspirationModalProps {
  opened: boolean;
  onClose: () => void;
}

const VILLAIN_CHANCE = 0.18;
const PRE_DELAY_MS = 1400;
const BEAT_MS = 850;

type Stage = 0 | 1 | 2 | 3;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function InspirationModal({ opened, onClose }: InspirationModalProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const quote = useMemo(() => pickDailyQuote(), []);
  const [searchParams] = useSearchParams();
  const forceVillain = searchParams.get('villain') === '1';

  const currentUserId = useAuthStore((s) => s.user?.id) ?? null;
  const { data: family } = useQuery({
    queryKey: ['family'],
    queryFn: () => api.getFamily(),
    enabled: opened,
  });
  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'board', { includeSnoozed: true }],
    queryFn: () => api.getBoardTasks({ includeSnoozed: true }),
    enabled: opened,
  });
  const { data: leaderboard } = useQuery({
    queryKey: ['tasks', 'leaderboard'],
    queryFn: () => api.getLeaderboard(EASTERN_TIME_ZONE),
    enabled: opened,
  });

  const spouseId =
    family?.family?.members.find((m) => m.userId !== currentUserId)?.userId ?? null;

  const [villainActive, setVillainActive] = useState(false);
  const [stage, setStage] = useState<Stage>(0);
  const [villainQuote, setVillainQuote] = useState<string | null>(null);
  const decidedRef = useRef(false);

  useEffect(() => {
    if (!opened) {
      decidedRef.current = false;
      setVillainActive(false);
      setStage(0);
      setVillainQuote(null);
      return;
    }
    if (decidedRef.current) return;
    decidedRef.current = true;
    const shouldFire =
      forceVillain || (!prefersReducedMotion() && Math.random() < VILLAIN_CHANCE);
    setVillainActive(shouldFire);
  }, [opened, forceVillain]);

  useEffect(() => {
    if (!opened || !villainActive) return;
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        playVillainSting(BEAT_MS);
        setStage(1);
      }, PRE_DELAY_MS)
    );
    timers.push(window.setTimeout(() => setStage(2), PRE_DELAY_MS + BEAT_MS));
    timers.push(window.setTimeout(() => setStage(3), PRE_DELAY_MS + BEAT_MS * 2));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [opened, villainActive]);

  useEffect(() => {
    if (!opened || !villainActive || villainQuote !== null) return;
    if (!currentUserId) return;
    const ctx: TauntContext = {
      viewerId: currentUserId,
      spouseId,
      tasks: tasks ?? [],
      leaderboard: leaderboard ?? null,
      now: new Date(),
    };
    setVillainQuote(pickVillainTaunt(ctx));
  }, [opened, villainActive, villainQuote, currentUserId, spouseId, tasks, leaderboard]);

  const villainTranslatePct = stage === 0 ? 100 : stage === 1 ? 70 : stage === 2 ? 40 : 0;

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
          zIndex: 3,
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
      <style>{`
        @keyframes villainShake {
          0%, 100% { transform: translateX(0) translateY(0); }
          20% { transform: translate(-5px, 2px); }
          40% { transform: translate(6px, -3px); }
          60% { transform: translate(-4px, 3px); }
          80% { transform: translate(4px, -2px); }
        }
        @keyframes villainQuoteIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
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
          overflow: 'hidden',
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

        {villainActive && (
          <div
            aria-hidden={stage < 3}
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translateX(${villainTranslatePct}%)`,
              transition: 'transform 140ms cubic-bezier(0.2, 0.9, 0.2, 1)',
              backgroundImage: 'url(/inspiration/villain.jpg)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundColor: '#1a0f0b',
              willChange: 'transform',
              animation: stage === 3 ? 'villainShake 320ms ease-out' : undefined,
              zIndex: 2,
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
            {stage === 3 && villainQuote && (
              <div
                aria-live="polite"
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
                  animation: 'villainQuoteIn 500ms ease-out 120ms both',
                }}
              >
                {villainQuote}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
