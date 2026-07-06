import { Router, json, type NextFunction, type Request, type Response } from 'express';
import type { User } from '@prisma/client';
import type {
  AuthResponse,
  LeaderboardResponse,
  Profile,
} from '../../../shared/accounts';
import { levelFromXp } from '../../../shared/progression';
import { accountsEnabled, getPrisma } from '../db/prisma';
import { bearerToken, hashPassword, signToken, verifyPassword, verifyToken } from './auth';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9 _\-\[\]]{3,16}$/;
const MIN_PASSWORD_LENGTH = 8;
const LEADERBOARD_SIZE = 20;

function toProfile(user: User): Profile {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    xp: user.xp,
    level: levelFromXp(user.xp),
    kills: user.kills,
    deaths: user.deaths,
    matchesPlayed: user.matchesPlayed,
    timePlayedS: user.timePlayedS,
  };
}

function unavailable(res: Response): void {
  res.status(503).json({ error: 'Accounts are not configured on this server.' });
}

/** Fixed-window rate limiter for credential endpoints (per IP). */
const AUTH_ATTEMPT_WINDOW_MS = 60000;
const AUTH_ATTEMPT_LIMIT = 10;
const authAttempts = new Map<string, { count: number; windowStart: number }>();

function authRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || now - entry.windowStart > AUTH_ATTEMPT_WINDOW_MS) {
    authAttempts.set(ip, { count: 1, windowStart: now });
    next();
    return;
  }
  entry.count += 1;
  if (entry.count > AUTH_ATTEMPT_LIMIT) {
    res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
    return;
  }
  next();
}

// Prune stale limiter entries so the map never grows unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authAttempts) {
    if (now - entry.windowStart > AUTH_ATTEMPT_WINDOW_MS) authAttempts.delete(ip);
  }
}, 5 * 60000).unref();

/** REST surface: register, login, profile, leaderboard. */
export function createAuthRouter(): Router {
  const router = Router();
  router.use(json({ limit: '10kb' }));
  router.use('/auth', authRateLimiter);

  router.post('/auth/register', async (req: Request, res: Response) => {
    const prisma = getPrisma();
    if (!prisma) return unavailable(res);
    try {
      const { email, username, password } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }
      if (typeof username !== 'string' || !USERNAME_PATTERN.test(username.trim())) {
        res.status(400).json({ error: 'Call sign must be 3-16 letters, numbers or spaces.' });
        return;
      }
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
        return;
      }

      const cleanEmail = email.toLowerCase().trim();
      const cleanUsername = username.trim();
      const existing = await prisma.user.findFirst({
        where: { OR: [{ email: cleanEmail }, { username: cleanUsername }] },
        select: { email: true },
      });
      if (existing) {
        res.status(409).json({
          error: existing.email === cleanEmail ? 'That email is already registered.' : 'That call sign is taken.',
        });
        return;
      }

      const user = await prisma.user.create({
        data: { email: cleanEmail, username: cleanUsername, passwordHash: await hashPassword(password) },
      });
      const payload: AuthResponse = { token: signToken(user.id), profile: toProfile(user) };
      res.json(payload);
    } catch (error) {
      console.error('[auth] register failed', error);
      res.status(500).json({ error: 'Registration failed. Try again.' });
    }
  });

  router.post('/auth/login', async (req: Request, res: Response) => {
    const prisma = getPrisma();
    if (!prisma) return unavailable(res);
    try {
      const { email, password } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }
      const payload: AuthResponse = { token: signToken(user.id), profile: toProfile(user) };
      res.json(payload);
    } catch (error) {
      console.error('[auth] login failed', error);
      res.status(500).json({ error: 'Login failed. Try again.' });
    }
  });

  router.get('/auth/me', async (req: Request, res: Response) => {
    const prisma = getPrisma();
    if (!prisma) return unavailable(res);
    try {
      const token = bearerToken(req.headers.authorization);
      const userId = token ? verifyToken(token) : null;
      if (!userId) {
        res.status(401).json({ error: 'Not signed in.' });
        return;
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        res.status(401).json({ error: 'Account no longer exists.' });
        return;
      }
      res.json({ profile: toProfile(user) });
    } catch (error) {
      console.error('[auth] me failed', error);
      res.status(500).json({ error: 'Could not load profile.' });
    }
  });

  router.get('/leaderboard', async (_req: Request, res: Response) => {
    if (!accountsEnabled()) return unavailable(res);
    const prisma = getPrisma();
    if (!prisma) return unavailable(res);
    try {
      const users = await prisma.user.findMany({
        orderBy: { xp: 'desc' },
        take: LEADERBOARD_SIZE,
        select: { username: true, xp: true, kills: true, deaths: true },
      });
      const payload: LeaderboardResponse = {
        entries: users.map((user, index) => ({
          rank: index + 1,
          username: user.username,
          level: levelFromXp(user.xp),
          xp: user.xp,
          kills: user.kills,
          deaths: user.deaths,
        })),
      };
      res.json(payload);
    } catch (error) {
      console.error('[auth] leaderboard failed', error);
      res.status(500).json({ error: 'Could not load the leaderboard.' });
    }
  });

  return router;
}
