/**
 * Milestone 9B — deterministic gameplay randomness for the pure drone AI
 * core. No external dependency: a small, well-known PRNG (mulberry32) rather
 * than a library, since the only requirement is "same seed → same sequence,"
 * not cryptographic quality. Every gameplay-affecting random choice the
 * legacy `DroneEnemy.tsx` makes (initial phase, initial fire desync, initial
 * strafe direction/flip deadline, periodic strafe-flip re-roll, per-shot aim
 * spread) is preserved by routing it through a `RandomSource` built here —
 * see `droneAiStateMachine.ts` for where each call actually happens, in the
 * same relative order the legacy code made them.
 */

export interface RandomSource {
  /** [0, 1) — the same range contract as the browser's own built-in random generator. */
  nextFloat(): number;
  /** Uniform in `[min, max)`. */
  range(min: number, max: number): number;
  /** Uniform pick from a non-empty readonly array. */
  choose<T>(items: readonly T[]): T;
}

/**
 * mulberry32 — a 32-bit state PRNG, public-domain algorithm (Tommy Ettinger).
 * Chosen for being small, fast, dependency-free, and producing a
 * well-distributed `[0,1)` stream from a single 32-bit integer seed — more
 * than sufficient for gameplay jitter/spread, not intended for anything
 * security-sensitive.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Production seeded source — deterministic given `seed`, independent of any other stream (zero seed is handled safely, not treated as "unseeded"). */
export function createSeededRandomSource(seed: number): RandomSource {
  const next = mulberry32(seed >>> 0);
  return {
    nextFloat: () => next(),
    range(min, max) {
      return min + next() * (max - min);
    },
    choose(items) {
      const index = Math.floor(next() * items.length);
      // Guards the extremely rare `next() === 1`-adjacent floating rounding
      // case from ever indexing one past the end.
      return items[Math.min(index, items.length - 1)];
    },
  };
}

/**
 * Test-only tape source — replays a fixed, explicit sequence of `[0,1)`
 * values rather than generating them, so a captured legacy random tape (or a
 * hand-written edge-case sequence) can be replayed exactly. Throws clearly on
 * exhaustion rather than silently wrapping or returning a default — a test
 * that runs out of tape has a real bug (either the tape is too short or the
 * code under test consumed more randomness than expected), and silently
 * wrapping would hide that.
 */
export function createTapeRandomSource(tape: readonly number[]): RandomSource {
  let cursor = 0;
  const nextFloat = () => {
    if (cursor >= tape.length) {
      throw new Error(`createTapeRandomSource: tape exhausted after ${cursor} value(s) — the code under test consumed more randomness than the tape provides.`);
    }
    return tape[cursor++];
  };
  return {
    nextFloat,
    range(min, max) {
      return min + nextFloat() * (max - min);
    },
    choose(items) {
      const index = Math.floor(nextFloat() * items.length);
      return items[Math.min(index, items.length - 1)];
    },
  };
}

export interface DroneSeedIngredients {
  /** Stable per-match seed — new on `initSession()`/`restart()` (owned by the caller; 9B does not modify `matchStore.ts` to add this, see this module's own seed-ownership note below). */
  matchSeed: number;
  /** `DroneSpawnDef.id`, e.g. `'deck-a'` — stable, hand-authored, unique per drone. */
  droneId: string;
  /** Bumped each time this specific drone is reset (spawn/restart) — see `LegacyDroneAiRuntime.lifeGeneration`. Ensures a mid-session restart's random stream doesn't replay the exact sub-sequence a prior life already consumed. */
  lifeGeneration: number;
}

/**
 * Small string hash (FNV-1a, 32-bit) — deterministic, dependency-free,
 * sufficient to fold `matchSeed`/`droneId`/`lifeGeneration` into one 32-bit
 * seed with good avalanche behaviour (small input changes flip many output
 * bits, so adjacent drone IDs or generations don't produce visibly
 * correlated streams).
 */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Derives one drone's own seed from match/drone/life-generation ingredients
 * — 9B's seed-ownership pattern (no `matchStore.ts` changes required, per
 * this phase's own protected-systems list). Each drone owns an independent
 * stream: two drones with different `droneId`s given the same `matchSeed`
 * and `lifeGeneration` produce different, uncorrelated sequences, and one
 * drone's random calls can never advance another drone's stream (each
 * `RandomSource` instance is entirely private to the drone that built it).
 */
export function deriveDroneSeed(ingredients: DroneSeedIngredients): number {
  return fnv1a32(`${ingredients.matchSeed}:${ingredients.droneId}:${ingredients.lifeGeneration}`);
}
