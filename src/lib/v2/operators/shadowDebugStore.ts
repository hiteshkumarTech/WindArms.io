'use client';

import { create } from 'zustand';

/**
 * Dev-only staging state for the Kael first-person shadow foundation
 * prototype (Milestone 8, Step 8E-B) — `KaelShadowDebugPanel.tsx`,
 * `/v2/range?shadow=1` only. Deliberately small: the "freeze shared
 * locomotion" control this panel exposes is NOT a separate field here — it
 * calls `useBodyDebugStore.getState().toggleFreezeStride()` directly (see
 * that store, Step 8D), the SAME toggle the `?body=1` panel already owns,
 * because freezing is a property of the one shared locomotion runtime, not
 * something this prototype has its own copy of. Toggling it from either
 * panel freezes both the visible body and this shadow prototype identically
 * — that shared effect is itself part of what Step 8E-B is proving works.
 */

export interface ShadowDebugState {
  /** Swaps the shadow-only material for a normal visible one, for engineering inspection ONLY — this entire component tree is already dev-gated (`?shadow=1`), so this toggle does not need its own separate production guard, but must never be defaulted on. */
  diagnosticVisibleMaterial: boolean;
  toggleDiagnosticVisibleMaterial: () => void;
  reset: () => void;
}

const DEFAULTS = {
  diagnosticVisibleMaterial: false,
};

export const useShadowDebugStore = create<ShadowDebugState>()((set) => ({
  ...DEFAULTS,
  toggleDiagnosticVisibleMaterial: () => set((s) => ({ diagnosticVisibleMaterial: !s.diagnosticVisibleMaterial })),
  reset: () => set({ ...DEFAULTS }),
}));
