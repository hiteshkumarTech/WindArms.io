'use client';

import { create } from 'zustand';
import { VORTEX_RUNTIME_ANCHORS } from './vortexRuntimeAnchors';

/**
 * Editable staging state for the Vortex grip-anchor authoring tool
 * (`VortexGripTunerPanel.tsx` / `VortexGripAnchorDebug.tsx`, Milestone 7,
 * Phase F, Step 7). Zustand, matching this project's existing convention
 * for occasionally-changed UI-relevant state (`useVortexWeaponStore`) — NOT
 * the per-frame transform-bridge convention (`gripWorldPose.ts`,
 * `muzzleWorldPose.ts`), because typing a new number into a panel input
 * happens at human interaction speed, not 60fps, and the panel genuinely
 * needs normal React re-renders to show the current value in its inputs.
 *
 * This store is PURELY a staging area. It never writes to
 * `vortexRuntimeAnchors.ts` (nothing in a running browser can — "do not
 * permanently write project files from the browser" is a hard instruction)
 * and it never feeds back into the REAL published `gripWorldPose` either —
 * `VortexGripAnchorDebug.tsx` resolves ITS OWN preview world pose from
 * these staged values (using `gripWorldPose.ts`'s published
 * `weaponWorldPosition`/`weaponWorldQuaternion` as the live weapon
 * transform to attach to), completely independent of the real
 * `VortexViewmodel.tsx` publish path. Copying a value out of this store
 * into `vortexRuntimeAnchors.ts` is a deliberate, manual, human action via
 * the panel's "copy code" button.
 */

export type TunedHandTarget = 'hand' | 'support';
export type GripStepSize = 'coarse' | 'fine';

export interface GripTunerAnchorValues {
  position: [number, number, number];
  /** Radians, same convention as `RuntimeGripAnchor.rotationEuler` — the panel itself displays degrees and converts at the input boundary. */
  rotationEuler: [number, number, number];
}

const STEP_SIZES = {
  coarse: { position: 0.01, rotationDeg: 5 },
  fine: { position: 0.001, rotationDeg: 1 },
} as const;

function cloneAnchor(source: { position: readonly [number, number, number]; rotationEuler: readonly [number, number, number] }): GripTunerAnchorValues {
  return {
    position: [...source.position] as [number, number, number],
    rotationEuler: [...source.rotationEuler] as [number, number, number],
  };
}

interface GripTunerStore {
  hand: GripTunerAnchorValues;
  support: GripTunerAnchorValues;
  selected: TunedHandTarget;
  stepSize: GripStepSize;
  showAxes: boolean;
  showPalmProxy: boolean;
  showHandProxy: boolean;
  /** Freezes the weapon's dynamic pose (sway/bob/recoil/reload/ADS-blend) at its current values while tuning, so anchor markers hold still relative to the model instead of drifting every frame — read by `VortexViewmodel.tsx`, which itself never mutates this store. */
  frozen: boolean;

  setPositionAxis: (target: TunedHandTarget, axis: 0 | 1 | 2, value: number) => void;
  setRotationAxisDegrees: (target: TunedHandTarget, axis: 0 | 1 | 2, valueDeg: number) => void;
  nudgePosition: (target: TunedHandTarget, axis: 0 | 1 | 2, direction: 1 | -1) => void;
  nudgeRotation: (target: TunedHandTarget, axis: 0 | 1 | 2, direction: 1 | -1) => void;
  setSelected: (target: TunedHandTarget) => void;
  setStepSize: (size: GripStepSize) => void;
  toggleAxes: () => void;
  togglePalmProxy: () => void;
  toggleHandProxy: () => void;
  toggleFrozen: () => void;
  resetToShipped: (target?: TunedHandTarget) => void;
  swapHands: () => void;
}

export const useGripTunerStore = create<GripTunerStore>()((set, get) => ({
  hand: cloneAnchor(VORTEX_RUNTIME_ANCHORS.gripHandLocal),
  support: cloneAnchor(VORTEX_RUNTIME_ANCHORS.gripSupportLocal),
  selected: 'hand',
  stepSize: 'coarse',
  showAxes: true,
  showPalmProxy: true,
  showHandProxy: false,
  frozen: false,

  setPositionAxis: (target, axis, value) =>
    set((state) => {
      const next = { ...state[target], position: [...state[target].position] as [number, number, number] };
      next.position[axis] = value;
      return { [target]: next } as Partial<GripTunerStore>;
    }),

  setRotationAxisDegrees: (target, axis, valueDeg) =>
    set((state) => {
      const next = { ...state[target], rotationEuler: [...state[target].rotationEuler] as [number, number, number] };
      next.rotationEuler[axis] = (valueDeg * Math.PI) / 180;
      return { [target]: next } as Partial<GripTunerStore>;
    }),

  nudgePosition: (target, axis, direction) =>
    set((state) => {
      const step = STEP_SIZES[state.stepSize].position * direction;
      const next = { ...state[target], position: [...state[target].position] as [number, number, number] };
      next.position[axis] += step;
      return { [target]: next } as Partial<GripTunerStore>;
    }),

  nudgeRotation: (target, axis, direction) =>
    set((state) => {
      const stepRad = (STEP_SIZES[state.stepSize].rotationDeg * Math.PI * direction) / 180;
      const next = { ...state[target], rotationEuler: [...state[target].rotationEuler] as [number, number, number] };
      next.rotationEuler[axis] += stepRad;
      return { [target]: next } as Partial<GripTunerStore>;
    }),

  setSelected: (target) => set({ selected: target }),
  setStepSize: (size) => set({ stepSize: size }),
  toggleAxes: () => set((state) => ({ showAxes: !state.showAxes })),
  togglePalmProxy: () => set((state) => ({ showPalmProxy: !state.showPalmProxy })),
  toggleHandProxy: () => set((state) => ({ showHandProxy: !state.showHandProxy })),
  toggleFrozen: () => set((state) => ({ frozen: !state.frozen })),

  resetToShipped: (target) => {
    if (target) {
      set({ [target]: cloneAnchor(target === 'hand' ? VORTEX_RUNTIME_ANCHORS.gripHandLocal : VORTEX_RUNTIME_ANCHORS.gripSupportLocal) } as Partial<GripTunerStore>);
    } else {
      set({
        hand: cloneAnchor(VORTEX_RUNTIME_ANCHORS.gripHandLocal),
        support: cloneAnchor(VORTEX_RUNTIME_ANCHORS.gripSupportLocal),
      });
    }
  },

  swapHands: () => {
    const state = get();
    set({ hand: state.support, support: state.hand });
  },
}));

/** Radians -> degrees, rounded for stable input display (avoids float-noise jitter like "44.99999999998" in a number input). */
export function radToDegDisplay(rad: number): number {
  return Math.round((rad * 180) / Math.PI * 100) / 100;
}

/** Generates the exact `RuntimeGripAnchor` object-literal source a human pastes into `vortexRuntimeAnchors.ts` — the tool's one write path, always manual/copy-paste, never automatic. */
export function formatAnchorAsCode(values: GripTunerAnchorValues, label: string): string {
  const [px, py, pz] = values.position;
  const [rx, ry, rz] = values.rotationEuler;
  return `// ${label}\n{\n  position: [${px.toFixed(4)}, ${py.toFixed(4)}, ${pz.toFixed(4)}],\n  rotationEuler: [${rx.toFixed(4)}, ${ry.toFixed(4)}, ${rz.toFixed(4)}],\n  rotationOrder: 'XYZ',\n}`;
}
