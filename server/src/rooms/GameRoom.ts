import {
  RESPAWN_DELAY_MS,
  type FirePacket,
  type MapId,
  type MovementState,
  type PlayerInputPacket,
  type PublicPlayer,
  type RoomInfo,
  type RoomSnapshot,
  type Vec3,
  type WeaponId,
} from '../../../shared/protocol';
import type { ArenaBox } from '../../../shared/arena';
import { MAPS, MAP_ORDER, occlusionBoxesFor } from '../../../shared/maps';
import {
  INTERMISSION_MS,
  ROUND_DURATION_MS,
  TOP3_XP,
  WIN_XP,
  type MatchPhase,
  type PodiumEntry,
} from '../../../shared/match';
import { XP_PER_KILL, XP_PER_MATCH_MINUTE, levelFromXp } from '../../../shared/progression';
import {
  DEFAULT_WEAPON,
  WEAPONS,
  damageAtDistance,
  fireIntervalMs,
  headshotMultiplier,
} from '../../../shared/weapons';
import { CONFIG } from '../config';
import { awardWin, flushSessionStats } from '../game/persistence';
import {
  distance,
  normalize,
  occlusionDistance,
  pointAlongRay,
  resolvePlayerHit,
} from '../game/combat';
import { createStreakState, recordKill, resetOnDeath, type StreakState } from '../game/streaks';
import {
  coerceMovementState,
  validateMovement,
  type ValidationContext,
} from '../game/validation';
import type { TypedServer, TypedSocket } from '../types';

const MAX_HEALTH = 100;
/** Shot origin may deviate from the last known pose by eye height + latency slack. */
const MAX_ORIGIN_DEVIATION = 3;
/** Accept slightly-early shots: client timers jitter against server clocks. */
const FIRE_RATE_TOLERANCE = 0.85;
/** Anti-cheat: violations tolerated per rolling window before a kick. */
const VIOLATION_LIMIT = 20;
const VIOLATION_WINDOW_MS = 60000;
/** All pellets of one trigger pull must stay inside this cone of the first. */
const PELLET_CONE_MIN_DOT = Math.cos((20 * Math.PI) / 180);

/** Quantize a coordinate to cm precision — trims snapshot bandwidth ~30%. */
function quantize(value: number): number {
  return Math.round(value * 100) / 100;
}

interface SessionPlayer {
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
  diedAt: number;
  lastFireAt: number;
  lastChatAt: number;
  validation: ValidationContext;
  /** Account linkage — null for guests. */
  userId: string | null;
  /** Account XP at join time; session XP stacks on top for live totals. */
  baseXp: number;
  sessionXp: number;
  joinedAtMs: number;
  /** Anti-cheat: rejected packets inside the rolling window. */
  violations: { count: number; windowStart: number };
  /** Lifetime-session counters for persistence (round K/D resets each map). */
  totalKills: number;
  totalDeaths: number;
  sessionHeadshotKills: number;
  streakState: StreakState;
}

/**
 * One authoritative game room: roster, validated poses, and combat.
 * All damage happens here — clients only report shot rays; the server
 * raycasts against player capsules with static-geometry occlusion,
 * applies falloff damage and owns the death/respawn lifecycle.
 */
export class GameRoom {
  private readonly players = new Map<string, SessionPlayer>();
  private readonly interval: NodeJS.Timeout;
  /** Static geometry for shot occlusion, re-resolved on map rotation. */
  private occlusion: ArenaBox[];
  private spawnPoints: Vec3[];
  private currentMapId: MapId;
  private phase: MatchPhase = 'playing';
  private phaseEndsAt = Date.now() + ROUND_DURATION_MS;
  private tick = 0;
  private spawnCursor = 0;
  private chatCounter = 0;

  constructor(
    private readonly io: TypedServer,
    readonly id: string,
    /** Join code for private rooms; null for public matchmaking rooms. */
    readonly code: string | null,
    /** Arena the room starts on (rotates every round). */
    initialMapId: MapId,
  ) {
    this.currentMapId = initialMapId;
    this.occlusion = occlusionBoxesFor(initialMapId);
    this.spawnPoints = MAPS[initialMapId].spawnPoints;
    this.interval = setInterval(() => this.broadcast(), 1000 / CONFIG.TICK_RATE);
  }

  get mapId(): MapId {
    return this.currentMapId;
  }

  get size(): number {
    return this.players.size;
  }

  get isFull(): boolean {
    return this.players.size >= CONFIG.MAX_PLAYERS_PER_ROOM;
  }

  get isPrivate(): boolean {
    return this.code !== null;
  }

  addPlayer(socket: TypedSocket, name: string): RoomInfo {
    const spawn = this.nextSpawn();
    // Authenticated players are identified by their account call sign.
    const account = socket.data.user ?? null;

    const player: SessionPlayer = {
      id: socket.id,
      name: account?.username ?? name,
      position: [...spawn] as Vec3,
      yaw: 0,
      pitch: 0,
      state: 'idle',
      weapon: DEFAULT_WEAPON,
      health: MAX_HEALTH,
      alive: true,
      kills: 0,
      deaths: 0,
      diedAt: 0,
      lastFireAt: 0,
      lastChatAt: 0,
      validation: {
        lastPosition: [...spawn] as Vec3,
        lastInputAt: Date.now(),
        lastSeq: -1,
      },
      userId: account?.id ?? null,
      baseXp: account?.xp ?? 0,
      sessionXp: 0,
      joinedAtMs: Date.now(),
      violations: { count: 0, windowStart: Date.now() },
      totalKills: 0,
      totalDeaths: 0,
      sessionHeadshotKills: 0,
      streakState: createStreakState(),
    };

    this.players.set(socket.id, player);
    socket.join(this.id);
    socket.to(this.id).emit('room:playerJoined', { id: player.id, name: player.name });
    // Late joiners need the current round state immediately.
    socket.emit('match:phase', {
      phase: this.phase,
      endsAt: this.phaseEndsAt,
      mapId: this.currentMapId,
    });

    return {
      roomId: this.id,
      code: this.code ?? undefined,
      selfId: socket.id,
      players: this.roster(),
      mapId: this.mapId,
    };
  }

  removePlayer(socketId: string): void {
    const player = this.players.get(socketId);
    if (!player) return;

    // Persist the session for authenticated players before dropping it.
    if (player.userId) {
      const seconds = (Date.now() - player.joinedAtMs) / 1000;
      const timeXp = Math.floor(seconds / 60) * XP_PER_MATCH_MINUTE;
      flushSessionStats(player.userId, {
        kills: player.totalKills,
        deaths: player.totalDeaths,
        xp: player.sessionXp + timeXp,
        seconds,
        headshots: player.sessionHeadshotKills,
        bestStreak: player.streakState.bestStreak,
      });
    }

    this.players.delete(socketId);
    this.io.to(this.id).emit('room:playerLeft', socketId);
  }

  handleInput(socket: TypedSocket, packet: PlayerInputPacket): void {
    const player = this.players.get(socket.id);
    if (!player || !player.alive) return;

    const now = Date.now();
    // Flood protection: at most one accepted packet per interval.
    if (now - player.validation.lastInputAt < CONFIG.MIN_INPUT_INTERVAL_MS) return;

    const verdict = validateMovement(packet, player.validation, now);
    if (!verdict.ok) {
      // Advance bookkeeping so a single bad packet cannot spam corrections.
      player.validation.lastSeq = packet.seq;
      player.validation.lastInputAt = now;
      socket.emit('player:correction', verdict.correctedPosition);
      this.registerViolation(socket, player, verdict.reason);
      return;
    }

    player.position = [...packet.position] as Vec3;
    player.yaw = packet.yaw;
    player.pitch = packet.pitch;
    player.state = coerceMovementState(packet.state);
    player.weapon = packet.weapon;
    player.validation.lastPosition = [...packet.position] as Vec3;
    player.validation.lastInputAt = now;
    player.validation.lastSeq = packet.seq;
  }

  handleFire(socket: TypedSocket, packet: FirePacket): void {
    if (this.phase !== 'playing') return;
    const shooter = this.players.get(socket.id);
    if (!shooter || !shooter.alive) return;

    const def = WEAPONS[packet.weapon];
    if (packet.directions.length > def.pellets) {
      this.registerViolation(socket, shooter, 'too many pellets');
      return;
    }

    // Server-side fire-rate enforcement.
    const now = Date.now();
    if (now - shooter.lastFireAt < fireIntervalMs(def) * FIRE_RATE_TOLERANCE) {
      this.registerViolation(socket, shooter, 'fire rate exceeded');
      return;
    }
    shooter.lastFireAt = now;

    // The muzzle must be near the last validated pose (eye offset + latency slack).
    if (distance(packet.origin, shooter.position) > MAX_ORIGIN_DEVIATION) {
      this.registerViolation(socket, shooter, 'implausible shot origin');
      return;
    }

    // Multi-pellet shots must form a plausible cone (no 360° shotgun hacks).
    if (packet.directions.length > 1) {
      const reference = normalize(packet.directions[0]);
      if (reference) {
        for (let i = 1; i < packet.directions.length; i++) {
          const pellet = normalize(packet.directions[i]);
          const dot = pellet
            ? pellet[0] * reference[0] + pellet[1] * reference[1] + pellet[2] * reference[2]
            : -1;
          if (dot < PELLET_CONE_MIN_DOT) {
            this.registerViolation(socket, shooter, 'pellet spread outside cone');
            return;
          }
        }
      }
    }

    const ends: Vec3[] = [];
    for (const rawDirection of packet.directions) {
      const dir = normalize(rawDirection);
      if (!dir) {
        ends.push([...packet.origin] as Vec3);
        continue;
      }

      const wallT = occlusionDistance(packet.origin, dir, def.range, this.occlusion);

      // Nearest alive victim along the ray (head zone resolved first).
      let victim: SessionPlayer | null = null;
      let victimT = Infinity;
      let victimHeadshot = false;
      for (const candidate of this.players.values()) {
        if (candidate.id === shooter.id || !candidate.alive) continue;
        const hit = resolvePlayerHit(packet.origin, dir, def.range, candidate.position);
        if (hit !== null && hit.t < victimT) {
          victim = candidate;
          victimT = hit.t;
          victimHeadshot = hit.headshot;
        }
      }

      if (victim && (wallT === null || victimT < wallT)) {
        const hitPos = pointAlongRay(packet.origin, dir, victimT);
        ends.push(hitPos);
        this.applyDamage(shooter, victim, packet.weapon, victimT, hitPos, now, victimHeadshot);
      } else {
        ends.push(pointAlongRay(packet.origin, dir, wallT ?? def.range));
      }
    }

    // Replicate the shot to everyone else (shooter already drew local tracers).
    socket.to(this.id).emit('combat:fired', {
      shooterId: shooter.id,
      weapon: packet.weapon,
      origin: packet.origin,
      ends,
    });
  }

  handleChat(socket: TypedSocket, text: string): void {
    const player = this.players.get(socket.id);
    if (!player || text.length === 0) return;

    // Rate limit: one message per 600 ms per player.
    const now = Date.now();
    if (now - player.lastChatAt < 600) return;
    player.lastChatAt = now;

    this.io.to(this.id).emit('chat:message', {
      id: this.chatCounter++,
      senderId: player.id,
      senderName: player.name,
      text,
      at: now,
    });
  }

  handleRespawn(socket: TypedSocket): void {
    if (this.phase !== 'playing') return;
    const player = this.players.get(socket.id);
    if (!player || player.alive) return;

    const now = Date.now();
    if (now - player.diedAt < RESPAWN_DELAY_MS) return;

    const spawn = this.nextSpawn();
    player.position = [...spawn] as Vec3;
    player.health = MAX_HEALTH;
    player.alive = true;
    // Reset validation anchors, otherwise the spawn teleport gets flagged.
    player.validation.lastPosition = [...spawn] as Vec3;
    player.validation.lastInputAt = now;

    this.io.to(this.id).emit('combat:respawned', {
      playerId: player.id,
      position: spawn,
      health: MAX_HEALTH,
    });
  }

  roster(): PublicPlayer[] {
    return [...this.players.values()].map((player) => ({ id: player.id, name: player.name }));
  }

  dispose(): void {
    clearInterval(this.interval);
  }

  private applyDamage(
    shooter: SessionPlayer,
    victim: SessionPlayer,
    weapon: WeaponId,
    hitDistance: number,
    hitPos: Vec3,
    now: number,
    headshot: boolean,
  ): void {
    const base = damageAtDistance(WEAPONS[weapon], hitDistance);
    const damage = Math.max(
      1,
      Math.round(headshot ? base * headshotMultiplier(weapon) : base),
    );
    victim.health = Math.max(0, victim.health - damage);

    const hitEvent = {
      shooterId: shooter.id,
      victimId: victim.id,
      weapon,
      damage,
      victimHealth: victim.health,
      hitPos,
      headshot,
    };
    this.io.to(shooter.id).emit('combat:hit', hitEvent);
    this.io.to(victim.id).emit('combat:hit', hitEvent);

    if (victim.health <= 0 && victim.alive) {
      victim.alive = false;
      victim.diedAt = now;
      victim.deaths += 1;
      victim.totalDeaths += 1;
      shooter.kills += 1;
      shooter.totalKills += 1;
      shooter.sessionXp += XP_PER_KILL;
      if (headshot) shooter.sessionHeadshotKills += 1;

      const victimStreakEnded = resetOnDeath(victim.streakState);
      const announcements = recordKill(shooter.streakState, now);
      if (announcements.streakTier !== null) {
        this.io.to(this.id).emit('combat:streak', {
          playerId: shooter.id,
          name: shooter.name,
          tier: announcements.streakTier,
        });
      }
      if (announcements.multikill !== null) {
        this.io.to(this.id).emit('combat:multikill', {
          playerId: shooter.id,
          name: shooter.name,
          count: announcements.multikill,
        });
      }

      if (shooter.userId) {
        const totalXp = shooter.baseXp + shooter.sessionXp;
        this.io.to(shooter.id).emit('account:xp', { xp: totalXp, level: levelFromXp(totalXp) });
      }
      this.io.to(this.id).emit('combat:death', {
        killerId: shooter.id,
        killerName: shooter.name,
        victimId: victim.id,
        victimName: victim.name,
        weapon,
        headshot,
        victimStreakEnded,
      });
      console.log(`[combat] ${shooter.name} eliminated ${victim.name} (${weapon}) in ${this.id}`);
    }
  }

  /**
   * Rolling-window strike system: legitimate clients trip the occasional
   * rejection through jitter, but sustained invalid traffic is a client
   * that isn't running our code — disconnect it. Stats still flush via
   * the normal disconnect path.
   */
  private registerViolation(socket: TypedSocket, player: SessionPlayer, reason: string): void {
    const now = Date.now();
    if (now - player.violations.windowStart > VIOLATION_WINDOW_MS) {
      player.violations.count = 0;
      player.violations.windowStart = now;
    }
    player.violations.count += 1;
    if (player.violations.count >= VIOLATION_LIMIT) {
      console.warn(
        `[anticheat] kicking ${player.name} (${player.id}) from ${this.id}: ${reason} (${player.violations.count} violations/min)`,
      );
      socket.emit('system:kicked', 'Removed by the server: repeated invalid game data.');
      setTimeout(() => socket.disconnect(true), 50);
    }
  }

  private nextSpawn(): Vec3 {
    const spawn = this.spawnPoints[this.spawnCursor % this.spawnPoints.length];
    this.spawnCursor += 1;
    return [...spawn] as Vec3;
  }

  /** Round timekeeping: playing → intermission (podium) → next map. */
  private updatePhase(now: number): void {
    if (now < this.phaseEndsAt) return;
    if (this.phase === 'playing') {
      this.endRound(now);
    } else {
      this.startRound(now);
    }
  }

  private endRound(now: number): void {
    this.phase = 'intermission';
    this.phaseEndsAt = now + INTERMISSION_MS;

    const standings = [...this.players.values()].sort(
      (a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name),
    );
    const podium: PodiumEntry[] = standings.slice(0, 3).map((player) => ({
      id: player.id,
      name: player.name,
      kills: player.kills,
      deaths: player.deaths,
    }));

    // Round rewards: winner takes WIN_XP, the rest of the podium TOP3_XP.
    standings.forEach((player, index) => {
      if (index === 0 && player.kills > 0) {
        player.sessionXp += WIN_XP;
        if (player.userId) awardWin(player.userId);
      } else if (index < 3) {
        player.sessionXp += TOP3_XP;
      }
    });

    this.io.to(this.id).emit('match:ended', {
      podium,
      winnerId: podium.length > 0 && podium[0].kills > 0 ? podium[0].id : null,
    });
    this.io.to(this.id).emit('match:phase', {
      phase: this.phase,
      endsAt: this.phaseEndsAt,
      mapId: this.currentMapId,
    });
    console.log(`[match] round ended in ${this.id} — winner: ${podium[0]?.name ?? 'none'}`);
  }

  private startRound(now: number): void {
    // Rotate to the next map and re-resolve its geometry.
    const nextIndex = (MAP_ORDER.indexOf(this.currentMapId) + 1) % MAP_ORDER.length;
    this.currentMapId = MAP_ORDER[nextIndex];
    this.occlusion = occlusionBoxesFor(this.currentMapId);
    this.spawnPoints = MAPS[this.currentMapId].spawnPoints;
    this.spawnCursor = 0;

    this.phase = 'playing';
    this.phaseEndsAt = now + ROUND_DURATION_MS;
    this.tick = 0;

    // Announce the new round first so clients remount the arena…
    this.io.to(this.id).emit('match:phase', {
      phase: this.phase,
      endsAt: this.phaseEndsAt,
      mapId: this.currentMapId,
    });

    // …then reset and teleport every player onto fresh spawns.
    for (const player of this.players.values()) {
      const spawn = this.nextSpawn();
      player.position = [...spawn] as Vec3;
      player.health = MAX_HEALTH;
      player.alive = true;
      player.kills = 0;
      player.deaths = 0;
      player.streakState.streak = 0;
      player.streakState.multiCount = 0;
      player.validation.lastPosition = [...spawn] as Vec3;
      player.validation.lastInputAt = now;
      this.io.to(this.id).emit('combat:respawned', {
        playerId: player.id,
        position: spawn,
        health: MAX_HEALTH,
      });
    }
    console.log(`[match] new round in ${this.id} on ${this.currentMapId}`);
  }

  private broadcast(): void {
    if (this.players.size === 0) return;
    this.updatePhase(Date.now());
    this.tick += 1;
    const snapshot: RoomSnapshot = {
      tick: this.tick,
      serverTime: Date.now(),
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        position: [
          quantize(player.position[0]),
          quantize(player.position[1]),
          quantize(player.position[2]),
        ] as Vec3,
        yaw: Math.round(player.yaw * 1000) / 1000,
        pitch: Math.round(player.pitch * 1000) / 1000,
        state: player.state,
        weapon: player.weapon,
        health: player.health,
        alive: player.alive,
        kills: player.kills,
        deaths: player.deaths,
      })),
    };
    this.io.to(this.id).emit('room:state', snapshot);
  }
}
