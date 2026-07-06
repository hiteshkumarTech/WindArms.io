'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clamp } from '@/lib/utils';

export const SETTINGS_LIMITS = {
  sensitivity: { min: 0.4, max: 2.5, step: 0.05 },
  fov: { min: 60, max: 110, step: 1 },
} as const;

export const SETTINGS_DEFAULTS = {
  sensitivity: 1,
  fov: 75,
  viewBob: true,
  showPerfHud: true,
} as const;

interface SettingsStore {
  /** Mouse sensitivity multiplier applied on top of the base tuning. */
  sensitivity: number;
  /** Base camera FOV; sprint/dash kicks add on top of it. */
  fov: number;
  viewBob: boolean;
  showPerfHud: boolean;

  setSensitivity: (value: number) => void;
  setFov: (value: number) => void;
  setViewBob: (value: boolean) => void;
  setShowPerfHud: (value: boolean) => void;
  resetDefaults: () => void;
}

/**
 * Player preferences, persisted to localStorage. Hot paths (controller,
 * viewmodel) read via getState() in the frame loop, so changes apply
 * live without re-rendering the simulation.
 */
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...SETTINGS_DEFAULTS,

      setSensitivity: (value) =>
        set({
          sensitivity: clamp(value, SETTINGS_LIMITS.sensitivity.min, SETTINGS_LIMITS.sensitivity.max),
        }),
      setFov: (value) => set({ fov: clamp(value, SETTINGS_LIMITS.fov.min, SETTINGS_LIMITS.fov.max) }),
      setViewBob: (value) => set({ viewBob: value }),
      setShowPerfHud: (value) => set({ showPerfHud: value }),
      resetDefaults: () => set({ ...SETTINGS_DEFAULTS }),
    }),
    { name: 'windarms-settings', version: 1 },
  ),
);
