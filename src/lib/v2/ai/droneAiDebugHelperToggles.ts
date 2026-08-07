'use client';

import { create } from 'zustand';

/**
 * Milestone 9H — dev-only PRESENTATION toggles for the optional Drone AI
 * debug visual helpers (`DroneAiDebugHelpers.tsx`), controlled by compact
 * checkboxes inside `DroneAiDebugPanel.tsx` — same convention as this
 * codebase's existing shadow/arm-tuner panels
 * (`shadowDebugStore.ts`/`shadowArmTunerStore.ts`): a small Zustand store
 * dedicated to UI PRESENTATION preferences, distinct in kind from
 * `droneAiDebugState.ts`'s own plain-mutable TELEMETRY container (which
 * must never import Zustand — see that module's own doc comment and
 * `droneAiImportGuards.test.ts`'s Milestone 9H guard). Zustand is the right
 * tool HERE specifically because a checkbox toggle is real (if rare)
 * user-interaction state that needs to be read reactively across the
 * DOM-panel/Canvas-helpers React-tree boundary — unlike the telemetry
 * sink, which is written every substep and must never trigger a React
 * re-render.
 *
 * Every flag here is PRESENTATION ONLY — see `DroneAiDebugHelpers.tsx`'s own
 * doc comment for the read-only enforcement (a helper reads these to decide
 * whether to RENDER a layer; none of them, nor any panel checkbox bound to
 * them, ever reaches into gameplay state).
 */
export interface DroneAiDebugHelperToggles {
  stateLabels: boolean;
  targetLines: boolean;
  movementArrows: boolean;
  leaseSectorMarkers: boolean;
  recoveryMarkers: boolean;
  arenaBounds: boolean;
  toggleStateLabels: () => void;
  toggleTargetLines: () => void;
  toggleMovementArrows: () => void;
  toggleLeaseSectorMarkers: () => void;
  toggleRecoveryMarkers: () => void;
  toggleArenaBounds: () => void;
  enableAll: () => void;
  reset: () => void;
}

const DEFAULTS = {
  stateLabels: true,
  targetLines: true,
  movementArrows: false,
  leaseSectorMarkers: true,
  recoveryMarkers: true,
  arenaBounds: false,
};

export const useDroneAiDebugHelperToggles = create<DroneAiDebugHelperToggles>()((set) => ({
  ...DEFAULTS,
  toggleStateLabels: () => set((s) => ({ stateLabels: !s.stateLabels })),
  toggleTargetLines: () => set((s) => ({ targetLines: !s.targetLines })),
  toggleMovementArrows: () => set((s) => ({ movementArrows: !s.movementArrows })),
  toggleLeaseSectorMarkers: () => set((s) => ({ leaseSectorMarkers: !s.leaseSectorMarkers })),
  toggleRecoveryMarkers: () => set((s) => ({ recoveryMarkers: !s.recoveryMarkers })),
  toggleArenaBounds: () => set((s) => ({ arenaBounds: !s.arenaBounds })),
  enableAll: () => set({ stateLabels: true, targetLines: true, movementArrows: true, leaseSectorMarkers: true, recoveryMarkers: true, arenaBounds: true }),
  reset: () => set({ ...DEFAULTS }),
}));
