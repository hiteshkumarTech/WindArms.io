'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getFirstPersonBodyWorldPose } from '@/lib/v2/operators/firstPersonBodyPose';
import { RANGE_FLOOR_CENTER, RANGE_FLOOR_SIZE } from '@/lib/v2/range/rangeEnvironmentBounds';

/**
 * Dev-only neutral matte ground-shadow receiver — Step 8E-C.3,
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
 * this mesh has). Neutral mid-gray, matte (`roughness` near 1, `metalness`
 * 0) so it doesn't bias how the projected shadow's own darkness reads.
 */
const RECEIVER_SIZE = 12;
/** The real floor's TOP surface (`RangeEnvironment.tsx`'s mesh is centered at `RANGE_FLOOR_CENTER` with height `RANGE_FLOOR_SIZE[1]`), plus a small clearance to avoid z-fighting while staying visually flush with it. */
const RECEIVER_Y = RANGE_FLOOR_CENTER[1] + RANGE_FLOOR_SIZE[1] / 2 + 0.005;
const RECEIVER_COLOR = '#6b7280';

export default function KaelShadowReceiver() {
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(RECEIVER_SIZE, RECEIVER_SIZE), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: RECEIVER_COLOR, roughness: 0.95, metalness: 0 }), []);

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
