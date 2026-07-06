import {
  RESPAWN_DELAY_MS,
  type FirePacket,
  type MovementState,
  type PlayerInputPacket,
  type PublicPlayer,
  type RoomInfo,
  type RoomSnapshot,
  type Vec3,
  type WeaponId,
} from '../../../shared/protocol';
import { DEFAULT_WEAPON, WEAPONS, damageAtDistance, fireIntervalMs } from '../../../shared/weapons';
import { CONFIG } from '../config';
import {
  distance,
  normalize,
  occlusionDistance,
  pointAlongRay,
  rayCapsule,
} from '../game/combat';
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
  private tick = 0;
  private spawnCursor = 0;
  private chatCounter = 0;

  constructor(
    private readonly io: TypedServer,
    readonly id: string,
    /** Join code for private rooms; null for public matchmaking rooms. */
    readonly code: string | null,
  ) {
    this.interval = setInterval(() => this.broadcast(), 1000 / CONFIG.TICK_RATE);
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

    const player: SessionPlayer = {
      id: socket.id,
      name,
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
    };

    this.players.set(socket.id, player);
    socket.join(this.id);
    socket.to(this.id).emit('room:playerJoined', { id: player.id, name: player.name });

    return {
      roomId: this.id,
      code: this.code ?? undefined,
      selfId: socket.id,
      players: this.roster(),
    };
  }

  removePlayer(socketId: string): void {
    if (this.players.delete(socketId)) {
      this.io.to(this.id).emit('room:playerLeft', socketId);
    }
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
    const shooter = this.players.get(socket.id);
    if (!shooter || !shooter.alive) return;

    const def = WEAPONS[packet.weapon];
    if (packet.directions.length > def.pellets) return;

    // Server-side fire-rate enforcement.
    const now = Date.now();
    if (now - shooter.lastFireAt < fireIntervalMs(def) * FIRE_RATE_TOLERANCE) return;
    shooter.lastFireAt = now;

    // The muzzle must be near the last validated pose (eye offset + latency slack).
    if (distance(packet.origin, shooter.position) > MAX_ORIGIN_DEVIATION) return;

    const ends: Vec3[] = [];
    for (const rawDirection of packet.directions) {
      const dir = normalize(rawDirection);
      if (!dir) {
        ends.push([...packet.origin] as Vec3);
        continue;
      }

      const wallT = occlusionDistance(packet.origin, dir, def.range);

      // Nearest alive victim along the ray.
      let victim: SessionPlayer | null = null;
      let victimT = Infinity;
      for (const candidate of this.players.values()) {
        if (candidate.id === shooter.id || !candidate.alive) continue;
        const t = rayCapsule(packet.origin, dir, def.range, candidate.position);
        if (t !== null && t < victimT) {
          victim = candidate;
          victimT = t;
        }
      }

      if (victim && (wallT === null || victimT < wallT)) {
        const hitPos = pointAlongRay(packet.origin, dir, victimT);
        ends.push(hitPos);
        this.applyDamage(shooter, victim, packet.weapon, victimT, hitPos, now);
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
  ): void {
    const damage = Math.max(1, Math.round(damageAtDistance(WEAPONS[weapon], hitDistance)));
    victim.health = Math.max(0, victim.health - damage);

    const hitEvent = {
      shooterId: shooter.id,
      victimId: victim.id,
      weapon,
      damage,
      victimHealth: victim.health,
      hitPos,
    };
    this.io.to(shooter.id).emit('combat:hit', hitEvent);
    this.io.to(victim.id).emit('combat:hit', hitEvent);

    if (victim.health <= 0 && victim.alive) {
      victim.alive = false;
      victim.diedAt = now;
      victim.deaths += 1;
      shooter.kills += 1;
      this.io.to(this.id).emit('combat:death', {
        killerId: shooter.id,
        killerName: shooter.name,
        victimId: victim.id,
        victimName: victim.name,
        weapon,
      });
      console.log(`[combat] ${shooter.name} eliminated ${victim.name} (${weapon}) in ${this.id}`);
    }
  }

  private nextSpawn(): Vec3 {
    const spawn = CONFIG.SPAWN_POINTS[this.spawnCursor % CONFIG.SPAWN_POINTS.length];
    this.spawnCursor += 1;
    return [...spawn] as Vec3;
  }

  private broadcast(): void {
    if (this.players.size === 0) return;
    this.tick += 1;
    const snapshot: RoomSnapshot = {
      tick: this.tick,
      serverTime: Date.now(),
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        position: player.position,
        yaw: player.yaw,
        pitch: player.pitch,
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
