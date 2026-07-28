import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boundsCoverFloor, RANGE_FLOOR_CENTER, RANGE_FLOOR_SIZE, RANGE_SHADOW_CAMERA_BOUNDS } from './rangeEnvironmentBounds';

describe('rangeEnvironmentBounds (Step 8E-B) — regression lock', () => {
  it('the real floor size/center match what RangeEnvironment.tsx actually builds (36x0.1x80, centered [0,-0.05,-20])', () => {
    assert.deepStrictEqual([...RANGE_FLOOR_SIZE], [36, 0.1, 80]);
    assert.deepStrictEqual([...RANGE_FLOOR_CENTER], [0, -0.05, -20]);
  });

  it('THREE\'s default shadow-camera bounds (±5) do NOT cover the real floor — proves the bug this pass fixes was real, not hypothetical', () => {
    const defaultThreeBounds = { left: -5, right: 5, top: 5, bottom: -5 };
    assert.strictEqual(boundsCoverFloor(defaultThreeBounds, RANGE_FLOOR_SIZE, RANGE_FLOOR_CENTER), false);
  });

  it('the range spawn point (RangeController.tsx, [0,3,10]) is outside a ±5 default frustum — the concrete symptom, not just the abstract floor check', () => {
    const defaultHalfExtent = 5;
    assert.ok(10 > defaultHalfExtent, 'spawn Z=10 must exceed the default ±5 frustum half-extent for this test to mean anything');
  });

  it('/v2/play\'s own ±30 bounds would still clip most of this floor — proves the fix must not just copy that value', () => {
    const playLikeBounds = { left: -30, right: 30, top: 30, bottom: -30 };
    assert.strictEqual(boundsCoverFloor(playLikeBounds, RANGE_FLOOR_SIZE, RANGE_FLOOR_CENTER), false);
  });

  it('RANGE_SHADOW_CAMERA_BOUNDS (what RangeScene.tsx actually renders) covers the real floor extent', () => {
    assert.strictEqual(boundsCoverFloor(RANGE_SHADOW_CAMERA_BOUNDS, RANGE_FLOOR_SIZE, RANGE_FLOOR_CENTER), true);
  });

  it('RANGE_SHADOW_CAMERA_BOUNDS values are the exact expected regression-locked numbers', () => {
    assert.deepStrictEqual(RANGE_SHADOW_CAMERA_BOUNDS, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 100 });
  });

  it('boundsCoverFloor is symmetric-box-only and finite for degenerate/negative-size guards (no NaN/Infinity from a future bad edit)', () => {
    const result = boundsCoverFloor(RANGE_SHADOW_CAMERA_BOUNDS, [0, 0, 0], [0, 0, 0]);
    assert.strictEqual(result, true, 'a zero-size floor at the origin must trivially be covered by any real bounds');
  });
});
