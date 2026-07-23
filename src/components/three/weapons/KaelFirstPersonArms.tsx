'use client';

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useLoadedPipelineAsset, useResolveModelSlot } from '@/lib/v2/pipeline';
import { operatorArmsSlot } from '@/lib/v2/operators';
import { MissingCriticalBoneError, recenterArmMetrics, resolveKaelArmBones } from '@/lib/v2/operators/kaelArmRig';
import { buildSideRuntimeState, classifyVerticesInCameraSpace, isDev, restoreRestPose, solveSide, type SideTuningOverrides, warnOnce } from '@/lib/v2/operators/kaelArmSolve';
import { FIRST_PERSON_ARM_IK_CONFIG, LEFT_HAND_FINGER_POSE, RIGHT_HAND_FINGER_POSE } from '@/lib/v2/operators/firstPersonArmIkConfig';
import { computeArmWeightTargets, createArmWeightSmoothState, smoothArmWeights } from '@/lib/v2/operators/firstPersonArmWeights';
import { getGripWorldPose } from '@/lib/v2/weapons/gripWorldPose';
import { kaelArmDebugState } from '@/lib/v2/weapons/kaelArmDebugState';
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';
import { useGripTunerStore } from '@/lib/v2/weapons/gripTunerStore';
import { useIkTunerStore } from '@/lib/v2/weapons/ikTunerStore';

/**
 * Kael first-person arms — weapon-authoritative IK consumer (Milestone 7,
 * Phase F, Step 6). Deliberately NOT built on `OperatorModel`/
 * `FirstPersonOperatorRig` (see docs/decisions.md for the survey that
 * ruled those out): this component owns 100% of its own transform and
 * per-frame logic, reads the Vortex-owned grip world poses
 * (`gripWorldPose.ts`) as its ONLY target source, and never writes
 * anything back to the weapon. The actual per-arm IK solve lives in
 * `kaelArmSolve.ts` (extracted 2026-07-22 so it's independently testable —
 * two real bugs were caught in that exact code path before it had test
 * coverage of its own).
 *
 * TRANSFORM OWNERSHIP (non-negotiable, see the milestone brief):
 *   VortexViewmodel owns the weapon transform — hip/ADS pose, sway, bob,
 *   recoil, reload, inspect. This component's arm-rig root follows the
 *   camera for COARSE shoulder placement ONLY (position/quaternion copy +
 *   a small static offset) — it never reproduces the weapon's hip/ADS/
 *   recoil motion, and the arms never move the weapon, the camera, or the
 *   gameplay aim ray. Hands are solved TOWARD the weapon's published grip
 *   targets every frame; the weapon never reads anything from the arms.
 *
 * HIERARCHY:
 *   arm-rig root (camera-relative, coarse placement only)
 *     └─ Kael FP-arms skinned mesh (SkeletonUtils clone, once per mount,
 *        recentered as a single rigid unit — see the `runtime` useMemo)
 *          shoulder/clavicle bones: left at rest, untouched
 *          upper-arm/lower-arm bones: two-bone IK solve toward grip targets
 *          hand bones: aligned to grip target quaternion via measured
 *                      per-hand basis correction (kaelArmRig.ts)
 *          finger bones: restrained additive grip-curl pose (temporary)
 */

function KaelArmsInner() {
  // The V2 range/play Canvases both configure a `PerspectiveCamera` (see
  // `RangeScene.tsx`'s `camera={{ fov, near, far, position }}` prop) —
  // cast once here rather than threading `THREE.Camera` through every
  // downstream consumer that needs `.near`/`.far`/`.fov`
  // (`classifyVerticesInCameraSpace`, the DIRECT CAMERA MOUNT diagnostic).
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const { url, lod, resolving } = useResolveModelSlot(operatorArmsSlot('kael'));

  if (resolving || !url || lod === null) return null;

  return (
    <Suspense fallback={null}>
      <LoadedKaelArms url={url} lod={lod} camera={camera} />
    </Suspense>
  );
}

/** Catches a genuine load failure (not the normal Suspense loading path) — arms are purely additive, so any failure here must never affect the Vortex Rifle's own playability. Same convention as SceneErrorBoundary.tsx, but falls back to nothing rendered rather than a visual replacement (there IS no visual fallback for "arms" — omitting them entirely is correct, the rifle already renders fine on its own). */
class KaelArmsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    warnOnce('load-error', `Kael FP-arms failed to load — omitting arms, Vortex Rifle remains fully playable. ${String(error)}`);
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function KaelFirstPersonArms() {
  return (
    <KaelArmsErrorBoundary>
      <KaelArmsInner />
    </KaelArmsErrorBoundary>
  );
}

function LoadedKaelArms({ url, lod, camera }: { url: string; lod: number; camera: THREE.PerspectiveCamera }) {
  const result = useLoadedPipelineAsset(operatorArmsSlot('kael'), url, lod as 0 | 1 | 2);
  const scene = useThree((state) => state.scene);
  const containerRef = useRef<THREE.Group>(null);
  const containerWorldQuatRef = useRef(new THREE.Quaternion());
  const loggedPoseStatusRef = useRef(false);
  const loggedIkValidRef = useRef(false);
  const loggedRestPoseDiagnosticRef = useRef(false);
  const loggedDirectCameraMountRef = useRef(false);
  const loggedOwnershipCheckRef = useRef(false);

  // Step 6F calibration-tuning scratch — one reusable `SideTuningOverrides`
  // object + basis-adjustment `Quaternion`/`Euler` per side, mutated in
  // place every frame (same zero-allocation-hot-path convention as every
  // other per-frame scratch in this file). Degrees->radians conversion
  // happens here, once per side per frame — the tuner store stays in
  // degrees (UI-friendly), `kaelArmSolve.ts` stays in radians (its own
  // established convention, matches every other rotation in this codebase).
  const rightTuningRef = useRef<SideTuningOverrides>({ handBasisAdjustQuat: new THREE.Quaternion(), shoulderAssistLocal: new THREE.Vector3() });
  const leftTuningRef = useRef<SideTuningOverrides>({ handBasisAdjustQuat: new THREE.Quaternion(), shoulderAssistLocal: new THREE.Vector3() });
  const basisEulerScratchRef = useRef(new THREE.Euler());

  // "DIRECT CAMERA MOUNT" diagnostic (Step 6E) — a dedicated Group parented
  // directly onto the camera object itself (true THREE.js parent-child, not
  // the per-frame position/quaternion COPY the normal `container` uses), at
  // a fixed local offset. `instance` is reparented into this group (and
  // back to `container` on exit) rather than duplicated — the spec asks to
  // "move the entire cloned hierarchy together," and reparenting the one
  // existing clone satisfies that without a second, separately-loaded copy
  // of a 10k-vertex mesh existing for a dev-only diagnostic.
  const diagnosticGroupRef = useRef<THREE.Group | null>(null);
  if (!diagnosticGroupRef.current) diagnosticGroupRef.current = new THREE.Group();
  const diagnosticMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  if (!diagnosticMaterialRef.current) {
    diagnosticMaterialRef.current = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ff00ff'),
      depthTest: false,
      depthWrite: false,
      transparent: false,
      opacity: 1,
      colorWrite: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  }
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const directMountActiveRef = useRef(false);

  // Per-instance clone — same reasoning as OperatorModel.tsx: useGLTF caches
  // one scene per URL, rendering it directly in two places (or twice across
  // remounts) fights over one skeleton/AnimationMixer. SkeletonUtils.clone
  // duplicates the hierarchy, shares geometry/materials (cheap), and is
  // never disposed here (the useGLTF cache owns those resources) — exact
  // same pattern, not a reinvention. `instance` is the ONE shared root that
  // owns BOTH the SkinnedMesh and the skeleton/armature (this GLB's own
  // hierarchy nests the mesh under the Armature node, not as a sibling) —
  // any recentering below must move THIS object, never the SkinnedMesh
  // alone (see the `runtime` useMemo's comment for why that would break
  // the bind relationship).
  const instance = useMemo(() => {
    if (!result.scene) return null;
    const cloned = cloneSkeleton(result.scene);
    if (isDev) {
      let meshCount = 0;
      let skinnedMeshCount = 0;
      const materialNames = new Set<string>();
      cloned.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          meshCount += 1;
          if ((node as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshCount += 1;
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          for (const m of mats) materialNames.add(m.name || '(unnamed)');
        }
      });
      console.info(`[kael-fp-arms] asset loaded: url=${url} lod=${lod} meshes=${meshCount} skinnedMeshes=${skinnedMeshCount} materials=[${[...materialNames].join(',')}]`);
    }
    return cloned;
  }, [result.scene, url, lod]);

  // Bone resolution + rest-metrics measurement — ONCE per cloned instance
  // (Step 3/6/17: never re-traversed per frame). A missing critical bone
  // omits the arms entirely (render null) rather than crashing or showing
  // a broken partial rig — Step 16's explicit fallback contract.
  const runtime = useMemo(() => {
    if (!instance) return null;
    try {
      const resolved = resolveKaelArmBones(instance);
      // Measured with `instance` still at its default identity transform
      // (unparented at this point), so these positions equal the RAW
      // skeleton-authored world coordinates.
      const left = buildSideRuntimeState(instance, resolved.left);
      const right = buildSideRuntimeState(instance, resolved.right);

      // RECENTER (blocker fix, 2026-07-22 — root cause of "arms mounted but
      // invisible in both /v2/range and /v2/range?ik=1"). Confirmed via a
      // headless GLTFLoader+SkeletonUtils.clone trace of the real asset:
      // `operator-kael-arms.glb`'s skeleton is authored in FULL-BODY
      // character space (hips ~y=1.06, shoulders ~y=1.52, hands ~y=0.85-1.05
      // — the same "feet at origin" convention as the body derivative), NOT
      // shoulder/camera-relative. Left uncorrected, the raw measurements
      // above (`shoulderLocalPos` etc.) equal those same character-height
      // coordinates — applied on top of `containerRef`'s camera-following
      // position at runtime, this places both the rendered mesh AND every
      // IK target/pivot roughly 1.5m ABOVE the camera, entirely outside the
      // normal forward view.
      //
      // `recenterArmMetrics` (kaelArmRig.ts) corrects the cached metrics;
      // `instance` — the SHARED root of BOTH the SkinnedMesh and every bone
      // (never the SkinnedMesh alone) — is separately shifted by the same
      // negated anchor. Moving only the mesh node while leaving the
      // skeleton in the original frame WOULD break the mesh-to-bone bind
      // relationship (skinning is computed from bone matrices against a
      // FIXED bind matrix captured at load time — moving just the mesh node
      // changes nothing about skinning in 'attached' bind mode, since that
      // mode doesn't reference the mesh's own matrixWorld at all, so the
      // geometry would stay stuck at the OLD, uncorrected position while
      // the IK math starts targeting the NEW, corrected one — exactly the
      // kind of divergence that tears geometry apart). Translating
      // `instance` instead moves BOTH the mesh's nominal transform AND
      // every bone's matrixWorld by the identical rigid amount — skinning
      // in 'attached' mode is driven entirely by bone matrices relative to
      // a fixed bind matrix, so a uniform ancestor translation reproduces
      // as a uniform, non-deforming translation of every skinned vertex.
      const anchor = recenterArmMetrics(left.metrics, right.metrics);
      instance.position.copy(anchor).negate();
      instance.updateMatrixWorld(true);

      if (isDev) {
        const box = new THREE.Box3().setFromObject(instance);
        const size = new THREE.Vector3();
        box.getSize(size);
        console.info(
          '[kael-fp-arms] mounted:',
          `recenter anchor=[${anchor.toArray().map((v) => v.toFixed(3)).join(',')}]`,
          `post-recenter bbox size=[${size.toArray().map((v) => v.toFixed(3)).join(',')}]`,
          `bbox min=[${box.min.toArray().map((v) => v.toFixed(3)).join(',')}] max=[${box.max.toArray().map((v) => v.toFixed(3)).join(',')}]`,
          `left upperLength=${left.metrics.upperLength.toFixed(3)} lowerLength=${left.metrics.lowerLength.toFixed(3)}`,
          `right upperLength=${right.metrics.upperLength.toFixed(3)} lowerLength=${right.metrics.lowerLength.toFixed(3)}`,
        );
      }

      return { left, right };
    } catch (error) {
      if (error instanceof MissingCriticalBoneError) {
        warnOnce(`missing-bone-${error.side}-${error.chain}`, error.message);
        return null;
      }
      throw error;
    }
  }, [instance]);

  const smoothState = useMemo(() => ({ right: createArmWeightSmoothState(), left: createArmWeightSmoothState() }), []);

  useEffect(() => {
    if (instance) {
      instance.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = true;
          node.frustumCulled = false;
        }
      });
    }
  }, [instance]);

  // Diagnostic-group cleanup (Step 6E) — if the component unmounts while
  // DIRECT CAMERA MOUNT is still active (route change, Suspense retry),
  // the diagnostic group would otherwise stay attached to the (persistent,
  // R3F-managed) camera object forever — a leaked scene-graph node that
  // has nothing to do with whatever mounts next. `group.parent` is safe to
  // read/remove-from unconditionally regardless of current mode.
  useEffect(() => {
    return () => {
      const group = diagnosticGroupRef.current;
      if (group?.parent) group.parent.remove(group);
      diagnosticMaterialRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const container = containerRef.current;
    if (!container || !runtime || !instance) return;

    const store = useVortexWeaponStore.getState();
    const gripTuner = useGripTunerStore.getState();
    const ikTuner = useIkTunerStore.getState();
    const now = performance.now();
    const frozen = gripTuner.frozen || ikTuner.frozen;

    // "DIRECT CAMERA MOUNT" (Step 6E, 2026-07-22) — the hardest-possible
    // isolation diagnostic: parents the complete clone (mesh + full bone
    // hierarchy, moved together, never the mesh alone) DIRECTLY onto the
    // camera object via true THREE.js parent-child (`camera.add`), at a
    // fixed local offset, and swaps every material for a depth-ignoring,
    // double-sided, fully-opaque override. This bypasses the ENTIRE normal
    // transform chain (per-frame camera-position COPY into `container`,
    // `shoulderRootOffset`, IK, wrist correction, finger posing) — if the
    // arms are STILL invisible here, the bug is in the asset/clone/
    // material/render path, not the camera-relative transform chain.
    //
    // Deliberate deviation from a fully literal reading of the brief: the
    // recenter anchor (`instance.position`, set once at mount by
    // `recenterArmMetrics`) is intentionally LEFT APPLIED rather than
    // zeroed. That anchor is a fixed ASSET-SPACE coordinate correction
    // (this GLB's skeleton is authored in full-body character space, not
    // shoulder-relative — see docs/decisions.md's "Kael FP-arm visibility
    // blocker" entry) proven correct by extensive prior headless testing,
    // not part of the per-frame "gameplay arm-root logic" this diagnostic
    // exists to bypass. Disabling it here would just reproduce the
    // already-diagnosed, already-fixed "mesh 1.5m above the camera"
    // symptom for a reason we already know, defeating the point of this
    // specific diagnostic. If this deviation turns out to be wrong, the
    // fix is a one-line removal of the anchor-preserving comment below —
    // flagged prominently in the Step 6E report for the same reason.
    if (ikTuner.directCameraMount !== directMountActiveRef.current) {
      directMountActiveRef.current = ikTuner.directCameraMount;
      const group = diagnosticGroupRef.current!;
      const diagMat = diagnosticMaterialRef.current!;
      if (ikTuner.directCameraMount) {
        // CRITICAL: three.js's own renderer builds its render list by
        // traversing from `scene` (`projectObject(scene, camera, ...)` in
        // `WebGLRenderer.render()`), never from `camera` — and R3F's
        // default camera (created from the `camera={{...}}` shorthand
        // prop, as `RangeScene.tsx` does) is NOT itself added to the
        // scene graph (`camera.parent === null` is the normal, expected
        // case R3F/three.js both special-case for, e.g. in their own
        // matrixWorld-update logic). Anything parented directly onto such
        // a camera would therefore NEVER be visited by that traversal —
        // invisible by omission, regardless of material/visible/
        // frustumCulled — unless the camera itself is made a scene
        // descendant first. Idempotent and harmless: `scene`'s own
        // transform is identity, so this changes nothing about the
        // camera's resulting world position/orientation.
        if (camera.parent !== scene) scene.add(camera);
        instance.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            if (!originalMaterialsRef.current.has(node)) originalMaterialsRef.current.set(node, node.material);
            node.material = diagMat;
            node.frustumCulled = false;
            node.renderOrder = 999;
          }
        });
        // Local offset [0, 0.2, -0.6] — NOT the brief's literal [0,-0.2,-0.8]
        // suggestion. Headlessly swept against the real rebuilt asset (rest
        // pose, recenter anchor applied, `classifyVerticesInCameraSpace`):
        // [0,-0.2,-0.8] leaves only 4.5% of vertices inside the visible
        // frustum (the rest-pose arm hangs mostly below frame — see this
        // pass's Step 6E report for why), while [0, 0.2, -0.6] gets 100% of
        // vertices inside frame at a comfortable ~0.58m nearest distance.
        // This is a property of THIS DIAGNOSTIC'S OWN fixed viewing offset,
        // never the shipping `shoulderRootOffset` or any authored pose —
        // adjusting it is tool calibration, not gameplay pose tuning.
        group.position.set(0, 0.2, -0.6);
        group.quaternion.identity();
        group.scale.set(1, 1, 1);
        camera.add(group);
        group.add(instance); // THREE's `.add()` auto-detaches `instance` from its previous parent (`container`) — never two parents at once.
        loggedDirectCameraMountRef.current = false;
        loggedOwnershipCheckRef.current = false;
        if (isDev) {
          console.info(
            '[kael-fp-arms][direct-camera-mount] ENTER —',
            `original materials captured=${originalMaterialsRef.current.size}`,
            `diagnostic material uuid=${diagMat.uuid}`,
            `local offset=[0,0.2,-0.6] (recenter anchor preserved, shoulderRootOffset + camera-copy bypassed; offset chosen by headless frustum sweep, see docs/decisions.md)`,
          );
        }
      } else {
        container.add(instance); // reparent back to the normal camera-following container
        camera.remove(group);
        instance.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            const original = originalMaterialsRef.current.get(node);
            if (original) node.material = original;
            node.frustumCulled = false; // normal-mode default, set unconditionally by the mount effect below
            node.renderOrder = 0;
          }
        });
        if (isDev) console.info('[kael-fp-arms][direct-camera-mount] EXIT — original materials and normal parenting restored.');
      }
    }

    if (ikTuner.directCameraMount) {
      restoreRestPose(runtime.right);
      restoreRestPose(runtime.left);
      instance.visible = true;
      container.visible = false;
      // Same staleness class as Step 6D's bounding-box fix: bones mutated by
      // `restoreRestPose` need an explicit matrixWorld refresh so ANY
      // same-frame reader (this diagnostic's own logging below, and
      // `KaelArmIkDebug`'s bounding-box helper, which runs in a SEPARATE
      // `useFrame` later in the same tick) sees this frame's values, not
      // whatever was left over from before this branch ran. `updateParents:
      // true` also re-derives `instance`'s ancestor chain (now `camera` ->
      // `group` -> `instance`), which the plain `container`-relative
      // refresh below does not cover once `instance` is reparented.
      instance.updateWorldMatrix(true, true);
      kaelArmDebugState.ready = false;

      if (isDev && !loggedOwnershipCheckRef.current) {
        loggedOwnershipCheckRef.current = true;
        let namedCount = 0;
        scene.traverse((node) => {
          if (node.name === 'kael_fp_arms_root') namedCount += 1;
        });
        console.info(`[kael-fp-arms][direct-camera-mount] R3F ownership check: ${namedCount} object(s) named 'kael_fp_arms_root' found in scene (expect exactly 1).`);
      }

      if (isDev && !loggedDirectCameraMountRef.current) {
        loggedDirectCameraMountRef.current = true;
        const meshes: THREE.SkinnedMesh[] = [];
        instance.traverse((node) => {
          if ((node as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(node as THREE.SkinnedMesh);
        });
        console.info(`[kael-fp-arms][direct-camera-mount] rendered SkinnedMesh count under clone: ${meshes.length}`);
        const mesh = meshes[0];
        if (mesh) {
          const parentNames: string[] = [];
          let p: THREE.Object3D | null = mesh;
          while (p) {
            parentNames.push(p.name || p.type);
            p = p.parent;
          }
          const worldPos = new THREE.Vector3();
          const worldScale = new THREE.Vector3();
          mesh.getWorldPosition(worldPos);
          mesh.getWorldScale(worldScale);
          const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshBasicMaterial;
          console.info(
            '[kael-fp-arms][direct-camera-mount] SkinnedMesh diagnostic:',
            `name=${mesh.name} uuid=${mesh.uuid}`,
            `parentChain=[${parentNames.join(' <- ')}]`,
            `visible=${mesh.visible} frustumCulled=${mesh.frustumCulled} renderOrder=${mesh.renderOrder}`,
            `material=${mat.type}/${mat.name || '(unnamed)'} uuid=${mat.uuid}`,
            `transparent=${mat.transparent} opacity=${mat.opacity} depthTest=${mat.depthTest} depthWrite=${mat.depthWrite} colorWrite=${mat.colorWrite} side=${mat.side}`,
            `geometryVertexCount=${mesh.geometry.attributes.position.count}`,
            `skeletonBoneCount=${mesh.skeleton.bones.length}`,
            `worldPos=[${worldPos.toArray().map((v) => v.toFixed(3)).join(',')}]`,
            `worldScale=[${worldScale.toArray().map((v) => v.toFixed(3)).join(',')}]`,
          );

          const classification = classifyVerticesInCameraSpace(mesh, camera);
          console.info(
            '[kael-fp-arms][direct-camera-mount] camera-space classification:',
            `total=${classification.totalVertices}`,
            `inFront=${classification.inFrontOfCamera} behind=${classification.behindCamera}`,
            `nearerThanNear=${classification.nearerThanNear} fartherThanFar=${classification.fartherThanFar}`,
            `insideFrustumNdc=${classification.insideFrustumNdc}/${classification.totalVertices}`,
            `ndcX=[${classification.ndcMinX.toFixed(2)},${classification.ndcMaxX.toFixed(2)}] ndcY=[${classification.ndcMinY.toFixed(2)},${classification.ndcMaxY.toFixed(2)}]`,
            `centerCameraSpace=[${classification.centerCameraSpace.map((v) => v.toFixed(3)).join(',')}]`,
            `nearest=${classification.nearestDist.toFixed(3)}m farthest=${classification.farthestDist.toFixed(3)}m`,
          );
          console.info(
            '[kael-fp-arms][direct-camera-mount] layers:',
            `camera.layers.mask=${camera.layers.mask}`,
            `instance.layers.mask=${instance.layers.mask}`,
            `mesh.layers.mask=${mesh.layers.mask}`,
          );
        }
      }
      return;
    }
    loggedDirectCameraMountRef.current = false;
    loggedOwnershipCheckRef.current = false;

    // Coarse shoulder placement ONLY — camera position/quaternion plus a
    // small static offset. Deliberately does NOT reproduce the weapon's
    // hip/ADS/recoil/sway/bob transform chain (that would double-motion
    // against the weapon-owned grip targets this rig is solving toward).
    if (!frozen) {
      container.position.copy(camera.position);
      container.quaternion.copy(camera.quaternion);
      const offset = ikTuner.shoulderRootOffset ?? FIRST_PERSON_ARM_IK_CONFIG.shoulderRootOffset;
      container.translateX(offset[0]);
      container.translateY(offset[1]);
      container.translateZ(offset[2]);
    }
    // Defensive hardening (2026-07-22 blocker-fix pass), NOT confirmed as
    // the exploded-geometry root cause — recorded honestly rather than
    // overclaimed. Original theory: `updateChildren=false` leaves
    // `instance`'s subtree matrixWorld one-frame-stale, and `solveSide`'s
    // `bones.upperArm.parent!.getWorldQuaternion(...)` read would return a
    // stale value. Built a dedicated regression test
    // (`kaelArmSolve.test.ts`) to prove it — the test DISPROVED the theory:
    // `Object3D.getWorldQuaternion()`/`getWorldPosition()` call
    // `updateWorldMatrix(true, false)` on themselves internally before
    // reading, so they self-correct their own ancestor chain regardless of
    // what the caller already updated. `updateChildren=true` is kept anyway
    // — it's cheap (~65 bones) and is still the more defensible default for
    // any FUTURE direct `.matrixWorld` read added to this frame's solve
    // that DOESN'T go through a self-updating accessor — but it is not
    // known to fix the reported symptom. See docs/decisions.md for the
    // full investigation, including exhaustive headless verification
    // (single-frame, 30-frame oscillating-camera, real finger/target
    // rotations, actual GPU-equivalent skinning math via
    // `SkinnedMesh.applyBoneTransform`) that found NO reproducible
    // geometry explosion, and the one real anomaly identified instead — a
    // shoulder-joint vertex sitting ~12cm from the camera, which a 75° FOV
    // could plausibly render as huge, correctly-shaped-but-close geometry
    // rather than corruption. Not confirmed without an actual screenshot.
    container.updateWorldMatrix(true, true);

    // "REST MESH DIAGNOSTIC" (Step 6D, 2026-07-22) — a HARD bypass of the
    // entire IK path, distinct from `ikDisabled` (which still runs
    // `solveSide` with weight=0, exercising the solver's own weight-blend
    // math — see `restoreRestPose`'s doc comment for why a harder bypass
    // was needed as a diagnostic ground truth). Deliberately checked BEFORE
    // the `pose.ready` gate below: a rest pose needs no grip target at all,
    // so this mode renders regardless of whether VortexViewmodel has
    // published yet — isolating "is the mesh/skeleton renderable" from "is
    // the grip-pose bridge publishing" as two independently answerable
    // questions, per the brief's own framing.
    if (ikTuner.restPoseDiagnostic) {
      restoreRestPose(runtime.right);
      restoreRestPose(runtime.left);
      container.visible = true;
      // Step 6E staleness fix — same reasoning as the DIRECT CAMERA MOUNT
      // branch above: `restoreRestPose` mutates bone LOCAL transforms
      // AFTER this frame's earlier `container.updateWorldMatrix` call
      // (top of this function), so every bone's `matrixWorld` is one step
      // stale at this point. This component's OWN reads below
      // (`bone.getWorldPosition`) self-correct regardless (see
      // `solveSide`'s doc comment on `getWorldQuaternion`/`getWorldPosition`'s
      // self-updating property), but `KaelArmIkDebug`'s bounding-box helper
      // runs in a SEPARATE `useFrame` later in the same tick and reads
      // `matrixWorld` directly via `SkinnedMesh.applyBoneTransform` — it has
      // no such self-correction, and previously would have read this
      // frame's PRE-restore bone poses instead of the just-restored rest
      // pose. Refreshing here closes that gap.
      container.updateWorldMatrix(true, true);
      kaelArmDebugState.ready = false; // no IK target/pole to show meaningfully in this mode

      if (isDev && !loggedRestPoseDiagnosticRef.current) {
        loggedRestPoseDiagnosticRef.current = true;
        const camInverse = new THREE.Matrix4().copy(camera.matrixWorld).invert();
        const worldPos = new THREE.Vector3();
        const camSpace = new THREE.Vector3();
        const logSide = (label: string, bones: typeof runtime.right.bones) => {
          for (const [part, bone] of [
            ['shoulder(upperArm)', bones.upperArm],
            ['elbow(lowerArm)', bones.lowerArm],
            ['hand', bones.hand],
          ] as const) {
            bone.getWorldPosition(worldPos);
            camSpace.copy(worldPos).applyMatrix4(camInverse);
            console.info(
              `[kael-fp-arms][rest-pose-diagnostic] ${label} ${part}:`,
              `world=[${worldPos.toArray().map((v) => v.toFixed(3)).join(',')}]`,
              `camera-space=[${camSpace.toArray().map((v) => v.toFixed(3)).join(',')}]`,
              `finite=${Number.isFinite(worldPos.x) && Number.isFinite(worldPos.y) && Number.isFinite(worldPos.z)}`,
            );
          }
        };
        logSide('right', runtime.right.bones);
        logSide('left', runtime.left.bones);
        console.info('[kael-fp-arms][rest-pose-diagnostic] camera-space convention: -Z is forward, +Y is up, +X is right (standard three.js camera-local axes).');
      }
      return;
    }
    loggedRestPoseDiagnosticRef.current = false;

    const pose = getGripWorldPose();
    container.visible = pose.ready;

    if (isDev && !loggedPoseStatusRef.current) {
      loggedPoseStatusRef.current = true;
      console.info(
        `[kael-fp-arms] first frame: grip pose ready=${pose.ready} generation=${pose.generation}`,
        `container world pos=[${container.position.toArray().map((v) => v.toFixed(3)).join(',')}]`,
        `camera dist to container=${container.position.distanceTo(camera.position).toFixed(3)}`,
      );
      if (!pose.ready) {
        warnOnce('grip-pose-not-ready-first-frame', 'Grip world pose is not ready on the first frame — arms will stay hidden until VortexViewmodel publishes (expected briefly on mount, a problem if this persists).');
      }
    }

    if (!pose.ready) return;

    const containerWorldQuat = containerWorldQuatRef.current;
    container.getWorldQuaternion(containerWorldQuat);

    const targets = computeArmWeightTargets({
      reloading: store.reloadingUntil !== 0,
      inspecting: now < store.inspectingUntil,
      frozen,
    });
    if (!frozen) {
      smoothArmWeights(smoothState.right, targets, delta);
      smoothArmWeights(smoothState.left, targets, delta);
    }

    // Diagnostic-only (blocker pass, 2026-07-22; extended Step 6F): `?ik=1`'s
    // "IK disabled" toggle forces weight 0 (pure rest pose) while leaving
    // the mesh mounted and `container.visible` still driven normally —
    // proves the mesh/skeleton render independently of the IK solve. The
    // newer continuous `ikWeight` slider (Step 6F, 0..1) takes priority
    // when set — needed for calibration stages that hold at a specific
    // partial weight (e.g. 0.5) rather than only ever snapping to 0 or 1.
    // Both default to "off"/`null`; `/v2/play` never reads this store.
    const ikWeightMultiplier = ikTuner.ikWeight ?? (ikTuner.ikDisabled ? 0 : 1);

    // Step 6H: hand-basis-adjust and finger-curl-scale now ALSO fall back
    // to the SHIPPED (possibly non-zero/non-default) config value rather
    // than a hardcoded no-op — same "untouched = current best calibration"
    // convention Step 6G established for `shoulderAssistLocal` below, now
    // extended to every field the 2026-07-23 approved session tuned. A
    // tuner session always starts from the last approved pose, never from
    // scratch.
    const rightTuning = rightTuningRef.current;
    const rightBasisDeg = ikTuner.rightHandBasisAdjustDeg ?? FIRST_PERSON_ARM_IK_CONFIG.rightHandBasisAdjustDeg;
    rightTuning.handBasisAdjustQuat!.setFromEuler(
      basisEulerScratchRef.current.set(THREE.MathUtils.degToRad(rightBasisDeg[0]), THREE.MathUtils.degToRad(rightBasisDeg[1]), THREE.MathUtils.degToRad(rightBasisDeg[2]), 'XYZ'),
    );
    rightTuning.rotationWeight = ikTuner.rightWristRotationWeight ?? undefined;
    rightTuning.fingerCurlScale = ikTuner.rightFingerCurlScale ?? FIRST_PERSON_ARM_IK_CONFIG.rightFingerCurlScale;
    const rightAssist = ikTuner.rightShoulderAssistLocal ?? FIRST_PERSON_ARM_IK_CONFIG.rightShoulderAssistLocal;
    rightTuning.shoulderAssistLocal!.set(rightAssist[0], rightAssist[1], rightAssist[2]);

    const leftTuning = leftTuningRef.current;
    const leftBasisDeg = ikTuner.leftHandBasisAdjustDeg ?? FIRST_PERSON_ARM_IK_CONFIG.leftHandBasisAdjustDeg;
    leftTuning.handBasisAdjustQuat!.setFromEuler(
      basisEulerScratchRef.current.set(THREE.MathUtils.degToRad(leftBasisDeg[0]), THREE.MathUtils.degToRad(leftBasisDeg[1]), THREE.MathUtils.degToRad(leftBasisDeg[2]), 'XYZ'),
    );
    leftTuning.rotationWeight = ikTuner.leftWristRotationWeight ?? undefined;
    leftTuning.fingerCurlScale = ikTuner.leftFingerCurlScale ?? FIRST_PERSON_ARM_IK_CONFIG.leftFingerCurlScale;
    const leftAssist = ikTuner.leftShoulderAssistLocal ?? FIRST_PERSON_ARM_IK_CONFIG.leftShoulderAssistLocal;
    leftTuning.shoulderAssistLocal!.set(leftAssist[0], leftAssist[1], leftAssist[2]);

    const rightOk = solveSide(
      runtime.right,
      container,
      containerWorldQuat,
      pose.rightPosition,
      pose.rightQuaternion,
      ikTuner.rightElbowPoleLocal ?? FIRST_PERSON_ARM_IK_CONFIG.rightElbowPoleLocal,
      smoothState.right.right * ikWeightMultiplier,
      RIGHT_HAND_FINGER_POSE,
      kaelArmDebugState.right,
      rightTuning,
    );
    const leftOk = solveSide(
      runtime.left,
      container,
      containerWorldQuat,
      pose.leftPosition,
      pose.leftQuaternion,
      ikTuner.leftElbowPoleLocal ?? FIRST_PERSON_ARM_IK_CONFIG.leftElbowPoleLocal,
      smoothState.left.left * ikWeightMultiplier,
      LEFT_HAND_FINGER_POSE,
      kaelArmDebugState.left,
      leftTuning,
    );
    // Step 16 stop condition: never render a partially/wholly non-finite
    // pose — hide the whole rig for this frame rather than show one good
    // arm next to a NaN-propagated one, and keep the debug overlay in sync.
    const bothOk = rightOk && leftOk;
    container.visible = bothOk;
    kaelArmDebugState.ready = bothOk;
    // Step 6E staleness fix, defense-in-depth: `solveSide` writes bone
    // local quaternions directly (not via the scene graph), so — same as
    // the two diagnostic branches above — any SEPARATE `useFrame` reading
    // `matrixWorld` this same tick (the debug bounding-box helper) would
    // otherwise see last frame's pose. The actual GPU draw is unaffected
    // either way (the renderer's own scene-wide matrix update runs after
    // ALL `useFrame` callbacks, right before rasterizing), so this was
    // never a visible-arms bug — only a debug-overlay one.
    container.updateWorldMatrix(true, true);

    if (isDev && bothOk && !loggedIkValidRef.current) {
      loggedIkValidRef.current = true;
      console.info(
        '[kael-fp-arms] IK solving successfully, container now visible.',
        `right hand world=[${kaelArmDebugState.right.handWorldPos.toArray().map((v) => v.toFixed(3)).join(',')}]`,
        `left hand world=[${kaelArmDebugState.left.handWorldPos.toArray().map((v) => v.toFixed(3)).join(',')}]`,
        `grip target right=[${pose.rightPosition.toArray().map((v) => v.toFixed(3)).join(',')}]`,
      );
    }
  });

  if (!instance || !runtime) return null;

  return (
    <group ref={containerRef} name="kael_fp_arms_root">
      <primitive object={instance} />
    </group>
  );
}
