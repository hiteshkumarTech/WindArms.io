'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile } from '@shared/accounts';

interface AuthStore {
  token: string | null;
  profile: Profile | null;

  setSession: (token: string, profile: Profile) => void;
  /** Live XP updates pushed by the game server after each kill. */
  updateXp: (xp: number, level: number) => void;
  logout: () => void;
}

/**
 * Account session, persisted to localStorage. The token rides along on
 * the Socket.IO handshake so in-match kills persist to the account.
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      profile: null,

      setSession: (token, profile) => set({ token, profile }),

      updateXp: (xp, level) =>
        set((state) => (state.profile ? { profile: { ...state.profile, xp, level } } : state)),

      logout: () => set({ token: null, profile: null }),
    }),
    { name: 'windarms-auth', version: 1 },
  ),
);
