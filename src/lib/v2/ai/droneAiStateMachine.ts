import type { LegacyDroneAiDecision, LegacyDroneAiObservation, LegacyDroneAiRuntime, LegacyDroneMovementMode } from './droneAiTypes';
import type { RandomSource } from './droneAiRandom';

/**
 * Milestone 9B — pure, renderer-independent extraction of `DroneEnemy.tsx`'s
 * existing inline decision logic. Every function here is a pure function of
 * its explicit inputs: no React, no R3F, no Three.js, no Rapier, no Zustand,
 * no calls to the system clock or the built-in random generator, no module-level mutable state.
 * `DroneEnemy.tsx` (the adapter) is the sole owner of side effects — spawning
 * a bolt, calling `recordDroneDestroyed()`, mutating `THREE.Vector3`/material
 * objects — this module only ever returns data describing what the adapter
 * should do.
 *
 * WHY A PURE CORE: this codebase has no React/R3F rendering test harness
 * (an established fact throughout this project's own test suite — see
 * `docs/decisions.md`), so decision logic trapped inside a `useImperativeHandle`
 * closure has never been unit-testable. Extracting it here makes every
 * transition, cooldown, and random-consumption call independently testable
 * with plain data, with zero behaviour change to what ships.
 *
 * SCOPE FENCE (9B, deliberate): this file preserves the CURRENT five-state
 * behaviour byte-for-byte, including its own quirks — see each function's own
 * comments for the specific legacy behaviours intentionally NOT "cleaned up"
 * this phase (per `docs/decisions.md`'s Step 9B entry).
 *
 * `phase` (the hover-bob/search-wander angle) deliberately stays OUTSIDE this
 * module's runtime, owned by the adapter exactly as it is today — the legacy
 * code's own `resetInternal()` never touches it (a real, confirmed quirk: a
 * restart reseeds `lastFireAt` but leaves `phase`/`strafeDir`/`strafeFlipAt`
 * completely untouched), and the actual search-wander VECTOR MATH
 * (`Math.sin(phase)*0.4`, etc.) is Three.js-adjacent position math that
 * belongs in the adapter per this phase's own "movement formulas stay in the
 * adapter" instruction. This module only tells the adapter WHICH movement
 * mode applies each tick.
 */

/** Legacy strafe-flip re-roll window, ms — `1400 + rand()*1600`, unchanged from `DroneEnemy.tsx`. */
const STRAFE_FLIP_MIN_MS = 1400;
const STRAFE_FLIP_JITTER_MS = 1600;

/**
 * Spawn/reset — builds a fresh runtime for a new life. `nowMs` is the
 * caller-supplied spawn timestamp (a system-clock-style value).
 *
 * Random-draw order, EXACTLY matching the legacy `ai` ref initializer
 * (`DroneEnemy.tsx`'s own four built-in-random calls, in this order):
 *   1. initial hover/search-wander phase seed (returned separately —
 *      see `initialPhase` below — since `phase` itself is adapter-owned)
 *   2. fire-interval desync jitter
 *   3. initial strafe direction (coin flip)
 *   4. initial strafe-flip deadline jitter
 *
 * `fireIntervalMs` is passed explicitly (not read from a config module) —
 * matches the legacy initializer's own use of the BASE `DRONE.FIRE_INTERVAL_MS`
 * constant for this one-time jitter (not the difficulty-resolved value the
 * rest of the loop uses — a real, confirmed legacy quirk: the desync jitter
 * at construction time uses the base constant regardless of difficulty,
 * while `resetInternal()`'s own jitter DOES use the difficulty-resolved
 * value — see `createLegacyDroneRuntime` vs `resetLegacyDroneRuntime` below).
 */
export function createLegacyDroneRuntime(
  rng: RandomSource,
  nowMs: number,
  baseFireIntervalMs: number,
  lifeGeneration: number,
): { runtime: LegacyDroneAiRuntime; initialPhase: number } {
  const initialPhase = rng.nextFloat() * Math.PI * 2;
  const lastFireAtMs = nowMs + rng.nextFloat() * baseFireIntervalMs;
  const strafeDirection: -1 | 1 = rng.nextFloat() < 0.5 ? 1 : -1;
  const strafeFlipAtMs = nowMs + 1500 + rng.nextFloat() * 1500;

  return {
    initialPhase,
    runtime: {
      state: 'spawning',
      spawnedAtMs: nowMs,
      lastFireAtMs,
      windupUntilMs: 0,
      stunnedUntilMs: 0,
      strafeDirection,
      strafeFlipAtMs,
      destroyShrinkFromMs: 0,
      lifeGeneration,
    },
  };
}

/**
 * Reset — mirrors `DroneEnemy.tsx`'s `resetInternal()` EXACTLY, including its
 * own real quirk: only `lastFireAtMs` is reseeded. `strafeDirection` and
 * `strafeFlipAtMs` are carried over UNCHANGED from whatever they were before
 * the reset — the legacy code never re-rolls them on restart, only at the
 * very first construction. `phase` (adapter-owned) must likewise be left
 * untouched by the caller on reset — this function has no opinion on it
 * since it never owned it.
 *
 * Uses the DIFFICULTY-RESOLVED `fireIntervalMs` (unlike `createLegacyDroneRuntime`'s
 * one-time construction jitter, which uses the base constant) — matches
 * `resetInternal()`'s own built-in-random-times-fireIntervalMs jitter exactly.
 */
export function resetLegacyDroneRuntime(previous: LegacyDroneAiRuntime, rng: RandomSource, nowMs: number, resolvedFireIntervalMs: number): LegacyDroneAiRuntime {
  return {
    state: 'spawning',
    spawnedAtMs: nowMs,
    lastFireAtMs: nowMs + rng.nextFloat() * resolvedFireIntervalMs,
    windupUntilMs: 0,
    stunnedUntilMs: 0,
    strafeDirection: previous.strafeDirection,
    strafeFlipAtMs: previous.strafeFlipAtMs,
    destroyShrinkFromMs: 0,
    lifeGeneration: previous.lifeGeneration + 1,
  };
}

function destroyedDecision(runtime: LegacyDroneAiRuntime, observation: LegacyDroneAiObservation, requestRecordDestroyed: boolean): LegacyDroneAiDecision {
  const t = observation.destroyShrinkMs > 0 ? (observation.nowMs - runtime.destroyShrinkFromMs) / observation.destroyShrinkMs : 1;
  return {
    runtime,
    state: 'destroyed',
    requestRecordDestroyed,
    destroyProgress: Math.max(0.001, 1 - t),
    completeDestroyedPresentation: t >= 1,
    spawnProgress: 1,
    stunned: false,
    startWindup: false,
    abortWindup: false,
    fireExactlyOnce: false,
    aimSpread: null,
    strafeFlipped: false,
    movementMode: 'destroyed-hold',
    facePlayer: false,
  };
}

/**
 * The one per-tick decision function — pure, deterministic given identical
 * `(runtime, observation, rng-state)`. Preserves the legacy code's exact
 * top-to-bottom fall-through ordering (a spawn→searching transition on this
 * same tick can immediately continue into the searching→engaging check,
 * exactly as the original single linear function does) rather than an
 * early-return-per-phase structure.
 */
export function decideLegacyDroneAi(runtime: LegacyDroneAiRuntime, observation: LegacyDroneAiObservation, rng: RandomSource): LegacyDroneAiDecision {
  const now = observation.nowMs;

  // --- Destruction — highest precedence, matches the legacy code's own
  // early-return structure exactly. Once destroyed, nothing else in this
  // function ever runs again for this life (only `resetLegacyDroneRuntime`
  // can bring a drone back to a living state).
  if (runtime.state === 'destroyed') {
    return destroyedDecision(runtime, observation, false);
  }
  if (observation.destroyedAtMs !== 0) {
    const newlyDestroyed: LegacyDroneAiRuntime = { ...runtime, state: 'destroyed', destroyShrinkFromMs: now };
    return destroyedDecision(newlyDestroyed, observation, true);
  }

  // --- Hit flash / stun. A flash while ALREADY stunned does NOT extend the
  // deadline — matches `if (flashing && state.stunnedUntil < now)` exactly:
  // repeated hits during an active stun are absorbed, not stacked.
  const flashing = now < observation.hitFlashUntilMs;
  let stunnedUntilMs = runtime.stunnedUntilMs;
  if (flashing && stunnedUntilMs < now) stunnedUntilMs = now + observation.stunMs;
  const stunned = now < stunnedUntilMs;

  // --- Spawn scale-in / spawning->searching transition.
  let state = runtime.state;
  let spawnProgress = 1;
  if (state === 'spawning') {
    const t = observation.spawnDurationMs > 0 ? (now - runtime.spawnedAtMs) / observation.spawnDurationMs : 1;
    spawnProgress = Math.min(1, t);
    if (t >= 1) state = 'searching';
  }

  // --- Search/engage state selection (uses the CURRENT, possibly
  // just-transitioned `state` — a same-tick spawning->searching->engaging
  // cascade is legacy-real and intentionally preserved).
  if (state === 'searching' && observation.canSeePlayer) state = 'engaging';
  // The legacy LOS quirk, preserved deliberately (see docs/decisions.md's
  // Step 9B entry and the Step 9A audit's own Section 7): losing LOS while
  // STILL inside detectRadius does NOT revert to searching — only losing
  // LOS *and* exceeding detectRadius does. A drone can sit "engaging" with
  // no real sightline, holding position/strafing, unable to fire, until one
  // of those two conditions changes. 9C will replace this with deliberate
  // investigate/target-memory behaviour; 9B must not "fix" it early.
  if (state === 'engaging' && !observation.canSeePlayer && observation.distance > observation.detectRadius) state = 'searching';

  // --- Movement mode + strafe-flip timer. Stunned takes priority over
  // EVERY other branch, exactly matching the legacy `if(stunned){}else if(...)`
  // structure — a spawning-but-stunned drone (the hit-sphere is live even
  // before scale-in completes) reports 'stunned-hold', not 'spawn-hold'.
  let strafeFlipped = false;
  let strafeDirection = runtime.strafeDirection;
  let strafeFlipAtMs = runtime.strafeFlipAtMs;
  let movementMode: LegacyDroneMovementMode;
  if (stunned) {
    movementMode = 'stunned-hold';
  } else if (state === 'spawning') {
    movementMode = 'spawn-hold';
  } else if (state === 'searching') {
    movementMode = 'search';
  } else {
    // engaging or attacking — identical movement treatment, matching the
    // legacy `else if (engaging || attacking)` branch exactly.
    movementMode = state === 'attacking' ? 'attack' : 'engage';
    if (now > strafeFlipAtMs) {
      strafeDirection = strafeDirection === 1 ? -1 : 1;
      strafeFlipAtMs = now + STRAFE_FLIP_MIN_MS + rng.nextFloat() * STRAFE_FLIP_JITTER_MS;
      strafeFlipped = true;
    }
  }

  // Facing is independent of the stunned overlay — matches the legacy
  // `if (engaging || attacking) group.lookAt(...)` check, which runs
  // unconditionally on state alone, AFTER the movement block, never gated
  // by `stunned`.
  const facePlayer = state === 'engaging' || state === 'attacking';

  // --- Attack. Two SEQUENTIAL `if`s (not else-if) between "start windup"
  // and "complete windup", matching the legacy structure exactly — with the
  // current WINDUP_MS constant this never fires same-tick, but the
  // structure is preserved rather than collapsed, in case that constant
  // ever changes.
  let windupUntilMs = runtime.windupUntilMs;
  let lastFireAtMs = runtime.lastFireAtMs;
  let startWindup = false;
  let abortWindup = false;
  let fireExactlyOnce = false;
  let aimSpread: { x: number; y: number; z: number } | null = null;

  if ((state === 'engaging' || state === 'attacking') && !stunned && observation.canSeePlayer) {
    if (state === 'engaging' && now - lastFireAtMs >= observation.fireIntervalMs) {
      state = 'attacking';
      windupUntilMs = now + observation.attackWindupMs;
      startWindup = true;
    }
    if (state === 'attacking' && now >= windupUntilMs) {
      const spreadRad = (observation.aimSpreadDeg * Math.PI) / 180;
      aimSpread = {
        x: (rng.nextFloat() - 0.5) * spreadRad,
        y: (rng.nextFloat() - 0.5) * spreadRad,
        z: (rng.nextFloat() - 0.5) * spreadRad,
      };
      fireExactlyOnce = true;
      lastFireAtMs = now;
      state = 'engaging';
    }
  } else if (state === 'attacking' && (stunned || !observation.canSeePlayer)) {
    // Abort — mirrors the legacy code exactly: only `state` changes.
    // `windupUntilMs` is deliberately left as-is (stale until the next real
    // windup start overwrites it) — it is never read while state !== 'attacking'.
    state = 'engaging';
    abortWindup = true;
  }

  const runtimeOut: LegacyDroneAiRuntime = {
    ...runtime,
    state,
    stunnedUntilMs,
    strafeDirection,
    strafeFlipAtMs,
    windupUntilMs,
    lastFireAtMs,
  };

  return {
    runtime: runtimeOut,
    state,
    requestRecordDestroyed: false,
    destroyProgress: 0,
    completeDestroyedPresentation: false,
    spawnProgress,
    stunned,
    startWindup,
    abortWindup,
    fireExactlyOnce,
    aimSpread,
    strafeFlipped,
    movementMode,
    facePlayer,
  };
}
