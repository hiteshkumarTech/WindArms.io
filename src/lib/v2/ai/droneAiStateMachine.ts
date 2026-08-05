import type { DroneAiRuntimeState, LegacyDroneAiDecision, LegacyDroneAiObservation, LegacyDroneAiRuntime, LegacyDroneMovementMode, Vec3Data } from './droneAiTypes';
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
 * SCOPE FENCE (9B, historical): originally preserved the five-state
 * behaviour byte-for-byte, including its own quirks — see each function's
 * own comments for the specific legacy behaviours intentionally NOT "cleaned
 * up" that phase (per `docs/decisions.md`'s Step 9B entry).
 *
 * MILESTONE 9C — adds perception memory and the `investigating` state. This
 * is the ONE intentional, disclosed behaviour change since 9B: an
 * `engaging`/`attacking` drone that loses line-of-sight no longer either (a)
 * stays awkwardly `engaging` forever while still inside `detectRadius` (the
 * old quirk), or (b) instantly reverts to ambient `searching` the moment it
 * exceeds `detectRadius`. Instead, after `losLossConfirmMs` of CONTINUOUS
 * loss (any cause — cover or pure distance, no longer distinguished), it
 * enters `investigating`: moves toward the last confirmed position, cannot
 * fire, and either reacquires (LOS returns → back to `engaging` immediately)
 * or times out (`investigateDurationMs` elapses → `searching`, memory
 * cleared). See this file's own `decideLegacyDroneAi` doc comment for the
 * full transition design and ordering, and `docs/decisions.md`'s Step 9C
 * entry for why this specific ordering was chosen. Every OTHER path
 * (spawning, normal search/acquire, visible engagement, distance bands,
 * strafe timing, cooldown, windup, firing, stun, destruction, reset quirks)
 * is unchanged from 9B — proven by `droneAiLegacyParity.test.ts`'s frozen
 * legacy oracle, whose comparison timeline never exercises LOS loss.
 *
 * `phase` (the hover-bob/search-wander angle) deliberately stays OUTSIDE this
 * module's runtime, owned by the adapter exactly as it is today — the legacy
 * code's own `resetInternal()` never touches it (a real, confirmed quirk: a
 * restart reseeds `lastFireAt` but leaves `phase`/`strafeDir`/`strafeFlipAt`
 * completely untouched), and the actual search-wander VECTOR MATH
 * (`Math.sin(phase)*0.4`, etc.) is Three.js-adjacent position math that
 * belongs in the adapter per this phase's own "movement formulas stay in the
 * adapter" instruction. This module only tells the adapter WHICH movement
 * mode applies each tick (now including `'investigate'` — see
 * `LegacyDroneAiDecision.movementTarget`).
 *
 * MILESTONE 9E — adds the acquisition-reaction gate: a genuine acquisition
 * (`searching`→`engaging`, or `investigating`→`engaging` reacquisition —
 * never `attacking`→`engaging`) now seeds `runtime.reactionReadyAtMs = now +
 * observation.acquireReactionDelayMs`, and the attack block's own
 * windup-start check additionally requires `now >= reactionReadyAtMs`.
 * Medium's `acquireReactionDelayMs` is always exactly 0, so
 * `reactionReadyAtMs` is seeded to the CURRENT tick and the gate is
 * trivially already satisfied — the existing same-tick
 * spawning→searching→engaging→attacking cascade is completely unaffected
 * for Medium. `investigateDurationMs` (observation) is unchanged in shape,
 * only its upstream source moved (see `droneAiTypes.ts`'s own doc comment).
 * No new AI state, no burst/shot-count concept, nothing presentation-related
 * added here — see `droneAiTelegraph.ts` (a wholly separate, adapter-facing
 * module) for the new visual telegraph layer this phase also introduces.
 *
 * MILESTONE 9F — the attack block gains ONE additional, OPTIONAL gate:
 * `observation.recoveryBlocksAttack` (default falsy — see that field's own
 * doc comment in `droneAiTypes.ts` for the full contract). This is the
 * ONLY change 9F makes to this file: two conditions added to the existing
 * windup-start/abort `if`/`else if` pair, nothing else. `DroneAiRuntimeState`
 * is UNCHANGED (still exactly six values) — 9F's own stuck-recovery overlay
 * (`droneAiStuckRecovery.ts`) is a fully separate, adapter-owned runtime
 * this file never imports and knows nothing about; it only ever reads this
 * one boolean the adapter derives from that overlay's own `recoveryActive`
 * flag. Every pre-9F test/call site is unaffected (the field is optional,
 * `undefined` behaves identically to its prior absence).
 *
 * MILESTONE 9G — the attack block gains a SECOND additional, OPTIONAL gate
 * of the exact same shape: `observation.coordinationBlocksAttack` (default
 * falsy — see that field's own doc comment in `droneAiTypes.ts`). This is
 * the ONLY change 9G makes to this file: the same two `if`/`else if`
 * conditions extended once more, nothing else. `DroneAiRuntimeState` remains
 * UNCHANGED (still exactly six values) — 9G's own squad attack-permit
 * coordinator (`droneAiSquad.ts`) is a fully separate, squad-owned runtime
 * this file never imports and knows nothing about; it only ever reads this
 * one boolean the adapter derives from that coordinator's own per-tick
 * permit result. Every pre-9G test/call site is unaffected.
 */

/** A player-life generation no real `matchStore.respawnNonce` value can ever equal (it only ever counts up from 0) — see `LegacyDroneAiRuntime.observedPlayerGeneration`'s own doc comment. */
const NEVER_OBSERVED_PLAYER_GENERATION = -1;

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
      lastKnownTargetPosition: null,
      lastSeenTargetAtMs: null,
      losLostStartedAtMs: null,
      investigateUntilMs: null,
      observedPlayerGeneration: NEVER_OBSERVED_PLAYER_GENERATION,
      reactionReadyAtMs: null,
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
    // Milestone 9C — every perception-memory field clears on reset, exactly
    // like every other verified 9B reset quirk it sits alongside: only
    // `lastFireAtMs` is reseeded above; `strafeDirection`/`strafeFlipAtMs`
    // carry over unchanged (existing quirk); memory is new state that has no
    // pre-9B precedent, so it simply starts fresh every life, same as
    // `windupUntilMs`/`stunnedUntilMs` above. `observedPlayerGeneration`
    // resets to the "never observed" sentinel rather than trying to thread
    // the caller's current generation through this call — see that field's
    // own doc comment in `droneAiTypes.ts`.
    lastKnownTargetPosition: null,
    lastSeenTargetAtMs: null,
    losLostStartedAtMs: null,
    investigateUntilMs: null,
    observedPlayerGeneration: NEVER_OBSERVED_PLAYER_GENERATION,
    // Milestone 9E — no pending reaction wait carries into a new life, same
    // "starts fresh every life" treatment as the 9C memory fields above.
    reactionReadyAtMs: null,
  };
}

/**
 * Milestone 9G.1 — the SINGLE shared attack-eligibility predicate, now used
 * by BOTH this file's own attack block (`decideLegacyDroneAi`, below) AND
 * the adapter's read-only preview (`DroneEnemy.tsx`'s `prepareAttackRequest()`,
 * which the squad coordinator consults BEFORE this function ever runs this
 * tick). Extracted specifically to close the drift risk a duplicated
 * predicate would otherwise carry between the two call sites — a surgical
 * refactor, not a redesign: mathematically proven equivalent to the
 * pre-extraction inline expressions it replaces (see `docs/decisions.md`'s
 * 9G.1 entry for the full proof), confirmed byte-identical by every
 * pre-existing state-machine/parity test passing unmodified. Pure,
 * deterministic, no RNG, no clock read — every timestamp/flag is an
 * explicit input, matching this whole file's own established convention.
 *
 * Answers exactly one question: "would this drone attack THIS TICK if
 * nothing squad-level blocked it?" — deliberately EXCLUDES
 * `coordinationBlocksAttack` itself, since the squad coordinator needs
 * exactly this answer BEFORE it can decide whether to grant a permit in the
 * first place (folding `coordinationBlocksAttack` in here would be
 * circular). The real attack block ANDs `!observation.coordinationBlocksAttack`
 * on top of this function's own result, never inside it.
 *
 * Folds together, in one expression, both of the legacy code's own
 * previously-separate gates: the OUTER "may attack processing happen at all
 * this tick" gate (state/stunned/canSeePlayer/recoveryBlocksAttack) AND the
 * INNER "may a NEW windup begin" gate (reactionReady, cooldown elapsed) —
 * via `(state === 'attacking' || (reactionReady && cooldownElapsed))`. This
 * is DELIBERATELY not the same as ANDing `reactionReady`/`cooldownElapsed`
 * unconditionally: an already-`attacking` drone's windup COMPLETION/firing
 * must never be re-gated by either check (only windup START is gated,
 * exactly matching the legacy code's own two-separate-`if` structure and
 * proven by a dedicated permanent regression test —
 * `droneAiStateMachine.test.ts`'s "reaction gate does not block windup
 * COMPLETION/firing" — forcing a stale/never-satisfied `reactionReadyAtMs`
 * onto an already-`attacking` runtime and confirming firing still occurs).
 * The `(state === 'attacking' || ...)` short-circuit is what makes this
 * true: once `state === 'attacking'`, neither `reactionReady` nor
 * `cooldownElapsed` is evaluated at all for the purpose of this predicate.
 */
export function evaluateAttackReadiness(input: {
  state: DroneAiRuntimeState;
  stunned: boolean;
  canSeePlayer: boolean;
  recoveryBlocksAttack: boolean;
  reactionReadyAtMs: number | null;
  nowMs: number;
  lastFireAtMs: number;
  fireIntervalMs: number;
}): boolean {
  const reactionReady = input.reactionReadyAtMs === null || input.nowMs >= input.reactionReadyAtMs;
  const cooldownElapsed = input.nowMs - input.lastFireAtMs >= input.fireIntervalMs;
  return (
    (input.state === 'engaging' || input.state === 'attacking') &&
    !input.stunned &&
    input.canSeePlayer &&
    !input.recoveryBlocksAttack &&
    (input.state === 'attacking' || (reactionReady && cooldownElapsed))
  );
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
    targetAcquired: false,
    movementMode: 'destroyed-hold',
    movementTarget: null,
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
 *
 * MILESTONE 9C block order (all new blocks marked below), and WHY this exact
 * ordering — see `docs/decisions.md`'s Step 9C entry for the full trace-level
 * justification, summarized here:
 *
 * 1. Destruction (unchanged, 9B).
 * 2. Player-generation invalidation (NEW) — runs before anything else can
 *    read/act on stale memory, so a drone can never carry a previous life's
 *    last-known position into any decision this tick.
 * 3. Hit-flash/stun (unchanged, 9B).
 * 4. Spawn scale-in (unchanged, 9B).
 * 5. Visible-target memory update (NEW) — unconditional on `canSeePlayer`,
 *    independent of `state`, so the same-tick spawning→searching→engaging
 *    cascade (9B) can still pick up fresh memory on its very first visible
 *    tick.
 * 6. Search/engage/investigate cascade (NEW, replaces 9B's 2-line quirk) —
 *    reacquire (investigating→engaging) is immediate; the LOS-loss
 *    confirmation timer STARTS the instant visibility is lost while
 *    `engaging` OR `attacking` (so an `attacking` drone's confirmation
 *    window begins on the exact tick loss occurs, not one tick later once
 *    the attack-block abort below has already dropped it to `engaging`);
 *    the actual transition to `investigating` still only fires from
 *    `engaging` (an `attacking` drone must abort to `engaging` first, via
 *    the existing 9B abort branch in the attack block below — the
 *    RECOMMENDED design from this phase's own brief, chosen over an
 *    immediate `attacking`→`investigating` shortcut because it reuses the
 *    already-verified abort path instead of adding a second one). MILESTONE
 *    9E extends this block: EVERY genuine `searching`→`engaging` or
 *    `investigating`→`engaging` transition also seeds
 *    `reactionReadyAtMs = now + observation.acquireReactionDelayMs` and sets
 *    the one-shot `targetAcquired` decision fact — never on the
 *    `attacking`→`engaging` transitions the attack block (step 9) makes.
 * 7. Movement mode + strafe-flip (extended with an `investigate` branch —
 *    no strafe-flip logic runs there, so investigating never consumes RNG).
 * 8. Facing (unchanged, 9B — still `engaging`/`attacking` only; the adapter
 *    derives investigate-facing from `movementTarget` itself).
 * 9. Attack block (unchanged shape since 9B, extended by 9E) — still the
 *    sole place `attacking` drops to `engaging` on LOS loss/stun; still the
 *    sole place a shot can fire, and its own `&& observation.canSeePlayer`
 *    guard already made "no fire on an invisible-target tick" true even
 *    before this phase. MILESTONE 9E adds one further condition to the
 *    windup-START check only (never to windup-completion/firing, and never
 *    to the abort branch): `now >= reactionReadyAtMs` (or no reaction wait
 *    pending at all). Medium's `reactionReadyAtMs` is always seeded to the
 *    current tick (0ms delay), so this is trivially satisfied immediately —
 *    Medium's own same-tick acquire→windup cascade is unaffected.
 */
export function decideLegacyDroneAi(runtime: LegacyDroneAiRuntime, observation: LegacyDroneAiObservation, rng: RandomSource): LegacyDroneAiDecision {
  const now = observation.nowMs;

  // --- 1. Destruction — highest precedence, matches the legacy code's own
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

  // --- 2. Milestone 9C — player-generation invalidation. A drone can never
  // carry a previous player life's last-known position/investigation across
  // a death+respawn. `spawning`/`destroyed` are untouched (nothing to
  // invalidate yet/ever); `investigating`/`engaging`/`attacking` all
  // collapse directly to `searching` — not merely `engaging` — because the
  // memory that would have made `engaging` meaningful was just cleared, so
  // there is nothing left to "engage" against until a fresh acquisition.
  // Consumes zero RNG. Does not touch HP, position, strafe fields, RNG
  // stream, or `lifeGeneration` (the DRONE's own life counter — a distinct
  // concept from the PLAYER's life generation this block reacts to).
  let state = runtime.state;
  let lastKnownTargetPosition = runtime.lastKnownTargetPosition;
  let lastSeenTargetAtMs = runtime.lastSeenTargetAtMs;
  let losLostStartedAtMs = runtime.losLostStartedAtMs;
  let investigateUntilMs = runtime.investigateUntilMs;
  let observedPlayerGeneration = runtime.observedPlayerGeneration;
  let generationInvalidatedAttack = false;
  // Milestone 9E — the acquisition-reaction deadline. Cleared alongside the
  // other memory fields on generation invalidation below (a fresh life has
  // nothing pending to react to); re-seeded only by a genuine acquisition in
  // step 6.
  let reactionReadyAtMs = runtime.reactionReadyAtMs;

  if (observation.playerGeneration !== observedPlayerGeneration) {
    observedPlayerGeneration = observation.playerGeneration;
    lastKnownTargetPosition = null;
    lastSeenTargetAtMs = null;
    losLostStartedAtMs = null;
    investigateUntilMs = null;
    reactionReadyAtMs = null;
    if (state === 'investigating' || state === 'engaging' || state === 'attacking') {
      if (state === 'attacking') generationInvalidatedAttack = true;
      state = 'searching';
    }
  }

  // --- 3. Hit flash / stun (unchanged, 9B). A flash while ALREADY stunned
  // does NOT extend the deadline — matches `if (flashing && state.stunnedUntil
  // < now)` exactly: repeated hits during an active stun are absorbed, not
  // stacked.
  const flashing = now < observation.hitFlashUntilMs;
  let stunnedUntilMs = runtime.stunnedUntilMs;
  if (flashing && stunnedUntilMs < now) stunnedUntilMs = now + observation.stunMs;
  const stunned = now < stunnedUntilMs;

  // --- 4. Spawn scale-in / spawning->searching transition (unchanged, 9B).
  let spawnProgress = 1;
  if (state === 'spawning') {
    const t = observation.spawnDurationMs > 0 ? (now - runtime.spawnedAtMs) / observation.spawnDurationMs : 1;
    spawnProgress = Math.min(1, t);
    if (t >= 1) state = 'searching';
  }

  // --- 5. Milestone 9C — visible-target memory update. Unconditional on
  // `canSeePlayer`, independent of `state` — a fresh, in-place NUMERIC COPY
  // every time (never a reference to `observation.targetPosition`, so later
  // caller-side mutation of that object can never alter stored memory).
  // Consumes zero RNG.
  if (observation.canSeePlayer) {
    lastKnownTargetPosition = { x: observation.targetPosition.x, y: observation.targetPosition.y, z: observation.targetPosition.z };
    lastSeenTargetAtMs = now;
    losLostStartedAtMs = null;
  }

  // --- 6. Milestone 9C — search/engage/investigate cascade (replaces 9B's
  // "stay engaging forever while still inside detectRadius" quirk — see
  // docs/decisions.md's Step 9C entry for the full replacement rationale).
  // Milestone 9E — both branches below are the ONLY two genuine-acquisition
  // sites in this whole function: each seeds a fresh `reactionReadyAtMs` and
  // sets `targetAcquired` exactly once.
  let targetAcquired = false;
  if (state === 'searching' && observation.canSeePlayer) {
    state = 'engaging';
    reactionReadyAtMs = now + observation.acquireReactionDelayMs;
    targetAcquired = true;
  }
  if (state === 'investigating' && observation.canSeePlayer) {
    // Reacquisition — immediate, same tick. `lastKnownTargetPosition` was
    // already refreshed to the current visible position in step 5 above;
    // `lastFireAtMs` is untouched here (no free shot, no cooldown reset —
    // time spent investigating still counts toward the next cooldown,
    // exactly as if the drone had stayed `engaging` the whole time). 9E: a
    // NEW `reactionReadyAtMs` deadline IS seeded here — reacquiring after a
    // period of investigating is still a genuine acquisition, so it still
    // gates the next windup start, even though it grants no free shot.
    state = 'engaging';
    investigateUntilMs = null;
    reactionReadyAtMs = now + observation.acquireReactionDelayMs;
    targetAcquired = true;
  }

  // LOS-loss confirmation timer — starts the instant visibility is lost
  // while `engaging` OR `attacking` (so an `attacking` drone's window begins
  // on the true loss tick, not delayed until the attack-block abort below
  // has already dropped it to `engaging`).
  if (!observation.canSeePlayer && (state === 'engaging' || state === 'attacking')) {
    if (losLostStartedAtMs === null) losLostStartedAtMs = now;
  }

  // The actual transition to `investigating` only fires from `engaging` —
  // an `attacking` drone must abort to `engaging` first (the attack block
  // below, unchanged from 9B). One-frame flicker never reaches here: the
  // step-5 visible branch clears `losLostStartedAtMs` the instant sight
  // returns, so a blip well under `losLossConfirmMs` never accumulates.
  if (state === 'engaging' && losLostStartedAtMs !== null && now - losLostStartedAtMs >= observation.losLossConfirmMs) {
    if (lastKnownTargetPosition !== null) {
      state = 'investigating';
      investigateUntilMs = now + observation.investigateDurationMs;
    } else {
      // Defensive: reaching a confirmed loss with no memory should not be
      // possible (memory is set on every visible tick, and `engaging` is
      // never entered without one), but fails safely to `searching` rather
      // than an `investigating` state with nothing to investigate.
      state = 'searching';
    }
    losLostStartedAtMs = null;
  }

  // Investigate timeout — gives up and returns to ambient searching,
  // clearing all memory. Arrival-radius stopping is a MOVEMENT-only detail
  // (see `DroneEnemy.tsx`) and deliberately does NOT end this state early —
  // an arrived drone keeps waiting/investigating until reacquire or timeout.
  if (state === 'investigating' && investigateUntilMs !== null && now >= investigateUntilMs) {
    state = 'searching';
    lastKnownTargetPosition = null;
    lastSeenTargetAtMs = null;
    losLostStartedAtMs = null;
    investigateUntilMs = null;
  }

  // --- 7. Movement mode + strafe-flip timer (extended with `investigate`).
  // Stunned takes priority over EVERY other branch, exactly matching the
  // legacy `if(stunned){}else if(...)` structure — a spawning-but-stunned
  // drone (the hit-sphere is live even before scale-in completes) reports
  // 'stunned-hold', not 'spawn-hold'.
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
  } else if (state === 'investigating') {
    // No strafe-flip logic here by design — investigating is direct
    // steering toward memory, not combat positioning, and must consume
    // zero RNG (per this phase's own "no arbitrary investigation RNG" gate).
    movementMode = 'investigate';
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

  // Fresh copy for the adapter — never a reference to the runtime's own
  // stored memory object, so adapter-side mutation (e.g. reusing a scratch
  // Vector3) can never corrupt what this drone remembers.
  const movementTarget: Vec3Data | null =
    movementMode === 'investigate' && lastKnownTargetPosition
      ? { x: lastKnownTargetPosition.x, y: lastKnownTargetPosition.y, z: lastKnownTargetPosition.z }
      : null;

  // --- 8. Facing (unchanged, 9B). Independent of the stunned overlay —
  // matches the legacy `if (engaging || attacking) group.lookAt(...)` check,
  // which runs unconditionally on state alone, AFTER the movement block,
  // never gated by `stunned`. Still only `engaging`/`attacking` — while
  // `investigating`, the adapter faces `movementTarget` instead (see
  // `DroneEnemy.tsx`), not `facePlayer`.
  const facePlayer = state === 'engaging' || state === 'attacking';

  // --- 9. Attack (unchanged shape since 9B). Two SEQUENTIAL `if`s (not
  // else-if) between "start windup" and "complete windup", matching the
  // legacy structure exactly — with the current WINDUP_MS constant this
  // never fires same-tick, but the structure is preserved rather than
  // collapsed, in case that constant ever changes. The `&&
  // observation.canSeePlayer` guard on the first `if` already made "no fire
  // on an invisible-target tick" true since 9B — unchanged, still true here.
  // MILESTONE 9E — the windup-START check (only) gains one further AND
  // condition: `reactionReady`. Windup-COMPLETION/firing below and the abort
  // branch are both untouched — the reaction gate only ever decides whether
  // a windup is allowed to BEGIN, never whether an in-progress one finishes
  // or aborts.
  let windupUntilMs = runtime.windupUntilMs;
  let lastFireAtMs = runtime.lastFireAtMs;
  let startWindup = false;
  let abortWindup = generationInvalidatedAttack;
  let fireExactlyOnce = false;
  let aimSpread: { x: number; y: number; z: number } | null = null;

  // Milestone 9G.1 — `attackEligible` replaces the two separate inline
  // boolean expressions (outer gate + inner windup-start gate) the
  // legacy/9E/9F/9G code used previously, via the SHARED
  // `evaluateAttackReadiness()` predicate above — the same function
  // `DroneEnemy.tsx`'s `prepareAttackRequest()` now calls, closing the
  // duplicated-predicate drift risk 9G's own first pass disclosed. Proven
  // byte-identical to the pre-extraction code (see that function's own doc
  // comment, and `docs/decisions.md`'s 9G.1 entry): for an already-`attacking`
  // drone, `attackEligible` reduces to exactly `!stunned && canSeePlayer &&
  // !recoveryBlocksAttack` — `reactionReady`/`cooldownElapsed` are NEVER
  // consulted once already attacking, so windup completion/firing is never
  // re-gated by them, exactly matching the legacy structure (confirmed by a
  // dedicated permanent regression test that forces a stale
  // `reactionReadyAtMs` onto an already-`attacking` runtime).
  // `coordinationBlocksAttack` (Milestone 9G) is deliberately NOT part of
  // the shared predicate itself (see that function's own doc comment) —
  // folded in here, on top, exactly as `recoveryBlocksAttack` already is
  // inside the predicate: a drone without a currently-granted squad
  // attack-permit lease can neither START nor CONTINUE a windup, and any
  // IN-PROGRESS windup aborts through this same pre-existing branch —
  // still no new branch, no behaviour change at all when the field is
  // omitted/false (every pre-9G caller).
  const attackEligible = evaluateAttackReadiness({
    state,
    stunned,
    canSeePlayer: observation.canSeePlayer,
    recoveryBlocksAttack: observation.recoveryBlocksAttack ?? false,
    reactionReadyAtMs,
    nowMs: now,
    lastFireAtMs,
    fireIntervalMs: observation.fireIntervalMs,
  });

  if (attackEligible && !observation.coordinationBlocksAttack) {
    if (state === 'engaging') {
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
  } else if (state === 'attacking' && (!attackEligible || observation.coordinationBlocksAttack)) {
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
    lastKnownTargetPosition,
    lastSeenTargetAtMs,
    losLostStartedAtMs,
    investigateUntilMs,
    observedPlayerGeneration,
    reactionReadyAtMs,
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
    targetAcquired,
    movementMode,
    movementTarget,
    facePlayer,
  };
}
