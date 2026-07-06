/**
 * WindArms.io network protocol — the single source of truth for every
 * Socket.IO event and payload, imported by both the Next.js client
 * (via the `@shared/*` alias) and the game server (relative path).
 */

import type { MatchPhase, PodiumEntry, StreakTier } from './match';

export const PROTOCOL_VERSION = 3;

/** Delay between death and earliest redeploy (enforced server-side). */
export const RESPAWN_DELAY_MS = 3000;

/** Snapshot broadcast rate (Hz) — clients derive match time from ticks. */
export const SERVER_TICK_RATE = 20;

export type Vec3 = [number, number, number];

export type MovementState = 'idle' | 'run' | 'sprint' | 'slide' | 'dash' | 'air';

export type WeaponId = 'pistol' | 'smg' | 'ar' | 'shotgun' | 'sniper' | 'lmg' | 'energy';

export type MapId = 'cyber_city' | 'snow_base' | 'forest_temple';

/** Client → server pose update, sent ~30 Hz while in a room. */
export interface PlayerInputPacket {
  /** Monotonic per-session sequence number; the server rejects regressions. */
  seq: number;
  position: Vec3;
  yaw: number;
  pitch: number;
  state: MovementState;
  weapon: WeaponId;
}

/** Client → server shot report. One packet per trigger pull (shotguns send all pellet directions). */
export interface FirePacket {
  seq: number;
  weapon: WeaponId;
  origin: Vec3;
  directions: Vec3[];
}

/** One player's state inside a room snapshot. */
export interface PlayerSnapshot {
  id: string;
  name: string;
  position: Vec3;
  yaw: number;
  pitch: number;
  state: MovementState;
  weapon: WeaponId;
  health: number;
  alive: boolean;
  kills: number;
  deaths: number;
}

/** Authoritative room state, broadcast at the server tick rate (20 Hz). */
export interface RoomSnapshot {
  tick: number;
  /** Server wall-clock (ms) — clients estimate clock offset from this. */
  serverTime: number;
  players: PlayerSnapshot[];
}

/** Someone else fired: replicate muzzle flash + tracers with resolved endpoints. */
export interface RemoteFireEvent {
  shooterId: string;
  weapon: WeaponId;
  origin: Vec3;
  ends: Vec3[];
}

/** A validated hit — sent to shooter (hit confirm) and victim (damage feedback). */
export interface HitEvent {
  shooterId: string;
  victimId: string;
  weapon: WeaponId;
  damage: number;
  victimHealth: number;
  hitPos: Vec3;
  headshot: boolean;
}

export interface DeathEvent {
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  weapon: WeaponId;
  headshot: boolean;
  /** Length of the streak the victim was on (0 if none) — 5+ is a shutdown. */
  victimStreakEnded: number;
}

export interface RespawnEvent {
  playerId: string;
  position: Vec3;
  health: number;
}

export interface ChatMessage {
  id: number;
  senderId: string;
  senderName: string;
  text: string;
  at: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
}

export interface RoomInfo {
  roomId: string;
  /** Six-character join code — present only for private rooms. */
  code?: string;
  selfId: string;
  players: PublicPlayer[];
  /** Arena this room plays on — assigned by the server at room creation. */
  mapId: MapId;
}

export type JoinResult = { ok: true; room: RoomInfo } | { ok: false; error: string };

export interface ClientToServerEvents {
  'room:quickplay': (payload: { name: string }, ack: (result: JoinResult) => void) => void;
  'room:create': (payload: { name: string }, ack: (result: JoinResult) => void) => void;
  'room:join': (payload: { name: string; code: string }, ack: (result: JoinResult) => void) => void;
  'room:leave': () => void;
  'player:input': (packet: PlayerInputPacket) => void;
  'combat:fire': (packet: FirePacket) => void;
  'combat:respawn': () => void;
  'chat:send': (text: string) => void;
  'net:ping': (clientTime: number, ack: (serverTime: number) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  'room:playerJoined': (player: PublicPlayer) => void;
  'room:playerLeft': (playerId: string) => void;
  /** Server authority: the client must snap to this position (failed validation). */
  'player:correction': (position: Vec3) => void;
  'combat:fired': (event: RemoteFireEvent) => void;
  'combat:hit': (event: HitEvent) => void;
  'combat:death': (event: DeathEvent) => void;
  'combat:respawned': (event: RespawnEvent) => void;
  'chat:message': (message: ChatMessage) => void;
  /** Live XP total for the authenticated player (sent after each kill). */
  'account:xp': (payload: { xp: number; level: number }) => void;
  /** Anti-cheat: the server removed this client (reason is display-safe). */
  'system:kicked': (reason: string) => void;
  /** Round state: sent on join and on every phase transition. */
  'match:phase': (payload: { phase: MatchPhase; endsAt: number; mapId: MapId }) => void;
  /** Round results, broadcast when a round ends. */
  'match:ended': (payload: { podium: PodiumEntry[]; winnerId: string | null }) => void;
  'combat:streak': (payload: { playerId: string; name: string; tier: StreakTier }) => void;
  'combat:multikill': (payload: { playerId: string; name: string; count: number }) => void;
}
