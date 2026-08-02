'use client';

import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';
import { DRONE } from '@/lib/v2/play/enemyConfig';
import { createTargetUserData, type TargetUserData } from '@/lib/v2/combat/targets';
import { resolveDroneConfig, type ResolvedDroneConfig } from '@/lib/v2/play/difficulty';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';
import { OCCLUDERS } from '@/lib/v2/play/spawnConfig';
import type { DroneAiState, DroneSpawnDef } from '@/lib/v2/play/types';
import { createLegacyDroneRuntime, decideLegacyDroneAi, resetLegacyDroneRuntime } from '@/lib/v2/ai/droneAiStateMachine';
import { createSeededRandomSource, deriveDroneSeed, type RandomSource } from '@/lib/v2/ai/droneAiRandom';
import { evaluateDronePerception, DRONE_PERCEPTION_MEMORY } from '@/lib/v2/ai/droneAiPerception';
import type { DroneTargetSnapshot, LegacyDroneAiObservation, LegacyDroneAiRuntime } from '@/lib/v2/ai/droneAiTypes';
import type { DroneBoltHandle } from './DroneBoltPool';

/**
 * One hostile wind training-drone (Milestone 6). TEMPORARY gameplay target,
 * not character canon. Deliberately split: this file owns geometry +
 * per-frame visual presentation + side effects (all via refs — zero React
 * re-renders per frame), DroneBoltPool owns projectiles, matchStore owns
 * score. The Vortex fire system damages it through the shared
 * TargetUserData contract on its hit-sphere — no drone-specific weapon code.
 *
 * MILESTONE 9B — this component is now a THIN ADAPTER around the pure,
 * renderer-independent decision core (`lib/v2/ai/droneAiStateMachine.ts`).
 * All state-transition/timing/randomness logic that used to live inline
 * here has moved there — this file's own `update()` now does three things,
 * in order: (1) build an observation from the current Three.js/gameplay
 * state, (2) call `decideLegacyDroneAi()`, (3) apply the returned decision
 * using the exact same movement/presentation formulas this file always
 * used. No behaviour change is intended by that phase — see
 * `docs/decisions.md`'s Step 9B entry for the full parity methodology
 * (a captured pre-refactor browser trace, formula-level tape-replay tests,
 * and sequence/shape parity tests all confirm this).
 *
 * MILESTONE 9C — adds perception memory: `update()` now takes a single
 * `DroneTargetSnapshot` (position/alive/generation — see `DroneSquad.tsx`,
 * which builds ONE reusable snapshot per simulation tick and passes it to
 * every drone, never a per-drone camera read) instead of a bare
 * `THREE.Vector3` player position, and computes line-of-sight through the
 * new pure `evaluateDronePerception()` (still the same canonical rule,
 * still the same `segmentHitsBox` AABB algorithm, just factored out of this
 * file's own inline computation). A NEW `'investigate'` movement mode is
 * handled alongside the existing ones — the ONE intentional, disclosed
 * behaviour change this phase makes: see `droneAiStateMachine.ts`'s own doc
 * comment for the full design.
 *
 * `position`/`home`/`phase` deliberately stay OWNED HERE, not in the pure
 * core — the pure core only ever decides WHICH movement mode applies;
 * the actual `THREE.Vector3` math (search wander, strafe cross-product,
 * hover bob, investigate steering) is Three.js-adjacent and stays in this
 * adapter, exactly as `droneAiStateMachine.ts`'s own doc comment describes.
 * `phase` in particular is never touched by a reset, matching a confirmed
 * legacy quirk.
 *
 * AI is a deterministic state model — six real runtime states
 * (`DroneAiRuntimeState`): spawning → searching ⇄ engaging ⇄ investigating,
 * engaging → attacking → destroyed. "stunned" is a timed overlay, not a
 * discrete state — see the pure core's own doc comment. `types.ts`'s
 * `DroneAiState` now directly ALIASES this same union (9C resolved the
 * former mismatch — see that file's own comment).
 *
 * TIMING (Skyfront Trial timing cleanup, 2026-07-18 — unchanged since): two
 * different kinds of time flow through `update()`. Every cooldown/duration
 * (fire interval, windup, stun, spawn scale-in, destroy shrink, strafe-flip)
 * is measured against `now` — an absolute `performance.now()` REAL
 * timestamp DroneSquad reads once per rendered frame and passes in
 * unchanged. Only `simulationDeltaS` (translation, hover phase) is
 * frame-delta-accumulated, fed through DroneSquad's fixed-step accumulator.
 */
export interface DroneHandle {
  /** Called by DroneSquad, possibly several times per rendered frame (once per fixed-step substep — see fixedStep.ts), with the shared player target snapshot (position/alive/generation — one object, reused every substep, never a per-drone camera read), the shared bolt pool, and the difficulty-resolved combat numbers (HP baked in at spawn/reset time; the rest read live here). `simulationDeltaS` is always exactly one fixed substep, never a raw/variable frame delta. Returns true once destroyed (for squad bookkeeping). */
  update: (targetSnapshot: DroneTargetSnapshot, simulationDeltaS: number, now: number, bolts: DroneBoltHandle, config: ResolvedDroneConfig) => boolean;
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

/**
 * Step 9B seed-ownership pattern — a fixed, source-controlled namespace
 * combined with each drone's own stable ID and its current life generation
 * (see `deriveDroneSeed`'s own doc comment). Deliberately NOT a per-match
 * seed drawn from `matchStore.ts` — this phase's own brief explicitly rules
 * out modifying that protected file just to add one. A real per-match seed
 * (a fresh value each session) is a reasonable future enhancement, but is
 * not required for THIS phase's own reproducibility contract: what matters
 * now is that a given drone's Nth life always produces the same decision
 * trace given the same inputs, which this namespace + id + generation
 * combination already guarantees.
 */
const DRONE_AI_SEED_NAMESPACE = 0x9b_d20e;

const DroneEnemy = forwardRef<DroneHandle, { spawn: DroneSpawnDef }>(function DroneEnemy({ spawn }, ref) {
  const groupRef = useRef<THREE.Group>(null);
  const rotorRef = useRef<THREE.Mesh>(null);
  const eyeRef = useRef<THREE.Mesh>(null);
  const materials = useMemo(createMaterials, []);

  const scratch = useMemo(
    () => ({ toPlayer: new THREE.Vector3(), strafe: new THREE.Vector3(), desired: new THREE.Vector3(), origin: new THREE.Vector3(), aim: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }),
    [],
  );

  // Adapter-owned movement/presentation state — never part of the pure
  // core's own runtime (see this file's own doc comment above).
  const positionRef = useRef(new THREE.Vector3(...spawn.position));
  const homeRef = useRef(new THREE.Vector3(...spawn.position));

  // Pure-core state — built once at mount via `createLegacyDroneRuntime`,
  // replaced wholesale (never mutated in place) by every `decideLegacyDroneAi`/
  // `resetLegacyDroneRuntime` call. `rngRef` holds this drone's own private
  // `RandomSource` stream, reseeded (a fresh instance, never reused) on
  // every reset — see `resetInternal` below.
  const rngRef = useRef<RandomSource>(createSeededRandomSource(deriveDroneSeed({ matchSeed: DRONE_AI_SEED_NAMESPACE, droneId: spawn.id, lifeGeneration: 1 })));
  const initial = useMemo(() => createLegacyDroneRuntime(rngRef.current, performance.now(), DRONE.FIRE_INTERVAL_MS, 1), []); // eslint-disable-line react-hooks/exhaustive-deps
  const runtimeRef = useRef<LegacyDroneAiRuntime>(initial.runtime);
  const phaseRef = useRef<number>(initial.initialPhase);

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
    const config = resolveDroneConfig(useV2MatchStore.getState().selectedDifficulty);
    const nowMs = performance.now();
    const newGeneration = runtimeRef.current.lifeGeneration + 1;
    const newRng = createSeededRandomSource(deriveDroneSeed({ matchSeed: DRONE_AI_SEED_NAMESPACE, droneId: spawn.id, lifeGeneration: newGeneration }));
    rngRef.current = newRng;
    runtimeRef.current = resetLegacyDroneRuntime(runtimeRef.current, newRng, nowMs, config.fireIntervalMs);
    // `phase`/`strafeDirection`/`strafeFlipAtMs` deliberately untouched — a
    // confirmed legacy quirk (the original `resetInternal()` never re-rolls
    // them either), preserved exactly per this phase's own "do not clean up
    // legacy quirks" instruction.
    positionRef.current.copy(homeRef.current);
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
    update(targetSnapshot, simulationDeltaS, now, bolts, config) {
      const group = groupRef.current;
      if (!group) return runtimeRef.current.state === 'destroyed';

      // Spin rotor + bob regardless of AI state (until destroyed) — gated on
      // the PRE-tick state, matching the legacy code exactly: a same-tick
      // newly-destroyed transition still gets one more phase/rotor advance
      // this frame, since this check runs before the decision call below.
      if (runtimeRef.current.state !== 'destroyed') {
        if (rotorRef.current) rotorRef.current.rotation.y += simulationDeltaS * 6;
        phaseRef.current += simulationDeltaS * DRONE.HOVER_HZ * Math.PI * 2;
      }

      const { toPlayer, strafe, desired, origin, aim, up } = scratch;
      toPlayer.copy(targetSnapshot.position).sub(positionRef.current);
      toPlayer.normalize();

      // Milestone 9C — line-of-sight now goes through the pure, reusable
      // `evaluateDronePerception()` (same canonical rule, same `segmentHitsBox`
      // AABB algorithm as before, just no longer duplicated inline here).
      const perception = evaluateDronePerception({
        dronePosition: positionRef.current,
        targetPosition: targetSnapshot.position,
        detectionRadius: DRONE.DETECT_RADIUS,
        occluders: OCCLUDERS,
      });
      const distance = perception.distanceToTarget;
      const canSeePlayer = perception.targetVisible;

      const observation: LegacyDroneAiObservation = {
        nowMs: now,
        distance,
        canSeePlayer,
        targetPosition: targetSnapshot.position,
        playerGeneration: targetSnapshot.generation,
        destroyedAtMs: userData.destroyedAt,
        hitFlashUntilMs: userData.hitFlashUntil,
        detectRadius: DRONE.DETECT_RADIUS,
        fireIntervalMs: config.fireIntervalMs,
        spawnDurationMs: DRONE.SPAWN_SCALE_MS,
        attackWindupMs: DRONE.WINDUP_MS,
        destroyShrinkMs: DRONE.DESTROY_SHRINK_MS,
        stunMs: DRONE.STUN_MS,
        aimSpreadDeg: config.aimSpreadDeg,
        losLossConfirmMs: DRONE_PERCEPTION_MEMORY.losLossConfirmMs,
        investigateDurationMs: DRONE_PERCEPTION_MEMORY.investigateDurationMs,
      };

      const decision = decideLegacyDroneAi(runtimeRef.current, observation, rngRef.current);
      runtimeRef.current = decision.runtime;

      if (decision.requestRecordDestroyed) {
        useV2MatchStore.getState().recordDroneDestroyed();
      }

      // Hit flash (a SHORTER, separate window from the pure core's own
      // `stunned` overlay) drives the eye material directly — read here
      // exactly as the legacy code did, since this is presentation-only.
      const flashing = now < userData.hitFlashUntil;
      if (eyeRef.current) (eyeRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = flashing ? 3.2 : decision.state === 'attacking' ? 2.6 : 1.4;

      if (decision.state === 'destroyed') {
        if (decision.completeDestroyedPresentation) {
          group.visible = false;
          return true;
        }
        group.scale.setScalar(decision.destroyProgress);
        group.rotation.y += simulationDeltaS * 10;
        return false;
      }

      group.scale.setScalar(decision.state === 'spawning' ? decision.spawnProgress : 1);

      // --- Movement — formulas byte-identical to the legacy inline code
      // for every pre-9C mode, selected by the decided mode instead of a
      // re-checked state string. `investigate` is the one Milestone 9C
      // addition: direct 3D steering toward the remembered position (same
      // "never flattened to XZ" convention as approach/retreat), stopping
      // once within `investigateArrivalRadiusM` — arrival is a MOVEMENT-only
      // detail; it does not end the `investigating` STATE (see
      // `droneAiStateMachine.ts`).
      desired.set(0, 0, 0);
      if (decision.movementMode === 'search') {
        desired.copy(homeRef.current).sub(positionRef.current);
        if (desired.length() > spawn.patrolRadius) desired.normalize().multiplyScalar(DRONE.STRAFE_SPEED);
        else desired.set(Math.sin(phaseRef.current) * 0.4, 0, Math.cos(phaseRef.current * 0.7) * 0.4);
      } else if (decision.movementMode === 'engage' || decision.movementMode === 'attack') {
        if (distance < DRONE.RANGE_MIN) desired.copy(toPlayer).multiplyScalar(-config.retreatSpeed);
        else if (distance > DRONE.RANGE_MAX) desired.copy(toPlayer).multiplyScalar(config.approachSpeed);
        strafe.crossVectors(up, toPlayer).multiplyScalar(decision.runtime.strafeDirection * config.strafeSpeed);
        desired.add(strafe);
      } else if (decision.movementMode === 'investigate' && decision.movementTarget) {
        desired.set(decision.movementTarget.x, decision.movementTarget.y, decision.movementTarget.z).sub(positionRef.current);
        const distanceToMemory = desired.length();
        if (distanceToMemory > DRONE_PERCEPTION_MEMORY.investigateArrivalRadiusM) desired.normalize().multiplyScalar(config.approachSpeed);
        else desired.set(0, 0, 0);
      }
      // 'spawn-hold' / 'stunned-hold': desired stays (0,0,0), matching the
      // legacy code's own empty branches exactly.

      positionRef.current.addScaledVector(desired, simulationDeltaS);
      const bob = Math.sin(phaseRef.current) * DRONE.HOVER_AMP;
      group.position.set(positionRef.current.x, positionRef.current.y + bob, positionRef.current.z);

      if (decision.facePlayer) group.lookAt(targetSnapshot.position.x, targetSnapshot.position.y, targetSnapshot.position.z);
      else if (decision.movementMode === 'investigate' && decision.movementTarget) group.lookAt(decision.movementTarget.x, decision.movementTarget.y, decision.movementTarget.z);

      if (decision.fireExactlyOnce && decision.aimSpread) {
        origin.copy(positionRef.current).addScaledVector(toPlayer, 0.5);
        aim.copy(targetSnapshot.position).sub(origin).normalize();
        aim.x += decision.aimSpread.x;
        aim.y += decision.aimSpread.y;
        aim.z += decision.aimSpread.z;
        bolts.spawn(origin, aim, config.boltSpeed, config.boltDamage);
      }

      return false;
    },
    reset: resetInternal,
    getState: () => runtimeRef.current.state,
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
