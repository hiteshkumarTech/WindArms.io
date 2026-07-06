'use client';

import { create } from 'zustand';
import type { WeaponId } from '@shared/protocol';
import { DEFAULT_WEAPON, WEAPONS, WEAPON_ORDER } from '@shared/weapons';

function fullMags(): Record<WeaponId, number> {
  return Object.fromEntries(
    WEAPON_ORDER.map((id) => [id, WEAPONS[id].magSize]),
  ) as Record<WeaponId, number>;
}

interface WeaponStore {
  current: WeaponId;
  /** Rounds remaining in each weapon's magazine. */
  mags: Record<WeaponId, number>;
  /** performance.now() ms when the active reload completes; 0 = not reloading. */
  reloadingUntil: number;

  switchWeapon: (id: WeaponId) => void;
  cycleWeapon: (direction: 1 | -1) => void;
  startReload: (finishesAt: number) => void;
  finishReload: () => void;
  consumeRound: () => void;
  resetAll: () => void;
}

/**
 * Local weapon state. Ammo is client-side for responsiveness; the server
 * independently enforces fire rate, so an ammo hack gains nothing beyond
 * what the rate cap already allows.
 */
export const useWeaponStore = create<WeaponStore>()((set, get) => ({
  current: DEFAULT_WEAPON,
  mags: fullMags(),
  reloadingUntil: 0,

  switchWeapon: (id) => {
    if (get().current === id) return;
    set({ current: id, reloadingUntil: 0 }); // switching cancels reloads
  },

  cycleWeapon: (direction) => {
    const { current } = get();
    const index = WEAPON_ORDER.indexOf(current);
    const next = WEAPON_ORDER[(index + direction + WEAPON_ORDER.length) % WEAPON_ORDER.length];
    set({ current: next, reloadingUntil: 0 });
  },

  startReload: (finishesAt) => set({ reloadingUntil: finishesAt }),

  finishReload: () =>
    set((state) => ({
      reloadingUntil: 0,
      mags: { ...state.mags, [state.current]: WEAPONS[state.current].magSize },
    })),

  consumeRound: () =>
    set((state) => ({
      mags: { ...state.mags, [state.current]: Math.max(0, state.mags[state.current] - 1) },
    })),

  resetAll: () => set({ current: DEFAULT_WEAPON, mags: fullMags(), reloadingUntil: 0 }),
}));
