import type { ArenaBox, DroneSpawnDef } from './types';

/**
 * Skyfront Trial spawn + arena collision data (Milestone 6). SINGLE SOURCE
 * OF TRUTH, mirrors v1's shared/arena.ts pattern: SkyfrontTrialArena builds
 * its visuals AND Rapier colliders from these boxes, drone line-of-sight
 * tests occlude against OCCLUDERS, and drone bolts collide against SOLIDS —
 * so what you see, what blocks movement, what blocks sight and what stops
 * projectiles can never disagree.
 */

/** Deterministic player spawn — south edge of the main deck, facing the arena (-Z). */
export const PLAYER_SPAWN: [number, number, number] = [0, 1.6, 13];

/** Main deck — top surface at y = 0. */
export const MAIN_DECK: ArenaBox = { center: [0, -0.9, 0], size: [34, 1.8, 34] };

/** Elevated side platforms (tops at y = 3.4). Left one is served by the Wind Lift, right one by stairs. */
export const SIDE_PLATFORMS: ArenaBox[] = [
  { center: [-12.5, 2.7, -6], size: [9, 1.4, 12] },
  { center: [12.5, 2.7, -6], size: [9, 1.4, 12] },
];

/** Right-side stair blocks up to the right platform — the non-lift vertical route. */
export const STAIRS: ArenaBox[] = [
  { center: [10.5, 0.42, 2.6], size: [4.2, 0.84, 2.2] },
  { center: [11.2, 1.26, 1.0], size: [3.4, 2.52, 2.0] },
  { center: [11.9, 2.1, -0.6], size: [2.8, 4.2, 2.0] },
];

/**
 * Cover blocks on the main deck. Left half is the TIGHT lane (dense cover),
 * the corridor along x ≈ +6…+9 is the OPEN low-risk lane (no cover, longer
 * sightlines, watched from the right platform).
 */
export const COVERS: ArenaBox[] = [
  { center: [-5.5, 0.9, 4.5], size: [2.6, 1.8, 1.4] },
  { center: [-7.5, 1.1, -0.5], size: [1.6, 2.2, 3.2] },
  { center: [-3.5, 0.8, -4.5], size: [3.0, 1.6, 1.4] },
  { center: [-6.0, 1.0, -8.5], size: [1.5, 2.0, 2.6] },
  { center: [0.5, 1.05, -1.5], size: [2.2, 2.1, 2.2] }, // central monolith
  { center: [2.8, 0.75, -9.0], size: [2.4, 1.5, 1.4] },
  { center: [4.5, 0.9, 6.0], size: [1.4, 1.8, 2.8] },
];

/** Everything a drone BOLT stops against (player is tested separately). */
export const SOLIDS: ArenaBox[] = [MAIN_DECK, ...SIDE_PLATFORMS, ...STAIRS, ...COVERS];

/** Everything that blocks drone line-of-sight (same set — sight and bullets agree). */
export const OCCLUDERS: ArenaBox[] = SOLIDS;

/** Invisible boundary walls — prevent endless falls without caging the skyline visually. */
export const BOUNDARY_WALLS: ArenaBox[] = [
  { center: [0, 4, 18.2], size: [38, 12, 0.8] },
  { center: [0, 4, -18.2], size: [38, 12, 0.8] },
  { center: [18.2, 4, 0], size: [0.8, 12, 38] },
  { center: [-18.2, 4, 0], size: [0.8, 12, 38] },
];

/** Eight hostile wind drones — three over the deck, two per flank platform, one high sentinel. */
export const DRONE_SPAWNS: DroneSpawnDef[] = [
  { id: 'deck-a', position: [-4, 3.2, -10], patrolRadius: 3.5 },
  { id: 'deck-b', position: [5, 2.8, -6], patrolRadius: 3.0 },
  { id: 'deck-c', position: [0, 3.6, 2], patrolRadius: 4.0 },
  { id: 'left-lo', position: [-12, 5.4, -2], patrolRadius: 2.5 },
  { id: 'left-hi', position: [-13, 6.2, -10], patrolRadius: 2.5 },
  { id: 'right-lo', position: [12, 5.4, -2], patrolRadius: 2.5 },
  { id: 'right-hi', position: [13, 6.2, -10], patrolRadius: 2.5 },
  { id: 'sentinel', position: [0, 7.5, -13], patrolRadius: 5.0 },
];

// ── Pure collision helpers (used by drone LOS + bolt stepping) ─────────

/** Point-in-box test with optional padding. */
export function pointInBox(p: [number, number, number], box: ArenaBox, pad = 0): boolean {
  return (
    Math.abs(p[0] - box.center[0]) <= box.size[0] / 2 + pad &&
    Math.abs(p[1] - box.center[1]) <= box.size[1] / 2 + pad &&
    Math.abs(p[2] - box.center[2]) <= box.size[2] / 2 + pad
  );
}

/** Segment–AABB intersection (slab method). Returns true if the segment a→b crosses the box. */
export function segmentHitsBox(a: [number, number, number], b: [number, number, number], box: ArenaBox): boolean {
  let tMin = 0;
  let tMax = 1;
  for (let axis = 0; axis < 3; axis++) {
    const dir = b[axis] - a[axis];
    const lo = box.center[axis] - box.size[axis] / 2;
    const hi = box.center[axis] + box.size[axis] / 2;
    if (Math.abs(dir) < 1e-8) {
      if (a[axis] < lo || a[axis] > hi) return false;
    } else {
      let t1 = (lo - a[axis]) / dir;
      let t2 = (hi - a[axis]) / dir;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }
  }
  return true;
}

/** True if any occluder blocks the segment a→b (drone LOS check). */
export function segmentOccluded(a: [number, number, number], b: [number, number, number]): boolean {
  for (const box of OCCLUDERS) if (segmentHitsBox(a, b, box)) return true;
  return false;
}
