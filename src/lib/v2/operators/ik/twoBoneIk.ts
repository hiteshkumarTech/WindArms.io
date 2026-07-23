import * as THREE from 'three';

/**
 * Pure analytic two-bone IK solver (Milestone 7, Phase F, Step 6). Law-of-
 * cosines closed-form solve — no iteration, no convergence concerns,
 * deterministic single-pass output. No React dependency, no scene-graph
 * dependency: everything is plain vectors/quaternions, so this is usable
 * from a `useFrame` callback, a Node test, or a future non-browser tool
 * without modification.
 *
 * GEOMETRY: given root position, upper/lower bone lengths, a target
 * position, and a pole (the point/direction the elbow should bend toward),
 * solves for the elbow position and produces WORLD rotations for the
 * upper-arm and lower-arm bones such that the chain reaches (or, for an
 * unreachable target, extends maximally toward) the target while bending
 * in the pole's plane.
 *
 * ORIENTATION METHOD: rotations are computed as a DELTA from each bone's
 * REST world orientation/direction, not derived from an assumed bone-local
 * "forward" axis — `solveTwoBoneIk` takes each bone's rest world
 * quaternion AND rest world direction (root→elbow, elbow→hand) as input,
 * and returns `restQuat` rotated by the delta between the rest direction
 * and the newly-solved direction. This works regardless of a specific
 * rig's bone-local axis convention (confirmed this rig's own two hands
 * don't share one — see `docs/decisions.md`), and is the same general
 * technique `runtimeAnchorMath.ts`'s hand-basis correction (Step 6, see
 * `kaelArmRig.ts`) builds on top of for the wrist/hand bone specifically.
 */

export interface TwoBoneIkInput {
  readonly rootPosition: THREE.Vector3;
  readonly targetPosition: THREE.Vector3;
  /** World-space point (or direction — see `poleIsDirection`) the elbow should bend toward. */
  readonly pole: THREE.Vector3;
  readonly poleIsDirection: boolean;
  readonly upperLength: number;
  readonly lowerLength: number;
  /** Rest-pose WORLD quaternion of the upper-arm bone, measured once at load (see kaelArmRig.ts). */
  readonly restUpperQuat: THREE.Quaternion;
  /** Rest-pose WORLD quaternion of the lower-arm bone. */
  readonly restLowerQuat: THREE.Quaternion;
  /** Rest-pose WORLD direction, root→elbow, unit length. */
  readonly restUpperDir: THREE.Vector3;
  /** Rest-pose WORLD direction, elbow→hand, unit length. */
  readonly restLowerDir: THREE.Vector3;
  /**
   * Blend weight, 0..1. 0 = fully rest pose (ignores target entirely), 1 =
   * fully solved. Values between blend the SOLVED result toward rest via
   * quaternion slerp/position lerp — not a cheaper shortcut like skipping
   * the solve, so weight changes stay smooth frame-to-frame.
   */
  readonly weight: number;
}

export interface TwoBoneIkOutput {
  readonly elbowPosition: THREE.Vector3;
  readonly handPosition: THREE.Vector3;
  readonly upperQuat: THREE.Quaternion;
  readonly lowerQuat: THREE.Quaternion;
}

export interface TwoBoneIkResultMeta {
  /** True if the target was farther than upperLength+lowerLength and the chain was clamped to full extension. */
  readonly clampedFar: boolean;
  /** True if the target was closer than |upperLength-lowerLength| and the chain was clamped to minimum fold. */
  readonly clampedNear: boolean;
  /** Distance actually used after clamping (== unclamped target distance when neither clamp applied). */
  readonly solvedDistance: number;
}

const EPSILON = 1e-6;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Clamps `target` to at most `maxDistance` from `origin`, writing the
 * absolute clamped position into `output` (a target within reach is copied
 * through unchanged). Extracted as its own tested unit because a prior
 * version of this clamp — inlined at the call site — corrupted the result
 * via a `Vector3` self-aliasing bug (`subVectors` returns `this`, then a
 * later `.copy(origin)` on that same returned reference silently discarded
 * the just-computed delta before `.add()` could use it, producing `2 *
 * origin` instead of the clamped point). `output` may safely alias `target`
 * (component-wise sequential writes read each source component before
 * overwriting it) but must NOT be re-assigned via `.copy()` mid-computation
 * — this function never does that.
 */
export function clampTargetToMaxReach(origin: THREE.Vector3, target: THREE.Vector3, maxDistance: number, output: THREE.Vector3): void {
  output.subVectors(target, origin);
  const dist = output.length();
  if (dist > maxDistance && dist > EPSILON) {
    output.multiplyScalar(maxDistance / dist);
  }
  output.add(origin);
}

/**
 * Solves the chain. Writes into `output`'s fields IN PLACE (all four are
 * pre-existing THREE objects the caller owns — zero allocation when
 * `output`/`scratch` are supplied, matching this codebase's established
 * hot-path convention). Returns metadata about clamping, useful for
 * debug display and tests — never throws, never produces non-finite
 * output (degenerate inputs fall back to a safe default frame, see
 * "near-zero-distance safety" below).
 */
export function solveTwoBoneIk(
  input: TwoBoneIkInput,
  output: TwoBoneIkOutput,
  scratch?: {
    forward?: THREE.Vector3;
    poleVec?: THREE.Vector3;
    polePerp?: THREE.Vector3;
    bendAxis?: THREE.Vector3;
    elbowDir?: THREE.Vector3;
    handDir?: THREE.Vector3;
    deltaQuat?: THREE.Quaternion;
    restWeightQuat?: THREE.Quaternion;
    restElbowPos?: THREE.Vector3;
    restHandPos?: THREE.Vector3;
  },
): TwoBoneIkResultMeta {
  const forward = scratch?.forward ?? new THREE.Vector3();
  const poleVec = scratch?.poleVec ?? new THREE.Vector3();
  const polePerp = scratch?.polePerp ?? new THREE.Vector3();
  const bendAxis = scratch?.bendAxis ?? new THREE.Vector3();
  const elbowDir = scratch?.elbowDir ?? new THREE.Vector3();
  const handDir = scratch?.handDir ?? new THREE.Vector3();
  const deltaQuat = scratch?.deltaQuat ?? new THREE.Quaternion();

  const { rootPosition, targetPosition, upperLength, lowerLength } = input;

  forward.subVectors(targetPosition, rootPosition);
  const rawDistance = forward.length();

  // Near-zero-distance safety: target coincides with root (degenerate — no
  // well-defined direction). Fall back to the rest upper-arm direction
  // rather than producing a NaN from normalizing a zero vector.
  if (rawDistance < EPSILON) {
    forward.copy(input.restUpperDir);
  } else {
    forward.divideScalar(rawDistance);
  }

  const maxLength = upperLength + lowerLength;
  const minLength = Math.abs(upperLength - lowerLength);
  let clampedFar = false;
  let clampedNear = false;
  let distance = rawDistance;
  if (distance > maxLength - EPSILON) {
    distance = maxLength - EPSILON;
    clampedFar = true;
  } else if (distance < minLength + EPSILON) {
    distance = minLength + EPSILON;
    clampedNear = true;
  }

  // Law of cosines: angle at root between `forward` and root->elbow, and
  // interior angle at the elbow.
  const cosAngleRoot = clamp((upperLength * upperLength + distance * distance - lowerLength * lowerLength) / (2 * upperLength * distance), -1, 1);
  const angleRoot = Math.acos(cosAngleRoot);
  const cosAngleElbow = clamp((upperLength * upperLength + lowerLength * lowerLength - distance * distance) / (2 * upperLength * lowerLength), -1, 1);
  const angleElbow = Math.acos(cosAngleElbow);

  // Bend-plane axis from the pole. `poleVec` is either a direction already
  // (poleIsDirection) or a world point to derive a direction from.
  if (input.poleIsDirection) {
    poleVec.copy(input.pole);
  } else {
    poleVec.subVectors(input.pole, rootPosition);
  }
  if (poleVec.lengthSq() < EPSILON) {
    // Pole degenerate (coincides with root, or a zero direction was
    // passed) — fall back to a stable arbitrary perpendicular so the
    // solve still produces a finite, deterministic (if not visually
    // meaningful) result instead of NaN.
    poleVec.set(0, 1, 0);
    if (Math.abs(poleVec.dot(forward)) > 0.99) poleVec.set(1, 0, 0);
  }

  // Project pole onto the plane perpendicular to `forward`.
  const forwardDotPole = forward.dot(poleVec);
  polePerp.copy(poleVec).addScaledVector(forward, -forwardDotPole);
  if (polePerp.lengthSq() < EPSILON) {
    // Pole is collinear with forward (elbow bend direction undefined by
    // the pole alone) — same stable fallback as above.
    polePerp.set(0, 1, 0);
    if (Math.abs(polePerp.dot(forward)) > 0.99) polePerp.set(1, 0, 0);
    polePerp.addScaledVector(forward, -forward.dot(polePerp));
  }
  polePerp.normalize();

  bendAxis.crossVectors(forward, polePerp).normalize();
  if (bendAxis.lengthSq() < EPSILON) {
    // forward and polePerp ended up parallel despite the projection above
    // (can happen at the exact numerical boundary) — arbitrary stable axis.
    bendAxis.set(0, 0, 1);
  }

  // elbowDir = forward rotated by angleRoot around bendAxis (toward the pole side).
  elbowDir.copy(forward).applyAxisAngle(bendAxis, angleRoot).normalize();
  const elbowPosition = output.elbowPosition;
  elbowPosition.copy(rootPosition).addScaledVector(elbowDir, upperLength);

  // Hand position is NOT a second incremental rotation from elbowDir — by
  // the law-of-cosines construction above, a valid (root, elbow, hand)
  // triangle with sides (upperLength, lowerLength, distance) has hand
  // sitting EXACTLY on the root->target line at `distance`, by definition
  // of `distance`/`forward`. (An earlier version of this function computed
  // handDir as a second axis-angle rotation continuing past elbowDir by
  // the exterior elbow angle — that produced a hand position off by up to
  // half the chain's own length, caught by a test asserting hand-lands-on-
  // target; the bug was composing two rotations that don't actually share
  // the geometric relationship the angle values were derived for.)
  const handPosition = output.handPosition;
  handPosition.copy(rootPosition).addScaledVector(forward, distance);
  handDir.subVectors(handPosition, elbowPosition);
  if (handDir.lengthSq() < EPSILON) {
    // Degenerate only if lowerLength is ~0 — fall back to continuing elbowDir.
    handDir.copy(elbowDir);
  } else {
    handDir.normalize();
  }

  // Orientation: delta-rotate each bone's REST world quaternion by the
  // rotation from its rest direction to the newly-solved direction — see
  // module doc comment for why this is axis-convention-agnostic.
  deltaQuat.setFromUnitVectors(input.restUpperDir, elbowDir);
  output.upperQuat.copy(deltaQuat).multiply(input.restUpperQuat);

  deltaQuat.setFromUnitVectors(input.restLowerDir, handDir);
  output.lowerQuat.copy(deltaQuat).multiply(input.restLowerQuat);

  // Weight blend: slerp solved orientation/lerp solved position back toward
  // rest as weight -> 0. Blending the RESULT (not skipping the solve at low
  // weight) keeps this frame-rate independent and smooth through changes.
  const weight = clamp(input.weight, 0, 1);
  if (weight < 1) {
    const restWeightQuat = scratch?.restWeightQuat ?? new THREE.Quaternion();
    restWeightQuat.copy(input.restUpperQuat);
    output.upperQuat.slerp(restWeightQuat, 1 - weight);
    restWeightQuat.copy(input.restLowerQuat);
    output.lowerQuat.slerp(restWeightQuat, 1 - weight);

    const restElbowPos = scratch?.restElbowPos ?? new THREE.Vector3();
    const restHandPos = scratch?.restHandPos ?? new THREE.Vector3();
    restElbowPos.copy(rootPosition).addScaledVector(input.restUpperDir, upperLength);
    restHandPos.copy(restElbowPos).addScaledVector(input.restLowerDir, lowerLength);
    elbowPosition.lerp(restElbowPos, 1 - weight);
    handPosition.lerp(restHandPos, 1 - weight);
  }

  return { clampedFar, clampedNear, solvedDistance: distance };
}
