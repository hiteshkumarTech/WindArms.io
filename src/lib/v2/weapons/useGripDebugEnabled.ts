'use client';

import { useEffect, useState } from 'react';

/**
 * Gate for the Vortex grip-anchor authoring tool (Step 7): dev-only AND
 * explicit opt-in via `?grips=1`, deliberately more conservative than this
 * project's general dev-mode convention (`process.env.NODE_ENV !==
 * 'production'`, used elsewhere e.g. `useAssetPipeline.ts`'s load-timer
 * logging) — this is a specialized calibration tool with visible 3D
 * markers and a DOM panel, not general-purpose dev logging, so it should
 * NOT appear on every `/v2/range` dev session by default.
 *
 * Reads `window.location.search` in an effect (not at render time) so this
 * is safe to call from a component that also renders during SSR/the first
 * client render before hydration — starts `false`, flips true after mount
 * if the query param is present, matching the read-only "grep window on
 * mount" pattern already acceptable in a 'use client' component.
 */
export function useGripDebugEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get('grips') === '1');
  }, []);

  return enabled;
}
