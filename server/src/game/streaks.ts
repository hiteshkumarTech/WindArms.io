import { MULTIKILL_WINDOW_MS, STREAK_TIERS, type StreakTier } from '../../../shared/match';

/**
 * Pure kill-streak and multikill bookkeeping — separated from GameRoom
 * so the announcement logic is unit-testable without sockets.
 */

export interface StreakState {
  streak: number;
  bestStreak: number;
  lastKillAt: number;
  multiCount: number;
}

export function createStreakState(): StreakState {
  return { streak: 0, bestStreak: 0, lastKillAt: -Infinity, multiCount: 0 };
}

export interface KillAnnouncements {
  /** Exact streak tier reached by this kill, if any. */
  streakTier: StreakTier | null;
  /** Multikill count (2–4) when kills chain inside the window, else null. */
  multikill: number | null;
}

/** Mutates `state` for a confirmed kill and returns what to announce. */
export function recordKill(state: StreakState, now: number): KillAnnouncements {
  state.streak += 1;
  state.bestStreak = Math.max(state.bestStreak, state.streak);

  state.multiCount = now - state.lastKillAt <= MULTIKILL_WINDOW_MS ? state.multiCount + 1 : 1;
  state.lastKillAt = now;

  const streakTier = (STREAK_TIERS as readonly number[]).includes(state.streak)
    ? (state.streak as StreakTier)
    : null;
  const multikill = state.multiCount >= 2 ? Math.min(state.multiCount, 4) : null;

  return { streakTier, multikill };
}

/** Resets the streak on death; returns the streak that just ended. */
export function resetOnDeath(state: StreakState): number {
  const ended = state.streak;
  state.streak = 0;
  state.multiCount = 0;
  return ended;
}
