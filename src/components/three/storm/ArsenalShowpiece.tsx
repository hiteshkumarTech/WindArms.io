'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import WeaponShowpiece from '@/components/three/weapons/WeaponShowpiece';
import { ProceduralAeolus } from './AeolusShowpiece';
import { fovPresenceScale } from '@/lib/v2/responsiveCamera';
import { scrollState } from '@/lib/v2/scrollProgress';

/**
 * Window boundaries mirror the approach/reveal/hold/transition-out
 * keyframes in StormBackdrop's CAMERA_PATH around the arsenal beat
 * (0.16 / 0.23 / 0.31 / 0.38) — kept as separate constants here (not
 * imported from that array) since this module has no dependency on
 * StormBackdrop and shouldn't gain one just to share four numbers. Keep
 * these in sync if the camera keyframes move again.
 */
const APPROACH_START = 0.1;
const REVEAL_AT = 0.23;
const HOLD_END = 0.31;
const EXIT_END = 0.4;

/**
 * World positions sit on the reveal camera's actual look ray (pos=[3.4,1.6,
 * 7.5], look=[0.5,1.8,-18] in StormBackdrop's CAMERA_PATH), not just "close
 * to it" — screenshot-checked (2026-07-20): an earlier pass placed the
 * rifle off the sightline and at too shallow a depth, so it read as a small
 * detail lost against SkyCitadel's much larger ring/spire silhouette
 * (same [4.5, 0, -18] backdrop hero already frames, per HeroSection's own
 * legibility-scrim precedent). Centering on the look ray and closing the
 * distance to the camera is what actually won the frame back, not a scale
 * hack. Retune again if the arsenal DOM section's real height shifts where
 * this beat lands in scroll.
 */
const DISTANT_POSITION = new THREE.Vector3(2.3, 1.72, -5);
const RESTING_POSITION = new THREE.Vector3(2.95, 1.63, 3.5);
const EXIT_POSITION = new THREE.Vector3(1.9, 2.5, -8);

/**
 * Scale here is a presence multiplier on top of WeaponShowpiece's own
 * fixed visual.scale (2.9 for Vortex, applied inside PipelineModel) — 1.0
 * would be "full, correctly-tuned size." Boosted past that deliberately,
 * matching the precedent already set by visualConfigs.ts's own comment on
 * `scale: 2.9`: a hero-stage display size, not a physical one — needed
 * here too so the rifle wins the frame against SkyCitadel's much larger
 * silhouette instead of just matching its "correct" size.
 */
const REVEALED_SCALE = 1.45;
const DISTANT_SCALE = REVEALED_SCALE * 0.3;
const EXIT_SCALE = REVEALED_SCALE * 0.5;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * The Vortex Rifle's arsenal-beat presentation — staged directly inside
 * StormBackdrop's persistent world (same pattern as AeolusShowpiece for the
 * hero beat), not a separate showcase surface or Canvas. Drifts in from
 * depth/fog on approach, holds at full presence through the reveal window,
 * then recedes as the camera moves on toward Operators. Position/scale
 * only — rotation and the rim light/glow/idle-clip treatment stay inside
 * WeaponShowpiece, untouched.
 *
 * Responsive (Phase A.1, 2026-07-20): screenshot-verified at 390/430/768/
 * 1024/1440px, the rifle read noticeably smaller on phone/tablet widths —
 * StormBackdrop's ResponsiveFov widens vertical FOV as aspect narrows,
 * which shrinks anything at a fixed world distance. Compensated with
 * `fovPresenceScale` (lib/v2/responsiveCamera.ts) rather than a per-
 * breakpoint scale table: one continuous formula driven by aspect ratio,
 * derived from the same FOV numbers ResponsiveFov already uses, recomputed
 * only on resize. No position compensation needed — RESTING_POSITION sits
 * on the camera's look-ray, so it's already frame-centered at any aspect.
 */
export default function ArsenalShowpiece({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  // Recomputed on resize only (matches ResponsiveFov's own convention) —
  // this object sits on the camera's look-ray (see RESTING_POSITION's own
  // comment), so it's already frame-centered at any aspect; the only
  // correction it needs is apparent size, not position.
  const presenceRef = useRef(1);
  useEffect(() => {
    presenceRef.current = fovPresenceScale(width / height);
  }, [width, height]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const presence = presenceRef.current;

    // Reduced motion: the background camera itself stays hero-parked (see
    // StormBackdrop's CameraDirector) and never actually visits this beat.
    // Parking THIS object at its prominent resting pose regardless would
    // put it in the same static hero shot as AeolusShowpiece's own parked
    // rifle (confirmed via screenshot — two Vortex Rifles in one frame).
    // Stay small/receded instead; the DOM annotation in ArsenalSection is
    // the actual source of arsenal info for these users, not this canvas.
    if (reducedMotion) {
      group.position.copy(DISTANT_POSITION);
      group.scale.setScalar(DISTANT_SCALE * presence);
      return;
    }

    const progress = scrollState.smoothed;

    if (progress <= APPROACH_START) {
      group.position.copy(DISTANT_POSITION);
      group.scale.setScalar(DISTANT_SCALE * presence);
      return;
    }

    if (progress < REVEAL_AT) {
      const t = smoothstep(clamp01((progress - APPROACH_START) / (REVEAL_AT - APPROACH_START)));
      group.position.lerpVectors(DISTANT_POSITION, RESTING_POSITION, t);
      group.scale.setScalar((DISTANT_SCALE + (REVEALED_SCALE - DISTANT_SCALE) * t) * presence);
      return;
    }

    if (progress <= HOLD_END) {
      group.position.copy(RESTING_POSITION);
      group.scale.setScalar(REVEALED_SCALE * presence);
      return;
    }

    const t = smoothstep(clamp01((progress - HOLD_END) / (EXIT_END - HOLD_END)));
    group.position.lerpVectors(RESTING_POSITION, EXIT_POSITION, t);
    group.scale.setScalar((REVEALED_SCALE + (EXIT_SCALE - REVEALED_SCALE) * t) * presence);
  });

  return (
    <group ref={groupRef} position={DISTANT_POSITION}>
      <WeaponShowpiece weaponId="vortex" fallback={<ProceduralAeolus />} reducedMotion={reducedMotion} />
    </group>
  );
}
