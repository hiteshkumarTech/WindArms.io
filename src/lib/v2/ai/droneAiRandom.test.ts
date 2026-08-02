import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeededRandomSource, createTapeRandomSource, deriveDroneSeed } from './droneAiRandom';

describe('droneAiRandom — createSeededRandomSource', () => {
  it('the same seed produces the same sequence', () => {
    const a = createSeededRandomSource(12345);
    const b = createSeededRandomSource(12345);
    const seqA = Array.from({ length: 20 }, () => a.nextFloat());
    const seqB = Array.from({ length: 20 }, () => b.nextFloat());
    assert.deepStrictEqual(seqA, seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = createSeededRandomSource(1);
    const b = createSeededRandomSource(2);
    const seqA = Array.from({ length: 10 }, () => a.nextFloat());
    const seqB = Array.from({ length: 10 }, () => b.nextFloat());
    assert.notDeepStrictEqual(seqA, seqB);
  });

  it('zero seed is handled safely (finite, in-range, non-degenerate sequence)', () => {
    const rng = createSeededRandomSource(0);
    const seq = Array.from({ length: 50 }, () => rng.nextFloat());
    for (const v of seq) {
      assert.ok(Number.isFinite(v), `expected finite value, got ${v}`);
      assert.ok(v >= 0 && v < 1, `expected [0,1), got ${v}`);
    }
    // Not literally the same value every call (a truly degenerate/stuck generator).
    assert.ok(new Set(seq).size > 40, 'expected a well-distributed sequence from a zero seed, not a stuck generator');
  });

  it('nextFloat always stays in [0, 1)', () => {
    const rng = createSeededRandomSource(999);
    for (let i = 0; i < 2000; i++) {
      const v = rng.nextFloat();
      assert.ok(v >= 0 && v < 1, `value ${v} out of [0,1) range at call ${i}`);
    }
  });

  it('range() obeys bounds and reproduces deterministically', () => {
    const a = createSeededRandomSource(42);
    const b = createSeededRandomSource(42);
    for (let i = 0; i < 500; i++) {
      const va = a.range(-10, 10);
      const vb = b.range(-10, 10);
      assert.strictEqual(va, vb);
      assert.ok(va >= -10 && va < 10, `range() value ${va} out of bounds`);
    }
  });

  it('choose() obeys array bounds and reproduces deterministically', () => {
    const items = ['a', 'b', 'c', 'd', 'e'] as const;
    const a = createSeededRandomSource(7);
    const b = createSeededRandomSource(7);
    for (let i = 0; i < 200; i++) {
      const va = a.choose(items);
      const vb = b.choose(items);
      assert.strictEqual(va, vb);
      assert.ok(items.includes(va), `choose() returned an out-of-set value: ${va}`);
    }
  });

  it('is deterministic across repeated construction with the same seed, not just within one instance', () => {
    const first = createSeededRandomSource(555).nextFloat();
    const second = createSeededRandomSource(555).nextFloat();
    const third = createSeededRandomSource(555).nextFloat();
    assert.strictEqual(first, second);
    assert.strictEqual(second, third);
  });
});

describe('droneAiRandom — createTapeRandomSource', () => {
  it('consumes the tape in exact order', () => {
    const tape = createTapeRandomSource([0.1, 0.2, 0.3]);
    assert.strictEqual(tape.nextFloat(), 0.1);
    assert.strictEqual(tape.nextFloat(), 0.2);
    assert.strictEqual(tape.nextFloat(), 0.3);
  });

  it('an exhausted tape throws clearly rather than wrapping or defaulting', () => {
    const tape = createTapeRandomSource([0.5]);
    tape.nextFloat();
    assert.throws(() => tape.nextFloat(), /tape exhausted/);
  });

  it('range() and choose() draw from the same underlying tape cursor, in call order', () => {
    const tape = createTapeRandomSource([0, 0.5, 0.999]);
    assert.strictEqual(tape.range(10, 20), 10); // 10 + 0*10
    assert.strictEqual(tape.range(10, 20), 15); // 10 + 0.5*10
    const items = ['x', 'y', 'z'];
    assert.strictEqual(tape.choose(items), 'z'); // floor(0.999*3) = 2 -> 'z'
  });
});

describe('droneAiRandom — no Math.random anywhere in this module', () => {
  it('the module source never CALLS Math.random (doc comments may still describe/reference it by name)', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(dir, 'droneAiRandom.ts'), 'utf8');
    assert.ok(!src.includes('Math.random('), 'droneAiRandom.ts must never call Math.random() — it IS the deterministic replacement for it');
  });
});

describe('droneAiRandom — deriveDroneSeed', () => {
  it('is deterministic: same ingredients produce the same seed', () => {
    const ingredients = { matchSeed: 100, droneId: 'deck-a', lifeGeneration: 1 };
    assert.strictEqual(deriveDroneSeed(ingredients), deriveDroneSeed({ ...ingredients }));
  });

  it('different drone IDs produce different seeds (independent streams)', () => {
    const base = { matchSeed: 100, lifeGeneration: 1 };
    const seeds = new Set(['deck-a', 'deck-b', 'deck-c', 'left-lo', 'left-hi', 'right-lo', 'right-hi', 'sentinel'].map((droneId) => deriveDroneSeed({ ...base, droneId })));
    assert.strictEqual(seeds.size, 8, 'expected 8 distinct seeds for 8 distinct drone IDs');
  });

  it('different life generations produce different seeds for the same drone (a restart does not replay the same sub-sequence)', () => {
    const base = { matchSeed: 100, droneId: 'deck-a' };
    const gen1 = deriveDroneSeed({ ...base, lifeGeneration: 1 });
    const gen2 = deriveDroneSeed({ ...base, lifeGeneration: 2 });
    assert.notStrictEqual(gen1, gen2);
  });

  it('different match seeds produce different per-drone seeds', () => {
    const base = { droneId: 'deck-a', lifeGeneration: 1 };
    const a = deriveDroneSeed({ ...base, matchSeed: 1 });
    const b = deriveDroneSeed({ ...base, matchSeed: 2 });
    assert.notStrictEqual(a, b);
  });

  it('always returns a non-negative 32-bit integer suitable as a PRNG seed', () => {
    for (let i = 0; i < 50; i++) {
      const seed = deriveDroneSeed({ matchSeed: i, droneId: `drone-${i}`, lifeGeneration: i % 3 });
      assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
    }
  });

  it('feeding a derived seed into createSeededRandomSource produces a reproducible, independent stream per drone', () => {
    const seedA = deriveDroneSeed({ matchSeed: 7, droneId: 'deck-a', lifeGeneration: 1 });
    const seedB = deriveDroneSeed({ matchSeed: 7, droneId: 'deck-b', lifeGeneration: 1 });
    const streamA = createSeededRandomSource(seedA);
    const streamB = createSeededRandomSource(seedB);
    const drawsA = Array.from({ length: 10 }, () => streamA.nextFloat());
    const drawsB = Array.from({ length: 10 }, () => streamB.nextFloat());
    assert.notDeepStrictEqual(drawsA, drawsB, 'two different drones in the same match must not share a random sequence');
  });
});
