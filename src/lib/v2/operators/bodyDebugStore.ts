'use client';

import { create } from 'zustand';

/**
 * Dev-only staging state for the Kael lower-body calibration tool
 * (`KaelBodyDebugPanel`, Milestone 8, Step 8C, extended Step 8D). Same
 * convention as `ikTunerStore.ts`/`gripTunerStore.ts` — Zustand for
 * occasionally-changed UI state (not per-frame transforms), never writes to
 * source files, never feeds back into production behavior outside an
 * active `?body=1` dev session. `KaelFirstPersonLowerBody.tsx` reads this
 * store's values as OVERRIDES on top of the shipped canonical zero-offset
 * defaults (falls back to 0 when unset — there is no "shipped non-zero"
 * calibration to fall back to yet, unlike the arm-IK tuner's
 * shoulder-assist field).
 *
 * STEP 8D ADDITIONS — locomotion preview/scrub controls. `previewMode`,
 * when not `'live'`, tells `KaelFirstPersonLowerBody.tsx` to feed the pure
 * locomotion module SYNTHETIC input matching the named state instead of the
 * real published movement signals — lets a developer inspect any single
 * locomotion state on demand without needing to actually perform it
 * in-game (e.g. holding a controlled mid-air pose to check the airborne
 * silhouette at a specific pitch). `freezeStride`+`stridePhaseScrub`
 * together let a developer step through one gait cycle frame-by-frame.
 */

export type LowerBodyPreviewMode = 'live' | 'idle' | 'walk' | 'sprint' | 'jumpRise' | 'airborne' | 'landing' | 'windLift';

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

  /** Step 8D — master toggle for procedural locomotion. False forces an exact, unconditional rest-pose restore every frame (see `restoreLowerBodyRestPose`), bypassing the pure pose module entirely. */
  locomotionEnabled: boolean;
  /** Step 8D — freezes elapsed time fed to the locomotion module (deltaSeconds forced to 0), same effect a real game pause has on it. */
  freezeStride: boolean;
  /** Step 8D — 0..1, only applied while `freezeStride` is true: directly overrides the runtime gait-phase accumulator so a developer can step through one cycle by hand. */
  stridePhaseScrub: number;
  /** Step 8D — when not 'live', overrides the real published movement signals with a synthetic input matching the named state. */
  previewMode: LowerBodyPreviewMode;

  setPositionOffsetLocal: (v: readonly [number, number, number]) => void;
  setYawOffsetDeg: (v: number) => void;
  toggleVisible: () => void;
  toggleBodyRootMarker: () => void;
  toggleCameraMarker: () => void;
  toggleDeformedBodyBounds: () => void;
  toggleSkeletonLandmarks: () => void;
  toggleNeutralMaterial: () => void;
  toggleLocomotionEnabled: () => void;
  toggleFreezeStride: () => void;
  setStridePhaseScrub: (v: number) => void;
  setPreviewMode: (v: LowerBodyPreviewMode) => void;
  /** Resets ONLY the Step 8D locomotion controls (enabled/freeze/scrub/preview) back to their live-gameplay defaults — separate from `reset()`, which covers the Step 8C position/yaw/marker calibration fields instead. */
  resetLocomotion: () => void;
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

const LOCOMOTION_DEFAULTS = {
  locomotionEnabled: true,
  freezeStride: false,
  stridePhaseScrub: 0,
  previewMode: 'live' as LowerBodyPreviewMode,
};

export const useBodyDebugStore = create<BodyDebugState>()((set) => ({
  ...DEFAULTS,
  ...LOCOMOTION_DEFAULTS,

  setPositionOffsetLocal: (v) => set({ positionOffsetLocal: v }),
  setYawOffsetDeg: (v) => set({ yawOffsetDeg: v }),
  toggleVisible: () => set((s) => ({ visible: !s.visible })),
  toggleBodyRootMarker: () => set((s) => ({ showBodyRootMarker: !s.showBodyRootMarker })),
  toggleCameraMarker: () => set((s) => ({ showCameraMarker: !s.showCameraMarker })),
  toggleDeformedBodyBounds: () => set((s) => ({ showDeformedBodyBounds: !s.showDeformedBodyBounds })),
  toggleSkeletonLandmarks: () => set((s) => ({ showSkeletonLandmarks: !s.showSkeletonLandmarks })),
  toggleNeutralMaterial: () => set((s) => ({ neutralMaterial: !s.neutralMaterial })),
  toggleLocomotionEnabled: () => set((s) => ({ locomotionEnabled: !s.locomotionEnabled })),
  toggleFreezeStride: () => set((s) => ({ freezeStride: !s.freezeStride })),
  setStridePhaseScrub: (v) => set({ stridePhaseScrub: v }),
  setPreviewMode: (v) => set({ previewMode: v }),
  resetLocomotion: () => set({ ...LOCOMOTION_DEFAULTS }),
  reset: () => set({ ...DEFAULTS, ...LOCOMOTION_DEFAULTS }),
}));

/** Generates a copy-paste-ready calibration snippet from the current tuned values — this tool's one write path back to source, always manual. */
export function formatBodyConfigAsCode(state: BodyDebugState): string {
  const [x, y, z] = state.positionOffsetLocal;
  return `bodyPositionOffsetLocal: [${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}],\nbodyYawOffsetDeg: ${state.yawOffsetDeg.toFixed(2)},`;
}
