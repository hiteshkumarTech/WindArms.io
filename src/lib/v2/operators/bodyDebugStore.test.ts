import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatBodyConfigAsCode, useBodyDebugStore } from './bodyDebugStore';

/**
 * Same convention as `ikTunerStore.test.ts` — tests the store's actual
 * default/reset shape and its one pure formatter function via `getState()`,
 * not a UI/hook integration test (that's `KaelBodyDebugPanel`'s job).
 */
describe('bodyDebugStore (Step 8C) — canonical defaults and reset', () => {
  it('canonical defaults are the identity transform — visible, zero offset, zero yaw, all debug helpers off', () => {
    useBodyDebugStore.getState().reset();
    const s = useBodyDebugStore.getState();
    assert.strictEqual(s.visible, true);
    assert.deepStrictEqual(s.positionOffsetLocal, [0, 0, 0]);
    assert.strictEqual(s.yawOffsetDeg, 0);
    assert.strictEqual(s.showBodyRootMarker, false);
    assert.strictEqual(s.showCameraMarker, false);
    assert.strictEqual(s.showDeformedBodyBounds, false);
    assert.strictEqual(s.neutralMaterial, false);
  });

  it('reset() restores canonical defaults after live tuning', () => {
    const store = useBodyDebugStore.getState();
    store.setPositionOffsetLocal([0.5, -0.2, 0.1]);
    store.setYawOffsetDeg(45);
    store.toggleVisible();
    store.toggleNeutralMaterial();

    useBodyDebugStore.getState().reset();
    const s = useBodyDebugStore.getState();
    assert.deepStrictEqual(s.positionOffsetLocal, [0, 0, 0]);
    assert.strictEqual(s.yawOffsetDeg, 0);
    assert.strictEqual(s.visible, true);
    assert.strictEqual(s.neutralMaterial, false);
  });

  it('each toggle flips only its own field', () => {
    useBodyDebugStore.getState().reset();
    useBodyDebugStore.getState().toggleBodyRootMarker();
    const s = useBodyDebugStore.getState();
    assert.strictEqual(s.showBodyRootMarker, true);
    assert.strictEqual(s.showCameraMarker, false);
    assert.strictEqual(s.showDeformedBodyBounds, false);
    useBodyDebugStore.getState().reset();
  });

  it('formatBodyConfigAsCode reflects the current tuned values', () => {
    useBodyDebugStore.getState().reset();
    useBodyDebugStore.getState().setPositionOffsetLocal([0.125, -0.25, 0.5]);
    useBodyDebugStore.getState().setYawOffsetDeg(12.5);
    const code = formatBodyConfigAsCode(useBodyDebugStore.getState());
    assert.match(code, /bodyPositionOffsetLocal:\s*\[0\.1250, -0\.2500, 0\.5000\]/);
    assert.match(code, /bodyYawOffsetDeg:\s*12\.50/);
    useBodyDebugStore.getState().reset();
  });
});
