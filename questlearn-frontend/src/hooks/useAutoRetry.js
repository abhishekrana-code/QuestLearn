import { useCallback, useEffect, useRef, useState } from 'react';

/** Gaps between tries: 3s, 4.2s, 5.9s, 8.2s, then 10s. */
const FIRST_GAP_MS = 3000;
const GAP_GROWTH = 1.4;
const MAX_GAP_MS = 10000;

/**
 * Retries a failed load on a widening gap, then stops and says so.
 *
 * The attempt count lives in this hook rather than in the caller's error flag,
 * because some callers leave that flag true while retrying, and some clear it at
 * the start of each attempt. Either way the next gap is scheduled once per try.
 *
 * @param {object} options
 * @param {boolean} options.active true while a failure is on screen; false
 *   cancels the pending timer.
 * @param {() => void | Promise<void>} options.retry re-runs the load.
 * @param {number} [options.max] automatic tries before pausing.
 */
export function useAutoRetry({ active, retry, max = 5 }) {
  const [attempts, setAttempts] = useState(0);
  const [paused, setPaused] = useState(false);
  const retryRef = useRef(retry);
  retryRef.current = retry;

  const reset = useCallback(() => {
    setAttempts(0);
    setPaused(false);
  }, []);

  const retryNow = useCallback(() => {
    setAttempts(0);
    setPaused(false);
    retryRef.current();
  }, []);

  useEffect(() => {
    if (!active || paused) return undefined;
    if (attempts >= max) {
      // Out of patience: stop quietly and leave the manual button in charge.
      setPaused(true);
      return undefined;
    }

    const gap = Math.min(MAX_GAP_MS, FIRST_GAP_MS * GAP_GROWTH ** attempts);
    const timer = setTimeout(() => {
      setAttempts((previous) => previous + 1);
      retryRef.current();
    }, gap);
    return () => clearTimeout(timer);
  }, [active, attempts, paused, max]);

  return { paused, retryNow, reset };
}
