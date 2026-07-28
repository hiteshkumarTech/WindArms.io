'use client';

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PLAYER } from '@/lib/game/constants';
import { useLoadedPipelineAsset, useResolveModelSlot } from '@/lib/v2/pipeline';
import { operatorLowerBodySlot } from '@/lib/v2/operators';
import { bodyDebugReadout } from '@/lib/v2/operators/bodyDebugReadout';
import { useBodyDebugStore, type LowerBodyPreviewMode } from '@/lib/v2/operators/bodyDebugStore';
import { getFirstPersonBodyWorldPose } from '@/lib/v2/operators/firstPersonBodyPose';
import { computeLowerBodyWorldTransform, LOWERBODY_CANONICAL_LOCAL_OFFSET, type LowerBodyTransformOutput } from '@/lib/v2/operators/lowerBodyTransform';
import {
  applyLowerBodyLocomotionPose,
  buildLowerBodyRigRuntime,
  createLowerBodyRigScratch,
  MissingLowerBodyBoneError,
  resolveLowerBodyBones,
  restoreLowerBodyRestPose,
  type LowerBodyRigRuntime,
} from '@/lib/v2/operators/lowerBodyRig';
import {
  computeLowerBodyLocomotionPose,
  createLowerBodyLocomotionPose,
  createLowerBodyLocomotionRuntimeState,
  type LowerBodyLocomotionInput,
} from '@/lib/v2/operators/lowerBodyLocomotionPose';
import {
  beginLowerBodyLocomotionPoseGeneration,
  invalidateLowerBodyLocomotionPose,
  publishLowerBodyLocomotionPose,
} from '@/lib/v2/operators/lowerBodyLocomotionPoseBridge';

/**
 * Kael first-person lower-body derivative (Milestone 8, Step 8C static
 * integration, Step 8D procedural locomotion). Renders
 * `operator-kael-lowerbody.glb` (Step 8B/8B.1, waist/pelvis/thighs/knees/
 * shins/boots, no head/neck/shoulders/arms/hands) at the player's world
 * position, following world YAW ONLY, with small restrained procedural
 * bone posing layered on top (idle breathing, walk/sprint gait, jump/air/
 * landing, Wind Lift).
 *
 * OWNERSHIP (non-negotiable, see the Step 8C/8D briefs):
 *   PlayerController.tsx/RangeController.tsx own world position, yaw, AND
 *   movement signals (horizontalSpeed/verticalVelocity/movementState/
 *   windLiftActive), publishing them every frame via `firstPersonBodyPose.ts`
 *   — this component NEVER re-derives position from camera.position, NEVER
 *   recomputes movement/physics, and NEVER reads camera pitch. The camera
 *   owns view pitch alone; this component never rotates on that axis. Kael
 *   FP-arms and the Vortex viewmodel remain entirely separate, camera-
 *   attached components — this one has no coupling to either.
 *
 * PROCEDURAL, NOT AUTHORED (Step 8D): every bone pose below comes from
 * `lowerBodyLocomotionPose.ts`'s pure, hand-tuned functions of movement
 * state/phase — there are no keyframes, no baked animation clips, nothing
 * sampled from a DCC tool. Bone posing is a small ADDITIVE offset applied
 * relative to each bone's validated rest transform (`lowerBodyRig.ts`),
 * never an accumulation on top of the previous frame's already-posed value
 * — every frame recomputes from rest, so there is no cumulative drift and
 * disabling locomotion (`?body=1` panel or `debug.locomotionEnabled`)
 * always reproduces the EXACT Step 8C/8C.1 static rest pose.
 *
 * Deliberately NOT built on `FirstPersonOperatorRig`/`OperatorModel` (same
 * reasoning `KaelFirstPersonArms.tsx`'s doc comment gives — this component
 * owns 100% of its own transform) and does NOT use mesh-name filtering: the
 * asset already physically excludes head/arm geometry, so there is nothing
 * to filter.
 *
 * Step 8E-B — SOLE WRITER of the shared locomotion-pose bridge
 * (`lowerBodyLocomotionPoseBridge.ts`): this component is the only place in
 * the codebase that ever calls `computeLowerBodyLocomotionPose`. The
 * dev-only shadow-body prototype (`KaelFirstPersonShadowBody.tsx`,
 * `/v2/range?shadow=1` only) reads the published result and applies it to
 * its own leg bones — it NEVER computes its own pose, so the two can never
 * advance independent stride phases. See that bridge module's own doc
 * comment for the full reasoning.
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

/**
 * Step 8D — synthetic movement inputs for the debug panel's per-state
 * preview mode, letting a developer inspect any single locomotion state on
 * demand without performing it in-game. `landing` is a one-shot: it reads
 * as a landing only on the FIRST frame after switching into it (a real
 * grounded->true edge), then settles into idle-on-ground for as long as it
 * stays selected — flip to another mode and back to re-trigger, same as
 * re-landing in real play requires actually leaving the ground first.
 */
const PREVIEW_INPUTS: Record<Exclude<LowerBodyPreviewMode, 'live'>, Omit<LowerBodyLocomotionInput, 'deltaSeconds' | 'respawnNonce'>> = {
  idle: { horizontalSpeed: 0, verticalVelocity: 0, grounded: true, movementState: 'idle', windLiftActive: false },
  walk: { horizontalSpeed: PLAYER.WALK_SPEED, verticalVelocity: 0, grounded: true, movementState: 'walk', windLiftActive: false },
  sprint: { horizontalSpeed: PLAYER.SPRINT_SPEED, verticalVelocity: 0, grounded: true, movementState: 'sprint', windLiftActive: false },
  jumpRise: { horizontalSpeed: 0, verticalVelocity: PLAYER.JUMP_VELOCITY, grounded: false, movementState: 'air', windLiftActive: false },
  airborne: { horizontalSpeed: 0, verticalVelocity: -6, grounded: false, movementState: 'air', windLiftActive: false },
  landing: { horizontalSpeed: 0, verticalVelocity: -0.6, grounded: true, movementState: 'idle', windLiftActive: false },
  windLift: { horizontalSpeed: 0, verticalVelocity: 8, grounded: false, movementState: 'air', windLiftActive: true },
};

function LoadedKaelLowerBody({ url, lod }: { url: string; lod: 0 | 1 | 2 }) {
  const result = useLoadedPipelineAsset(operatorLowerBodySlot('kael'), url, lod);
  const camera = useThree((state) => state.camera);
  const containerRef = useRef<THREE.Group>(null);
  const loggedMountRef = useRef(false);

  const offsetScratch = useRef(new THREE.Vector3());
  const combinedOffsetScratch = useRef<[number, number, number]>([0, 0, 0]);
  const transformOut = useRef<LowerBodyTransformOutput>({ position: new THREE.Vector3(), yaw: 0 });
  const boundsBox = useRef(new THREE.Box3());

  // Step 8D — rig + locomotion runtime, one per mount (never module-level —
  // see lowerBodyLocomotionPose.ts's doc comment on why this must be
  // caller-owned). `rigRuntimeRef` starts null and is built once bone
  // resolution succeeds (see the effect below); a resolution failure
  // (dev-time validation, see lowerBodyRig.ts) leaves it null forever and
  // the component gracefully continues in Step 8C static-only mode rather
  // than hiding the whole body.
  const rigRuntimeRef = useRef<LowerBodyRigRuntime | null>(null);
  const locomotionRuntimeRef = useRef(createLowerBodyLocomotionRuntimeState());
  const locomotionPoseRef = useRef(createLowerBodyLocomotionPose());
  const rigScratchRef = useRef(createLowerBodyRigScratch());
  const lastUpdateTickRef = useRef(-1);

  // Step 8E-B — this component is the shared locomotion-pose bridge's SOLE
  // writer; see the module doc comment above. Fresh generation per mount,
  // same straggler-frame protection as every other bridge in this codebase.
  const locomotionBridgeGenerationRef = useRef(0);
  useEffect(() => {
    const generation = beginLowerBodyLocomotionPoseGeneration();
    locomotionBridgeGenerationRef.current = generation;
    return () => invalidateLowerBodyLocomotionPose(generation);
  }, []);

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
        // this integration pass. receiveShadow may stay on when it reads
        // correctly (verified in the browser validation pass).
        node.castShadow = false;
        node.receiveShadow = true;
        // Camera-near skinned geometry — same reasoning as the arms rig:
        // this mesh's bounding sphere is computed from its REST pose and
        // never updates (bone posing here is small/additive, not enough to
        // invalidate the bound in practice), so frustum culling against a
        // stale/incorrect bound could pop the whole body out of view when
        // it's actually on-screen.
        node.frustumCulled = false;
      }
    });
  }, [instance]);

  // Step 8D — resolve the 7 required leg/pelvis bones and measure their
  // rest metrics ONCE, right after the fresh clone's skeleton is available
  // and BEFORE any procedural pose has ever touched it (see
  // `buildLowerBodyRigRuntime`'s doc comment). A resolution failure is
  // caught here (not left to bubble to the error boundary) so a bone-name
  // mismatch degrades to "static body, no locomotion" rather than hiding
  // the whole feature — the static integration is strictly more valuable
  // to keep than an all-or-nothing failure.
  useEffect(() => {
    rigRuntimeRef.current = null;
    if (!instance || !containerRef.current) return;
    try {
      const bones = resolveLowerBodyBones(instance);
      rigRuntimeRef.current = buildLowerBodyRigRuntime(containerRef.current, bones);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        const detail = error instanceof MissingLowerBodyBoneError ? error.message : String(error);
        console.warn(`[kael-fp-lowerbody] locomotion rig resolution failed — continuing in static-only mode. ${detail}`);
      }
    }
    return () => {
      rigRuntimeRef.current = null;
    };
  }, [instance]);

  useEffect(() => {
    const map = originalMaterialsRef.current;
    return () => map.clear();
  }, []);

  useFrame((_state, rawDelta) => {
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
    // camera pitch, never recoil/sway/ADS/weapon motion. The canonical
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

    // Step 8D — procedural bone posing, layered on top of the rigid
    // position/yaw transform just set above. Disabled (or rig not yet
    // resolved) always means an exact, unconditional rest-pose restore —
    // never a residual offset from a previous frame.
    const rig = rigRuntimeRef.current;
    if (rig) {
      if (!debug.locomotionEnabled) {
        restoreLowerBodyRestPose(rig);
      } else {
        // Pause/stall detection: `pose.updateTick` only advances when the
        // owning controller actually published this browser frame (see
        // firstPersonBodyPose.ts's Step 8D doc comment) — if it didn't,
        // elapsed time for the locomotion pose is 0, which is exactly
        // "pause freezes the last valid pose" with no explicit paused
        // concept needed here or in either controller.
        const tickAdvanced = pose.updateTick !== lastUpdateTickRef.current;
        lastUpdateTickRef.current = pose.updateTick;
        const liveDelta = tickAdvanced ? Math.max(0, rawDelta) : 0;

        // A small plain literal, not a persistent mutable scratch — cheap
        // enough for V8 to optimize (7 numbers/booleans, monomorphic shape
        // every frame), same tolerance the codebase already has for
        // PlayerController.tsx's own per-frame `desired = {x,y,z}` literal.
        // `LowerBodyLocomotionInput`'s fields are deliberately `readonly` at
        // the pure-module boundary, so a genuinely reused/mutated scratch
        // object would fight that on every write.
        const movementSource = debug.previewMode === 'live' ? pose : PREVIEW_INPUTS[debug.previewMode];
        const input: LowerBodyLocomotionInput = {
          deltaSeconds: debug.freezeStride ? 0 : liveDelta,
          horizontalSpeed: movementSource.horizontalSpeed,
          verticalVelocity: movementSource.verticalVelocity,
          grounded: movementSource.grounded,
          movementState: movementSource.movementState,
          windLiftActive: movementSource.windLiftActive,
          respawnNonce: pose.respawnNonce,
        };
        if (debug.freezeStride) {
          locomotionRuntimeRef.current.gaitPhase = THREE.MathUtils.clamp(debug.stridePhaseScrub, 0, 1) * Math.PI * 2;
        }

        const locomotionPose = computeLowerBodyLocomotionPose(input, locomotionRuntimeRef.current, locomotionPoseRef.current);
        applyLowerBodyLocomotionPose(rig, container, locomotionPose, rigScratchRef.current);
        // Step 8E-B — publish for the dev-only shadow-body prototype (a no-op
        // when nothing is reading it, i.e. on every route/session where
        // ?shadow=1 isn't set). Published unconditionally whenever a pose is
        // actually computed this frame — when locomotion is disabled
        // (`!debug.locomotionEnabled`, the branch above this one), nothing
        // publishes and a shadow consumer simply keeps whatever it last read.
        publishLowerBodyLocomotionPose(locomotionBridgeGenerationRef.current, locomotionPose);

        if (process.env.NODE_ENV !== 'production') {
          bodyDebugReadout.locomotionState = locomotionPose.state;
          bodyDebugReadout.stridePhase = locomotionPose.phase;
          bodyDebugReadout.locomotionBlendWeight = locomotionPose.blendWeight;
          bodyDebugReadout.pelvisPositionOffset[0] = locomotionPose.pelvisPositionOffset[0];
          bodyDebugReadout.pelvisPositionOffset[1] = locomotionPose.pelvisPositionOffset[1];
          bodyDebugReadout.pelvisPositionOffset[2] = locomotionPose.pelvisPositionOffset[2];
          bodyDebugReadout.pelvisRotationEuler[0] = locomotionPose.pelvisRotationEuler[0];
          bodyDebugReadout.pelvisRotationEuler[1] = locomotionPose.pelvisRotationEuler[1];
          bodyDebugReadout.pelvisRotationEuler[2] = locomotionPose.pelvisRotationEuler[2];
          bodyDebugReadout.leftUpperLegPitch = locomotionPose.leftUpperLegRotation[0];
          bodyDebugReadout.rightUpperLegPitch = locomotionPose.rightUpperLegRotation[0];
          bodyDebugReadout.leftLowerLegPitch = locomotionPose.leftLowerLegRotation[0];
          bodyDebugReadout.rightLowerLegPitch = locomotionPose.rightLowerLegRotation[0];
          bodyDebugReadout.leftFootPitch = locomotionPose.leftFootRotation[0];
          bodyDebugReadout.rightFootPitch = locomotionPose.rightFootRotation[0];
        }
      }
    }

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
