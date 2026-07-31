import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useShadowReviewStore } from './shadowReviewStore';
import { SHADOW_REVIEW_CAMERA_PRESETS } from './shadowReviewCameraPresets';
import { CANONICAL_SHADOW_CALIBRATION, SHADOW_BIAS_BOUNDS, SHADOW_NORMAL_BIAS_BOUNDS } from './shadowLightCalibration';

/**
 * Same convention as `bodyDebugStore.test.ts`/`ikTunerStore.test.ts` — tests
 * the store's actual default/reset shape via `getState()`, not a UI/hook
 * integration test (that's `KaelShadowReviewPanel.tsx`'s job, and this
 * codebase has no React-component-rendering test harness to exercise that
 * with — see `docs/decisions.md`'s Step 8E-C.3 entry for this scoping
 * decision).
 */
describe('shadowReviewStore (Step 8E-C.3) — canonical defaults and reset', () => {
  it('canonical defaults: three-quarter front preset, receiver on', () => {
    useShadowReviewStore.getState().reset();
    const s = useShadowReviewStore.getState();
    assert.strictEqual(s.cameraPreset, 'threeQuarterFront');
    assert.strictEqual(s.receiverEnabled, true);
  });

  it('setCameraPreset accepts every preset SHADOW_REVIEW_CAMERA_PRESETS declares', () => {
    for (const preset of SHADOW_REVIEW_CAMERA_PRESETS) {
      useShadowReviewStore.getState().setCameraPreset(preset);
      assert.strictEqual(useShadowReviewStore.getState().cameraPreset, preset);
    }
    useShadowReviewStore.getState().reset();
  });

  it('toggleReceiver flips only its own field', () => {
    useShadowReviewStore.getState().reset();
    useShadowReviewStore.getState().setCameraPreset('lightFacing');
    useShadowReviewStore.getState().toggleReceiver();
    const s = useShadowReviewStore.getState();
    assert.strictEqual(s.receiverEnabled, false);
    assert.strictEqual(s.cameraPreset, 'lightFacing', 'unrelated field must be untouched');
    useShadowReviewStore.getState().reset();
  });

  it('reset() restores canonical defaults after live tuning', () => {
    useShadowReviewStore.getState().setCameraPreset('receiverWide');
    useShadowReviewStore.getState().toggleReceiver();
    useShadowReviewStore.getState().reset();
    const s = useShadowReviewStore.getState();
    assert.strictEqual(s.cameraPreset, 'threeQuarterFront');
    assert.strictEqual(s.receiverEnabled, true);
  });
});

/**
 * Step 8E-D — the calibration fields added this pass. Same `getState()`
 * convention as above; `resetCalibration()` is tested SEPARATELY from
 * `reset()` since the brief requires them to touch disjoint field sets
 * (camera/receiver-visibility vs. light/receiver-material calibration).
 */
describe('shadowReviewStore (Step 8E-D) — calibration fields', () => {
  it('canonical calibration defaults match shadowLightCalibration.ts\'s CANONICAL_SHADOW_CALIBRATION exactly', () => {
    useShadowReviewStore.getState().resetCalibration();
    const s = useShadowReviewStore.getState();
    assert.strictEqual(s.receiverMode, CANONICAL_SHADOW_CALIBRATION.receiverMode);
    assert.strictEqual(s.shadowBias, CANONICAL_SHADOW_CALIBRATION.bias);
    assert.strictEqual(s.shadowNormalBias, CANONICAL_SHADOW_CALIBRATION.normalBias);
    assert.strictEqual(s.shadowMapSize, CANONICAL_SHADOW_CALIBRATION.mapSize);
    assert.strictEqual(s.selfShadowEnabled, CANONICAL_SHADOW_CALIBRATION.selfShadowEnabled);
  });

  it('setReceiverMode accepts both production and readable', () => {
    useShadowReviewStore.getState().setReceiverMode('readable');
    assert.strictEqual(useShadowReviewStore.getState().receiverMode, 'readable');
    useShadowReviewStore.getState().setReceiverMode('production');
    assert.strictEqual(useShadowReviewStore.getState().receiverMode, 'production');
  });

  it('setShadowBias accepts an in-bounds value and rejects an out-of-bounds one (store unchanged on rejection)', () => {
    useShadowReviewStore.getState().resetCalibration();
    useShadowReviewStore.getState().setShadowBias(SHADOW_BIAS_BOUNDS.max);
    assert.strictEqual(useShadowReviewStore.getState().shadowBias, SHADOW_BIAS_BOUNDS.max);
    useShadowReviewStore.getState().setShadowBias(SHADOW_BIAS_BOUNDS.max + 1);
    assert.strictEqual(useShadowReviewStore.getState().shadowBias, SHADOW_BIAS_BOUNDS.max, 'out-of-bounds setter call must be a no-op, not clamp or throw');
  });

  it('setShadowNormalBias accepts an in-bounds value and rejects an out-of-bounds one', () => {
    useShadowReviewStore.getState().resetCalibration();
    useShadowReviewStore.getState().setShadowNormalBias(SHADOW_NORMAL_BIAS_BOUNDS.max);
    assert.strictEqual(useShadowReviewStore.getState().shadowNormalBias, SHADOW_NORMAL_BIAS_BOUNDS.max);
    useShadowReviewStore.getState().setShadowNormalBias(-1);
    assert.strictEqual(useShadowReviewStore.getState().shadowNormalBias, SHADOW_NORMAL_BIAS_BOUNDS.max, 'a negative normalBias must be rejected, not silently accepted');
  });

  it('setShadowMapSize accepts 1024/2048 and rejects any other value', () => {
    useShadowReviewStore.getState().resetCalibration();
    useShadowReviewStore.getState().setShadowMapSize(2048);
    assert.strictEqual(useShadowReviewStore.getState().shadowMapSize, 2048);
    // @ts-expect-error — deliberately passing an unpermitted size to prove the runtime guard, not just the type system, rejects it.
    useShadowReviewStore.getState().setShadowMapSize(4096);
    assert.strictEqual(useShadowReviewStore.getState().shadowMapSize, 2048, 'an unpermitted map size must be a no-op');
  });

  it('toggleSelfShadow flips only its own field', () => {
    useShadowReviewStore.getState().resetCalibration();
    useShadowReviewStore.getState().setReceiverMode('readable');
    useShadowReviewStore.getState().toggleSelfShadow();
    const s = useShadowReviewStore.getState();
    assert.strictEqual(s.selfShadowEnabled, true);
    assert.strictEqual(s.receiverMode, 'readable', 'unrelated field must be untouched');
    useShadowReviewStore.getState().resetCalibration();
  });

  it('resetCalibration() restores canonical values but leaves cameraPreset/receiverEnabled untouched (disjoint from reset())', () => {
    useShadowReviewStore.getState().setCameraPreset('shadowClose');
    useShadowReviewStore.getState().setReceiverMode('readable');
    useShadowReviewStore.getState().setShadowMapSize(2048);
    useShadowReviewStore.getState().resetCalibration();
    const s = useShadowReviewStore.getState();
    assert.strictEqual(s.receiverMode, CANONICAL_SHADOW_CALIBRATION.receiverMode);
    assert.strictEqual(s.shadowMapSize, CANONICAL_SHADOW_CALIBRATION.mapSize);
    assert.strictEqual(s.cameraPreset, 'shadowClose', 'resetCalibration() must not touch cameraPreset');
    useShadowReviewStore.getState().reset();
  });

  it('reset() also restores calibration fields (a full reset covers both field groups)', () => {
    useShadowReviewStore.getState().setReceiverMode('readable');
    useShadowReviewStore.getState().reset();
    assert.strictEqual(useShadowReviewStore.getState().receiverMode, CANONICAL_SHADOW_CALIBRATION.receiverMode);
  });
});

/**
 * Step 8E-D.1 — the player-centered shadow frustum's own store fields.
 * `frustumMode` lives in `CALIBRATION_DEFAULTS` (it's a calibration choice,
 * restorable via `resetCalibration()`); `showFrustumHelper` lives in
 * `DEFAULTS` (a pure visualization toggle, same group as `receiverEnabled`,
 * restorable only via the full `reset()` — matches the arm-tuner markers'
 * own "never part of a calibration reset" convention).
 */
describe('shadowReviewStore (Step 8E-D.1) — frustum tracking fields', () => {
  it('canonical default frustumMode is player-centered (the candidate for human review)', () => {
    useShadowReviewStore.getState().resetCalibration();
    assert.strictEqual(useShadowReviewStore.getState().frustumMode, 'player-centered');
  });

  it('setFrustumMode accepts both modes', () => {
    useShadowReviewStore.getState().setFrustumMode('static-full-floor');
    assert.strictEqual(useShadowReviewStore.getState().frustumMode, 'static-full-floor');
    useShadowReviewStore.getState().setFrustumMode('player-centered');
    assert.strictEqual(useShadowReviewStore.getState().frustumMode, 'player-centered');
  });

  it('resetCalibration() restores frustumMode to player-centered', () => {
    useShadowReviewStore.getState().setFrustumMode('static-full-floor');
    useShadowReviewStore.getState().resetCalibration();
    assert.strictEqual(useShadowReviewStore.getState().frustumMode, 'player-centered');
  });

  it('showFrustumHelper defaults to false and is untouched by resetCalibration()', () => {
    useShadowReviewStore.getState().reset();
    assert.strictEqual(useShadowReviewStore.getState().showFrustumHelper, false);
    useShadowReviewStore.getState().toggleFrustumHelper();
    assert.strictEqual(useShadowReviewStore.getState().showFrustumHelper, true);
    useShadowReviewStore.getState().resetCalibration();
    assert.strictEqual(useShadowReviewStore.getState().showFrustumHelper, true, 'resetCalibration() must not touch showFrustumHelper — it is not a calibration value');
    useShadowReviewStore.getState().reset();
    assert.strictEqual(useShadowReviewStore.getState().showFrustumHelper, false);
  });

  it('toggleFrustumHelper flips only its own field', () => {
    useShadowReviewStore.getState().reset();
    useShadowReviewStore.getState().setCameraPreset('shadowWide');
    useShadowReviewStore.getState().toggleFrustumHelper();
    const s = useShadowReviewStore.getState();
    assert.strictEqual(s.showFrustumHelper, true);
    assert.strictEqual(s.cameraPreset, 'shadowWide', 'unrelated field must be untouched');
    useShadowReviewStore.getState().reset();
  });
});
