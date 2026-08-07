'use client';

import { useEffect, useState } from 'react';

/**
 * Milestone 9H — dev-only activation gate for Drone AI observability. Same
 * dual-gate contract as every sibling debug hook in this codebase
 * (`useShadowDebugEnabled.ts`/`useBodyDebugEnabled.ts`/`useGripDebugEnabled.ts`/
 * etc.): dev-only AND explicit opt-in via `?droneAiDebug=1`, `/v2/play` only.
 *
 * `process.env.NODE_ENV === 'production'` is checked FIRST and short-circuits
 * before the query string is even read — a production build can never arm
 * this regardless of what query string a request arrives with. The
 * `useState`/`useEffect` split (rather than a synchronous read during render)
 * mirrors the existing precedent exactly: `window.location` is only safe to
 * read after mount, and starting `false` means server-rendered/first-paint
 * markup is always the same "disabled" shape a production build would show.
 *
 * Deliberately never imported by `/v2/range`'s `RangeView.tsx` or V1 `/play`
 * — see `droneAiImportGuards.test.ts`'s own Milestone 9H route-scoping guard.
 */
export function useDroneAiDebugEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get('droneAiDebug') === '1');
  }, []);

  return enabled;
}
