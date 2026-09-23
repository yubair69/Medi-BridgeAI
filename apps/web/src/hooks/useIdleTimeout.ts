import { useEffect, useRef, useState } from "react";

export interface UseIdleTimeoutOptions {
  timeoutMs?: number; // default: 15 minutes = 900,000 ms
  enabled?: boolean;
}

export function useIdleTimeout({
  timeoutMs = 15 * 60 * 1000,
  enabled = true,
}: UseIdleTimeoutOptions = {}) {
  const [isLocked, setIsLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIsLocked(true);
      }, timeoutMs);
    };

    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [timeoutMs, enabled]);

  const unlock = () => {
    setIsLocked(false);
  };

  return { isLocked, unlock };
}
