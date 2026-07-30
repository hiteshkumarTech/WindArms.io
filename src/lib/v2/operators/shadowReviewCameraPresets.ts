import * as THREE from 'three';

/**
 * Pure camera-transform math for the Step 8E-C.3 shadow review harness — no
 * scene/React dependency, testable without a mounted canvas. Every preset
 * computes a world position + look-at target from the player's own world
 * position/yaw (read from `firstPersonBodyPose.ts`, the same source the
 * shadow body itself is positioned from — never a second, independently
 * tracked player position).
 *
 * WHY THIS EXISTS: Step 8E-C.2's own validation found that the first-person
 * camera cannot see its own body or the shadow it casts — it's co-located
 * with the character's own head, and the range light's ~57° elevation puts
 * the shadow only ~1.2m from the feet, so any FP framing that would show it
 * is dominated by the character's own near-field geometry. This module
 * computes EXTERNAL, third-person-style vantage points instead, used only
 * by the dev-only `KaelShadowReviewCamera.tsx` (`/v2/range?shadow=1&shadowReview=1`).
 */

export type ShadowReviewCameraPreset =
  | 'threeQuarterFront'
  | 'threeQuarterRear'
  | 'leftSide'
  | 'rightSide'
  | 'highOblique'
  | 'lightFacing'
  | 'receiverWide'
  | 'bodyCloseThreeQuarter'
  | 'bodyCloseSide'
  | 'handsCloseRight'
  | 'handsCloseLeft'
  | 'shadowClose'
  | 'shadowWide';

export const SHADOW_REVIEW_CAMERA_PRESETS: readonly ShadowReviewCameraPreset[] = [
  'threeQuarterFront',
  'threeQuarterRear',
  'leftSide',
  'rightSide',
  'highOblique',
  'lightFacing',
  'receiverWide',
  'bodyCloseThreeQuarter',
  'bodyCloseSide',
  'handsCloseRight',
  'handsCloseLeft',
  'shadowClose',
  'shadowWide',
];

const UP = new THREE.Vector3(0, 1, 0);
/** Approximate mid-torso height above the physical body root (feet/ground level, NOT the Rapier capsule center — see `KaelShadowReviewCamera.tsx`'s own doc comment for that reconciliation) — the look-at target, chosen closer to the body's vertical CENTER than pure chest height so a wide-FOV frame at a comfortable distance captures head-to-boots with margin on both ends, not just the upper body. */
const CHEST_HEIGHT = 1.0;

/**
 * `RangeScene.tsx`'s directional light — `position={[12, 22, 8]}`, no
 * `target` prop, so THREE defaults the target to world origin. A
 * directional light's rays are parallel everywhere in the scene, so the
 * FALL direction (light position -> target, projected onto the ground
 * plane) is a single constant vector regardless of where the character
 * stands — this is NOT re-derived from the character's own position.
 * Kept as a literal here (not imported from `RangeScene.tsx`, which has no
 * exported constant for it) with this comment as the explicit link — if
 * that light's position or target ever changes, this constant must be
 * updated to match, or `lightFacing`'s framing will silently drift from
 * the real shadow direction.
 */
const LIGHT_POSITION = new THREE.Vector3(12, 22, 8);
const SHADOW_FALL_DIR_XZ = new THREE.Vector3(-LIGHT_POSITION.x, 0, -LIGHT_POSITION.z).normalize();

interface PresetSpec {
  /** Degrees offset from the player's own forward direction, positive = toward the player's right. Ignored for the light-axis presets (world-fixed direction instead — see `LIGHT_AXIS_PRESET_SPECS`). */
  yawOffsetDeg: number;
  radius: number;
  cameraHeight: number;
  lookAtHeight: number;
}

type LightAxisPreset = 'lightFacing' | 'shadowClose' | 'shadowWide';

const PRESET_SPECS: Record<Exclude<ShadowReviewCameraPreset, LightAxisPreset>, PresetSpec> = {
  threeQuarterFront: { yawOffsetDeg: 40, radius: 3.8, cameraHeight: 1.5, lookAtHeight: CHEST_HEIGHT },
  threeQuarterRear: { yawOffsetDeg: 140, radius: 3.8, cameraHeight: 1.5, lookAtHeight: CHEST_HEIGHT },
  leftSide: { yawOffsetDeg: -90, radius: 3.5, cameraHeight: 1.4, lookAtHeight: CHEST_HEIGHT },
  rightSide: { yawOffsetDeg: 90, radius: 3.5, cameraHeight: 1.4, lookAtHeight: CHEST_HEIGHT },
  highOblique: { yawOffsetDeg: 30, radius: 3.2, cameraHeight: 3.2, lookAtHeight: 0.9 },
  receiverWide: { yawOffsetDeg: 0, radius: 5.5, cameraHeight: 3.6, lookAtHeight: 0.7 },
  // Step 8E-C.3.1: close/medium review presets — the human reviewer of the
  // 8E-C.3 artifact could not judge the character/weapon/shadow as
  // "clearly readable" from the original 7 presets' framing (character
  // reads at roughly 30-35% of frame height at radius 3.2-3.8). These sit
  // at a noticeably tighter radius so the character reliably fills
  // 40-60% of the diagnostic image height, per the brief's own framing
  // requirement.
  bodyCloseThreeQuarter: { yawOffsetDeg: 40, radius: 2.1, cameraHeight: 1.35, lookAtHeight: CHEST_HEIGHT },
  bodyCloseSide: { yawOffsetDeg: -90, radius: 2.0, cameraHeight: 1.3, lookAtHeight: CHEST_HEIGHT },
  // Hands-close presets target grip height (~1.3m, where the weapon sits
  // between the hands), not mid-torso — the point is to isolate the
  // weapon-in-hands readability, not the whole body. Approached from a
  // shallow angle on the named side (mirrored yaw offsets) rather than a
  // full profile, so both hands stay visible instead of one occluding
  // the other.
  handsCloseRight: { yawOffsetDeg: 55, radius: 1.15, cameraHeight: 1.35, lookAtHeight: 1.3 },
  handsCloseLeft: { yawOffsetDeg: -55, radius: 1.15, cameraHeight: 1.35, lookAtHeight: 1.3 },
};

/**
 * `lightFacing`/`shadowClose`/`shadowWide` all share the same world-fixed,
 * shadow-fall-axis framing (camera on the light's side, looking along the
 * fall direction) — only the distance/height/look-at-target differ. Kept as
 * a separate table (not merged into `PRESET_SPECS`) because these three
 * ignore the player's own yaw entirely, unlike every other preset.
 */
const LIGHT_AXIS_PRESET_SPECS: Record<LightAxisPreset, { radius: number; cameraHeight: number; lookAtForwardOffset: number; lookAtHeight: number }> = {
  lightFacing: { radius: 4.0, cameraHeight: 2.0, lookAtForwardOffset: 1.2, lookAtHeight: 0.5 },
  // Close enough that the projected shadow (~1.24m long at this light's
  // ~57° elevation — see the elevation-angle note below) dominates the
  // lower half of the frame while the character's full standing height
  // still fits above it, satisfying the brief's "read head/neck/torso/
  // shoulders/arms/rifle/pelvis/legs/boots as one complete silhouette"
  // requirement for the marker-free matrix.
  shadowClose: { radius: 2.6, cameraHeight: 2.4, lookAtForwardOffset: 0.6, lookAtHeight: 0.1 },
  // Wider companion to `shadowClose` — still noticeably tighter than
  // `receiverWide` (radius 5.5) — for states where the shadow itself
  // extends further than standing-idle (e.g. sprint lean, jump apex)
  // and would otherwise clip out of `shadowClose`'s frame.
  shadowWide: { radius: 4.6, cameraHeight: 3.0, lookAtForwardOffset: 0.9, lookAtHeight: 0.3 },
};

export interface ShadowReviewCameraTransform {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

/**
 * Computes the world position + look-at target for `preset`, given the
 * player's current world position (physical body root — same convention
 * `shadowBodyTransform.ts` uses, feet-level) and yaw (radians). Writes into
 * `out` if supplied (zero allocation on the per-frame hot path), else
 * allocates a fresh result.
 */
export function computeShadowReviewCameraTransform(
  preset: ShadowReviewCameraPreset,
  playerPosition: THREE.Vector3,
  playerYawRad: number,
  out?: ShadowReviewCameraTransform,
): ShadowReviewCameraTransform {
  const result = out ?? { position: new THREE.Vector3(), lookAt: new THREE.Vector3() };

  if (preset === 'lightFacing' || preset === 'shadowClose' || preset === 'shadowWide') {
    // Positioned on the LIGHT's side (opposite the shadow), looking along
    // the shadow-fall direction so both the character and their cast
    // shadow read together in one frame.
    const axisSpec = LIGHT_AXIS_PRESET_SPECS[preset];
    result.position.set(
      playerPosition.x - SHADOW_FALL_DIR_XZ.x * axisSpec.radius,
      playerPosition.y + axisSpec.cameraHeight,
      playerPosition.z - SHADOW_FALL_DIR_XZ.z * axisSpec.radius,
    );
    result.lookAt.set(
      playerPosition.x + SHADOW_FALL_DIR_XZ.x * axisSpec.lookAtForwardOffset,
      playerPosition.y + axisSpec.lookAtHeight,
      playerPosition.z + SHADOW_FALL_DIR_XZ.z * axisSpec.lookAtForwardOffset,
    );
    return result;
  }

  const spec = PRESET_SPECS[preset];
  const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, playerYawRad + THREE.MathUtils.degToRad(spec.yawOffsetDeg));
  result.position.set(playerPosition.x + dir.x * spec.radius, playerPosition.y + spec.cameraHeight, playerPosition.z + dir.z * spec.radius);
  result.lookAt.set(playerPosition.x, playerPosition.y + spec.lookAtHeight, playerPosition.z);
  return result;
}
