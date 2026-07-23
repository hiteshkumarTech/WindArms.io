'use client';

import { useEffect, useState } from 'react';

/**
 * Gate for the Kael FP-arm IK authoring tool (Step 13) — same contract as
 * `useGripDebugEnabled.ts`: dev-only AND explicit opt-in via `?ik=1`, not
 * bypassable in production (checked before the query param, and
 * `NODE_ENV` is inlined at build time for a production build).
 */
export function useIkDebugEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get('ik') === '1');
  }, []);

  return enabled;
}
