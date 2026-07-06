/**
 * XP and level curve — shared so the server (award/persist), the client
 * (profile display) and the leaderboard all agree exactly.
 */

export const XP_PER_KILL = 100;
export const XP_PER_MATCH_MINUTE = 20;

const MAX_LEVEL = 200;

/** Total XP required to *reach* `level` (level 1 = 0, 2 = 500, 3 = 1500…). */
export function cumulativeXpForLevel(level: number): number {
  return 250 * (level - 1) * level;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= cumulativeXpForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  intoLevel: number;
  /** XP needed to go from this level to the next. */
  required: number;
  /** 0..1 progress toward the next level. */
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const floor = cumulativeXpForLevel(level);
  const ceiling = cumulativeXpForLevel(level + 1);
  const required = ceiling - floor;
  const intoLevel = Math.max(0, xp - floor);
  return {
    level,
    intoLevel,
    required,
    fraction: Math.min(1, Math.max(0, intoLevel / required)),
  };
}
