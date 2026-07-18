/**
 * Skyfront Trial match tuning (Milestone 6). "SKYFRONT TRIAL" is the
 * temporary internal match name per the milestone brief — not canon.
 * Weapon numbers live ONLY in shared/windWeapons.ts; nothing weapon-related
 * belongs here.
 */
export const TRIAL = {
  MATCH_NAME: 'SKYFRONT TRIAL',
  DRONES_TOTAL: 8,
  MATCH_TIME_S: 180,
  COUNTDOWN_S: 3,
  PLAYER_MAX_HP: 100,
  RESPAWN_S: 3,
  /** Below this Y the player has fallen off the arena → treated as death, respawn at spawn. */
  KILL_Y: -14,
  /** Controls-hint overlay fades after this many seconds of active play. */
  HINT_FADE_S: 7,
} as const;

/**
 * Wind Lift — visuals rendered by WindLift.tsx, force applied by
 * PlayerController (both read THIS). Positioned just OFF the east edge of
 * the left side platform (edge at x=-8; column west edge = -6.4-1.6 = -8),
 * so the rising player clears the platform underside and steps onto its top
 * (y 3.4) at the apex — NOT under the platform (which would cap the rise).
 */
export const WIND_LIFT = {
  /** Center of the updraft column, at floor level. */
  position: [-6.4, 0, -6] as [number, number, number],
  radius: 1.6,
  /** Column height — above this the boost stops and the player arcs onto the platform. */
  height: 7.5,
  /** Upward acceleration m/s² while inside (smooth ride, not a teleport). */
  accel: 34,
  maxRiseSpeed: 11.5,
} as const;
