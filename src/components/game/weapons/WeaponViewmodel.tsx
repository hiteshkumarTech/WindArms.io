'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AMMO_FEED_MODULE_KINDS,
  MECHANISM_MODULE_KINDS,
  WEAPON_ORDER,
  WEAPONS,
  type WeaponModule,
} from '@shared/weapons';
import { DEFAULT_TINT_ID, weaponTintById } from '@shared/heroes';
import { fireSignal, groundImpact } from '@/lib/game/effectsBus';
import { localPose } from '@/lib/game/localPose';
import { createRimMaterial } from '@/lib/three/rimLight';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useCombatStore } from '@/stores/combatStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWeaponStore } from '@/stores/weaponStore';
import { ChassisGeometry, ModuleGeometry, noRaycast, type WeaponSurfaceMaterials } from './weaponGeometry';

/** Rest offset of the gun in view space. */
const REST = { x: 0.26, y: -0.2, z: -0.48 };
/** Inspect animation length (ms). */
const INSPECT_MS = 1500;
/** Ammo-feed drop/insert/settle curve, normalized to the reload window (0..1). */
function reloadFeedOffset(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  if (c < 0.35) return THREE.MathUtils.lerp(0, -0.22, THREE.MathUtils.smoothstep(c, 0, 0.35));
  if (c < 0.55) return -0.22;
  if (c < 0.85) return THREE.MathUtils.lerp(-0.22, 0, THREE.MathUtils.smoothstep(c, 0.55, 0.85));
  const settle = (c - 0.85) / 0.15;
  return Math.sin(settle * Math.PI * 2) * 0.012 * (1 - settle);
}
/** Shotgun pump rack: back, hold, forward — its own phase timing, reused across the reload window. */
function pumpOffset(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  if (c < 0.4) return THREE.MathUtils.lerp(0, 0.09, THREE.MathUtils.smoothstep(c, 0, 0.4));
  if (c < 0.6) return 0.09;
  if (c < 0.9) return THREE.MathUtils.lerp(0.09, 0, THREE.MathUtils.smoothstep(c, 0.6, 0.9));
  return 0;
}

interface ViewmodelMaterials extends WeaponSurfaceMaterials {
  flash: THREE.MeshBasicMaterial;
  rim: THREE.ShaderMaterial;
}

/**
 * First-person procedural weapon. Each of the 7 weapons builds a distinct
 * silhouette from a shared, layered chassis (`ChassisGeometry`, data-driven
 * via `WeaponVisual.chassis`) plus a data-driven `modules` list
 * (scope/stock/mag/bipod/energy dressing) — no external models. Follows the
 * camera with bob (speed- and mass-scaled), sway (look deltas, mass-scaled),
 * recoil punch, a phased reload with an independently animated ammo-feed
 * module, per-class mechanical-action animation (slide/charging-handle/
 * pump), a landing/jump dip, a sprint-carry pose, and switch raise. Renders
 * above the world (depthTest off) so it never clips into walls, and is
 * invisible to raycasts.
 */
export default function WeaponViewmodel() {
  const groupRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const feedRef = useRef<THREE.Group>(null);
  const mechRef = useRef<THREE.Group>(null);
  const pumpRef = useRef<THREE.Group>(null);

  const current = useWeaponStore((state) => state.current);
  const def = WEAPONS[current];
  const isEnergy = def.visual.frame === 'energy';
  const equippedTint = useAuthStore((state) => state.profile?.equippedTint);
  // Equipped tint recolors the viewmodel accent; guests/default keep the weapon's own accent.
  const accentColor =
    equippedTint && equippedTint !== DEFAULT_TINT_ID
      ? weaponTintById(equippedTint).color
      : def.visual.accent;
  // Stable per-weapon seed so the chassis's baked wear jitter doesn't reshuffle on remount.
  const seed = WEAPON_ORDER.indexOf(current) * 9001;

  const feedModule = useMemo<WeaponModule | undefined>(
    () => def.visual.modules.find((m) => AMMO_FEED_MODULE_KINDS.includes(m.kind)),
    [def],
  );
  const mechModule = useMemo<WeaponModule | undefined>(
    () => def.visual.modules.find((m) => MECHANISM_MODULE_KINDS.includes(m.kind)),
    [def],
  );
  const staticModules = useMemo(
    () => def.visual.modules.filter((m) => m !== feedModule && m !== mechModule),
    [def, feedModule, mechModule],
  );

  const sim = useRef({
    bobPhase: 0,
    punch: 0,
    lastFireNonce: 0,
    flashUntil: 0,
    lastYaw: 0,
    lastPitch: 0,
    swayX: 0,
    swayY: 0,
    raise: 0,
    inspectUntil: 0,
    lastWeapon: current,
    feedY: 0,
    sprintBlend: 0,
    lastGroundNonce: 0,
    landDipT: 999,
    landDipMag: 0,
  });

  // Inspect trigger (F): show off the weapon while idle.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyF' || event.repeat) return;
      if (!document.pointerLockElement || useChatStore.getState().open) return;
      if (!useCombatStore.getState().alive || useWeaponStore.getState().reloadingUntil !== 0) return;
      sim.current.inspectUntil = performance.now() + INSPECT_MS;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const materials = useMemo<ViewmodelMaterials>(() => {
    const body = new THREE.MeshStandardMaterial({
      color: '#161b23',
      metalness: 0.85,
      roughness: 0.35,
      depthTest: false,
    });
    // Machined barrel/attachment steel — cooler tint, sharper specular than the receiver shell.
    const metal = new THREE.MeshStandardMaterial({
      color: '#12161c',
      metalness: 0.92,
      roughness: 0.22,
      depthTest: false,
    });
    // Matte polymer for magazines/grips/stocks — reads distinctly from machined steel.
    const polymer = new THREE.MeshStandardMaterial({
      color: '#0b0d10',
      metalness: 0.04,
      roughness: 0.8,
      depthTest: false,
    });
    // Woven carbon-fiber composite — modern handguards/stocks (AR/SMG/sniper family).
    const carbon = new THREE.MeshStandardMaterial({
      color: '#0a0b0d',
      metalness: 0.1,
      roughness: 0.42,
      depthTest: false,
    });
    // Coated ceramic — scope mounts, chokes, energy housings; a soft clearcoat sheen.
    const ceramic = new THREE.MeshPhysicalMaterial({
      color: '#20242b',
      metalness: 0.15,
      roughness: 0.5,
      clearcoat: 0.6,
      clearcoatRoughness: 0.35,
      depthTest: false,
    });
    const accent = new THREE.MeshPhysicalMaterial({
      color: '#03161a',
      emissive: new THREE.Color(accentColor),
      emissiveIntensity: 2.2,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      toneMapped: false,
      depthTest: false,
    });
    const flash = new THREE.MeshBasicMaterial({
      // The energy weapon vents a violet-white discharge instead of a warm muzzle flash.
      color: isEnergy ? '#dcd0ff' : '#fff7d9',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const rim = createRimMaterial(accentColor, 0.8);
    rim.depthTest = false;
    return { body, metal, polymer, carbon, ceramic, accent, flash, rim };
    // Rebuild when the weapon accent (or equipped tint) changes, or on switching to/from energy.
  }, [accentColor, isEnergy]);

  useEffect(
    () => () => {
      materials.body.dispose();
      materials.metal.dispose();
      materials.polymer.dispose();
      materials.carbon.dispose();
      materials.ceramic.dispose();
      materials.accent.dispose();
      materials.flash.dispose();
      materials.rim.dispose();
    },
    [materials],
  );

  useFrame(({ camera }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    // Confine the whole viewmodel (it and every child, re-applied every frame
    // since modules remount on weapon switch) to layer 1. Cyber City's
    // MeshReflectorMaterial renders its reflection with a fresh camera that
    // only ever sees the default layer 0 (drei never copies the main
    // camera's layers onto it) — without this, the viewmodel gets rendered
    // a second time into the floor reflection from the mirrored camera's
    // very different vantage point, appearing as a huge distorted double.
    group.traverse((child) => child.layers.set(1));

    const state = sim.current;
    const now = performance.now();
    const alive = useCombatStore.getState().alive;

    group.visible = document.pointerLockElement !== null && alive;
    if (!group.visible) return;

    const bulk = def.visual.bulk;

    // Weapon switch raise animation — heavier weapons raise back to ready slower.
    if (state.lastWeapon !== current) {
      state.lastWeapon = current;
      state.raise = 1;
    }
    const raiseRate = 5 / (0.75 + bulk * 0.45);
    state.raise = Math.max(0, state.raise - delta * raiseRate);

    // Fire feedback (also cancels an inspect in progress). The energy
    // weapon's discharge lingers slightly longer than a kinetic muzzle flash.
    const justFired = fireSignal.nonce !== state.lastFireNonce;
    if (justFired) {
      state.lastFireNonce = fireSignal.nonce;
      state.punch = 1;
      state.flashUntil = now + (isEnergy ? 70 : 45);
      state.inspectUntil = 0;
    }
    state.punch = Math.max(0, state.punch - delta * 9);
    // Emissive accent pulses with fire recency; the energy weapon also idles with a slow breathing glow.
    materials.accent.emissiveIntensity =
      2.2 + state.punch * 2.0 + (isEnergy ? Math.sin(now * 0.0035) * 0.3 : 0);

    // Bob (mass-scaled) from movement speed; sway (mass-scaled) from look deltas.
    const speed = usePlayerStore.getState().speed;
    state.bobPhase += delta * (2 + speed * 1.1);
    const bobMul = 0.75 + bulk * 0.4;
    const bobAmp = useSettingsStore.getState().viewBob ? Math.min(speed / 9, 1) * 0.012 * bobMul : 0;

    const yawDelta = localPose.yaw - state.lastYaw;
    const pitchDelta = localPose.pitch - state.lastPitch;
    state.lastYaw = localPose.yaw;
    state.lastPitch = localPose.pitch;
    const swayAmount = 4 * (0.8 + bulk * 0.35);
    const swayRate = 10 / (0.75 + bulk * 0.45);
    state.swayX = THREE.MathUtils.lerp(state.swayX, -yawDelta * swayAmount, 1 - Math.exp(-swayRate * delta));
    state.swayY = THREE.MathUtils.lerp(state.swayY, pitchDelta * swayAmount, 1 - Math.exp(-swayRate * delta));

    // Sprint carries the weapon in and canted across the chest.
    const sprinting = localPose.state === 'sprint';
    state.sprintBlend = THREE.MathUtils.lerp(state.sprintBlend, sprinting ? 1 : 0, 1 - Math.exp(-8 * delta));

    // Phased reload: eject / hold / insert / settle, scaled to this weapon's own reloadTimeS.
    const reloadingUntil = useWeaponStore.getState().reloadingUntil;
    const reloading = reloadingUntil !== 0;
    const reloadT = reloading ? 1 - (reloadingUntil - now) / (def.reloadTimeS * 1000) : 0;
    const targetFeedY = reloading ? reloadFeedOffset(reloadT) : 0;
    state.feedY = THREE.MathUtils.lerp(state.feedY, targetFeedY, 1 - Math.exp(-14 * delta));
    if (feedRef.current && feedModule) {
      // The LMG's drum/belt module also gets a subtle per-shot lateral creep, reusing the
      // fire-recency `punch` value instead of a new signal — reads as belt-feed motion.
      const creepX = current === 'lmg' ? state.punch * 0.008 : 0;
      feedRef.current.position.set(
        feedModule.position[0] + creepX,
        feedModule.position[1] + state.feedY,
        feedModule.position[2],
      );
    }
    // Energy cell swap doubles as a charge-up cue on the accent material.
    if (isEnergy && reloading) materials.accent.emissiveIntensity += reloadT * 1.4;
    const reloadDip = reloading ? 0.14 : 0;

    // Mechanical-action animation — per weapon class, driven by signals already in play.
    if (mechRef.current && mechModule) {
      let mechOffsetZ = 0;
      if (current === 'pistol') {
        // Slide racks back on the shot, springs back forward with the punch decay.
        mechOffsetZ = -state.punch * 0.05;
      } else if (current === 'ar') {
        // Charging handle flicks once, right at the reload's insert->settle boundary.
        const flick = reloading && reloadT > 0.82 && reloadT < 0.94
          ? Math.sin(((reloadT - 0.82) / 0.12) * Math.PI)
          : 0;
        mechOffsetZ = flick * 0.03;
      }
      mechRef.current.position.set(mechModule.position[0], mechModule.position[1], mechModule.position[2] + mechOffsetZ);
    }
    // Shotgun pump: a chassis feature, not a module — racks back/forward across the reload window.
    if (pumpRef.current && current === 'shotgun') {
      pumpRef.current.position.z = -0.24 - (reloading ? pumpOffset(reloadT) : 0);
    }

    // Landing/jump dip — proportional to the impact speed PlayerController reported.
    if (groundImpact.nonce !== state.lastGroundNonce) {
      state.lastGroundNonce = groundImpact.nonce;
      state.landDipMag = groundImpact.velocity;
      state.landDipT = 0;
    }
    state.landDipT += delta;
    const landProgress = Math.min(state.landDipT / 0.35, 1);
    const landCurve = Math.sin(landProgress * Math.PI) * (1 - landProgress * 0.3);
    const landStrength = THREE.MathUtils.clamp(Math.abs(state.landDipMag) / 14, 0, 1);
    const landDip = landProgress < 1 ? landCurve * landStrength * 0.055 : 0;

    // Inspect is cancelled by reloading or a weapon switch.
    if (reloading || state.raise > 0.01) state.inspectUntil = 0;
    const inspectProgress = now < state.inspectUntil ? 1 - (state.inspectUntil - now) / INSPECT_MS : 0;
    const inspectAmt = Math.sin(inspectProgress * Math.PI); // ease up, then back to rest
    const inspectTilt = Math.sin(inspectProgress * Math.PI * 2) * 0.22;

    // Idle breathing: a subtle drift that fades in as you slow to a stop.
    const idle = 1 - Math.min(speed / 2, 1);
    const breath = idle * Math.sin(now * 0.0016) * 0.004;

    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);
    group.translateX(
      REST.x + state.swayX + Math.cos(state.bobPhase) * bobAmp - inspectAmt * 0.05 - state.sprintBlend * 0.045,
    );
    group.translateY(
      REST.y +
        state.swayY +
        Math.abs(Math.sin(state.bobPhase)) * bobAmp * 1.4 -
        reloadDip -
        state.raise * 0.22 +
        inspectAmt * 0.04 +
        breath -
        state.sprintBlend * 0.03 -
        landDip,
    );
    group.translateZ(REST.z + state.punch * 0.07 + inspectAmt * 0.05);
    group.rotateX(state.punch * 0.05 - reloadDip * 0.9 - state.raise * 0.4 + inspectTilt);
    group.rotateY(inspectAmt * 1.9);
    group.rotateZ(inspectAmt * 0.55 + state.sprintBlend * 0.14);

    // Muzzle flash visibility.
    const flashing = now < state.flashUntil;
    if (flashRef.current) {
      flashRef.current.visible = flashing;
      if (flashing) flashRef.current.rotation.z = Math.random() * Math.PI;
    }
    if (lightRef.current) {
      lightRef.current.intensity = flashing ? 6 : 0;
      lightRef.current.color.set(isEnergy ? '#b18cff' : '#ffe9b0');
    }
  });

  const bulk = def.visual.bulk;
  const length = def.visual.length;
  const barrelLength = def.visual.barrelLength;
  const barrelRadius = def.visual.barrelRadius;

  return (
    <group ref={groupRef} renderOrder={1000} visible={false}>
      <ChassisGeometry
        chassis={def.visual.chassis}
        bulk={bulk}
        length={length}
        barrelLength={barrelLength}
        barrelRadius={barrelRadius}
        gripRake={def.visual.gripRake}
        materials={materials}
        seed={seed}
      />

      {/* Fresnel rim shells — thin duplicate meshes, additive/unlit, over the receiver, grip and front collar */}
      <mesh
        material={materials.rim}
        raycast={noRaycast}
        renderOrder={1000}
        position={[0, 0, -length / 2]}
        scale={[1.06, 1.08, 1.01]}
      >
        <boxGeometry args={[0.075 * bulk, 0.095 * bulk, length]} />
      </mesh>
      <mesh
        material={materials.rim}
        raycast={noRaycast}
        renderOrder={1000}
        position={[0, -0.08, -0.06]}
        rotation={[def.visual.gripRake, 0, 0]}
        scale={1.08}
      >
        <boxGeometry args={[0.045 * bulk, 0.11, 0.05]} />
      </mesh>
      <mesh
        material={materials.rim}
        raycast={noRaycast}
        renderOrder={1000}
        position={[0, 0.012, -length - length * 0.02]}
        scale={1.1}
      >
        <boxGeometry args={[0.075 * 0.5 * bulk, 0.095 * 0.55 * bulk, length * 0.06]} />
      </mesh>

      {/* Accent energy strip */}
      <mesh material={materials.accent} raycast={noRaycast} renderOrder={1001} position={[0, 0.055 * bulk, -length / 2]}>
        <boxGeometry args={[0.018, 0.012, length * 0.7]} />
      </mesh>

      {/* Per-weapon attachments — silhouette-defining, data-driven */}
      {staticModules.map((module, i) => (
        <group key={i} position={module.position} rotation={module.rotation} scale={module.scale}>
          <ModuleGeometry kind={module.kind} materials={materials} />
        </group>
      ))}
      {feedModule ? (
        <group ref={feedRef} position={feedModule.position} rotation={feedModule.rotation} scale={feedModule.scale}>
          <ModuleGeometry kind={feedModule.kind} materials={materials} />
        </group>
      ) : null}
      {mechModule ? (
        <group ref={mechRef} position={mechModule.position} rotation={mechModule.rotation} scale={mechModule.scale}>
          <ModuleGeometry kind={mechModule.kind} materials={materials} />
        </group>
      ) : null}
      {current === 'shotgun' ? (
        <group ref={pumpRef} position={[0, -0.028, -0.24]}>
          <mesh material={materials.polymer} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[0.021, 0.021, 0.09, 10]} />
          </mesh>
          <mesh material={materials.carbon} position={[0, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.048, 0.028, 0.07]} />
          </mesh>
        </group>
      ) : null}

      {/* Muzzle flash quad + light */}
      <mesh
        ref={flashRef}
        material={materials.flash}
        raycast={noRaycast}
        renderOrder={1002}
        position={[0, 0.012, -length - barrelLength - 0.02]}
        visible={false}
      >
        <planeGeometry args={[0.22, 0.22]} />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 0, -length - barrelLength - 0.03]}
        intensity={0}
        distance={5}
        decay={2}
        color="#ffe9b0"
      />
    </group>
  );
}
