/**
 * Milestone 9H — pure, dev-only DRONE AI OBSERVABILITY container. Same
 * guarantee as the rest of `lib/v2/ai/` — no React, no R3F, no Three.js, no
 * Rapier, no Zustand, no browser globals, no `Math.random`/`performance.now`/
 * `Date.now` (enforced by `droneAiImportGuards.test.ts`'s new 9H describe
 * block, mirroring every prior milestone's own pure-core guard).
 *
 * SCOPE: this module is a plain, mutable, one-way TELEMETRY SINK — it never
 * reads gameplay state itself and never feeds anything back into it. The
 * adapter (`DroneEnemy.tsx`/`DroneSquad.tsx`) writes real, already-computed
 * decision/movement/perception/recovery/coordination facts into the records
 * this module creates; the DOM panel (`DroneAiDebugPanel.tsx`) and the R3F
 * helpers (`DroneAiDebugHelpers.tsx`) only ever READ them. There is no
 * mutation-command API anywhere in this file — nothing here can change a
 * drone's HP, position, target visibility, recovery phase, lease ownership,
 * cooldowns, reaction deadlines, RNG state, player state, difficulty, or
 * match phase. See `docs/decisions.md`'s Milestone 9H entry for the full
 * one-way data-flow diagram.
 *
 * OWNERSHIP MODEL: route-owned, not a module-level singleton.
 * `DroneSquad.tsx` creates exactly ONE `DroneAiDebugRuntime` per mounted
 * `/v2/play` scene (`useRef`, mirroring `coordinatorRuntimeRef`'s own
 * established convention) — a route remount discards the whole component
 * instance, and with it this runtime, so there is no possible cross-mount
 * staleness. Every record inside it is looked up/created through the
 * explicit registration API below, never a bare object literal assigned
 * ad hoc, so "duplicate registration does not duplicate" and "unregister
 * removes record" hold by construction.
 *
 * WRITE-PATH DISCIPLINE (Section 6 of the phase brief): every setter here is
 * a PLAIN, IN-PLACE FIELD ASSIGNMENT — no array growth, no JSON.stringify, no
 * console logging, no cloning of large objects on the hot per-substep path
 * (`registerDroneAiDebugDrone`/`reregisterDroneAiDebugRoster` are the only
 * functions that allocate, and both run only on ROSTER CHANGE — a difficulty
 * switch or a restart — never once per substep). Every timestamp is supplied
 * explicitly by the caller (the adapter already has `now` from its own
 * fixed-step substep) — this module never reads the clock itself.
 */

export interface DroneAiDebugVec3 {
  x: number;
  y: number;
  z: number;
}

function freshVec3(): DroneAiDebugVec3 {
  return { x: 0, y: 0, z: 0 };
}

/**
 * One drone's own observable telemetry, as of the end of its most recent
 * `update()` substep. Every field's real source owner is documented at its
 * write site (`DroneEnemy.tsx`'s own `writeDebugTelemetry` handle method) and
 * summarized in `docs/decisions.md`'s Milestone 9H field/source table. Vector
 * sub-objects (`tacticalPosition`/`visualPosition`/`finalMovement`/
 * `lastKnownPosition`) are always FRESH COPIES the adapter writes field-by-
 * field into a stable, preallocated object — never a retained reference into
 * a live `THREE.Vector3` or the pure core's own runtime data, mirroring
 * `droneAiTypes.ts`'s own "always copy, never retain" discipline.
 */
export interface DroneAiDebugDroneSnapshot {
  readonly id: string;

  runtimeState: string;
  stateEnteredAtMs: number;
  timeInStateMs: number;
  lastTransitionReason: string | null;

  targetVisible: boolean;
  targetDistanceM: number | null;
  lastKnownPosition: DroneAiDebugVec3 | null;
  memoryRemainingMs: number | null;
  reactionRemainingMs: number | null;

  movementMode: string;
  finalMovement: DroneAiDebugVec3;
  expectedDisplacementM: number;
  actualDisplacementM: number;

  tacticalPosition: DroneAiDebugVec3;
  visualPosition: DroneAiDebugVec3;

  horizontalClamped: boolean;
  altitudeClamped: boolean;
  windLiftCorrected: boolean;

  recoveryPhase: string;
  recoveryAttemptCount: number;
  recoveryTeleportCount: number;
  detectorProgressRatio: number | null;
  detectorWindowAgeMs: number | null;

  attackEligible: boolean;
  coordinationBlocked: boolean;
  hasAttackLease: boolean;
  sectorIndex: number | null;
  windupRemainingMs: number | null;
  cooldownRemainingMs: number | null;
  telegraphPhase: string;

  decisionTickCount: number;
  fireCount: number;
}

/** Squad-level telemetry — one instance per mounted scene, updated once per fixed-step substep by `DroneSquad.tsx` from values it already computes for real gameplay (never a second, parallel computation). */
export interface DroneAiDebugSquadSnapshot {
  readonly sessionId: number;
  difficultyId: string;
  mountedDroneCount: number;
  shooterCap: number;
  sectorCount: number;
  activeLeaseCount: number;
  reservedSectorCount: number;
  simulationSubsteps: number;
  lastUpdatedAtMs: number;
}

export interface DroneAiDebugRuntime {
  sessionId: number;
  squad: DroneAiDebugSquadSnapshot;
  drones: Map<string, DroneAiDebugDroneSnapshot>;
}

function createDroneAiDebugSquadSnapshot(sessionId: number, nowMs: number): DroneAiDebugSquadSnapshot {
  return {
    sessionId,
    difficultyId: '',
    mountedDroneCount: 0,
    shooterCap: 0,
    sectorCount: 0,
    activeLeaseCount: 0,
    reservedSectorCount: 0,
    simulationSubsteps: 0,
    lastUpdatedAtMs: nowMs,
  };
}

/** Fresh, all-default record for one drone ID — never partially initialized. */
export function createDroneAiDebugDroneSnapshot(id: string, nowMs: number): DroneAiDebugDroneSnapshot {
  return {
    id,
    runtimeState: 'spawning',
    stateEnteredAtMs: nowMs,
    timeInStateMs: 0,
    lastTransitionReason: null,
    targetVisible: false,
    targetDistanceM: null,
    lastKnownPosition: null,
    memoryRemainingMs: null,
    reactionRemainingMs: null,
    movementMode: 'hold',
    finalMovement: freshVec3(),
    expectedDisplacementM: 0,
    actualDisplacementM: 0,
    tacticalPosition: freshVec3(),
    visualPosition: freshVec3(),
    horizontalClamped: false,
    altitudeClamped: false,
    windLiftCorrected: false,
    recoveryPhase: 'idle',
    recoveryAttemptCount: 0,
    recoveryTeleportCount: 0,
    detectorProgressRatio: null,
    detectorWindowAgeMs: null,
    attackEligible: false,
    coordinationBlocked: false,
    hasAttackLease: false,
    sectorIndex: null,
    windupRemainingMs: null,
    cooldownRemainingMs: null,
    telegraphPhase: 'idle',
    decisionTickCount: 0,
    fireCount: 0,
  };
}

/** The canonical empty runtime — one per mounted scene (see this module's own ownership-model doc comment above). */
export function createDroneAiDebugRuntime(sessionId: number, nowMs: number): DroneAiDebugRuntime {
  return { sessionId, squad: createDroneAiDebugSquadSnapshot(sessionId, nowMs), drones: new Map() };
}

/** Clears every drone record and resets squad meta to fresh defaults, in place — the container object's own identity (and thus the Map any panel/helper already holds a reference to) never changes. Does NOT touch `sessionId` — use `reregisterDroneAiDebugRoster` with a new id for that. */
export function resetDroneAiDebugRuntime(runtime: DroneAiDebugRuntime, nowMs: number): void {
  runtime.drones.clear();
  runtime.squad = createDroneAiDebugSquadSnapshot(runtime.sessionId, nowMs);
}

/** Idempotent — a duplicate registration for an already-known ID returns the EXISTING record unchanged rather than creating a second one. */
export function registerDroneAiDebugDrone(runtime: DroneAiDebugRuntime, id: string, nowMs: number): DroneAiDebugDroneSnapshot {
  const existing = runtime.drones.get(id);
  if (existing) return existing;
  const created = createDroneAiDebugDroneSnapshot(id, nowMs);
  runtime.drones.set(id, created);
  return created;
}

export function unregisterDroneAiDebugDrone(runtime: DroneAiDebugRuntime, id: string): void {
  runtime.drones.delete(id);
}

/**
 * Full roster rebuild — used on a roster-membership CHANGE (a difficulty
 * switch, where the set of drone IDs itself is different) and returns a
 * fresh, stably-ordered (spawn order, matching `spawns`/`droneRefs.current`'s
 * own existing 1:1 index correspondence) array for the caller's own hot-path
 * use — mirrors `spatialSnapshots`/`attackRequests`'s established "rebuilt
 * only when `spawns` itself changes" convention (`DroneSquad.tsx`). Clears
 * every existing record first (old IDs from a shrunk roster leave no stale
 * data), then registers every current ID fresh.
 */
export function reregisterDroneAiDebugRoster(runtime: DroneAiDebugRuntime, ids: readonly string[], nowMs: number): DroneAiDebugDroneSnapshot[] {
  resetDroneAiDebugRuntime(runtime, nowMs);
  return ids.map((id) => registerDroneAiDebugDrone(runtime, id, nowMs));
}

/**
 * Restart-only (roster MEMBERSHIP unchanged — same IDs, same life count):
 * clears one existing record back to fresh defaults IN PLACE, preserving its
 * object identity (so an already-built, index-matched array of record
 * references — see `reregisterDroneAiDebugRoster`'s own return value — never
 * goes stale after a restart that doesn't also change the roster).
 */
export function clearDroneAiDebugDroneSnapshot(record: DroneAiDebugDroneSnapshot, nowMs: number): void {
  Object.assign(record, createDroneAiDebugDroneSnapshot(record.id, nowMs));
}

export function resetDroneAiDebugSquadMeta(runtime: DroneAiDebugRuntime, nowMs: number): void {
  runtime.squad = createDroneAiDebugSquadSnapshot(runtime.sessionId, nowMs);
}

/**
 * Records a state transition on an existing record — a no-op re-stamp of
 * `timeInStateMs` when the state hasn't actually changed, or a full
 * transition (new `stateEnteredAtMs`, cleared/updated `lastTransitionReason`)
 * when it has. Callers pass the reason string they already know (derived
 * from real decision facts — see `DroneEnemy.tsx`'s own doc comment on
 * `writeDebugTelemetry`), never invented here.
 */
export function noteDroneAiDebugStateChange(record: DroneAiDebugDroneSnapshot, newState: string, nowMs: number, reason: string | null): void {
  if (record.runtimeState !== newState) {
    record.runtimeState = newState;
    record.stateEnteredAtMs = nowMs;
    record.lastTransitionReason = reason;
  }
  record.timeInStateMs = Math.max(0, nowMs - record.stateEnteredAtMs);
}

/** Deterministic, stable-ID-sorted presentation order — the panel/helpers must never rely on Map iteration (insertion) order, which can silently shift across a partial roster reconciliation. */
export function listDroneAiDebugDrones(runtime: DroneAiDebugRuntime): DroneAiDebugDroneSnapshot[] {
  return Array.from(runtime.drones.values()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Display-only finite-number normalization — NEVER mutates the source value, only the value returned to a renderer. NaN/Infinity collapse to `fallback`. */
export function normalizeFiniteDisplayNumber(value: number | null | undefined, fallback: number): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return value;
}

/** Display-only fixed-precision formatting — never mutates the source value; `null`/non-finite render as an explicit em dash rather than "NaN"/"Infinity"/"null". */
export function formatDroneAiDebugNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(decimals);
}
