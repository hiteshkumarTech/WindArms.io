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
import { applyOperatorRenderMode } from './renderModes';

/**
 * Kael first-person SHADOW FOUNDATION prototype (Milestone 8, Step 8E-B) —
 * DEVELOPMENT-ONLY, `/v2/range?shadow=1` exclusively (see `RangeScene.tsx`'s
 * mount site and `useShadowDebugEnabled.ts`). Never mounted on `/v2/play`,
 * never mounted in production, never mounted on plain `/v2/range` with no
 * flag.
 *
 * ================================================================
 * THIS IS NOT A COMPLETE SHADOW. DO NOT TREAT IT AS ONE.
 * ================================================================
 * The full-body GLB this mounts (`operator-kael.lod1.glb`) has ZERO
 * authored animation clips (verified, `docs/forge/kael-v0.1-inspection.md`)
 * — its arms/spine render in the source's own "relaxed-A-pose" bind pose,
 * completely static, with no relationship to the actual held-weapon pose,
 * for the ENTIRE lifetime of this component. Only the LEGS are
 * procedurally posed (see below). World-space arm IK and a synchronized
 * weapon-shadow follower are Step 8E-C's job, not this one's — see this
 * file's own `SPINE_AND_ARMS_UNSYNCHRONIZED` note and the debug panel's own
 * on-screen warning banner.
 *
 * WHAT THIS PROTOTYPE PROVES: the full-body skeleton shares the visible
 * lower-body derivative's exact bone names (`lowerBodyRig.ts`'s
 * `resolveLowerBodyBones` works against it unmodified), a world-anchored
 * (never camera-attached) placement using ONLY the derived capsule-to-feet
 * offset (`shadowBodyTransform.ts` — NOT the visible body's silhouette
 * offset, which exists for a first-person-viewing-angle reason that does
 * not apply to an externally-projected shadow), the existing reversible
 * `shadowOnly` render mode (`renderModes.ts`), and — the one genuinely
 * load-bearing architectural proof this pass exists for — that the legs can
 * be driven by the EXACT SAME locomotion result the visible body computes,
 * with no second, independently-advancing pose computation anywhere (see
 * `lowerBodyLocomotionPoseBridge.ts`).
 *
 * TEMPORARY SHADOW OWNERSHIP (Step 8E-B only, per this step's own brief):
 * while this component is mounted, it is the only body-region caster this
 * dev session shows alongside the STILL-ON visible FP-arms shadow (that
 * flag is untouched this pass — see `KaelFirstPersonArms.tsx`, still
 * `castShadow=true` unconditionally). The final "exactly one authoritative
 * caster per region" ownership change (turning the visible arms' shadow
 * off) does not happen until Step 8E-C ships a synchronized arm shadow to
 * replace it with.
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
        `[kael-fp-shadowbody] DEV PROTOTYPE loaded: url=${url} lod=${lod} meshes=${meshCount} joints=${jointCount} castShadowMeshes=${castShadowMeshCount} — arms/spine unsynchronized (Step 8E-C required)`,
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

  useEffect(() => {
    shadowBodyDebugReadout.ready = !!instance;
    return () => {
      shadowBodyDebugReadout.ready = false;
    };
  }, [instance]);

  useFrame(() => {
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
  });

  if (!instance) return null;
  return (
    <group ref={containerRef} name="kael_fp_shadowbody_root_DEV_PROTOTYPE">
      <primitive object={instance} />
    </group>
  );
}
