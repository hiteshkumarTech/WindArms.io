'use client';

import { create } from 'zustand';
import type { ShadowReviewCameraPreset } from './shadowReviewCameraPresets';

/**
 * Dev-only staging state for the Step 8E-C.3 shadow review harness —
 * `KaelShadowReviewPanel.tsx`, `/v2/range?shadow=1&shadowReview=1` only.
 * Deliberately does NOT duplicate the diagnostic-visible-material toggle
 * (`shadowDebugStore.ts`) or the shoulder/elbow-pole/grip-target marker
 * toggles (`shadowArmTunerStore.ts`) — the review panel drives those SAME
 * existing stores directly, since "hide markers for a marker-free capture"
 * and "show markers for calibration" are properties of the one shared debug
 * marker system, not a second copy this harness owns.
 */
export interface ShadowReviewState {
  cameraPreset: ShadowReviewCameraPreset;
  /** Mounts `KaelShadowReceiver.tsx`'s neutral matte ground plane. */
  receiverEnabled: boolean;

  setCameraPreset: (preset: ShadowReviewCameraPreset) => void;
  toggleReceiver: () => void;
  reset: () => void;
}

const DEFAULTS = {
  cameraPreset: 'threeQuarterFront' as ShadowReviewCameraPreset,
  receiverEnabled: true,
};

export const useShadowReviewStore = create<ShadowReviewState>()((set) => ({
  ...DEFAULTS,
  setCameraPreset: (preset) => set({ cameraPreset: preset }),
  toggleReceiver: () => set((s) => ({ receiverEnabled: !s.receiverEnabled })),
  reset: () => set({ ...DEFAULTS }),
}));
