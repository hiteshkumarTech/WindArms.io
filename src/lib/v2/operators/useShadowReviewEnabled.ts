'use client';

import { useEffect, useState } from 'react';

/**
 * Gate for the shadow REVIEW harness (Milestone 8, Step 8E-C.3) — an
 * external, dev-only observation camera + neutral receiver surface for
 * visually calibrating the shadow rig from outside the character, since the
 * first-person camera cannot see its own body/shadow (Step 8E-C.2's
 * documented finding). Same dual-gate contract as every sibling debug hook
 * (`useShadowDebugEnabled.ts`/`useBodyDebugEnabled.ts`/etc.): dev-only AND
 * explicit opt-in, `/v2/range` only, never `/v2/play`, never production.
 *
 * DELIBERATELY layered ON TOP of `useShadowDebugEnabled()`, not standalone —
 * the URL contract is `?shadow=1&shadowReview=1` (both flags required). This
 * is not a duplicate gate: it means the review harness can never be enabled
 * without the shadow prototype itself also being enabled (there would be
 * nothing to review otherwise), and it keeps the two concerns — "mount the
 * shadow prototype" vs. "mount the external validation-only camera/receiver
 * on top of it" — as two independently-toggleable, explicitly-named flags
 * rather than overloading one flag with two meanings.
 */
export function useShadowReviewEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get('shadow') === '1' && params.get('shadowReview') === '1');
  }, []);

  return enabled;
}
