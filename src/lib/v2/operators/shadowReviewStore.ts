'use client';

import { create } from 'zustand';
import type { ShadowReviewCameraPreset } from './shadowReviewCameraPresets';
import {
  CANONICAL_SHADOW_CALIBRATION,
  isValidShadowBias,
  isValidShadowMapSize,
  isValidShadowNormalBias,
  type ShadowMapSize,
  type ShadowReceiverMode,
} from './shadowLightCalibration';

/**
 * Dev-only staging state for the Step 8E-C.3 shadow review harness —
 * `KaelShadowReviewPanel.tsx`, `/v2/range?shadow=1&shadowReview=1` only.
 * Deliberately does NOT duplicate the diagnostic-visible-material toggle
 * (`shadowDebugStore.ts`) or the shoulder/elbow-pole/grip-target marker
 * toggles (`shadowArmTunerStore.ts`) — the review panel drives those SAME
 * existing stores directly, since "hide markers for a marker-free capture"
 * and "show markers for calibration" are properties of the one shared debug
 * marker system, not a second copy this harness owns.
 *
 * STEP 8E-D ADDITION: `receiverMode`/`shadowBias`/`shadowNormalBias`/
 * `shadowMapSize`/`selfShadowEnabled` — all consumed ONLY while
 * `shadowReviewEnabled` is true (`RangeScene.tsx`'s own gating, not this
 * store's). Same lifecycle convention as the pre-existing `cameraPreset`/
 * `receiverEnabled` fields above: a module-level singleton that persists
 * across a route leave/re-entry within one browser session (never
 * explicitly reset on unmount, matching the established pattern), reset to
 * known-safe canonical values only via the explicit `resetCalibration()`
 * action (the review panel's own "reset to canonical Step 8E-D values"
 * control) or a fresh page load. Invalid setter input (non-finite, out of
 * bounds, wrong map size) is rejected — the store never enters a state this
 * milestone's own validity tests would fail.
 */
export interface ShadowReviewState {
  cameraPreset: ShadowReviewCameraPreset;
  /** Mounts `KaelShadowReceiver.tsx`'s neutral matte ground plane. */
  receiverEnabled: boolean;
  /** Which receiver material `KaelShadowReceiver.tsx` renders — `production` (STORM.abyss, matches the real floor) or `readable` (mid-gray, the original Step 8E-C.3 diagnostic look). */
  receiverMode: ShadowReceiverMode;
  /** Review-mode-only override for the range light's `shadow-bias`. Ignored entirely unless `shadowReviewEnabled` — see `shadowLightCalibration.ts`. */
  shadowBias: number;
  /** Review-mode-only override for the range light's `shadow-normalBias`. */
  shadowNormalBias: number;
  /** Review-mode-only override for the range light's `shadow-mapSize` (both dimensions). */
  shadowMapSize: ShadowMapSize;
  /** Review-mode-only: whether the shadow-prototype body/weapon also `receiveShadow` (self-shadowing experiment) — defaults to the pre-8E-D behavior (off) until evidence justifies enabling it. */
  selfShadowEnabled: boolean;

  setCameraPreset: (preset: ShadowReviewCameraPreset) => void;
  toggleReceiver: () => void;
  setReceiverMode: (mode: ShadowReceiverMode) => void;
  setShadowBias: (value: number) => void;
  setShadowNormalBias: (value: number) => void;
  setShadowMapSize: (value: ShadowMapSize) => void;
  toggleSelfShadow: () => void;
  /** Resets ONLY the Step 8E-D calibration fields to `CANONICAL_SHADOW_CALIBRATION` — leaves `cameraPreset`/`receiverEnabled` untouched (that's `reset()`'s job). */
  resetCalibration: () => void;
  reset: () => void;
}

const DEFAULTS = {
  cameraPreset: 'threeQuarterFront' as ShadowReviewCameraPreset,
  receiverEnabled: true,
};

const CALIBRATION_DEFAULTS = {
  receiverMode: CANONICAL_SHADOW_CALIBRATION.receiverMode,
  shadowBias: CANONICAL_SHADOW_CALIBRATION.bias,
  shadowNormalBias: CANONICAL_SHADOW_CALIBRATION.normalBias,
  shadowMapSize: CANONICAL_SHADOW_CALIBRATION.mapSize,
  selfShadowEnabled: CANONICAL_SHADOW_CALIBRATION.selfShadowEnabled,
};

export const useShadowReviewStore = create<ShadowReviewState>()((set) => ({
  ...DEFAULTS,
  ...CALIBRATION_DEFAULTS,
  setCameraPreset: (preset) => set({ cameraPreset: preset }),
  toggleReceiver: () => set((s) => ({ receiverEnabled: !s.receiverEnabled })),
  setReceiverMode: (mode) => set({ receiverMode: mode }),
  setShadowBias: (value) => {
    if (!isValidShadowBias(value)) return;
    set({ shadowBias: value });
  },
  setShadowNormalBias: (value) => {
    if (!isValidShadowNormalBias(value)) return;
    set({ shadowNormalBias: value });
  },
  setShadowMapSize: (value) => {
    if (!isValidShadowMapSize(value)) return;
    set({ shadowMapSize: value });
  },
  toggleSelfShadow: () => set((s) => ({ selfShadowEnabled: !s.selfShadowEnabled })),
  resetCalibration: () => set({ ...CALIBRATION_DEFAULTS }),
  reset: () => set({ ...DEFAULTS, ...CALIBRATION_DEFAULTS }),
}));
