import { DRONE } from './enemyConfig';
import { TRIAL } from './constants';
import { DRONE_SPAWNS } from './spawnConfig';
import type { DroneSpawnDef } from './types';

/**
 * Skyfront Trial difficulty presets (Milestone 6 polish pass). SINGLE SOURCE
 * OF TRUTH for everything difficulty-dependent — matchStore, DroneSquad,
 * DroneEnemy, DroneBoltPool and the HUD/overlays all resolve through
 * `TRIAL_DIFFICULTIES` and `resolveDroneConfig`/`resolveDroneSpawns` below,
 * never their own copy of a multiplier or a drone-count number.
 *
 * MEDIUM is byte-identical to the pre-difficulty game: every multiplier is
 * 1, `droneCount` is `TRIAL.DRONES_TOTAL` (8, unchanged), `matchTimeS` is
 * `TRIAL.MATCH_TIME_S` (180, unchanged). `DRONE`/`TRIAL` in enemyConfig.ts/
 * constants.ts stay the BASE stats — this file only ever multiplies them,
 * never restates them, per the brief's "do not duplicate base drone
 * statistics" rule.
 *
 * Vortex Rifle stats, player movement and weapon damage are NOT listed here
 * on purpose — difficulty must never touch them (brief: "Do not use
 * difficulty to increase the Vortex Rifle's recoil or reduce player
 * damage").
 */
export type TrialDifficulty = 'low' | 'medium' | 'max';

export interface TrialDifficultyConfig {
  id: TrialDifficulty;
  label: string;
  description: string;
  droneCount: number;
  droneHealthMultiplier: number;
  droneDamageMultiplier: number;
  /** Multiplies FIRE_INTERVAL_MS — below 1 = attacks more often (Max), above 1 = less often (Low). Windup (the pre-shot telegraph) is deliberately NOT scaled by any preset, so every shot stays readable and dodgeable regardless of difficulty. */
  droneFireCooldownMultiplier: number;
  /**
   * Divides `DRONE.AIM_SPREAD_DEG` — confirmed base-field semantics: that
   * constant is an aim-ERROR half-cone in degrees ("modest accuracy,
   * dodgeable at range", enemyConfig.ts), NOT a direct accuracy percentage —
   * a LARGER value means WORSE aim (more spread), so dividing by this
   * multiplier is the correct direction: above 1 = tighter aim/less spread
   * (Max), below 1 = wider/more forgiving aim (Low). If a future preset or
   * refactor ever adds a field that IS a direct accuracy percentage (bigger
   * = better), it must be named and combined differently — do not reuse
   * this divide-into-spread pattern for a percentage-shaped value.
   */
  droneAccuracyMultiplier: number;
  droneProjectileSpeedMultiplier: number;
  droneMovementSpeedMultiplier: number;
  matchTimeS: number;
}

/**
 * Balanced 5-drone subset for Low: the three main-deck drones plus one per
 * flank platform, skipping the harder-to-reach "-hi" positions and the high
 * center sentinel. Keeps both flanks represented while cutting the most
 * demanding spawns — matches Low's "onboarding, more forgiving" intent
 * without moving or adding any spawn position.
 */
const LOW_DRONE_IDS = new Set(['deck-a', 'deck-b', 'deck-c', 'left-lo', 'right-lo']);

export const TRIAL_DIFFICULTIES: Record<TrialDifficulty, TrialDifficultyConfig> = {
  low: {
    id: 'low',
    label: 'Low',
    description: 'Five drones, slower and less accurate. Learn the arena at your own pace.',
    droneCount: LOW_DRONE_IDS.size,
    droneHealthMultiplier: 0.75,
    droneDamageMultiplier: 0.7,
    droneFireCooldownMultiplier: 1.35,
    droneAccuracyMultiplier: 0.75,
    droneProjectileSpeedMultiplier: 0.85,
    droneMovementSpeedMultiplier: 0.85,
    matchTimeS: TRIAL.MATCH_TIME_S + 30,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    description: 'The standard Skyfront Trial — eight drones, three minutes.',
    droneCount: TRIAL.DRONES_TOTAL,
    droneHealthMultiplier: 1,
    droneDamageMultiplier: 1,
    droneFireCooldownMultiplier: 1,
    droneAccuracyMultiplier: 1,
    droneProjectileSpeedMultiplier: 1,
    droneMovementSpeedMultiplier: 1,
    matchTimeS: TRIAL.MATCH_TIME_S,
  },
  max: {
    id: 'max',
    label: 'Max',
    description: 'The same eight drones hit harder, faster and straighter. Every bolt stays visible — nothing is instant or unavoidable.',
    droneCount: TRIAL.DRONES_TOTAL,
    droneHealthMultiplier: 1.35,
    droneDamageMultiplier: 1.25,
    droneFireCooldownMultiplier: 0.75,
    droneAccuracyMultiplier: 1.3,
    droneProjectileSpeedMultiplier: 1.2,
    droneMovementSpeedMultiplier: 1.2,
    matchTimeS: TRIAL.MATCH_TIME_S - 15,
  },
};

export const DEFAULT_TRIAL_DIFFICULTY: TrialDifficulty = 'medium';

/** Effective per-drone combat numbers for a difficulty — base `DRONE` constant × preset multiplier, computed fresh every call so nothing caches a stale selection. */
export interface ResolvedDroneConfig {
  maxHp: number;
  boltDamage: number;
  fireIntervalMs: number;
  aimSpreadDeg: number;
  boltSpeed: number;
  approachSpeed: number;
  retreatSpeed: number;
  strafeSpeed: number;
}

export function resolveDroneConfig(difficulty: TrialDifficulty): ResolvedDroneConfig {
  const preset = TRIAL_DIFFICULTIES[difficulty];
  return {
    maxHp: DRONE.MAX_HP * preset.droneHealthMultiplier,
    boltDamage: DRONE.BOLT_DAMAGE * preset.droneDamageMultiplier,
    fireIntervalMs: DRONE.FIRE_INTERVAL_MS * preset.droneFireCooldownMultiplier,
    aimSpreadDeg: DRONE.AIM_SPREAD_DEG / preset.droneAccuracyMultiplier,
    boltSpeed: DRONE.BOLT_SPEED * preset.droneProjectileSpeedMultiplier,
    approachSpeed: DRONE.APPROACH_SPEED * preset.droneMovementSpeedMultiplier,
    retreatSpeed: DRONE.RETREAT_SPEED * preset.droneMovementSpeedMultiplier,
    strafeSpeed: DRONE.STRAFE_SPEED * preset.droneMovementSpeedMultiplier,
  };
}

/** The spawn subset a difficulty actually uses — Medium and Max keep all 8 hand-placed positions; Low uses the balanced 5-drone subset above. Same DRONE_SPAWNS order every time (id-filtered, not a raw slice), so which drones appear at Low is stable. */
export function resolveDroneSpawns(difficulty: TrialDifficulty): DroneSpawnDef[] {
  if (difficulty === 'low') return DRONE_SPAWNS.filter((spawn) => LOW_DRONE_IDS.has(spawn.id));
  return DRONE_SPAWNS;
}
