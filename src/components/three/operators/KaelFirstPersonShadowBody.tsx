'use client';

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useLoadedPipelineAsset, useResolveModelSlot } from '@/lib/v2/pipeline';
import { operatorModelSlot } from '@/lib/v2/operators';
import { getFirstPersonBodyWorldPose } from '@/lib/v2/operators/firstPersonBodyPose';
import { computeLowerBodyWorldTransform, type LowerBodyTransformOutput } from '@/lib/v2/operators/lowerBodyTransform';
import { SHADOW_BODY_PHYSICAL_LOCAL_OFFSET } from '@/lib/v2/operators/shadowBodyTransform';
import {
  applyLowerBodyLocomotionPose,
  buildLowerBodyRigRuntime,
  createLowerBodyRigScratch,
  MissingLowerBodyBoneError,
  resolveLowerBodyBones,
  restoreLowerBodyRestPose,
  type LowerBodyRigRuntime,
} from '@/lib/v2/operators/lowerBodyRig';
import { getSharedLowerBodyLocomotionPose } from '@/lib/v2/operators/lowerBodyLocomotionPoseBridge';
import { useShadowDebugStore } from '@/lib/v2/operators/shadowDebugStore';
import { shadowBodyDebugReadout } from '@/lib/v2/operators/shadowBodyDebugReadout';
import {
  applyChestAimFrame,
  buildShadowArmRuntime,
  buildShadowSpineChainRuntime,
  createChestAimScratch,
  measureShoulderRestWorldPosition,
  MissingCriticalBoneError,
  resolveKaelArmBones,
  resolveShadowSpineBones,
  restoreChestAimFrame,
  restoreRestPose,
  solveShadowArmSide,
  type ChestAimScratch,
  type ResolvedArmBones,
  type SideRuntimeState,
  type SpineChainRuntime,
} from '@/lib/v2/operators/shadowUpperBodyRig';
import { computeChestAimPitch, convertRangeLocalPitchToAimPitch, smoothTowards } from '@/lib/v2/operators/shadowAimFrame';
import { rangeLocalPose } from '@/lib/v2/range/localPose';
import { SHADOW_ARM_IK_CONFIG } from '@/lib/v2/operators/shadowArmIkConfig';
import { useShadowArmTunerStore } from '@/lib/v2/operators/shadowArmTunerStore';
import { shadowArmDebugState } from '@/lib/v2/operators/shadowArmDebugState';
import {
  computeShadowRecoilKickMultiplier,
  resolveDesiredShadowWeaponPose,
  SHADOW_RECOIL_KICK,
  WEAPON_CHEST_ALIGN_QUAT,
} from '@/lib/v2/operators/shadowWeaponPresentationPose';
import { fireSignal } from '@/lib/v2/range/effectsBus';
import { publishShadowWeaponWorldPose, invalidateShadowWeaponWorldPose } from '@/lib/v2/operators/shadowWeaponWorldPose';
import { getGripWorldPose } from '@/lib/v2/weapons/gripWorldPose';
import { actionPoseState } from '@/lib/v2/weapons/actionPoseState';
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';
import { VORTEX_RUNTIME_ANCHORS, type RuntimeGripAnchor } from '@/lib/v2/weapons/vortexRuntimeAnchors';
import { RELOAD_LEFT_HAND_LOCAL, INSPECT_LEFT_HAND_LOCAL } from '@/lib/v2/weapons/actionTargets';
import { resolveRuntimeAnchorWorldPose } from '@/lib/v2/weapons/runtimeAnchorMath';
import { VORTEX_VIEWMODEL_POSES } from '@/lib/v2/weapons/vortexViewmodelPose';
import { warnOnce } from '@/lib/v2/operators/kaelArmSolve';
import { applyOperatorRenderMode } from './renderModes';

/** Picks the correct left-hand action-target anchor from `actionPoseState.actionPhase` — the phase name's own prefix already distinguishes reload from inspect sub-phases (`ActionPhaseName`), so no second `kind`/`progress` bridge field is needed to make this call. */
function pickLeftActionAnchor(phase: string): RuntimeGripAnchor {
  if (phase.startsWith('reload')) return RELOAD_LEFT_HAND_LOCAL;
  if (phase.startsWith('inspect')) return INSPECT_LEFT_HAND_LOCAL;
  return VORTEX_RUNTIME_ANCHORS.gripSupportLocal;
}

/**
 * Kael first-person SHADOW prototype (Milestone 8, Steps 8E-B + 8E-C) —
 * DEVELOPMENT-ONLY, `/v2/range?shadow=1` exclusively (see `RangeScene.tsx`'s
 * mount site and `useShadowDebugEnabled.ts`). Never mounted on `/v2/play`,
 * never mounted in production, never mounted on plain `/v2/range` with no
 * flag.
 *
 * ================================================================
 * STILL A DEV-ONLY PROTOTYPE. NOT YET APPROVED FOR PLAYER-FACING USE.
 * ================================================================
 * Step 8E-B (2026-07-28) proved the leg-synchronisation architecture and
 * mounted the full-body clone with legs driven by the shared locomotion
 * pose; arms/spine stayed in the source's static "relaxed-A-pose" bind pose
 * for that entire step. Step 8E-C (this pass) adds world-space two-bone IK
 * for both arms (`shadowUpperBodyRig.ts`'s `solveShadowArmSide`, reusing
 * the same generic `resolveKaelArmBones`/`measureArmRestMetrics`/
 * `solveTwoBoneIk` machinery the visible arms-only rig uses, but with its
 * OWN config/debug-state — see that module's doc comment for why no
 * calibration value is ever copied between the two rigs) plus a restrained
 * spine/chest lean, solved toward the EXACT SAME `gripWorldPose`/
 * `actionPoseState` targets the visible arms already read — never a second
 * grip-target or action-pose computation. This is still NOT a claim of
 * visual correctness: the hand-basis/elbow-pole/shoulder-assist values are
 * first-pass estimates pending real-browser calibration (this step's own
 * Sections 11–12), and no human visual approval has been requested yet —
 * see the debug panel's own on-screen status.
 *
 * STEP 8E-C.2: the arms no longer solve toward `gripWorldPose`'s
 * camera-relative right/left targets directly. The human reviewer's own
 * diagnosis: "the first-person viewmodel weapon pose is intentionally
 * camera-friendly, not necessarily reachable by a physically proportioned
 * world-space character... requires that huge shoulder assist." This pass
 * computes a SEPARATE, chest-anchored shadow weapon transform
 * (`shadowWeaponPresentationPose.ts`) — reachable by construction, since
 * it's a small offset from the same chest bone the arms already solve
 * relative to — and resolves the right/left grip and reload/inspect action
 * targets against THAT transform via the existing, reusable
 * `resolveRuntimeAnchorWorldPose` (the SAME weapon-local anchors
 * `VortexViewmodel.tsx`'s visible weapon uses, never re-measured). The
 * chest-lean curve itself changed from Step 8E-C.1's reach-driven inverse
 * shape to a genuine monotonic follow of aim pitch — see
 * `shadowArmIkConfig.ts`'s `chestAimFollowFraction` doc comment.
 *
 * WHAT THIS PROTOTYPE PROVES: the full-body skeleton shares the visible
 * lower-body derivative's exact bone names (`lowerBodyRig.ts`'s
 * `resolveLowerBodyBones` works against it unmodified), a world-anchored
 * (never camera-attached) placement using ONLY the derived capsule-to-feet
 * offset (`shadowBodyTransform.ts` — NOT the visible body's silhouette
 * offset, which exists for a first-person-viewing-angle reason that does
 * not apply to an externally-projected shadow), the existing reversible
 * `shadowOnly` render mode (`renderModes.ts`), that the legs can be driven
 * by the EXACT SAME locomotion result the visible body computes with no
 * second, independently-advancing pose computation anywhere (see
 * `lowerBodyLocomotionPoseBridge.ts`), and — new this step — that the same
 * "one shared source, world-space re-solve" pattern extends cleanly to the
 * arms and a separate shadow-only weapon (`KaelFirstPersonShadowWeapon.tsx`)
 * without inventing any new gameplay-state computation.
 *
 * AUTHORITATIVE SHADOW OWNERSHIP (Step 8E-C, per this step's own brief
 * Section 9 — supersedes Step 8E-B's own "temporary, session-only" framing,
 * which this codebase's Step 8E-B commit had actually left unimplemented;
 * see `docs/decisions.md`'s Step 8E-C entry for that correction): while
 * `useShadowDebugEnabled()` is true, the visible FP-arms' `castShadow` is
 * unconditionally disabled (`KaelFirstPersonArms.tsx`) and this component's
 * full body + `KaelFirstPersonShadowWeapon.tsx`'s weapon clone become the
 * sole casters for their respective regions. The instant the flag is off,
 * FP-arms cast exactly as before and no shadow-body/shadow-weapon caster
 * exists at all. Still NOT a claim that this shadow is visually correct —
 * ownership moving to the shadow rig is a lifecycle/engineering milestone,
 * independent of whether the solved pose looks right yet.
 */

function KaelShadowBodyInner() {
  const { url, lod, resolving } = useResolveModelSlot(operatorModelSlot('kael'), { requestedLod: 1 });
  if (resolving || !url || lod === null) return null;
  return (
    <Suspense fallback={null}>
      <LoadedKaelShadowBody url={url} lod={lod} />
    </Suspense>
  );
}

/** Same fail-safe convention as `KaelFirstPersonLowerBody.tsx`'s error boundary — a dev-only prototype must never be able to crash the whole `/v2/range` canvas. */
class KaelShadowBodyErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(`[kael-fp-shadowbody] dev prototype failed to load — omitting. ${String(error)}`);
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function KaelFirstPersonShadowBody() {
  return (
    <KaelShadowBodyErrorBoundary>
      <KaelShadowBodyInner />
    </KaelShadowBodyErrorBoundary>
  );
}

function LoadedKaelShadowBody({ url, lod }: { url: string; lod: 0 | 1 | 2 }) {
  const result = useLoadedPipelineAsset(operatorModelSlot('kael'), url, lod);
  const containerRef = useRef<THREE.Group>(null);

  const offsetScratch = useRef(new THREE.Vector3());
  const transformOut = useRef<LowerBodyTransformOutput>({ position: new THREE.Vector3(), yaw: 0 });
  const rigRuntimeRef = useRef<LowerBodyRigRuntime | null>(null);
  const rigScratchRef = useRef(createLowerBodyRigScratch());
  const diagnosticActiveRef = useRef(false);

  // Step 8E-C — arm rest metrics, resolved once per mount alongside the
  // Step 8E-B leg rig above. STEP 8E-C.1: `armRuntimeRef` is now measured
  // relative to the CHEST BONE (not the root container) — see
  // `buildShadowArmRuntime`'s own doc comment for why this changed.
  const armRuntimeRef = useRef<{ left: SideRuntimeState; right: SideRuntimeState } | null>(null);
  const armBonesRef = useRef<ResolvedArmBones | null>(null);
  // Step 8E-C.1 — the cascading Spine/Spine1/Spine2 chest-aim chain,
  // replacing Step 8E-C's single-bone spine assist.
  const spineChainRef = useRef<SpineChainRuntime | null>(null);
  const chestAimScratchRef = useRef<ChestAimScratch>(createChestAimScratch());
  const smoothedAimPitchRef = useRef(0);
  const chestWorldQuatRef = useRef(new THREE.Quaternion());
  const chestWorldQuatInverseRef = useRef(new THREE.Quaternion());
  const containerWorldQuatRef = useRef(new THREE.Quaternion());
  // Step 8E-C.1 — per-side DYNAMIC shoulder-assist state (replaces the old
  // fixed-constant tuning). `smoothedAssistMagRef` persists the frame-rate-
  // independently-smoothed assist magnitude across frames per side.
  const rightTuningRef = useRef({ handBasisAdjustQuat: new THREE.Quaternion(), shoulderAssistLocal: new THREE.Vector3(), rotationWeight: undefined as number | undefined });
  const leftTuningRef = useRef({ handBasisAdjustQuat: new THREE.Quaternion(), shoulderAssistLocal: new THREE.Vector3(), rotationWeight: undefined as number | undefined });
  const smoothedAssistMagRef = useRef({ right: 0, left: 0 });
  const assistDirWorldScratchRef = useRef(new THREE.Vector3());
  const assistWorldScratchRef = useRef(new THREE.Vector3());
  const basisEulerScratchRef = useRef(new THREE.Euler());
  const blendedLeftTargetPosRef = useRef(new THREE.Vector3());
  const blendedLeftTargetQuatRef = useRef(new THREE.Quaternion());

  // Step 8E-C.2 — chest-anchored shadow weapon presentation state. Replaces
  // solving arms toward `gripWorldPose`'s camera-relative right/left targets
  // directly; see `shadowWeaponPresentationPose.ts`'s doc comment for why.
  const smoothedAdsBlendRef = useRef(0);
  const weaponLocalOffsetScratchRef = useRef(new THREE.Vector3());
  const weaponExtraEulerScratchRef = useRef(new THREE.Euler());
  const weaponExtraQuatScratchRef = useRef(new THREE.Quaternion());
  const weaponWorldPosScratchRef = useRef(new THREE.Vector3());
  const weaponWorldQuatScratchRef = useRef(new THREE.Quaternion());
  const chestWorldPosScratchRef = useRef(new THREE.Vector3());
  const rightGripResolvedRef = useRef({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() });
  const leftGripResolvedRef = useRef({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() });
  const leftActionResolvedRef = useRef({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() });
  const anchorResolveScratchRef = useRef({ matrix: new THREE.Matrix4(), quat: new THREE.Quaternion(), euler: new THREE.Euler(), pos: new THREE.Vector3(), localQuat: new THREE.Quaternion() });

  // Step 8E-C.3 — per-action weapon presentation state. `smoothedSprintBlendRef`
  // mirrors `smoothedAdsBlendRef`'s own smoothing convention. `smoothedWeaponPoseRef`
  // holds the CURRENT smoothed local pose (6 components — position xyz +
  // rotation-offset-degrees xyz), continuously eased each frame toward
  // whatever `resolveDesiredShadowWeaponPose` returns, replacing the old
  // direct (unsmoothed-transition) hip/ads lerp. `lastSeenFireNonceRef`/
  // `timeSinceShotRef` drive the decaying recoil kick, edge-triggered off
  // `fireSignal.nonce` — never touching `VortexFireSystem.tsx`'s own real
  // recoil (`viewKick`) at all.
  const smoothedSprintBlendRef = useRef(0);
  const smoothedWeaponPoseRef = useRef({ posX: 0, posY: -0.05, posZ: -0.28, rotX: 0, rotY: 0, rotZ: 0 });
  const lastSeenFireNonceRef = useRef(fireSignal.nonce);
  const timeSinceShotRef = useRef(Infinity);

  // One SkeletonUtils clone per mount — same reasoning as
  // KaelFirstPersonLowerBody.tsx/KaelFirstPersonArms.tsx: useGLTF caches one
  // scene per URL. `applyOperatorRenderMode(..., 'shadowOnly')` is called
  // ONCE here, right after cloning — reversible (renderModes.ts's own
  // WeakMap-of-originals contract), never mutates the cached source scene,
  // never touches geometry/materials beyond swapping to the one shared
  // `SHADOW_ONLY_MATERIAL` instance (no new material created, no texture
  // dependency, no color output).
  const instance = useMemo(() => {
    if (!result.scene) return null;
    const cloned = cloneSkeleton(result.scene);
    applyOperatorRenderMode(cloned, 'shadowOnly');
    if (process.env.NODE_ENV !== 'production') {
      let meshCount = 0;
      let jointCount = 0;
      let castShadowMeshCount = 0;
      cloned.traverse((node) => {
        if ((node as THREE.Bone).isBone) jointCount += 1;
        if (node instanceof THREE.Mesh) {
          meshCount += 1;
          // Same reasoning as the visible lower body / FP arms: bind-pose
          // bounding sphere never updates from procedural bone posing, so
          // frustum culling against a stale bound risks popping the whole
          // shadow caster out of view while it's actually on-screen.
          node.frustumCulled = false;
          if (node.castShadow) castShadowMeshCount += 1;
        }
      });
      shadowBodyDebugReadout.meshCount = meshCount;
      shadowBodyDebugReadout.jointCount = jointCount;
      shadowBodyDebugReadout.castShadowMeshCount = castShadowMeshCount;
      console.info(
        `[kael-fp-shadowbody] DEV PROTOTYPE loaded: url=${url} lod=${lod} meshes=${meshCount} joints=${jointCount} castShadowMeshes=${castShadowMeshCount} — arms/spine now IK-solved (Step 8E-C)`,
      );
    }
    return cloned;
  }, [result.scene, url, lod]);

  // Resolve the SAME 7 leg/pelvis bones the visible lower body uses —
  // `resolveLowerBodyBones` works unmodified here because this skeleton
  // shares the exact `mixamorig:` bone names (verified in the Step 8E-A
  // audit: identical 65-joint skeleton across all three Kael assets). A
  // resolution failure degrades to "shadow renders, legs stay at rest"
  // rather than hiding the whole prototype — same graceful-degrade contract
  // as the visible body's own effect.
  useEffect(() => {
    rigRuntimeRef.current = null;
    if (process.env.NODE_ENV !== 'production') shadowBodyDebugReadout.boneResolutionFailed = false;
    if (!instance || !containerRef.current) return;
    try {
      const bones = resolveLowerBodyBones(instance);
      rigRuntimeRef.current = buildLowerBodyRigRuntime(containerRef.current, bones);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        shadowBodyDebugReadout.boneResolutionFailed = true;
        const detail = error instanceof MissingLowerBodyBoneError ? error.message : String(error);
        console.warn(`[kael-fp-shadowbody] leg-bone resolution failed — legs will stay in relaxed-A-pose rest, same as the arms. ${detail}`);
      }
    }
    return () => {
      rigRuntimeRef.current = null;
    };
  }, [instance]);

  // Step 8E-C/8E-C.1 — resolve the spine chain FIRST (needed as the arm
  // rig's own reference frame — see `buildShadowArmRuntime`'s doc comment),
  // then arms measured relative to the resolved chest bone. A missing
  // upper-arm/lower-arm/hand bone omits arm IK for this prototype (arms
  // stay at rest, same graceful-degrade contract as the legs) — never
  // crashes. A missing spine chain falls back to the ROOT CONTAINER as the
  // arm reference frame (no chest-aim follow, but arms still solve) rather
  // than omitting arms entirely — a coarser, but still functional, degrade.
  useEffect(() => {
    armRuntimeRef.current = null;
    armBonesRef.current = null;
    spineChainRef.current = null;
    if (process.env.NODE_ENV !== 'production') shadowArmDebugState.boneResolutionFailed = false;
    if (!instance || !containerRef.current) return;

    let chestReferenceFrame: THREE.Object3D = containerRef.current;
    try {
      const spineBones = resolveShadowSpineBones(instance);
      const chain = buildShadowSpineChainRuntime(spineBones);
      spineChainRef.current = chain;
      if (chain) chestReferenceFrame = chain.chestBone;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.warn(`[kael-fp-shadowbody] spine-chain resolution failed — chest-aim follow omitted, arms solve from the root container instead. ${String(error)}`);
    }

    try {
      const bones = resolveKaelArmBones(instance);
      armBonesRef.current = bones;
      armRuntimeRef.current = buildShadowArmRuntime(chestReferenceFrame, bones);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        shadowArmDebugState.boneResolutionFailed = true;
        const detail = error instanceof MissingCriticalBoneError ? error.message : String(error);
        console.warn(`[kael-fp-shadowbody] arm-bone resolution failed — arms will stay in relaxed-A-pose rest. ${detail}`);
      }
    }

    smoothedAimPitchRef.current = 0;
    smoothedAssistMagRef.current.right = 0;
    smoothedAssistMagRef.current.left = 0;
    smoothedAdsBlendRef.current = 0;
    smoothedSprintBlendRef.current = 0;
    smoothedWeaponPoseRef.current = { posX: 0, posY: -0.05, posZ: -0.28, rotX: 0, rotY: 0, rotZ: 0 };
    lastSeenFireNonceRef.current = fireSignal.nonce;
    timeSinceShotRef.current = Infinity;

    return () => {
      armRuntimeRef.current = null;
      armBonesRef.current = null;
      spineChainRef.current = null;
      invalidateShadowWeaponWorldPose();
    };
  }, [instance]);

  useEffect(() => {
    shadowBodyDebugReadout.ready = !!instance;
    return () => {
      shadowBodyDebugReadout.ready = false;
    };
  }, [instance]);

  useFrame((_, delta) => {
    const container = containerRef.current;
    if (!container || !instance) return;

    const pose = getFirstPersonBodyWorldPose();
    container.visible = pose.ready;
    if (!pose.ready) return;

    // Diagnostic visible-material toggle — engineering inspection only.
    // This whole tree is already dev-gated (`?shadow=1`), so no separate
    // production guard is needed here beyond that.
    const diagnostic = useShadowDebugStore.getState().diagnosticVisibleMaterial;
    if (diagnostic !== diagnosticActiveRef.current) {
      diagnosticActiveRef.current = diagnostic;
      applyOperatorRenderMode(instance, diagnostic ? 'full' : 'shadowOnly');
    }

    // PHYSICAL root transform — world position + yaw ONLY, via the derived
    // capsule-to-feet offset alone (see shadowBodyTransform.ts's doc
    // comment for why the visible body's silhouette offset must NOT be
    // reused here). No debug-panel position/yaw offset stacking either —
    // this is a fixed, physically-derived placement, not a tunable.
    computeLowerBodyWorldTransform(pose.worldPosition, pose.worldYaw, SHADOW_BODY_PHYSICAL_LOCAL_OFFSET, 0, offsetScratch.current, transformOut.current);
    container.position.copy(transformOut.current.position);
    container.rotation.set(0, transformOut.current.yaw, 0);

    // Legs ONLY — read-only consumer of the ONE shared locomotion result;
    // never computes its own pose (see lowerBodyLocomotionPoseBridge.ts's
    // doc comment — this is the load-bearing architectural rule this whole
    // pass exists to prove). Spine/arms are never touched here and stay at
    // whatever the fresh clone's own authored rest pose is (Step 8E-C's job).
    const rig = rigRuntimeRef.current;
    if (rig) {
      const shared = getSharedLowerBodyLocomotionPose();
      if (shared.ready && shared.pose) {
        applyLowerBodyLocomotionPose(rig, container, shared.pose, rigScratchRef.current);
      } else {
        restoreLowerBodyRestPose(rig);
      }
    }

    shadowBodyDebugReadout.rootWorldPosition[0] = container.position.x;
    shadowBodyDebugReadout.rootWorldPosition[1] = container.position.y;
    shadowBodyDebugReadout.rootWorldPosition[2] = container.position.z;
    shadowBodyDebugReadout.effectiveYaw = transformOut.current.yaw;

    // -----------------------------------------------------------------
    // Step 8E-C/8E-C.1/8E-C.2 — chest-aim frame, then arms. PURE READER of
    // the SAME `gripWorldPose`/`actionPoseState` bridges the visible arms
    // rig already reads (see `KaelFirstPersonArms.tsx`) for grip/action
    // targets — no second grip-target computation, no second action-pose
    // computation. The AIM-PITCH SOURCE changed in Step 8E-C.2: Steps
    // 8E-C/8E-C.1 extracted it from `gripPose.weaponWorldQuaternion`, which
    // measurably does NOT track camera pitch linearly (verified:
    // `.scratch/verify-aimpitch-math.mjs` — the weapon's own presentation-
    // pose rotation, composed on top of the camera quaternion, suppressed a
    // 30°/60°/88.9° camera pitch down to ~2.4°/4.3°/5.1°, the EXACT numbers
    // the human reviewer flagged as not proving the chest follows real look
    // direction). This pass reads `rangeLocalPose.pitch` instead — see
    // `shadowAimFrame.ts`'s `extractAimPitchFromWeaponQuaternion` doc
    // comment for the full finding. This is still not "a second,
    // independently-computed camera pitch": `rangeLocalPose` is the SAME
    // general-purpose, already-published-every-frame bridge
    // `RangeController.tsx` sets `camera.rotation.x` from, already read by
    // other non-debug systems (`VortexFireSystem.tsx`).
    // -----------------------------------------------------------------
    const armRuntime = armRuntimeRef.current;
    const tuner = useShadowArmTunerStore.getState();
    const gripPose = getGripWorldPose();
    const armsReady = tuner.armIkEnabled && gripPose.ready && !!armRuntime;
    shadowArmDebugState.ready = armsReady;

    if (armsReady && armRuntime) {
      container.getWorldQuaternion(containerWorldQuatRef.current);
      const containerWorldQuat = containerWorldQuatRef.current;

      // --- Chest-aim frame — applied BEFORE the arm solve, so the arms
      // read the shoulders' NEW, post-lean world positions, never a stale
      // pre-aim-pitch frame. STEP 8E-C.2: the response curve is now a
      // genuine MONOTONIC follow of aim pitch (more lean as the player
      // looks further down/up, capped) rather than Step 8E-C.1's
      // reach-driven inverse curve — see `shadowArmIkConfig.ts`'s
      // `chestAimFollowFraction` doc comment for why. Reach is no longer
      // this curve's job at all now that the shadow weapon is chest-
      // anchored below.
      const spineChain = spineChainRef.current;
      const rawAimPitch = convertRangeLocalPitchToAimPitch(rangeLocalPose.pitch);
      smoothedAimPitchRef.current = smoothTowards(smoothedAimPitchRef.current, rawAimPitch, SHADOW_ARM_IK_CONFIG.chestAimSmoothingRate, delta);
      const chestFollowFraction = tuner.chestAimFollowFraction ?? SHADOW_ARM_IK_CONFIG.chestAimFollowFraction;
      const chestMaxPitch = tuner.chestAimMaxPitchRad ?? SHADOW_ARM_IK_CONFIG.chestAimMaxPitchRad;
      const appliedChestPitch = computeChestAimPitch(smoothedAimPitchRef.current, chestFollowFraction, chestMaxPitch);

      let chestWorldQuat = containerWorldQuat;
      if (spineChain) {
        applyChestAimFrame(spineChain, containerWorldQuat, appliedChestPitch, chestAimScratchRef.current);
        container.updateWorldMatrix(true, true);
        spineChain.chestBone.getWorldQuaternion(chestWorldQuatRef.current);
        chestWorldQuat = chestWorldQuatRef.current;
        shadowArmDebugState.chest = {
          boneResolved: true,
          boneCount: spineChain.bones.length,
          aimPitchRawRad: rawAimPitch,
          aimPitchSmoothedRad: smoothedAimPitchRef.current,
          appliedChestPitchRad: appliedChestPitch,
        };
      } else {
        shadowArmDebugState.chest = { boneResolved: false, boneCount: 0, aimPitchRawRad: rawAimPitch, aimPitchSmoothedRad: smoothedAimPitchRef.current, appliedChestPitchRad: 0 };
      }
      const armReferenceFrame: THREE.Object3D = spineChain ? spineChain.chestBone : container;
      chestWorldQuatInverseRef.current.copy(chestWorldQuat).invert();

      // -----------------------------------------------------------------
      // Step 8E-C.2 — CHEST-ANCHORED shadow weapon presentation, replacing
      // the direct solve toward `gripPose`'s camera-relative right/left
      // targets. Position is a small, fixed offset from the chest bone's
      // own live world transform (reachable by construction); orientation
      // rides the chest's own (already-restrained) aim-pitch lean, never
      // the raw camera quaternion. See `shadowWeaponPresentationPose.ts`'s
      // doc comment for the full reasoning.
      // -----------------------------------------------------------------
      armReferenceFrame.getWorldPosition(chestWorldPosScratchRef.current);

      // ADS blend: a LOCAL smoothing pass over the SAME underlying
      // `useVortexWeaponStore().ads` boolean `VortexViewmodel.tsx` reads —
      // not a new gameplay state, the identical target/rate formula that
      // file already uses for its own (unpublished) `state.adsBlend`, so
      // the shadow's weapon-offset blend tracks ADS on the same timing.
      const weaponStore = useVortexWeaponStore.getState();
      const adsTarget = weaponStore.ads && weaponStore.reloadingUntil === 0 ? 1 : 0;
      smoothedAdsBlendRef.current = smoothTowards(smoothedAdsBlendRef.current, adsTarget, 10, delta);
      const adsBlend = smoothedAdsBlendRef.current;
      shadowArmDebugState.adsBlend = adsBlend;

      // Step 8E-C.3 — sprint blend, same smoothing convention as ADS above,
      // reading the SAME `rangeLocalPose.state` the real weapon-state
      // resolver (`VortexFireSystem.tsx`'s `sprinting: rangeLocalPose.state
      // === 'sprint'`) already reads — not a new movement-state computation.
      const sprintTarget = rangeLocalPose.state === 'sprint' ? 1 : 0;
      smoothedSprintBlendRef.current = smoothTowards(smoothedSprintBlendRef.current, sprintTarget, 10, delta);

      // Desired pose this frame: an active reload/inspect sub-phase (from
      // `actionPoseState.actionPhase`, already read below for the left-hand
      // target blend — read here too, no second computation) takes priority
      // over the ADS/sprint-blended base, matching the real weapon's own
      // `resolveWeaponState` priority order (reload/inspect outrank
      // ads/sprint). The result is then eased INTO smoothly (never snapped)
      // via per-component `smoothTowards`, so every phase transition —
      // including the reload/inspect phase boundaries — reads as continuous
      // motion, not a discontinuity.
      const desiredWeaponPose = resolveDesiredShadowWeaponPose(actionPoseState.ready ? actionPoseState.actionPhase : 'idle', adsBlend, smoothedSprintBlendRef.current);
      const smoothedPose = smoothedWeaponPoseRef.current;
      const poseSmoothingRate = 9;
      smoothedPose.posX = smoothTowards(smoothedPose.posX, desiredWeaponPose.positionLocal[0], poseSmoothingRate, delta);
      smoothedPose.posY = smoothTowards(smoothedPose.posY, desiredWeaponPose.positionLocal[1], poseSmoothingRate, delta);
      smoothedPose.posZ = smoothTowards(smoothedPose.posZ, desiredWeaponPose.positionLocal[2], poseSmoothingRate, delta);
      smoothedPose.rotX = smoothTowards(smoothedPose.rotX, desiredWeaponPose.rotationEulerOffsetDeg[0], poseSmoothingRate, delta);
      smoothedPose.rotY = smoothTowards(smoothedPose.rotY, desiredWeaponPose.rotationEulerOffsetDeg[1], poseSmoothingRate, delta);
      smoothedPose.rotZ = smoothTowards(smoothedPose.rotZ, desiredWeaponPose.rotationEulerOffsetDeg[2], poseSmoothingRate, delta);

      // Recoil — a small, decaying, purely cosmetic kick layered ADDITIVELY
      // on top of the smoothed base pose, edge-triggered off
      // `fireSignal.nonce` (the SAME per-shot signal `VortexViewmodel.tsx`
      // already reads for its own punch effect) rather than anything from
      // `VortexFireSystem.tsx`'s real recoil (`viewKick`) — this never
      // touches actual gameplay recoil.
      if (fireSignal.nonce !== lastSeenFireNonceRef.current) {
        lastSeenFireNonceRef.current = fireSignal.nonce;
        timeSinceShotRef.current = 0;
      } else if (Number.isFinite(timeSinceShotRef.current)) {
        timeSinceShotRef.current += delta;
      }
      const recoilMul = computeShadowRecoilKickMultiplier(timeSinceShotRef.current);

      const weaponLocalOffset = weaponLocalOffsetScratchRef.current.set(
        smoothedPose.posX + SHADOW_RECOIL_KICK.peakPositionLocal[0] * recoilMul,
        smoothedPose.posY + SHADOW_RECOIL_KICK.peakPositionLocal[1] * recoilMul,
        smoothedPose.posZ + SHADOW_RECOIL_KICK.peakPositionLocal[2] * recoilMul,
      );
      const weaponExtraEuler = weaponExtraEulerScratchRef.current.set(
        THREE.MathUtils.degToRad(smoothedPose.rotX + SHADOW_RECOIL_KICK.peakRotationEulerDeg[0] * recoilMul),
        THREE.MathUtils.degToRad(smoothedPose.rotY + SHADOW_RECOIL_KICK.peakRotationEulerDeg[1] * recoilMul),
        THREE.MathUtils.degToRad(smoothedPose.rotZ + SHADOW_RECOIL_KICK.peakRotationEulerDeg[2] * recoilMul),
        'XYZ',
      );
      const weaponExtraQuat = weaponExtraQuatScratchRef.current.setFromEuler(weaponExtraEuler);

      const weaponWorldPos = weaponWorldPosScratchRef.current
        .copy(weaponLocalOffset)
        .applyQuaternion(chestWorldQuat)
        .add(chestWorldPosScratchRef.current);
      const weaponWorldQuat = weaponWorldQuatScratchRef.current.copy(chestWorldQuat).multiply(WEAPON_CHEST_ALIGN_QUAT).multiply(weaponExtraQuat);

      publishShadowWeaponWorldPose(weaponWorldPos, weaponWorldQuat);

      // Resolve the right/left grip anchors (and the reload/inspect action
      // target) against THIS new transform via the exact same reusable
      // function `VortexViewmodel.tsx` uses for the visible weapon — the
      // weapon-local anchors themselves (`VORTEX_RUNTIME_ANCHORS`,
      // `RELOAD_LEFT_HAND_LOCAL`, `INSPECT_LEFT_HAND_LOCAL`) are never
      // re-measured or duplicated, only re-resolved against a different
      // (body-anchored, not camera-anchored) weapon world transform.
      const poseScale = VORTEX_VIEWMODEL_POSES.hip.scale; // hip/ads share this scale — confirmed identical.
      const anchorScratch = anchorResolveScratchRef.current;
      resolveRuntimeAnchorWorldPose(VORTEX_RUNTIME_ANCHORS.gripHandLocal, poseScale, weaponWorldPos, weaponWorldQuat, rightGripResolvedRef.current, anchorScratch);
      resolveRuntimeAnchorWorldPose(VORTEX_RUNTIME_ANCHORS.gripSupportLocal, poseScale, weaponWorldPos, weaponWorldQuat, leftGripResolvedRef.current, anchorScratch);

      // Left-hand target: blend toward the reload/inspect action target
      // exactly like `KaelFirstPersonArms.tsx` does — same source
      // (`actionPoseState`), same blend weight, so the shadow's left hand
      // performs the identical reload/inspect gesture the visible left
      // hand does, never a second independently-decided motion. The
      // action-target ANCHOR is now resolved against the shadow's own
      // body-anchored weapon transform (never `actionPoseState`'s own
      // world-space fields, which are resolved against the CAMERA-relative
      // visible weapon and would reintroduce the reach problem).
      let leftTargetPos = leftGripResolvedRef.current.position;
      let leftTargetQuat = leftGripResolvedRef.current.quaternion;
      if (actionPoseState.ready && actionPoseState.leftActionTargetWeight > 0) {
        const actionAnchor = pickLeftActionAnchor(actionPoseState.actionPhase);
        resolveRuntimeAnchorWorldPose(actionAnchor, poseScale, weaponWorldPos, weaponWorldQuat, leftActionResolvedRef.current, anchorScratch);
        const blendedPos = blendedLeftTargetPosRef.current;
        const blendedQuat = blendedLeftTargetQuatRef.current;
        blendedPos.copy(leftGripResolvedRef.current.position).lerp(leftActionResolvedRef.current.position, actionPoseState.leftActionTargetWeight);
        blendedQuat.copy(leftGripResolvedRef.current.quaternion).slerp(leftActionResolvedRef.current.quaternion, actionPoseState.leftActionTargetWeight);
        leftTargetPos = blendedPos;
        leftTargetQuat = blendedQuat;
      }

      // --- Per-side DYNAMIC, bounded, smoothed shoulder assist (Step
      // 8E-C.1 — replaces the old fixed constant). Direction and magnitude
      // are computed FRESH every frame from the ACTUAL measured deficit at
      // the chest-aim-adjusted shoulder position, never a baked-in vector.
      const solveSide = (
        side: SideRuntimeState,
        target: THREE.Vector3,
        targetQuat: THREE.Quaternion,
        maxAssistM: number,
        smoothedMagRef: { value: number },
        tuning: (typeof rightTuningRef)['current'],
        poleLocalDir: readonly [number, number, number],
        debugOut: typeof shadowArmDebugState.right,
        sideLabel: 'right' | 'left',
      ) => {
        const preAssistPos = measureShoulderRestWorldPosition(side, armReferenceFrame);
        debugOut.preAssistShoulderWorldPos.copy(preAssistPos);
        const rawDist = preAssistPos.distanceTo(target);
        const maxReach = (side.metrics.upperLength + side.metrics.lowerLength) * SHADOW_ARM_IK_CONFIG.maxReachRatio;
        const deficit = rawDist - maxReach;
        const targetMag = THREE.MathUtils.clamp(deficit, 0, maxAssistM);
        smoothedMagRef.value = smoothTowards(smoothedMagRef.value, targetMag, SHADOW_ARM_IK_CONFIG.shoulderAssistSmoothingRate, delta);
        debugOut.assistMagnitudeM = smoothedMagRef.value;

        // Dev-only anatomical guardrail (Step 8E-C.2) — the chest-anchored
        // weapon presentation should keep the residual shoulder assist
        // small in every normal state; if it's not, that's worth surfacing
        // rather than silently absorbing (this is exactly how Step 8E-C.1's
        // rejected 0.4m/40cm cap slipped through unnoticed).
        if (smoothedMagRef.value > SHADOW_ARM_IK_CONFIG.shoulderAssistWarnThresholdM) {
          warnOnce(
            `shadow-shoulder-assist-over-threshold-${sideLabel}`,
            `Shadow ${sideLabel} shoulder assist reached ${(smoothedMagRef.value * 100).toFixed(1)}cm — above the ${(SHADOW_ARM_IK_CONFIG.shoulderAssistWarnThresholdM * 100).toFixed(0)}cm anatomical warn threshold. Investigate the weapon offset/chest-lean curve rather than raising the cap.`,
          );
        }

        if (smoothedMagRef.value > 1e-5) {
          const dir = assistDirWorldScratchRef.current.copy(target).sub(preAssistPos);
          if (dir.lengthSq() > 1e-10) dir.normalize();
          else dir.set(0, 0, -1);
          const assistWorld = assistWorldScratchRef.current.copy(dir).multiplyScalar(smoothedMagRef.value);
          tuning.shoulderAssistLocal.copy(assistWorld).applyQuaternion(chestWorldQuatInverseRef.current);
        } else {
          tuning.shoulderAssistLocal.set(0, 0, 0);
        }

        solveShadowArmSide(side, armReferenceFrame, chestWorldQuat, target, targetQuat, poleLocalDir, 1, debugOut, tuning);
      };

      const rightTuning = rightTuningRef.current;
      const rightBasisDeg = tuner.rightHandBasisAdjustDeg ?? SHADOW_ARM_IK_CONFIG.rightHandBasisAdjustDeg;
      rightTuning.handBasisAdjustQuat.setFromEuler(basisEulerScratchRef.current.set(THREE.MathUtils.degToRad(rightBasisDeg[0]), THREE.MathUtils.degToRad(rightBasisDeg[1]), THREE.MathUtils.degToRad(rightBasisDeg[2]), 'XYZ'));
      rightTuning.rotationWeight = tuner.rightWristRotationWeight ?? undefined;

      const leftTuning = leftTuningRef.current;
      const leftBasisDeg = tuner.leftHandBasisAdjustDeg ?? SHADOW_ARM_IK_CONFIG.leftHandBasisAdjustDeg;
      leftTuning.handBasisAdjustQuat.setFromEuler(basisEulerScratchRef.current.set(THREE.MathUtils.degToRad(leftBasisDeg[0]), THREE.MathUtils.degToRad(leftBasisDeg[1]), THREE.MathUtils.degToRad(leftBasisDeg[2]), 'XYZ'));
      leftTuning.rotationWeight = tuner.leftWristRotationWeight ?? undefined;

      const rightMaxAssist = tuner.rightMaxShoulderAssistM ?? SHADOW_ARM_IK_CONFIG.rightMaxShoulderAssistM;
      const leftMaxAssist = tuner.leftMaxShoulderAssistM ?? SHADOW_ARM_IK_CONFIG.leftMaxShoulderAssistM;

      const rightMagRef = { value: smoothedAssistMagRef.current.right };
      solveSide(
        armRuntime.right,
        rightGripResolvedRef.current.position,
        rightGripResolvedRef.current.quaternion,
        rightMaxAssist,
        rightMagRef,
        rightTuning,
        tuner.rightElbowPoleLocal ?? SHADOW_ARM_IK_CONFIG.rightElbowPoleLocal,
        shadowArmDebugState.right,
        'right',
      );
      smoothedAssistMagRef.current.right = rightMagRef.value;

      const leftMagRef = { value: smoothedAssistMagRef.current.left };
      solveSide(
        armRuntime.left,
        leftTargetPos,
        leftTargetQuat,
        leftMaxAssist,
        leftMagRef,
        leftTuning,
        tuner.leftElbowPoleLocal ?? SHADOW_ARM_IK_CONFIG.leftElbowPoleLocal,
        shadowArmDebugState.left,
        'left',
      );
      smoothedAssistMagRef.current.left = leftMagRef.value;
    } else if (armRuntime) {
      restoreRestPose(armRuntime.right);
      restoreRestPose(armRuntime.left);
      if (spineChainRef.current) restoreChestAimFrame(spineChainRef.current);
      smoothedAimPitchRef.current = 0;
      smoothedAssistMagRef.current.right = 0;
      smoothedAssistMagRef.current.left = 0;
      smoothedAdsBlendRef.current = 0;
      smoothedSprintBlendRef.current = 0;
      smoothedWeaponPoseRef.current = { posX: 0, posY: -0.05, posZ: -0.28, rotX: 0, rotY: 0, rotZ: 0 };
      timeSinceShotRef.current = Infinity;
      invalidateShadowWeaponWorldPose();
      shadowArmDebugState.chest = { boneResolved: !!spineChainRef.current, boneCount: spineChainRef.current?.bones.length ?? 0, aimPitchRawRad: 0, aimPitchSmoothedRad: 0, appliedChestPitchRad: 0 };
    }
  });

  if (!instance) return null;
  return (
    <group ref={containerRef} name="kael_fp_shadowbody_root_DEV_PROTOTYPE">
      <primitive object={instance} />
    </group>
  );
}
