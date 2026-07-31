import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTexelSizeX,
  computeTexelSizeY,
  PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG,
  snapToTexelGrid,
  STATIC_FULL_FLOOR_SHADOW_FRUSTUM_CONFIG,
  type ShadowFrustumConfig,
} from './playerCenteredShadowFrustum';
import { RANGE_SHADOW_CAMERA_BOUNDS } from '../range/rangeEnvironmentBounds';

describe('playerCenteredShadowFrustum — canonical configuration', () => {
  it('matches the Step 8E-D.1A measured/decided candidate exactly', () => {
    assert.strictEqual(PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG.width, 3.5);
    assert.strictEqual(PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG.height, 6.0);
    assert.strictEqual(PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG.mapWidth, 1024);
    assert.strictEqual(PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG.mapHeight, 1024);
    assert.strictEqual(PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG.near, 20);
    assert.strictEqual(PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG.far, 27);
  });

  it('texel sizes are independent per axis and match width/height / mapSize exactly', () => {
    const texelX = computeTexelSizeX(PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG);
    const texelY = computeTexelSizeY(PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG);
    assert.ok(Math.abs(texelX - 3.5 / 1024) < 1e-12);
    assert.ok(Math.abs(texelY - 6.0 / 1024) < 1e-12);
    assert.notStrictEqual(texelX, texelY, 'a rectangular frustum must NOT share one texel size across both axes');
  });

  it('the static full-floor configuration is untouched — exactly matches rangeEnvironmentBounds.ts\'s RANGE_SHADOW_CAMERA_BOUNDS', () => {
    assert.strictEqual(STATIC_FULL_FLOOR_SHADOW_FRUSTUM_CONFIG.width, 130);
    assert.strictEqual(STATIC_FULL_FLOOR_SHADOW_FRUSTUM_CONFIG.height, 130);
    assert.strictEqual(STATIC_FULL_FLOOR_SHADOW_FRUSTUM_CONFIG.near, 1);
    assert.strictEqual(STATIC_FULL_FLOOR_SHADOW_FRUSTUM_CONFIG.far, 100);
  });

  it('the static full-floor configuration LIVE-matches RANGE_SHADOW_CAMERA_BOUNDS — a drift regression, not just a hardcoded number', () => {
    assert.strictEqual(STATIC_FULL_FLOOR_SHADOW_FRUSTUM_CONFIG.width, RANGE_SHADOW_CAMERA_BOUNDS.right - RANGE_SHADOW_CAMERA_BOUNDS.left);
    assert.strictEqual(STATIC_FULL_FLOOR_SHADOW_FRUSTUM_CONFIG.height, RANGE_SHADOW_CAMERA_BOUNDS.top - RANGE_SHADOW_CAMERA_BOUNDS.bottom);
    assert.strictEqual(STATIC_FULL_FLOOR_SHADOW_FRUSTUM_CONFIG.near, RANGE_SHADOW_CAMERA_BOUNDS.near);
    assert.strictEqual(STATIC_FULL_FLOOR_SHADOW_FRUSTUM_CONFIG.far, RANGE_SHADOW_CAMERA_BOUNDS.far);
  });
});

describe('playerCenteredShadowFrustum — snapToTexelGrid', () => {
  const config = PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG;

  it('snaps to the nearest exact multiple of the per-axis texel size', () => {
    const texelX = computeTexelSizeX(config);
    const texelY = computeTexelSizeY(config);
    const out = snapToTexelGrid({ anchorLightSpaceX: texelX * 3.4, anchorLightSpaceY: texelY * 7.6, config });
    assert.ok(Math.abs(out.snappedLightSpaceX - texelX * 3) < 1e-9);
    assert.ok(Math.abs(out.snappedLightSpaceY - texelY * 8) < 1e-9);
  });

  it('snapping an already-exact multiple returns it unchanged (idempotent)', () => {
    const texelX = computeTexelSizeX(config);
    const texelY = computeTexelSizeY(config);
    const exactX = texelX * 41;
    const exactY = texelY * -17;
    const out = snapToTexelGrid({ anchorLightSpaceX: exactX, anchorLightSpaceY: exactY, config });
    assert.ok(Math.abs(out.snappedLightSpaceX - exactX) < 1e-9);
    assert.ok(Math.abs(out.snappedLightSpaceY - exactY) < 1e-9);
  });

  it('handles negative coordinates correctly (snaps toward the nearest grid line, not toward zero)', () => {
    const texelX = computeTexelSizeX(config);
    const out = snapToTexelGrid({ anchorLightSpaceX: -texelX * 5.5, anchorLightSpaceY: 0, config });
    // -5.5 texels rounds to -5 (JS Math.round rounds half-values toward +Infinity)
    assert.ok(Math.abs(out.snappedLightSpaceX - texelX * -5) < 1e-9, `expected -5 texels, got ${out.snappedLightSpaceX / texelX} texels`);
  });

  it('handles exactly zero', () => {
    const out = snapToTexelGrid({ anchorLightSpaceX: 0, anchorLightSpaceY: 0, config });
    assert.strictEqual(out.snappedLightSpaceX, 0);
    assert.strictEqual(out.snappedLightSpaceY, 0);
  });

  it('snaps correctly just below and just above a texel boundary', () => {
    const texelX = computeTexelSizeX(config);
    const belowHalf = texelX * 2 + texelX * 0.49;
    const aboveHalf = texelX * 2 + texelX * 0.51;
    const outBelow = snapToTexelGrid({ anchorLightSpaceX: belowHalf, anchorLightSpaceY: 0, config });
    const outAbove = snapToTexelGrid({ anchorLightSpaceX: aboveHalf, anchorLightSpaceY: 0, config });
    assert.ok(Math.abs(outBelow.snappedLightSpaceX - texelX * 2) < 1e-9, 'just below the .5 boundary should snap down');
    assert.ok(Math.abs(outAbove.snappedLightSpaceX - texelX * 3) < 1e-9, 'just above the .5 boundary should snap up');
  });

  it('is deterministic — the same input always produces the same output', () => {
    const a = snapToTexelGrid({ anchorLightSpaceX: 1.2345, anchorLightSpaceY: -2.3456, config });
    const b = snapToTexelGrid({ anchorLightSpaceX: 1.2345, anchorLightSpaceY: -2.3456, config });
    assert.deepStrictEqual(a, b);
  });

  it('produces finite output for finite input, across a wide range including large values', () => {
    for (const v of [0, 1, -1, 100, -100, 0.0001, -0.0001, 1e6, -1e6]) {
      const out = snapToTexelGrid({ anchorLightSpaceX: v, anchorLightSpaceY: v, config });
      assert.ok(Number.isFinite(out.snappedLightSpaceX));
      assert.ok(Number.isFinite(out.snappedLightSpaceY));
    }
  });

  it('non-finite input falls back to a snapped position of (0,0), never propagates NaN/Infinity', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const out = snapToTexelGrid({ anchorLightSpaceX: bad, anchorLightSpaceY: bad, config });
      assert.strictEqual(out.snappedLightSpaceX, 0);
      assert.strictEqual(out.snappedLightSpaceY, 0);
      assert.ok(Number.isFinite(out.left) && Number.isFinite(out.right) && Number.isFinite(out.top) && Number.isFinite(out.bottom));
    }
  });

  it('never accumulates — calling repeatedly with a FIXED input never drifts from the first result (no hidden state)', () => {
    const first = snapToTexelGrid({ anchorLightSpaceX: 0.777, anchorLightSpaceY: -1.333, config });
    let last = first;
    for (let i = 0; i < 50; i++) {
      last = snapToTexelGrid({ anchorLightSpaceX: 0.777, anchorLightSpaceY: -1.333, config });
    }
    assert.deepStrictEqual(last, first);
  });

  it('reuses the provided output object (zero allocation on the hot path) rather than always allocating a new one', () => {
    const out = { snappedLightSpaceX: -999, snappedLightSpaceY: -999, texelSizeX: -999, texelSizeY: -999, left: -999, right: -999, top: -999, bottom: -999, near: -999, far: -999 };
    const result = snapToTexelGrid({ anchorLightSpaceX: 1, anchorLightSpaceY: 1, config }, out);
    assert.strictEqual(result, out, 'must return the SAME object reference passed in, not a new allocation');
    assert.notStrictEqual(out.snappedLightSpaceX, -999, 'the reused object must actually be overwritten with real values');
  });

  it('left/right/top/bottom/near/far exactly reflect the config passed in, independent of the anchor position', () => {
    const out1 = snapToTexelGrid({ anchorLightSpaceX: 0, anchorLightSpaceY: 0, config });
    const out2 = snapToTexelGrid({ anchorLightSpaceX: 500, anchorLightSpaceY: -500, config });
    assert.strictEqual(out1.left, out2.left);
    assert.strictEqual(out1.right, out2.right);
    assert.strictEqual(out1.top, out2.top);
    assert.strictEqual(out1.bottom, out2.bottom);
    assert.strictEqual(out1.near, out2.near);
    assert.strictEqual(out1.far, out2.far);
    assert.strictEqual(out1.left, -1.75);
    assert.strictEqual(out1.right, 1.75);
    assert.strictEqual(out1.top, 3.0);
    assert.strictEqual(out1.bottom, -3.0);
  });

  it('works correctly with a non-canonical (e.g. square) config too — not hard-coded to the rectangular candidate', () => {
    const squareConfig: ShadowFrustumConfig = { width: 10, height: 10, mapWidth: 1024, mapHeight: 1024, near: 1, far: 50 };
    const out = snapToTexelGrid({ anchorLightSpaceX: 1.234, anchorLightSpaceY: 1.234, config: squareConfig });
    assert.strictEqual(out.texelSizeX, out.texelSizeY, 'a square config should have equal texel sizes');
    assert.strictEqual(out.left, -5);
    assert.strictEqual(out.right, 5);
  });
});
