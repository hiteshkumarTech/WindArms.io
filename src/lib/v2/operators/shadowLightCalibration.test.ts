import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_SHADOW_CALIBRATION,
  isValidShadowBias,
  isValidShadowMapSize,
  isValidShadowNormalBias,
  PERMITTED_SHADOW_MAP_SIZES,
  PRODUCTION_SHADOW_DEFAULTS,
  RECEIVER_MODE_MATERIAL,
  SHADOW_BIAS_BOUNDS,
  SHADOW_NORMAL_BIAS_BOUNDS,
} from './shadowLightCalibration';
import { STORM } from '@/lib/v2/tokens';

/**
 * Step 8E-D — pure config/validation module, no scene/React dependency
 * (same "testable without a mounted canvas" convention every other
 * operators config file in this family follows).
 */
describe('shadowLightCalibration — production defaults (what every player without ?shadowReview=1 sees)', () => {
  it('bias/normalBias are exactly 0, mapSize is exactly 1024 — byte-identical to the pre-8E-D RangeScene.tsx literals', () => {
    assert.strictEqual(PRODUCTION_SHADOW_DEFAULTS.bias, 0);
    assert.strictEqual(PRODUCTION_SHADOW_DEFAULTS.normalBias, 0);
    assert.strictEqual(PRODUCTION_SHADOW_DEFAULTS.mapSize, 1024);
  });
});

describe('shadowLightCalibration — canonical Step 8E-D calibration', () => {
  it('every numeric field is finite', () => {
    assert.ok(Number.isFinite(CANONICAL_SHADOW_CALIBRATION.bias));
    assert.ok(Number.isFinite(CANONICAL_SHADOW_CALIBRATION.normalBias));
    assert.ok(Number.isFinite(CANONICAL_SHADOW_CALIBRATION.mapSize));
  });

  it('bias/normalBias fall within the conservative bounded ranges', () => {
    assert.ok(isValidShadowBias(CANONICAL_SHADOW_CALIBRATION.bias));
    assert.ok(isValidShadowNormalBias(CANONICAL_SHADOW_CALIBRATION.normalBias));
  });

  it('mapSize is a permitted size (1024 or 2048 only)', () => {
    assert.ok(isValidShadowMapSize(CANONICAL_SHADOW_CALIBRATION.mapSize));
  });

  it('default receiverMode is production, per this milestone\'s human-acceptance-mode decision', () => {
    assert.strictEqual(CANONICAL_SHADOW_CALIBRATION.receiverMode, 'production');
  });

  it('selfShadowEnabled defaults to false — the empirically-tested experiment showed no discernible improvement, per the evidence-gated acceptance rule', () => {
    assert.strictEqual(CANONICAL_SHADOW_CALIBRATION.selfShadowEnabled, false);
  });
});

describe('shadowLightCalibration — isValidShadowBias / isValidShadowNormalBias / isValidShadowMapSize', () => {
  it('accepts values at the exact bounds (inclusive)', () => {
    assert.ok(isValidShadowBias(SHADOW_BIAS_BOUNDS.min));
    assert.ok(isValidShadowBias(SHADOW_BIAS_BOUNDS.max));
    assert.ok(isValidShadowNormalBias(SHADOW_NORMAL_BIAS_BOUNDS.min));
    assert.ok(isValidShadowNormalBias(SHADOW_NORMAL_BIAS_BOUNDS.max));
  });

  it('rejects values just outside the bounds', () => {
    assert.ok(!isValidShadowBias(SHADOW_BIAS_BOUNDS.min - 0.0001));
    assert.ok(!isValidShadowBias(SHADOW_BIAS_BOUNDS.max + 0.0001));
    assert.ok(!isValidShadowNormalBias(SHADOW_NORMAL_BIAS_BOUNDS.min - 0.0001));
    assert.ok(!isValidShadowNormalBias(SHADOW_NORMAL_BIAS_BOUNDS.max + 0.0001));
  });

  it('rejects non-finite input (NaN, Infinity, -Infinity)', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      assert.ok(!isValidShadowBias(bad));
      assert.ok(!isValidShadowNormalBias(bad));
    }
  });

  it('isValidShadowMapSize accepts ONLY 1024 and 2048, rejects every other value including plausible-looking ones', () => {
    for (const size of PERMITTED_SHADOW_MAP_SIZES) assert.ok(isValidShadowMapSize(size));
    for (const bad of [0, 512, 1023, 1025, 4096, -1024, NaN, Infinity]) {
      assert.ok(!isValidShadowMapSize(bad), `expected ${bad} to be rejected`);
    }
  });
});

describe('shadowLightCalibration — RECEIVER_MODE_MATERIAL', () => {
  it('production mode uses the REAL design token (STORM.abyss), not a re-typed hex literal — same value, same reference source as RangeEnvironment.tsx\'s real floor', () => {
    assert.strictEqual(RECEIVER_MODE_MATERIAL.production.color, STORM.abyss);
  });

  it('readable mode preserves the original Step 8E-C.3 diagnostic values unchanged', () => {
    assert.strictEqual(RECEIVER_MODE_MATERIAL.readable.color, '#6b7280');
    assert.strictEqual(RECEIVER_MODE_MATERIAL.readable.roughness, 0.95);
  });

  it('both modes share the real floor\'s roughness (0.95) — only color differs between modes', () => {
    assert.strictEqual(RECEIVER_MODE_MATERIAL.production.roughness, 0.95);
    assert.strictEqual(RECEIVER_MODE_MATERIAL.readable.roughness, 0.95);
  });

  it('exactly two receiver modes exist — production and readable, no third/invalid mode representable', () => {
    assert.deepStrictEqual(Object.keys(RECEIVER_MODE_MATERIAL).sort(), ['production', 'readable']);
  });
});
