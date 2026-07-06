'use client';

import { create } from 'zustand';
import type { MapId, PublicPlayer, RoomInfo } from '@shared/protocol';
import { DEFAULT_MAP_ID } from '@shared/maps';
import type { MatchPhase, PodiumEntry } from '@shared/match';

export type ConnectionStatus = 'offline' | 'connecting' | 'connected' | 'error';
export type SessionMode = 'menu' | 'offline' | 'online';

export interface PlayerScore {
  kills: number;
  deaths: number;
}

interface MultiplayerStore {
  status: ConnectionStatus;
  mode: SessionMode;
  roomId: string | null;
  roomCode: string | null;
  selfId: string | null;
  players: PublicPlayer[];
  /** Authoritative K/D per player, synced from snapshots when it changes. */
  scores: Record<string, PlayerScore>;
  /** Room lifetime in seconds, derived from server ticks. */
  matchSeconds: number;
  /** Active arena: server-assigned online, player-chosen for offline practice. */
  mapId: MapId;
  /** Round state (offline practice is always 'playing'). */
  matchPhase: MatchPhase;
  phaseEndsAt: number;
  podium: PodiumEntry[] | null;
  winnerId: string | null;
  rttMs: number | null;
  lastError: string | null;

  setConnecting: () => void;
  setError: (message: string) => void;
  joinedRoom: (room: RoomInfo) => void;
  startOffline: () => void;
  resetToMenu: () => void;
  connectionLost: () => void;
  addPlayer: (player: PublicPlayer) => void;
  removePlayer: (id: string) => void;
  syncRoster: (players: PublicPlayer[]) => void;
  setScores: (scores: Record<string, PlayerScore>) => void;
  setMatchSeconds: (seconds: number) => void;
  setOfflineMap: (mapId: MapId) => void;
  setPhase: (phase: MatchPhase, endsAt: number, mapId: MapId) => void;
  setPodium: (podium: PodiumEntry[], winnerId: string | null) => void;
  setRtt: (ms: number) => void;
}

const IDLE_SESSION = {
  roomId: null,
  roomCode: null,
  selfId: null,
  players: [] as PublicPlayer[],
  scores: {} as Record<string, PlayerScore>,
  matchSeconds: 0,
  matchPhase: 'playing' as MatchPhase,
  phaseEndsAt: 0,
  podium: null as PodiumEntry[] | null,
  winnerId: null as string | null,
  rttMs: null,
};

/** Lobby/session state for the multiplayer flow (menu → room → in-game). */
export const useMultiplayerStore = create<MultiplayerStore>()((set) => ({
  status: 'offline',
  mode: 'menu',
  mapId: DEFAULT_MAP_ID,
  ...IDLE_SESSION,
  lastError: null,

  setConnecting: () => set({ status: 'connecting', lastError: null }),
  setError: (message) => set({ status: 'error', lastError: message }),

  joinedRoom: (room) =>
    set({
      status: 'connected',
      mode: 'online',
      roomId: room.roomId,
      roomCode: room.code ?? null,
      selfId: room.selfId,
      players: room.players,
      mapId: room.mapId,
      lastError: null,
    }),

  startOffline: () => set({ mode: 'offline', status: 'offline', ...IDLE_SESSION, lastError: null }),

  resetToMenu: () => set({ mode: 'menu', status: 'offline', ...IDLE_SESSION }),

  connectionLost: () =>
    set({
      mode: 'menu',
      status: 'error',
      lastError: 'Connection to the server was lost.',
      ...IDLE_SESSION,
    }),

  addPlayer: (player) =>
    set((state) => ({
      players: state.players.some((existing) => existing.id === player.id)
        ? state.players
        : [...state.players, player],
    })),

  removePlayer: (id) =>
    set((state) => ({ players: state.players.filter((player) => player.id !== id) })),

  syncRoster: (players) => set({ players }),

  setScores: (scores) => set({ scores }),

  setMatchSeconds: (seconds) => set({ matchSeconds: seconds }),

  setOfflineMap: (mapId) => set({ mapId }),

  setPhase: (phase, endsAt, mapId) =>
    set((state) => ({
      matchPhase: phase,
      phaseEndsAt: endsAt,
      mapId,
      // Entering a new round clears the previous podium.
      podium: phase === 'playing' ? null : state.podium,
      winnerId: phase === 'playing' ? null : state.winnerId,
    })),

  setPodium: (podium, winnerId) => set({ podium, winnerId }),

  setRtt: (ms) => set({ rttMs: ms }),
}));
