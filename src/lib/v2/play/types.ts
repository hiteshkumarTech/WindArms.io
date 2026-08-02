/** WindArms V2 — Skyfront Trial match types (Milestone 6, 2026-07-17). */

import type { DroneAiRuntimeState } from '../ai/droneAiTypes';

/** The one authoritative match phase — no scattered isPlaying/isDead/isPaused booleans anywhere. */
export type MatchPhase =
  | 'booting'
  | 'ready'
  | 'countdown'
  | 'active'
  | 'playerDead'
  | 'victory'
  | 'defeat'
  | 'paused'
  | 'restarting';

/**
 * Drone AI states — deterministic, per DroneEnemy's frame loop (never React
 * state). Milestone 9C: this now ALIASES `lib/v2/ai/droneAiTypes.ts`'s
 * `DroneAiRuntimeState` directly rather than declaring its own separate
 * union — that pure-core file is the one authoritative source, per this
 * phase's own "no duplicate state unions across production modules"
 * requirement. The pre-9C union also declared `'inactive'` (never assigned
 * at runtime) and `'stunned'` (a timed overlay, never a discrete state
 * value) — both dropped by this alias; see `droneAiTypes.ts`'s own doc
 * comment for the full history.
 */
export type DroneAiState = DroneAiRuntimeState;

export interface MatchStats {
  dronesDestroyed: number;
  deaths: number;
  /** Seconds from countdown-end to victory; null unless the match was won. */
  completionTimeS: number | null;
}

export interface DroneSpawnDef {
  id: string;
  position: [number, number, number];
  /** Hover patrol radius around the spawn while searching, meters. */
  patrolRadius: number;
}

/** Axis-aligned box, world space — single source for arena colliders, drone LOS occlusion and bolt collision. */
export interface ArenaBox {
  center: [number, number, number];
  /** Full extents (width, height, depth). */
  size: [number, number, number];
}
