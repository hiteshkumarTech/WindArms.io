import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAY_SHADOW_LIGHT_POSITION,
  PLAY_SHADOW_LIGHT_TARGET,
  PLAY_STATIC_SHADOW_CONFIG,
  PLAY_PLAYER_CENTERED_SHADOW_CONFIG,
  PLAY_GROUND_ANCHOR_Y,
} from './playShadowFrustumConfig';

// Step 8F.0's measured global worst case across all 140 captured frames
// (docs/decisions.md's Step 8F.0 entry) — the numbers this file's
// player-centered config must safely exceed.
const MEASURED_WORST_WIDTH_M = 2.557;
const MEASURED_WORST_HEIGHT_M = 9.427;
const MEASURED_MIN_NEAR = 25.916;
const MEASURED_MAX_FAR = 42.043;

describe('playShadowFrustumConfig — canonical light geometry', () => {
  it('matches play’s confirmed live directional light', () => {
    assert.deepStrictEqual(PLAY_SHADOW_LIGHT_POSITION, [16, 26, 10]);
    assert.deepStrictEqual(PLAY_SHADOW_LIGHT_TARGET, [0, 0, 0]);
  });
});

describe('playShadowFrustumConfig — static fallback (rollback target)', () => {
  it('matches the pre-existing V2PlayScene.tsx directionalLight literals byte-for-byte', () => {
    assert.deepStrictEqual(PLAY_STATIC_SHADOW_CONFIG, {
      width: 60,
      height: 60,
      mapWidth: 2048,
      mapHeight: 2048,
      near: 1,
      far: 80,
    });
  });

  it('derives to ±30 left/right/top/bottom, matching the original JSX literals', () => {
    assert.strictEqual(PLAY_STATIC_SHADOW_CONFIG.width / 2, 30);
    assert.strictEqual(PLAY_STATIC_SHADOW_CONFIG.height / 2, 30);
  });
});

describe('playShadowFrustumConfig — player-centered configuration (Step 8F.0 measured)', () => {
  it('matches the approved measured configuration exactly', () => {
    assert.deepStrictEqual(PLAY_PLAYER_CENTERED_SHADOW_CONFIG, {
      width: 3.5,
      height: 12,
      mapWidth: 1024,
      mapHeight: 1024,
      near: 24,
      far: 44,
    });
  });

  it('is NOT range’s configuration (height 6, near 20, far 27) — a distinct, independently measured candidate', () => {
    assert.notStrictEqual(PLAY_PLAYER_CENTERED_SHADOW_CONFIG.height, 6);
    assert.notStrictEqual(PLAY_PLAYER_CENTERED_SHADOW_CONFIG.near, 20);
    assert.notStrictEqual(PLAY_PLAYER_CENTERED_SHADOW_CONFIG.far, 27);
  });

  it('width exceeds the measured Wind Lift worst case with real margin', () => {
    assert.ok(PLAY_PLAYER_CENTERED_SHADOW_CONFIG.width > MEASURED_WORST_WIDTH_M, `width ${PLAY_PLAYER_CENTERED_SHADOW_CONFIG.width} must exceed measured worst ${MEASURED_WORST_WIDTH_M}`);
    const marginM = PLAY_PLAYER_CENTERED_SHADOW_CONFIG.width - MEASURED_WORST_WIDTH_M;
    assert.ok(marginM > 0.5, `width margin ${marginM.toFixed(3)}m is too thin over the measured worst case`);
  });

  it('height exceeds the measured Wind Lift worst case with real margin', () => {
    assert.ok(PLAY_PLAYER_CENTERED_SHADOW_CONFIG.height > MEASURED_WORST_HEIGHT_M, `height ${PLAY_PLAYER_CENTERED_SHADOW_CONFIG.height} must exceed measured worst ${MEASURED_WORST_HEIGHT_M}`);
    const marginM = PLAY_PLAYER_CENTERED_SHADOW_CONFIG.height - MEASURED_WORST_HEIGHT_M;
    assert.ok(marginM > 1, `height margin ${marginM.toFixed(3)}m is too thin over the measured worst case`);
  });

  it('near sits below every measured near value (closer to the light than anything measured)', () => {
    assert.ok(PLAY_PLAYER_CENTERED_SHADOW_CONFIG.near < MEASURED_MIN_NEAR, `near ${PLAY_PLAYER_CENTERED_SHADOW_CONFIG.near} must be below measured floor ${MEASURED_MIN_NEAR}`);
  });

  it('far exceeds every measured far value (farther from the light than anything measured)', () => {
    assert.ok(PLAY_PLAYER_CENTERED_SHADOW_CONFIG.far > MEASURED_MAX_FAR, `far ${PLAY_PLAYER_CENTERED_SHADOW_CONFIG.far} must exceed measured ceiling ${MEASURED_MAX_FAR}`);
  });

  it('vertical texel density is exactly 2× coarser than range’s (disclosed, accepted tradeoff)', () => {
    const playTexelY = PLAY_PLAYER_CENTERED_SHADOW_CONFIG.height / PLAY_PLAYER_CENTERED_SHADOW_CONFIG.mapHeight;
    const rangeTexelY = 6.0 / 1024;
    assert.ok(Math.abs(playTexelY / rangeTexelY - 2) < 1e-9, `expected play's Y texel size to be exactly 2x range's, got ratio ${playTexelY / rangeTexelY}`);
  });

  it('horizontal texel density matches range’s exactly (same width, same map resolution)', () => {
    const playTexelX = PLAY_PLAYER_CENTERED_SHADOW_CONFIG.width / PLAY_PLAYER_CENTERED_SHADOW_CONFIG.mapWidth;
    const rangeTexelX = 3.5 / 1024;
    assert.ok(Math.abs(playTexelX - rangeTexelX) < 1e-12);
  });
});

describe('playShadowFrustumConfig — ground anchor', () => {
  it('fixed at world Y = 0, matching MAIN_DECK’s top surface and the light’s own target Y', () => {
    assert.strictEqual(PLAY_GROUND_ANCHOR_Y, 0);
  });
});
