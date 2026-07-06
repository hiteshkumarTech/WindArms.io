'use client';

import { create } from 'zustand';
import type { MovementState } from '@/types/game';

export interface PlayerSnapshot {
  state: MovementState;
  /** Horizontal speed in m/s. */
  speed: number;
  fps: number;
  grounded: boolean;
  /** Dash cooldown progress: 0 = just used, 1 = ready. */
  dashCooldown: number;
}

interface PlayerStore extends PlayerSnapshot {
  setSnapshot: (snapshot: PlayerSnapshot) => void;
}

/**
 * HUD-facing player state. The controller publishes throttled snapshots
 * (~10 Hz) so DOM HUD components re-render cheaply, decoupled from the
 * 60–120 Hz simulation loop.
 */
export const usePlayerStore = create<PlayerStore>()((set) => ({
  state: 'idle',
  speed: 0,
  fps: 0,
  grounded: false,
  dashCooldown: 1,
  setSnapshot: (snapshot) => set(snapshot),
}));
