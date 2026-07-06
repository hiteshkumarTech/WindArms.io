import { OCCLUSION_BOXES, type ArenaBox } from '../../../shared/arena';
import type { Vec3 } from '../../../shared/protocol';

/** Player hitbox capsule (matches the client's physics capsule + skin). */
export const HITBOX = { HALF_HEIGHT: 0.6, RADIUS: 0.45 };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Ray vs axis-aligned box (slab test).
 * Returns the entry distance in [0, maxT], or null on miss.
 */
export function rayAabb(origin: Vec3, dir: Vec3, box: ArenaBox, maxT: number): number | null {
  let tMin = 0;
  let tMax = maxT;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis];
    const d = dir[axis];
    const half = box.size[axis] / 2;
    const min = box.position[axis] - half;
    const max = box.position[axis] + half;
    if (Math.abs(d) < 1e-9) {
      if (o < min || o > max) return null;
    } else {
      let t1 = (min - o) / d;
      let t2 = (max - o) / d;
      if (t1 > t2) {
        const swap = t1;
        t1 = t2;
        t2 = swap;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }
  return tMin;
}

/** Nearest static-geometry hit along the ray, or null when unobstructed. */
export function occlusionDistance(origin: Vec3, dir: Vec3, maxT: number): number | null {
  let nearest: number | null = null;
  for (const box of OCCLUSION_BOXES) {
    const t = rayAabb(origin, dir, box, maxT);
    if (t !== null && (nearest === null || t < nearest)) nearest = t;
  }
  return nearest;
}

/**
 * Ray vs vertical capsule centered at `center` (the player's body center).
 * Closest-approach between the ray segment and the capsule axis segment
 * (Ericson, Real-Time Collision Detection §5.1.9); a hit when the distance
 * falls inside the radius. Returns the ray distance, or null on miss.
 */
export function rayCapsule(origin: Vec3, dir: Vec3, maxT: number, center: Vec3): number | null {
  // Ray as segment p1→q1, capsule axis as segment p2→q2.
  const d1: Vec3 = [dir[0] * maxT, dir[1] * maxT, dir[2] * maxT];
  const p2: Vec3 = [center[0], center[1] - HITBOX.HALF_HEIGHT, center[2]];
  const d2: Vec3 = [0, HITBOX.HALF_HEIGHT * 2, 0];
  const r: Vec3 = [origin[0] - p2[0], origin[1] - p2[1], origin[2] - p2[2]];

  const a = d1[0] * d1[0] + d1[1] * d1[1] + d1[2] * d1[2];
  const e = d2[0] * d2[0] + d2[1] * d2[1] + d2[2] * d2[2];
  const f = d2[0] * r[0] + d2[1] * r[1] + d2[2] * r[2];
  const c = d1[0] * r[0] + d1[1] * r[1] + d1[2] * r[2];
  const b = d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2];
  const denom = a * e - b * b;

  let s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
  let t = e !== 0 ? (b * s + f) / e : 0;

  if (t < 0) {
    t = 0;
    s = clamp01(-c / a);
  } else if (t > 1) {
    t = 1;
    s = clamp01((b - c) / a);
  }

  const c1: Vec3 = [origin[0] + d1[0] * s, origin[1] + d1[1] * s, origin[2] + d1[2] * s];
  const c2: Vec3 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  const dx = c1[0] - c2[0];
  const dy = c1[1] - c2[1];
  const dz = c1[2] - c2[2];
  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq > HITBOX.RADIUS * HITBOX.RADIUS) return null;
  return s * maxT;
}

export function pointAlongRay(origin: Vec3, dir: Vec3, t: number): Vec3 {
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
}

export function normalize(v: Vec3): Vec3 | null {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < 1e-6 || !Number.isFinite(length)) return null;
  return [v[0] / length, v[1] / length, v[2] / length];
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
