'use client';

import { create } from 'zustand';
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';
import { TRIAL } from './constants';
import { DEFAULT_TRIAL_DIFFICULTY, TRIAL_DIFFICULTIES, type TrialDifficulty, type TrialDifficultyConfig } from './difficulty';
import { canTransition } from './matchStateMachine';
import type { MatchPhase } from './types';

/**
 * Authoritative Skyfront Trial match state (Milestone 6). One phase field
 * governed by matchStateMachine's transition table — never parallel
 * booleans. High-frequency actors (controller, drones, projectiles, the
 * MatchDirector clock) read via getState() inside useFrame (zero React
 * re-renders); the HUD subscribes with narrow selectors. Weapon facts
 * (ammo/shots/hits) stay in useVortexWeaponStore — the single weapon truth
 * — this store only orchestrates the match around it.
 */
interface V2MatchStore {
  phase: MatchPhase;
  /** Phase to return to on resume — only meaningful while phase === 'paused'. */
  resumePhase: MatchPhase;
  /** Locked once countdown begins — see `selectDifficulty`. Defaults to Medium on every fresh session. */
  selectedDifficulty: TrialDifficulty;
  countdownRemainingS: number;
  matchRemainingS: number;
  respawnRemainingS: number;
  playerHp: number;
  deaths: number;
  dronesDestroyed: number;
  completionTimeS: number | null;
  /** Bumps on every player damage tick — HUD damage flash + directional hint. */
  damageNonce: number;
  /** Direction of the most recent damage source in world XZ, for the HUD's directional indicator. */
  lastDamageFrom: [number, number, number] | null;
  /** Bumps each respawn — PlayerController teleports to spawn when it changes. */
  respawnNonce: number;
  /** Bumps each restart — scene actors (drones/projectiles/lift) hard-reset when it changes. */
  restartNonce: number;

  transition: (to: MatchPhase) => boolean;
  /** Hard reset to a fresh 'ready' session — used on mount, since this store is a module singleton that survives route navigation (a stale 'victory' must not persist into a re-entry). Not a transition; deliberately bypasses the table. */
  initSession: () => void;
  setReady: () => void;
  /** Only takes effect during 'ready' or 'booting' — no-op once countdown has begun, per the brief's "selection locked once countdown begins." */
  selectDifficulty: (difficulty: TrialDifficulty) => void;
  beginCountdown: () => void;
  /** One clock, driven by MatchDirector's frame loop with real delta seconds. */
  tick: (deltaS: number) => void;
  damagePlayer: (amount: number, from?: [number, number, number]) => void;
  recordDroneDestroyed: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
}

const isDev = process.env.NODE_ENV !== 'production';

export const useV2MatchStore = create<V2MatchStore>()((set, get) => ({
  phase: 'booting',
  resumePhase: 'active',
  selectedDifficulty: DEFAULT_TRIAL_DIFFICULTY,
  countdownRemainingS: TRIAL.COUNTDOWN_S,
  matchRemainingS: TRIAL_DIFFICULTIES[DEFAULT_TRIAL_DIFFICULTY].matchTimeS,
  respawnRemainingS: TRIAL.RESPAWN_S,
  playerHp: TRIAL.PLAYER_MAX_HP,
  deaths: 0,
  dronesDestroyed: 0,
  completionTimeS: null,
  damageNonce: 0,
  lastDamageFrom: null,
  respawnNonce: 0,
  restartNonce: 0,

  transition: (to) => {
    const from = get().phase;
    if (!canTransition(from, to)) {
      if (isDev) console.warn(`[skyfront-trial] illegal phase transition ${from} → ${to} ignored`);
      return false;
    }
    set({ phase: to });
    return true;
  },

  initSession: () => {
    useVortexWeaponStore.getState().reset();
    set({
      phase: 'ready',
      resumePhase: 'active',
      // Fresh route session always defaults to Medium — no persisted selection.
      selectedDifficulty: DEFAULT_TRIAL_DIFFICULTY,
      countdownRemainingS: TRIAL.COUNTDOWN_S,
      matchRemainingS: TRIAL_DIFFICULTIES[DEFAULT_TRIAL_DIFFICULTY].matchTimeS,
      respawnRemainingS: TRIAL.RESPAWN_S,
      playerHp: TRIAL.PLAYER_MAX_HP,
      deaths: 0,
      dronesDestroyed: 0,
      completionTimeS: null,
      damageNonce: 0,
      lastDamageFrom: null,
      // Bump both so the scene actors (drones/projectiles) and the player
      // controller hard-reset to spawn on a fresh session, exactly like a restart.
      respawnNonce: get().respawnNonce + 1,
      restartNonce: get().restartNonce + 1,
    });
  },

  setReady: () => {
    if (get().phase === 'booting') get().transition('ready');
  },

  selectDifficulty: (difficulty) => {
    const phase = get().phase;
    if (phase !== 'ready' && phase !== 'booting') return; // locked once countdown begins
    set({ selectedDifficulty: difficulty, matchRemainingS: TRIAL_DIFFICULTIES[difficulty].matchTimeS });
  },

  beginCountdown: () => {
    const difficulty = get().selectedDifficulty;
    if (get().transition('countdown')) {
      set({
        countdownRemainingS: TRIAL.COUNTDOWN_S,
        matchRemainingS: TRIAL_DIFFICULTIES[difficulty].matchTimeS,
        // Re-seed drones/bolts now that the difficulty is locked in, so combat
        // starts with the correct scaled HP/timing rather than whatever the
        // 'ready'-phase preview mount happened to construct with.
        restartNonce: get().restartNonce + 1,
      });
    }
  },

  tick: (deltaS) => {
    const state = get();
    switch (state.phase) {
      case 'countdown': {
        const remaining = state.countdownRemainingS - deltaS;
        if (remaining <= 0) {
          set({ countdownRemainingS: 0 });
          state.transition('active');
        } else {
          set({ countdownRemainingS: remaining });
        }
        break;
      }
      case 'active':
      case 'playerDead': {
        const remaining = state.matchRemainingS - deltaS;
        if (remaining <= 0) {
          set({ matchRemainingS: 0 });
          state.transition('defeat');
          return;
        }
        set({ matchRemainingS: remaining });
        if (state.phase === 'playerDead') {
          const respawnIn = state.respawnRemainingS - deltaS;
          if (respawnIn <= 0) {
            set({
              respawnRemainingS: TRIAL.RESPAWN_S,
              playerHp: TRIAL.PLAYER_MAX_HP,
              respawnNonce: state.respawnNonce + 1,
            });
            state.transition('active');
          } else {
            set({ respawnRemainingS: respawnIn });
          }
        }
        break;
      }
      default:
        break; // paused / menus: clock frozen by simply not being ticked here
    }
  },

  damagePlayer: (amount, from) => {
    const state = get();
    if (state.phase !== 'active') return; // no damage during countdown/pause/death/menus — machine-controlled
    const hp = Math.max(0, state.playerHp - amount);
    set({ playerHp: hp, damageNonce: state.damageNonce + 1, lastDamageFrom: from ?? null });
    if (hp <= 0) {
      set({ deaths: state.deaths + 1, respawnRemainingS: TRIAL.RESPAWN_S });
      state.transition('playerDead');
    }
  },

  recordDroneDestroyed: () => {
    const state = get();
    if (state.phase !== 'active' && state.phase !== 'playerDead') return;
    const destroyed = state.dronesDestroyed + 1;
    set({ dronesDestroyed: destroyed });
    const total = TRIAL_DIFFICULTIES[state.selectedDifficulty].droneCount;
    if (destroyed >= total) {
      set({ completionTimeS: TRIAL_DIFFICULTIES[state.selectedDifficulty].matchTimeS - state.matchRemainingS });
      state.transition('victory');
    }
  },

  pause: () => {
    const state = get();
    if (state.phase === 'countdown' || state.phase === 'active' || state.phase === 'playerDead') {
      set({ resumePhase: state.phase });
      state.transition('paused');
    }
  },

  resume: () => {
    const state = get();
    if (state.phase === 'paused') state.transition(state.resumePhase);
  },

  restart: () => {
    const state = get();
    if (!state.transition('restarting')) return;
    useVortexWeaponStore.getState().reset(); // single weapon truth resets with the match
    set({
      // selectedDifficulty deliberately untouched — restart/replay keep it.
      countdownRemainingS: TRIAL.COUNTDOWN_S,
      matchRemainingS: TRIAL_DIFFICULTIES[state.selectedDifficulty].matchTimeS,
      respawnRemainingS: TRIAL.RESPAWN_S,
      playerHp: TRIAL.PLAYER_MAX_HP,
      deaths: 0,
      dronesDestroyed: 0,
      completionTimeS: null,
      damageNonce: 0,
      lastDamageFrom: null,
      respawnNonce: get().respawnNonce + 1, // teleport the player back to spawn
      restartNonce: get().restartNonce + 1, // hard-reset drones/projectiles/lift
    });
    get().transition('countdown');
  },
}));

/**
 * Shared difficulty selectors — the HUD, drone AI and any other consumer
 * must resolve the effective config/drone-total through THESE (or
 * `TRIAL_DIFFICULTIES`/`resolveDroneConfig` directly), never a local copy,
 * so every reader agrees on the same selected configuration.
 */
export function useSelectedDifficulty(): TrialDifficulty {
  return useV2MatchStore((state) => state.selectedDifficulty);
}
export function useDifficultyConfig(): TrialDifficultyConfig {
  return useV2MatchStore((state) => TRIAL_DIFFICULTIES[state.selectedDifficulty]);
}
export function useTotalDrones(): number {
  return useV2MatchStore((state) => TRIAL_DIFFICULTIES[state.selectedDifficulty].droneCount);
}
