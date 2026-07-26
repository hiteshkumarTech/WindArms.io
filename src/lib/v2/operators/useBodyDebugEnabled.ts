'use client';

import { useEffect, useState } from 'react';

/**
 * Gate for the Kael lower-body calibration tool (Milestone 8, Step 8C) —
 * same contract as `useGripDebugEnabled.ts`/`useIkDebugEnabled.ts`: dev-only
 * AND explicit opt-in via `?body=1`, `/v2/range` only (never mounted from
 * `/v2/play`'s route at all — see `RangeView.tsx` vs the play route).
 */
export function useBodyDebugEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get('body') === '1');
  }, []);

  return enabled;
}
