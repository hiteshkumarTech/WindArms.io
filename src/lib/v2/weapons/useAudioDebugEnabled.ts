'use client';

import { useEffect, useState } from 'react';

/**
 * Gate for the Vortex audio diagnostic panel (Milestone 7, Phase G, Step
 * 7F) — same contract as `useAnimDebugEnabled.ts`/`useIkDebugEnabled.ts`/
 * `useGripDebugEnabled.ts`: dev-only AND explicit opt-in via `?audio=1`,
 * not bypassable in production. Absent from `/v2/play` — this hook is only
 * ever called from `/v2/range`'s own component tree.
 */
export function useAudioDebugEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get('audio') === '1');
  }, []);

  return enabled;
}
