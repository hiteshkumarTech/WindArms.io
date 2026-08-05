import type { TrialDifficulty } from '../play/difficulty';
import type { Vec3Data } from './droneAiTypes';

/**
 * Milestone 9G — pure, deterministic SQUAD ATTACK-PERMIT COORDINATOR. Same
 * guarantee as the rest of `lib/v2/ai/` — no React, no R3F, no Three.js, no
 * Rapier, no Zustand, no browser globals, no `Math.random`/`performance.now`/
 * `Date.now` (enforced by `droneAiImportGuards.test.ts`).
 *
 * SCOPE (per this phase's own brief): this module answers exactly one
 * question per fixed substep — "given every drone's own attack REQUEST this
 * tick, which requests are GRANTED an attack permit, and which angular
 * sector does each granted permit occupy?" It does NOT decide state
 * (`droneAiStateMachine.ts`, untouched in shape), does NOT decide movement
 * (`droneAiMovementIntent.ts`, untouched), and NEVER produces a movement
 * destination, waypoint, or steering vector of any kind — see "CRITICAL
 * SCOPE DECISION" below.
 *
 * CRITICAL SCOPE DECISION — FIRING-PERMIT SECTORS ARE NOT MOVEMENT
 * DESTINATIONS. A `sector` here is PURELY descriptive metadata: the angular
 * slice (around the player, in the XZ plane) a drone's CURRENT tactical
 * position already happened to fall into at the exact moment its lease was
 * granted (see `resolveTacticalSectorIndex` below). It is captured once,
 * never recomputed while a lease is held, and NEVER fed back into
 * `droneAiMovementIntent.ts` or any steering/facing decision — a drone is
 * NEVER nudged, steered, or teleported toward "its" sector. The sector
 * exists purely so simultaneous attackers are naturally spread rather than
 * clustered, using wherever combat/separation (9D) and range-banding (9B)
 * already put them — never to relocate a drone that wasn't already there.
 *
 * ARCHITECTURE — EVENT-DRIVEN LEASE ASSIGNMENT, NOT PER-DRONE POLLING: this
 * module does not change any individual drone's own decision schedule or
 * timing (fire cooldown, windup duration, reaction delay — all untouched
 * since 9E). Instead, the ADAPTER (`DroneEnemy.tsx`) reports a lightweight,
 * side-effect-free REQUEST once per substep (`prepareAttackRequest`, run
 * BEFORE any drone's real `decideLegacyDroneAi` call this substep — see
 * `DroneSquad.tsx`'s own doc comment for the exact three-phase pass order),
 * this module resolves ALL requests into permits in one deterministic pass,
 * and the adapter's real `update()` call then folds the result back in as
 * ONE new optional `LegacyDroneAiObservation` field
 * (`coordinationBlocksAttack` — see `droneAiTypes.ts`'s own doc comment),
 * mirroring `recoveryBlocksAttack`'s own established 9F precedent exactly.
 *
 * ORDER-INDEPENDENCE (explicit, tested requirement): `resolveDroneSquadCoordination`
 * below NEVER grants permits by iterating `requests` in caller-supplied
 * order — every candidate is explicitly SORTED by the deterministic fairness
 * comparator below before any grant decision is made, so the result is
 * identical regardless of what order `DroneSquad.tsx` happens to iterate its
 * `droneRefs` array in. This is a hard requirement from the phase brief: "Do
 * not choose an order-dependent 'first drone to call wins' design."
 *
 * STICKY LEASES: once granted, a lease is retained across ticks — see the
 * "release" step in `resolveDroneSquadCoordination` below — for as long as
 * the SAME drone continues to report `wantsAttack: true`. It is NEVER
 * revoked merely because a higher-fairness-priority candidate later appears;
 * fairness ranking is consulted ONLY when assigning permits among drones
 * that do not currently hold one. `wantsAttack` itself already folds in
 * every real combat-gate condition (state, visibility, stun, recovery,
 * reaction-readiness, cooldown — see `DroneEnemy.tsx`'s own
 * `prepareAttackRequest` doc comment for the exact mirrored predicate) — a
 * PROVEN property of that predicate (documented there, exercised by this
 * module's own test suite) is that for an ALREADY-`attacking` drone,
 * `wantsAttack` can only flip false via stun, LOS loss, or recovery — i.e.
 * the exact same three conditions that already independently trigger
 * `droneAiStateMachine.ts`'s own pre-existing abort branch. Coordination can
 * therefore never truncate a windup that would otherwise have completed —
 * a lease release always co-occurs with an already-happening real abort,
 * never causes a standalone one.
 *
 * NO GLOBAL VOLLEY TIMER: this module introduces no fire-rate/cooldown
 * concept of its own. `DroneSquadLease.grantedAtMs`/`grantedAtOrdinal` exist
 * purely for fairness bookkeeping (least-recently-granted ranking) and
 * telemetry — nothing here gates or paces WHEN a permit-holder is allowed to
 * fire; that remains entirely `droneAiStateMachine.ts`'s own per-drone
 * `fireIntervalMs`/`lastFireAtMs` contract, untouched since 9B.
 *
 * NO RNG: every tie the fairness comparator can produce resolves
 * deterministically via the stable drone-ID string compare as the final
 * tiebreak — this module never calls `Math.random` and consumes no
 * `RandomSource` stream.
 */

/** Angular divisions (XZ plane, around the player) a granted lease's sector is drawn from — a fixed geometric constant, not a difficulty lever (see this module's own doc comment on why sector count itself is never difficulty-scaled). */
const SECTOR_COUNT = 8;

/**
 * Max concurrent attack-permit holders per difficulty — the ONE actual
 * difficulty lever this module introduces. Chosen so Medium (the byte-
 * identical-since-9B baseline difficulty) still allows meaningfully MORE
 * than one simultaneous attacker (this is a cap, not a return to "only one
 * drone may ever attack"), while Low caps tighter (fewer simultaneous
 * threats while learning the arena) and Max allows the most concurrent
 * pressure (matching its own existing faster-cooldown/tighter-aim identity
 * from `difficulty.ts`) without ever un-capping entirely (still well under
 * the full 8-drone roster, so "a controlled rotation of attackers" — this
 * phase's own closing framing — remains true even at Max).
 */
const MAX_CONCURRENT_ATTACKERS: Record<TrialDifficulty, number> = {
  low: 2,
  medium: 3,
  max: 4,
};

export interface DroneSquadCoordinationProfile {
  maxConcurrentAttackers: number;
  sectorCount: number;
}

/** The one function every 9G consumer resolves through — mirrors `resolveDroneAiDifficultyProfile`'s own "resolve once per difficulty change, never per-frame" convention (see `DroneSquad.tsx`). */
export function resolveDroneSquadCoordinationProfile(difficulty: TrialDifficulty): DroneSquadCoordinationProfile {
  return {
    maxConcurrentAttackers: MAX_CONCURRENT_ATTACKERS[difficulty],
    sectorCount: SECTOR_COUNT,
  };
}

/**
 * One drone's own attack-permit REQUEST for this substep — built by the
 * adapter's `prepareAttackRequest` (`DroneEnemy.tsx`), read-only from this
 * module's perspective. `wantsAttack` already folds in every real
 * combat-gate condition; `dronePosition`/`targetPosition` are only consumed
 * (to derive a sector) for candidates actually being granted a NEW lease
 * this tick — see `resolveTacticalSectorIndex` below.
 */
export interface DroneAttackRequest {
  droneId: string;
  wantsAttack: boolean;
  dronePosition: Vec3Data;
  targetPosition: Vec3Data;
  /** `max(lastFireAtMs + fireIntervalMs, reactionReadyAtMs ?? -Infinity)` — the exact deadline this drone's own real combat gate first became satisfied. Used only as a fairness tiebreak among candidates that are ALL already-eligible this tick (earlier deadline = waited longer = ranked first). */
  attackReadyAtMs: number;
}

export interface DroneAttackPermit {
  granted: boolean;
  /** Non-null exactly when `granted` — the angular sector (see this module's own doc comment) this lease was assigned AT GRANT TIME. Informational/telegraph-only; never a movement input. */
  sector: number | null;
}

interface DroneSquadLease {
  sector: number;
  grantedAtOrdinal: number;
  grantedAtMs: number;
}

export interface DroneSquadCoordinatorRuntime {
  leases: ReadonlyMap<string, DroneSquadLease>;
  /** droneId -> the ordinal of its most recent grant (absent = never granted this life) — feeds the "never-granted-first" / "least-recently-granted" fairness ranking. Survives a lease's own release (deliberately NOT cleared when a lease ends) so a drone that just finished its turn is correctly deprioritized versus one that has never had a turn, even though neither currently holds a lease. */
  grantHistory: ReadonlyMap<string, number>;
  nextGrantOrdinal: number;
}

export function createDroneSquadCoordinatorRuntime(): DroneSquadCoordinatorRuntime {
  return { leases: new Map(), grantHistory: new Map(), nextGrantOrdinal: 0 };
}

/** Full reset (match restart) — every lease and every fairness-history entry clears; the very next permit ever granted after a restart starts `grantedAtOrdinal` back at 0. Mirrors `resetDroneStuckRecoveryRuntime`'s own "starts fresh every life" convention. */
export function resetDroneSquadCoordinatorRuntime(): DroneSquadCoordinatorRuntime {
  return createDroneSquadCoordinatorRuntime();
}

/**
 * Deterministic tactical-angle sector index — the drone's CURRENT XZ
 * position relative to the player, bucketed into one of `sectorCount` equal
 * angular slices. Pure geometry, no RNG, no state. Degenerate input (a drone
 * exactly coincident with the player, `dx===dz===0`) resolves to sector 0
 * via `Math.atan2(0,0)===0` — deterministic, never NaN, never occurs in
 * practice (drones never occupy the player's exact position) but handled
 * safely regardless.
 */
export function resolveTacticalSectorIndex(dronePosition: Vec3Data, targetPosition: Vec3Data, sectorCount: number): number {
  const dx = dronePosition.x - targetPosition.x;
  const dz = dronePosition.z - targetPosition.z;
  const angle = Math.atan2(dz, dx);
  const normalized = angle < 0 ? angle + Math.PI * 2 : angle;
  const sector = Math.floor((normalized / (Math.PI * 2)) * sectorCount);
  // Defensive clamp only — guards the extreme floating-point edge where
  // `normalized` rounds up to exactly `2*PI`, which would otherwise produce
  // `sector === sectorCount` (one past the valid range).
  return Math.min(sectorCount - 1, Math.max(0, sector));
}

/**
 * Deterministic fairness comparator — ranks CANDIDATES (drones that want a
 * permit but do not currently hold one) for the limited grant slots this
 * tick. Never consulted for a drone that already holds a lease (those are
 * retained unconditionally by the release step, see
 * `resolveDroneSquadCoordination` below) — this only decides who goes NEXT.
 *
 * Order: never-granted-first -> least-recently-granted-ordinal ->
 * earliest-attackReadyAtMs -> stable-drone-ID tiebreak. Every branch is a
 * pure comparison of already-known plain data — no RNG, no clock read.
 */
function compareCandidates(a: DroneAttackRequest, b: DroneAttackRequest, grantHistory: ReadonlyMap<string, number>): number {
  const aGranted = grantHistory.has(a.droneId);
  const bGranted = grantHistory.has(b.droneId);
  if (aGranted !== bGranted) return aGranted ? 1 : -1;
  if (aGranted && bGranted) {
    const aOrdinal = grantHistory.get(a.droneId)!;
    const bOrdinal = grantHistory.get(b.droneId)!;
    if (aOrdinal !== bOrdinal) return aOrdinal - bOrdinal;
  }
  if (a.attackReadyAtMs !== b.attackReadyAtMs) return a.attackReadyAtMs - b.attackReadyAtMs;
  if (a.droneId < b.droneId) return -1;
  if (a.droneId > b.droneId) return 1;
  return 0;
}

/**
 * The one per-substep pure coordination resolver. Deterministic given
 * identical inputs — no RNG, no clock (all timestamps explicit, and
 * `nowMs` itself is only ever used for `DroneSquadLease.grantedAtMs`
 * telemetry, never for gating). Returns a FRESH runtime (never mutates
 * `runtime` in place), mirroring `resolveDroneStuckRecovery`'s own
 * "caller replaces its stored runtime wholesale" convention.
 *
 * `requests` may safely include entries with `wantsAttack: false` (e.g. a
 * destroyed or otherwise-inactive drone still occupying its stable array
 * slot — see `DroneSquad.tsx`'s own preallocated-array convention); such
 * entries are never treated as retained-lease-holders or candidates.
 */
export function resolveDroneSquadCoordination(
  runtime: DroneSquadCoordinatorRuntime,
  requests: readonly DroneAttackRequest[],
  profile: DroneSquadCoordinationProfile,
  nowMs: number,
): { runtime: DroneSquadCoordinatorRuntime; permits: ReadonlyMap<string, DroneAttackPermit> } {
  const requestById = new Map<string, DroneAttackRequest>();
  for (const request of requests) requestById.set(request.droneId, request);

  // --- Step 1: release. A retained lease survives ONLY while the SAME
  // drone still reports `wantsAttack: true` this tick — this is the sole
  // release mechanism (see this module's own doc comment on why this is
  // provably equivalent to "release on real combat-gate failure only").
  // Missing-from-requests (destroyed/unmounted) also releases.
  const retainedLeases = new Map<string, DroneSquadLease>();
  const occupiedSectors = new Set<number>();
  for (const [droneId, lease] of runtime.leases) {
    const request = requestById.get(droneId);
    if (request && request.wantsAttack) {
      retainedLeases.set(droneId, lease);
      occupiedSectors.add(lease.sector);
    }
  }

  // --- Step 2: candidates — want a permit, do not already hold one.
  const candidates: DroneAttackRequest[] = [];
  for (const request of requests) {
    if (request.wantsAttack && !retainedLeases.has(request.droneId)) candidates.push(request);
  }

  // --- Step 3: deterministic fairness sort (order-independent — see this
  // module's own doc comment).
  candidates.sort((a, b) => compareCandidates(a, b, runtime.grantHistory));

  let nextGrantOrdinal = runtime.nextGrantOrdinal;
  const newGrantHistory = new Map(runtime.grantHistory);

  // --- Step 4: grant in fairness order, subject to BOTH the concurrent-
  // attacker cap (hard stop — no further grants at all once reached) AND
  // per-candidate sector availability (a candidate whose sector is already
  // occupied simply waits its turn; a LATER, different-sector candidate may
  // still be granted this same tick).
  for (const candidate of candidates) {
    if (retainedLeases.size >= profile.maxConcurrentAttackers) break;
    const sector = resolveTacticalSectorIndex(candidate.dronePosition, candidate.targetPosition, profile.sectorCount);
    if (occupiedSectors.has(sector)) continue;
    const grantedAtOrdinal = nextGrantOrdinal;
    nextGrantOrdinal += 1;
    retainedLeases.set(candidate.droneId, { sector, grantedAtOrdinal, grantedAtMs: nowMs });
    newGrantHistory.set(candidate.droneId, grantedAtOrdinal);
    occupiedSectors.add(sector);
  }

  const permits = new Map<string, DroneAttackPermit>();
  for (const request of requests) {
    const lease = retainedLeases.get(request.droneId);
    permits.set(request.droneId, lease ? { granted: true, sector: lease.sector } : { granted: false, sector: null });
  }

  return {
    runtime: { leases: retainedLeases, grantHistory: newGrantHistory, nextGrantOrdinal },
    permits,
  };
}
