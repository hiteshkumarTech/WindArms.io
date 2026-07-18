/**
 * Wind training-drone tuning (Milestone 6). The drone is a TEMPORARY
 * gameplay target, not character canon — numbers here are first-pass
 * playtest values for an 8-drone / 3-minute trial, tuned so a drone dies to
 * ~4 body hits (Vortex 15 dmg) and its bolts are visible and dodgeable.
 * Weapon numbers stay in shared/windWeapons.ts; these are ENEMY numbers.
 */
export const DRONE = {
  MAX_HP: 60,
  /** Player detection radius, m. */
  DETECT_RADIUS: 42,
  /** Preferred engagement band — drones strafe to hold inside it instead of rushing the camera. */
  RANGE_MIN: 10,
  RANGE_MAX: 19,
  APPROACH_SPEED: 4.2,
  RETREAT_SPEED: 3.4,
  STRAFE_SPEED: 2.6,
  HOVER_AMP: 0.35,
  HOVER_HZ: 0.6,
  /** Readable attack wind-up (eye glows) before each shot, ms. */
  WINDUP_MS: 650,
  /** Time between attack attempts, ms (per drone, desynced by spawn offset). */
  FIRE_INTERVAL_MS: 2400,
  /** Aim error half-cone, degrees — "modest accuracy", dodgeable at range. */
  AIM_SPREAD_DEG: 4.5,
  /** Brief stagger when a shot lands, ms. */
  STUN_MS: 240,
  SPAWN_SCALE_MS: 700,
  DESTROY_SHRINK_MS: 260,
  BOLT_SPEED: 15,
  BOLT_DAMAGE: 12,
  BOLT_LIFETIME_MS: 3200,
  BOLT_RADIUS: 0.14,
  /** Pool size — 8 drones × worst-case airborne bolts. */
  BOLT_POOL: 24,
} as const;
