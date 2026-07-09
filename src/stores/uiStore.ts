'use client';

import { create } from 'zustand';

/**
 * Landing-site UI state: the Download and Profile/Auth modals are triggered
 * from several places (navbar, hero, mobile menu) but rendered once, so their
 * open state lives here instead of being prop-drilled.
 */
interface UiStore {
  downloadOpen: boolean;
  authOpen: boolean;
  openDownload: () => void;
  closeDownload: () => void;
  openAuth: () => void;
  closeAuth: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  downloadOpen: false,
  authOpen: false,
  openDownload: () => set({ downloadOpen: true }),
  closeDownload: () => set({ downloadOpen: false }),
  openAuth: () => set({ authOpen: true }),
  closeAuth: () => set({ authOpen: false }),
}));
