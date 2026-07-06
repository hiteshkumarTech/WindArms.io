import type { Vec3 } from './protocol';

/**
 * Arena geometry primitives shared by both sides: the client builds meshes
 * and physics colliders from them, the server raycasts against them for
 * shot occlusion. Map layouts composed from these live in `shared/maps.ts`.
 */

export interface ArenaBox {
  position: Vec3;
  size: Vec3;
}

export interface ArenaRamp extends ArenaBox {
  /** Euler XYZ, radians. Client-only physics; excluded from server occlusion. */
  rotation: Vec3;
}

/** Builds a staircase marching toward -Z from `origin` (ground level). */
export function makeStairs(
  origin: Vec3,
  steps: number,
  stepHeight = 0.3,
  stepDepth = 0.6,
  width = 3,
): ArenaBox[] {
  return Array.from({ length: steps }, (_, step) => ({
    position: [
      origin[0],
      origin[1] + stepHeight / 2 + step * stepHeight,
      origin[2] - step * stepDepth,
    ] as Vec3,
    size: [width, stepHeight, stepDepth] as Vec3,
  }));
}
