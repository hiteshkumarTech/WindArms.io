/** WindArms V2 — Skyfront Trial match types (Milestone 6, 2026-07-17). */

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

/** Drone AI states — deterministic, per DroneEnemy's frame loop (never React state). */
export type DroneAiState = 'inactive' | 'spawning' | 'searching' | 'engaging' | 'attacking' | 'stunned' | 'destroyed';

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
