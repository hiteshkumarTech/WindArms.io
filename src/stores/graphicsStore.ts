'use client';

import { create } from 'zustand';

export type GraphicsQuality = 'high' | 'low';

interface GraphicsStore {
  /** Driven by GameCanvas's PerformanceMonitor — not a user setting, so it's
   * never persisted and always starts optimistic ('high') each session. */
  quality: GraphicsQuality;
  setQuality: (quality: GraphicsQuality) => void;
}

/**
 * Runtime render-quality tier. GameCanvas flips this on sustained frame-rate
 * decline/incline; shadows, post-processing, reflections and particle
 * density all read it to gate expensive work without each owning a separate
 * performance sensor.
 */
export const useGraphicsStore = create<GraphicsStore>((set) => ({
  quality: 'high',
  setQuality: (quality) => set({ quality }),
}));
