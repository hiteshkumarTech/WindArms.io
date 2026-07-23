'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { computeDeformedSkinnedBounds } from '@/lib/v2/operators/kaelArmSolve';
import { useIkTunerStore } from '@/lib/v2/weapons/ikTunerStore';
import { kaelArmDebugState, type KaelArmDebugSide } from '@/lib/v2/weapons/kaelArmDebugState';

const RIGHT_COLOR = '#ff5050';
const LEFT_COLOR = '#50a0ff';
const TARGET_COLOR = '#ffe030';
const POLE_COLOR = '#30ff90';
// Step 6F hand-basis axis colors — deliberately distinct from every color
// above so all three axes are simultaneously legible on both hands at once.
const PALM_FORWARD_COLOR = '#ffffff';
const THUMB_SIDE_COLOR = '#ff8800';
const PALM_NORMAL_COLOR = '#00e5ff';
/** Length (meters) of each drawn axis marker — short enough not to clutter a ~0.2m-scale hand, long enough to read the direction at a glance. */
const AXIS_MARKER_LENGTH_M = 0.07;

/**
 * Dev-only 3D visualization for the Kael FP-arm IK authoring tool
 * (Milestone 7, Phase F, Step 13). Mount as a sibling of
 * `KaelFirstPersonArms` inside `RangeScene`'s Canvas, gated by
 * `useIkDebugEnabled()` at the call site (same "caller decides
 * visibility" convention as `VortexGripAnchorDebug.tsx`).
 *
 * Reads `kaelArmDebugState` (published every frame by
 * `KaelFirstPersonArms.tsx`'s solve, purely for visualization — see that
 * module's doc comment) rather than duplicating the bone/IK resolution
 * here. Renders nothing before the arm rig has published its first frame.
 * All markers are direct-ref'd (standard R3F imperative-update pattern,
 * not name-based scene lookups) for reliability.
 */
export default function KaelArmIkDebug() {
  const tuner = useIkTunerStore();

  if (!tuner.showTargetMarkers && !tuner.showChainLines && !tuner.showPoleMarkers && !tuner.showBoundingBox && !tuner.showHandBasisAxes) return null;

  return (
    <>
      <SideDebug color={RIGHT_COLOR} tuner={tuner} getSide={() => kaelArmDebugState.right} />
      <SideDebug color={LEFT_COLOR} tuner={tuner} getSide={() => kaelArmDebugState.left} />
      {tuner.showBoundingBox && <ArmBoundingBoxHelper />}
    </>
  );
}

/**
 * Diagnostic-only (Step 6D, 2026-07-22 — REWRITTEN, see below): wireframe
 * box around the mounted arms rig's ACTUAL DEFORMED (skinned) vertex
 * bounds, looked up by name each frame (`kael_fp_arms_root`, set in
 * `KaelFirstPersonArms.tsx`) rather than via a prop — this component has no
 * other reference to the mesh, and adding one (e.g. threading a ref
 * through) would touch the production component for a dev-only
 * visualization. A name-based scene lookup, gated behind an off-by-default
 * `?ik=1` toggle, is the smaller footprint.
 *
 * BUG FOUND AND FIXED (Step 6D): the original version used
 * `box.setFromObject(root)` — THREE.js's default `Box3.setFromObject` uses
 * each mesh's STATIC `geometry.boundingBox` (bind-pose, computed once at
 * load) transformed by the mesh's current `matrixWorld` — it does NOT
 * account for GPU skinning deformation at all (skinning happens in the
 * vertex shader; `geometry.attributes.position` never changes on the CPU
 * side). Proved via a headless diagnostic against the real asset:
 * `Box3.setFromObject` returned the IDENTICAL box at weight=0 and weight=1
 * — it never reflected the IK-solved pose, only the bind pose, and its
 * result was offset by roughly the container's own height from where the
 * geometry actually renders. This is what produced the reported "enormous
 * magenta lines spanning most of the screen": a wireframe box drawn at the
 * WRONG position/size relative to the actual (correctly-rendering)
 * geometry. Fixed by computing TRUE bounds via
 * `computeDeformedSkinnedBounds` (`kaelArmSolve.ts` — walks every vertex
 * through `SkinnedMesh.applyBoneTransform`, the same math the GPU shader
 * runs), restricted to the SkinnedMesh specifically (not bones/helpers/
 * weapon geometry).
 */
function ArmBoundingBoxHelper() {
  const { scene, camera } = useThree();
  const box = useMemo(() => new THREE.Box3(), []);
  const helper = useMemo(() => new THREE.Box3Helper(box, new THREE.Color('#ff00ff')), [box]);

  useFrame(() => {
    const root = scene.getObjectByName('kael_fp_arms_root');
    if (!root || !root.visible) {
      helper.visible = false;
      kaelArmDebugState.bounds = null;
      return;
    }
    let mesh: THREE.SkinnedMesh | null = null;
    let meshCount = 0;
    root.traverse((node) => {
      if ((node as THREE.SkinnedMesh).isSkinnedMesh) {
        meshCount += 1;
        mesh = node as THREE.SkinnedMesh;
      }
    });
    if (!mesh || meshCount !== 1) {
      helper.visible = false;
      kaelArmDebugState.bounds = null;
      return;
    }
    helper.visible = true;
    const { nearestVertexDist, farthestVertexDist } = computeDeformedSkinnedBounds(mesh, box, camera.position);
    const size = box.getSize(new THREE.Vector3());
    const finite = Number.isFinite(size.x) && Number.isFinite(size.y) && Number.isFinite(size.z);
    kaelArmDebugState.bounds = {
      sizeM: [size.x, size.y, size.z],
      minM: [box.min.x, box.min.y, box.min.z],
      maxM: [box.max.x, box.max.y, box.max.z],
      nearestVertexDistM: nearestVertexDist,
      farthestVertexDistM: farthestVertexDist,
      meshCount,
      finite,
    };
  });

  return <primitive object={helper} />;
}

function SideDebug({ color, tuner, getSide }: { color: string; tuner: ReturnType<typeof useIkTunerStore.getState>; getSide: () => KaelArmDebugSide }) {
  const shoulderRef = useRef<THREE.Mesh>(null);
  const elbowRef = useRef<THREE.Mesh>(null);
  const handRef = useRef<THREE.Mesh>(null);
  const targetRef = useRef<THREE.Mesh>(null);
  const poleRef = useRef<THREE.Mesh>(null);
  const visibleRef = useRef<THREE.Group>(null);

  // Built via useMemo + <primitive>, not the JSX `<line>` tag — that tag
  // resolves to the DOM/SVG `<line>` element in TypeScript's JSX
  // namespace, not R3F's Three.js augmentation (a known R3F/TS collision;
  // caught by `tsc --noEmit`, not a runtime bug, but a real compile error
  // all the same). `<primitive>` sidesteps the ambiguity entirely.
  const lineObject = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const material = new THREE.LineBasicMaterial({ color, toneMapped: false });
    const line = new THREE.Line(geometry, material);
    line.raycast = () => {};
    return line;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 6F hand-basis axis markers — 3 short 2-point line segments from
  // the hand's world position, one per canonical axis. Built once via the
  // same `useMemo` + `<primitive>` pattern as `lineObject` above (not 3
  // separate small helper components — these need the exact same
  // 2-points-updated-in-place-every-frame shape, no reason to duplicate
  // the setup).
  const makeAxisLine = (axisColor: string) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: axisColor, toneMapped: false });
    const line = new THREE.Line(geometry, material);
    line.raycast = () => {};
    return line;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palmForwardLine = useMemo(() => makeAxisLine(PALM_FORWARD_COLOR), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const thumbSideLine = useMemo(() => makeAxisLine(THUMB_SIDE_COLOR), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palmNormalLine = useMemo(() => makeAxisLine(PALM_NORMAL_COLOR), []);
  const axisEndScratch = useMemo(() => new THREE.Vector3(), []);

  const updateAxisLine = (line: THREE.Line, origin: THREE.Vector3, dir: THREE.Vector3) => {
    axisEndScratch.copy(origin).addScaledVector(dir, AXIS_MARKER_LENGTH_M);
    const positions = line.geometry.attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, origin.x, origin.y, origin.z);
    positions.setXYZ(1, axisEndScratch.x, axisEndScratch.y, axisEndScratch.z);
    positions.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  };

  useFrame(() => {
    const group = visibleRef.current;
    if (!group) return;
    if (!kaelArmDebugState.ready) {
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

    updateAxisLine(palmForwardLine, side.handWorldPos, side.palmForwardWorldDir);
    updateAxisLine(thumbSideLine, side.handWorldPos, side.thumbSideWorldDir);
    updateAxisLine(palmNormalLine, side.handWorldPos, side.palmNormalWorldDir);
  });

  return (
    <group ref={visibleRef} raycast={() => null}>
      {tuner.showTargetMarkers && (
        <>
          <mesh ref={shoulderRef} raycast={() => null}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          <mesh ref={elbowRef} raycast={() => null}>
            <sphereGeometry args={[0.01, 8, 8]} />
            <meshBasicMaterial color={color} toneMapped={false} wireframe />
          </mesh>
          <mesh ref={handRef} raycast={() => null}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          <mesh ref={targetRef} raycast={() => null}>
            <boxGeometry args={[0.02, 0.02, 0.02]} />
            <meshBasicMaterial color={TARGET_COLOR} toneMapped={false} wireframe />
          </mesh>
        </>
      )}
      {tuner.showPoleMarkers && (
        <mesh ref={poleRef} raycast={() => null}>
          <sphereGeometry args={[0.008, 6, 6]} />
          <meshBasicMaterial color={POLE_COLOR} toneMapped={false} />
        </mesh>
      )}
      {tuner.showChainLines && <primitive object={lineObject} />}
      {tuner.showHandBasisAxes && (
        <>
          <primitive object={palmForwardLine} />
          <primitive object={thumbSideLine} />
          <primitive object={palmNormalLine} />
        </>
      )}
    </group>
  );
}
