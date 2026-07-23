import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatIkConfigAsCode, useIkTunerStore } from './ikTunerStore';

/**
 * `formatIkConfigAsCode` is the one pure, easily-testable function this
 * dev-only Zustand store exposes — everything else is UI state better
 * covered by the actual `KaelArmIkTunerPanel`/`KaelFirstPersonArms`
 * integration than a store-shape unit test. Uses the store's own default
 * state (via `getState()`) as a base so this test can't drift out of sync
 * with `IkTunerState`'s real shape/action functions.
 */
describe('ikTunerStore — formatIkConfigAsCode (Step 6G shoulder-assist / Step 6H approved-pose copy-code)', () => {
  it('includes per-side shoulder assist values, falling back to the shipped (Step 6H approved) config when untouched', () => {
    const code = formatIkConfigAsCode(useIkTunerStore.getState());
    assert.match(code, /rightShoulderAssistLocal:\s*\[0\.0000, 0\.0000, 0\.0000\]/, `expected the shipped right assist (all zero) in the output, got:\n${code}`);
    assert.match(code, /leftShoulderAssistLocal:\s*\[0\.0600, -0\.0090, -0\.0500\]/, `expected the Step 6H approved left assist in the output, got:\n${code}`);
  });

  it('includes the approved per-side hand-basis-adjust and finger-curl-scale values, falling back to shipped config when untouched', () => {
    const code = formatIkConfigAsCode(useIkTunerStore.getState());
    assert.match(code, /rightHandBasisAdjustDeg:\s*\[30\.00, 0\.00, 0\.00\]/, `expected the approved +30deg right hand-basis adjust, got:\n${code}`);
    assert.match(code, /leftHandBasisAdjustDeg:\s*\[30\.00, 30\.00, -10\.00\]/, `expected the approved left hand-basis adjust, got:\n${code}`);
    assert.match(code, /rightFingerCurlScale:\s*0\.000/, `expected the approved right finger curl scale (0, not yet tuned), got:\n${code}`);
    assert.match(code, /leftFingerCurlScale:\s*0\.300/, `expected the approved left finger curl scale (0.30), got:\n${code}`);
  });

  it('reflects a live-tuned assist value once set, not the shipped default', () => {
    useIkTunerStore.getState().setLeftShoulderAssistLocal([0.1, 0.02, -0.05]);
    try {
      const code = formatIkConfigAsCode(useIkTunerStore.getState());
      assert.match(code, /leftShoulderAssistLocal:\s*\[0\.1000, 0\.0200, -0\.0500\]/, `expected the tuned value to appear, got:\n${code}`);
    } finally {
      useIkTunerStore.getState().resetToShipped();
    }
  });

  it('resetToShipped restores the assist/basis/curl fields to null (falls back to shipped config again)', () => {
    useIkTunerStore.getState().setRightShoulderAssistLocal([0.5, 0.5, 0.5]);
    useIkTunerStore.getState().setRightHandBasisAdjustDeg([10, 10, 10]);
    useIkTunerStore.getState().setRightFingerCurlScale(0.5);
    useIkTunerStore.getState().resetToShipped();
    assert.equal(useIkTunerStore.getState().rightShoulderAssistLocal, null);
    assert.equal(useIkTunerStore.getState().leftShoulderAssistLocal, null);
    assert.equal(useIkTunerStore.getState().rightHandBasisAdjustDeg, null);
    assert.equal(useIkTunerStore.getState().rightFingerCurlScale, null);
  });
});
