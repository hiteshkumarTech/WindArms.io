'use client';

import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';
import { DRONE } from '@/lib/v2/play/enemyConfig';
import { createTargetUserData, type TargetUserData } from '@/lib/v2/combat/targets';
import { resolveDroneConfig } from '@/lib/v2/play/difficulty';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';
import { OCCLUDERS } from '@/lib/v2/play/spawnConfig';
import type { DroneAiState, DroneSpawnDef } from '@/lib/v2/play/types';
import { createLegacyDroneRuntime, decideLegacyDroneAi, evaluateAttackReadiness, resetLegacyDroneRuntime } from '@/lib/v2/ai/droneAiStateMachine';
import { createSeededRandomSource, deriveDroneSeed, type RandomSource } from '@/lib/v2/ai/droneAiRandom';
import { evaluateDronePerception, DRONE_PERCEPTION_MEMORY } from '@/lib/v2/ai/droneAiPerception';
import { resolveDroneMovementIntent, type DroneMovementIntent, type DroneSpatialSnapshot } from '@/lib/v2/ai/droneAiMovementIntent';
import type { DroneAiDifficultyProfile } from '@/lib/v2/ai/droneAiDifficulty';
import { resolveDroneTelegraph, DRONE_COMBAT_TELEGRAPH } from '@/lib/v2/ai/droneAiTelegraph';
import type { DroneTargetSnapshot, LegacyDroneAiObservation, LegacyDroneAiRuntime, Vec3Data } from '@/lib/v2/ai/droneAiTypes';
import { DRONE_ARENA_CONFIG } from '@/lib/v2/ai/droneArenaConfig';
import { constrainDronePosition, type DroneConstraintResult } from '@/lib/v2/ai/droneAiArenaConstraints';
import {
  createDroneStuckRecoveryRuntime,
  resetDroneStuckRecoveryRuntime,
  clearActiveDroneStuckRecovery,
  onDroneStunned,
  onDroneDestroyed,
  resolveDroneStuckRecovery,
  type DroneStuckRecoveryRuntime,
  type DroneStuckSample,
} from '@/lib/v2/ai/droneAiStuckRecovery';
import { DRONE_MUZZLE_LOCAL_OFFSET } from './droneVisualConfig';
import type { DroneBoltHandle } from './DroneBoltPool';
import type { DroneAttackPermit, DroneAttackRequest } from '@/lib/v2/ai/droneAiSquad';

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
 *
 * MILESTONE 9D — movement formulas (search/investigate/engage/attack) no
 * longer live inline here. They moved to the pure, renderer-independent
 * `resolveDroneMovementIntent()` (`lib/v2/ai/droneAiMovementIntent.ts`),
 * which this file's `update()` now calls with a fresh observation, exactly
 * mirroring how it already calls `decideLegacyDroneAi()` for STATE. No
 * behaviour change for a drone with no nearby neighbours (see that module's
 * own no-neighbour legacy-parity test suite) — the ONE new, disclosed
 * behaviour is local XZ separation, which nudges the resulting direction
 * apart when another living drone is close, so drones stop stacking into
 * one visual blob. `writeSpatialSnapshot()` is the new second handle method
 * `DroneSquad.tsx` calls in its own new PASS 1 (before ANY drone in the
 * squad moves this substep — see that file's own doc comment) so every
 * drone's separation math this tick sees the same pre-movement snapshot
 * set, not an order-biased mix of already-moved and not-yet-moved
 * neighbours.
 *
 * MILESTONE 9E — `update()` now takes the richer `DroneAiDifficultyProfile`
 * (`profile`, extends the old `ResolvedDroneConfig`) instead of a bare
 * config, and reads two NEW fields from it every tick:
 * `acquireReactionDelayMs` (fed into the observation, gates the pure core's
 * own windup-start decision — see `droneAiStateMachine.ts`) and
 * `targetMemoryDurationMs` (replaces the old flat
 * `DRONE_PERCEPTION_MEMORY.investigateDurationMs` read as the observation's
 * `investigateDurationMs`). This file also gains a small, adapter-owned
 * visual-telegraph layer: `acquirePulseUntilRef`/`fireFlashUntilRef` arm on
 * the pure core's own one-shot `targetAcquired`/`fireExactlyOnce` decision
 * facts, then feed (together with the runtime's own `reactionReadyAtMs`/
 * `windupUntilMs`) into the pure `resolveDroneTelegraph()`
 * (`lib/v2/ai/droneAiTelegraph.ts`), which now owns the eye-emissive-
 * intensity decision this file used to compute with an inline ternary, plus
 * a new preallocated muzzle-flash mesh (`muzzleRef`, created once in this
 * component's own JSX below, never per-shot). Presentation still never
 * feeds back into combat truth — the telegraph resolver only ever READS
 * decision/runtime fields the pure state machine already produces.
 *
 * MILESTONE 9F — two new pure modules slot into `update()`'s existing
 * movement section, AFTER `resolveDroneMovementIntent()` has already
 * resolved this tick's base+separation intent and BEFORE that intent is
 * committed to `positionRef`: `constrainDronePosition()`
 * (`droneAiArenaConstraints.ts`) clamps the PROPOSED next position against
 * the route-specific `DRONE_ARENA_CONFIG` (horizontal envelope, altitude
 * band, Wind Lift exclusion) before it is ever committed; the resulting
 * committed-vs-intended displacement then feeds
 * `resolveDroneStuckRecovery()` (`droneAiStuckRecovery.ts`), a fully
 * separate, adapter-owned `DroneStuckRecoveryRuntime` held ALONGSIDE (never
 * merged into) `runtimeRef`'s own six-state `LegacyDroneAiRuntime` — see
 * that module's own doc comment for the full "overlay, not a seventh state"
 * architecture. While recovery is ACTIVE (nudging/backing-away/altitude-
 * correcting/teleport-fallback), it OVERRIDES this tick's movement vector
 * and sets the new, optional `LegacyDroneAiObservation.recoveryBlocksAttack`
 * field (see `droneAiTypes.ts`'s own doc comment on that field) — the ONLY
 * change 9F makes to the pure state machine's own attack-gating contract.
 * `lastPlayerGenerationRef` (new) mirrors the pure core's own
 * `observedPlayerGeneration` sentinel pattern to detect a player death/
 * respawn from OUTSIDE that module, since this recovery runtime is not
 * something `droneAiStateMachine.ts` knows how to invalidate itself.
 *
 * MILESTONE 9G — adds a THIRD handle method, `prepareAttackRequest`, called
 * by `DroneSquad.tsx` in a new PASS run BEFORE `update()` each substep (see
 * that file's own doc comment for the full three-phase pass order:
 * spatial-snapshot capture -> attack-request preparation -> squad-level
 * coordination -> per-drone commit). `prepareAttackRequest` mirrors
 * `writeSpatialSnapshot`'s own "reused output object, no allocation, no
 * mutation of stored refs" convention exactly — it computes this tick's
 * perception (`evaluateDronePerception`, the SAME call `update()` already
 * makes) and this drone's own attack-eligibility predicate (a deliberate,
 * disclosed, read-only DUPLICATE of `droneAiStateMachine.ts`'s own attack-
 * block gate — state/stunned/canSeePlayer/recoveryBlocksAttack/reactionReady/
 * cooldown — see that method's own doc comment for why this duplication is
 * safe: it can only ever ADD a restriction via the coordinator's resulting
 * permit, never replace or bypass the real gate, which is re-evaluated
 * live, independently, inside `decideLegacyDroneAi` itself every tick). The
 * resulting `DroneAttackRequest` is squad-coordinated
 * (`resolveDroneSquadCoordination`, `droneAiSquad.ts`) into a
 * `DroneAttackPermit` BEFORE `update()` runs this same substep; `update()`
 * then folds `!permit.granted` into the new, optional
 * `LegacyDroneAiObservation.coordinationBlocksAttack` field (see
 * `droneAiTypes.ts`'s own doc comment) — the ONLY new input this phase feeds
 * into the pure state machine, mirroring `recoveryBlocksAttack`'s own 9F
 * precedent exactly. `update()`'s OWN signature gains one new trailing
 * parameter, `permit`, for this purpose.
 */
export interface DroneHandle {
  /** Called by DroneSquad, possibly several times per rendered frame (once per fixed-step substep — see fixedStep.ts), with the shared player target snapshot (position/alive/generation — one object, reused every substep, never a per-drone camera read), the shared bolt pool, the difficulty-resolved combat/cadence profile (Milestone 9E — HP baked in at spawn/reset time; the rest read live here), this substep's pre-movement squad spatial snapshot (see `writeSpatialSnapshot` below), and (Milestone 9G) this substep's already-resolved attack permit (see `prepareAttackRequest` below). `simulationDeltaS` is always exactly one fixed substep, never a raw/variable frame delta. Returns true once destroyed (for squad bookkeeping). */
  update: (
    targetSnapshot: DroneTargetSnapshot,
    simulationDeltaS: number,
    now: number,
    bolts: DroneBoltHandle,
    profile: DroneAiDifficultyProfile,
    neighbours: readonly DroneSpatialSnapshot[],
    permit: DroneAttackPermit,
  ) => boolean;
  reset: () => void;
  getState: () => DroneAiState;
  /** Milestone 9D — writes this drone's CURRENT tactical (never hover-bobbed) position/state into a caller-provided, reused snapshot object — no allocation here. Called by `DroneSquad.tsx`'s own PASS 1, once per drone, before PASS 2's `update()` calls begin. */
  writeSpatialSnapshot: (out: DroneSpatialSnapshot) => void;
  /** Milestone 9G — writes this drone's own attack-permit REQUEST for this substep into a caller-provided, reused output object — no allocation here, no mutation of any stored ref (see this file's own doc comment above). Called by `DroneSquad.tsx`'s own new PASS between PASS 1 (`writeSpatialSnapshot`) and PASS 2 (`update`), once per drone, before the squad-level coordination call. */
  prepareAttackRequest: (targetSnapshot: DroneTargetSnapshot, now: number, profile: DroneAiDifficultyProfile, out: DroneAttackRequest) => void;
}

interface DroneMaterials {
  hull: THREE.MeshStandardMaterial;
  ringMarble: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
  /** Milestone 9E — the preallocated muzzle-flash visual's own material (see `muzzleRef` below). Transparent so `resolveDroneTelegraph()`'s `muzzleFlashProgress` can drive a fade via `.opacity`, never via allocating a new material per shot. */
  muzzleFlash: THREE.MeshBasicMaterial;
}

function createMaterials(): DroneMaterials {
  return {
    hull: new THREE.MeshStandardMaterial({ color: '#2a3342', metalness: 0.8, roughness: 0.4 }),
    ringMarble: new THREE.MeshStandardMaterial({ color: '#E9E5DB', metalness: 0.25, roughness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ color: STORM.gold, metalness: 0.95, roughness: 0.25 }),
    eye: new THREE.MeshStandardMaterial({ color: '#06222f', emissive: new THREE.Color(STORM.energy), emissiveIntensity: 1.4, toneMapped: false }),
    muzzleFlash: new THREE.MeshBasicMaterial({ color: STORM.energy, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
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

/** Milestone 9F — below this magnitude, a movement-intent vector is treated as "no meaningful movement requested" for the stuck detector's own `wantsMovement` gate (Section 10's "intentional hold blocks accumulation"). Purely a numerical-stability threshold, far smaller than any real search/engage/investigate speed. */
const MOVEMENT_INTENT_EPSILON = 1e-6;

const DroneEnemy = forwardRef<DroneHandle, { spawn: DroneSpawnDef }>(function DroneEnemy({ spawn }, ref) {
  const groupRef = useRef<THREE.Group>(null);
  const rotorRef = useRef<THREE.Mesh>(null);
  const eyeRef = useRef<THREE.Mesh>(null);
  const muzzleRef = useRef<THREE.Mesh>(null);
  const materials = useMemo(createMaterials, []);

  // Milestone 9E — adapter-owned presentation deadlines for the telegraph
  // resolver's one-shot cues (0 = inactive, matching `TargetUserData`'s own
  // "0 = no active window" convention). Set only on the tick the
  // corresponding pure-core event fires (`decision.targetAcquired` /
  // `decision.fireExactlyOnce`) — never read or written by
  // `droneAiStateMachine.ts` itself, per Rule 4 ("presentation must never
  // drive combat truth"). Mirrors `phaseRef`'s own existing "adapter owns
  // presentation-only state across ticks" pattern.
  const acquirePulseUntilRef = useRef(0);
  const fireFlashUntilRef = useRef(0);

  const scratch = useMemo(() => ({ toPlayer: new THREE.Vector3(), origin: new THREE.Vector3(), aim: new THREE.Vector3() }), []);

  // Milestone 9D — reused plain-data scratch for the pure movement-intent
  // call: one intent object (mutated in place by `resolveDroneMovementIntent`'s
  // own `output` parameter) plus two reused `Vec3Data` position mirrors, so
  // calling into the pure module every substep allocates nothing beyond what
  // the pure module's own internal vector arithmetic already needs.
  const movementIntentRef = useRef<DroneMovementIntent>({
    mode: 'hold',
    desiredDirection: { x: 0, y: 0, z: 0 },
    speedMps: 0,
    faceTarget: false,
    facingTarget: null,
    separationDirection: { x: 0, y: 0, z: 0 },
    separationStrength: 0,
  });
  const selfPosDataRef = useRef<Vec3Data>({ x: 0, y: 0, z: 0 });
  const homePosDataRef = useRef<Vec3Data>({ x: 0, y: 0, z: 0 });

  // Milestone 9F — reused plain-data scratch for the proposed-position/
  // arena-constraint call, mirroring `selfPosDataRef`/`homePosDataRef`'s own
  // "one reused object, never reallocated" convention.
  const proposedPosDataRef = useRef<Vec3Data>({ x: 0, y: 0, z: 0 });
  const constraintResultRef = useRef<DroneConstraintResult>({ position: { x: 0, y: 0, z: 0 }, horizontalClamped: false, altitudeClamped: false, forbiddenZoneCorrected: false, correctionDistanceM: 0, blockedDisplacementM: 0 });

  // Adapter-owned movement/presentation state — never part of the pure
  // core's own runtime (see this file's own doc comment above).
  const positionRef = useRef(new THREE.Vector3(...spawn.position));
  const homeRef = useRef(new THREE.Vector3(...spawn.position));

  // Milestone 9F — this drone's own stuck-recovery overlay runtime, held
  // ENTIRELY separately from `runtimeRef`'s six-state `LegacyDroneAiRuntime`
  // (see `droneAiStuckRecovery.ts`'s own doc comment on why this is an
  // overlay, not a seventh AI state). `lastPlayerGenerationRef` mirrors the
  // pure core's own `observedPlayerGeneration` sentinel (`-1` = never
  // observed) so THIS adapter can independently detect a player death/
  // respawn and clear the recovery runtime accordingly (Section 20) — the
  // pure state machine has no way to reach into a module it does not import.
  const recoveryRuntimeRef = useRef<DroneStuckRecoveryRuntime>(createDroneStuckRecoveryRuntime({ x: spawn.position[0], y: spawn.position[1], z: spawn.position[2] }));
  const lastPlayerGenerationRef = useRef<number>(-1);

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
    // Milestone 9E — presentation-only cue deadlines reset alongside every
    // other per-life field above; a fresh life starts with no pending
    // acquire pulse or fire flash carried over from the previous one.
    acquirePulseUntilRef.current = 0;
    fireFlashUntilRef.current = 0;
    // Milestone 9F — a full life reset clears EVERY stuck-recovery field,
    // including attempt/teleport counts (mirrors `resetLegacyDroneRuntime`'s
    // own "starts fresh every life" convention — contrast with
    // `clearActiveDroneStuckRecovery`, used on a player-generation change
    // alone, which deliberately RETAINS those counts).
    recoveryRuntimeRef.current = resetDroneStuckRecoveryRuntime({ x: homeRef.current.x, y: homeRef.current.y, z: homeRef.current.z });
    lastPlayerGenerationRef.current = -1;
    if (groupRef.current) {
      groupRef.current.visible = true;
      groupRef.current.scale.setScalar(0.001);
    }
  };

  useImperativeHandle(ref, () => ({
    update(targetSnapshot, simulationDeltaS, now, bolts, profile, neighbours, permit) {
      const group = groupRef.current;
      if (!group) return runtimeRef.current.state === 'destroyed';

      // Milestone 9F — player-generation (death/respawn) detection, owned
      // entirely by this adapter since `droneAiStuckRecovery.ts` has no way
      // to reach into a module it does not import. Mirrors the pure core's
      // own `observedPlayerGeneration` sentinel pattern (`-1` = never
      // observed) — the harmless first-tick "clear" this produces at mount
      // is a no-op (recovery is already freshly idle then).
      if (targetSnapshot.generation !== lastPlayerGenerationRef.current) {
        lastPlayerGenerationRef.current = targetSnapshot.generation;
        recoveryRuntimeRef.current = clearActiveDroneStuckRecovery(recoveryRuntimeRef.current, { x: positionRef.current.x, y: positionRef.current.y, z: positionRef.current.z });
      }

      // Milestone 9F — this tick's recovery-derived flags, read from the
      // runtime as it stood at the END of the PREVIOUS substep (this tick's
      // own recovery decision is only made further down, AFTER movement
      // commits — see this file's own doc comment on the required order).
      // `recoveryBlocksAttackThisTick` feeds the observation below — the
      // ONE new input `droneAiStateMachine.ts` reads from this phase.
      const recoveryPhase = recoveryRuntimeRef.current.phase;
      const recoveryMovementActive = recoveryPhase === 'nudging' || recoveryPhase === 'backing-away' || recoveryPhase === 'altitude-correcting';
      const pendingTeleportTarget = recoveryPhase === 'teleport-fallback' ? recoveryRuntimeRef.current.teleportTarget : null;
      const recoveryBlocksAttackThisTick = recoveryMovementActive || pendingTeleportTarget !== null;

      // Spin rotor + bob regardless of AI state (until destroyed) — gated on
      // the PRE-tick state, matching the legacy code exactly: a same-tick
      // newly-destroyed transition still gets one more phase/rotor advance
      // this frame, since this check runs before the decision call below.
      if (runtimeRef.current.state !== 'destroyed') {
        if (rotorRef.current) rotorRef.current.rotation.y += simulationDeltaS * 6;
        phaseRef.current += simulationDeltaS * DRONE.HOVER_HZ * Math.PI * 2;
      }

      const { toPlayer, origin, aim } = scratch;
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
        fireIntervalMs: profile.fireIntervalMs,
        spawnDurationMs: DRONE.SPAWN_SCALE_MS,
        attackWindupMs: profile.attackWindupMs,
        destroyShrinkMs: DRONE.DESTROY_SHRINK_MS,
        stunMs: DRONE.STUN_MS,
        aimSpreadDeg: profile.aimSpreadDeg,
        losLossConfirmMs: DRONE_PERCEPTION_MEMORY.losLossConfirmMs,
        // Milestone 9E — difficulty-scaled (was the flat DRONE_PERCEPTION_MEMORY
        // constant through 9D); see droneAiDifficulty.ts's own doc comment.
        investigateDurationMs: profile.targetMemoryDurationMs,
        acquireReactionDelayMs: profile.acquireReactionDelayMs,
        // Milestone 9F — see droneAiTypes.ts's own doc comment on this field.
        recoveryBlocksAttack: recoveryBlocksAttackThisTick,
        // Milestone 9G — see droneAiTypes.ts's own doc comment on this field.
        // `permit` was already resolved by DroneSquad's own squad-level
        // coordination call THIS substep, before this update() call — see
        // this file's own top doc comment for the exact pass order.
        coordinationBlocksAttack: !permit.granted,
      };

      const decision = decideLegacyDroneAi(runtimeRef.current, observation, rngRef.current);
      runtimeRef.current = decision.runtime;

      if (decision.requestRecordDestroyed) {
        useV2MatchStore.getState().recordDroneDestroyed();
        // Milestone 9F — explicit clear on the exact tick destruction is
        // first detected (Section 19). Behaviourally redundant with this
        // file's own early-return-on-destroyed below (the recovery runtime
        // is never read again until `resetInternal()`), but explicit per
        // the brief.
        recoveryRuntimeRef.current = onDroneDestroyed(recoveryRuntimeRef.current);
      }

      // Milestone 9E — visual telegraph. `acquirePulseUntilRef`/
      // `fireFlashUntilRef` are armed here, exactly on the tick the
      // corresponding pure-core one-shot event fires, then fed (already
      // possibly-expired) into the pure `resolveDroneTelegraph()` resolver
      // alongside the runtime's own `reactionReadyAtMs`/`windupUntilMs`. This
      // replaces the old inline hit/attacking/idle eye-intensity ternary —
      // `resolveDroneTelegraph()` now owns that decision, extended with the
      // new acquire/reaction/windup-ramp/fire/cooldown phases.
      if (decision.targetAcquired) acquirePulseUntilRef.current = now + DRONE_COMBAT_TELEGRAPH.acquirePulseMs;
      if (decision.fireExactlyOnce) fireFlashUntilRef.current = now + DRONE_COMBAT_TELEGRAPH.fireFlashMs;

      const telegraph = resolveDroneTelegraph({
        nowMs: now,
        state: decision.state,
        hitFlashUntilMs: userData.hitFlashUntil,
        acquirePulseUntilMs: acquirePulseUntilRef.current,
        reactionReadyAtMs: decision.runtime.reactionReadyAtMs,
        windupUntilMs: decision.runtime.windupUntilMs,
        attackWindupMs: profile.attackWindupMs,
        fireFlashUntilMs: fireFlashUntilRef.current,
      });

      if (eyeRef.current) (eyeRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = telegraph.eyeEmissiveIntensity;
      if (muzzleRef.current) {
        muzzleRef.current.visible = telegraph.muzzleFlashVisible;
        if (telegraph.muzzleFlashVisible) {
          muzzleRef.current.scale.setScalar(0.4 + 0.6 * (1 - telegraph.muzzleFlashProgress));
          materials.muzzleFlash.opacity = 1 - telegraph.muzzleFlashProgress;
        }
      }


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

      // --- Movement — Milestone 9D: delegated to the pure, renderer-
      // independent `resolveDroneMovementIntent()`. Byte-identical to the
      // pre-9D inline formulas for every mode when no neighbour is close
      // enough to influence separation (proven by
      // `droneAiMovementIntent.test.ts`'s own no-neighbour legacy-parity
      // suite) — the ONE new, disclosed behaviour is local XZ separation.
      // `selfPosDataRef`/`homePosDataRef` are reused plain-data mirrors of
      // the THREE.Vector3 refs (never reallocated); `movementIntentRef` is
      // likewise reused via `resolveDroneMovementIntent`'s own `output`
      // parameter — this call allocates nothing beyond its own internal
      // vector arithmetic.
      selfPosDataRef.current.x = positionRef.current.x;
      selfPosDataRef.current.y = positionRef.current.y;
      selfPosDataRef.current.z = positionRef.current.z;
      homePosDataRef.current.x = homeRef.current.x;
      homePosDataRef.current.y = homeRef.current.y;
      homePosDataRef.current.z = homeRef.current.z;

      const movementIntent = resolveDroneMovementIntent(
        {
          legacyMovementMode: decision.movementMode,
          state: decision.state,
          selfId: spawn.id,
          selfPosition: selfPosDataRef.current,
          homePosition: homePosDataRef.current,
          patrolRadiusM: spawn.patrolRadius,
          targetPosition: targetSnapshot.position,
          investigationPosition: decision.movementTarget,
          strafeDirection: decision.runtime.strafeDirection,
          rangeMinM: DRONE.RANGE_MIN,
          rangeMaxM: DRONE.RANGE_MAX,
          approachSpeedMps: profile.approachSpeed,
          retreatSpeedMps: profile.retreatSpeed,
          strafeSpeedMps: profile.strafeSpeed,
          searchReturnSpeedMps: DRONE.STRAFE_SPEED,
          searchPhase: phaseRef.current,
          facePlayer: decision.facePlayer,
          neighbours,
        },
        movementIntentRef.current,
      );

      // Milestone 9F — required movement-application order (see this file's
      // own doc comment): (1) base+separation intent already resolved above
      // is unchanged; (2) stun takes the highest movement priority of all
      // (Section 18) — zero movement, any active recovery aborts to
      // cooldown; (3) otherwise select normal OR active-recovery movement;
      // (4) compute the proposed position; (5) apply arena constraints;
      // (6) commit; (7) measure actual displacement; (8) feed the stuck
      // detector. Hover bob (render-only, step 9) and facing (step 10) are
      // unchanged, still applied AFTER the tactical position is committed.
      const stuckContext = { droneId: spawn.id, homePosition: homePosDataRef.current, speedMps: movementIntent.speedMps, config: DRONE_ARENA_CONFIG };

      if (decision.stunned) {
        // Stunned drones never move (movementIntent is already zero via the
        // pure core's own 'stunned-hold' mode) — arena constraints/recovery
        // are not evaluated at all this tick, only the stun-abort hook runs.
        recoveryRuntimeRef.current = onDroneStunned(recoveryRuntimeRef.current, now);
      } else if (pendingTeleportTarget) {
        // Teleport fallback — apply directly, bypassing normal integration/
        // constraint (the target was already validated by
        // droneAiStuckRecovery.ts itself against DRONE_ARENA_CONFIG before
        // ever being offered). No bolt, no muzzle flash, no spread RNG, no
        // HP/RNG-stream change — this substep only ever moves the drone.
        positionRef.current.set(pendingTeleportTarget.x, pendingTeleportTarget.y, pendingTeleportTarget.z);
        const teleportSample: DroneStuckSample = {
          nowMs: now,
          wantsMovement: false,
          expectedDisplacementM: 0,
          actualDisplacementM: 0,
          requestedDirection: { x: 0, y: 0, z: 0 },
          actualDisplacement: { x: 0, y: 0, z: 0 },
          horizontalClamped: false,
          altitudeClamped: false,
          forbiddenZoneCorrected: false,
        };
        recoveryRuntimeRef.current = resolveDroneStuckRecovery(recoveryRuntimeRef.current, teleportSample, {
          ...stuckContext,
          currentPosition: { x: positionRef.current.x, y: positionRef.current.y, z: positionRef.current.z },
        }).runtime;
      } else {
        const overrideDir = recoveryMovementActive ? recoveryRuntimeRef.current.activeDirection : null;
        const overrideSpeed = recoveryMovementActive ? recoveryRuntimeRef.current.activeSpeedMps : 0;
        const effX = overrideDir ? overrideDir.x * overrideSpeed : movementIntent.desiredDirection.x;
        const effY = overrideDir ? overrideDir.y * overrideSpeed : movementIntent.desiredDirection.y;
        const effZ = overrideDir ? overrideDir.z * overrideSpeed : movementIntent.desiredDirection.z;

        proposedPosDataRef.current.x = selfPosDataRef.current.x + effX * simulationDeltaS;
        proposedPosDataRef.current.y = selfPosDataRef.current.y + effY * simulationDeltaS;
        proposedPosDataRef.current.z = selfPosDataRef.current.z + effZ * simulationDeltaS;

        const constraintResult = constrainDronePosition(
          { droneId: spawn.id, currentPosition: selfPosDataRef.current, proposedPosition: proposedPosDataRef.current, config: DRONE_ARENA_CONFIG },
          constraintResultRef.current,
        );
        positionRef.current.set(constraintResult.position.x, constraintResult.position.y, constraintResult.position.z);

        const actualDx = positionRef.current.x - selfPosDataRef.current.x;
        const actualDy = positionRef.current.y - selfPosDataRef.current.y;
        const actualDz = positionRef.current.z - selfPosDataRef.current.z;
        const intentMagnitude = Math.sqrt(movementIntent.desiredDirection.x ** 2 + movementIntent.desiredDirection.y ** 2 + movementIntent.desiredDirection.z ** 2);

        const sample: DroneStuckSample = {
          nowMs: now,
          // "Wants movement" always reflects the drone's own real TACTICAL
          // intent (never the recovery override) — an idle/holding drone
          // must never accumulate a detector window merely because recovery
          // happens to be moving it (recovery ticks don't feed the outer
          // idle-phase detector anyway — see droneAiStuckRecovery.ts).
          wantsMovement: intentMagnitude > MOVEMENT_INTENT_EPSILON,
          expectedDisplacementM: intentMagnitude * simulationDeltaS,
          actualDisplacementM: Math.sqrt(actualDx ** 2 + actualDy ** 2 + actualDz ** 2),
          requestedDirection: movementIntent.desiredDirection,
          actualDisplacement: { x: actualDx, y: actualDy, z: actualDz },
          horizontalClamped: constraintResult.horizontalClamped,
          altitudeClamped: constraintResult.altitudeClamped,
          forbiddenZoneCorrected: constraintResult.forbiddenZoneCorrected,
        };

        recoveryRuntimeRef.current = resolveDroneStuckRecovery(recoveryRuntimeRef.current, sample, {
          ...stuckContext,
          currentPosition: { x: positionRef.current.x, y: positionRef.current.y, z: positionRef.current.z },
        }).runtime;
      }

      const bob = Math.sin(phaseRef.current) * DRONE.HOVER_AMP;
      group.position.set(positionRef.current.x, positionRef.current.y + bob, positionRef.current.z);

      if (movementIntent.faceTarget && movementIntent.facingTarget) group.lookAt(movementIntent.facingTarget.x, movementIntent.facingTarget.y, movementIntent.facingTarget.z);

      if (decision.fireExactlyOnce && decision.aimSpread) {
        origin.copy(positionRef.current).addScaledVector(toPlayer, 0.5);
        aim.copy(targetSnapshot.position).sub(origin).normalize();
        aim.x += decision.aimSpread.x;
        aim.y += decision.aimSpread.y;
        aim.z += decision.aimSpread.z;
        bolts.spawn(origin, aim, profile.boltSpeed, profile.boltDamage);
      }

      return false;
    },
    reset: resetInternal,
    getState: () => runtimeRef.current.state,
    // Milestone 9G.1 — see this file's own top doc comment. `wantsAttack`
    // now calls `evaluateAttackReadiness()` (`droneAiStateMachine.ts`) — the
    // SAME shared pure predicate `decideLegacyDroneAi`'s own real attack
    // block calls — rather than a hand-duplicated boolean expression. This
    // closes the drift risk 9G's own first pass disclosed: both call sites
    // now share ONE implementation, so they cannot diverge by construction.
    // Reads ONLY: `groupRef`/`runtimeRef`/`userData` (all pre-decision, as
    // they stood at the end of the PREVIOUS tick — this call happens BEFORE
    // this tick's own `decideLegacyDroneAi`), `positionRef` (not yet moved
    // this substep — PASS "prepare" runs before PASS 2 movement), and
    // `recoveryRuntimeRef` (read-only, same field `update()` itself reads
    // for `recoveryBlocksAttackThisTick`). Mutates only the caller-provided
    // `out` — never a stored ref, never `runtimeRef`/`positionRef` themselves.
    prepareAttackRequest(targetSnapshot, now, profile, out) {
      const group = groupRef.current;
      if (!group || runtimeRef.current.state === 'destroyed' || userData.destroyedAt !== 0) {
        out.wantsAttack = false;
        return;
      }

      const perception = evaluateDronePerception({
        dronePosition: positionRef.current,
        targetPosition: targetSnapshot.position,
        detectionRadius: DRONE.DETECT_RADIUS,
        occluders: OCCLUDERS,
      });

      const flashing = now < userData.hitFlashUntil;
      let stunnedUntilMs = runtimeRef.current.stunnedUntilMs;
      if (flashing && stunnedUntilMs < now) stunnedUntilMs = now + DRONE.STUN_MS;
      const stunned = now < stunnedUntilMs;

      const recoveryPhase = recoveryRuntimeRef.current.phase;
      const recoveryBlocksAttack = recoveryPhase === 'nudging' || recoveryPhase === 'backing-away' || recoveryPhase === 'altitude-correcting' || recoveryPhase === 'teleport-fallback';

      const reactionReadyAtMs = runtimeRef.current.reactionReadyAtMs;

      out.wantsAttack = evaluateAttackReadiness({
        state: runtimeRef.current.state,
        stunned,
        canSeePlayer: perception.targetVisible,
        recoveryBlocksAttack,
        reactionReadyAtMs,
        nowMs: now,
        lastFireAtMs: runtimeRef.current.lastFireAtMs,
        fireIntervalMs: profile.fireIntervalMs,
      });
      out.dronePosition.x = positionRef.current.x;
      out.dronePosition.y = positionRef.current.y;
      out.dronePosition.z = positionRef.current.z;
      out.targetPosition.x = targetSnapshot.position.x;
      out.targetPosition.y = targetSnapshot.position.y;
      out.targetPosition.z = targetSnapshot.position.z;
      out.attackReadyAtMs = Math.max(runtimeRef.current.lastFireAtMs + profile.fireIntervalMs, reactionReadyAtMs ?? -Infinity);
    },
    writeSpatialSnapshot(out) {
      out.id = spawn.id;
      out.position.x = positionRef.current.x;
      out.position.y = positionRef.current.y;
      out.position.z = positionRef.current.z;
      out.state = runtimeRef.current.state;
      out.participatesInSeparation = runtimeRef.current.state !== 'destroyed';
    },
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
      {/*
        Milestone 9E.1 fix, Milestone 9E.2 hardening — preallocated
        muzzle-flash visual: created once here (never per-shot),
        toggled/scaled/faded every tick from `resolveDroneTelegraph()`'s
        output in `update()` above. No light, no shadow, no physics body.

        Positioned via `DRONE_MUZZLE_LOCAL_OFFSET` (`droneVisualConfig.ts`),
        NOT a raw JSX literal — see that module's own doc comment for the
        full `lookAt()`-facing-convention reasoning and
        `droneVisualConfig.test.ts` for the permanent regression guard (a
        negative-Z offset, the original shipped defect, is proven to fail
        the exact same geometric check that constant now passes).

        The existing eye mesh (just above) is authored at negative local Z
        and is UNCHANGED here — it predates Milestone 9E entirely and this
        same lookAt() quirk very likely affects it too, but that is a
        pre-existing, out-of-scope system this pass does not touch; see
        docs/decisions.md's 9E.1 entry for the full disclosure.
      */}
      <mesh ref={muzzleRef} material={materials.muzzleFlash} position={DRONE_MUZZLE_LOCAL_OFFSET} visible={false}>
        <sphereGeometry args={[0.16, 10, 8]} />
      </mesh>
    </group>
  );
});

export default DroneEnemy;
