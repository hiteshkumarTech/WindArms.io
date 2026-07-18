'use client';

import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';

/**
 * The single match clock (Milestone 6). One useFrame drives the store's
 * `tick(realDeltaS)` — countdown, match timer, and respawn countdown all
 * advance from this one REAL-time source (R3F's own per-frame `rawDelta`,
 * passed through UNCAPPED here), so nothing time-based is duplicated
 * across components. Also owns the combat gate ref the shared
 * VortexFireSystem reads (weapon usable only while phase === 'active'),
 * passed down from V2PlayScene. Renders nothing.
 *
 * IMPORTANT (Skyfront Trial timing cleanup, 2026-07-18): this used to clamp
 * `rawDelta` to a max of 1/20s before ticking, on the theory that it
 * guarded against a backgrounded-tab wake-up fast-forwarding the match.
 * That clamp was the actual bug: it applied to EVERY frame, not just huge
 * outlier ones, so on any real hardware/rendering path slower than 20fps
 * the match clock silently ran in slow motion — measured as bad as a ~6-7x
 * dilation in a software-rendered/GPU-stalled environment (a 3s countdown
 * taking ~21 real seconds). The actual tab-background concern is handled
 * correctly now, at the source of truth, by `matchStore.tick()` itself
 * (`MAX_TICK_REAL_DELTA_S`) — it caps only a single large gap, not every
 * frame's real elapsed time. See docs/decisions.md for the full writeup.
 */
export default function MatchDirector({ combatGateRef }: { combatGateRef: React.MutableRefObject<boolean> }) {
  useEffect(() => {
    // Keep the gate in sync even across phase changes that happen off-frame.
    const unsub = useV2MatchStore.subscribe((state) => {
      combatGateRef.current = state.phase === 'active';
    });
    combatGateRef.current = useV2MatchStore.getState().phase === 'active';
    return unsub;
  }, [combatGateRef]);

  useFrame((_, rawDelta) => {
    useV2MatchStore.getState().tick(rawDelta);
  });

  return null;
}
