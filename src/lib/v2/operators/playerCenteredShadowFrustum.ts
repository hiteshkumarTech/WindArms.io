/**
 * Step 8E-D.1 — pure, dependency-free texel-snapping math for the
 * player-centered shadow frustum. No React, no browser, no three.js: this
 * module only knows about plain numbers, so it's testable without a
 * mounted canvas and has zero risk of accidentally depending on mutable
 * scene state. The actual world-space ↔ light-space projection (which DOES
 * need real vector/matrix math) lives in the imperative controller
 * (`KaelPlayerCenteredShadowController.tsx`), which calls this module with
 * already-projected light-space numbers.
 *
 * CANONICAL CONFIGURATION — from the Step 8E-D.1A measurement pass
 * (`docs/decisions.md`'s Step 8E-D.1A entry): real deformed-mesh sampling
 * across 13 action states found a worst-case light-space footprint of
 * 0.759m width (sprint) / 1.356m height (inspect_hold) / 3.755m combined
 * depth span (landing, driven by the receiver's fixed height vs. the
 * player's airborne Y during a jump/fall/landing arc — not the body's own
 * pose). The chosen rectangle (3.5m × 6m) carries ~1.0m/~1.9m of margin
 * over those worst cases at 60fps after accounting for one frame of
 * dash-speed movement (18 m/s) and a 15% buffer for untested pose
 * combinations — see the decision log for the full candidate comparison
 * (8×8/10×10/12×12 squares were all safe but wasted 3-5m of margin per
 * side; this rectangle is the tightest measured-safe candidate).
 */

export interface ShadowFrustumConfig {
  /** Full frustum width in world units (light-space X extent, left+right combined). */
  width: number;
  /** Full frustum height in world units (light-space Y extent, top+bottom combined). */
  height: number;
  /** Shadow-map horizontal resolution in texels. */
  mapWidth: number;
  /** Shadow-map vertical resolution in texels. */
  mapHeight: number;
  /** Orthographic near plane distance. */
  near: number;
  /** Orthographic far plane distance. */
  far: number;
}

/** The Step 8E-D.1A-measured, decision-logged canonical candidate — see this file's own doc comment for the numbers that produced it. */
export const PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG: ShadowFrustumConfig = {
  width: 3.5,
  height: 6.0,
  mapWidth: 1024,
  mapHeight: 1024,
  near: 20,
  far: 27,
};

/** The pre-existing, UNCHANGED static full-floor configuration (`rangeEnvironmentBounds.ts`'s `RANGE_SHADOW_CAMERA_BOUNDS`, restated here as a `ShadowFrustumConfig` only so both modes share one shape) — restored exactly whenever player-centered mode is off. */
export const STATIC_FULL_FLOOR_SHADOW_FRUSTUM_CONFIG: ShadowFrustumConfig = {
  width: 130,
  height: 130,
  mapWidth: 1024,
  mapHeight: 1024,
  near: 1,
  far: 100,
};

export interface ShadowFrustumTrackingInput {
  /** The tracked ground anchor's position along the light-space X axis (world units), in a FIXED, non-moving light-oriented reference frame — never the live/moving shadow camera's own basis, or the grid itself would move with the thing it's meant to stabilize. */
  anchorLightSpaceX: number;
  anchorLightSpaceY: number;
  config: ShadowFrustumConfig;
}

export interface ShadowFrustumTrackingOutput {
  snappedLightSpaceX: number;
  snappedLightSpaceY: number;
  texelSizeX: number;
  texelSizeY: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

export function computeTexelSizeX(config: ShadowFrustumConfig): number {
  return config.width / config.mapWidth;
}

export function computeTexelSizeY(config: ShadowFrustumConfig): number {
  return config.height / config.mapHeight;
}

function makeDefaultOutput(): ShadowFrustumTrackingOutput {
  return {
    snappedLightSpaceX: 0,
    snappedLightSpaceY: 0,
    texelSizeX: 0,
    texelSizeY: 0,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    near: 0,
    far: 0,
  };
}

/**
 * Snaps a light-space anchor position to the shadow map's own texel grid,
 * independently per axis (X and Y have DIFFERENT texel sizes for a
 * rectangular frustum — `3.5/1024 ≠ 6.0/1024` — conflating them into one
 * shared scalar would either over- or under-snap one axis).
 *
 * Deterministic and frame-rate independent: takes the CURRENT absolute
 * anchor position and returns the CURRENT absolute snapped position —
 * never a delta, never reads or accumulates any previous call's output.
 * Calling this once with a given input always produces the same output;
 * calling it every frame with the player's current position is exactly as
 * correct as calling it once, since there is no hidden state.
 *
 * Fail-soft: non-finite input (NaN/±Infinity) falls back to a snapped
 * position of (0, 0) rather than propagating NaN into the light's world
 * position — matches this project's established fail-soft convention
 * (e.g. `solveShadowArmSide`'s own non-finite-target guard).
 */
export function snapToTexelGrid(input: ShadowFrustumTrackingInput, out: ShadowFrustumTrackingOutput = makeDefaultOutput()): ShadowFrustumTrackingOutput {
  const { config } = input;
  const texelSizeX = computeTexelSizeX(config);
  const texelSizeY = computeTexelSizeY(config);

  const safeX = Number.isFinite(input.anchorLightSpaceX) ? input.anchorLightSpaceX : 0;
  const safeY = Number.isFinite(input.anchorLightSpaceY) ? input.anchorLightSpaceY : 0;

  out.texelSizeX = texelSizeX;
  out.texelSizeY = texelSizeY;
  out.snappedLightSpaceX = texelSizeX > 0 ? Math.round(safeX / texelSizeX) * texelSizeX : 0;
  out.snappedLightSpaceY = texelSizeY > 0 ? Math.round(safeY / texelSizeY) * texelSizeY : 0;

  out.left = -config.width / 2;
  out.right = config.width / 2;
  out.top = config.height / 2;
  out.bottom = -config.height / 2;
  out.near = config.near;
  out.far = config.far;

  return out;
}
