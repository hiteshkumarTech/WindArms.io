import { segmentHitsBox } from '../play/spawnConfig';
import type { ArenaBox } from '../play/types';
import type { Vec3Data } from './droneAiTypes';

/**
 * Milestone 9C — pure perception evaluation for the drone AI core. Same
 * guarantee as the rest of `lib/v2/ai/` — no React, no R3F, no Three.js, no
 * Rapier, no Zustand, no calls to the system clock or the built-in random
 * generator (enforced by `droneAiImportGuards.test.ts`).
 *
 * CURRENT PERCEPTION MODEL (deliberately unchanged in shape from 9B, now
 * factored into its own reusable, independently-testable function): a
 * distance check plus a static-arena line-of-sight test against the
 * existing deterministic AABB occluder set. No field of view, no hearing,
 * no partial-cover percentage, no squad-shared awareness, no drone-to-drone
 * occlusion, no predictive visibility — the Step 9A architecture audit
 * confirmed none of those exist today, and this phase's own scope fence
 * explicitly does not add them. That work (if ever justified) belongs to a
 * later, deliberately-scoped phase.
 *
 * REUSE, NOT DUPLICATION: `segmentHitsBox` (the slab-intersection AABB test)
 * is imported directly from `lib/v2/play/spawnConfig.ts` — the one existing
 * implementation `DroneEnemy.tsx` already used inline via `segmentOccluded()`
 * before this phase. `spawnConfig.ts` itself has zero React/Three.js/Rapier/
 * Zustand import (verified: it is plain arithmetic + data), so reusing its
 * pure geometry function here does not compromise this module's own
 * renderer-independence guarantee — only the OCCLUDER DATA (`ArenaBox[]`) is
 * arena-specific, and that is supplied by the caller (`occluders` below),
 * never hardcoded here. See `docs/decisions.md`'s Step 9C entry for the full
 * reasoning behind this one deliberate cross-directory dependency.
 */

export interface DronePerceptionInput {
  dronePosition: Vec3Data;
  targetPosition: Vec3Data;
  detectionRadius: number;
  occluders: readonly ArenaBox[];
}

export interface DronePerceptionResult {
  distanceToTarget: number;
  withinDetectionRadius: boolean;
  lineOfSightClear: boolean;
  /** The canonical visibility rule, unchanged since 9B: `withinDetectionRadius && lineOfSightClear`. */
  targetVisible: boolean;
}

/**
 * Pure, deterministic, allocation-light: no `Vec3Data`/array is constructed
 * beyond the two short-lived tuples `segmentHitsBox` itself requires. Same
 * inputs always produce the same result — no hidden state, no RNG, no clock.
 */
export function evaluateDronePerception(input: DronePerceptionInput): DronePerceptionResult {
  const dx = input.targetPosition.x - input.dronePosition.x;
  const dy = input.targetPosition.y - input.dronePosition.y;
  const dz = input.targetPosition.z - input.dronePosition.z;
  const distanceToTarget = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const withinDetectionRadius = distanceToTarget <= input.detectionRadius;

  const a: [number, number, number] = [input.dronePosition.x, input.dronePosition.y, input.dronePosition.z];
  const b: [number, number, number] = [input.targetPosition.x, input.targetPosition.y, input.targetPosition.z];
  let lineOfSightClear = true;
  for (const box of input.occluders) {
    if (segmentHitsBox(a, b, box)) {
      lineOfSightClear = false;
      break;
    }
  }

  return {
    distanceToTarget,
    withinDetectionRadius,
    lineOfSightClear,
    targetVisible: withinDetectionRadius && lineOfSightClear,
  };
}

/**
 * Milestone 9C — bounded, source-controlled perception-memory tuning.
 * Deliberately flat/not difficulty-scaled this phase (difficulty-specific
 * perception belongs to 9E, per the brief's own explicit scope fence).
 *
 * Selected values and reasoning (see `docs/decisions.md`'s Step 9C entry for
 * the full verification against approach speed / arena dimensions / cover
 * spacing / Medium's movement multiplier):
 *
 * - `losLossConfirmMs: 250` — filters a one-frame cover-edge LOS flicker
 *   (at 60fps a single dropped frame is ~16ms, two orders of magnitude
 *   below this) while still stopping attack eligibility on the very first
 *   blocked tick (the confirmation window only gates the STATE transition
 *   to `investigating`, never the fire-eligibility check itself).
 * - `investigateDurationMs: 4500` — at the drone's own `approachSpeed`
 *   (4.2 m/s base, Medium multiplier ×1) this covers roughly 18-19m of
 *   direct travel — comfortably more than the ~7-9m typical gap between
 *   the arena's own cover blocks (`COVERS` in `spawnConfig.ts`), so a drone
 *   can meaningfully close on the last-known point rather than immediately
 *   giving up, without becoming permanently omniscient (memory always
 *   expires; the drone never "waits forever").
 * - `investigateArrivalRadiusM: 1.5` — comfortably larger than one drone
 *   hull (the hit-sphere radius is 0.62m) so small per-substep numerical
 *   noise at the destination can never cause visible oscillation, while
 *   still reading as "arrived" rather than "stopped short."
 *
 * All three fall within the brief's own allowed adjustment ranges
 * (150-350ms / 4000-5500ms / 1.0-2.0m) — no value was moved outside them.
 */
export const DRONE_PERCEPTION_MEMORY = {
  losLossConfirmMs: 250,
  investigateDurationMs: 4500,
  investigateArrivalRadiusM: 1.5,
} as const;
