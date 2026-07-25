'use client';

import { useEffect, useState } from 'react';

/**
 * Gate for the FP-arm action-pose (reload/inspect) preview tool (Milestone
 * 7, Phase G, Step 7C) — same contract as `useIkDebugEnabled.ts`/
 * `useGripDebugEnabled.ts`: dev-only AND explicit opt-in via `?anim=1`, not
 * bypassable in production (checked before the query param, and
 * `NODE_ENV` is inlined at build time for a production build). Absent from
 * `/v2/play` — this hook is only ever called from `/v2/range`'s own
 * component tree.
 */
export function useAnimDebugEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get('anim') === '1');
  }, []);

  return enabled;
}
