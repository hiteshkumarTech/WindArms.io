'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { shadowArmDebugState, type ShadowArmDebugSide } from '@/lib/v2/operators/shadowArmDebugState';
import { useShadowArmTunerStore } from '@/lib/v2/operators/shadowArmTunerStore';

const RIGHT_COLOR = '#ff8060';
const LEFT_COLOR = '#60c0ff';
const TARGET_COLOR = '#ffe030';
const POLE_COLOR = '#30ff90';

/**
 * Dev-only 3D visualization for the shadow arm IK calibration (Milestone 8,
 * Step 8E-C) — mounted as a `RangeScene.tsx` Canvas sibling, gated by
 * `useShadowDebugEnabled()` at the call site (same convention as
 * `KaelArmIkDebug.tsx`). Reads `shadowArmDebugState` (published every frame
 * by `KaelFirstPersonShadowBody.tsx`'s arm solve) — never re-derives
 * bone/IK state itself, matching `KaelArmIkDebug.tsx`'s own "debug reads,
 * production writes" split.
 */
export default function KaelShadowArmDebugMarkers() {
  const tuner = useShadowArmTunerStore();
  if (!tuner.showElbowPoleMarkers && !tuner.showShoulderMarkers && !tuner.showGripTargetMarkers) return null;
  return (
    <>
      <SideDebug color={RIGHT_COLOR} tuner={tuner} getSide={() => shadowArmDebugState.right} />
      <SideDebug color={LEFT_COLOR} tuner={tuner} getSide={() => shadowArmDebugState.left} />
    </>
  );
}

function SideDebug({ color, tuner, getSide }: { color: string; tuner: ReturnType<typeof useShadowArmTunerStore.getState>; getSide: () => ShadowArmDebugSide }) {
  const shoulderRef = useRef<THREE.Mesh>(null);
  const elbowRef = useRef<THREE.Mesh>(null);
  const handRef = useRef<THREE.Mesh>(null);
  const targetRef = useRef<THREE.Mesh>(null);
  const poleRef = useRef<THREE.Mesh>(null);
  const visibleRef = useRef<THREE.Group>(null);

  const lineObject = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const material = new THREE.LineBasicMaterial({ color, toneMapped: false });
    const line = new THREE.Line(geometry, material);
    line.raycast = () => {};
    return line;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(() => {
    const group = visibleRef.current;
    if (!group) return;
    if (!shadowArmDebugState.ready) {
      group.visible = false;
      return;
    }
    group.visible = true;
    const side = getSide();

    shoulderRef.current?.position.copy(side.shoulderWorldPos);
    elbowRef.current?.position.copy(side.elbowWorldPos);
    handRef.current?.position.copy(side.handWorldPos);
    targetRef.current?.position.copy(side.targetWorldPos);
    poleRef.current?.position.copy(side.shoulderWorldPos).addScaledVector(side.poleWorldDir, 0.15);

    const positions = lineObject.geometry.attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, side.shoulderWorldPos.x, side.shoulderWorldPos.y, side.shoulderWorldPos.z);
    positions.setXYZ(1, side.elbowWorldPos.x, side.elbowWorldPos.y, side.elbowWorldPos.z);
    positions.setXYZ(2, side.handWorldPos.x, side.handWorldPos.y, side.handWorldPos.z);
    positions.needsUpdate = true;
    lineObject.geometry.computeBoundingSphere();
  });

  return (
    <group ref={visibleRef} raycast={() => null}>
      {tuner.showShoulderMarkers && (
        <mesh ref={shoulderRef} raycast={() => null}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      )}
      <mesh ref={elbowRef} raycast={() => null}>
        <sphereGeometry args={[0.01, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} wireframe />
      </mesh>
      <mesh ref={handRef} raycast={() => null}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {tuner.showGripTargetMarkers && (
        <mesh ref={targetRef} raycast={() => null}>
          <boxGeometry args={[0.02, 0.02, 0.02]} />
          <meshBasicMaterial color={TARGET_COLOR} toneMapped={false} wireframe />
        </mesh>
      )}
      {tuner.showElbowPoleMarkers && (
        <mesh ref={poleRef} raycast={() => null}>
          <sphereGeometry args={[0.008, 6, 6]} />
          <meshBasicMaterial color={POLE_COLOR} toneMapped={false} />
        </mesh>
      )}
      <primitive object={lineObject} />
    </group>
  );
}
