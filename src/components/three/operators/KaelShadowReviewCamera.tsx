'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PLAYER } from '@/lib/game/constants';
import { getFirstPersonBodyWorldPose } from '@/lib/v2/operators/firstPersonBodyPose';
import { computeShadowReviewCameraTransform, type ShadowReviewCameraTransform } from '@/lib/v2/operators/shadowReviewCameraPresets';
import { useShadowReviewStore } from '@/lib/v2/operators/shadowReviewStore';
import { SHADOW_BODY_PHYSICAL_LOCAL_OFFSET } from '@/lib/v2/operators/shadowBodyTransform';

/**
 * Dev-only EXTERNAL observation camera for the Step 8E-C.3 shadow review
 * harness — `/v2/range?shadow=1&shadowReview=1` only. Never touches
 * `RangeController.tsx` or the main gameplay camera in any way: this
 * component owns its OWN, entirely separate `THREE.PerspectiveCamera`
 * instance, never swapped into `useThree().camera` (the R3F "default"
 * camera `RangeController.tsx` reads/writes every frame). `RangeController`
 * keeps updating the real camera's position/rotation from real player
 * input exactly as always, completely unaware this component exists — this
 * is what makes "restores the normal camera after removal" trivially true:
 * nothing about the real camera was ever touched to begin with.
 *
 * MECHANISM: `useFrame(callback, 1)` — a non-zero render priority — is
 * R3F's documented "manual render" trigger: once ANY component in this
 * Canvas registers a priority>0 frame callback, R3F stops calling its own
 * default `gl.render()` for this Canvas and defers entirely to whatever
 * priority>0 callbacks do. This component's own callback computes this
 * frame's camera transform from the current preset + the player's real
 * world position/yaw (`firstPersonBodyPose.ts` — the SAME source the
 * shadow body itself is positioned from, never a second tracked position),
 * then renders the scene through ITS OWN camera. The instant this
 * component unmounts (review mode disabled), its priority>0 callback stops
 * existing and R3F automatically reverts to auto-rendering through the
 * untouched default camera — no explicit "restore" step needed anywhere.
 */
export default function KaelShadowReviewCamera() {
  const size = useThree((state) => state.size);
  // Aspect starts at a placeholder (1) — the effect below sets the real
  // value immediately on mount and on every resize. Deliberately NOT a
  // `size`-dependent useMemo: this camera object must be created exactly
  // once per mount (a new PerspectiveCamera on every resize would be
  // wasteful and would reset any camera-relative state THREE tracks on it).
  const camera = useMemo(() => new THREE.PerspectiveCamera(PLAYER.FOV_BASE, 1, 0.05, 200), []);
  const transformScratchRef = useRef<ShadowReviewCameraTransform>({ position: new THREE.Vector3(), lookAt: new THREE.Vector3() });
  const groundPositionScratchRef = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.aspect = size.width / size.height || 1;
    camera.updateProjectionMatrix();
  }, [camera, size]);

  useFrame((state) => {
    const pose = getFirstPersonBodyWorldPose();
    if (pose.ready) {
      // `pose.worldPosition` is the Rapier CapsuleCollider's published
      // world position — its CENTER, not the character's feet/ground level
      // (same reconciliation `shadowBodyTransform.ts`'s own doc comment
      // documents at length, and the SAME offset `KaelFirstPersonShadowBody.tsx`
      // applies to position its own root). The camera-preset math assumes a
      // ground-level reference point, so that same offset is applied here
      // — reusing the constant, not re-deriving a second one.
      const groundPosition = groundPositionScratchRef.current.copy(pose.worldPosition);
      groundPosition.y += SHADOW_BODY_PHYSICAL_LOCAL_OFFSET[1];
      const preset = useShadowReviewStore.getState().cameraPreset;
      const transform = computeShadowReviewCameraTransform(preset, groundPosition, pose.worldYaw, transformScratchRef.current);
      camera.position.copy(transform.position);
      camera.lookAt(transform.lookAt);
    }
    state.gl.render(state.scene, camera);
  }, 1);

  return null;
}
