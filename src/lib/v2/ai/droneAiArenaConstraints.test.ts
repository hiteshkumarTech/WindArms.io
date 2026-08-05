import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { constrainDronePosition } from './droneAiArenaConstraints';
import type { DroneArenaConfig } from './droneArenaConfig';

const CONFIG: DroneArenaConfig = {
  horizontalBounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  minAltitudeM: 1,
  maxAltitudeM: 8,
  softBoundaryMarginM: 2,
  hardBoundaryEpsilonM: 0.01,
  forbiddenZones: [{ id: 'test-zone', centerX: 0, centerZ: 0, radiusM: 2, minY: 0, maxY: 8 }],
  safeFallbackPositions: [{ x: 5, y: 3, z: 5 }],
};

function v(x: number, y: number, z: number) {
  return { x, y, z };
}

describe('constrainDronePosition — horizontal clamp', () => {
  it('a central position is unchanged', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(0, 4, 6), proposedPosition: v(0, 4, 6), config: CONFIG });
    assert.deepStrictEqual(r.position, v(0, 4, 6));
    assert.strictEqual(r.horizontalClamped, false);
  });

  it('a proposed position already inside bounds is unchanged', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(3, 4, 3), proposedPosition: v(9, 4, -9), config: CONFIG });
    assert.deepStrictEqual(r.position, v(9, 4, -9));
    assert.strictEqual(r.horizontalClamped, false);
  });

  it('min-X overshoot is clamped', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(-9, 4, 0), proposedPosition: v(-15, 4, 0), config: CONFIG });
    assert.strictEqual(r.position.x, -10);
    assert.strictEqual(r.horizontalClamped, true);
  });

  it('max-X overshoot is clamped', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(9, 4, 0), proposedPosition: v(15, 4, 0), config: CONFIG });
    assert.strictEqual(r.position.x, 10);
    assert.strictEqual(r.horizontalClamped, true);
  });

  it('min-Z overshoot is clamped', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(0, 4, -9), proposedPosition: v(0, 4, -15), config: CONFIG });
    assert.strictEqual(r.position.z, -10);
  });

  it('max-Z overshoot is clamped', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(0, 4, 9), proposedPosition: v(0, 4, 15), config: CONFIG });
    assert.strictEqual(r.position.z, 10);
  });

  it('corner overshoot is clamped on both axes', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(9, 4, 9), proposedPosition: v(20, 4, 20), config: CONFIG });
    assert.strictEqual(r.position.x, 10);
    assert.strictEqual(r.position.z, 10);
  });

  it('exact-boundary input is stable (identity, no shift)', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(9, 4, 0), proposedPosition: v(10, 4, 0), config: CONFIG });
    assert.strictEqual(r.position.x, 10);
    assert.strictEqual(r.horizontalClamped, false); // already exactly at the bound — clamp is a no-op
  });

  it('repeated application is idempotent', () => {
    const first = constrainDronePosition({ droneId: 'a', currentPosition: v(9, 4, 9), proposedPosition: v(50, 4, -50), config: CONFIG });
    const second = constrainDronePosition({ droneId: 'a', currentPosition: first.position, proposedPosition: first.position, config: CONFIG });
    assert.deepStrictEqual(second.position, first.position);
  });

  it('tangential displacement along the boundary is preserved', () => {
    // Proposed sits on the max-X wall but slides along Z — Z must pass through unclamped.
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(8, 4, 0), proposedPosition: v(10, 4, 5), config: CONFIG });
    assert.strictEqual(r.position.x, 10);
    assert.strictEqual(r.position.z, 5);
  });

  it('correction distance is finite and matches the actual shift', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(9, 4, 0), proposedPosition: v(20, 4, 0), config: CONFIG });
    assert.strictEqual(r.correctionDistanceM, 10); // 20 -> 10
  });

  it('does not mutate the input proposedPosition object', () => {
    const proposed = v(20, 4, 0);
    constrainDronePosition({ droneId: 'a', currentPosition: v(9, 4, 0), proposedPosition: proposed, config: CONFIG });
    assert.deepStrictEqual(proposed, v(20, 4, 0));
  });
});

describe('constrainDronePosition — altitude clamp', () => {
  it('a valid Y is unchanged', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 4, 5), proposedPosition: v(5, 4, 5), config: CONFIG });
    assert.strictEqual(r.position.y, 4);
    assert.strictEqual(r.altitudeClamped, false);
  });

  it('below minimum is corrected up', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 2, 5), proposedPosition: v(5, -3, 5), config: CONFIG });
    assert.strictEqual(r.position.y, 1);
    assert.strictEqual(r.altitudeClamped, true);
  });

  it('above maximum is corrected down', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 7, 5), proposedPosition: v(5, 20, 5), config: CONFIG });
    assert.strictEqual(r.position.y, 8);
    assert.strictEqual(r.altitudeClamped, true);
  });

  it('exact minimum is stable', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 2, 5), proposedPosition: v(5, 1, 5), config: CONFIG });
    assert.strictEqual(r.position.y, 1);
    assert.strictEqual(r.altitudeClamped, false);
  });

  it('exact maximum is stable', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 7, 5), proposedPosition: v(5, 8, 5), config: CONFIG });
    assert.strictEqual(r.position.y, 8);
    assert.strictEqual(r.altitudeClamped, false);
  });

  it('altitude clamp does not perturb X/Z', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(3, 7, -4), proposedPosition: v(3, 30, -4), config: CONFIG });
    assert.strictEqual(r.position.x, 3);
    assert.strictEqual(r.position.z, -4);
  });
});

describe('constrainDronePosition — forbidden-zone (Wind-Lift-style) exclusion', () => {
  it('outside the cylinder is unchanged', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 4, 5), proposedPosition: v(5, 4, 5), config: CONFIG });
    assert.deepStrictEqual(r.position, v(5, 4, 5));
    assert.strictEqual(r.forbiddenZoneCorrected, false);
  });

  it('just outside the cylinder is unchanged (not corrected)', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(3, 4, 0), proposedPosition: v(2.5, 4, 0), config: CONFIG });
    assert.strictEqual(r.forbiddenZoneCorrected, false);
    assert.strictEqual(r.position.x, 2.5);
  });

  it('exact boundary (treated as inside, matching the real WIND_LIFT player-check convention of <=radius) is stable under repeated application', () => {
    const first = constrainDronePosition({ droneId: 'a', currentPosition: v(3, 4, 0), proposedPosition: v(2, 4, 0), config: CONFIG });
    assert.strictEqual(first.forbiddenZoneCorrected, true);
    const second = constrainDronePosition({ droneId: 'a', currentPosition: first.position, proposedPosition: first.position, config: CONFIG });
    assert.deepStrictEqual(second.position, first.position);
    assert.strictEqual(second.forbiddenZoneCorrected, false);
  });

  it('inside the cylinder is projected outward beyond the radius', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(3, 4, 0), proposedPosition: v(1, 4, 0), config: CONFIG });
    assert.strictEqual(r.forbiddenZoneCorrected, true);
    const dist = Math.sqrt(r.position.x * r.position.x + r.position.z * r.position.z);
    assert.ok(dist > 2, `projected distance ${dist} must exceed the 2m radius`);
    assert.ok(dist < 2.1, `projected distance ${dist} should only exceed by the small epsilon, not overshoot wildly`);
  });

  it('exact centre uses a deterministic, finite fallback direction', () => {
    const r1 = constrainDronePosition({ droneId: 'drone-x', currentPosition: v(0, 4, 0), proposedPosition: v(0, 4, 0), config: CONFIG });
    const r2 = constrainDronePosition({ droneId: 'drone-x', currentPosition: v(0, 4, 0), proposedPosition: v(0, 4, 0), config: CONFIG });
    assert.ok(Number.isFinite(r1.position.x) && Number.isFinite(r1.position.z));
    assert.deepStrictEqual(r1.position, r2.position, 'same droneId must always produce the same centre-escape direction');
  });

  it('different drone IDs escape the centre in different (deterministic) directions', () => {
    const rA = constrainDronePosition({ droneId: 'drone-a', currentPosition: v(0, 4, 0), proposedPosition: v(0, 4, 0), config: CONFIG });
    const rB = constrainDronePosition({ droneId: 'drone-b', currentPosition: v(0, 4, 0), proposedPosition: v(0, 4, 0), config: CONFIG });
    assert.notDeepStrictEqual(rA.position, rB.position);
  });

  it('reverse/repeated calls are stable (converge, do not oscillate)', () => {
    const first = constrainDronePosition({ droneId: 'a', currentPosition: v(3, 4, 0), proposedPosition: v(0.5, 4, 0), config: CONFIG });
    const second = constrainDronePosition({ droneId: 'a', currentPosition: first.position, proposedPosition: first.position, config: CONFIG });
    assert.deepStrictEqual(second.position, first.position);
    assert.strictEqual(second.forbiddenZoneCorrected, false, 'a position already outside the zone must not be re-flagged as corrected');
  });

  it('never imparts a Y correction — only XZ is touched', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(3, 5, 0), proposedPosition: v(1, 5, 0), config: CONFIG });
    assert.strictEqual(r.position.y, 5);
  });

  it('respects the zone\'s own vertical band — a point above maxY is not corrected', () => {
    const tallZoneConfig: DroneArenaConfig = { ...CONFIG, forbiddenZones: [{ id: 'z', centerX: 0, centerZ: 0, radiusM: 2, minY: 0, maxY: 3 }] };
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(0, 5, 0), proposedPosition: v(0, 5, 0), config: tallZoneConfig });
    assert.strictEqual(r.forbiddenZoneCorrected, false);
  });

  it('produces no NaN under any tested case', () => {
    const cases = [v(0, 4, 0), v(1.9, 4, 0), v(-1.9, 4, 0), v(0, 4, 1.9), v(0, 4, -1.9)];
    for (const c of cases) {
      const r = constrainDronePosition({ droneId: 'x', currentPosition: v(5, 4, 5), proposedPosition: c, config: CONFIG });
      assert.ok(Number.isFinite(r.position.x) && Number.isFinite(r.position.y) && Number.isFinite(r.position.z));
    }
  });
});

describe('constrainDronePosition — safe input handling', () => {
  it('NaN proposed position falls back to current position (hold)', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 4, 5), proposedPosition: v(NaN, 4, 5), config: CONFIG });
    assert.deepStrictEqual(r.position, v(5, 4, 5));
  });

  it('Infinity proposed position falls back to current position (hold)', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 4, 5), proposedPosition: v(Infinity, 4, 5), config: CONFIG });
    assert.deepStrictEqual(r.position, v(5, 4, 5));
  });

  it('inverted horizontal bounds fails safe (holds at current position, no throw)', () => {
    const bad: DroneArenaConfig = { ...CONFIG, horizontalBounds: { minX: 10, maxX: -10, minZ: -10, maxZ: 10 } };
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 4, 5), proposedPosition: v(20, 4, 5), config: bad });
    assert.deepStrictEqual(r.position, v(5, 4, 5));
  });

  it('zero-size bounds fails safe (holds, no throw)', () => {
    const bad: DroneArenaConfig = { ...CONFIG, horizontalBounds: { minX: 0, maxX: 0, minZ: -10, maxZ: 10 } };
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 4, 5), proposedPosition: v(5, 4, 5), config: bad });
    assert.deepStrictEqual(r.position, v(5, 4, 5));
  });

  it('inverted altitude bounds fails safe', () => {
    const bad: DroneArenaConfig = { ...CONFIG, minAltitudeM: 8, maxAltitudeM: 1 };
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 4, 5), proposedPosition: v(5, 4, 5), config: bad });
    assert.deepStrictEqual(r.position, v(5, 4, 5));
  });

  it('NaN current position falls back to a finite safe fallback position, never (0,0,0) when a fallback exists', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(NaN, NaN, NaN), proposedPosition: v(5, 4, 5), config: CONFIG });
    assert.deepStrictEqual(r.position, CONFIG.safeFallbackPositions[0]);
  });

  it('NaN current position with no safe fallback available degrades to (0,0,0) as an explicit last resort, still finite', () => {
    const noFallback: DroneArenaConfig = { ...CONFIG, safeFallbackPositions: [] };
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(NaN, NaN, NaN), proposedPosition: v(5, 4, 5), config: noFallback });
    assert.deepStrictEqual(r.position, v(0, 0, 0));
  });

  it('zero elapsed movement (current === proposed) is a no-op', () => {
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 4, 5), proposedPosition: v(5, 4, 5), config: CONFIG });
    assert.strictEqual(r.correctionDistanceM, 0);
    assert.strictEqual(r.blockedDisplacementM, 0);
  });

  it('never produces NaN/Infinity output across a battery of malformed inputs', () => {
    const malformed = [v(NaN, 4, 0), v(Infinity, 4, 0), v(-Infinity, 4, 0), v(0, NaN, 0), v(0, 0, NaN)];
    for (const proposed of malformed) {
      const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 4, 5), proposedPosition: proposed, config: CONFIG });
      assert.ok(Number.isFinite(r.position.x) && Number.isFinite(r.position.y) && Number.isFinite(r.position.z));
      assert.ok(Number.isFinite(r.correctionDistanceM) && Number.isFinite(r.blockedDisplacementM));
    }
  });
});

describe('constrainDronePosition — output reuse', () => {
  it('reuses the caller-supplied output object rather than allocating a new one', () => {
    const output = { position: { x: 0, y: 0, z: 0 }, horizontalClamped: false, altitudeClamped: false, forbiddenZoneCorrected: false, correctionDistanceM: 0, blockedDisplacementM: 0 };
    const r = constrainDronePosition({ droneId: 'a', currentPosition: v(5, 4, 5), proposedPosition: v(5, 4, 5), config: CONFIG }, output);
    assert.strictEqual(r, output);
  });
});
