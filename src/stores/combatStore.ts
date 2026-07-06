'use client';

import { create } from 'zustand';
import { RESPAWN_DELAY_MS, type DeathEvent, type WeaponId } from '@shared/protocol';

export interface KillFeedEntry {
  id: number;
  killerName: string;
  victimName: string;
  weapon: WeaponId;
  at: number;
  headshot: boolean;
  /** How the local player relates to this entry (highlights the feed row). */
  self: 'killer' | 'victim' | null;
}

export interface Banner {
  id: number;
  title: string;
  subtitle: string | null;
}

const FEED_LIMIT = 6;
let feedId = 0;

interface CombatStore {
  health: number;
  alive: boolean;
  /** Date.now() ms when redeploy becomes available (while dead). */
  respawnAt: number;
  killedBy: string | null;
  kills: number;
  deaths: number;
  feed: KillFeedEntry[];
  /** Monotonic counters — HUD effects trigger on change. */
  hitmarkerNonce: number;
  damageNonce: number;
  /** True when the most recent confirmed hit was a headshot. */
  lastHitHeadshot: boolean;
  /** Center-screen announcement (streaks, multikills, shutdowns). */
  banner: Banner | null;

  selfDamaged: (health: number) => void;
  confirmedHit: (headshot: boolean) => void;
  showBanner: (title: string, subtitle?: string) => void;
  recordDeath: (event: DeathEvent, selfId: string | null) => void;
  respawned: () => void;
  /** New round: round-scoped scores reset, health/alive untouched. */
  resetScores: () => void;
  reset: () => void;
}

/** Local combat state + kill feed, driven by server events. */
export const useCombatStore = create<CombatStore>()((set) => ({
  health: 100,
  alive: true,
  respawnAt: 0,
  killedBy: null,
  kills: 0,
  deaths: 0,
  feed: [],
  hitmarkerNonce: 0,
  damageNonce: 0,
  lastHitHeadshot: false,
  banner: null,

  selfDamaged: (health) =>
    set((state) => ({ health, damageNonce: state.damageNonce + 1 })),

  confirmedHit: (headshot) =>
    set((state) => ({ hitmarkerNonce: state.hitmarkerNonce + 1, lastHitHeadshot: headshot })),

  showBanner: (title, subtitle) =>
    set(() => ({ banner: { id: feedId++, title, subtitle: subtitle ?? null } })),

  recordDeath: (event, selfId) =>
    set((state) => {
      const self =
        event.killerId === selfId ? 'killer' : event.victimId === selfId ? 'victim' : null;
      const entry: KillFeedEntry = {
        id: feedId++,
        killerName: event.killerName,
        victimName: event.victimName,
        weapon: event.weapon,
        at: Date.now(),
        headshot: event.headshot,
        self,
      };
      return {
        feed: [entry, ...state.feed].slice(0, FEED_LIMIT),
        kills: self === 'killer' ? state.kills + 1 : state.kills,
        deaths: self === 'victim' ? state.deaths + 1 : state.deaths,
        alive: self === 'victim' ? false : state.alive,
        health: self === 'victim' ? 0 : state.health,
        killedBy: self === 'victim' ? event.killerName : state.killedBy,
        respawnAt: self === 'victim' ? Date.now() + RESPAWN_DELAY_MS : state.respawnAt,
      };
    }),

  respawned: () => set({ health: 100, alive: true, killedBy: null, respawnAt: 0 }),

  resetScores: () => set({ kills: 0, deaths: 0 }),

  reset: () =>
    set({
      health: 100,
      alive: true,
      respawnAt: 0,
      killedBy: null,
      kills: 0,
      deaths: 0,
      feed: [],
      hitmarkerNonce: 0,
      damageNonce: 0,
      lastHitHeadshot: false,
      banner: null,
    }),
}));
