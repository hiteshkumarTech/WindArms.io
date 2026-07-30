import * as THREE from 'three';
import type { Vec3Tuple } from '@/lib/v2/weapons/vortexRuntimeAnchors';

/**
 * Chest-anchored shadow weapon presentation config (Milestone 8, Step
 * 8E-C.2). Replaces Step 8E-C/8E-C.1's approach of solving the shadow's
 * arms toward the exact CAMERA-RELATIVE `weaponWorldPosition`
 * (`gripWorldPose.ts`) — that target is intentionally camera-friendly, not
 * necessarily reachable by a physically proportioned world-space character,
 * and forcing the full-body skeleton to match it exactly required up to
 * 0.4m of shoulder translation to close the gap (see `docs/decisions.md`'s
 * Step 8E-C.2 entry for the measured before/after).
 *
 * This module defines a SEPARATE shadow-only weapon transform, anchored to
 * the shadow body's own CHEST BONE rather than the camera, so the weapon is
 * reachable BY CONSTRUCTION — a small, fixed offset from a bone the arms are
 * already solving relative to, instead of an independently-computed,
 * camera-distance target the arms must stretch or get assisted toward. Only
 * ORIENTATION responds to aim direction, and only through the chest's own
 * already-restrained aim-pitch lean (`shadowUpperBodyRig.ts`'s
 * `applyChestAimFrame`) — never a second, independent camera-pitch read.
 *
 * WEAPON-LOCAL AXIS CONTRACT (unchanged from `vortexRuntimeAnchors.ts`,
 * reused as-is since `resolveRuntimeAnchorWorldPose` is called against THIS
 * module's transform with the SAME `VORTEX_RUNTIME_ANCHORS`/
 * `RELOAD_LEFT_HAND_LOCAL`/`INSPECT_LEFT_HAND_LOCAL` anchors, never a
 * duplicated or re-measured set): weapon-local +X is the muzzle direction,
 * +Y is up, +Z is lateral. `KaelFirstPersonShadowBody.tsx` composes this
 * weapon-local frame from the chest bone's own live world transform via a
 * FIXED alignment quaternion so the muzzle points where the chest is
 * facing — see `WEAPON_CHEST_ALIGN_QUAT` below for the exact value and,
 * per its own doc comment, why this needed a DIRECTION-SENSITIVE check
 * (comparing the muzzle tip's world position against the grip pivot's and
 * the chest's) rather than a side-view visibility check, which cannot tell
 * "forward" from "180° backward" at all.
 *
 * `positionLocal` is expressed in CHEST-BONE-LOCAL space (chest-local +X =
 * chest right, +Y = chest up, +Z = chest forward — see
 * `WEAPON_CHEST_ALIGN_QUAT`'s own doc comment for why this is +Z, not the
 * -Z the shadow container's own convention would suggest: the chest BONE's
 * own rest-pose local axes, baked into the source GLB, do not necessarily
 * match the yaw-only root container's axes the way `shadowUpperBodyRig.ts`'s
 * pitch-axis math assumed — verified empirically this pass, not just
 * derived), NOT weapon-local space — this is where the weapon's own origin
 * sits relative to the chest, before the muzzle-alignment rotation and the
 * grip anchors' own weapon-local offsets are applied on top.
 *
 * Every value below is a STARTING ESTIMATE pending real-browser calibration
 * (this step's own Sections 5/9/11) — same "grounded in defensible
 * reasoning, not yet visually confirmed" honesty convention every other
 * shadow-rig config file in this pass has used. The reasoning: both
 * `VORTEX_RUNTIME_ANCHORS.gripHandLocal`/`gripSupportLocal` have Z=0 (no
 * lateral offset from the weapon's own centerline — a rifle's two grip
 * points differ in how far forward/back they sit along the barrel, not in
 * how far left/right, matching real two-handed rifle grip anatomy), so
 * `positionLocal`'s X should sit near the body's own midline (a rifle held
 * pulled in toward center, not out at arm's length to one side) — the
 * shoulders' own lateral offset from center is what the arm solve bends
 * across, not a lateral weapon offset.
 */
export interface ShadowWeaponPresentationPose {
  /** Chest-bone-local position offset, meters. */
  positionLocal: Vec3Tuple;
  /** Additional chest-local rotation offset, XYZ Euler DEGREES, composed AFTER the fixed muzzle-alignment quaternion — starts at zero (no extra static tilt) pending calibration. */
  rotationEulerOffsetDeg: Vec3Tuple;
}

/**
 * STEP 8E-C.3 — named per-action-state pose variants, added on top of the
 * Step 8E-C.2 hip/ads pair. Before this pass, `KaelFirstPersonShadowBody.tsx`
 * only ever blended between `hip` and `ads` — sprint, recoil, and every
 * reload/inspect sub-phase produced the EXACT SAME chest-relative weapon
 * transform as hip-fire (confirmed by direct audit, not assumed; see
 * `docs/decisions.md`'s Step 8E-C.3 entry for the measured before/after).
 * That's what the human reviewer meant by "0.00cm hand error... proves
 * internal attachment, not meaningful action synchronisation."
 *
 * Each variant is a SMALL, deliberately conservative delta from `hip` —
 * within a few centimeters/degrees — chosen to keep every state
 * comfortably inside the already-proven-reachable envelope (Step 8E-C.2:
 * 0.00cm assist at the hip pose) without needing to re-derive the reach
 * architecture. `KaelFirstPersonShadowBody.tsx` selects/blends among these
 * using ALREADY-PUBLISHED state (`rangeLocalPose.state` for sprint,
 * `actionPoseState.actionPhase` for reload/inspect sub-phase, `fireSignal.nonce`
 * for a decaying recoil kick) — never a new, independent animation state
 * machine; every value here is a data-table entry blended with the SAME
 * `smoothTowards` technique already used for ADS/chest-pitch smoothing.
 *
 * Starting estimates pending real-browser visual calibration via the Step
 * 8E-C.3 review camera (`/v2/range?shadow=1&shadowReview=1`) — same
 * "grounded in defensible reasoning, not yet visually confirmed" honesty
 * convention this whole config file has used since Step 8E-C.2.
 */
export const SHADOW_WEAPON_PRESENTATION: {
  hip: ShadowWeaponPresentationPose;
  ads: ShadowWeaponPresentationPose;
  sprint: ShadowWeaponPresentationPose;
  reloadSettle: ShadowWeaponPresentationPose;
  reloadManipulate: ShadowWeaponPresentationPose;
  reloadReturn: ShadowWeaponPresentationPose;
  inspectAnticipate: ShadowWeaponPresentationPose;
  inspectHold: ShadowWeaponPresentationPose;
  inspectReturn: ShadowWeaponPresentationPose;
} = {
  // STEP 8E-C.3 CORRECTION: every Z value below had its sign flipped from
  // the Step 8E-C.2 originals — see `WEAPON_CHEST_ALIGN_QUAT`'s doc comment
  // for the full trace. Chest-local +Z (not -Z) is this file's "forward"
  // from this pass on, verified empirically (not just derived) via the
  // review camera's diagnostic bounding-box readout.
  hip: {
    positionLocal: [0, -0.05, 0.28],
    rotationEulerOffsetDeg: [0, 0, 0],
  },
  ads: {
    positionLocal: [0, 0.02, 0.22],
    rotationEulerOffsetDeg: [0, 0, 0],
  },
  // Sprint — pulled in closer and angled down, a clearly different
  // silhouette from a raised, extended hip-fire/ADS hold (real FPS
  // "sprint carry" convention), while staying within a few cm of hip.
  sprint: {
    positionLocal: [0, -0.1, 0.22],
    rotationEulerOffsetDeg: [18, 0, 0],
  },
  // Reload — three distinct chest-relative phases, matching
  // `actionPoseState.actionPhase`'s own reloadSettle/reloadManipulate/
  // reloadReturn naming. The left (support) hand's own action-target blend
  // (Step 8E-C.2, unchanged) already makes it visibly leave the canonical
  // grip during manipulate — these weapon-level deltas give the WEAPON
  // itself a matching, distinct presentation through the same window.
  reloadSettle: {
    positionLocal: [0, -0.08, 0.26],
    rotationEulerOffsetDeg: [5, 0, 0],
  },
  reloadManipulate: {
    positionLocal: [0.02, -0.11, 0.23],
    rotationEulerOffsetDeg: [10, 14, 0],
  },
  reloadReturn: {
    positionLocal: [0, -0.06, 0.27],
    rotationEulerOffsetDeg: [2, 4, 0],
  },
  // Inspect — lifts and yaws to expose a side profile, echoing (not
  // copying) the visible weapon's own inspect presentation concept at a
  // much smaller, chest-reachable magnitude.
  inspectAnticipate: {
    positionLocal: [0, -0.02, 0.26],
    rotationEulerOffsetDeg: [0, 8, 2],
  },
  inspectHold: {
    positionLocal: [0.02, 0.03, 0.24],
    rotationEulerOffsetDeg: [0, 20, 5],
  },
  inspectReturn: {
    positionLocal: [0, -0.02, 0.27],
    rotationEulerOffsetDeg: [0, 6, 1],
  },
};

/**
 * A small, decaying, purely-cosmetic recoil kick for the shadow weapon —
 * triggered by `fireSignal.nonce` (`src/lib/v2/range/effectsBus.ts`)
 * changing, never by touching `VortexFireSystem.tsx`'s own real recoil
 * (`viewKick`) at all. Applied ADDITIVELY on top of whatever base pose is
 * currently blended, decaying exponentially back to zero — "visible but
 * restrained," per the brief, and small enough (well under a centimeter of
 * position, a few degrees of rotation) to never meaningfully affect reach.
 */
export const SHADOW_RECOIL_KICK = {
  /** Peak additive chest-local position delta at the instant of a shot, meters (decays to 0). */
  peakPositionLocal: [0, 0, 0.015] as Vec3Tuple,
  /** Peak additive chest-local rotation delta, degrees (decays to 0). */
  peakRotationEulerDeg: [-4, 0, 0] as Vec3Tuple,
  /** Exponential decay rate (per second) — same `1 - exp(-rate*dt)`-family convention as `smoothTowards`, just applied as a pure decay from 1 rather than a lerp toward a moving target. */
  decayRate: 10,
};

const ACTION_PHASE_POSES: Partial<Record<string, ShadowWeaponPresentationPose>> = {
  reloadSettle: SHADOW_WEAPON_PRESENTATION.reloadSettle,
  reloadManipulate: SHADOW_WEAPON_PRESENTATION.reloadManipulate,
  reloadReturn: SHADOW_WEAPON_PRESENTATION.reloadReturn,
  inspectAnticipate: SHADOW_WEAPON_PRESENTATION.inspectAnticipate,
  inspectHold: SHADOW_WEAPON_PRESENTATION.inspectHold,
  inspectReturn: SHADOW_WEAPON_PRESENTATION.inspectReturn,
};

function lerpPose(a: ShadowWeaponPresentationPose, b: ShadowWeaponPresentationPose, t: number): ShadowWeaponPresentationPose {
  return {
    positionLocal: [
      THREE.MathUtils.lerp(a.positionLocal[0], b.positionLocal[0], t),
      THREE.MathUtils.lerp(a.positionLocal[1], b.positionLocal[1], t),
      THREE.MathUtils.lerp(a.positionLocal[2], b.positionLocal[2], t),
    ],
    rotationEulerOffsetDeg: [
      THREE.MathUtils.lerp(a.rotationEulerOffsetDeg[0], b.rotationEulerOffsetDeg[0], t),
      THREE.MathUtils.lerp(a.rotationEulerOffsetDeg[1], b.rotationEulerOffsetDeg[1], t),
      THREE.MathUtils.lerp(a.rotationEulerOffsetDeg[2], b.rotationEulerOffsetDeg[2], t),
    ],
  };
}

/**
 * STEP 8E-C.3 — pure, testable composition of this frame's DESIRED (pre-
 * smoothing) weapon local pose from already-published state, replacing the
 * old hip/ads-only lerp. Priority order matches `vortexWeaponState.ts`'s
 * own resolver (reload/inspect outrank ADS/sprint, matching the REAL
 * weapon's own `resolveWeaponState` priority — not a new, independently
 * invented ordering): an active reload/inspect sub-phase uses ITS OWN named
 * pose directly; otherwise the pose is `hip` blended toward `ads` (by
 * `adsBlend`) and then toward `sprint` (by `sprintBlend`). The caller
 * (`KaelFirstPersonShadowBody.tsx`) is responsible for smoothing the
 * transition INTO whatever this function returns each frame (via
 * `smoothTowards` per-component) — this function itself is a stateless,
 * per-frame "what should we be moving toward" resolver, not a smoother.
 */
export function resolveDesiredShadowWeaponPose(actionPhase: string, adsBlend: number, sprintBlend: number): ShadowWeaponPresentationPose {
  const phasePose = ACTION_PHASE_POSES[actionPhase];
  if (phasePose) return phasePose;
  const adsLerped = lerpPose(SHADOW_WEAPON_PRESENTATION.hip, SHADOW_WEAPON_PRESENTATION.ads, THREE.MathUtils.clamp(adsBlend, 0, 1));
  return lerpPose(adsLerped, SHADOW_WEAPON_PRESENTATION.sprint, THREE.MathUtils.clamp(sprintBlend, 0, 1));
}

/**
 * STEP 8E-C.3 — the recoil kick's magnitude at `secondsSinceShot` after the
 * triggering `fireSignal.nonce` change, as a 0..1 multiplier on
 * `SHADOW_RECOIL_KICK.peakPositionLocal`/`peakRotationEulerDeg`. Pure
 * exponential decay (`exp(-decayRate * t)`), so it starts at exactly 1.0 the
 * instant a shot registers and smoothly approaches (never exactly reaches)
 * 0 — never a discontinuous snap back to rest. Fail-soft: negative or
 * non-finite `secondsSinceShot` returns 0 (no kick), never NaN/Infinity.
 */
export function computeShadowRecoilKickMultiplier(secondsSinceShot: number): number {
  if (!Number.isFinite(secondsSinceShot) || secondsSinceShot < 0) return 0;
  return Math.exp(-SHADOW_RECOIL_KICK.decayRate * secondsSinceShot);
}

/**
 * Fixed rotation aligning the weapon-local frame (+X = muzzle direction) to
 * the chest BONE's own local forward axis.
 *
 * STEP 8E-C.3 CORRECTION: this was originally a +90° rotation, then flipped
 * to -90° after a diagnostic bounding-box readout showed the weapon's
 * ANCHOR POSITION sitting on the wrong (spawn) side of the character. That
 * diagnostic only ever measured POSITION — and position is computed from
 * `positionLocal` composed through `chestWorldQuat` alone (see
 * `KaelFirstPersonShadowBody.tsx`'s weapon-transform block); this rotation
 * quaternion is never part of that computation. Flipping it alongside the
 * position fix changed the muzzle's ROTATION based on evidence that only
 * ever spoke to position — the exact same category of mistake the rest of
 * this file's history documents (a check that proves reachability/position
 * gets read as proving direction too). It happened to also be RIGHT (see
 * the Step 8E-C.3.1 entry below for the confirmation), but for the wrong
 * reason — worth recording, since "correct outcome, unverified reasoning"
 * is exactly the setup for a future regression.
 *
 * STEP 8E-C.3.1 — RE-VERIFIED, VALUE UNCHANGED (-90°), after this pass
 * almost reverted it to +90° on a flawed check. Sequence of what actually
 * happened, kept in full because the failure mode is instructive:
 *  1. The isolated review camera's close presets showed the rifle poorly
 *     readable from several angles — a real problem (see the diagnostic
 *     material fix elsewhere in this pass), but this was wrongly attributed
 *     to rotation.
 *  2. A world-space dot-product check (muzzle direction vs. world -Z, the
 *     established spawn-forward axis per `RANGE_SPAWN`/`RangeController.tsx`
 *     — see `docs/decisions.md`) showed -90° maps the muzzle almost exactly
 *     to -Z — i.e. CORRECTLY forward. This was (wrongly) treated as
 *     contradicting the visual read and set aside.
 *  3. A SIDE-VIEW VISIBILITY comparison was used instead to pick between
 *     +90°/-90° — and this check is fundamentally direction-blind: a camera
 *     positioned perpendicular to the fore-aft axis sees an object's full
 *     length whether that object points forward OR backward along that
 *     axis. It cannot distinguish "correct" from "180° wrong," only
 *     "on-axis" from "off-axis." Reading it as evidence for +90° over -90°
 *     was the actual error, not the dot-product check from step 2.
 *  4. Caught before shipping by a THIRD, direction-sensitive check: the
 *     muzzle TIP's world position (pivot + `muzzleLocal` rotated by the
 *     candidate quaternion) compared against the pivot's and the chest's
 *     own world Z. A correctly forward-pointing rifle must satisfy
 *     chestZ > pivotZ > muzzleTipZ (each step further toward -Z/forward,
 *     matching how much further from the chest the muzzle tip sits than
 *     the grip does). Measured live: at -90°, 10.070 > 9.787 > 9.589 — the
 *     muzzle tip sits ~0.2m further forward than the pivot, correct. At
 *     +90° (this pass's near-miss), 10.070 > 9.787 but muzzleTip=9.982 sits
 *     BETWEEN chest and pivot — the tip is BEHIND the grip, i.e. the
 *     "muzzle" end actually points back into the character's own chest.
 * Net: -90° is confirmed correct by the only check in this whole history
 * that is actually direction-sensitive (steps 2 and 4, which agree); step 3
 * was the wrong tool for this specific question, and using it overrode a
 * correct signal from step 2. The real readability problem this pass
 * needed to fix was contrast (see `WEAPON_DIAGNOSTIC_MATERIAL` in
 * `KaelFirstPersonShadowWeapon.tsx`) and camera framing/zoom (the new close
 * presets), not orientation.
 *
 * Also cross-checked against real anchor geometry
 * (`vortexRuntimeAnchors.ts`'s `VORTEX_RUNTIME_ANCHORS`, unrelated to and
 * unchanged by this file): `muzzleLocal.x = +0.47` (furthest positive X of
 * any named anchor), `gripHandLocal.x = -0.25` (right/trigger, rearmost),
 * `gripSupportLocal.x = +0.22` (left/support, between the rear grip and the
 * muzzle) — confirms weapon-local +X is unambiguously the muzzle direction
 * on the real asset, not merely an assumed convention, and is consistent
 * with -90° being correct (the muzzle-tip check above already proves this
 * directly; this is corroborating, not load-bearing on its own).
 *
 * `positionLocal`'s Z-sign convention (chest-local +Z = forward) is
 * UNCHANGED and still correct — that fix lives entirely in the position
 * path, which this quaternion never touches, so nothing about it needed to
 * move.
 */
export const WEAPON_CHEST_ALIGN_QUAT: THREE.Quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
