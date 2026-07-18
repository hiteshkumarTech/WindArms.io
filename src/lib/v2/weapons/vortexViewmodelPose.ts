/**
 * Typed first-person pose config for the Vortex Rifle — the single place
 * base viewmodel transforms live, instead of scattered across components.
 * Shared by both `/v2/range` and `/v2/play` (both mount the same
 * `VortexViewmodel`), so a pose fix here fixes both automatically.
 *
 * Recoil, sway, bob, reload dip and inspect wobble stay ADDITIVE on top of
 * whichever pose is active (see `VortexViewmodel.tsx`) — they are not part
 * of this config, which only defines the base rest poses.
 */
export interface ViewmodelPose {
  /** View-space offset, meters (+x right, +y up, -z forward), applied via translateX/Y/Z right after the group's quaternion is reset to the camera's — i.e. BEFORE `rotation` below, so it stays intuitive camera-relative authoring regardless of how the model itself is rotated in place. */
  position: [number, number, number];
  /** Euler XYZ, radians, applied in this order (X, then Y, then Z) via rotateX/Y/Z AFTER `position` — spins the model in place around its now-fixed origin, same convention this file already used for the dynamic recoil-punch/inspect-tilt rotations. */
  rotation: [number, number, number];
  /** Applied only to the loaded real model (via `PipelineModel`'s `scale` prop) — same convention as before, unrelated to `ProceduralAeolus`'s own separate `FALLBACK_SCALE`. */
  scale: number;
}

export interface VortexViewmodelPoses {
  hip: ViewmodelPose;
  ads: ViewmodelPose;
}

/**
 * The GLB's local muzzle axis is +X, top is +Y (confirmed twice in
 * docs/forge/vortex-rifle-v0.2.md — the runtime derivative's baked
 * orientation, not a guess). The viewmodel group's local -Z is
 * camera-forward once its quaternion is reset to the camera's each frame
 * (standard three.js/this-project convention — see RangeController/
 * PlayerController, both build look direction the same way). Rotating
 * +90° around Y maps local (1,0,0) → local (0,0,-1): verified empirically
 * against the running scene (not derived-and-assumed), see docs/decisions.md
 * "Vortex Rifle FP pose correction" for the screenshot-checked sign.
 */
const MODEL_FORWARD_CORRECTION_Y = Math.PI / 2;

/**
 * Hip and ADS base poses. Position tuned so the stock sits closer to the
 * camera and the muzzle farther (i.e. a small -z bias beyond the base
 * standoff distance, matching how the corrected +X→-Z rotation now lays
 * the model out along view-space -Z), the barrel reads aligned toward the
 * crosshair (small residual tilt only, not the previous unrotated-sideways
 * pose), and ADS pulls the weapon toward center-screen without a scale
 * jump (same `scale` in both poses — ADS is a pure position/rotation
 * move, matching most FPS conventions and avoiding a "zoom" artifact on
 * a viewmodel that has no real sight glass to look through).
 *
 * HONEST LIMITATION: this is a corrected FLOATING first-person viewmodel,
 * not a held one. There is no operator-arms model in this milestone, so
 * there is no real hand/grip contact, wrist rotation, or shoulder
 * support — the rifle is positioned and oriented to read correctly from
 * the camera's perspective, not physically gripped. True holding requires
 * the future first-person arms rig + hand IK (tracked in docs/todo.md).
 */
export const VORTEX_VIEWMODEL_POSES: VortexViewmodelPoses = {
  hip: {
    position: [0.22, -0.2, -0.55],
    rotation: [0.05, MODEL_FORWARD_CORRECTION_Y - 0.09, 0.02],
    scale: 0.42,
  },
  ads: {
    position: [0.0, -0.135, -0.34],
    rotation: [0.0, MODEL_FORWARD_CORRECTION_Y, 0.0],
    scale: 0.42,
  },
};
