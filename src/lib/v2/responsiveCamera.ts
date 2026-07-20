/**
 * Single source of truth for how StormBackdrop's camera responds to
 * viewport aspect ratio. Previously this formula lived only inline in
 * ResponsiveFov (StormBackdrop.tsx) — pulled out here (Phase A.1, arsenal
 * responsive pass) because ArsenalShowpiece now needs the *same* numbers to
 * compensate the Vortex Rifle's apparent size, and duplicating 55/88/16:9
 * across two files is exactly the "scattered magic numbers" this pass was
 * asked to avoid.
 */

/** Reference aspect the whole CAMERA_PATH (StormBackdrop.tsx) was composed and screenshot-tuned against. */
export const BASE_ASPECT = 16 / 9;
export const BASE_FOV_DEG = 55;
/** Hard ceiling — beyond this, further widening reads as fisheye distortion rather than "more visible." */
export const MAX_FOV_DEG = 88;

/**
 * Vertical FOV for a given viewport aspect ratio. Identical to the formula
 * ResponsiveFov has used since the 2026-07-16 cinematic composition pass:
 * held constant at/above 16:9, widened below it to keep the same
 * world-space framing from cropping on tablet/mobile aspect ratios.
 */
export function responsiveFovDeg(aspect: number): number {
  return aspect < BASE_ASPECT ? Math.min(MAX_FOV_DEG, BASE_FOV_DEG * (BASE_ASPECT / aspect)) : BASE_FOV_DEG;
}

/**
 * Scale multiplier that cancels the apparent-size shrink a staged object
 * suffers when ResponsiveFov widens the camera's vertical FOV. For a fixed
 * world size at a fixed distance, on-screen (vertical) pixel size is
 * proportional to 1/tan(fov/2) — so an object tuned to look right at the
 * base 55° FOV reads roughly half-size at mobile's 88° ceiling unless
 * compensated by tan(currentFov/2)/tan(baseFov/2). Only correct for an
 * object sitting on (or very near) the camera's look-ray — ArsenalShowpiece
 * is deliberately positioned there for exactly this reason; it is NOT a
 * general fix for off-axis objects (see AeolusShowpiece's own separate,
 * empirical baseX position compensation for that case).
 */
export function fovPresenceScale(aspect: number): number {
  const currentFovRad = (responsiveFovDeg(aspect) * Math.PI) / 180;
  const baseFovRad = (BASE_FOV_DEG * Math.PI) / 180;
  return Math.tan(currentFovRad / 2) / Math.tan(baseFovRad / 2);
}
