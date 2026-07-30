import * as THREE from 'three';

/**
 * Aim-pitch extraction for the shadow upper-body aim frame (Milestone 8,
 * Step 8E-C.1). Pure, no scene-graph dependency beyond the quaternions
 * passed in — testable without a mounted skeleton.
 *
 * WHY THIS EXISTS: the shadow body's container tracks player world YAW
 * only (never pitch — the physical body/pelvis must not pitch, see
 * `shadowBodyTransform.ts`/Step 8E-B), while the weapon (and therefore the
 * hand grip targets) is fully camera-attached and swings through its own
 * pitch arc. Reading the ALREADY-COMPOSED `weaponWorldQuaternion`
 * (`gripWorldPose.ts`) rather than a second independent camera-pitch read
 * avoids a duplicate source of truth — the weapon's own world orientation
 * already encodes whatever pitch (and yaw, and roll from sway/recoil) the
 * camera currently has.
 *
 * SIGN CONVENTION: `extractAimPitchFromWeaponQuaternion` returns a POSITIVE
 * value when the player is looking DOWN, zero when looking level (relative
 * to the shadow container's own yaw-aligned horizontal plane), and negative
 * when looking up — matching the "pitchDeg" convention used throughout this
 * step's own calibration scripts and decisions.md entries (0°=level,
 * 70°=steeply down).
 */

const WEAPON_FORWARD_LOCAL = new THREE.Vector3(0, 0, -1);

/** Reusable scratch to avoid per-call allocation on the hot path — mirrors this codebase's established per-frame-scratch convention (`kaelArmSolve.ts`, `lowerBodyRig.ts`). */
export function createAimPitchScratch() {
  return {
    forwardWorld: new THREE.Vector3(),
    containerQuatInverse: new THREE.Quaternion(),
    forwardLocal: new THREE.Vector3(),
  };
}

/**
 * Extracts the weapon's pitch relative to the shadow container's own
 * (yaw-only) horizontal plane. Clamped to ±85° to stay well clear of the
 * ±90° singularity where `asin` loses precision and a small orientation
 * perturbation could otherwise produce a large, noisy pitch jump. Never
 * produces NaN/Infinity for a finite, non-degenerate input quaternion pair.
 *
 * STEP 8E-C.2 — DO NOT call this against `gripWorldPose.ts`'s
 * `weaponWorldQuaternion` for the shadow's chest-aim source. This function's
 * OWN math is correct (verified: on a raw camera quaternion with no
 * additional composition, it round-trips a 30°/60°/85°-clamped input
 * exactly) — the problem is what `weaponWorldQuaternion` actually IS.
 * `VortexViewmodel.tsx` sets `group.quaternion.copy(camera.quaternion)` and
 * THEN composes the weapon's own presentation-pose rotation on top
 * (`group.rotateX/Y/Z(...)`, including a ~90° `MODEL_FORWARD_CORRECTION_Y`
 * term correcting the raw GLB's own forward axis). That compound rotation
 * does NOT track camera pitch linearly — a real, verified measurement
 * (`.scratch/verify-aimpitch-math.mjs`, Step 8E-C.2) found extracting pitch
 * from the FULLY COMPOSED weapon quaternion under-reports a 30°/60°/88.9°
 * camera pitch as only ~2.4°/4.3°/5.1° — the EXACT numbers the human
 * reviewer flagged in Step 8E-C.1's review ("screenshots labelled 30° and
 * 60° show derived aim values of only 2.4°/4.3°... it does not prove the
 * chest silhouette follows the player's real look direction"). That
 * complaint was a real, measurable defect in the SOURCE reading, not a
 * subjective visual judgment call.
 *
 * The fix: read `rangeLocalPose.pitch` (`src/lib/v2/range/localPose.ts`)
 * directly — the SAME general-purpose, already-published-every-frame value
 * `RangeController.tsx` sets `camera.rotation.x` FROM, already consumed by
 * other non-debug systems (`VortexFireSystem.tsx`'s animation-state
 * resolution). This is not "a second, independently-computed camera pitch"
 * — it IS the single source of truth the camera itself uses, read through
 * the same established plain-mutable-bridge pattern `gripWorldPose.ts`/
 * `actionPoseState.ts` already use, just for a value neither of those
 * publishes. Sign convention differs (`rangeLocalPose.pitch` is
 * `camera.rotation.x`, positive = look UP — the OPPOSITE of this file's own
 * "positive = down" convention); negate it before use, or use this file's
 * own `convertRangeLocalPitchToAimPitch` below.
 *
 * This function itself is left in place (its math is independently correct
 * and tested) for any future caller with a CLEAN, non-presentation-composed
 * quaternion to extract pitch from — just never the live weapon's own
 * `weaponWorldQuaternion` again.
 */
export function extractAimPitchFromWeaponQuaternion(
  weaponWorldQuat: THREE.Quaternion,
  containerWorldQuat: THREE.Quaternion,
  scratch: ReturnType<typeof createAimPitchScratch> = createAimPitchScratch(),
): number {
  scratch.forwardWorld.copy(WEAPON_FORWARD_LOCAL).applyQuaternion(weaponWorldQuat);
  scratch.containerQuatInverse.copy(containerWorldQuat).invert();
  scratch.forwardLocal.copy(scratch.forwardWorld).applyQuaternion(scratch.containerQuatInverse);

  const len = scratch.forwardLocal.length();
  if (!Number.isFinite(len) || len < 1e-6) return 0;
  scratch.forwardLocal.divideScalar(len);

  // forwardLocal.y > 0 means the weapon-forward direction points UP in the
  // container's own frame (looking up); < 0 means looking down. Pitch
  // (positive = down) is therefore the negated, clamped arcsine of the
  // vertical component.
  const clampedY = THREE.MathUtils.clamp(scratch.forwardLocal.y, -1, 1);
  const pitchRad = -Math.asin(clampedY);
  const maxRad = THREE.MathUtils.degToRad(85);
  return THREE.MathUtils.clamp(pitchRad, -maxRad, maxRad);
}

/**
 * STEP 8E-C.2 — converts `rangeLocalPose.pitch` (camera.rotation.x,
 * positive = look UP) into this file's own "positive = look DOWN"
 * convention. A trivial negation, but named and tested explicitly rather
 * than inlined at each call site — this exact family of function
 * (`extractAimPitchFromWeaponQuaternion`, `applyChestAimFrame`) has already
 * shipped one real sign-inversion bug this milestone (Step 8E-C.1's chest
 * lean, caught by real-browser measurement showing the shoulder moving away
 * from target); a named, tested conversion is cheap insurance against a
 * repeat. Fail-soft: non-finite input returns 0, never NaN.
 */
export function convertRangeLocalPitchToAimPitch(rangeLocalPitchRad: number): number {
  return Number.isFinite(rangeLocalPitchRad) ? -rangeLocalPitchRad : 0;
}

/** Frame-rate-independent exponential smoothing toward a target value — same `1 - exp(-rate*dt)` convention used throughout this codebase (`VortexViewmodel.tsx`'s sway/ADS-blend, `firstPersonArmWeights.ts`). */
export function smoothTowards(current: number, target: number, rate: number, dt: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || !Number.isFinite(dt) || dt <= 0) return target;
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-rate * dt));
}

/**
 * STEP 8E-C.2 — the chest-lean response curve, extracted into a pure,
 * testable function (`KaelFirstPersonShadowBody.tsx` calls this instead of
 * inlining the formula). Replaces Step 8E-C.1's reach-driven INVERSE curve
 * (max lean at pitch=0, relaxing to zero as pitch increases — a curve whose
 * magnitude had no relationship to where the player was actually looking,
 * flagged by human review: "it does not prove the chest silhouette follows
 * the player's real look direction") with a genuine MONOTONIC follow of aim
 * pitch: more lean as the player looks further down (or back, looking up),
 * capped at a believable maximum. Reach is no longer this curve's job at
 * all — Step 8E-C.2 made the shadow weapon chest-anchored
 * (`shadowWeaponPresentationPose.ts`), reachable by construction regardless
 * of chest orientation, freeing this curve to represent look-direction only.
 *
 * Symmetric: a negative (upward) aim pitch produces a negative (backward)
 * chest lean of the same proportional magnitude, bounded by the same cap —
 * this pass's measured sweep only covered downward pitch, so the upward
 * case is a reasoned symmetric default, not independently measured.
 */
export function computeChestAimPitch(smoothedAimPitchRad: number, followFraction: number, maxPitchRad: number): number {
  if (!Number.isFinite(smoothedAimPitchRad) || !Number.isFinite(followFraction) || !Number.isFinite(maxPitchRad)) return 0;
  const cap = Math.abs(maxPitchRad);
  return THREE.MathUtils.clamp(smoothedAimPitchRad * followFraction, -cap, cap);
}
