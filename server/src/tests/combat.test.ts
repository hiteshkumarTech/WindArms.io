import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Vec3 } from '../../../shared/protocol';
import { WEAPONS, damageAtDistance } from '../../../shared/weapons';
import {
  HITBOX,
  distance,
  normalize,
  occlusionDistance,
  pointAlongRay,
  rayAabb,
  rayCapsule,
} from '../game/combat';

const ORIGIN: Vec3 = [0, 1, 0];
const FORWARD: Vec3 = [0, 0, -1];

describe('rayAabb', () => {
  const box = { position: [0, 1, -10] as Vec3, size: [2, 2, 2] as Vec3 };

  it('hits a box straight ahead at the entry face', () => {
    const t = rayAabb(ORIGIN, FORWARD, box, 100);
    assert.ok(t !== null);
    assert.ok(Math.abs(t - 9) < 1e-6, `expected 9, got ${t}`);
  });

  it('misses a box behind the ray', () => {
    assert.equal(rayAabb(ORIGIN, [0, 0, 1], box, 100), null);
  });

  it('misses a box beyond max range', () => {
    assert.equal(rayAabb(ORIGIN, FORWARD, box, 5), null);
  });

  it('misses a laterally offset box', () => {
    const offset = { position: [10, 1, -10] as Vec3, size: [2, 2, 2] as Vec3 };
    assert.equal(rayAabb(ORIGIN, FORWARD, offset, 100), null);
  });
});

describe('rayCapsule', () => {
  it('hits a player capsule straight ahead', () => {
    const t = rayCapsule(ORIGIN, FORWARD, 100, [0, 1, -8]);
    assert.ok(t !== null);
    assert.ok(t > 0 && t < 8.1, `hit distance ${t} out of expected bounds`);
  });

  it('misses a capsule offset beyond its radius', () => {
    const t = rayCapsule(ORIGIN, FORWARD, 100, [HITBOX.RADIUS + 1.5, 1, -8]);
    assert.equal(t, null);
  });

  it('grazes a capsule inside its radius', () => {
    const t = rayCapsule(ORIGIN, FORWARD, 100, [HITBOX.RADIUS * 0.5, 1, -8]);
    assert.ok(t !== null);
  });

  it('respects max range', () => {
    assert.equal(rayCapsule(ORIGIN, FORWARD, 3, [0, 1, -8]), null);
  });
});

describe('occlusionDistance', () => {
  it('reports the nearest blocking box', () => {
    const near = { position: [0, 1, -5] as Vec3, size: [2, 2, 1] as Vec3 };
    const far = { position: [0, 1, -15] as Vec3, size: [2, 2, 1] as Vec3 };
    const t = occlusionDistance(ORIGIN, FORWARD, 100, [far, near]);
    assert.ok(t !== null && Math.abs(t - 4.5) < 1e-6);
  });

  it('returns null on a clear line', () => {
    assert.equal(occlusionDistance(ORIGIN, FORWARD, 100, []), null);
  });
});

describe('vector helpers', () => {
  it('normalizes and rejects degenerate vectors', () => {
    const unit = normalize([3, 0, 4]);
    assert.ok(unit && Math.abs(Math.hypot(...unit) - 1) < 1e-9);
    assert.equal(normalize([0, 0, 0]), null);
  });

  it('walks along rays and measures distance', () => {
    assert.deepEqual(pointAlongRay([1, 2, 3], [0, 1, 0], 2), [1, 4, 3]);
    assert.equal(distance([0, 0, 0], [3, 4, 0]), 5);
  });
});

describe('weapon damage falloff', () => {
  const ar = WEAPONS.ar;

  it('deals full damage inside falloff start', () => {
    assert.equal(damageAtDistance(ar, 0), ar.damage);
    assert.equal(damageAtDistance(ar, ar.falloffStart), ar.damage);
  });

  it('clamps to minimum damage beyond falloff end', () => {
    assert.equal(damageAtDistance(ar, ar.falloffEnd + 50), ar.damage * ar.minDamageMultiplier);
  });

  it('interpolates monotonically in between', () => {
    let previous = damageAtDistance(ar, ar.falloffStart);
    for (let d = ar.falloffStart; d <= ar.falloffEnd; d += 1) {
      const current = damageAtDistance(ar, d);
      assert.ok(current <= previous + 1e-9);
      previous = current;
    }
  });
});
