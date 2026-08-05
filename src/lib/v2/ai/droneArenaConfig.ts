import { DRONE_SPAWNS, MAIN_DECK } from '../play/spawnConfig';
import { WIND_LIFT } from '../play/constants';
import type { Vec3Data } from './droneAiTypes';

/**
 * Milestone 9F — route-specific, plain-data arena-constraint config for the
 * Skyfront Trial. Same guarantee as the rest of `lib/v2/ai/` — no React, no
 * R3F, no Three.js, no Rapier, no Zustand, no browser globals, no
 * `Math.random`/`performance.now`/`Date.now` (enforced by
 * `droneAiImportGuards.test.ts`). This module is PLAIN DERIVED DATA only —
 * it exports one resolved constant, `DRONE_ARENA_CONFIG`, computed once at
 * module load from EXISTING arena source values (`spawnConfig.ts`,
 * `constants.ts`), never a duplicated/invented magic number.
 *
 * WHY THIS FILE IMPORTS FROM `lib/v2/play/spawnConfig.ts` AND
 * `lib/v2/play/constants.ts`: both are already-established, zero-React/
 * Three.js/Rapier/Zustand plain-data modules (`droneAiPerception.ts` already
 * sets this precedent, importing `segmentHitsBox`/`ArenaBox` from
 * `spawnConfig.ts` — see that file's own doc comment) — reusing their
 * EXPORTED CONSTANTS here (never copying a literal number a second time)
 * is what keeps "the envelope does not extend beyond intended boundary
 * walls" and "no route-global generic bounds are invented" true by
 * construction: if `MAIN_DECK`, `DRONE_SPAWNS`, or `WIND_LIFT` ever change,
 * this file's own derived values move with them automatically.
 *
 * ── HORIZONTAL BOUNDS DERIVATION ──────────────────────────────────────────
 * `MAIN_DECK` (`spawnConfig.ts`) is `{ center: [0,-0.9,0], size: [34,1.8,34] }`
 * — the one authoritative main playable surface, half-extent 17m on both X
 * and Z. Both `SIDE_PLATFORMS` (x ∈ [-17,-8] / [8,17]) and every
 * `DRONE_SPAWNS` position/patrol-radius combination already fit entirely
 * within this same footprint (verified below and by this phase's own
 * Section-1 baseline capture — 0 of 549 real sampled drone positions across
 * two live browser scenarios, one static-player and one active-approach,
 * ever left this envelope). `BOUNDARY_WALLS` (also `spawnConfig.ts`) sit a
 * further 0.8m beyond the deck edge (wall center ±18.2, half-thickness 0.4 →
 * inner face at ±17.8) — those exist purely as a FALL-PREVENTION cage for a
 * falling PLAYER, not as the intended drone flight envelope. Using
 * `MAIN_DECK`'s own footprint directly (rather than the more permissive
 * wall inner-face) keeps drones visually over the actual playable arena at
 * all times, never hovering in the dead 0.8m gap between the deck edge and
 * the invisible fall-catch wall.
 *
 * ── ALTITUDE DERIVATION ────────────────────────────────────────────────────
 * `DRONE_SPAWNS` altitudes range 2.8m (`deck-b`) to 7.5m (`sentinel`,
 * deliberately spawned right at the Wind Lift column's own top —
 * `WIND_LIFT.height`). This phase's own Section-1 real browser baseline
 * (static-player + active-player-approach, medium/low difficulty, 549
 * sampled live positions) measured actual combat/search altitude excursion
 * of 2.776m–7.389m — comfortably inside, never outside, the raw spawn
 * range. `MIN_ALTITUDE_M`/`MAX_ALTITUDE_M` below add ~1.2-1.6m of margin on
 * each side of the measured real range so ordinary play — including
 * excursions this phase's necessarily time-boxed capture did not itself
 * observe (e.g. a longer/more aggressive pursuit) — never brushes the
 * clamp, while still bounding a drone from ever descending through the main
 * deck's own top surface (y=0) or climbing indefinitely into the sky.
 *
 * ── WIND LIFT EXCLUSION DERIVATION ─────────────────────────────────────────
 * Sourced directly from `WIND_LIFT` (`lib/v2/play/constants.ts`) — the SAME
 * constant `WindLift.tsx` (visuals) and `PlayerController.tsx` (physics,
 * protected, unmodified) both already read, so this can never drift from
 * the real rendered/felt column. `PlayerController.tsx`'s own player-inside
 * check is `dx²+dz² <= radius² && y >= position[1]-0.5 && y <=
 * position[1]+height` — this module's `WIND_LIFT_FORBIDDEN_ZONE` mirrors
 * that exact Y band (`minY: WIND_LIFT.position[1] - 0.5`, `maxY:
 * WIND_LIFT.position[1] + WIND_LIFT.height`), with a small, disclosed
 * `radiusM` clearance margin added on top of the real physics radius purely
 * so a drone visually clears the column's own rendered rings/motes rather
 * than merely not-technically-overlapping the player's own narrower
 * physics boundary. This phase's own Section-1 baseline independently
 * confirmed drones CAN incidentally enter the real column's XZ footprint
 * during ordinary combat repositioning near it (1 of 152 sampled points in
 * the active-approach capture) — this is not a hypothetical concern.
 */

/** Small, disclosed visual-clearance margin ON TOP of the real WIND_LIFT.radius — see this module's own doc comment. Not a gameplay tuning value; purely keeps a corrected drone visibly clear of the rendered column edge. */
const WIND_LIFT_VISUAL_CLEARANCE_M = 0.3;

/** ~1.2m below the lowest real value this phase measured/derived (spawn 2.8m, measured live minimum 2.776m) — clears MAIN_DECK's own top surface (y=0) with comfortable margin, never brushed by ordinary spawn/search/combat altitude. */
export const MIN_ALTITUDE_M = 1.2;
/** ~1.5m above the highest real value this phase measured/derived (spawn 7.5m = WIND_LIFT.height exactly, measured live maximum 7.389m) — bounds unbounded climb while never brushing ordinary sentinel-altitude combat. */
export const MAX_ALTITUDE_M = 9.0;

/** Distance from a hard bound within which soft inward steering may activate — see droneAiArenaConstraints.ts's own doc comment for whether/how this is actually used (Section 8: "measure first"). A fraction of DRONE_LOCAL_SEPARATION.neighbourRadiusM's own 2.4m scale, not a re-derivation of it (no cross-module magic-number duplication — this is an independent, smaller-scale boundary concern). */
export const SOFT_BOUNDARY_MARGIN_M = 2.0;

/** Numeric-stability guard only (mirrors `droneAiMovementIntent.ts`'s own `exactOverlapEpsilonM` convention) — prevents a position sitting exactly ON a hard bound from oscillating in/out of clamping across ticks due to floating-point noise. Not a gameplay tuning value. */
export const HARD_BOUNDARY_EPSILON_M = 0.01;

export interface DroneHorizontalBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface DroneForbiddenCylinder {
  id: string;
  centerX: number;
  centerZ: number;
  radiusM: number;
  minY: number;
  maxY: number;
}

export interface DroneArenaConfig {
  horizontalBounds: DroneHorizontalBounds;
  minAltitudeM: number;
  maxAltitudeM: number;
  softBoundaryMarginM: number;
  hardBoundaryEpsilonM: number;
  forbiddenZones: readonly DroneForbiddenCylinder[];
  safeFallbackPositions: readonly Vec3Data[];
}

/** MAIN_DECK's own half-extents — see this module's own doc comment for the full derivation. */
const DECK_HALF_X = MAIN_DECK.size[0] / 2;
const DECK_HALF_Z = MAIN_DECK.size[2] / 2;

const HORIZONTAL_BOUNDS: DroneHorizontalBounds = {
  minX: MAIN_DECK.center[0] - DECK_HALF_X,
  maxX: MAIN_DECK.center[0] + DECK_HALF_X,
  minZ: MAIN_DECK.center[2] - DECK_HALF_Z,
  maxZ: MAIN_DECK.center[2] + DECK_HALF_Z,
};

const WIND_LIFT_FORBIDDEN_ZONE: DroneForbiddenCylinder = {
  id: 'wind-lift',
  centerX: WIND_LIFT.position[0],
  centerZ: WIND_LIFT.position[2],
  radiusM: WIND_LIFT.radius + WIND_LIFT_VISUAL_CLEARANCE_M,
  minY: WIND_LIFT.position[1] - 0.5,
  maxY: WIND_LIFT.position[1] + WIND_LIFT.height,
};

/**
 * Safe teleport-fallback positions — derived directly from `DRONE_SPAWNS`
 * (`spawnConfig.ts`), never invented. Every entry is validated (by the test
 * suite, `droneArenaConfig.test.ts`) to sit inside `HORIZONTAL_BOUNDS` and
 * `[MIN_ALTITUDE_M, MAX_ALTITUDE_M]`, and outside every forbidden zone. In
 * practice a stuck drone's OWN home position (passed in separately by the
 * adapter/caller, per Section 16's "current validated home position"
 * preference) is the primary teleport target; this list exists as the
 * general-purpose validated backup `droneAiStuckRecovery.ts` falls back to
 * only if a caller-supplied home position ever fails validation.
 */
const SAFE_FALLBACK_POSITIONS: readonly Vec3Data[] = DRONE_SPAWNS.map((spawn) => ({
  x: spawn.position[0],
  y: spawn.position[1],
  z: spawn.position[2],
}));

export const DRONE_ARENA_CONFIG: DroneArenaConfig = {
  horizontalBounds: HORIZONTAL_BOUNDS,
  minAltitudeM: MIN_ALTITUDE_M,
  maxAltitudeM: MAX_ALTITUDE_M,
  softBoundaryMarginM: SOFT_BOUNDARY_MARGIN_M,
  hardBoundaryEpsilonM: HARD_BOUNDARY_EPSILON_M,
  forbiddenZones: [WIND_LIFT_FORBIDDEN_ZONE],
  safeFallbackPositions: SAFE_FALLBACK_POSITIONS,
};
