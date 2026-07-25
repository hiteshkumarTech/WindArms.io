'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WIND_WEAPONS } from '@shared/windWeapons';
import PipelineModel from '@/components/three/pipeline/PipelineModel';
import { ProceduralAeolus } from '@/components/three/storm/AeolusShowpiece';
import { FIRST_PERSON_ARM_IK_CONFIG } from '@/lib/v2/operators/firstPersonArmIkConfig';
import { computeActionPose, createActionPose, type ActionKind } from '@/lib/v2/operators/actionPose';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';
import { effectsBus, fireSignal, reloadSignal } from '@/lib/v2/range/effectsBus';
import { rangeLocalPose } from '@/lib/v2/range/localPose';
import { muzzleWorldPose } from '@/lib/v2/range/muzzleWorldPose';
import { actionPoseState } from '@/lib/v2/weapons/actionPoseState';
import { INSPECT_LEFT_HAND_LOCAL, RELOAD_LEFT_HAND_LOCAL } from '@/lib/v2/weapons/actionTargets';
import { useAnimDebugStore } from '@/lib/v2/weapons/animDebugStore';
import { checkDynamicAnchorState, checkStaticAnchorLayout } from '@/lib/v2/weapons/gripAnchorRegressionChecks';
import { useGripTunerStore } from '@/lib/v2/weapons/gripTunerStore';
import { beginGripGeneration, invalidateGripWorldPose, publishGripWorldPose } from '@/lib/v2/weapons/gripWorldPose';
import { resolveRuntimeAnchorWorldPose } from '@/lib/v2/weapons/runtimeAnchorMath';
import { VORTEX_RUNTIME_ANCHORS } from '@/lib/v2/weapons/vortexRuntimeAnchors';
import { VORTEX_VIEWMODEL_POSES } from '@/lib/v2/weapons/vortexViewmodelPose';
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';

const def = WIND_WEAPONS.vortex;
const { hip: HIP_POSE, ads: ADS_POSE } = VORTEX_VIEWMODEL_POSES;

/** Scales just the `<ProceduralAeolus>` fallback instance passed to this viewmodel — doesn't touch the component itself or the showpiece's separate usage. */
const FALLBACK_SCALE = 0.26;

/**
 * Set true only while visually re-verifying the muzzle anchor / pose against
 * the running scene (a colored sphere at the runtime muzzle anchor). Must be
 * false in every commit — see docs/decisions.md "Vortex Rifle FP pose
 * correction" for the verification pass this was used for.
 */
const DEBUG_SHOW_MUZZLE_ANCHOR = false;

/**
 * First-person Vortex Rifle. Real GLB (public/v2-art/vortex-rifle.lod1.glb)
 * via PipelineModel, `ProceduralAeolus` as the fallback. Shared, unchanged,
 * by both `/v2/range` and `/v2/play` (same component, same mount pattern).
 *
 * Base pose (rest position/rotation for hip and ADS) lives in
 * `vortexViewmodelPose.ts` — this component only owns the ADDITIVE dynamic
 * motion (sway/bob/recoil punch/reload+inspect presentation) and the
 * hip↔ADS blend, plus publishing the runtime muzzle anchor
 * (`vortexRuntimeAnchors.ts`) to world space every frame via
 * `muzzleWorldPose` so `VortexFireSystem` can spawn the visible tracer/
 * muzzle-flash from the actual barrel instead of a fixed camera offset.
 *
 * Reload/inspect presentation (Step 7C) is computed ONCE per frame here via
 * the pure `computeActionPose` (`lib/v2/operators/actionPose.ts`) — this
 * component applies the weapon-offset half directly to its own group
 * transform (same insertion point the old inline dip/wobble math used) and
 * publishes the hand-relevant half (`actionPoseState.ts`) for
 * `KaelFirstPersonArms.tsx` to read imperatively. Single source of truth:
 * the weapon's dip/lift and the arms' target-blend/finger-curl can never
 * numerically disagree, because both come from this one computation.
 */
export default function VortexViewmodel() {
  const camera = useThree((state) => state.camera);
  const groupRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const debugAnchorRef = useRef<THREE.Mesh>(null);

  const flashMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: def.accent, transparent: true, opacity: 0, toneMapped: false }), []);
  useEffect(() => () => flashMaterial.dispose(), [flashMaterial]);

  // Invalidate any stale muzzle pose from a PRIOR mounted instance the moment
  // this one mounts (module-singleton bridge, so without this a remount would
  // otherwise inherit `ready: true` pointing at wherever the old instance's
  // last frame left it) — and again on unmount, so nothing downstream can
  // ever read a frozen, no-longer-updating position. Genuinely re-validated
  // `true` at the end of every subsequent useFrame below.
  useEffect(() => {
    muzzleWorldPose.ready = false;
    return () => {
      muzzleWorldPose.ready = false;
    };
  }, []);

  // Same reset-on-(un)mount reasoning as the muzzle effect above — a route
  // remount must never read a previous instance's stale action target (Step
  // 7C requirement).
  useEffect(() => {
    actionPoseState.ready = false;
    return () => {
      actionPoseState.ready = false;
    };
  }, []);

  // Grip world-pose lifecycle — same reset-on-(un)mount reasoning as the
  // muzzle effect above, but through gripWorldPose's generation-gated API
  // rather than a raw `ready` flag, since two hands must never disagree on
  // which mounted instance produced them (see gripWorldPose.ts's module
  // doc for the full generation algorithm). The generation number is
  // stored in `sim.current` (below), not a separate ref, so the per-frame
  // publish call always has it without a second ref indirection.
  useEffect(() => {
    const generation = beginGripGeneration('vortex-rifle');
    sim.current.gripGeneration = generation;
    checkStaticAnchorLayout();
    return () => {
      invalidateGripWorldPose(generation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sim = useRef({
    bobPhase: 0,
    punch: 0,
    lastFireNonce: fireSignal.nonce,
    flashUntil: 0,
    swayX: 0,
    swayY: 0,
    lastYaw: rangeLocalPose.yaw,
    lastPitch: rangeLocalPose.pitch,
    raise: 1,
    lastReloadStartNonce: reloadSignal.startNonce,
    adsBlend: 0,
    /** Structural signature of the last raycast-disabling pass — re-patches only when the subtree actually changes (e.g. fallback→real swap), not every frame. */
    raycastPatchedChildCount: -1,
    scratchAnchor: new THREE.Vector3(),
    scratchQuat: new THREE.Quaternion(),
    /** Set by the mount effect above (module-singleton generation counter — see gripWorldPose.ts); 0 is never a valid published generation, so 0 here safely means "not yet mounted." */
    gripGeneration: 0,
    groupWorldPos: new THREE.Vector3(),
    rightGripPos: new THREE.Vector3(),
    rightGripQuat: new THREE.Quaternion(),
    leftGripPos: new THREE.Vector3(),
    leftGripQuat: new THREE.Quaternion(),
    gripScratchPos: new THREE.Vector3(),
    gripScratchEuler: new THREE.Euler(),
    gripScratchLocalQuat: new THREE.Quaternion(),
    /** Step 7C — persistent, mutated in place every frame by `computeActionPose` (never reassigned, matching the "no per-call allocation when outputs are supplied" requirement). */
    actionPose: createActionPose(),
    actionTargetPos: new THREE.Vector3(),
    actionTargetQuat: new THREE.Quaternion(),
    actionScratchPos: new THREE.Vector3(),
    actionScratchEuler: new THREE.Euler(),
    actionScratchLocalQuat: new THREE.Quaternion(),
  });
  // Preallocated wrapper objects for resolveRuntimeAnchorWorldPose's
  // output/scratch parameters — created ONCE outside useFrame (not as
  // fresh object literals each frame) so the hot path allocates nothing
  // beyond what the THREE.js Vector3/Quaternion fields inside them already
  // own. Kept outside `sim.current` only because they reference `sim.current`'s
  // own fields and must exist after it's constructed; still one stable
  // object per viewmodel instance, never recreated per frame.
  const gripOutputs = useRef({
    right: { position: sim.current.rightGripPos, quaternion: sim.current.rightGripQuat },
    left: { position: sim.current.leftGripPos, quaternion: sim.current.leftGripQuat },
    scratch: { pos: sim.current.gripScratchPos, euler: sim.current.gripScratchEuler, localQuat: sim.current.gripScratchLocalQuat },
  });
  const actionOutputs = useRef({
    target: { position: sim.current.actionTargetPos, quaternion: sim.current.actionTargetQuat },
    scratch: { pos: sim.current.actionScratchPos, euler: sim.current.actionScratchEuler, localQuat: sim.current.actionScratchLocalQuat },
  });

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const now = performance.now();
    const store = useVortexWeaponStore.getState();
    const state = sim.current;

    // The viewmodel sits well inside every shot's raycast path — without
    // this, VortexFireSystem's hit-test would always hit the player's own
    // gun first and never reach a real target, regardless of aim.
    if (group.children.length !== state.raycastPatchedChildCount) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
          child.raycast = () => null;
        }
      });
      state.raycastPatchedChildCount = group.children.length;
    }

    // --- Fire punch (edge-triggered on the fireSignal nonce) -------------
    if (fireSignal.nonce !== state.lastFireNonce) {
      state.lastFireNonce = fireSignal.nonce;
      state.punch = 1;
      state.flashUntil = now + 45;
    }
    state.punch = Math.max(0, state.punch - delta * 9);

    if (flashRef.current) flashRef.current.visible = now < state.flashUntil;
    flashMaterial.opacity = now < state.flashUntil ? 1 : 0;
    if (lightRef.current) lightRef.current.intensity = now < state.flashUntil ? 6 : 0;

    // --- Reload/inspect action pose (Step 7C) -------------------------------
    // Frame-rate-independent progress from the SAME absolute-timestamp
    // fields the old inline dip/wobble math already used — only the curve
    // computation moved (into `computeActionPose`), not the timing source.
    if (reloadSignal.startNonce !== state.lastReloadStartNonce) state.lastReloadStartNonce = reloadSignal.startNonce;
    const reloadDuration = (WIND_WEAPONS.vortex.gameplayStats?.reloadTimeS ?? 2.2) * 1000;
    const reloading = store.reloadingUntil !== 0;
    const inspecting = !reloading && now < store.inspectingUntil;
    const inspectDuration = 1500;
    const reloadT = reloading ? 1 - (store.reloadingUntil - now) / reloadDuration : 0;
    const inspectT = inspecting ? 1 - (store.inspectingUntil - now) / inspectDuration : 0;
    let actionKind: ActionKind = reloading ? 'reload' : inspecting ? 'inspect' : 'idle';
    let actionProgress = reloading ? reloadT : inspecting ? inspectT : 0;

    // Step 7C dev-only preview (`?anim=1`): when the anim debug store is in
    // `scrub` mode, its kind/progress REPLACE the real gameplay-driven
    // values above for this computation only — ammo/reload/inspect
    // gameplay state (`useVortexWeaponStore`) is never touched, so this can
    // never affect real firing/reload logic. `mode` defaults to `'live'`
    // and nothing outside an active `?anim=1` session can set it otherwise
    // (see `animDebugStore.ts`'s module doc).
    const anim = useAnimDebugStore.getState();
    if (anim.mode === 'scrub') {
      if (anim.playing) {
        const durationS = anim.scrubKind === 'reload' ? reloadDuration / 1000 : anim.scrubKind === 'inspect' ? inspectDuration / 1000 : 1;
        let next = anim.scrubProgress + delta / Math.max(durationS, 0.001);
        if (next >= 1) {
          next = anim.loop ? next % 1 : 1;
          if (!anim.loop) useAnimDebugStore.setState({ playing: false });
        }
        useAnimDebugStore.setState({ scrubProgress: next });
        actionKind = anim.scrubKind;
        actionProgress = next;
      } else {
        actionKind = anim.scrubKind;
        actionProgress = anim.scrubProgress;
      }
    }

    computeActionPose(
      {
        kind: actionKind,
        progress: actionProgress,
        canonicalRightFingerCurl: FIRST_PERSON_ARM_IK_CONFIG.rightFingerCurlScale,
        canonicalLeftFingerCurl: FIRST_PERSON_ARM_IK_CONFIG.leftFingerCurlScale,
      },
      state.actionPose,
    );

    // --- ADS blend -----------------------------------------------------
    const adsTarget = store.ads && store.reloadingUntil === 0 ? 1 : 0;
    state.adsBlend = THREE.MathUtils.lerp(state.adsBlend, adsTarget, 1 - Math.exp(-10 * delta));

    // --- Equip raise (decays once on mount, real-but-unused unequip mirror in VortexFireSystem) ---
    state.raise = Math.max(0, state.raise - delta * 3.2);

    // --- Look sway ---------------------------------------------------------
    const yawDelta = rangeLocalPose.yaw - state.lastYaw;
    const pitchDelta = rangeLocalPose.pitch - state.lastPitch;
    state.lastYaw = rangeLocalPose.yaw;
    state.lastPitch = rangeLocalPose.pitch;
    const swayAmount = 0.6 * (1 - state.adsBlend * 0.8);
    state.swayX = THREE.MathUtils.lerp(state.swayX, THREE.MathUtils.clamp(-yawDelta * swayAmount, -0.05, 0.05), 1 - Math.exp(-10 * delta));
    state.swayY = THREE.MathUtils.lerp(state.swayY, THREE.MathUtils.clamp(pitchDelta * swayAmount, -0.05, 0.05), 1 - Math.exp(-10 * delta));

    // --- Movement bob (suppressed while ADS, like most FPS conventions) ---
    const speed = rangeLocalPose.horizontalSpeed;
    const bobMul = 1 - state.adsBlend * 0.85;
    state.bobPhase += delta * (2 + speed * 1.1);
    const bobAmp = Math.min(speed / 9, 1) * 0.014 * bobMul * (rangeLocalPose.grounded ? 1 : 0.3);
    const bobX = Math.cos(state.bobPhase) * bobAmp;
    const bobY = Math.abs(Math.sin(state.bobPhase)) * bobAmp * 1.4;

    // --- Compose the final pose: hip↔ADS blend, then additive dynamics ----
    const pos = {
      x: THREE.MathUtils.lerp(HIP_POSE.position[0], ADS_POSE.position[0], state.adsBlend),
      y: THREE.MathUtils.lerp(HIP_POSE.position[1], ADS_POSE.position[1], state.adsBlend),
      z: THREE.MathUtils.lerp(HIP_POSE.position[2], ADS_POSE.position[2], state.adsBlend),
    };
    const rot = {
      x: THREE.MathUtils.lerp(HIP_POSE.rotation[0], ADS_POSE.rotation[0], state.adsBlend),
      y: THREE.MathUtils.lerp(HIP_POSE.rotation[1], ADS_POSE.rotation[1], state.adsBlend),
      z: THREE.MathUtils.lerp(HIP_POSE.rotation[2], ADS_POSE.rotation[2], state.adsBlend),
    };
    const poseScale = THREE.MathUtils.lerp(HIP_POSE.scale, ADS_POSE.scale, state.adsBlend);
    const raiseY = -state.raise * 0.35;

    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);
    // Grip-tuner "freeze pose" (Step 7, dev-only calibration aid): reads
    // imperatively via getState() (not a subscribed hook) so this never
    // triggers a re-render and, in production, `frozen` is unconditionally
    // false (the tuner panel that could ever set it true is gated behind
    // useGripDebugEnabled() and never mounts) — zero behavior change
    // outside an active `?grips=1` dev session, PROVEN not assumed: the
    // `false` branch below reproduces the pre-existing unconditional
    // translate/rotate calls verbatim, just minus the dynamic terms, so
    // `frozen === false` takes the exact same code path this block always
    // took. Camera-follow above still runs every frame either way, so the
    // weapon keeps tracking the player's view; only the sway/bob/recoil/
    // reload/inspect DYNAMICS below are held still, which is what "freeze"
    // is actually for (a steady pose to read exact marker numbers off of).
    // NOTE: this also freezes the muzzle tracer/flash origin published
    // below while active, since that reads the same group transform —
    // correct and intended for a dev calibration session (nothing fires
    // while tuning grips), never a concern in production since `frozen`
    // can't be true there.
    //
    // Step 7C: also freeze while the match is paused or the player is dead
    // ("Pause must freeze the current action pose") — reusing this SAME
    // freeze mechanism rather than adding a second one. `useV2MatchStore`
    // is a plain global store safe to read from `/v2/range` too (it just
    // never leaves its initial phase there, so this is always `false` on
    // that route). Read imperatively via `getState()` — no subscription,
    // no re-render, same convention as the grip-tuner check above.
    const matchPhase = useV2MatchStore.getState().phase;
    const freezeDynamics = useGripTunerStore.getState().frozen || matchPhase === 'paused' || matchPhase === 'playerDead';
    if (!freezeDynamics) {
      const actionPose = state.actionPose;
      // Position first, in un-rotated view space (camera-relative, intuitive to author) — see ViewmodelPose's doc comment.
      group.translateX(pos.x + state.swayX + bobX + actionPose.weaponPositionOffset[0]);
      group.translateY(pos.y + state.swayY + bobY + actionPose.weaponPositionOffset[1] + raiseY + state.punch * 0.06);
      group.translateZ(pos.z + state.punch * 0.08 + actionPose.weaponPositionOffset[2]);
      // Then rotate the model in place around its now-fixed origin — base pose (incl. the +X→-Z forward correction) plus dynamic recoil/inspect on top.
      group.rotateX(rot.x + state.punch * 0.06 + actionPose.weaponRotationOffset[0]);
      group.rotateY(rot.y + actionPose.weaponRotationOffset[1]);
      group.rotateZ(rot.z + actionPose.weaponRotationOffset[2]);
    } else {
      group.translateX(pos.x);
      group.translateY(pos.y);
      group.translateZ(pos.z);
      group.rotateX(rot.x);
      group.rotateY(rot.y);
      group.rotateZ(rot.z);
    }

    // --- Publish the runtime muzzle anchor to world space -----------------
    // Force the world matrix current THIS frame (it's otherwise only
    // updated during the render pass, which would read stale data — the
    // exact one-frame-lag pitfall documented on `muzzleWorldPose`).
    group.updateWorldMatrix(true, false);
    state.scratchAnchor.set(...VORTEX_RUNTIME_ANCHORS.muzzleLocal).multiplyScalar(poseScale);
    // Debug sphere is a CHILD of this same group — position it in LOCAL
    // space (the anchor as-is) before scratchAnchor gets converted to world
    // space below, so it renders exactly where the anchor math says without
    // a redundant world→local conversion back.
    if (DEBUG_SHOW_MUZZLE_ANCHOR && debugAnchorRef.current) {
      debugAnchorRef.current.position.copy(state.scratchAnchor);
      debugAnchorRef.current.visible = true;
    }
    group.localToWorld(state.scratchAnchor);
    muzzleWorldPose.position.copy(state.scratchAnchor);
    group.getWorldQuaternion(state.scratchQuat);
    muzzleWorldPose.direction.set(1, 0, 0).applyQuaternion(state.scratchQuat).normalize();
    muzzleWorldPose.ready = true;

    // --- Publish the runtime grip anchors to world space ------------------
    // Reuses this same frame's already-current world matrix (updated above
    // for the muzzle) and `state.scratchQuat` (already holds the group's
    // world quaternion from the `getWorldQuaternion` call above — same
    // value, no need to recompute). Right and left are resolved into their
    // own preallocated scratch and published together in ONE call so a
    // consumer can never observe one hand from this frame and the other
    // stale (see gripWorldPose.ts's "atomic publication" doc).
    group.getWorldPosition(state.groupWorldPos);
    const outputs = gripOutputs.current;
    const rightOk = resolveRuntimeAnchorWorldPose(
      VORTEX_RUNTIME_ANCHORS.gripHandLocal,
      poseScale,
      state.groupWorldPos,
      state.scratchQuat,
      outputs.right,
      outputs.scratch,
    );
    const leftOk = resolveRuntimeAnchorWorldPose(
      VORTEX_RUNTIME_ANCHORS.gripSupportLocal,
      poseScale,
      state.groupWorldPos,
      state.scratchQuat,
      outputs.left,
      outputs.scratch,
    );
    if (rightOk && leftOk && state.gripGeneration !== 0) {
      publishGripWorldPose(
        state.gripGeneration,
        state.rightGripPos,
        state.rightGripQuat,
        state.leftGripPos,
        state.leftGripQuat,
        state.groupWorldPos,
        state.scratchQuat,
      );
    } else if (state.gripGeneration !== 0) {
      invalidateGripWorldPose(state.gripGeneration);
    }
    checkDynamicAnchorState(poseScale, state.rightGripPos, state.leftGripPos, camera.position);

    // --- Publish the action pose + resolved left-hand action target -------
    // Reuses this frame's already-resolved `groupWorldPos`/`scratchQuat` —
    // no duplicate weapon-transform computation. Only resolves a target
    // anchor when an action is actually active (`leftActionTargetWeight >
    // 0`); otherwise publishes the hand-weight/finger-curl/phase fields
    // with `ready: false` on the target itself so a consumer never blends
    // toward a stale, no-longer-relevant world position.
    const ap = state.actionPose;
    actionPoseState.rightHandIkWeight = ap.rightHandIkWeight;
    actionPoseState.leftHandIkWeight = ap.leftHandIkWeight;
    actionPoseState.rightFingerCurlScale = ap.rightFingerCurlScale;
    actionPoseState.leftFingerCurlScale = ap.leftFingerCurlScale;
    actionPoseState.leftActionTargetWeight = ap.leftActionTargetWeight;
    actionPoseState.actionPhase = ap.actionPhase;
    if (ap.leftActionTargetWeight > 0 && state.gripGeneration !== 0) {
      // `state.gripGeneration !== 0` — same stale-generation guard
      // `publishGripWorldPose` already enforces (see `gripWorldPose.ts`'s
      // module doc: a React Strict Mode double-invoked effect's straggler
      // frame, or a just-unmounted instance's in-flight `useFrame`, must
      // never publish). Reuses the SAME generation counter rather than
      // inventing a second one for this bridge.
      const anchor = actionKind === 'reload' ? RELOAD_LEFT_HAND_LOCAL : INSPECT_LEFT_HAND_LOCAL;
      const targetOk = resolveRuntimeAnchorWorldPose(anchor, poseScale, state.groupWorldPos, state.scratchQuat, actionOutputs.current.target, actionOutputs.current.scratch);
      actionPoseState.ready = targetOk;
      if (targetOk) {
        actionPoseState.leftTargetPosition.copy(state.actionTargetPos);
        actionPoseState.leftTargetQuaternion.copy(state.actionTargetQuat);
      }
    } else {
      actionPoseState.ready = false;
    }
  });

  return (
    <group ref={groupRef} renderOrder={999}>
      <PipelineModel
        slot="vortex-rifle"
        fallback={
          <group scale={FALLBACK_SCALE}>
            <ProceduralAeolus />
          </group>
        }
        scale={HIP_POSE.scale}
        accentTint={def.accent}
        requestedLod={1}
      />
      <mesh ref={flashRef} position={[0, 0.02, -0.9]} visible={false}>
        <planeGeometry args={[0.14, 0.14]} />
        <primitive object={flashMaterial} attach="material" />
      </mesh>
      <pointLight ref={lightRef} color={def.accent} position={[0, 0.02, -0.85]} intensity={0} distance={2.5} decay={2} />
      {DEBUG_SHOW_MUZZLE_ANCHOR && (
        <mesh ref={debugAnchorRef} visible={false} raycast={() => null}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshBasicMaterial color="#ff00ff" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
