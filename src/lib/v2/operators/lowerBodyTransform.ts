import * as THREE from 'three';
import { PLAYER } from '@/lib/game/constants';

/**
 * The published `firstPersonBodyPose` world position is the Rapier
 * kinematic RigidBody's `translation()` — for a `CapsuleCollider`, that is
 * the CAPSULE'S CENTER, a physics/gameplay reference point. The lower-body
 * GLB's own local origin is its FEET (bounds min y ≈ 0, per
 * `tools/inspect-operator.mjs --mode lowerbody`'s reported bounds). These
 * are two different, both-correct reference points that happen to
 * disagree by exactly the capsule's half-extent — NOT a calibration fudge
 * factor to be eyeballed, a derived coordinate-frame reconciliation:
 * `PLAYER.HALF_HEIGHT + PLAYER.RADIUS` = 0.6 + 0.4 = 1.0m is the vertical
 * distance from the capsule's center down to its bottom (where it rests on
 * the ground).
 *
 * STEP 8C.1 — the Step 8C visual gate FAILED: at 45-70deg the body read as
 * one large, isolated, rounded pelvis object with no readable thigh->knee
 * ->shin->boot chain. Real skeleton-bone measurement (Blender, rest pose)
 * plus real-browser diagnosis (a `showSkeletonLandmarks` bone-marker
 * overlay, `docs/decisions.md`) found the cause: at a near-vertical look
 * angle with zero forward offset, the camera looks almost straight DOWN
 * THE LENGTH of the leg — an axial/end-on view that can only ever show
 * small stacked cross-sections (a pelvis "bowl", knee-tops), never a
 * limb's side profile. A pure vertical push cannot fix this (it only
 * shrinks the same dominant near-object, confirmed by testing Y-only
 * candidates to -0.5m beyond the derived term — still just a smaller
 * dome). A LARGER forward push does fix it: shifting the body further
 * forward moves the natural standing-leg spread into an oblique viewing
 * angle at these same pitches, revealing the leg's actual side profile —
 * confirmed empirically at every tested pitch (45/60/70/max) via real
 * screenshots showing a genuine pelvis->thigh->knee(bent)->shin->boot
 * silhouette, not a blob.
 *
 * `CANONICAL_Y` = capsule-to-feet (derived, -1.0) PLUS a further empirical
 * downward nudge (-0.2) that, combined with the larger forward term
 * below, produced the cleanest silhouette across the whole tested pitch
 * range. `CANONICAL_Z` (-0.5, forward) is the dominant lever and is
 * entirely empirical — tested against -0.1/-0.15/-0.3/-0.4/-0.45 at
 * several Y pairings; -0.4 to -0.5 consistently produced the clearest
 * chain without the body visibly disconnecting from the player.
 *
 * GROUNDING: the extra -0.2m Y means the feet sit ~0.2m below the
 * capsule's literal ground-contact point. Verified in the browser (bright
 * neutral-material steep-down shots, `docs/decisions.md`) that this is
 * not visibly noticeable during normal play — RangeScene/V2PlayScene's
 * floor plane is not rendered as a hard edge directly at the player's own
 * feet from a first-person view at any tested pitch. Documented honestly
 * as a real, if small and not visually apparent, trade-off — not hidden.
 *
 * KNOWN LIMITATION (unchanged from Step 8C, see docs/decisions.md): this
 * asset's own eye-to-waist gap is still shorter than a real human's,
 * since `PLAYER.EYE_STAND` was tuned for gameplay feel, never for this
 * character's proportions — out of scope for this pass (collision
 * capsule / eye-height convention untouched).
 */
const CAPSULE_CENTER_TO_FEET = -(PLAYER.HALF_HEIGHT + PLAYER.RADIUS); // derived: -1.0
const SILHOUETTE_ADDITIONAL_Y = -0.2; // empirical, Step 8C.1
const SILHOUETTE_FORWARD_Z = -0.5; // empirical, Step 8C.1 (was -0.1 in Step 8C)
export const LOWERBODY_CANONICAL_LOCAL_OFFSET: readonly [number, number, number] = [
  0,
  CAPSULE_CENTER_TO_FEET + SILHOUETTE_ADDITIONAL_Y,
  SILHOUETTE_FORWARD_Z,
];

/**
 * Pure yaw-only world-transform math for `KaelFirstPersonLowerBody.tsx` —
 * extracted so it's independently testable without mounting the R3F
 * component (same "pull the pure math out of the render loop" pattern as
 * `kaelArmSolve.ts`). Takes the published body world pose plus the
 * calibration-panel's local offset/yaw-offset overrides and writes the
 * resulting world position/yaw into caller-supplied outputs — no
 * allocation when called from a hot per-frame path with preallocated
 * scratch objects.
 *
 * Deliberately has NO pitch input at all — there is nothing for camera
 * pitch to even flow through here, which is the actual guarantee this
 * function's tests lock in ("no camera-pitch influence" per the Step 8C
 * brief) rather than merely a convention someone could accidentally break.
 */

const UP_AXIS = new THREE.Vector3(0, 1, 0);

export interface LowerBodyTransformOutput {
  position: THREE.Vector3;
  /** Radians. */
  yaw: number;
}

/**
 * `offsetScratch` is a caller-owned, preallocated Vector3 used as working
 * space — its final value is not meaningful to the caller, only
 * `out.position`/`out.yaw` are.
 */
export function computeLowerBodyWorldTransform(
  worldPosition: THREE.Vector3,
  worldYaw: number,
  positionOffsetLocal: readonly [number, number, number],
  yawOffsetRad: number,
  offsetScratch: THREE.Vector3,
  out: LowerBodyTransformOutput,
): void {
  const effectiveYaw = worldYaw + yawOffsetRad;
  const [offX, offY, offZ] = positionOffsetLocal;
  offsetScratch.set(offX, offY, offZ).applyAxisAngle(UP_AXIS, effectiveYaw);
  out.position.copy(worldPosition).add(offsetScratch);
  out.yaw = effectiveYaw;
}
