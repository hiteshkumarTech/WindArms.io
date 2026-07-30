import type { Vec3Tuple } from '@/lib/v2/weapons/vortexRuntimeAnchors';

/**
 * Shadow-rig arm/spine IK configuration (Milestone 8, Step 8E-C). Sibling
 * to `firstPersonArmIkConfig.ts` but DELIBERATELY SEPARATE — this rig
 * solves a different mesh (`operator-kael.lod1.glb`'s full-body skeleton,
 * world-anchored) against a different container convention (world-space,
 * not camera-relative) than the visible FP-arms rig (`operator-kael-arms.glb`,
 * camera-relative). The Step 8E-C brief is explicit that the visible rig's
 * basis corrections/elbow poles/shoulder assists must NOT be assumed to
 * transfer — this file exists so that copying is structurally impossible
 * (there is no shared config object for the two rigs to accidentally read
 * from), not just discouraged by convention.
 *
 * Every numeric value below is a STARTING ESTIMATE pending real-browser
 * visual calibration (Step 8E-C's own Sections 11–12), same "grounded in
 * defensible reasoning, not yet visually confirmed" honesty convention
 * `firstPersonArmIkConfig.ts` established.
 */

export interface ShadowArmIkConfig {
  /**
   * Elbow bend-plane direction per side, in SHADOW-BODY-CONTAINER-LOCAL
   * space (the shadow root's own local frame — world-anchored at the
   * physical body position, yaw-only rotation, see `shadowBodyTransform.ts`).
   * A fixed direction (not a world point), same reasoning as the visible
   * rig's poles: structurally prevents an elbow-side flip regardless of
   * where the target currently is.
   *
   * Starting values reason from the same natural rifle-hold anatomy as the
   * visible rig's own starting values, but are NOT copied from them — this
   * skeleton's shoulder/arm geometry (full-body rest pose, not a
   * shoulder-relative arms-only extraction) is different enough that the
   * two rigs' numbers coincidentally being similar would be luck, not
   * derivation. Right elbow points outward/down/back (away from body
   * midline, own weight, not braced against gravity); left elbow points
   * outward/down/forward (support-hand reaching toward the foregrip).
   */
  rightElbowPoleLocal: Vec3Tuple;
  leftElbowPoleLocal: Vec3Tuple;

  /**
   * Caps how far the solved hand target may pull the chain toward full
   * extension, as a fraction of (upperLength+lowerLength) — same generic
   * solver-safety-margin semantics as `FirstPersonArmIkConfig.maxReachRatio`
   * (this is a structural solver behavior, not a mesh-specific calibration
   * value, so reusing the same NUMBER here is a deliberate choice, not an
   * accidental copy of asset-specific tuning).
   */
  maxReachRatio: number;

  /** Blend weight applied to hand POSITION solving. */
  positionWeight: number;
  /** Blend weight applied to hand ROTATION alignment. */
  rotationWeight: number;

  /**
   * Per-side hand-basis rotation adjustment, DEGREES (XYZ Euler, canonical
   * grip-anchor frame: X=finger-forward, Y=thumb-side, Z=palm-normal — same
   * convention `vortexRuntimeAnchors.ts` documents), composed onto this
   * rig's OWN measured `handBasisCorrection` (measured fresh from THIS
   * skeleton's rest pose every mount, same as the visible rig's own
   * per-mount measurement — never copied from the visible rig's approved
   * `[30,0,0]`/`[30,30,-10]` values, which correct for a DIFFERENT mesh's
   * geometry).
   */
  rightHandBasisAdjustDeg: Vec3Tuple;
  leftHandBasisAdjustDeg: Vec3Tuple;

  /**
   * STEP 8E-C.2 REWORK: replaces Step 8E-C.1's INVERSE reach-driven curve
   * (max lean at pitch=0, relaxing to zero by `chestAimFalloffPitchRad`).
   * That curve solved reach at the cost of meaning the opposite of what it
   * looked like — the human reviewer's own words: "screenshots labelled 30°
   * and 60° show derived aim values of only 2.4°/4.3°... it does not prove
   * the chest silhouette follows the player's real look direction."
   *
   * Reach is no longer the chest lean's job at all: Step 8E-C.2 moved the
   * shadow weapon from a camera-relative target to a CHEST-ANCHORED one
   * (`shadowWeaponPresentationPose.ts`), which is reachable by construction
   * regardless of chest orientation (a small, fixed offset from a bone the
   * arms already solve relative to). That frees the chest-lean curve to do
   * what it should have anatomically: a genuine, MONOTONIC follow of aim
   * pitch — `appliedPitch = clamp(smoothedAimPitch * chestAimFollowFraction,
   * -chestAimMaxPitchRad, chestAimMaxPitchRad)` — more forward lean as the
   * player looks further down, capped at a believable maximum, instead of
   * an inverse curve whose magnitude had no relationship to where the
   * player was actually looking.
   */
  chestAimFollowFraction: number;
  /** Hard cap on the applied chest-lean magnitude in EITHER direction (looking down leans forward, looking up leans back), radians. */
  chestAimMaxPitchRad: number;
  /** Frame-rate-independent smoothing rate for the extracted aim-pitch value feeding the chest lean — avoids a visible snap on a single noisy frame. */
  chestAimSmoothingRate: number;

  /**
   * STEP 8E-C.2 REWORK: with the shadow weapon now chest-anchored
   * (reachable by construction), this is a SMALL RESIDUAL corrector for
   * whatever tiny gap remains after the chest lean and arm reach — never
   * the primary reach mechanism. Hard-capped well below the anatomical
   * "hard exceptional max" of 8cm (0.08m) the human reviewer specified —
   * Step 8E-C.1's 0.4m/40cm left-side value is explicitly rejected: "That
   * permits roughly 40cm of shoulder translation... it can effectively pull
   * the shoulder away from the torso to make an otherwise unreachable
   * target pass numerically." Still computed fresh every frame from the
   * ACTUAL measured reach deficit (direction toward the real target,
   * magnitude = `clamp(reachDeficit, 0, maxAssistM)`), smoothed toward that
   * target magnitude at `shoulderAssistSmoothingRate`.
   */
  rightMaxShoulderAssistM: number;
  leftMaxShoulderAssistM: number;
  /**
   * Dev-only diagnostic threshold (meters) — when the RAW (pre-clamp)
   * computed assist target exceeds this, `KaelFirstPersonShadowBody.tsx`
   * warns once via `console.warn`: the chest-anchored weapon presentation
   * is no longer closing the reach gap on its own for that pose, which
   * should not happen in any normal state under the new architecture and
   * is worth surfacing rather than silently absorbing. Independent of
   * `rightMaxShoulderAssistM`/`leftMaxShoulderAssistM` — this fires even if
   * a tuner override raises those caps back up, precisely the "no 40cm
   * telescopic clavicles" regression this constant exists to catch early.
   */
  shoulderAssistWarnThresholdM: number;
  /** Frame-rate-independent smoothing rate for the dynamic assist magnitude. */
  shoulderAssistSmoothingRate: number;
}

export const SHADOW_ARM_IK_CONFIG: ShadowArmIkConfig = {
  rightElbowPoleLocal: [0.5, -0.7, 0.3],
  leftElbowPoleLocal: [-0.45, -0.72, 0.3],
  maxReachRatio: 0.97,
  positionWeight: 1.0,
  rotationWeight: 1.0,
  rightHandBasisAdjustDeg: [0, 0, 0],
  leftHandBasisAdjustDeg: [0, 0, 0],
  // STEP 8E-C.2 starting estimates, pending real-browser calibration on
  // /v2/range?shadow=1 (this pass's own Sections 5/9/11 — see
  // docs/decisions.md for the measured result once run). 0.55 follow
  // fraction + 30deg cap is a reasoned starting point (a visible-but-not-
  // exaggerated torso lean toward aim direction, well short of the "no
  // exaggerated torso twisting" ceiling), NOT yet visually confirmed.
  chestAimFollowFraction: 0.55,
  chestAimMaxPitchRad: 0.524, // 30 deg
  chestAimSmoothingRate: 12,
  // Both sides start at the human reviewer's PREFERRED bound (0-6cm), not
  // the hard exceptional max (8cm) — the chest-anchored weapon presentation
  // should make the residual gap small on both sides now that reach is no
  // longer solved primarily through shoulder translation. Symmetric (unlike
  // Step 8E-C.1's asymmetric 0.1/0.4) because the new weapon anchor has no
  // built-in left/right asymmetry of its own — see
  // shadowWeaponPresentationPose.ts's doc comment.
  rightMaxShoulderAssistM: 0.06,
  leftMaxShoulderAssistM: 0.06,
  shoulderAssistWarnThresholdM: 0.08,
  shoulderAssistSmoothingRate: 10,
};
