import {
  INTERPOLATION_DELAY_MS,
  type MovementState,
  type PlayerSnapshot,
  type RoomSnapshot,
  type WeaponId,
} from '@shared/protocol';
import { clamp } from '@/lib/utils';

/**
 * Remote players render INTERPOLATION_DELAY_MS in the past (~2.4 server ticks
 * at 20 Hz), so there is almost always a pair of snapshots to interpolate
 * between — a little latency traded for perfectly smooth motion. The delay is
 * shared with the server so lag compensation rewinds by exactly this amount.
 */
const HISTORY_LIMIT = 30;

export interface RemotePose {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  state: MovementState;
  alive: boolean;
  weapon: WeaponId;
  health: number;
}

interface TimedFrame {
  serverTime: number;
  players: Map<string, PlayerSnapshot>;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * Ring buffer of authoritative room snapshots with clock-offset estimation
 * and per-player pose interpolation. Lives outside React state on purpose:
 * it is sampled every frame by the render loop, and pushed to at 20 Hz by
 * the network layer — neither should cause re-renders.
 */
export class SnapshotBuffer {
  private frames: TimedFrame[] = [];
  private clockOffset: number | null = null;

  push(snapshot: RoomSnapshot): void {
    const newest = this.frames[this.frames.length - 1];
    if (newest && snapshot.serverTime <= newest.serverTime) return; // stale or out of order

    const offsetSample = snapshot.serverTime - Date.now();
    this.clockOffset =
      this.clockOffset === null
        ? offsetSample
        : this.clockOffset + (offsetSample - this.clockOffset) * 0.1;

    const players = new Map<string, PlayerSnapshot>();
    for (const player of snapshot.players) players.set(player.id, player);
    this.frames.push({ serverTime: snapshot.serverTime, players });

    if (this.frames.length > HISTORY_LIMIT) {
      this.frames.splice(0, this.frames.length - HISTORY_LIMIT);
    }
  }

  clear(): void {
    this.frames = [];
    this.clockOffset = null;
  }

  /**
   * Writes the interpolated pose for `id` into `out`.
   * Returns false when the player has no recent snapshot data.
   */
  samplePlayer(id: string, out: RemotePose): boolean {
    if (this.frames.length === 0 || this.clockOffset === null) return false;
    const renderTime = Date.now() + this.clockOffset - INTERPOLATION_DELAY_MS;

    let older: TimedFrame | null = null;
    let newer: TimedFrame | null = null;
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].serverTime <= renderTime) {
        older = this.frames[i];
        newer = this.frames[i + 1] ?? null;
        break;
      }
    }
    if (!older) {
      older = this.frames[0];
      newer = this.frames[1] ?? null;
    }

    const from = older.players.get(id) ?? newer?.players.get(id);
    const to = newer?.players.get(id) ?? from;
    if (!from || !to) return false;

    const span = newer && newer.serverTime > older.serverTime ? newer.serverTime - older.serverTime : 1;
    const t = clamp((renderTime - older.serverTime) / span, 0, 1);

    out.position[0] = from.position[0] + (to.position[0] - from.position[0]) * t;
    out.position[1] = from.position[1] + (to.position[1] - from.position[1]) * t;
    out.position[2] = from.position[2] + (to.position[2] - from.position[2]) * t;
    out.yaw = lerpAngle(from.yaw, to.yaw, t);
    out.pitch = lerpAngle(from.pitch, to.pitch, t);
    out.state = t < 0.5 ? from.state : to.state;
    out.alive = to.alive;
    out.weapon = to.weapon;
    out.health = to.health;
    return true;
  }
}

/** Module singleton shared by the network layer (writes) and render loop (reads). */
export const remoteSnapshots = new SnapshotBuffer();
