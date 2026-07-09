import type { Vec3 } from '../../../shared/protocol';

/**
 * Per-room ring buffer of authoritative player positions, timestamped with
 * server wall-clock. Lag compensation samples it to reconstruct where a
 * victim was when the shooter fired. Pure and side-effect free (aside from
 * its own buffer) so the interpolation is unit-testable without sockets.
 */
export class PoseHistory {
  private readonly frames: Array<{ time: number; poses: Map<string, Vec3> }> = [];

  constructor(private readonly capacity: number) {}

  /** Record one authoritative tick. Positions are copied (no aliasing). */
  record(time: number, poses: Iterable<readonly [string, Vec3]>): void {
    const snapshot = new Map<string, Vec3>();
    for (const [id, pos] of poses) snapshot.set(id, [pos[0], pos[1], pos[2]]);
    this.frames.push({ time, poses: snapshot });
    if (this.frames.length > this.capacity) this.frames.shift();
  }

  /**
   * Interpolated position of `id` at `targetTime`, clamped to the buffer
   * span. Returns null when the player is absent from the bracketing frames
   * (e.g. joined after the target time).
   */
  sampleAt(id: string, targetTime: number): Vec3 | null {
    if (this.frames.length === 0) return null;

    const oldest = this.frames[0];
    const newest = this.frames[this.frames.length - 1];
    if (targetTime <= oldest.time) return oldest.poses.get(id) ?? null;
    if (targetTime >= newest.time) return newest.poses.get(id) ?? null;

    for (let i = this.frames.length - 1; i > 0; i--) {
      const older = this.frames[i - 1];
      const newer = this.frames[i];
      if (older.time <= targetTime && targetTime <= newer.time) {
        const a = older.poses.get(id);
        const b = newer.poses.get(id);
        if (!a || !b) return b ?? a ?? null;
        const span = newer.time - older.time || 1;
        const t = (targetTime - older.time) / span;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      }
    }
    return newest.poses.get(id) ?? null;
  }

  clear(): void {
    this.frames.length = 0;
  }
}
