'use client';

import { create } from 'zustand';
import { WIND_WEAPONS } from '@shared/windWeapons';
import type { VortexWeaponState } from './vortexWeaponState';

const MAG_SIZE = WIND_WEAPONS.vortex.gameplayStats?.magSize ?? 30;

interface VortexWeaponStore {
  ammo: number;
  animState: VortexWeaponState;
  /** performance.now() ms when the active reload completes; 0 = not reloading. */
  reloadingUntil: number;
  /** performance.now() ms the inspect gesture ends; 0 = not inspecting. */
  inspectingUntil: number;
  ads: boolean;
  /** performance.now() ms the trigger has been continuously held since; 0 = not held. Drives the turbine spin-up ramp. */
  triggerHeldSince: number;
  /** Session stats — its own concern, per the "Statistics" architecture split; not persisted. */
  stats: { shotsFired: number; hits: number; targetsDestroyed: number };

  setAnimState: (state: VortexWeaponState) => void;
  setAds: (ads: boolean) => void;
  setTriggerHeldSince: (ms: number) => void;
  startReload: (finishesAt: number) => void;
  finishReload: () => void;
  startInspect: (untilMs: number) => void;
  consumeRound: () => void;
  recordShot: () => void;
  recordHit: (destroyed: boolean) => void;
  reset: () => void;
}

/** Local weapon state for the offline range scene — there's no server to defer to, so this is directly authoritative (unlike v1's client-side-for-feel-only ammo). */
export const useVortexWeaponStore = create<VortexWeaponStore>()((set) => ({
  ammo: MAG_SIZE,
  animState: 'equipping',
  reloadingUntil: 0,
  inspectingUntil: 0,
  ads: false,
  triggerHeldSince: 0,
  stats: { shotsFired: 0, hits: 0, targetsDestroyed: 0 },

  setAnimState: (animState) => set({ animState }),
  setAds: (ads) => set({ ads }),
  setTriggerHeldSince: (ms) => set({ triggerHeldSince: ms }),
  startReload: (finishesAt) => set({ reloadingUntil: finishesAt }),
  finishReload: () => set({ reloadingUntil: 0, ammo: MAG_SIZE }),
  startInspect: (untilMs) => set({ inspectingUntil: untilMs }),
  consumeRound: () => set((state) => ({ ammo: Math.max(0, state.ammo - 1) })),
  recordShot: () => set((state) => ({ stats: { ...state.stats, shotsFired: state.stats.shotsFired + 1 } })),
  recordHit: (destroyed) =>
    set((state) => ({
      stats: {
        ...state.stats,
        hits: state.stats.hits + 1,
        targetsDestroyed: state.stats.targetsDestroyed + (destroyed ? 1 : 0),
      },
    })),
  reset: () =>
    set({
      ammo: MAG_SIZE,
      animState: 'idle',
      reloadingUntil: 0,
      inspectingUntil: 0,
      ads: false,
      triggerHeldSince: 0,
      stats: { shotsFired: 0, hits: 0, targetsDestroyed: 0 },
    }),
}));
