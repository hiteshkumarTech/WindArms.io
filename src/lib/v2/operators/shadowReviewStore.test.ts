import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useShadowReviewStore } from './shadowReviewStore';
import { SHADOW_REVIEW_CAMERA_PRESETS } from './shadowReviewCameraPresets';

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
