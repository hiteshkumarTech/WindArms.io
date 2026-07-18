'use client';

import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';

/**
 * The single match clock (Milestone 6). One useFrame drives the store's
 * `tick(deltaS)` — countdown, match timer, and respawn countdown all
 * advance from this one real-delta source, so nothing time-based is
 * duplicated across components. Also owns the combat gate ref the shared
 * VortexFireSystem reads (weapon usable only while phase === 'active'),
 * passed down from V2PlayScene. Renders nothing.
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
    // Clamp so an alt-tab / long frame can't fast-forward the whole match.
    const deltaS = Math.min(rawDelta, 1 / 20);
    useV2MatchStore.getState().tick(deltaS);
  });

  return null;
}
