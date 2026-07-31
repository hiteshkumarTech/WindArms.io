'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Step 8E-D.1 — dev-only wireframe visualization of the ACTIVE shadow
 * camera's orthographic frustum (`THREE.CameraHelper`, THREE's own stock
 * debug helper — draws the real `light.shadow.camera`'s current
 * left/right/top/bottom/near/far, so it automatically reflects whichever
 * bounds `KaelPlayerCenteredShadowController.tsx` has applied, static or
 * player-centered, with zero duplicated frustum math here).
 *
 * Gated at the mount site by `shadowReviewEnabled && showFrustumHelper`
 * (`shadowReviewStore.ts`) — same "must be OFF for marker-free evidence
 * captures" convention as the arm-tuner marker toggles
 * (`KaelShadowArmDebugMarkers.tsx`). Defaults OFF.
 */
export default function KaelShadowFrustumHelper({ light }: { light: React.RefObject<THREE.DirectionalLight> }) {
  const scene = useThree((state) => state.scene);
  const helperRef = useRef<THREE.CameraHelper | null>(null);

  useEffect(() => {
    const lightObj = light.current;
    if (!lightObj) return;
    const helper = new THREE.CameraHelper(lightObj.shadow.camera);
    helper.raycast = () => {};
    scene.add(helper);
    helperRef.current = helper;
    return () => {
      scene.remove(helper);
      helper.dispose();
      helperRef.current = null;
    };
  }, [light, scene]);

  useFrame(() => {
    helperRef.current?.update();
  });

  return null;
}
