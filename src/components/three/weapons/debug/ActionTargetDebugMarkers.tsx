'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { actionPoseState } from '@/lib/v2/weapons/actionPoseState';
import { useAnimDebugStore } from '@/lib/v2/weapons/animDebugStore';
import { getGripWorldPose } from '@/lib/v2/weapons/gripWorldPose';

const ACTION_TARGET_COLOR = '#ff3ec8';
const GRIP_TARGET_COLOR = '#ffe030';

/**
 * Dev-only 3D markers for the FP-arm action-pose preview tool (Milestone 7,
 * Phase G, Step 7C). Mount as a sibling of `KaelFirstPersonArms` inside
 * `RangeScene`'s Canvas, gated by `useAnimDebugEnabled()` at the call site
 * — same "caller decides visibility" convention as
 * `VortexGripAnchorDebug.tsx`/`KaelArmIkDebug.tsx`. Purely reads
 * already-published state (`actionPoseState`, `gripWorldPose`) — never
 * computes its own transform.
 */
export default function ActionTargetDebugMarkers() {
  const showActionTarget = useAnimDebugStore((s) => s.showActionTarget);
  const showGripTarget = useAnimDebugStore((s) => s.showGripTarget);
  const actionMarkerRef = useRef<Mesh>(null);
  const gripMarkerRef = useRef<Mesh>(null);

  useFrame(() => {
    if (actionMarkerRef.current) {
      const visible = showActionTarget && actionPoseState.ready;
      actionMarkerRef.current.visible = visible;
      if (visible) actionMarkerRef.current.position.copy(actionPoseState.leftTargetPosition);
    }
    if (gripMarkerRef.current) {
      const pose = getGripWorldPose();
      const visible = showGripTarget && pose.ready;
      gripMarkerRef.current.visible = visible;
      if (visible) gripMarkerRef.current.position.copy(pose.leftPosition);
    }
  });

  if (!showActionTarget && !showGripTarget) return null;

  return (
    <>
      <mesh ref={actionMarkerRef} visible={false} raycast={() => null}>
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshBasicMaterial color={ACTION_TARGET_COLOR} toneMapped={false} />
      </mesh>
      <mesh ref={gripMarkerRef} visible={false} raycast={() => null}>
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshBasicMaterial color={GRIP_TARGET_COLOR} toneMapped={false} wireframe />
      </mesh>
    </>
  );
}
