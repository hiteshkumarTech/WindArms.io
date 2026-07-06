import { getPrisma } from '../db/prisma';

export interface SessionDelta {
  kills: number;
  deaths: number;
  xp: number;
  seconds: number;
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
      },
    })
    .catch((error) => {
      console.error(`[stats] flush failed for ${userId}`, error);
    });
}
