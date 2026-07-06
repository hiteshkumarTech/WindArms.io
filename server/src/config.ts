import { SERVER_TICK_RATE, type Vec3 } from '../../shared/protocol';

/**
 * Server configuration. Values come from the environment in production
 * (Railway/Render inject PORT); defaults are tuned for local development.
 */
export const CONFIG = {
  PORT: Number(process.env.PORT ?? 4000),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',

  /** Snapshot broadcast rate (Hz). */
  TICK_RATE: SERVER_TICK_RATE,
  MAX_PLAYERS_PER_ROOM: 8,
  MAX_NAME_LENGTH: 16,

  /**
   * Server-authority movement limits. Mirrors the client tuning
   * (dash = 18 m/s) with headroom for network jitter — anything past
   * these bounds is physically impossible and gets corrected.
   */
  MAX_HORIZONTAL_SPEED: 24,
  MAX_VERTICAL_SPEED: 42,
  /** Drop input packets arriving faster than this (flood protection). */
  MIN_INPUT_INTERVAL_MS: 15,

  /** Arena bounds — matches the client's TestArena geometry. */
  ARENA_HALF_EXTENT: 32,
  ARENA_MIN_Y: -30,
  ARENA_MAX_Y: 40,

  SPAWN_POINTS: [
    [0, 3, 10],
    [8, 3, 8],
    [-8, 3, 8],
    [12, 3, -6],
    [-12, 3, -6],
    [0, 5, -16],
    [6, 3, 0],
    [-6, 3, 0],
  ] as Vec3[],
};
