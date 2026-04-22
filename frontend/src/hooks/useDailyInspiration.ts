import { useEffect, useState } from 'react';
import { getInspirationDayKey } from '../lib/inspirationQuotes';

const STORAGE_KEY = 'inspiration:lastShown';

function hasForceParam(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('villain') === '1';
}

export function useDailyInspiration() {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    try {
      if (hasForceParam()) {
        setOpened(true);
        return;
      }
      const today = getInspirationDayKey();
      const lastShown = localStorage.getItem(STORAGE_KEY);
      if (lastShown !== today) {
        setOpened(true);
        localStorage.setItem(STORAGE_KEY, today);
      }
    } catch {
      // localStorage may be unavailable (private mode, etc.) — just skip
    }
  }, []);

  return { opened, close: () => setOpened(false) };
}
