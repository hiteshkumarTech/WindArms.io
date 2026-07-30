'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getFirstPersonBodyWorldPose } from '@/lib/v2/operators/firstPersonBodyPose';
import { RANGE_FLOOR_CENTER, RANGE_FLOOR_SIZE } from '@/lib/v2/range/rangeEnvironmentBounds';
import { RECEIVER_MODE_MATERIAL } from '@/lib/v2/operators/shadowLightCalibration';
import { useShadowReviewStore } from '@/lib/v2/operators/shadowReviewStore';

/**
 * Dev-only neutral ground-shadow receiver — Step 8E-C.3,
 * `/v2/range?shadow=1&shadowReview=1` only. A single large, non-colliding,
 * purely visual plane that follows the player's own XZ position (so review
 * mode works no matter where on the range the player has walked), sitting
 * at the real floor's own Y level (`RangeEnvironment.tsx`'s
 * `RANGE_FLOOR_CENTER`) so the projected shadow reads at the correct
 * height with no z-fighting against the real floor beneath it.
 *
 * NOT a permanent art-direction change: mounted ONLY while shadow-review
 * mode is active (see `RangeScene.tsx`'s mount site), never added to the
 * production range floor, never a `RigidBody`/collider (movement/physics
 * are completely unaffected — `receiveShadow` is the only real behavior
 * this mesh has).
 *
 * STEP 8E-D: two selectable receiver modes (`shadowReviewStore.ts`'s
 * `receiverMode`), material swapped in place (no remount) via a `useEffect`
 * keyed on the mode — `production` matches the REAL range floor
 * (`RangeEnvironment.tsx`: `STORM.abyss`, roughness 0.95) so a reviewer can
 * judge how the shadow will actually read once/if Step 8E-E makes this the
 * live caster; `readable` keeps the original Step 8E-C.3 mid-gray for
 * troubleshooting geometry/contact issues where raw visibility matters more
 * than realism. Default is `production` (`CANONICAL_SHADOW_CALIBRATION`,
 * per the human-acceptance-mode decision this milestone's brief specifies).
 */
const RECEIVER_SIZE = 12;
/** The real floor's TOP surface (`RangeEnvironment.tsx`'s mesh is centered at `RANGE_FLOOR_CENTER` with height `RANGE_FLOOR_SIZE[1]`), plus a small clearance to avoid z-fighting while staying visually flush with it. */
const RECEIVER_Y = RANGE_FLOOR_CENTER[1] + RANGE_FLOOR_SIZE[1] / 2 + 0.005;

export default function KaelShadowReceiver() {
  const groupRef = useRef<THREE.Group>(null);
  const receiverMode = useShadowReviewStore((s) => s.receiverMode);
  const geometry = useMemo(() => new THREE.PlaneGeometry(RECEIVER_SIZE, RECEIVER_SIZE), []);
  // One material instance, mutated in place on mode change (not swapped/
  // disposed/recreated) — cheaper, and avoids a one-frame flash of the
  // mesh's default material while a new one compiles.
  const material = useMemo(() => new THREE.MeshStandardMaterial({ metalness: 0 }), []);

  useEffect(() => {
    const spec = RECEIVER_MODE_MATERIAL[receiverMode];
    material.color.set(spec.color);
    material.roughness = spec.roughness;
  }, [material, receiverMode]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const pose = getFirstPersonBodyWorldPose();
    if (!pose.ready) return;
    group.position.set(pose.worldPosition.x, RECEIVER_Y, pose.worldPosition.z);
  });

  return (
    <group ref={groupRef} name="kael_shadow_receiver_DEV_REVIEW_ONLY">
      <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
    </group>
  );
}
