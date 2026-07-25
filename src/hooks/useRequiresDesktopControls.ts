'use client';

import { useEffect, useState } from 'react';

/**
 * True on coarse-pointer or sub-900px devices — the same heuristic
 * `MobileNotice` uses to gate `/v2/play`, extracted here so the marketing
 * CTAs and the play-route hard block can never drift apart on what counts
 * as "needs a desktop." Resolved client-side after mount to avoid SSR
 * mismatch; defaults to false (desktop) until then.
 */
export function useRequiresDesktopControls(): boolean {
  const [requiresDesktop, setRequiresDesktop] = useState(false);

  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      setRequiresDesktop(coarse || window.innerWidth < 900);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return requiresDesktop;
}
