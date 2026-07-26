'use client';

import { create } from 'zustand';

/**
 * Dev-only staging state for the Kael lower-body calibration tool
 * (`KaelBodyDebugPanel`, Milestone 8, Step 8C). Same convention as
 * `ikTunerStore.ts`/`gripTunerStore.ts` — Zustand for occasionally-changed
 * UI state (not per-frame transforms), never writes to source files, never
 * feeds back into production behavior outside an active `?body=1` dev
 * session. `KaelFirstPersonLowerBody.tsx` reads this store's values as
 * OVERRIDES on top of the shipped canonical zero-offset defaults (falls
 * back to 0 when unset — there is no "shipped non-zero" calibration to fall
 * back to yet, unlike the arm-IK tuner's shoulder-assist field).
 */

export interface BodyDebugState {
  /** Master visibility toggle for the lower-body mesh itself. */
  visible: boolean;
  /** Body-local offset, meters — rotated by the effective yaw before being added to world position (see KaelFirstPersonLowerBody.tsx). */
  positionOffsetLocal: readonly [number, number, number];
  /** Degrees, added on top of the published player world yaw. */
  yawOffsetDeg: number;
  showBodyRootMarker: boolean;
  showCameraMarker: boolean;
  showDeformedBodyBounds: boolean;
  /** Step 8C.1 — colored markers at the real skeleton bone world positions (hips/knees/ankles/waist-cut), for diagnosing exactly which anatomical landmark a given silhouette corresponds to, rather than guessing from a screenshot. */
  showSkeletonLandmarks: boolean;
  /** Swaps every material on the clone for a flat neutral grey — diagnostic only, restores the exact original material reference when disabled. */
  neutralMaterial: boolean;

  setPositionOffsetLocal: (v: readonly [number, number, number]) => void;
  setYawOffsetDeg: (v: number) => void;
  toggleVisible: () => void;
  toggleBodyRootMarker: () => void;
  toggleCameraMarker: () => void;
  toggleDeformedBodyBounds: () => void;
  toggleSkeletonLandmarks: () => void;
  toggleNeutralMaterial: () => void;
  reset: () => void;
}

const DEFAULTS = {
  visible: true,
  positionOffsetLocal: [0, 0, 0] as readonly [number, number, number],
  yawOffsetDeg: 0,
  showBodyRootMarker: false,
  showCameraMarker: false,
  showDeformedBodyBounds: false,
  showSkeletonLandmarks: false,
  neutralMaterial: false,
};

export const useBodyDebugStore = create<BodyDebugState>()((set) => ({
  ...DEFAULTS,

  setPositionOffsetLocal: (v) => set({ positionOffsetLocal: v }),
  setYawOffsetDeg: (v) => set({ yawOffsetDeg: v }),
  toggleVisible: () => set((s) => ({ visible: !s.visible })),
  toggleBodyRootMarker: () => set((s) => ({ showBodyRootMarker: !s.showBodyRootMarker })),
  toggleCameraMarker: () => set((s) => ({ showCameraMarker: !s.showCameraMarker })),
  toggleDeformedBodyBounds: () => set((s) => ({ showDeformedBodyBounds: !s.showDeformedBodyBounds })),
  toggleSkeletonLandmarks: () => set((s) => ({ showSkeletonLandmarks: !s.showSkeletonLandmarks })),
  toggleNeutralMaterial: () => set((s) => ({ neutralMaterial: !s.neutralMaterial })),
  reset: () => set({ ...DEFAULTS }),
}));

/** Generates a copy-paste-ready calibration snippet from the current tuned values — this tool's one write path back to source, always manual. */
export function formatBodyConfigAsCode(state: BodyDebugState): string {
  const [x, y, z] = state.positionOffsetLocal;
  return `bodyPositionOffsetLocal: [${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}],\nbodyYawOffsetDeg: ${state.yawOffsetDeg.toFixed(2)},`;
}
