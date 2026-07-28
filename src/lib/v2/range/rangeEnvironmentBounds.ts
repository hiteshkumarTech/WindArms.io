/**
 * `/v2/range`'s floor extent + the directional light's shadow-camera bounds
 * sized to cover it (Milestone 8, Step 8E-B). Single source of truth for
 * both `RangeEnvironment.tsx` (which builds the real floor geometry/collider
 * from `RANGE_FLOOR_SIZE`/`RANGE_FLOOR_CENTER`) and `RangeScene.tsx` (whose
 * `directionalLight`'s `shadow-camera-*` JSX props read
 * `RANGE_SHADOW_CAMERA_BOUNDS` directly) — kept in one place specifically so
 * the shadow frustum can never silently drift out of sync with the floor it
 * needs to cover (see `rangeEnvironmentBounds.test.ts`'s coverage check).
 *
 * BUG THIS FIXES (Step 8E-A's audit found it, Step 8E-B fixes it): the
 * `directionalLight` previously had no explicit `shadow-camera-*` props at
 * all, falling back to THREE's `DirectionalLight` default orthographic
 * shadow frustum — `left/right/top/bottom = ∓5`, centered on world origin
 * (the light has no `target` prop, so THREE's implicit target sits at
 * (0,0,0)). The range's own spawn point (`RangeController.tsx`,
 * `RANGE_SPAWN = [0, 3, 10]`) already sits outside a ±5 box — the FP arms'
 * already-on `castShadow` was very likely casting into empty space, never
 * reaching the player, for the entire time that shadow existed.
 */

/** `[width(x), height(y), depth(z)]`, matching `RangeEnvironment.tsx`'s floor `boxGeometry`. */
export const RANGE_FLOOR_SIZE: readonly [number, number, number] = [36, 0.1, 80];
/** World-space center of the floor box, matching `RangeEnvironment.tsx`'s floor `<mesh position>`. */
export const RANGE_FLOOR_CENTER: readonly [number, number, number] = [0, -0.05, -20];

/**
 * Shadow-camera orthographic frustum for `/v2/range`'s `directionalLight`.
 * NOT copied from `/v2/play`'s own `±30` bounds — that value was sized for
 * a different, smaller, origin-centered 34×34 arena and would still clip
 * most of this floor (verified: the floor spans z:[-60,20], well past ±30).
 * `±65`/`near=1`/`far=100` was computed from `RANGE_FLOOR_SIZE`/
 * `RANGE_FLOOR_CENTER` above (see `rangeEnvironmentBounds.test.ts`) and
 * confirmed by a real-browser screenshot showing the shadow reaching the
 * player at spawn, not assumed from the math alone.
 */
export const RANGE_SHADOW_CAMERA_BOUNDS = {
  left: -65,
  right: 65,
  top: 65,
  bottom: -65,
  near: 1,
  far: 100,
} as const;

/**
 * Conservative, deliberately simple coverage check — NOT a full replication
 * of `DirectionalLight`'s actual angled view-projection math (the light at
 * `[12,22,8]` isn't looking straight down, so its orthographic frustum's
 * left/right/top/bottom don't map 1:1 onto world X/Z). Instead: since the
 * light's implicit target is world origin, every floor corner's distance
 * FROM ORIGIN (in each of X and Z independently) must be no larger than the
 * frustum's own half-extent — a safe, if not perfectly tight, sufficient
 * condition. Good enough to catch the actual regression this exists to
 * prevent (someone resizing the floor without touching the light), not a
 * claim of pixel-perfect shadow-map utilization.
 */
export function boundsCoverFloor(
  bounds: { left: number; right: number; top: number; bottom: number },
  floorSize: readonly [number, number, number],
  floorCenter: readonly [number, number, number],
): boolean {
  const halfX = floorSize[0] / 2;
  const halfZ = floorSize[2] / 2;
  const maxAbsX = Math.max(Math.abs(floorCenter[0] - halfX), Math.abs(floorCenter[0] + halfX));
  const maxAbsZ = Math.max(Math.abs(floorCenter[2] - halfZ), Math.abs(floorCenter[2] + halfZ));
  const frustumHalfExtent = Math.min(bounds.right - bounds.left, bounds.top - bounds.bottom) / 2;
  return frustumHalfExtent >= maxAbsX && frustumHalfExtent >= maxAbsZ;
}
