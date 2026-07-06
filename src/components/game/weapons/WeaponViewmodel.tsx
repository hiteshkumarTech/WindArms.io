'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WEAPONS } from '@shared/weapons';
import { fireSignal } from '@/lib/game/effectsBus';
import { localPose } from '@/lib/game/localPose';
import { useCombatStore } from '@/stores/combatStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWeaponStore } from '@/stores/weaponStore';

const noRaycast = () => null;

/** Rest offset of the gun in view space. */
const REST = { x: 0.26, y: -0.2, z: -0.48 };

/**
 * First-person procedural weapon. Parametric geometry driven by each
 * weapon's `visual` definition — no external models. Follows the camera
 * with bob (speed-based), sway (look deltas), recoil punch, reload dip
 * and switch raise. Renders above the world (depthTest off) so it never
 * clips into walls, and is invisible to raycasts.
 */
export default function WeaponViewmodel() {
  const groupRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const current = useWeaponStore((state) => state.current);
  const def = WEAPONS[current];

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
    lastWeapon: current,
  });

  const materials = useMemo(() => {
    const body = new THREE.MeshStandardMaterial({
      color: '#161b23',
      metalness: 0.85,
      roughness: 0.35,
      depthTest: false,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: '#0b0f15',
      metalness: 0.7,
      roughness: 0.5,
      depthTest: false,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: '#03161a',
      emissive: new THREE.Color(def.visual.accent),
      emissiveIntensity: 2.2,
      toneMapped: false,
      depthTest: false,
    });
    const flash = new THREE.MeshBasicMaterial({
      color: '#fff7d9',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    return { body, dark, accent, flash };
    // Rebuild when the weapon (and its accent color) changes.
  }, [def.visual.accent]);

  useFrame(({ camera }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const state = sim.current;
    const now = performance.now();
    const alive = useCombatStore.getState().alive;

    group.visible = document.pointerLockElement !== null && alive;
    if (!group.visible) return;

    // Weapon switch raise animation.
    if (state.lastWeapon !== current) {
      state.lastWeapon = current;
      state.raise = 1;
    }
    state.raise = Math.max(0, state.raise - delta * 5);

    // Fire feedback.
    if (fireSignal.nonce !== state.lastFireNonce) {
      state.lastFireNonce = fireSignal.nonce;
      state.punch = 1;
      state.flashUntil = now + 45;
    }
    state.punch = Math.max(0, state.punch - delta * 9);

    // Bob from movement speed; sway from look deltas.
    const speed = usePlayerStore.getState().speed;
    state.bobPhase += delta * (2 + speed * 1.1);
    const bobAmp = useSettingsStore.getState().viewBob ? Math.min(speed / 9, 1) * 0.012 : 0;

    const yawDelta = localPose.yaw - state.lastYaw;
    const pitchDelta = localPose.pitch - state.lastPitch;
    state.lastYaw = localPose.yaw;
    state.lastPitch = localPose.pitch;
    state.swayX = THREE.MathUtils.lerp(state.swayX, -yawDelta * 4, 1 - Math.exp(-10 * delta));
    state.swayY = THREE.MathUtils.lerp(state.swayY, pitchDelta * 4, 1 - Math.exp(-10 * delta));

    const reloading = useWeaponStore.getState().reloadingUntil !== 0;
    const reloadDip = reloading ? 0.14 : 0;

    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);
    group.translateX(REST.x + state.swayX + Math.cos(state.bobPhase) * bobAmp);
    group.translateY(
      REST.y + state.swayY + Math.abs(Math.sin(state.bobPhase)) * bobAmp * 1.4 - reloadDip - state.raise * 0.22,
    );
    group.translateZ(REST.z + state.punch * 0.07);
    group.rotateX(state.punch * 0.05 - reloadDip * 0.9 - state.raise * 0.4);

    // Muzzle flash visibility.
    const flashing = now < state.flashUntil;
    if (flashRef.current) {
      flashRef.current.visible = flashing;
      if (flashing) flashRef.current.rotation.z = Math.random() * Math.PI;
    }
    if (lightRef.current) lightRef.current.intensity = flashing ? 6 : 0;
  });

  const bulk = def.visual.bulk;
  const length = def.visual.length;

  return (
    <group ref={groupRef} renderOrder={1000} visible={false}>
      {/* Receiver */}
      <mesh material={materials.body} raycast={noRaycast} renderOrder={1000} position={[0, 0, -length / 2]}>
        <boxGeometry args={[0.075 * bulk, 0.095 * bulk, length]} />
      </mesh>
      {/* Barrel */}
      <mesh
        material={materials.dark}
        raycast={noRaycast}
        renderOrder={1000}
        position={[0, 0.012, -length - 0.09]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.018 * bulk, 0.018 * bulk, 0.22, 12]} />
      </mesh>
      {/* Magazine */}
      <mesh material={materials.dark} raycast={noRaycast} renderOrder={1000} position={[0, -0.09, -length * 0.45]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.05 * bulk, 0.13, 0.06 * bulk]} />
      </mesh>
      {/* Grip */}
      <mesh material={materials.dark} raycast={noRaycast} renderOrder={1000} position={[0, -0.08, -0.06]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[0.045 * bulk, 0.11, 0.05]} />
      </mesh>
      {/* Accent energy strip */}
      <mesh material={materials.accent} raycast={noRaycast} renderOrder={1001} position={[0, 0.055 * bulk, -length / 2]}>
        <boxGeometry args={[0.018, 0.012, length * 0.7]} />
      </mesh>
      {/* Muzzle flash quad + light */}
      <mesh
        ref={flashRef}
        material={materials.flash}
        raycast={noRaycast}
        renderOrder={1002}
        position={[0, 0.012, -length - 0.24]}
        visible={false}
      >
        <planeGeometry args={[0.22, 0.22]} />
      </mesh>
      <pointLight ref={lightRef} position={[0, 0, -length - 0.25]} intensity={0} distance={5} decay={2} color="#ffe9b0" />
    </group>
  );
}
