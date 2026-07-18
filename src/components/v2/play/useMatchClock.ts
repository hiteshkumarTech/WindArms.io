'use client';

import { useEffect, useState } from 'react';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';

/**
 * Reads the continuously-decrementing match timer via one rAF loop and
 * re-renders the HUD ONLY when the whole-second display changes — so the
 * frequently-changing store field (matchRemainingS ticks every frame)
 * never drives a per-frame React render, per the milestone's performance
 * rule. Returns [mm, ss] already floored.
 */
export function useMatchClock(): { minutes: number; seconds: number; totalSeconds: number } {
  const [totalSeconds, setTotalSeconds] = useState(() => Math.ceil(useV2MatchStore.getState().matchRemainingS));

  useEffect(() => {
    let raf = 0;
    let last = -1;
    const loop = () => {
      const whole = Math.max(0, Math.ceil(useV2MatchStore.getState().matchRemainingS));
      if (whole !== last) {
        last = whole;
        setTotalSeconds(whole);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { minutes: Math.floor(totalSeconds / 60), seconds: totalSeconds % 60, totalSeconds };
}

/** Same throttle for the countdown number (3 → 2 → 1). */
export function useCountdownValue(): number {
  const [value, setValue] = useState(() => Math.ceil(useV2MatchStore.getState().countdownRemainingS));

  useEffect(() => {
    let raf = 0;
    let last = -1;
    const loop = () => {
      const whole = Math.max(0, Math.ceil(useV2MatchStore.getState().countdownRemainingS));
      if (whole !== last) {
        last = whole;
        setValue(whole);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return value;
}
