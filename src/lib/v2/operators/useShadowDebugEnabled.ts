'use client';

import { useEffect, useState } from 'react';

/**
 * Gate for the Kael first-person shadow foundation prototype (Milestone 8,
 * Step 8E-B) — same contract as `useBodyDebugEnabled.ts`/`useGripDebugEnabled.ts`/
 * `useIkDebugEnabled.ts`: dev-only AND explicit opt-in via `?shadow=1`,
 * `/v2/range` only. Deliberately never mounted from `/v2/play`'s route at
 * all (see `V2PlayScene.tsx`, which never imports `KaelFirstPersonShadowBody`) —
 * this is a development-only engineering prototype (relaxed-A-pose,
 * unsynchronized arms, see that component's own doc comment), not a
 * player-facing feature, and must never reach a real player in either
 * route or in production.
 */
export function useShadowDebugEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get('shadow') === '1');
  }, []);

  return enabled;
}
