'use client';

import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';
import { DRONE } from '@/lib/v2/play/enemyConfig';
import { createTargetUserData, type TargetUserData } from '@/lib/v2/combat/targets';
import { resolveDroneConfig, type ResolvedDroneConfig } from '@/lib/v2/play/difficulty';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';
import { segmentOccluded } from '@/lib/v2/play/spawnConfig';
import type { DroneAiState, DroneSpawnDef } from '@/lib/v2/play/types';
import type { DroneBoltHandle } from './DroneBoltPool';

/**
 * One hostile wind training-drone (Milestone 6). TEMPORARY gameplay target,
 * not character canon. Deliberately split: this file owns geometry +
 * per-frame AI/movement (all via refs — zero React re-renders per frame),
 * DroneBoltPool owns projectiles, matchStore owns score. The Vortex fire
 * system damages it through the shared TargetUserData contract on its
 * hit-sphere — no drone-specific weapon code.
 *
 * AI is a deterministic state model (types.ts DroneAiState):
 *   inactive → spawning → searching ⇄ engaging → attacking → (stunned) → destroyed
 * "engaging" = seen the player, holding the preferred range band and
 * strafing; "attacking" = winding up + firing a bolt when it has LOS.
 */
export interface DroneHandle {
  /** Called by DroneSquad each frame with the player position, the shared bolt pool, and the difficulty-resolved combat numbers (HP baked in at spawn/reset time; the rest read live here). Returns true once destroyed (for squad bookkeeping). */
  update: (playerPos: THREE.Vector3, dt: number, now: number, bolts: DroneBoltHandle, config: ResolvedDroneConfig) => boolean;
  reset: () => void;
  getState: () => DroneAiState;
}

interface DroneMaterials {
  hull: THREE.MeshStandardMaterial;
  ringMarble: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
}

function createMaterials(): DroneMaterials {
  return {
    hull: new THREE.MeshStandardMaterial({ color: '#2a3342', metalness: 0.8, roughness: 0.4 }),
    ringMarble: new THREE.MeshStandardMaterial({ color: '#E9E5DB', metalness: 0.25, roughness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ color: STORM.gold, metalness: 0.95, roughness: 0.25 }),
    eye: new THREE.MeshStandardMaterial({ color: '#06222f', emissive: new THREE.Color(STORM.energy), emissiveIntensity: 1.4, toneMapped: false }),
  };
}

const DroneEnemy = forwardRef<DroneHandle, { spawn: DroneSpawnDef }>(function DroneEnemy({ spawn }, ref) {
  const groupRef = useRef<THREE.Group>(null);
  const rotorRef = useRef<THREE.Mesh>(null);
  const eyeRef = useRef<THREE.Mesh>(null);
  const materials = useMemo(createMaterials, []);

  const scratch = useMemo(
    () => ({ toPlayer: new THREE.Vector3(), strafe: new THREE.Vector3(), origin: new THREE.Vector3(), aim: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }),
    [],
  );

  // All AI lives in a ref — never React state (per the performance rule).
  const ai = useRef({
    state: 'spawning' as DroneAiState,
    position: new THREE.Vector3(...spawn.position),
    home: new THREE.Vector3(...spawn.position),
    phase: Math.random() * Math.PI * 2,
    spawnAt: performance.now(),
    lastFireAt: performance.now() + Math.random() * DRONE.FIRE_INTERVAL_MS, // desync jitter only — the real interval used to gate attacks is the per-frame `config.fireIntervalMs` passed into update()
    windupUntil: 0,
    stunnedUntil: 0,
    strafeDir: Math.random() < 0.5 ? 1 : -1,
    strafeFlipAt: performance.now() + 1500 + Math.random() * 1500,
    destroyShrinkFrom: 0,
  });

  // Shared damage contract — the fire system mutates this in place. Seeded
  // with the CURRENTLY selected difficulty's HP; corrected to the locked-in
  // selection by the guaranteed reset() on beginCountdown()/restart() before
  // combat starts, so a mid-'ready'-phase difficulty switch can never leave
  // a drone with the wrong max HP once the match is actually live.
  const userData = useMemo<TargetUserData>(
    () => createTargetUserData(resolveDroneConfig(useV2MatchStore.getState().selectedDifficulty).maxHp),
    [],
  );

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
    },
    [materials],
  );

  const resetInternal = () => {
    const state = ai.current;
    const config = resolveDroneConfig(useV2MatchStore.getState().selectedDifficulty);
    state.state = 'spawning';
    state.position.copy(state.home);
    state.spawnAt = performance.now();
    state.lastFireAt = performance.now() + Math.random() * config.fireIntervalMs;
    state.windupUntil = 0;
    state.stunnedUntil = 0;
    state.destroyShrinkFrom = 0;
    userData.hp = config.maxHp;
    userData.isTarget = true;
    userData.hitFlashUntil = 0;
    userData.destroyedAt = 0;
    if (groupRef.current) {
      groupRef.current.visible = true;
      groupRef.current.scale.setScalar(0.001);
    }
  };

  useImperativeHandle(ref, () => ({
    update(playerPos, dt, now, bolts, config) {
      const group = groupRef.current;
      const state = ai.current;
      if (!group) return state.state === 'destroyed';

      // Spin rotor + bob regardless of AI state (until destroyed).
      if (state.state !== 'destroyed') {
        if (rotorRef.current) rotorRef.current.rotation.y += dt * 6;
        state.phase += dt * DRONE.HOVER_HZ * Math.PI * 2;
      }

      // --- Destruction (driven by the shared userData the weapon mutates) ---
      if (userData.destroyedAt !== 0 && state.state !== 'destroyed') {
        state.state = 'destroyed';
        state.destroyShrinkFrom = now;
        useV2MatchStore.getState().recordDroneDestroyed();
      }
      if (state.state === 'destroyed') {
        const t = (now - state.destroyShrinkFrom) / DRONE.DESTROY_SHRINK_MS;
        if (t >= 1) {
          group.visible = false;
          return true;
        }
        group.scale.setScalar(Math.max(0.001, 1 - t));
        group.rotation.y += dt * 10;
        return false;
      }

      // Hit flash + stun (userData.hitFlashUntil set by the fire system).
      const flashing = now < userData.hitFlashUntil;
      if (eyeRef.current) (eyeRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = flashing ? 3.2 : state.state === 'attacking' ? 2.6 : 1.4;
      if (flashing && state.stunnedUntil < now) state.stunnedUntil = now + DRONE.STUN_MS;
      const stunned = now < state.stunnedUntil;

      // --- Spawn scale-in ---
      if (state.state === 'spawning') {
        const t = (now - state.spawnAt) / DRONE.SPAWN_SCALE_MS;
        group.scale.setScalar(Math.min(1, t));
        if (t >= 1) state.state = 'searching';
      } else {
        group.scale.setScalar(1);
      }

      const { toPlayer, strafe, origin, aim, up } = scratch;
      toPlayer.copy(playerPos).sub(state.position);
      const distance = toPlayer.length();
      toPlayer.normalize();

      const canSeePlayer =
        distance <= DRONE.DETECT_RADIUS &&
        !segmentOccluded([state.position.x, state.position.y, state.position.z], [playerPos.x, playerPos.y, playerPos.z]);

      // --- State selection ---
      if (state.state === 'searching' && canSeePlayer) state.state = 'engaging';
      if (state.state === 'engaging' && !canSeePlayer && distance > DRONE.DETECT_RADIUS) state.state = 'searching';

      // --- Movement ---
      const desired = new THREE.Vector3();
      if (stunned) {
        // hold position (stagger)
      } else if (state.state === 'searching') {
        // Idle patrol around home.
        desired.copy(state.home).sub(state.position);
        if (desired.length() > spawn.patrolRadius) desired.normalize().multiplyScalar(DRONE.STRAFE_SPEED);
        else desired.set(Math.sin(state.phase) * 0.4, 0, Math.cos(state.phase * 0.7) * 0.4);
      } else if (state.state === 'engaging' || state.state === 'attacking') {
        // Hold the preferred range band; strafe sideways.
        if (distance < DRONE.RANGE_MIN) desired.copy(toPlayer).multiplyScalar(-config.retreatSpeed);
        else if (distance > DRONE.RANGE_MAX) desired.copy(toPlayer).multiplyScalar(config.approachSpeed);
        if (now > state.strafeFlipAt) {
          state.strafeDir *= -1;
          state.strafeFlipAt = now + 1400 + Math.random() * 1600;
        }
        strafe.crossVectors(up, toPlayer).multiplyScalar(state.strafeDir * config.strafeSpeed);
        desired.add(strafe);
      }

      state.position.addScaledVector(desired, dt);
      // Hover bob on top of planar movement.
      const bob = Math.sin(state.phase) * DRONE.HOVER_AMP;
      group.position.set(state.position.x, state.position.y + bob, state.position.z);

      // Face the player when engaged, else drift-face travel direction.
      if (state.state === 'engaging' || state.state === 'attacking') {
        group.lookAt(playerPos.x, playerPos.y, playerPos.z);
      }

      // --- Attack ---
      if ((state.state === 'engaging' || state.state === 'attacking') && !stunned && canSeePlayer) {
        if (state.state === 'engaging' && now - state.lastFireAt >= config.fireIntervalMs) {
          state.state = 'attacking';
          // Windup (the readable pre-shot telegraph) is NOT difficulty-scaled — every shot stays equally dodgeable regardless of preset.
          state.windupUntil = now + DRONE.WINDUP_MS;
        }
        if (state.state === 'attacking' && now >= state.windupUntil) {
          origin.copy(state.position).addScaledVector(toPlayer, 0.5);
          // Aim with modest spread toward the player's chest.
          aim.copy(playerPos).sub(origin).normalize();
          const spread = (config.aimSpreadDeg * Math.PI) / 180;
          aim.x += (Math.random() - 0.5) * spread;
          aim.y += (Math.random() - 0.5) * spread;
          aim.z += (Math.random() - 0.5) * spread;
          bolts.spawn(origin, aim, config.boltSpeed, config.boltDamage);
          state.lastFireAt = now;
          state.state = 'engaging';
        }
      } else if (state.state === 'attacking' && (stunned || !canSeePlayer)) {
        state.state = 'engaging'; // abort wind-up if LOS lost or staggered
      }

      return false;
    },
    reset: resetInternal,
    getState: () => ai.current.state,
  }));

  // Initial scale-in start.
  useEffect(() => {
    if (groupRef.current) groupRef.current.scale.setScalar(0.001);
  }, []);

  return (
    <group ref={groupRef} position={spawn.position} userData={userData} name={`drone_${spawn.id}`}>
      {/* Hit sphere — invisible, carries the shared TargetUserData via the group above (raycast walks up to it) */}
      <mesh visible={false}>
        <sphereGeometry args={[0.62, 8, 8]} />
      </mesh>

      {/* Core hull */}
      <mesh material={materials.hull} castShadow>
        <icosahedronGeometry args={[0.32, 0]} />
      </mesh>
      {/* Marble outer ring (turbine housing) */}
      <mesh material={materials.ringMarble} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.5, 0.09, 10, 28]} />
      </mesh>
      {/* Gold accent ring */}
      <mesh material={materials.gold} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.5, 0.03, 8, 28]} />
      </mesh>
      {/* Spinning turbine blades */}
      <mesh ref={rotorRef} material={materials.hull}>
        <boxGeometry args={[0.86, 0.02, 0.08]} />
      </mesh>
      {/* Cyan eye, faces forward (-Z) */}
      <mesh ref={eyeRef} material={materials.eye} position={[0, 0, -0.3]}>
        <sphereGeometry args={[0.12, 12, 12]} />
      </mesh>
    </group>
  );
});

export default DroneEnemy;
