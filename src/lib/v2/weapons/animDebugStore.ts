'use client';

import { create } from 'zustand';
import type { ActionKind } from '@/lib/v2/operators/actionPose';

/**
 * Dev-only staging state for the FP-arm reload/inspect action-pose preview
 * tool (`ArmActionDebugPanel`, Milestone 7, Phase G, Step 7C). Same
 * convention/guarantees as `ikTunerStore.ts`/`gripTunerStore.ts`: Zustand
 * for occasionally-changed UI state (not per-frame transforms), never
 * writes to source files, never feeds back into production behavior
 * outside an active `?anim=1` dev session.
 *
 * SCRUB MODE, not a parallel gameplay system: when `mode === 'scrub'`,
 * `VortexViewmodel.tsx` overrides the action `kind`/`progress` it feeds
 * into `computeActionPose` with this store's `scrubKind`/`scrubProgress`
 * INSTEAD OF `useVortexWeaponStore`'s real `reloadingUntil`/
 * `inspectingUntil` — but never touches ammo, never calls
 * `startReload`/`startInspect`, never blocks real firing. This is a pure
 * visual preview of the SAME curve a real action would produce, not a
 * second action-trigger path. `mode` defaults to `'live'` (normal
 * gameplay-driven behavior, byte-identical to no debug tool existing at
 * all) and nothing outside an active `?anim=1` session can ever set it to
 * `'scrub'`.
 */
export interface AnimDebugState {
  mode: 'live' | 'scrub';
  scrubKind: ActionKind;
  scrubProgress: number;
  /** True while `scrub` mode auto-advances `scrubProgress` over real time (a "play" preview); false holds `scrubProgress` at its current value (manual slider / freeze). */
  playing: boolean;
  loop: boolean;
  showActionTarget: boolean;
  showGripTarget: boolean;

  playReload: () => void;
  playInspect: () => void;
  setScrubProgress: (p: number) => void;
  setPlaying: (playing: boolean) => void;
  setLoop: (loop: boolean) => void;
  toggleShowActionTarget: () => void;
  toggleShowGripTarget: () => void;
  returnToLive: () => void;
}

export const useAnimDebugStore = create<AnimDebugState>()((set) => ({
  mode: 'live',
  scrubKind: 'idle',
  scrubProgress: 0,
  playing: false,
  loop: false,
  showActionTarget: false,
  showGripTarget: false,

  playReload: () => set({ mode: 'scrub', scrubKind: 'reload', scrubProgress: 0, playing: true }),
  playInspect: () => set({ mode: 'scrub', scrubKind: 'inspect', scrubProgress: 0, playing: true }),
  setScrubProgress: (p) => set({ mode: 'scrub', scrubProgress: Math.max(0, Math.min(1, p)), playing: false }),
  setPlaying: (playing) => set({ playing }),
  setLoop: (loop) => set({ loop }),
  toggleShowActionTarget: () => set((s) => ({ showActionTarget: !s.showActionTarget })),
  toggleShowGripTarget: () => set((s) => ({ showGripTarget: !s.showGripTarget })),
  returnToLive: () => set({ mode: 'live', scrubKind: 'idle', scrubProgress: 0, playing: false }),
}));
