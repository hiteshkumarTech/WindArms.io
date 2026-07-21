'use client';

import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGripTunerStore } from '@/lib/v2/weapons/gripTunerStore';
import { getGripWorldPose } from '@/lib/v2/weapons/gripWorldPose';
import { resolveRuntimeAnchorWorldPose } from '@/lib/v2/weapons/runtimeAnchorMath';
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';
import { VORTEX_VIEWMODEL_POSES } from '@/lib/v2/weapons/vortexViewmodelPose';

const AXIS_LENGTH = 0.07;
const HAND_COLOR = '#ff5050';
const SUPPORT_COLOR = '#50a0ff';
/** Hand-forward / thumb-side / palm-normal — see RuntimeGripAnchor's coordinate-contract doc comment (local +X/+Y/+Z respectively). Conventional RGB=XYZ so the mapping is legible at a glance without a legend. */
const FORWARD_AXIS_COLOR = '#ff3030';
const THUMB_AXIS_COLOR = '#30ff60';
const PALM_NORMAL_COLOR = '#3090ff';

/**
 * Dev-only 3D visualization for the Vortex grip-anchor authoring tool
 * (Milestone 7, Phase F, Step 7). Mount as a sibling of `VortexViewmodel`
 * inside `RangeScene`'s Canvas, gated by `useGripDebugEnabled()` at the
 * call site (this component itself does no gating — matches
 * `DEBUG_SHOW_MUZZLE_ANCHOR`'s existing precedent of the CALLER deciding
 * visibility, not the helper hiding itself).
 *
 * Deliberately independent of `VortexViewmodel.tsx`'s internal group: it
 * resolves its own preview world pose for whatever is CURRENTLY staged in
 * `gripTunerStore` (which starts equal to the shipped
 * `VORTEX_RUNTIME_ANCHORS` constants but is freely editable via the panel),
 * anchored to the real weapon's live transform published this frame via
 * `gripWorldPose.ts`'s `weaponWorldPosition`/`weaponWorldQuaternion` — so
 * moving a slider updates these markers immediately without touching
 * `VortexViewmodel.tsx`'s real, already-shipped publish path at all.
 *
 * Renders nothing (and does zero per-frame work beyond the read) once
 * `getGripWorldPose().ready` is false — e.g. before the weapon's first
 * frame, or if the model failed to resolve — so this can safely sit
 * mounted even while the tool is toggled on but the weapon hasn't
 * published a frame yet.
 */
export default function VortexGripAnchorDebug() {
  const tuner = useGripTunerStore();
  const handGroupRef = useRef<THREE.Group>(null);
  const supportGroupRef = useRef<THREE.Group>(null);

  const scratch = useMemo(
    () => ({
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      pos: new THREE.Vector3(),
      euler: new THREE.Euler(),
      localQuat: new THREE.Quaternion(),
    }),
    [],
  );
  const supportScratch = useMemo(
    () => ({
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      pos: new THREE.Vector3(),
      euler: new THREE.Euler(),
      localQuat: new THREE.Quaternion(),
    }),
    [],
  );

  useFrame(() => {
    const pose = getGripWorldPose();
    const handGroup = handGroupRef.current;
    const supportGroup = supportGroupRef.current;
    if (!handGroup || !supportGroup) return;
    if (!pose.ready) {
      handGroup.visible = false;
      supportGroup.visible = false;
      return;
    }

    // Reads the REAL live ADS state (not a hardcoded hip-only assumption —
    // an earlier version of this line hardcoded blend=0, harmless only by
    // coincidence since hip.scale === ads.scale today; fixed to actually
    // track the store so it stays correct if that ever changes). Binary,
    // not the smoothly-interpolated blend VortexViewmodel.tsx computes
    // internally (this component has no access to that per-instance
    // interpolation state) — acceptable for a dev preview tool, since
    // hip/ads scale are equal today regardless.
    const ads = useVortexWeaponStore.getState().ads;
    const poseScale = ads ? VORTEX_VIEWMODEL_POSES.ads.scale : VORTEX_VIEWMODEL_POSES.hip.scale;

    const handOk = resolveRuntimeAnchorWorldPose(
      { position: tuner.hand.position, rotationEuler: tuner.hand.rotationEuler, rotationOrder: 'XYZ' },
      poseScale,
      pose.weaponWorldPosition,
      pose.weaponWorldQuaternion,
      scratch,
      scratch,
    );
    const supportOk = resolveRuntimeAnchorWorldPose(
      { position: tuner.support.position, rotationEuler: tuner.support.rotationEuler, rotationOrder: 'XYZ' },
      poseScale,
      pose.weaponWorldPosition,
      pose.weaponWorldQuaternion,
      supportScratch,
      supportScratch,
    );

    handGroup.visible = handOk;
    if (handOk) {
      handGroup.position.copy(scratch.position);
      handGroup.quaternion.copy(scratch.quaternion);
    }
    supportGroup.visible = supportOk;
    if (supportOk) {
      supportGroup.position.copy(supportScratch.position);
      supportGroup.quaternion.copy(supportScratch.quaternion);
    }
  });

  if (!tuner.showAxes && !tuner.showPalmProxy) return null;

  return (
    <>
      <group ref={handGroupRef} raycast={() => null}>
        <HandMarkerVisual color={HAND_COLOR} selected={tuner.selected === 'hand'} showAxes={tuner.showAxes} showPalmProxy={tuner.showPalmProxy} showHandProxy={tuner.showHandProxy} />
      </group>
      <group ref={supportGroupRef} raycast={() => null}>
        <HandMarkerVisual color={SUPPORT_COLOR} selected={tuner.selected === 'support'} showAxes={tuner.showAxes} showPalmProxy={tuner.showPalmProxy} showHandProxy={tuner.showHandProxy} />
      </group>
    </>
  );
}

/** One hand's static local-space visual — a colored anchor marker, its own XYZ axis lines (hand-forward/thumb-side/palm-normal), an optional flat palm-proxy plane, and an optional Kael-hand-basis proxy block. All LOCAL geometry, positioned/oriented by the parent group's imperative transform in `useFrame` above — nothing here re-renders or recomputes per frame. */
function HandMarkerVisual({
  color,
  selected,
  showAxes,
  showPalmProxy,
  showHandProxy,
}: {
  color: string;
  selected: boolean;
  showAxes: boolean;
  showPalmProxy: boolean;
  showHandProxy: boolean;
}) {
  return (
    <>
      <mesh raycast={() => null}>
        <sphereGeometry args={[selected ? 0.014 : 0.009, 10, 10]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {showAxes && (
        <>
          <Line points={[[0, 0, 0], [AXIS_LENGTH, 0, 0]]} color={FORWARD_AXIS_COLOR} lineWidth={selected ? 3 : 1.5} />
          <Line points={[[0, 0, 0], [0, AXIS_LENGTH * 0.7, 0]]} color={THUMB_AXIS_COLOR} lineWidth={selected ? 3 : 1.5} />
          <Line points={[[0, 0, 0], [0, 0, AXIS_LENGTH]]} color={PALM_NORMAL_COLOR} lineWidth={selected ? 3 : 1.5} />
        </>
      )}
      {showPalmProxy && (
        <mesh position={[0.015, 0, 0]} raycast={() => null}>
          <boxGeometry args={[0.03, 0.018, 0.06]} />
          <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
      {showHandProxy && <KaelHandBasisProxy color={color} />}
    </>
  );
}

/**
 * Temporary, dev-only Kael-hand-shaped proxy (Step 8) — NOT the real
 * operator-kael-arms.glb geometry (explicitly out of scope this step: "do
 * not mount or render the full Kael FP-arms asset yet"). Two simple boxes
 * in the anchor's OWN local frame — a palm/finger mass elongated along
 * local +X (hand-forward, per the RuntimeGripAnchor coordinate contract)
 * and a smaller thumb block offset toward local +Y (thumb-side) — exists
 * only to sanity-check palm orientation, wrist angle, and finger-forward
 * direction against a roughly hand-shaped silhouette, and to make a
 * mirrored left/right quaternion mistake visually obvious (a thumb block
 * on the wrong side jumps out immediately, a mis-signed palm-normal
 * doesn't when all you have is a bare axis line). This proxy is aligned to
 * the anchor's OWN basis by construction, not independently measured
 * against tools/blender/inspect-kael-hand-basis.py's output — it verifies
 * internal consistency of the anchor's basis convention, not agreement
 * with Kael's actual rig, which remains a manual cross-check against that
 * script's report until real arms geometry is ever mounted here.
 */
function KaelHandBasisProxy({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0.035, 0, 0]} raycast={() => null}>
        <boxGeometry args={[0.09, 0.03, 0.045]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} wireframe />
      </mesh>
      <mesh position={[0.03, 0.028, 0]} raycast={() => null}>
        <boxGeometry args={[0.03, 0.018, 0.018]} />
        <meshBasicMaterial color={THUMB_AXIS_COLOR} transparent opacity={0.35} wireframe />
      </mesh>
    </group>
  );
}
