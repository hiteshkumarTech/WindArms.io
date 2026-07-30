'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { PLAYER } from '@/lib/game/constants';
import { STORM } from '@/lib/v2/tokens';
import ActionTargetDebugMarkers from '@/components/three/weapons/debug/ActionTargetDebugMarkers';
import KaelArmIkDebug from '@/components/three/weapons/debug/KaelArmIkDebug';
import VortexGripAnchorDebug from '@/components/three/weapons/debug/VortexGripAnchorDebug';
import KaelFirstPersonArms from '@/components/three/weapons/KaelFirstPersonArms';
import VortexViewmodel from '@/components/three/weapons/VortexViewmodel';
import KaelFirstPersonLowerBody from '@/components/three/operators/KaelFirstPersonLowerBody';
import KaelFirstPersonShadowBody from '@/components/three/operators/KaelFirstPersonShadowBody';
import KaelFirstPersonShadowWeapon from '@/components/three/operators/KaelFirstPersonShadowWeapon';
import KaelShadowArmDebugMarkers from '@/components/three/operators/debug/KaelShadowArmDebugMarkers';
import KaelShadowReviewCamera from '@/components/three/operators/KaelShadowReviewCamera';
import KaelShadowReceiver from '@/components/three/operators/KaelShadowReceiver';
import { useAnimDebugEnabled } from '@/lib/v2/weapons/useAnimDebugEnabled';
import { useGripDebugEnabled } from '@/lib/v2/weapons/useGripDebugEnabled';
import { useIkDebugEnabled } from '@/lib/v2/weapons/useIkDebugEnabled';
import { useShadowDebugEnabled } from '@/lib/v2/operators/useShadowDebugEnabled';
import { useShadowReviewEnabled } from '@/lib/v2/operators/useShadowReviewEnabled';
import { useShadowReviewStore } from '@/lib/v2/operators/shadowReviewStore';
import { RANGE_SHADOW_CAMERA_BOUNDS } from '@/lib/v2/range/rangeEnvironmentBounds';
import type { RangeInputSnapshot } from '@/lib/v2/range/useRangeKeyboardInput';
import RangeController from './RangeController';
import RangeEffectsPools from './RangeEffectsPools';
import RangeEnvironment from './RangeEnvironment';
import RangeTargets from './RangeTargets';
import VortexFireSystem from './VortexFireSystem';

/**
 * Canvas contents for the V2 weapon range (`/v2/range`) — the playable
 * vertical slice for the Vortex Rifle. Separate scene tree from v1's
 * `/play` and from the V2 landing page's `StormBackdrop`; nothing here is
 * imported by, or imports from, either.
 */
export default function RangeScene({ inputRef }: { inputRef: React.MutableRefObject<RangeInputSnapshot> }) {
  const gripDebugEnabled = useGripDebugEnabled();
  const ikDebugEnabled = useIkDebugEnabled();
  const animDebugEnabled = useAnimDebugEnabled();
  const shadowDebugEnabled = useShadowDebugEnabled();
  const shadowReviewEnabled = useShadowReviewEnabled();
  const receiverEnabled = useShadowReviewStore((s) => s.receiverEnabled);
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ fov: PLAYER.FOV_BASE, near: 0.05, far: 200, position: [0, 3 + PLAYER.EYE_STAND, 10] }}>
      <color attach="background" args={[STORM.abyss]} />
      <fog attach="fog" args={[STORM.abyss, 25, 90]} />
      <ambientLight intensity={0.55} />
      {/* Step 8E-B fix: this light previously cast with THREE's DEFAULT
          shadow-camera bounds (an orthographic frustum ∓5 units, centered on
          world origin since no `target` prop repositions it) — the range's
          own spawn (`RangeController.tsx`: `[0, 3, 10]`) already sits
          outside a ∓5 frustum, so the arms' already-on `castShadow` was very
          likely rendering no visible shadow anywhere near the player before
          this fix. `RANGE_SHADOW_CAMERA_BOUNDS` (`rangeEnvironmentBounds.ts`)
          is computed from the real floor extent, not copied from
          `/v2/play`'s own `±30` (sized for a smaller, origin-centered 34×34
          arena — would still clip most of this floor). Light
          position/intensity/color untouched. */}
      <directionalLight
        position={[12, 22, 8]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={RANGE_SHADOW_CAMERA_BOUNDS.near}
        shadow-camera-far={RANGE_SHADOW_CAMERA_BOUNDS.far}
        shadow-camera-left={RANGE_SHADOW_CAMERA_BOUNDS.left}
        shadow-camera-right={RANGE_SHADOW_CAMERA_BOUNDS.right}
        shadow-camera-top={RANGE_SHADOW_CAMERA_BOUNDS.top}
        shadow-camera-bottom={RANGE_SHADOW_CAMERA_BOUNDS.bottom}
      />
      <hemisphereLight args={[STORM.skyMid, STORM.abyss, 0.4]} />

      <Physics>
        <RangeEnvironment />
        <RangeController inputRef={inputRef} />
      </Physics>

      <RangeTargets />
      <VortexFireSystem inputRef={inputRef} />
      <Suspense fallback={null}>
        {/* Step 8E-C.3/8E-C.3.1: the visible FP viewmodel/arms/lower-body are
            all positioned/rendered relative to the MAIN camera or the
            player's own first-person framing, which the review camera below
            does not use — viewed externally they read as a SEPARATE,
            detached dark figure standing next to the diagnostic-visible
            shadow clone (a real contamination the human reviewer caught in
            the Step 8E-C.3 review artifact — the visible lower body was
            originally left OUTSIDE this group, an oversight now fixed).
            Hidden (not unmounted — `visible` only) while shadow-review mode
            is active; `castShadow` gating for arms (already `false` while
            `useShadowDebugEnabled()` is true, from Step 8E-C) and for the
            lower body (already `false` unconditionally, pre-existing) is
            untouched and unaffected by this — this is a render-visibility
            change only, not an ownership change. Real gameplay input/state,
            including the SHARED locomotion pose the shadow legs read from,
            keeps running underneath regardless. */}
        <group visible={!shadowReviewEnabled}>
          <VortexViewmodel />
          {gripDebugEnabled && <VortexGripAnchorDebug />}
          <KaelFirstPersonArms />
          {ikDebugEnabled && <KaelArmIkDebug />}
          {animDebugEnabled && <ActionTargetDebugMarkers />}
          <KaelFirstPersonLowerBody />
        </group>
        {/* Step 8E-B/8E-C — dev-only, /v2/range?shadow=1 only, never /v2/play, never production. See KaelFirstPersonShadowBody.tsx's own doc comment for the full scope/limitation list. */}
        {shadowDebugEnabled && (
          <>
            <KaelFirstPersonShadowBody />
            <KaelFirstPersonShadowWeapon />
            <KaelShadowArmDebugMarkers />
          </>
        )}
        {/* Step 8E-C.3 — external review-only camera + neutral ground receiver, `/v2/range?shadow=1&shadowReview=1` only (the hook's own dual-flag gate — see useShadowReviewEnabled.ts). Never touches RangeController.tsx or the main camera; see KaelShadowReviewCamera.tsx's own doc comment for the manual-render mechanism that makes removal a clean, automatic restore. */}
        {shadowReviewEnabled && (
          <>
            <KaelShadowReviewCamera />
            {receiverEnabled && <KaelShadowReceiver />}
          </>
        )}
      </Suspense>
      <RangeEffectsPools />
    </Canvas>
  );
}
