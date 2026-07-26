'use client';

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useLoadedPipelineAsset, useResolveModelSlot } from '@/lib/v2/pipeline';
import { operatorLowerBodySlot } from '@/lib/v2/operators';
import { bodyDebugReadout } from '@/lib/v2/operators/bodyDebugReadout';
import { useBodyDebugStore } from '@/lib/v2/operators/bodyDebugStore';
import { getFirstPersonBodyWorldPose } from '@/lib/v2/operators/firstPersonBodyPose';
import { computeLowerBodyWorldTransform, LOWERBODY_CANONICAL_LOCAL_OFFSET, type LowerBodyTransformOutput } from '@/lib/v2/operators/lowerBodyTransform';

/**
 * Kael first-person lower-body derivative (Milestone 8, Step 8C) — STATIC
 * integration only. Renders `operator-kael-lowerbody.glb` (Step 8B/8B.1,
 * waist/pelvis/thighs/knees/shins/boots, no head/neck/shoulders/arms/hands)
 * at the player's world position, following world YAW ONLY.
 *
 * OWNERSHIP (non-negotiable, see the Step 8C brief):
 *   PlayerController.tsx/RangeController.tsx own world position and
 *   locomotion, publishing it every frame via `firstPersonBodyPose.ts` —
 *   this component NEVER re-derives position from camera.position (which
 *   would silently inherit any future camera-only bob/sway) and NEVER
 *   reads camera pitch. The camera owns view pitch alone; this component
 *   never rotates on that axis. Kael FP-arms and the Vortex viewmodel
 *   remain entirely separate, camera-attached components — this one has no
 *   coupling to either.
 *
 * Deliberately NOT built on `FirstPersonOperatorRig`/`OperatorModel` (same
 * reasoning `KaelFirstPersonArms.tsx`'s doc comment gives — this component
 * owns 100% of its own transform) and does NOT use mesh-name filtering: the
 * asset already physically excludes head/arm geometry, so there is nothing
 * to filter.
 *
 * STATIC REST-POSE RULE (Step 8C scope): the asset has zero authored
 * animation clips. No bone is ever touched here — no walk cycle, no pelvis
 * bob, no sprint lean, no jump compression, no Wind Lift posture. The mesh
 * translates/rotates with the player as one rigid body and nothing more.
 * Procedural locomotion is explicitly Step 8D's job, not this one's.
 */

function KaelLowerBodyInner() {
  const { url, lod, resolving } = useResolveModelSlot(operatorLowerBodySlot('kael'));
  if (resolving || !url || lod === null) return null;
  return (
    <Suspense fallback={null}>
      <LoadedKaelLowerBody url={url} lod={lod} />
    </Suspense>
  );
}

/** Same fail-safe convention as `KaelFirstPersonArms.tsx`'s error boundary — the lower body is purely additive; any load failure must never affect combat. */
class KaelLowerBodyErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[kael-fp-lowerbody] failed to load — omitting lower body. ${String(error)}`);
    }
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function KaelFirstPersonLowerBody() {
  return (
    <KaelLowerBodyErrorBoundary>
      <KaelLowerBodyInner />
    </KaelLowerBodyErrorBoundary>
  );
}

function LoadedKaelLowerBody({ url, lod }: { url: string; lod: 0 | 1 | 2 }) {
  const result = useLoadedPipelineAsset(operatorLowerBodySlot('kael'), url, lod);
  const camera = useThree((state) => state.camera);
  const containerRef = useRef<THREE.Group>(null);
  const loggedMountRef = useRef(false);

  const offsetScratch = useRef(new THREE.Vector3());
  const combinedOffsetScratch = useRef<[number, number, number]>([0, 0, 0]);
  const transformOut = useRef<LowerBodyTransformOutput>({ position: new THREE.Vector3(), yaw: 0 });
  const boundsBox = useRef(new THREE.Box3());

  // Step 8C.1 diagnostic — resolved once per instance, not re-traversed per
  // frame. Bone WORLD positions already account for the container's
  // position/rotation (bones are descendants of it), so marker meshes read
  // these directly without any additional transform.
  const landmarkBonesRef = useRef<{ name: string; color: string; bone: THREE.Bone }[]>([]);
  const landmarkMarkerRefs = useRef<(THREE.Mesh | null)[]>([]);

  const neutralMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0x9a9aa5, roughness: 0.55, metalness: 0.05, name: '_body_debug_neutral' }),
    [],
  );
  useEffect(() => () => neutralMaterial.dispose(), [neutralMaterial]);
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const neutralMaterialActiveRef = useRef(false);

  // One SkeletonUtils clone per mount — same reasoning as
  // KaelFirstPersonArms.tsx: useGLTF caches one scene per URL, so rendering
  // it directly would fight over one skeleton across mounts/remounts.
  // Geometry/materials are shared (cheap), never deep-cloned.
  const instance = useMemo(() => {
    if (!result.scene) return null;
    const cloned = cloneSkeleton(result.scene);
    if (process.env.NODE_ENV !== 'production') {
      let meshCount = 0;
      let skinnedMeshCount = 0;
      let triangleCount = 0;
      const materialNames = new Set<string>();
      cloned.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          meshCount += 1;
          if ((node as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshCount += 1;
          const geom = node.geometry;
          const idx = geom.getIndex();
          triangleCount += (idx ? idx.count : geom.attributes.position.count) / 3;
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          for (const m of mats) materialNames.add(m.name || '(unnamed)');
        }
      });
      console.info(
        `[kael-fp-lowerbody] asset loaded: url=${url} lod=${lod} meshes=${meshCount} skinnedMeshes=${skinnedMeshCount} tris=${Math.round(triangleCount)} materials=[${[...materialNames].join(',')}]`,
      );
      bodyDebugReadout.meshCount = meshCount;
      bodyDebugReadout.triangleCount = Math.round(triangleCount);
      bodyDebugReadout.materialName = [...materialNames].join(', ');
    }
    return cloned;
  }, [result.scene, url, lod]);

  useEffect(() => {
    if (!instance) return;
    let skinned: THREE.SkinnedMesh | null = null;
    instance.traverse((node) => {
      if (!skinned && (node as THREE.SkinnedMesh).isSkinnedMesh) skinned = node as THREE.SkinnedMesh;
    });
    const skeleton = (skinned as THREE.SkinnedMesh | null)?.skeleton;
    const landmarks: { name: string; color: string; bone: THREE.Bone }[] = [];
    if (skeleton) {
      // color legend (documented in the Step 8C.1 report): gold=waist-cut,
      // magenta=hips, cyan=knees, lime=ankles/boots.
      const wanted: [string, string][] = [
        ['mixamorig:Spine', '#f0b429'],
        ['mixamorig:Hips', '#e91e9c'],
        ['mixamorig:LeftLeg', '#22d3ee'],
        ['mixamorig:RightLeg', '#22d3ee'],
        ['mixamorig:LeftFoot', '#84cc16'],
        ['mixamorig:RightFoot', '#84cc16'],
      ];
      for (const [name, color] of wanted) {
        const bone = skeleton.getBoneByName(name);
        if (bone) landmarks.push({ name, color, bone });
      }
    }
    landmarkBonesRef.current = landmarks;
  }, [instance]);

  useEffect(() => {
    if (!instance) return;
    instance.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        // Shadow work is explicitly deferred (Step 8E) — never cast from
        // this static integration pass. receiveShadow may stay on when it
        // reads correctly (verified in the browser validation pass).
        node.castShadow = false;
        node.receiveShadow = true;
        // Camera-near skinned geometry — same reasoning as the arms rig:
        // this mesh's bounding sphere is computed from its REST pose and
        // never updates (no bones move), so frustum culling against a
        // stale/incorrect bound could pop the whole body out of view when
        // it's actually on-screen.
        node.frustumCulled = false;
      }
    });
  }, [instance]);

  useEffect(() => {
    const map = originalMaterialsRef.current;
    return () => map.clear();
  }, []);

  useFrame(() => {
    const container = containerRef.current;
    if (!container || !instance) return;

    const debug = useBodyDebugStore.getState();
    const pose = getFirstPersonBodyWorldPose();

    container.visible = debug.visible && pose.ready;
    if (!pose.ready) return;

    // Diagnostic neutral-material toggle — swaps every mesh's material for
    // a flat grey, restoring the EXACT original reference (never a copy)
    // when disabled. Dev-only in effect (the store only ever changes from
    // its default via the `?body=1`-gated panel).
    if (debug.neutralMaterial !== neutralMaterialActiveRef.current) {
      neutralMaterialActiveRef.current = debug.neutralMaterial;
      instance.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (debug.neutralMaterial) {
          if (!originalMaterialsRef.current.has(node)) originalMaterialsRef.current.set(node, node.material);
          node.material = neutralMaterial;
        } else {
          const original = originalMaterialsRef.current.get(node);
          if (original) node.material = original;
        }
      });
    }

    // World transform: player world position + world yaw ONLY. Never
    // camera pitch, never recoil/sway/ADS/weapon motion. Bones are never
    // touched — the mesh renders in its validated rest pose. The canonical
    // capsule-to-feet offset is ALWAYS applied (a coordinate-frame
    // reconciliation, not a tunable) — the debug panel's offset is an
    // ADDITIONAL fine-tune on top of it, defaulting to zero.
    const combined = combinedOffsetScratch.current;
    combined[0] = LOWERBODY_CANONICAL_LOCAL_OFFSET[0] + debug.positionOffsetLocal[0];
    combined[1] = LOWERBODY_CANONICAL_LOCAL_OFFSET[1] + debug.positionOffsetLocal[1];
    combined[2] = LOWERBODY_CANONICAL_LOCAL_OFFSET[2] + debug.positionOffsetLocal[2];
    computeLowerBodyWorldTransform(
      pose.worldPosition,
      pose.worldYaw,
      combined,
      THREE.MathUtils.degToRad(debug.yawOffsetDeg),
      offsetScratch.current,
      transformOut.current,
    );
    container.position.copy(transformOut.current.position);
    container.rotation.set(0, transformOut.current.yaw, 0);

    if (process.env.NODE_ENV !== 'production') {
      bodyDebugReadout.effectiveYaw = transformOut.current.yaw;
      bodyDebugReadout.cameraToBodyRootDistance = container.position.distanceTo(camera.position);
    }

    if (process.env.NODE_ENV !== 'production' && !loggedMountRef.current) {
      loggedMountRef.current = true;
      console.info(
        '[kael-fp-lowerbody] first ready frame:',
        `worldPos=[${pose.worldPosition.toArray().map((v) => v.toFixed(3)).join(',')}]`,
        `worldYaw=${pose.worldYaw.toFixed(3)}`,
        `generation=${pose.generation}`,
      );
    }
  });

  // Debug-only helpers (camera marker / bounds) — cheap to keep mounted
  // unconditionally; they read from `useBodyDebugStore` (a hook, must be
  // called every render) and simply render nothing when their toggle is
  // off, matching the store's always-off production default.
  const showRootMarker = useBodyDebugStore((s) => s.showBodyRootMarker);
  const showCameraMarker = useBodyDebugStore((s) => s.showCameraMarker);
  const showBounds = useBodyDebugStore((s) => s.showDeformedBodyBounds);
  const showSkeletonLandmarks = useBodyDebugStore((s) => s.showSkeletonLandmarks);
  const cameraMarkerRef = useRef<THREE.Mesh>(null);
  const boundsHelperRef = useRef<THREE.Box3Helper | null>(null);
  if (!boundsHelperRef.current) boundsHelperRef.current = new THREE.Box3Helper(boundsBox.current, new THREE.Color('#5fd4cf'));
  const landmarkWorldPosScratch = useRef(new THREE.Vector3());

  useFrame(() => {
    if (showCameraMarker && cameraMarkerRef.current) cameraMarkerRef.current.position.copy(camera.position);
    if (showBounds && instance) boundsBox.current.setFromObject(instance);
    if (showSkeletonLandmarks) {
      const scratch = landmarkWorldPosScratch.current;
      landmarkBonesRef.current.forEach((landmark, i) => {
        const marker = landmarkMarkerRefs.current[i];
        if (!marker) return;
        landmark.bone.getWorldPosition(scratch);
        marker.position.copy(scratch);
      });
    }
  });

  if (!instance) return null;

  return (
    <>
      <group ref={containerRef} name="kael_fp_lowerbody_root">
        <primitive object={instance} />
        {showRootMarker && <axesHelper args={[0.4]} />}
      </group>
      {/* Camera marker and bounds box are both written in WORLD-space
          coordinates every frame (`camera.position`, `setFromObject`) —
          deliberately NOT nested under `container` above, which would
          apply that group's own position/rotation a second time on top of
          already-world coordinates. */}
      {showCameraMarker && (
        <mesh ref={cameraMarkerRef} raycast={() => null}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshBasicMaterial color="#ff2e6a" toneMapped={false} />
        </mesh>
      )}
      {showBounds && <primitive object={boundsHelperRef.current} />}
      {showSkeletonLandmarks &&
        landmarkBonesRef.current.map((landmark, i) => (
          <mesh
            key={`${landmark.name}-${i}`}
            ref={(el) => {
              landmarkMarkerRefs.current[i] = el;
            }}
            raycast={() => null}
          >
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshBasicMaterial color={landmark.color} toneMapped={false} depthTest={false} />
          </mesh>
        ))}
    </>
  );
}
