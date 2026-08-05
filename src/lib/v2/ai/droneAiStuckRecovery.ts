import type { Vec3Data } from './droneAiTypes';
import type { DroneArenaConfig } from './droneArenaConfig';

/**
 * Milestone 9F — pure, deterministic stuck-RECOVERY OVERLAY. Same guarantee
 * as the rest of `lib/v2/ai/` — no React, no R3F, no Three.js, no Rapier, no
 * Zustand, no browser globals, no `Math.random`/`performance.now`/
 * `Date.now` (enforced by `droneAiImportGuards.test.ts`).
 *
 * ARCHITECTURAL DECISION (per this phase's own brief): stuck recovery is a
 * RUNTIME OVERLAY, not a seventh AI state. `droneAiStateMachine.ts`'s
 * `DroneAiRuntimeState` union is untouched (still exactly six states) — this
 * module's own `DroneRecoveryPhase` is a COMPLETELY SEPARATE, adapter-owned
 * concept, mirroring how `stunned` already sits alongside `state` as a timed
 * OVERLAY rather than a discrete state value (see `droneAiTypes.ts`'s own
 * doc comment on that precedent). The adapter (`DroneEnemy.tsx`) holds ONE
 * `DroneAiRuntimeState` (truthful, from `droneAiStateMachine.ts`) and, side
 * by side, ONE `DroneStuckRecoveryRuntime` (from this module) — never
 * merged into one union, never cross-imported by the state machine itself.
 *
 * DETECTION MODEL: compares EXPECTED movement (the magnitude of the drone's
 * own already-decided tactical direction this substep, from
 * `droneAiMovementIntent.ts`, unmodified) against ACTUAL committed
 * displacement (after `droneAiArenaConstraints.ts` has already resolved the
 * proposed position — see `DroneEnemy.tsx`'s own call order) — accumulated
 * over a rolling ~2s window, evaluated at a bounded low-rate cadence (never
 * 60Hz decisions, never `setInterval`/`setTimeout`). This is TACTICAL
 * no-progress, not low absolute speed: ordinary idle search wander (~0.4-
 * 0.57 units/s) can never even accumulate this module's own
 * `minExpectedDistanceM` threshold within one window, so it is structurally
 * incapable of triggering a false stuck verdict — see `DRONE_STUCK_DETECTOR`'s
 * own doc comment for the full arithmetic.
 *
 * RECOVERY IS A SELF-CONTAINED ESCALATING EPISODE: once a stuck event is
 * detected, this module internally escalates through nudge → back-away →
 * (optional) altitude-correct → teleport-fallback, checking after each
 * bounded-duration attempt whether the drone's OWN committed position
 * actually moved (`escapeProgressMinM`) before deciding to escalate further
 * — the OUTER detector (idle-phase accumulation) does not re-arm until the
 * whole episode resolves into `cooldown`, then `idle`. This is what makes
 * "recovery retriggers during cooldown: 0" true by construction, not by a
 * separate guard.
 *
 * COMBAT BLOCKING: this module has ZERO knowledge of attack timing,
 * telegraphs, or the pure state machine's own contract. It only ever
 * reports `recoveryActive` (true during nudging/backing-away/altitude-
 * correcting/teleport-fallback, false during idle/cooldown) — the ADAPTER
 * is the one that (a) uses this to set the new, optional
 * `LegacyDroneAiObservation.recoveryBlocksAttack` field the pure state
 * machine reads (see `droneAiStateMachine.ts`'s own doc comment for the
 * exact, minimal, backward-compatible gate this added), and (b) substitutes
 * `decision.movementOverride` for the normal tactical movement vector while
 * `recoveryActive` is true. This module never fabricates a state
 * transition, never touches `LegacyDroneAiRuntime`, and never calls into
 * `droneAiStateMachine.ts` at all.
 */

export type DroneRecoveryPhase = 'idle' | 'nudging' | 'backing-away' | 'altitude-correcting' | 'teleport-fallback' | 'cooldown';

/**
 * Rolling-window stuck-detection tuning — all four values chosen from the
 * phase brief's own bounded exploration ranges (window 1500-2500ms, min
 * expected distance 1.5-3.5m, progress ratio 0.10-0.25, sample cadence
 * 250-500ms):
 *   - `windowDurationMs: 2000` — the midpoint of the suggested range.
 *   - `minExpectedDistanceM: 2.5` — chosen so ordinary idle search wander
 *     (the legacy formula's own `sin(phase)*0.4`/`cos(phase*0.7)*0.4` — peak
 *     magnitude ≈0.57 units/s) can accumulate at most ~1.1m of expected
 *     distance within one 2000ms window, comfortably BELOW this threshold —
 *     ordinary idle wander is therefore structurally ineligible for a stuck
 *     verdict, not merely unlikely to trigger one.
 *   - `progressRatioThreshold: 0.15` — the lower-middle of the suggested
 *     range, erring toward NOT falsely flagging a drone still making some
 *     real (if partial/obstructed) progress.
 *   - `sampleIntervalMs: 250` — throttles how often the WINDOW-COMPLETE
 *     judgement itself is (re-)evaluated; the underlying expected/actual
 *     accumulators still update every call (every fixed substep, ~60Hz) so
 *     no precision is lost — only the DECISION cadence is low-rate, per this
 *     phase's own Section 11.
 */
export const DRONE_STUCK_DETECTOR = {
  windowDurationMs: 2000,
  minExpectedDistanceM: 2.5,
  progressRatioThreshold: 0.15,
  sampleIntervalMs: 250,
} as const;

/**
 * Recovery-episode tuning. Durations (900ms per attempt) are bounded and
 * roughly windup-scale (comfortably shorter than the reaction/telegraph
 * windows 9E introduced, so a recovery episode never reads as a new combat
 * beat). `escapeProgressMinM: 0.6` is deliberately similar in spirit to
 * `droneAiMovementIntent.ts`'s own `hardSeparationRadiusM` reasoning — large
 * enough that a recovery attempt merely jittering in place can never be
 * mistaken for genuine escape. `cooldownDurationMs: 10000` sits in the
 * middle of the brief's own suggested 8000-15000ms range.
 * `minFailedAttemptsBeforeTeleport: 2` matches nudge+back-away always
 * running before teleport becomes eligible; altitude-correction is a
 * conditional THIRD attempt (only when altitude evidence justifies it),
 * never a precondition for teleport eligibility on its own.
 */
export const DRONE_RECOVERY_TUNING = {
  nudgeDurationMs: 900,
  backAwayDurationMs: 900,
  altitudeCorrectDurationMs: 900,
  altitudeCorrectSpeedMps: 1.5,
  escapeProgressMinM: 0.6,
  cooldownDurationMs: 10000,
  minFailedAttemptsBeforeTeleport: 2,
  maxTeleportsPerLife: 1,
  /** Bounded weight (of 1.0) the soft inward-boundary blend may contribute to a nudge/back-away direction — base escape intent always stays dominant. */
  inwardBlendMax: 0.4,
} as const;

const ZERO_VEC: Vec3Data = { x: 0, y: 0, z: 0 };
const ZERO_LENGTH_EPSILON = 1e-9;

export interface DroneStuckSample {
  nowMs: number;
  wantsMovement: boolean;
  expectedDisplacementM: number;
  actualDisplacementM: number;
  requestedDirection: Vec3Data;
  actualDisplacement: Vec3Data;
  horizontalClamped: boolean;
  altitudeClamped: boolean;
  forbiddenZoneCorrected: boolean;
}

export interface DroneStuckRecoveryContext {
  droneId: string;
  /** The drone's own tactical position AS OF the end of this tick (after this substep's movement has already been committed) — see this module's own doc comment on call order. */
  currentPosition: Vec3Data;
  /** The drone's own home/spawn position — the PRIMARY teleport-fallback target (Section 16's "current validated home position" preference), validated against `config` before ever being used. */
  homePosition: Vec3Data;
  /** Nominal speed (m/s) to scale a nudge/back-away direction to — always CALLER-supplied (the drone's own current approach/retreat/strafe speed), never invented here, so recovery movement can never exceed the existing allowed ceiling. */
  speedMps: number;
  config: DroneArenaConfig;
}

export interface DroneStuckRecoveryRuntime {
  phase: DroneRecoveryPhase;
  windowStartedAtMs: number | null;
  expectedDistanceAccumM: number;
  actualDistanceAccumM: number;
  lastSampleAtMs: number | null;
  recoveryStartedAtMs: number | null;
  recoveryUntilMs: number | null;
  cooldownUntilMs: number | null;
  attemptCountThisLife: number;
  teleportCountThisLife: number;
  lastStablePosition: Vec3Data;
  /** The direction chosen ONCE at phase-entry and reused unchanged every tick until the phase ends — never recomputed mid-phase (prevents frame-to-frame direction flip). */
  activeDirection: Vec3Data;
  /** The speed chosen once at phase-entry, paired with `activeDirection`. */
  activeSpeedMps: number;
  teleportTarget: Vec3Data | null;
}

export interface DroneRecoveryDecision {
  stuckDetected: boolean;
  /** True during nudging/backing-away/altitude-correcting/teleport-fallback — false during idle/cooldown. The adapter uses this both to override movement and to set `recoveryBlocksAttack` on this tick's observation. */
  recoveryActive: boolean;
  /** Already-speed-scaled, ready-to-integrate override vector — non-null exactly when `recoveryActive` and the phase is a movement phase (nudging/backing-away/altitude-correcting). Null during teleport-fallback (the adapter sets position directly instead) and during idle/cooldown. */
  movementOverride: Vec3Data | null;
  /** Non-null exactly on the one tick a teleport should be applied — the adapter must SET the tactical position directly to this value (not integrate it) and skip normal movement/fire this substep. */
  teleportTarget: Vec3Data | null;
  clearDetectorWindow: boolean;
}

function isFiniteVec(v: Vec3Data): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
function vecLength(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}
function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
function negate(v: Vec3Data): Vec3Data {
  return { x: -v.x, y: -v.y, z: -v.z };
}
function normalizeOrZero(v: Vec3Data): Vec3Data {
  const len = vecLength(v.x, v.y, v.z);
  if (len < ZERO_LENGTH_EPSILON) return ZERO_VEC;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
function scaleDirection(dir: Vec3Data, speedMps: number): Vec3Data {
  return { x: dir.x * speedMps, y: dir.y * speedMps, z: dir.z * speedMps };
}

/** Small, local, dependency-free FNV-1a-style hash — deliberately independent of `droneAiMovementIntent.ts`'s own hash (this module stays fully decoupled from it — see this file's own doc comment). */
function hashDroneId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic, never-zero fallback angle derived from the drone's own stable ID plus the current attempt count — used whenever the real requested direction is too close to zero to normalize safely. */
function stableFallbackDirectionXZ(droneId: string, attempt: number): Vec3Data {
  const angle = ((hashDroneId(droneId) + attempt * 2654435761) >>> 0) / 0xffffffff * Math.PI * 2;
  return { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
}

function normalizeXZOrFallback(v: Vec3Data, droneId: string, attempt: number): Vec3Data {
  const flatLen = vecLength(v.x, 0, v.z);
  if (flatLen < ZERO_LENGTH_EPSILON) return stableFallbackDirectionXZ(droneId, attempt);
  return { x: v.x / flatLen, y: 0, z: v.z / flatLen };
}

/**
 * Bounded inward-toward-arena-centre blend — zero away from any boundary,
 * rising smoothly (capped at `DRONE_RECOVERY_TUNING.inwardBlendMax`) inside
 * `config.softBoundaryMarginM` of the nearest edge. Base escape direction
 * always stays dominant (see this module's own doc comment on
 * `DRONE_RECOVERY_TUNING.inwardBlendMax`).
 */
function applyInwardBoundaryBlend(dirXZ: Vec3Data, position: Vec3Data, config: DroneArenaConfig, droneId: string, attempt: number): Vec3Data {
  const b = config.horizontalBounds;
  const margin = config.softBoundaryMarginM;
  if (!(margin > 0)) return dirXZ;
  const nearestEdgeDist = Math.min(position.x - b.minX, b.maxX - position.x, position.z - b.minZ, b.maxZ - position.z);
  if (nearestEdgeDist >= margin) return dirXZ;
  const proximity = clamp01(1 - nearestEdgeDist / margin);
  const centerX = (b.minX + b.maxX) / 2;
  const centerZ = (b.minZ + b.maxZ) / 2;
  const towardCenter = normalizeXZOrFallback({ x: centerX - position.x, y: 0, z: centerZ - position.z }, droneId, attempt);
  const weight = proximity * DRONE_RECOVERY_TUNING.inwardBlendMax;
  const blended: Vec3Data = { x: dirXZ.x * (1 - weight) + towardCenter.x * weight, y: 0, z: dirXZ.z * (1 - weight) + towardCenter.z * weight };
  return normalizeXZOrFallback(blended, droneId, attempt);
}

function computeNudgeDirection(requestedDirection: Vec3Data, context: DroneStuckRecoveryContext, attempt: number): Vec3Data {
  const reqXZ = normalizeXZOrFallback(requestedDirection, context.droneId, attempt);
  const perpA: Vec3Data = { x: -reqXZ.z, y: 0, z: reqXZ.x };
  const perpB: Vec3Data = { x: reqXZ.z, y: 0, z: -reqXZ.x };
  const chooseA = (hashDroneId(context.droneId) + attempt) % 2 === 0;
  return applyInwardBoundaryBlend(chooseA ? perpA : perpB, context.currentPosition, context.config, context.droneId, attempt);
}

function computeBackAwayDirection(requestedDirection: Vec3Data, context: DroneStuckRecoveryContext, attempt: number): Vec3Data {
  const away = normalizeXZOrFallback(negate(requestedDirection), context.droneId, attempt);
  return applyInwardBoundaryBlend(away, context.currentPosition, context.config, context.droneId, attempt);
}

function altitudeEvidenceJustifiesCorrection(sample: DroneStuckSample, context: DroneStuckRecoveryContext): boolean {
  const y = context.currentPosition.y;
  return sample.altitudeClamped || y < context.config.minAltitudeM || y > context.config.maxAltitudeM;
}

function computeAltitudeDirection(context: DroneStuckRecoveryContext): Vec3Data {
  const y = context.currentPosition.y;
  const { minAltitudeM, maxAltitudeM } = context.config;
  if (y < minAltitudeM) return { x: 0, y: 1, z: 0 };
  if (y > maxAltitudeM) return { x: 0, y: -1, z: 0 };
  const mid = (minAltitudeM + maxAltitudeM) / 2;
  return { x: 0, y: y < mid ? 1 : -1, z: 0 };
}

function isValidTeleportPoint(p: Vec3Data, config: DroneArenaConfig): boolean {
  if (!isFiniteVec(p)) return false;
  const b = config.horizontalBounds;
  if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) return false;
  if (p.y < config.minAltitudeM || p.y > config.maxAltitudeM) return false;
  for (const zone of config.forbiddenZones) {
    const dx = p.x - zone.centerX;
    const dz = p.z - zone.centerZ;
    const insideXZ = dx * dx + dz * dz <= zone.radiusM * zone.radiusM;
    const insideY = p.y >= zone.minY && p.y <= zone.maxY;
    if (insideXZ && insideY) return false;
  }
  return true;
}

/** Section 16 — home position first, then the arena config's own validated fallback list, in order. Returns null only when NOTHING validates (defensive; should not occur with a well-formed config). */
function validateTeleportTarget(context: DroneStuckRecoveryContext): Vec3Data | null {
  if (isValidTeleportPoint(context.homePosition, context.config)) return { x: context.homePosition.x, y: context.homePosition.y, z: context.homePosition.z };
  for (const candidate of context.config.safeFallbackPositions) {
    if (isValidTeleportPoint(candidate, context.config)) return { x: candidate.x, y: candidate.y, z: candidate.z };
  }
  return null;
}

function idleDecision(): DroneRecoveryDecision {
  return { stuckDetected: false, recoveryActive: false, movementOverride: null, teleportTarget: null, clearDetectorWindow: false };
}

function freshRuntime(position: Vec3Data): DroneStuckRecoveryRuntime {
  const safePosition = isFiniteVec(position) ? { x: position.x, y: position.y, z: position.z } : { x: 0, y: 0, z: 0 };
  return {
    phase: 'idle',
    windowStartedAtMs: null,
    expectedDistanceAccumM: 0,
    actualDistanceAccumM: 0,
    lastSampleAtMs: null,
    recoveryStartedAtMs: null,
    recoveryUntilMs: null,
    cooldownUntilMs: null,
    attemptCountThisLife: 0,
    teleportCountThisLife: 0,
    lastStablePosition: safePosition,
    activeDirection: ZERO_VEC,
    activeSpeedMps: 0,
    teleportTarget: null,
  };
}

/** Fresh construction — mirrors `createLegacyDroneRuntime`'s own naming/shape convention. */
export function createDroneStuckRecoveryRuntime(position: Vec3Data): DroneStuckRecoveryRuntime {
  return freshRuntime(position);
}

/** Full life reset (match restart) — every field clears, including `attemptCountThisLife`/`teleportCountThisLife`. Mirrors `resetLegacyDroneRuntime`'s own "starts fresh every life" convention. */
export function resetDroneStuckRecoveryRuntime(position: Vec3Data): DroneStuckRecoveryRuntime {
  return freshRuntime(position);
}

/**
 * Lighter clear for a player-life-generation change (death/respawn) —
 * Section 20: aborts any active recovery movement and clears the detector
 * window, but explicitly RETAINS `attemptCountThisLife`/
 * `teleportCountThisLife` (it is still the same DRONE life; only the
 * player's life changed).
 */
export function clearActiveDroneStuckRecovery(runtime: DroneStuckRecoveryRuntime, position: Vec3Data): DroneStuckRecoveryRuntime {
  const safePosition = isFiniteVec(position) ? { x: position.x, y: position.y, z: position.z } : runtime.lastStablePosition;
  return {
    ...runtime,
    phase: 'idle',
    windowStartedAtMs: null,
    expectedDistanceAccumM: 0,
    actualDistanceAccumM: 0,
    lastSampleAtMs: null,
    recoveryStartedAtMs: null,
    recoveryUntilMs: null,
    cooldownUntilMs: null,
    activeDirection: ZERO_VEC,
    activeSpeedMps: 0,
    teleportTarget: null,
    lastStablePosition: safePosition,
  };
}

/**
 * Section 18 — stun takes precedence over recovery. The adapter calls THIS
 * (instead of `resolveDroneStuckRecovery`) on any tick `decision.stunned` is
 * true: idle/cooldown are left untouched (nothing accumulates while
 * stunned, matching "new stuck samples not accumulated" — the caller simply
 * never calls the normal per-tick function this tick either way); an ACTIVE
 * recovery episode is aborted straight into `cooldown` per the brief's own
 * "Preferred behaviour."
 */
export function onDroneStunned(runtime: DroneStuckRecoveryRuntime, nowMs: number): DroneStuckRecoveryRuntime {
  const isActive = runtime.phase !== 'idle' && runtime.phase !== 'cooldown';
  if (!isActive) return runtime;
  return {
    ...runtime,
    phase: 'cooldown',
    recoveryStartedAtMs: null,
    recoveryUntilMs: null,
    cooldownUntilMs: nowMs + DRONE_RECOVERY_TUNING.cooldownDurationMs,
    activeDirection: ZERO_VEC,
    activeSpeedMps: 0,
    teleportTarget: null,
  };
}

/** Section 19 — explicit clear on the exact tick destruction is first detected. Behaviourally redundant with the adapter's own early-return-on-destroyed (this runtime is never read again until reset), but explicit per the brief. */
export function onDroneDestroyed(runtime: DroneStuckRecoveryRuntime): DroneStuckRecoveryRuntime {
  return {
    ...runtime,
    phase: 'idle',
    windowStartedAtMs: null,
    expectedDistanceAccumM: 0,
    actualDistanceAccumM: 0,
    recoveryStartedAtMs: null,
    recoveryUntilMs: null,
    cooldownUntilMs: null,
    activeDirection: ZERO_VEC,
    activeSpeedMps: 0,
    teleportTarget: null,
  };
}

function beginMovementRecovery(runtime: DroneStuckRecoveryRuntime, sample: DroneStuckSample, context: DroneStuckRecoveryContext, now: number, phase: 'nudging' | 'backing-away' | 'altitude-correcting'): { runtime: DroneStuckRecoveryRuntime; decision: DroneRecoveryDecision } {
  // A fresh detection (reported via `decision.stuckDetected`) happens on
  // exactly one transition: idle -> nudging. Every other call into this
  // function is an in-episode ESCALATION (nudging -> backing-away ->
  // altitude-correcting), not a new detection event.
  const isFreshDetection = runtime.phase === 'idle' && phase === 'nudging';
  const attemptCountThisLife = runtime.attemptCountThisLife + 1;
  let direction: Vec3Data;
  let duration: number;
  let speed: number;
  if (phase === 'nudging') {
    direction = computeNudgeDirection(sample.requestedDirection, context, attemptCountThisLife);
    duration = DRONE_RECOVERY_TUNING.nudgeDurationMs;
    speed = context.speedMps;
  } else if (phase === 'backing-away') {
    direction = computeBackAwayDirection(sample.requestedDirection, context, attemptCountThisLife);
    duration = DRONE_RECOVERY_TUNING.backAwayDurationMs;
    speed = context.speedMps;
  } else {
    direction = computeAltitudeDirection(context);
    duration = DRONE_RECOVERY_TUNING.altitudeCorrectDurationMs;
    speed = DRONE_RECOVERY_TUNING.altitudeCorrectSpeedMps;
  }
  const newRuntime: DroneStuckRecoveryRuntime = {
    ...runtime,
    phase,
    windowStartedAtMs: null,
    expectedDistanceAccumM: 0,
    actualDistanceAccumM: 0,
    lastSampleAtMs: null,
    recoveryStartedAtMs: now,
    recoveryUntilMs: now + duration,
    attemptCountThisLife,
    lastStablePosition: { x: context.currentPosition.x, y: context.currentPosition.y, z: context.currentPosition.z },
    activeDirection: direction,
    activeSpeedMps: speed,
    teleportTarget: null,
  };
  return { runtime: newRuntime, decision: { stuckDetected: isFreshDetection, recoveryActive: true, movementOverride: scaleDirection(direction, speed), teleportTarget: null, clearDetectorWindow: true } };
}

function beginTeleport(runtime: DroneStuckRecoveryRuntime, context: DroneStuckRecoveryContext, now: number, attemptCountThisLife: number): { runtime: DroneStuckRecoveryRuntime; decision: DroneRecoveryDecision } {
  const eligible = runtime.teleportCountThisLife < DRONE_RECOVERY_TUNING.maxTeleportsPerLife && attemptCountThisLife >= DRONE_RECOVERY_TUNING.minFailedAttemptsBeforeTeleport;
  const target = eligible ? validateTeleportTarget(context) : null;

  if (!target) {
    // Not eligible, or genuinely no valid fallback exists — stop escalating,
    // enter cooldown rather than loop forever attempting an invalid teleport.
    const cooled: DroneStuckRecoveryRuntime = {
      ...runtime,
      phase: 'cooldown',
      attemptCountThisLife,
      recoveryStartedAtMs: null,
      recoveryUntilMs: null,
      cooldownUntilMs: now + DRONE_RECOVERY_TUNING.cooldownDurationMs,
      activeDirection: ZERO_VEC,
      activeSpeedMps: 0,
      teleportTarget: null,
    };
    return { runtime: cooled, decision: { stuckDetected: false, recoveryActive: false, movementOverride: null, teleportTarget: null, clearDetectorWindow: true } };
  }

  const newRuntime: DroneStuckRecoveryRuntime = {
    ...runtime,
    phase: 'teleport-fallback',
    attemptCountThisLife,
    recoveryStartedAtMs: now,
    recoveryUntilMs: now,
    teleportCountThisLife: runtime.teleportCountThisLife + 1,
    lastStablePosition: { x: target.x, y: target.y, z: target.z },
    activeDirection: ZERO_VEC,
    activeSpeedMps: 0,
    teleportTarget: target,
  };
  return { runtime: newRuntime, decision: { stuckDetected: false, recoveryActive: true, movementOverride: null, teleportTarget: target, clearDetectorWindow: true } };
}

function resolveIdlePhase(runtime: DroneStuckRecoveryRuntime, sample: DroneStuckSample, context: DroneStuckRecoveryContext, now: number, clockReversed: boolean): { runtime: DroneStuckRecoveryRuntime; decision: DroneRecoveryDecision } {
  if (clockReversed || !sample.wantsMovement) {
    if (runtime.windowStartedAtMs === null && runtime.expectedDistanceAccumM === 0 && runtime.actualDistanceAccumM === 0) {
      return { runtime, decision: idleDecision() };
    }
    return { runtime: { ...runtime, windowStartedAtMs: null, expectedDistanceAccumM: 0, actualDistanceAccumM: 0 }, decision: idleDecision() };
  }

  const windowStartedAtMs = runtime.windowStartedAtMs ?? now;
  const expectedDistanceAccumM = runtime.expectedDistanceAccumM + sample.expectedDisplacementM;
  const actualDistanceAccumM = runtime.actualDistanceAccumM + sample.actualDisplacementM;
  const windowElapsed = now - windowStartedAtMs;
  const dueForSample = runtime.lastSampleAtMs === null || now - runtime.lastSampleAtMs >= DRONE_STUCK_DETECTOR.sampleIntervalMs;

  if (windowElapsed >= DRONE_STUCK_DETECTOR.windowDurationMs && dueForSample) {
    const enoughExpected = expectedDistanceAccumM >= DRONE_STUCK_DETECTOR.minExpectedDistanceM;
    const ratio = expectedDistanceAccumM > ZERO_LENGTH_EPSILON ? actualDistanceAccumM / expectedDistanceAccumM : 1;
    if (enoughExpected && ratio < DRONE_STUCK_DETECTOR.progressRatioThreshold) {
      return beginMovementRecovery(runtime, sample, context, now, 'nudging');
    }
    // Window completed without confirming stuck — restart fresh (never grows unbounded).
    return { runtime: { ...runtime, windowStartedAtMs: now, expectedDistanceAccumM: 0, actualDistanceAccumM: 0, lastSampleAtMs: now }, decision: idleDecision() };
  }

  return {
    runtime: { ...runtime, windowStartedAtMs, expectedDistanceAccumM, actualDistanceAccumM, lastSampleAtMs: dueForSample ? now : runtime.lastSampleAtMs },
    decision: idleDecision(),
  };
}

function resolveCooldownPhase(runtime: DroneStuckRecoveryRuntime, now: number): { runtime: DroneStuckRecoveryRuntime; decision: DroneRecoveryDecision } {
  const deadline = runtime.cooldownUntilMs ?? now;
  if (now < deadline) return { runtime, decision: idleDecision() };
  return { runtime: { ...runtime, phase: 'idle', cooldownUntilMs: null }, decision: idleDecision() };
}

function resolveActiveMovementPhase(runtime: DroneStuckRecoveryRuntime, sample: DroneStuckSample, context: DroneStuckRecoveryContext, now: number): { runtime: DroneStuckRecoveryRuntime; decision: DroneRecoveryDecision } {
  const deadline = runtime.recoveryUntilMs ?? now;
  if (now < deadline) {
    return { runtime, decision: { stuckDetected: false, recoveryActive: true, movementOverride: scaleDirection(runtime.activeDirection, runtime.activeSpeedMps), teleportTarget: null, clearDetectorWindow: false } };
  }

  const dx = context.currentPosition.x - runtime.lastStablePosition.x;
  const dy = context.currentPosition.y - runtime.lastStablePosition.y;
  const dz = context.currentPosition.z - runtime.lastStablePosition.z;
  const progressed = vecLength(dx, dy, dz) >= DRONE_RECOVERY_TUNING.escapeProgressMinM;

  if (progressed) {
    const cooled: DroneStuckRecoveryRuntime = { ...runtime, phase: 'cooldown', recoveryStartedAtMs: null, recoveryUntilMs: null, cooldownUntilMs: now + DRONE_RECOVERY_TUNING.cooldownDurationMs, activeDirection: ZERO_VEC, activeSpeedMps: 0, teleportTarget: null };
    return { runtime: cooled, decision: { stuckDetected: false, recoveryActive: false, movementOverride: null, teleportTarget: null, clearDetectorWindow: true } };
  }

  if (runtime.phase === 'nudging') return beginMovementRecovery(runtime, sample, context, now, 'backing-away');
  if (runtime.phase === 'backing-away') {
    if (altitudeEvidenceJustifiesCorrection(sample, context)) return beginMovementRecovery(runtime, sample, context, now, 'altitude-correcting');
    return beginTeleport(runtime, context, now, runtime.attemptCountThisLife);
  }
  // 'altitude-correcting' exhausted.
  return beginTeleport(runtime, context, now, runtime.attemptCountThisLife);
}

function resolveTeleportPhase(runtime: DroneStuckRecoveryRuntime, now: number): { runtime: DroneStuckRecoveryRuntime; decision: DroneRecoveryDecision } {
  // The teleport itself was applied by the caller on the tick it was
  // requested (the previous call's `decision.teleportTarget`) — this tick
  // just closes the episode into cooldown. `teleportTarget` is never
  // re-issued here, so a caller can never apply it twice.
  const cooled: DroneStuckRecoveryRuntime = { ...runtime, phase: 'cooldown', recoveryStartedAtMs: null, recoveryUntilMs: null, cooldownUntilMs: now + DRONE_RECOVERY_TUNING.cooldownDurationMs, teleportTarget: null };
  return { runtime: cooled, decision: { stuckDetected: false, recoveryActive: false, movementOverride: null, teleportTarget: null, clearDetectorWindow: false } };
}

/**
 * The one per-substep pure stuck-recovery resolver. Deterministic given
 * identical inputs — no RNG, no clock (all timestamps explicit). Returns a
 * FRESH runtime (never mutates `runtime` in place), mirroring
 * `decideLegacyDroneAi`'s own "caller replaces its stored runtime wholesale"
 * convention.
 *
 * SAFE-INPUT CONTRACT: malformed sample data (non-finite numbers/vectors)
 * never corrupts the runtime or propagates NaN — the runtime is returned
 * unchanged and the decision degrades to a safe no-op hold.
 */
export function resolveDroneStuckRecovery(runtime: DroneStuckRecoveryRuntime, sample: DroneStuckSample, context: DroneStuckRecoveryContext): { runtime: DroneStuckRecoveryRuntime; decision: DroneRecoveryDecision } {
  const now = sample.nowMs;
  const sampleValid =
    Number.isFinite(now) &&
    isFiniteVec(sample.requestedDirection) &&
    isFiniteVec(sample.actualDisplacement) &&
    Number.isFinite(sample.expectedDisplacementM) &&
    Number.isFinite(sample.actualDisplacementM) &&
    isFiniteVec(context.currentPosition) &&
    isFiniteVec(context.homePosition) &&
    Number.isFinite(context.speedMps);

  if (!sampleValid) return { runtime, decision: idleDecision() };

  const clockReversed = runtime.windowStartedAtMs !== null && now < runtime.windowStartedAtMs;

  switch (runtime.phase) {
    case 'idle':
      return resolveIdlePhase(runtime, sample, context, now, clockReversed);
    case 'cooldown':
      return resolveCooldownPhase(runtime, now);
    case 'nudging':
    case 'backing-away':
    case 'altitude-correcting':
      return resolveActiveMovementPhase(runtime, sample, context, now);
    case 'teleport-fallback':
      return resolveTeleportPhase(runtime, now);
    default:
      return { runtime, decision: idleDecision() };
  }
}
