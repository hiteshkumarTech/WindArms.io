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
 * Step 8E-D.1 — which shadow-camera frustum `RangeScene.tsx`'s directional
 * light uses while shadow-review mode is active. `static-full-floor` is the
 * pre-existing, UNCHANGED `RANGE_SHADOW_CAMERA_BOUNDS` (±65, origin-centered
 * — what every player who has never touched `?shadowReview=1` sees, and
 * what this mode restores exactly when selected). `player-centered` is the
 * Step 8E-D.1A-measured rectangular candidate
 * (`playerCenteredShadowFrustum.ts`'s `PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG`),
 * tracked via `KaelPlayerCenteredShadowController.tsx`. Defaults to
 * `player-centered` — the canonical candidate for human review, per this
 * pass's own brief — with `static-full-floor` kept selectable for direct
 * A/B comparison.
 */
export type ShadowFrustumMode = 'static-full-floor' | 'player-centered';

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
  /** Step 8E-D.1 — which shadow-camera frustum is active. See `ShadowFrustumMode`'s own doc comment. */
  frustumMode: ShadowFrustumMode;
  /** Step 8E-D.1 — dev-only `THREE.CameraHelper` wireframe of the active shadow-camera frustum (`KaelShadowFrustumHelper.tsx`). Defaults OFF — same "must be absent from marker-free evidence captures" convention as the arm-tuner marker toggles (`shadowArmTunerStore.ts`), never part of `resetCalibration()`'s canonical set since it's a pure visualization aid, not a calibration value. */
  showFrustumHelper: boolean;

  setCameraPreset: (preset: ShadowReviewCameraPreset) => void;
  toggleReceiver: () => void;
  setReceiverMode: (mode: ShadowReceiverMode) => void;
  setShadowBias: (value: number) => void;
  setShadowNormalBias: (value: number) => void;
  setShadowMapSize: (value: ShadowMapSize) => void;
  toggleSelfShadow: () => void;
  setFrustumMode: (mode: ShadowFrustumMode) => void;
  toggleFrustumHelper: () => void;
  /** Resets ONLY the Step 8E-D calibration fields to `CANONICAL_SHADOW_CALIBRATION` — leaves `cameraPreset`/`receiverEnabled` untouched (that's `reset()`'s job). */
  resetCalibration: () => void;
  reset: () => void;
}

const DEFAULTS = {
  cameraPreset: 'threeQuarterFront' as ShadowReviewCameraPreset,
  receiverEnabled: true,
  showFrustumHelper: false,
};

const CALIBRATION_DEFAULTS = {
  receiverMode: CANONICAL_SHADOW_CALIBRATION.receiverMode,
  shadowBias: CANONICAL_SHADOW_CALIBRATION.bias,
  shadowNormalBias: CANONICAL_SHADOW_CALIBRATION.normalBias,
  shadowMapSize: CANONICAL_SHADOW_CALIBRATION.mapSize,
  selfShadowEnabled: CANONICAL_SHADOW_CALIBRATION.selfShadowEnabled,
  // Step 8E-D.1 — the canonical candidate for human review defaults to
  // player-centered (per this pass's own brief); static-full-floor remains
  // one click away for direct A/B comparison, and is what
  // `RangeScene.tsx` ALWAYS uses when `shadowReviewEnabled` is false,
  // regardless of this field's value.
  frustumMode: 'player-centered' as ShadowFrustumMode,
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
  setFrustumMode: (mode) => set({ frustumMode: mode }),
  toggleFrustumHelper: () => set((s) => ({ showFrustumHelper: !s.showFrustumHelper })),
  resetCalibration: () => set({ ...CALIBRATION_DEFAULTS }),
  reset: () => set({ ...DEFAULTS, ...CALIBRATION_DEFAULTS }),
}));
