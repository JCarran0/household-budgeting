import { useEffect, useState } from 'react';

const STORAGE_KEY = 'inspiration:lastShown';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useDailyInspiration() {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    try {
      const today = todayKey();
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
