import { getPrisma } from '../db/prisma';

export interface SessionDelta {
  kills: number;
  deaths: number;
  xp: number;
  seconds: number;
  headshots: number;
  bestStreak: number;
}

/**
 * Persists a finished room session for an authenticated player.
 * Fire-and-forget with logging: a failed stat write must never take a
 * room down, and guests (no userId) never reach this path.
 */
export function flushSessionStats(userId: string, delta: SessionDelta): void {
  const prisma = getPrisma();
  if (!prisma) return;
  prisma.user
    .update({
      where: { id: userId },
      data: {
        kills: { increment: delta.kills },
        deaths: { increment: delta.deaths },
        xp: { increment: delta.xp },
        timePlayedS: { increment: Math.max(0, Math.round(delta.seconds)) },
        matchesPlayed: { increment: 1 },
        headshots: { increment: delta.headshots },
      },
    })
    .catch((error) => {
      console.error(`[stats] flush failed for ${userId}`, error);
    });

  // Best streak is a high-water mark, not an increment.
  if (delta.bestStreak > 0) {
    prisma.user
      .updateMany({
        where: { id: userId, bestStreak: { lt: delta.bestStreak } },
        data: { bestStreak: delta.bestStreak },
      })
      .catch((error) => {
        console.error(`[stats] bestStreak update failed for ${userId}`, error);
      });
  }
}

/** Round win — written immediately at round end (never awaited by the podium). */
export function awardWin(userId: string): void {
  const prisma = getPrisma();
  if (!prisma) return;
  prisma.user
    .update({ where: { id: userId }, data: { wins: { increment: 1 } } })
    .catch((error) => {
      console.error(`[stats] win award failed for ${userId}`, error);
    });
}
