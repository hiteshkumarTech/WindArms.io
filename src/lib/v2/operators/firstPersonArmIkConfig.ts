import type { Vec3Tuple } from '@/lib/v2/weapons/vortexRuntimeAnchors';

/**
 * Typed Kael FP-arm IK configuration (Milestone 7, Phase F, Step 7).
 * Every numeric value here is a STARTING ESTIMATE pending visual
 * calibration through `KaelArmIkTunerPanel` (`?ik=1` on `/v2/range`,
 * dev-only) — same honesty convention already established for the Vortex
 * grip anchors (`vortexRuntimeAnchors.ts`'s doc comment): this session has
 * no browser access to confirm these look right, so they are grounded in
 * defensible reasoning (natural rifle-hold anatomy, the container's own
 * measured geometry) but explicitly NOT visually verified.
 */

export interface FirstPersonArmIkConfig {
  /**
   * Elbow bend-plane direction per side, in ARM-RIG-CONTAINER-LOCAL space
   * (NOT world space — the container follows the camera, so a world-space
   * pole would need re-deriving every frame; a container-local direction
   * stays valid as the container moves, exactly like the rest metrics in
   * kaelArmRig.ts). A fixed DIRECTION (not a world point) is deliberately
   * more stable than a point-based pole: it can never flip the bend side
   * based on where the target currently is, which is what "no elbow flip"
   * actually requires structurally, not just tuned away.
   *
   * Starting values reason from natural rifle-hold anatomy: elbows sit
   * below and slightly behind the shoulder line (own weight, not held up
   * against gravity), and point outward from the body's own midline —
   * right elbow points +X-ish (away from center to the shooter's right),
   * left elbow points -X-ish (mirrored, NOT negated from right — see
   * `docs/decisions.md`'s standing rule that this rig's two sides are
   * never simple mirrors of each other; these two directions were chosen
   * independently, they only happen to differ mainly in sign because nothing
   * else about this rig's coarse elbow placement is asymmetric).
   */
  rightElbowPoleLocal: Vec3Tuple;
  leftElbowPoleLocal: Vec3Tuple;

  /**
   * Where the arm-rig container sits relative to the camera, in VIEW
   * space (+x right, +y up, -z forward — same convention
   * `vortexViewmodelPose.ts` already documents for the Vortex's own base
   * pose). Coarse shoulder placement ONLY — see KaelFirstPersonArms.tsx's
   * doc comment for why this must never reproduce the weapon's hip/ADS/
   * recoil motion.
   */
  shoulderRootOffset: Vec3Tuple;

  /**
   * Caps how far the solved hand target is allowed to pull the chain
   * toward full extension, as a fraction of (upperLength+lowerLength) —
   * 1.0 = solver's own natural max-reach clamp (see twoBoneIk.ts), <1.0
   * reserves a safety margin so the arm never looks bone-straight even for
   * a target at the solver's literal maximum. 0.97 leaves a small, usually
   * imperceptible margin.
   */
  maxReachRatio: number;

  /** Blend weight applied to hand POSITION solving (see IK weight state machine, firstPersonArmWeights.ts) — kept separate from rotationWeight per Step 9's explicit "blend rotation separately from position." */
  positionWeight: number;
  /** Blend weight applied to hand ROTATION alignment (basis-corrected target quaternion vs. the IK-solved forearm-continuation orientation). */
  rotationWeight: number;

  /**
   * Step 6G — per-side shoulder/clavicle assist, CONTAINER-LOCAL (same
   * camera-relative convention as `shoulderRootOffset`: +x right, +y up,
   * -z forward). Rigidly translates this side's shoulder attachment point
   * (see `kaelArmSolve.ts`'s `SideTuningOverrides.shoulderAssistLocal` for
   * the full mechanism and why a real bone translation is required, not a
   * fake solve-time root) to close a genuine reach deficit — NOT a
   * transform bug. Manual browser measurement (Step 6G) found the RIGHT
   * hand reaches its grip target with 0.00cm error while the LEFT hand
   * reach-clamped at 7.36cm short. Root cause, confirmed by comparing both
   * sides' measured chain lengths (upper/lower arm length asymmetry
   * <0.1mm — not a rig/bone-resolution bug): the Vortex Rifle's support
   * grip (`gripSupportLocal`) sits far forward along the barrel/handguard
   * while the trigger grip (`gripHandLocal`) sits behind the weapon's
   * pivot, but both shoulders sit at the SAME symmetric camera-relative
   * offset — a real two-handed rifle hold requires the support-side
   * shoulder to extend/reach forward further than the trigger-side
   * shoulder, which this rig's shared, mirrored shoulder placement cannot
   * express without a per-side correction.
   */
  rightShoulderAssistLocal: Vec3Tuple;
  /**
   * VISUALLY APPROVED 2026-07-23 (Step 6H) via human browser calibration in
   * `KaelArmIkTunerPanel` — supersedes the Step 6G computed starting value
   * of `[0.045, -0.007, -0.038]` (which had already zeroed the measured
   * positional error headlessly; this is the human's live-render refinement
   * on top of that). Session also confirmed `RIGHT POSITION ERROR: 0.00cm`,
   * `LEFT POSITION ERROR: 0.00cm` at this value. See docs/decisions.md.
   */
  leftShoulderAssistLocal: Vec3Tuple;

  /**
   * VISUALLY APPROVED 2026-07-23 — per-side hand-basis rotation adjustment,
   * DEGREES (XYZ Euler, canonical grip-anchor frame: X=finger-forward,
   * Y=thumb-side, Z=palm-normal — same convention `vortexRuntimeAnchors.ts`
   * documents), composed onto the rig-measured `handBasisCorrection` per
   * `kaelArmSolve.ts`'s `SideTuningOverrides.handBasisAdjustQuat`. Right
   * hand: +30° X (finger-forward-axis) correction, approved Step 6H.
   * Left hand: extended in the same-day follow-up pass to `[30, 30, -10]`
   * (finger-forward +30°, thumb-side +30°, palm-normal -10°) — supersedes
   * Step 6H's `[0, 0, 0]` ("no adjustment needed") once left-hand basis
   * tuning was actually reached. Converted to radians only at the
   * `KaelFirstPersonArms.tsx` call site, matching every other
   * degrees-in-config/radians-at-callsite value in this codebase.
   */
  rightHandBasisAdjustDeg: Vec3Tuple;
  leftHandBasisAdjustDeg: Vec3Tuple;

  /**
   * VISUALLY APPROVED 2026-07-23 — per-side multiplier (0..1) on the
   * authored finger-curl strength (`RIGHT_HAND_FINGER_POSE`/
   * `LEFT_HAND_FINGER_POSE`), see `SideTuningOverrides.fingerCurlScale`.
   * Right hand: 0 (finger-curl stage not yet reached for that side at this
   * pass). Left hand: 0.30 — the first real (non-zero) finger-curl value
   * approved in this milestone, supersedes Step 6H's `0` placeholder.
   */
  rightFingerCurlScale: number;
  leftFingerCurlScale: number;
}

export const FIRST_PERSON_ARM_IK_CONFIG: FirstPersonArmIkConfig = {
  rightElbowPoleLocal: [0.55, -0.75, 0.35],
  leftElbowPoleLocal: [-0.5, -0.78, 0.32],
  // Changed 2026-07-22 from [0.0, -0.05, 0.0] — the original value placed
  // the shoulder-joint region (the arms-only extraction's cut boundary)
  // only ~0.12m from the camera in a worst-case orientation, which a 75°
  // FOV projects across a large fraction of the screen through ordinary
  // perspective, independent of any transform correctness. This value
  // pushes the worst-case closest vertex out to ~0.30m (headless-measured
  // against the real asset, not visually confirmed — see docs/decisions.md
  // "exploded geometry" entries for the full investigation and numbers).
  // If this still isn't enough on screen, [0.0, -0.18, -0.4] measured out
  // to ~0.38m in the same check.
  shoulderRootOffset: [0.0, -0.15, -0.3],
  maxReachRatio: 0.97,
  positionWeight: 1.0,
  // rotationWeight confirmed at 1.0 for BOTH sides by the Step 6H approved
  // session (rightWristRotationWeight/leftWristRotationWeight both 1.00) —
  // already matched this single shared default exactly, so no per-side
  // split was needed to preserve that calibration result.
  rotationWeight: 1.0,
  rightShoulderAssistLocal: [0.0, 0.0, 0.0],
  leftShoulderAssistLocal: [0.06, -0.009, -0.05],
  rightHandBasisAdjustDeg: [30, 0, 0],
  leftHandBasisAdjustDeg: [30, 30, -10],
  rightFingerCurlScale: 0.0,
  leftFingerCurlScale: 0.3,
};

/**
 * Per-bone additive finger-grip pose offsets (Step 10) — LOCAL Euler
 * offsets applied ON TOP of each finger segment's rest rotation, after the
 * arm/hand IK solve. Deliberately restrained: curls fingers toward a
 * plausible grip wrap without a procedural contact solver (explicitly not
 * required — "no complex procedural finger solver is required"). Marked
 * TEMPORARY until real authored animation exists — never described as
 * final in any doc/comment.
 *
 * Values are radians, applied via `bone.rotation.x/y/z += offset` (additive
 * to whatever the rest pose already has), same rotation-order convention
 * as the rest of this bone's own Euler (XYZ, THREE.js default). Segment
 * index 0 = the MCP/knuckle joint (closest to the hand), increasing
 * outward toward the fingertip — curl is generally largest at the base
 * joint and tapers, matching how a real grip wrap looks.
 */
export interface FingerCurlProfile {
  /** One entry per resolved segment, in order; profile is reused/truncated to however many segments a given rig chain actually has. */
  curlX: number[];
}

export interface HandFingerPoseConfig {
  thumb: FingerCurlProfile;
  index: FingerCurlProfile;
  middle: FingerCurlProfile;
  ring: FingerCurlProfile;
  pinky: FingerCurlProfile;
}

/**
 * Right hand (primary/trigger grip): middle/ring/pinky wrap firmly around
 * the pistol grip, thumb rests naturally over the top/side, index stays
 * straighter (near the trigger guard, not curled into a full fist) so it
 * visually reads as "resting near the trigger," not "wrapped around the
 * grip like the other three."
 */
export const RIGHT_HAND_FINGER_POSE: HandFingerPoseConfig = {
  thumb: { curlX: [0.35, 0.25, 0.15] },
  index: { curlX: [0.25, 0.2, 0.15] },
  middle: { curlX: [0.85, 0.75, 0.6] },
  ring: { curlX: [0.9, 0.8, 0.65] },
  pinky: { curlX: [0.9, 0.85, 0.7] },
};

/**
 * Left hand (support/foregrip): all four fingers wrap the handguard
 * similarly (no trigger to hold clear of), thumb rests over the top.
 */
export const LEFT_HAND_FINGER_POSE: HandFingerPoseConfig = {
  thumb: { curlX: [0.3, 0.25, 0.15] },
  index: { curlX: [0.75, 0.7, 0.55] },
  middle: { curlX: [0.8, 0.75, 0.6] },
  ring: { curlX: [0.8, 0.75, 0.6] },
  pinky: { curlX: [0.8, 0.75, 0.6] },
};
