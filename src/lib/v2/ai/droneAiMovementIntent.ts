import type { DroneAiRuntimeState, LegacyDroneMovementMode, Vec3Data } from './droneAiTypes';
import { DRONE_PERCEPTION_MEMORY } from './droneAiPerception';

/**
 * Milestone 9D — pure movement-intent core. Same guarantee as the rest of
 * `lib/v2/ai/` — no React, no R3F, no Three.js, no Rapier, no Zustand, no
 * calls to the system clock or the built-in random generator (enforced by
 * `droneAiImportGuards.test.ts`). Plain `{x,y,z}` data only, never a
 * `THREE.Vector3`.
 *
 * SCOPE: this module answers exactly two questions per drone per tick —
 * "which way and how fast should this drone move" (base tactical intent,
 * unchanged in shape/formula from 9B/9C) and "how should nearby drones push
 * it apart so they stop stacking into one visual blob" (NEW this phase,
 * local XZ-only separation). It does NOT decide which STATE a drone is in —
 * that remains entirely `droneAiStateMachine.ts`'s job, UNCHANGED this
 * phase. `resolveDroneMovementIntent()` below deliberately consumes the
 * ALREADY-DECIDED `LegacyDroneMovementMode` (`decideLegacyDroneAi()`'s own
 * output) rather than re-deriving stunned/spawning/state priority from raw
 * `state`+`stunned` booleans itself — a second implementation of that exact
 * priority chain would risk drifting from the first one. `state` is still
 * accepted as an input field (informational passthrough, unused for
 * branching) purely for caller/test readability.
 *
 * WHY A SEPARATE MODULE FROM `droneAiStateMachine.ts`: that module decides
 * WHAT a drone wants to do tactically (search / investigate / engage /
 * attack / hold) — a decision that has NOTHING to do with how many other
 * drones happen to be nearby right now. This module decides HOW to actually
 * move given that choice, which DOES need to know about neighbours. Keeping
 * them separate means the existing, already-tested state-transition timing
 * (fire cooldowns, windup, LOS-loss confirmation, investigate timeout) is
 * completely unaffected by anything in this file — this module is a pure
 * function of (mode, positions, speeds, neighbours), never touches
 * `LegacyDroneAiRuntime` at all.
 *
 * MEASURED DRONE VISUAL FOOTPRINT (informs `DRONE_LOCAL_SEPARATION` below —
 * see `DroneEnemy.tsx`'s own JSX for the source geometry, all static/
 * confirmed by reading the mounted meshes, not guessed):
 *   - Marble outer ring (`torusGeometry args={[0.5, 0.09, ...]}`): the
 *     widest STATIC horizontal element — world-space radius 0.5+0.09=0.59m,
 *     i.e. a ~1.18m visual diameter. This is the number used below as the
 *     "two drones visually touch" threshold.
 *   - Spinning rotor blade (`boxGeometry args={[0.86, 0.02, 0.08]}`, rotates
 *     continuously around Y): sweeps a horizontal radius of 0.86/2=0.43m —
 *     smaller than the ring, so the ring remains the governing extent.
 *   - Invisible hit-sphere (`sphereGeometry args={[0.62,...]}`): gameplay-
 *     only (raycast target), not a rendered/visual element — noted but not
 *     used for the visual-overlap threshold.
 *   - Hover bob (`Math.sin(phase) * DRONE.HOVER_AMP`, amplitude 0.35m): a
 *     PURE PRESENTATION offset — confirmed by reading `DroneEnemy.tsx`'s own
 *     `update()`: `bob` is added only to `group.position` (the RENDERED
 *     mesh), never to `positionRef.current` (the TACTICAL position every
 *     formula in this file and `droneAiStateMachine.ts` actually reads).
 *     `DroneSpatialSnapshot.position` below is always this same
 *     bob-free tactical position — no separate "un-bob" step was needed,
 *     since the authoritative position never had bob mixed in to begin with.
 *
 * SELECTED `DRONE_LOCAL_SEPARATION` CONSTANTS (all within the phase brief's
 * own bounded exploration ranges — see `docs/decisions.md`'s Step 9D entry
 * for the full reasoning):
 *   - `hardSeparationRadiusM: 1.2` — just above the measured 1.18m
 *     ring-touch diameter: inside this radius two drones are ALREADY
 *     visually overlapping, so the separation weight saturates to its
 *     maximum (1.0) rather than continuing to soften.
 *   - `neighbourRadiusM: 2.4` — roughly 2x the ring-touch diameter, giving a
 *     smooth ~1.2m "soft" band (from `hardSeparationRadiusM` out to this
 *     radius) where the correction fades in BEFORE drones actually touch,
 *     instead of only reacting once already overlapping.
 *   - `verticalNeighbourLimitM: 2.0` — covers same-altitude engagement
 *     clustering (drones converging toward a similar height band around the
 *     player) while excluding drones on clearly different platforms (spawn
 *     Y ranges from 2.8m to 7.5m across the roster — several metres apart).
 *   - `maxBlendStrength: 0.5` — separation can meaningfully redirect
 *     movement but never dominates the base tactical formula outright.
 *   - `exactOverlapEpsilonM: 0.01` — a pure numerical-stability guard (avoid
 *     dividing by a near-zero XZ distance), far smaller than any real
 *     separation distance, not a gameplay tuning value.
 */

// --- Plain Vec3Data arithmetic (no THREE.Vector3 anywhere in this module) ---

const ZERO_VEC: Vec3Data = { x: 0, y: 0, z: 0 };
/** Shared numerical-stability threshold — below this, a vector is treated as the zero vector (never divided into). Used for normalization, separation-magnitude, and the 9D.1 speed-cap guards below. */
const ZERO_LENGTH_EPSILON = 1e-9;

function vecSub(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function vecAdd(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function vecScale(v: Vec3Data, s: number): Vec3Data {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}
function vecLength(v: Vec3Data): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
function vecDot(a: Vec3Data, b: Vec3Data): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
/** Normalizes, or returns the zero vector for a (near-)zero-length input — never NaN/Infinity. */
function vecNormalizeOrZero(v: Vec3Data): Vec3Data {
  const len = vecLength(v);
  if (len < ZERO_LENGTH_EPSILON) return ZERO_VEC;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
function isFiniteVec(v: Vec3Data): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

// --- Public types ---

export type DroneMovementMode = 'hold' | 'search' | 'investigate' | 'advance' | 'retreat' | 'strafe-left' | 'strafe-right';

export interface DroneMovementIntent {
  mode: DroneMovementMode;
  /**
   * The FINAL, already-speed-scaled, ready-to-integrate vector — the
   * adapter applies it exactly as the legacy code applied `desired`:
   * `positionRef.current.addScaledVector(vecFromData(intent.desiredDirection), simulationDeltaS)`.
   * NOT guaranteed unit length: the legacy `search`-while-near-home wander
   * formula was never unit length either (see this module's own doc
   * comment / `resolveSearchBase` below) — that non-unit legacy result is
   * intentionally preserved, per the phase brief's own "except where the
   * legacy formula intentionally uses a non-unit result" exception.
   */
  desiredDirection: Vec3Data;
  /** The nominal speed selected for this tick's mode (informational — see this module's own doc comment on why the combined engage/attack vector's true magnitude can legitimately exceed this single value, exactly as it always could in the legacy formula). */
  speedMps: number;
  faceTarget: boolean;
  facingTarget: Vec3Data | null;
  /** Unit-length (or zero) XZ-only raw separation correction, BEFORE blending — exposed so tests/telemetry can inspect the separation component independently of the final blended result. */
  separationDirection: Vec3Data;
  /** 0..`DRONE_LOCAL_SEPARATION.maxBlendStrength` — the capped blend weight actually applied this tick. */
  separationStrength: number;
}

export interface DroneSpatialSnapshot {
  /** Stable, hand-authored `DroneSpawnDef.id` (e.g. `'deck-a'`) — never a React key or array index. */
  id: string;
  /** The TACTICAL position (never the hover-bobbed render position) — see this module's own doc comment. */
  position: Vec3Data;
  state: DroneAiRuntimeState;
  /** `state !== 'destroyed'` — see this module's own doc comment for the full participation table (spawning occupies space but does not move itself; destroyed/hidden never repels the living). */
  participatesInSeparation: boolean;
}

export interface DroneMovementInput {
  /** The already-decided high-level behaviour for this tick — see this module's own doc comment for why this is consumed rather than re-derived from `state`/`stunned`. */
  legacyMovementMode: LegacyDroneMovementMode;
  /** Informational passthrough — unused for branching (see `legacyMovementMode`). */
  state: DroneAiRuntimeState;

  selfId: string;
  selfPosition: Vec3Data;
  homePosition: Vec3Data;
  patrolRadiusM: number;

  /** The live player position — always supplied; consumed by the engage/attack radial+strafe formulas and, when `facePlayer` is true, as the facing target. */
  targetPosition: Vec3Data;
  /** Non-null exactly when `legacyMovementMode === 'investigate'` — mirrors `LegacyDroneAiDecision.movementTarget`. */
  investigationPosition: Vec3Data | null;

  strafeDirection: -1 | 1;

  rangeMinM: number;
  rangeMaxM: number;

  approachSpeedMps: number;
  retreatSpeedMps: number;
  strafeSpeedMps: number;
  /**
   * Base (never difficulty-scaled) `DRONE.STRAFE_SPEED` — the legacy
   * "returning home while searching" branch's own real quirk: it has always
   * used the flat base constant, not `ResolvedDroneConfig.strafeSpeed`,
   * regardless of difficulty. Preserved exactly, not "fixed," per the
   * phase brief's "do not rebalance current speed values" instruction.
   */
  searchReturnSpeedMps: number;

  searchPhase: number;

  /** Mirrors `LegacyDroneAiDecision.facePlayer` — passthrough, never recomputed here. */
  facePlayer: boolean;

  neighbours: readonly DroneSpatialSnapshot[];
}

// --- Separation configuration (see this module's own doc comment for the full measurement/reasoning) ---

export const DRONE_LOCAL_SEPARATION = {
  neighbourRadiusM: 2.4,
  hardSeparationRadiusM: 1.2,
  verticalNeighbourLimitM: 2.0,
  maxBlendStrength: 0.5,
  exactOverlapEpsilonM: 0.01,
} as const;

/**
 * Retreat/advance get a LOWER effective separation cap than search/
 * investigate/strafe — belt-and-suspenders alongside the hard radial-
 * projection clamp below, satisfying the phase brief's "either a lower
 * out-of-band cap OR a minimum dot-product constraint" with BOTH, since
 * either alone is already explicitly sufficient and together they leave no
 * edge case where a strong multi-neighbour push could still flip net
 * radial direction.
 */
const OUT_OF_BAND_BLEND_FACTOR = 0.5;

/**
 * Milestone 9D.1 — CLOSE-PROXIMITY COLLISION RECOVERY, not a movement-speed
 * buff. This constant governs ONE thing only: how fast a drone may
 * physically separate from another drone it is already (or nearly)
 * touching. It is not a general combat-speed multiplier, not a difficulty
 * lever, and not available to any drone that isn't within `neighbourRadiusM`
 * of another living drone this exact tick — see `urgency`'s own comment
 * below for the precise, proximity-only activation curve. Added only after
 * three independent strictly-zero-inflation blend designs
 * (additive-then-clamp; directional lerp capped at `maxBlendStrength`;
 * directional lerp with urgency renormalized to reach full commitment) were
 * each measured, live, against a real 200s 8-drone moving-player capture, and
 * each produced WORSE sustained overlap than the pre-9D.1 baseline (up to
 * ~22s of continuous overlap in one run) — see docs/decisions.md's Step
 * 9D.1 entry for the full measured trace of all three failed attempts and
 * the geometric root cause (two drones strafing in opposite rotational
 * senses around a moving player cross paths faster than a SAME-SPEED
 * redirection can ever resolve — a kinematic limit, not a tuning problem;
 * no amount of DIRECTION-only cleverness fixes a closing-speed problem).
 * The phase brief's own acceptance gate anticipated exactly this
 * possibility: "a bounded emergency multiplier only if genuinely necessary
 * AND measured... it did not automatically approve permanent additive
 * speed during ordinary separation." This constant is that bounded,
 * measured exception. An initial value of 0.5 (matching the effective peak
 * boost the ORIGINAL pre-9D.1 uncapped design used) measurably helped
 * (longest sustained overlap dropped from 12-22s to 2.6s, samples below
 * threshold from 14-22% to 9.5%) but did not fully close the gap to the 9C
 * baseline (473ms / 0.24%). Re-measured at 1.0 (up to 2x speed only at
 * `hardSeparationRadiusM`, still strictly zero away from any neighbour) —
 * this FULLY closed the gap: 0 samples below the overlap threshold, 0ms
 * sustained overlap, minimum pairwise distance 2.33m (better than the 9C
 * baseline's own 1.06m) across the same real 200s 8-drone moving-player
 * capture — see docs/decisions.md's Step 9D.1 entry for the full
 * before/after table across every measured value. Critically, this is NOT
 * "permanent additive speed during ordinary separation": the allowance is
 * scaled by `urgency` (0 at `neighbourRadiusM`, only reaching this full
 * 1.0 ceiling at `hardSeparationRadiusM` or closer — i.e. only once a
 * neighbour is already visually touching) and is exactly 0 whenever no
 * neighbour is within range at all, so ordinary/no-neighbour movement is
 * completely unaffected (still byte-identical to legacy — see the
 * no-neighbour parity suite).
 */
export const EMERGENCY_SPEED_BOOST_MAX = 1.0;

export interface DroneSeparationResult {
  /** Unit-length XZ vector (y always 0), or the zero vector when no neighbour is within range. */
  direction: Vec3Data;
  strength: number;
}

/**
 * Small, local, dependency-free FNV-1a-style hash — deliberately NOT the
 * gameplay `RandomSource`/`droneAiRandom.ts` (this must never advance any
 * drone's seeded RNG stream — see this module's own doc comment and the
 * phase brief's "consumes zero gameplay RNG" gate). Pure function of the
 * input string only — no clock, no external state.
 */
function hashPairKey(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic, antisymmetric exact-overlap recovery direction:
 * `exactOverlapFallbackDirection(a, b) === -exactOverlapFallbackDirection(b, a)`
 * always. Both drones hash the SAME lexically-sorted pair key (so they agree
 * on one shared angle), then apply opposite signs based on which side of the
 * lexical ordering each one is on — guaranteeing they always recover in
 * exactly opposite directions, never both pushing the same way. A pure
 * function of the two stable IDs only: unaffected by reset/remount/life
 * generation, consumes no RNG, reads no clock.
 */
export function exactOverlapFallbackDirection(selfId: string, otherId: string): Vec3Data {
  const lo = selfId < otherId ? selfId : otherId;
  const hi = selfId < otherId ? otherId : selfId;
  const angle = (hashPairKey(`${lo}|${hi}`) / 0xffffffff) * Math.PI * 2;
  const finalAngle = selfId < otherId ? angle : angle + Math.PI;
  return { x: Math.cos(finalAngle), y: 0, z: Math.sin(finalAngle) };
}

/**
 * Deterministic local XZ-only separation — accumulates a WEIGHTED VECTOR
 * SUM of "away from neighbour" directions (not just the nearest neighbour's
 * direction alone), so two neighbours on opposite sides naturally cancel to
 * near-zero rather than one arbitrarily winning. Weight uses a two-zone
 * model derived from the measured footprint: full strength (1.0) inside
 * `hardSeparationRadiusM` (already visually touching), linearly fading to 0
 * out at `neighbourRadiusM`. `strength` is derived from the SAME summed
 * vector's magnitude (capped to 1 before scaling by `maxBlendStrength`) —
 * one formula naturally gives both "closer neighbour pushes harder" and
 * "symmetric neighbours cancel" without separate bookkeeping.
 *
 * No allocations inside the neighbour loop (plain number accumulators
 * only). Never mutates `neighbours` or any neighbour's `position`.
 */
export function computeLocalSeparation(
  selfId: string,
  selfPosition: Vec3Data,
  neighbours: readonly DroneSpatialSnapshot[],
  config: typeof DRONE_LOCAL_SEPARATION = DRONE_LOCAL_SEPARATION,
): DroneSeparationResult {
  let sumX = 0;
  let sumZ = 0;

  for (const neighbour of neighbours) {
    if (neighbour.id === selfId) continue;
    if (!neighbour.participatesInSeparation) continue;
    if (!isFiniteVec(neighbour.position)) continue; // malformed snapshot — ignore rather than corrupt the sum

    const dy = selfPosition.y - neighbour.position.y;
    if (Math.abs(dy) > config.verticalNeighbourLimitM) continue;

    const dx = selfPosition.x - neighbour.position.x;
    const dz = selfPosition.z - neighbour.position.z;
    const xzDist = Math.sqrt(dx * dx + dz * dz);
    if (xzDist > config.neighbourRadiusM) continue;

    let dirX: number;
    let dirZ: number;
    let weight: number;
    if (xzDist <= config.exactOverlapEpsilonM) {
      const fallback = exactOverlapFallbackDirection(selfId, neighbour.id);
      dirX = fallback.x;
      dirZ = fallback.z;
      weight = 1;
    } else {
      dirX = dx / xzDist;
      dirZ = dz / xzDist;
      if (xzDist <= config.hardSeparationRadiusM) {
        weight = 1;
      } else {
        const softSpan = config.neighbourRadiusM - config.hardSeparationRadiusM;
        weight = softSpan > 0 ? 1 - (xzDist - config.hardSeparationRadiusM) / softSpan : 0;
      }
    }

    sumX += dirX * weight;
    sumZ += dirZ * weight;
  }

  const magnitude = Math.sqrt(sumX * sumX + sumZ * sumZ);
  if (magnitude < ZERO_LENGTH_EPSILON) return { direction: { x: 0, y: 0, z: 0 }, strength: 0 };
  return {
    direction: { x: sumX / magnitude, y: 0, z: sumZ / magnitude },
    strength: config.maxBlendStrength * Math.min(1, magnitude),
  };
}

const HOLD_MODES: ReadonlySet<LegacyDroneMovementMode> = new Set(['spawn-hold', 'stunned-hold', 'destroyed-hold']);

function holdIntent(output: DroneMovementIntent): DroneMovementIntent {
  output.mode = 'hold';
  output.desiredDirection = ZERO_VEC;
  output.speedMps = 0;
  output.faceTarget = false;
  output.facingTarget = null;
  output.separationDirection = ZERO_VEC;
  output.separationStrength = 0;
  return output;
}

/**
 * Search — byte-identical to the legacy formula (see `DroneEnemy.tsx`'s
 * pre-9D `update()`): full 3D home-relative vector (never flattened to XZ),
 * `searchReturnSpeedMps` while outside the patrol radius, otherwise the
 * small non-unit ambient wander vector used as-is.
 */
function resolveSearchBase(input: DroneMovementInput): Vec3Data {
  const toHome = vecSub(input.homePosition, input.selfPosition);
  if (vecLength(toHome) > input.patrolRadiusM) {
    return vecScale(vecNormalizeOrZero(toHome), input.searchReturnSpeedMps);
  }
  return { x: Math.sin(input.searchPhase) * 0.4, y: 0, z: Math.cos(input.searchPhase * 0.7) * 0.4 };
}

/** Investigate — direct 3D steering toward the remembered position, stopping (zero base) once within the arrival radius. Arrival is movement-only, matching `droneAiStateMachine.ts`'s own doc comment: it never ends the `investigating` state early. */
function resolveInvestigateBase(input: DroneMovementInput, investigationPosition: Vec3Data): Vec3Data {
  const toMemory = vecSub(investigationPosition, input.selfPosition);
  const distanceToMemory = vecLength(toMemory);
  if (distanceToMemory > DRONE_PERCEPTION_MEMORY.investigateArrivalRadiusM) {
    return vecScale(vecNormalizeOrZero(toMemory), input.approachSpeedMps);
  }
  return ZERO_VEC;
}

interface EngageResolution {
  base: Vec3Data;
  subMode: 'advance' | 'retreat' | 'strafe-left' | 'strafe-right';
  speedMps: number;
  toPlayerUnit: Vec3Data;
}

/**
 * Engage/attack — byte-identical to the legacy formula: full 3D
 * drone-to-player unit vector (vertical component included, never
 * flattened), retreat below `rangeMinM` / advance above `rangeMaxM` / no
 * radial component in between, with the lateral strafe component ALWAYS
 * added on top regardless of band (a real, confirmed legacy characteristic
 * — not "strafe only when in-band"). `cross(up=(0,1,0), toPlayerUnit)` is
 * always horizontal by construction (the y-component of that cross product
 * is `up.z*toPlayerUnit.x - up.x*toPlayerUnit.z = 0` for any input, since
 * `up.x===up.z===0`) — computed directly rather than via a general cross
 * product helper, since only this one fixed `up` axis is ever used.
 */
function resolveEngageBase(input: DroneMovementInput): EngageResolution {
  const toPlayer = vecSub(input.targetPosition, input.selfPosition);
  const distance = vecLength(toPlayer);
  const toPlayerUnit = vecNormalizeOrZero(toPlayer);

  let radial = ZERO_VEC;
  let subMode: EngageResolution['subMode'];
  let speedMps: number;
  if (distance < input.rangeMinM) {
    subMode = 'retreat';
    radial = vecScale(toPlayerUnit, -input.retreatSpeedMps);
    speedMps = input.retreatSpeedMps;
  } else if (distance > input.rangeMaxM) {
    subMode = 'advance';
    radial = vecScale(toPlayerUnit, input.approachSpeedMps);
    speedMps = input.approachSpeedMps;
  } else {
    subMode = input.strafeDirection === 1 ? 'strafe-right' : 'strafe-left';
    speedMps = input.strafeSpeedMps;
  }

  const strafeVec = vecScale({ x: toPlayerUnit.z, y: 0, z: -toPlayerUnit.x }, input.strafeDirection * input.strafeSpeedMps);
  return { base: vecAdd(radial, strafeVec), subMode, speedMps, toPlayerUnit };
}

/**
 * The one per-tick pure movement-intent resolver. Deterministic given
 * identical inputs — no RNG, no clock. `output`, when supplied, is reused
 * in place (per the phase brief's "avoid per-frame allocations where
 * practical" / "do not store movement intent permanently" guidance) rather
 * than allocating a fresh intent object every call; a fresh object is
 * created only when the caller omits it (e.g. in tests).
 */
export function resolveDroneMovementIntent(input: DroneMovementInput, output?: DroneMovementIntent): DroneMovementIntent {
  const out = output ?? {
    mode: 'hold' as DroneMovementMode,
    desiredDirection: ZERO_VEC,
    speedMps: 0,
    faceTarget: false,
    facingTarget: null,
    separationDirection: ZERO_VEC,
    separationStrength: 0,
  };

  if (HOLD_MODES.has(input.legacyMovementMode)) return holdIntent(out);

  // Defensive fail-safe — malformed input (non-finite position, or an
  // investigate tick with no remembered position) never propagates NaN;
  // it degrades to a stationary hold instead.
  const investigationPosition = input.investigationPosition;
  const hasValidInvestigationTarget = investigationPosition === null || isFiniteVec(investigationPosition);
  if (!isFiniteVec(input.selfPosition) || !isFiniteVec(input.targetPosition) || !isFiniteVec(input.homePosition) || !hasValidInvestigationTarget) {
    return holdIntent(out);
  }
  if (input.legacyMovementMode === 'investigate' && investigationPosition === null) return holdIntent(out);

  const separation = computeLocalSeparation(input.selfId, input.selfPosition, input.neighbours, DRONE_LOCAL_SEPARATION);

  let base: Vec3Data;
  let mode: DroneMovementMode;
  let speedMps: number;
  let faceTarget = false;
  let facingTarget: Vec3Data | null = null;
  let toPlayerUnitForClamp: Vec3Data | null = null;
  let outOfBand = false;

  if (input.legacyMovementMode === 'search') {
    mode = 'search';
    base = resolveSearchBase(input);
    speedMps = input.searchReturnSpeedMps;
  } else if (input.legacyMovementMode === 'investigate') {
    mode = 'investigate';
    // Non-null guaranteed by the defensive check above.
    base = resolveInvestigateBase(input, investigationPosition as Vec3Data);
    speedMps = input.approachSpeedMps;
    faceTarget = true;
    facingTarget = investigationPosition;
  } else {
    // 'engage' | 'attack' — identical movement treatment, matching the
    // legacy `else if (engaging || attacking)` branch exactly.
    const resolved = resolveEngageBase(input);
    base = resolved.base;
    mode = resolved.subMode;
    speedMps = resolved.speedMps;
    faceTarget = input.facePlayer;
    facingTarget = input.facePlayer ? input.targetPosition : null;
    toPlayerUnitForClamp = resolved.toPlayerUnit;
    outOfBand = resolved.subMode === 'advance' || resolved.subMode === 'retreat';
  }

  const blendFactor = outOfBand ? OUT_OF_BAND_BLEND_FACTOR : 1;
  let blended = base;
  if (separation.strength > 0) {
    const baseMagnitude = vecLength(base);
    if (baseMagnitude > ZERO_LENGTH_EPSILON) {
      // Milestone 9D.1 — DIRECTIONAL interpolation, not additive-then-clamp
      // (first 9D.1 attempt). The result is RE-SCALED to `baseMagnitude`
      // afterward, so — independent of how strong the rotation below is —
      // the final magnitude can never exceed the legacy no-separation
      // speed, satisfying "no speed inflation" exactly, every tick.
      //
      // `directionUrgency` (0..1) is the LERP FACTOR — how far to rotate
      // from the base direction toward the separation direction — and is
      // DELIBERATELY NOT the same value as `separation.strength`
      // (0..`maxBlendStrength`, 0.5 by construction). A first attempt used
      // `separation.strength * blendFactor` directly as the lerp factor,
      // which — because `maxBlendStrength` itself never exceeds 0.5 —
      // meant direction could NEVER rotate more than halfway toward pure
      // separation, even when a neighbour was already inside
      // `hardSeparationRadiusM` (i.e. already visually touching, the most
      // urgent case there is). Measured live against a real 200s 8-drone
      // moving-player capture, that half-hearted rotation was not decisive
      // enough to break a sustained orbital-crossing pattern between two
      // drones strafing in opposite rotational senses around the player —
      // worse than the pre-9D.1 baseline (see docs/decisions.md's Step
      // 9D.1 entry for the full measured before/after). `directionUrgency`
      // instead RENORMALIZES `separation.strength` against its own known
      // ceiling (`maxBlendStrength`) to reach a genuine 1.0 — full
      // commitment to the separation direction — exactly at the proximity
      // `computeLocalSeparation` already treats as maximally urgent
      // (`hardSeparationRadiusM` or closer), while the existing
      // `OUT_OF_BAND_BLEND_FACTOR` still separately tempers retreat/advance
      // (belt-and-suspenders alongside the dominance clamp below). This
      // changes ONLY how strongly direction rotates under genuine urgency —
      // magnitude is still always capped to `baseMagnitude`, so this does
      // not reopen the speed-inflation question at all.
      const urgency = Math.min(1, separation.strength / DRONE_LOCAL_SEPARATION.maxBlendStrength);
      const directionUrgency = outOfBand ? urgency * OUT_OF_BAND_BLEND_FACTOR : urgency;
      const baseDirection = vecScale(base, 1 / baseMagnitude);
      const lerped = vecAdd(vecScale(baseDirection, 1 - directionUrgency), vecScale(separation.direction, directionUrgency));
      let blendedDirection = vecNormalizeOrZero(lerped);

      // Base-intent dominance — retreat can never become net-advance and
      // advance can never become net-retreat. Applied to the UNIT direction
      // (project out the disallowed radial component, then re-normalize) —
      // still on top of the already-lower out-of-band blend factor above
      // (belt-and-suspenders, see `OUT_OF_BAND_BLEND_FACTOR`'s own comment).
      if (toPlayerUnitForClamp && vecLength(blendedDirection) > ZERO_LENGTH_EPSILON) {
        const radial = vecDot(blendedDirection, toPlayerUnitForClamp);
        if (mode === 'retreat' && radial > 0) blendedDirection = vecNormalizeOrZero(vecSub(blendedDirection, vecScale(toPlayerUnitForClamp, radial)));
        if (mode === 'advance' && radial < 0) blendedDirection = vecNormalizeOrZero(vecSub(blendedDirection, vecScale(toPlayerUnitForClamp, radial)));
      }

      // Final magnitude is `baseMagnitude` scaled by a bounded, proximity-
      // only COLLISION-RECOVERY ceiling — 1.0x (no change at all) at
      // ordinary/no-urgency range, rising only as a neighbour gets
      // genuinely close, up to `1 + EMERGENCY_SPEED_BOOST_MAX` right at
      // `hardSeparationRadiusM` (already touching). This is recovery speed
      // for escaping an active collision, not a combat-speed buff — see
      // `EMERGENCY_SPEED_BOOST_MAX`'s own doc comment for why this
      // measured, narrowly-scoped exception exists. Or the zero vector,
      // only in the pathological case where the dominance clamp above
      // degenerates `blendedDirection` to zero.
      const collisionRecoveryCeiling = baseMagnitude * (1 + EMERGENCY_SPEED_BOOST_MAX * urgency);
      blended = vecScale(blendedDirection, collisionRecoveryCeiling);
    } else {
      // `baseMagnitude <= ZERO_LENGTH_EPSILON` (investigate-arrived, or any
      // other tick where the legacy formula itself produces no movement) —
      // the phase brief's own rule only constrains magnitude "when
      // base.length > epsilon"; it is silent here, and there is no base
      // DIRECTION to rotate from either. Separation is applied directly, at
      // its own natural (already `maxBlendStrength`-capped) magnitude — the
      // same "arrived/idle drones must still be separable" exemption this
      // module has documented since its first version (see `strafeSpeedMps`
      // reference-speed comment on `computeLocalSeparation`'s own call
      // site) — a zero-to-nonzero change here is not "inflation," since
      // there is no legacy speed being exceeded.
      blended = vecScale(separation.direction, separation.strength * blendFactor * input.strafeSpeedMps);
    }
  }

  out.mode = mode;
  out.desiredDirection = blended;
  out.speedMps = speedMps;
  out.faceTarget = faceTarget;
  out.facingTarget = facingTarget;
  out.separationDirection = separation.direction;
  out.separationStrength = separation.strength;
  return out;
}
