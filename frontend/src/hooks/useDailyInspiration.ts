import { useEffect, useState } from 'react';
import { getInspirationDayKey } from '../lib/inspirationQuotes';

const STORAGE_KEY = 'inspiration:lastShown';

export function useDailyInspiration() {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    try {
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
