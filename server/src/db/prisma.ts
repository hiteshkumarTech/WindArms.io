import { PrismaClient } from '@prisma/client';

/**
 * Lazy Prisma singleton with graceful degradation: when DATABASE_URL is
 * not configured, accounts/XP/leaderboard endpoints report themselves
 * unavailable and the game runs in guest-only mode — the server never
 * hard-depends on the database.
 */

let client: PrismaClient | null = null;

export function accountsEnabled(): boolean {
  return typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.length > 0;
}

export function getPrisma(): PrismaClient | null {
  if (!accountsEnabled()) return null;
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}
