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

/**
 * Purely cosmetic vertical struts hung under boxes that float well above
 * `groundY` (elevated platforms/ramps) so they read as supported structure
 * instead of levitating. Client-only decoration — like ramps and crates,
 * never appended to a MapDef's own arrays and never fed into
 * `occlusionBoxesFor`, so it can't affect server hit-scan or bounds.
 */
export function supportBeamsFor(boxes: readonly ArenaBox[], groundY: number): ArenaBox[] {
  const MIN_HEIGHT = 1.4;
  const BEAM_SIZE = 0.22;
  const beams: ArenaBox[] = [];
  for (const box of boxes) {
    const bottom = box.position[1] - box.size[1] / 2;
    const height = bottom - groundY;
    if (height < MIN_HEIGHT) continue;
    const centerY = groundY + height / 2;
    beams.push({ position: [box.position[0], centerY, box.position[2]], size: [BEAM_SIZE, height, BEAM_SIZE] });
    // Larger platforms get a second strut so they don't look single-stilted.
    if (Math.max(box.size[0], box.size[2]) > 5) {
      const offset = Math.min(box.size[0], box.size[2]) * 0.3;
      beams.push({
        position: [box.position[0] + offset, centerY, box.position[2] + offset],
        size: [BEAM_SIZE, height, BEAM_SIZE],
      });
    }
  }
  return beams;
}
