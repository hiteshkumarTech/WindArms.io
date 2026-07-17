'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WIND_WEAPONS } from '@shared/windWeapons';
import PipelineModel from '@/components/three/pipeline/PipelineModel';
import { ProceduralAeolus } from '@/components/three/storm/AeolusShowpiece';
import { effectsBus, fireSignal, reloadSignal } from '@/lib/v2/range/effectsBus';
import { rangeLocalPose } from '@/lib/v2/range/localPose';
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';

const def = WIND_WEAPONS.vortex;

/**
 * Rest offset of the gun in view space, meters, and its viewmodel scale.
 *
 * KNOWN PRODUCTION BLOCKER (found while verifying this visually — see the
 * Phase 4 report): the real GLB (public/v2-art/vortex-rifle.glb) resolves
 * its URL correctly and downloads fully (confirmed via network trace), but
 * `useGLTF`'s parse never completes — `PipelineModel`'s `onReady` never
 * fires, in both dev AND a production build, so `LoadedModel` stays
 * permanently suspended on `fallback`. Reproduces on the landing page's
 * showpiece too (screenshotted and visually confirmed to be the same
 * fallback geometry, not the real asset) — this is a pre-existing pipeline
 * bug, not something introduced this session, and out of THIS task's scope
 * to root-cause (likely the Draco-compressed mesh failing to decode in this
 * sandboxed environment — the decoder WASM/JS both download successfully,
 * but that doesn't prove the decode itself succeeds). `VIEWMODEL_SCALE`
 * therefore has no visible effect right now (`PipelineModel`'s `scale` prop
 * only ever applies to the real model, never `fallback`, by design) — the
 * fallback's own framing is tuned separately below via `FALLBACK_SCALE`.
 */
const REST = { x: 0.28, y: -0.24, z: -0.62 };
const ADS_REST = { x: 0.02, y: -0.15, z: -0.36 };
const VIEWMODEL_SCALE = 0.42;
/** Scales just the `<ProceduralAeolus>` fallback instance passed to this viewmodel — doesn't touch the component itself or the showpiece's separate usage. Tuned visually at REST.z=-0.62; see the Phase 4 report. */
const FALLBACK_SCALE = 0.26;

/** Ammo-feed drop/insert/settle curve — same phased-curve idiom as v1's WeaponViewmodel.tsx `reloadFeedOffset`, not a raw lerp, so it reads as loading a magazine rather than just dipping. */
function reloadDipOffset(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  if (c < 0.35) return THREE.MathUtils.lerp(0, -0.16, THREE.MathUtils.smoothstep(c, 0, 0.35));
  if (c < 0.55) return -0.16;
  if (c < 0.85) return THREE.MathUtils.lerp(-0.16, 0, THREE.MathUtils.smoothstep(c, 0.55, 0.85));
  const settle = (c - 0.85) / 0.15;
  return Math.sin(settle * Math.PI * 2) * 0.01 * (1 - settle);
}

/**
 * First-person Vortex Rifle. Real GLB (public/v2-art/vortex-rifle.glb) via
 * PipelineModel, `ProceduralAeolus` (exported from AeolusShowpiece.tsx —
 * the exact same fallback the landing-page hero showpiece uses, not a
 * duplicate) as the fallback. The GLB has no clips/sockets today (confirmed
 * via tools/inspect-glb.mjs) so every motion below is procedural, built the
 * same way v1's WeaponViewmodel.tsx animates its own procedural guns:
 * exponential lerp-toward-target for continuous motion (bob/sway/ADS),
 * linear decay for the recoil punch, a phased curve for the reload dip.
 */
export default function VortexViewmodel() {
  const camera = useThree((state) => state.camera);
  const groupRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const flashMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: def.accent, transparent: true, opacity: 0, toneMapped: false }), []);
  useEffect(() => () => flashMaterial.dispose(), [flashMaterial]);

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
    x: REST.x,
    y: REST.y,
    z: REST.z,
    /** Structural signature of the last raycast-disabling pass — re-patches only when the subtree actually changes (e.g. fallback→real swap), not every frame. */
    raycastPatchedChildCount: -1,
  });

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const now = performance.now();
    const store = useVortexWeaponStore.getState();
    const state = sim.current;

    // The viewmodel sits ~0.6m in front of the camera, well inside every
    // shot's raycast path — without this, VortexFireSystem's hit-test would
    // always hit the player's own gun first and never reach a real target,
    // regardless of aim (found while verifying this visually: 0 hits across
    // many precisely-aimed test shots — see the Phase 4 report). v1's
    // WeaponViewmodel avoids this the same way: viewmodel geometry is
    // excluded from raycasting entirely, not just visually layered on top.
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

    // --- Reload dip --------------------------------------------------------
    if (reloadSignal.startNonce !== state.lastReloadStartNonce) state.lastReloadStartNonce = reloadSignal.startNonce;
    const reloadDuration = (WIND_WEAPONS.vortex.gameplayStats?.reloadTimeS ?? 2.2) * 1000;
    const reloadT = store.reloadingUntil !== 0 ? 1 - (store.reloadingUntil - now) / reloadDuration : 0;
    const reloadY = store.reloadingUntil !== 0 ? reloadDipOffset(reloadT) : 0;

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

    // --- Inspect wobble ------------------------------------------------
    const inspecting = now < store.inspectingUntil;
    let inspectY = 0;
    let inspectTiltZ = 0;
    if (inspecting) {
      const inspectDuration = 1500;
      const progress = 1 - (store.inspectingUntil - now) / inspectDuration;
      const ease = Math.sin(THREE.MathUtils.clamp(progress, 0, 1) * Math.PI);
      inspectY = ease * 0.05;
      inspectTiltZ = Math.sin(progress * Math.PI * 2) * 0.08 * ease;
    }

    // --- Compose the final local offset ------------------------------------
    const base = { x: THREE.MathUtils.lerp(REST.x, ADS_REST.x, state.adsBlend), y: THREE.MathUtils.lerp(REST.y, ADS_REST.y, state.adsBlend), z: THREE.MathUtils.lerp(REST.z, ADS_REST.z, state.adsBlend) };
    const raiseY = -state.raise * 0.35;

    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);
    group.translateX(base.x + state.swayX + bobX);
    group.translateY(base.y + state.swayY + bobY + reloadY + inspectY + raiseY + state.punch * 0.06);
    group.translateZ(base.z + state.punch * 0.08);
    group.rotateX(state.punch * 0.06);
    group.rotateZ(inspectTiltZ);
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
        scale={VIEWMODEL_SCALE}
        accentTint={def.accent}
      />
      <mesh ref={flashRef} position={[0, 0.02, -0.9]} visible={false}>
        <planeGeometry args={[0.14, 0.14]} />
        <primitive object={flashMaterial} attach="material" />
      </mesh>
      <pointLight ref={lightRef} color={def.accent} position={[0, 0.02, -0.85]} intensity={0} distance={2.5} decay={2} />
    </group>
  );
}
