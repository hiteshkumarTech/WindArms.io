/**
 * Match lifecycle contracts — round/intermission timing, podium shapes and
 * combat-feedback tuning shared by server logic and client HUD.
 */

export type MatchPhase = 'playing' | 'intermission';

export const ROUND_DURATION_MS = 300000;
export const INTERMISSION_MS = 15000;

/** XP bonuses awarded at round end (stack on kill/time XP). */
export const WIN_XP = 250;
export const TOP3_XP = 100;

/** Kills this close together chain into multikills. */
export const MULTIKILL_WINDOW_MS = 4000;

export const STREAK_TIERS = [3, 5, 8] as const;
export type StreakTier = (typeof STREAK_TIERS)[number];

export const STREAK_NAMES: Record<StreakTier, string> = {
  3: 'RAMPAGE',
  5: 'UNSTOPPABLE',
  8: 'STORM LORD',
};

export const MULTIKILL_NAMES: Record<number, string> = {
  2: 'DOUBLE KILL',
  3: 'TRIPLE KILL',
  4: 'QUAD KILL',
};

/** A streak this long being ended is called out in the feed. */
export const SHUTDOWN_THRESHOLD = 5;

export interface PodiumEntry {
  id: string;
  name: string;
  kills: number;
  deaths: number;
}
