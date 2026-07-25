import { MathUtils } from 'three';

/**
 * Pure, testable procedural action-phase layer for Kael's FP arms + the
 * Vortex Rifle's reload/inspect presentation (Milestone 7, Phase G, Step
 * 7C). No React, no Zustand, no THREE scene dependency (only
 * `THREE.MathUtils`'s plain math helpers, same convention already used by
 * `VortexViewmodel.tsx`/`firstPersonArmWeights.ts` — not a scene/object
 * dependency). Deterministic: same `(phase, progress, canonical curls)`
 * input always produces the same output, so this is fully unit-testable
 * without a browser or a mounted scene.
 *
 * PROCEDURAL, NOT AUTHORED: every curve below is a hand-tuned function of
 * normalized time, not a baked animation clip — there are no keyframes, no
 * skeletal animation data, nothing sampled from a DCC tool. Documentation
 * referencing this module must not describe it as "authored animation."
 *
 * OWNERSHIP: this module only produces DATA (numbers). It never touches a
 * THREE.Object3D, a bone, or a Zustand store. `VortexViewmodel.tsx` (which
 * already owns the weapon's reload/inspect progress via
 * `useVortexWeaponStore`) calls `computeActionPose` once per frame and:
 *   1. applies `weaponPositionOffset`/`weaponRotationOffset` to its own
 *      group transform (replacing the old inline `reloadDipOffset`/inspect
 *      sine math one-for-one — same visual shape for reload, a genuinely
 *      redesigned presentation curve for inspect per Step 7C's brief);
 *   2. publishes the rest of the pose (hand weights, finger curls, action-
 *      target blend, phase name) via `actionPoseState.ts` for
 *      `KaelFirstPersonArms.tsx` to read imperatively (no subscription, no
 *      second computation — "one action computation per frame").
 */

export type ActionPhaseName =
  | 'idle'
  | 'reloadSettle'
  | 'reloadManipulate'
  | 'reloadReturn'
  | 'inspectAnticipate'
  | 'inspectHold'
  | 'inspectReturn';

export interface FirstPersonActionPose {
  /** View-space additive offset, meters — same frame as `VortexViewmodel`'s base pose (+x right, +y up, -z forward). Mutated in place. */
  weaponPositionOffset: [number, number, number];
  /** Additive Euler XYZ, radians, applied the same order/point as the base pose's dynamic terms. Mutated in place. */
  weaponRotationOffset: [number, number, number];
  /** 0..1 — right hand's overall IK weight for this frame (never leaves 1.0 in this module; the right hand is always the primary weapon attachment). */
  rightHandIkWeight: number;
  /** 0..1 — left hand's overall IK weight for this frame. Stays close to 1 by design (a controlled, purposeful movement toward an action target, not a loose release toward rest pose). */
  leftHandIkWeight: number;
  /** Final (already-blended-with-canonical) right finger curl scale to pass to `solveSide`'s tuning override. */
  rightFingerCurlScale: number;
  /** Final (already-blended-with-canonical) left finger curl scale to pass to `solveSide`'s tuning override. */
  leftFingerCurlScale: number;
  /** 0..1 — how much the left hand's IK TARGET (position+rotation) should blend from the normal grip anchor toward the action-target anchor. 0 = normal grip, 1 = fully at the action target. */
  leftActionTargetWeight: number;
  actionPhase: ActionPhaseName;
}

export function createActionPose(): FirstPersonActionPose {
  return {
    weaponPositionOffset: [0, 0, 0],
    weaponRotationOffset: [0, 0, 0],
    rightHandIkWeight: 1,
    leftHandIkWeight: 1,
    rightFingerCurlScale: 0,
    leftFingerCurlScale: 0,
    leftActionTargetWeight: 0,
    actionPhase: 'idle',
  };
}

export type ActionKind = 'idle' | 'reload' | 'inspect';

export interface ActionPoseInput {
  readonly kind: ActionKind;
  /** Normalized 0..1 progress through the action. Ignored (treated as 0) when `kind === 'idle'`. Clamped internally — out-of-range or non-finite input never produces out-of-range or non-finite output. */
  readonly progress: number;
  /** The canonical (non-action) finger curl scale for each hand — `FIRST_PERSON_ARM_IK_CONFIG.rightFingerCurlScale`/`leftFingerCurlScale`, or a live tuner override. This module blends toward these, never hardcodes them. */
  readonly canonicalRightFingerCurl: number;
  readonly canonicalLeftFingerCurl: number;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? MathUtils.clamp(v, 0, 1) : 0;
}

/** Remap `t` from `[a,b]` to `[0,1]`, clamped both ends. `b<=a` degenerates to a hard step at `a`. */
function remap01(t: number, a: number, b: number): number {
  if (b <= a) return t < a ? 0 : 1;
  return clamp01((t - a) / (b - a));
}

function smooth(t: number): number {
  return MathUtils.smoothstep(t, 0, 1);
}

/** Ease-in over `[inStart,inEnd]`, hold at 1 over `[inEnd,outStart]`, ease-out over `[outStart,outEnd]`. The single shared "how deep into the gesture" trapezoid every curve in this module derives from — keeps the weapon motion and the hand/finger motion visually coherent (everything moves together). */
function trapezoid(p: number, inStart: number, inEnd: number, outStart: number, outEnd: number): number {
  if (p < inEnd) return smooth(remap01(p, inStart, inEnd));
  if (p < outStart) return 1;
  return 1 - smooth(remap01(p, outStart, outEnd));
}

function phaseName(p: number, kind: 'reload' | 'inspect', b1: number, b2: number): ActionPhaseName {
  if (kind === 'reload') return p < b1 ? 'reloadSettle' : p < b2 ? 'reloadManipulate' : 'reloadReturn';
  return p < b1 ? 'inspectAnticipate' : p < b2 ? 'inspectHold' : 'inspectReturn';
}

// ---- Reload ----------------------------------------------------------
const RELOAD_SETTLE_END = 0.3;
const RELOAD_RETURN_START = 0.7;
/** Ported verbatim (same breakpoints/magnitudes) from `VortexViewmodel.tsx`'s previous inline `reloadDipOffset` — proven, already-tuned weapon feel; only its home moved, not its shape. */
function reloadDipY(p: number): number {
  const c = clamp01(p);
  if (c < 0.35) return MathUtils.lerp(0, -0.16, smooth(remap01(c, 0, 0.35)));
  if (c < 0.55) return -0.16;
  if (c < 0.85) return MathUtils.lerp(-0.16, 0, smooth(remap01(c, 0.55, 0.85)));
  const settle = (c - 0.85) / 0.15;
  return Math.sin(settle * Math.PI * 2) * 0.01 * (1 - settle);
}

function computeReload(p0: number, input: ActionPoseInput, out: FirstPersonActionPose): FirstPersonActionPose {
  const p = clamp01(p0);
  // Small 0.05 grace before the release starts moving — the settle beat
  // reads as "recognizing the trigger" rather than an instant snap.
  const shape = trapezoid(p, 0.05, RELOAD_SETTLE_END, RELOAD_RETURN_START, 0.95);

  out.weaponPositionOffset[0] = 0;
  out.weaponPositionOffset[1] = reloadDipY(p);
  out.weaponPositionOffset[2] = 0;
  out.weaponRotationOffset[0] = 0;
  out.weaponRotationOffset[1] = 0;
  out.weaponRotationOffset[2] = 0;

  out.rightHandIkWeight = 1;
  // Right hand never releases the grip; only a very small softening at the
  // deepest point of the manipulation window, per "very small wrist
  // adjustment... if necessary" — kept intentionally small (max 4%).
  out.leftHandIkWeight = MathUtils.lerp(1, 0.88, shape);
  out.rightFingerCurlScale = input.canonicalRightFingerCurl;
  out.leftFingerCurlScale = MathUtils.lerp(input.canonicalLeftFingerCurl, 0.55, shape);
  out.leftActionTargetWeight = shape;
  out.actionPhase = phaseName(p, 'reload', RELOAD_SETTLE_END, RELOAD_RETURN_START);
  return out;
}

// ---- Inspect -----------------------------------------------------------
const INSPECT_ANTICIPATE_END = 0.15;
const INSPECT_RETURN_START = 0.75;
/** Restrained presentation angle — enough to read the side profile without swinging the muzzle toward the camera or off dead-center for long. */
const INSPECT_YAW_MAX = 0.45; // ~26 deg
const INSPECT_ROLL_MAX = 0.12; // ~7 deg
const INSPECT_LIFT_MAX = 0.05;

function computeInspect(p0: number, input: ActionPoseInput, out: FirstPersonActionPose): FirstPersonActionPose {
  const p = clamp01(p0);
  const shape = trapezoid(p, 0, INSPECT_ANTICIPATE_END, INSPECT_RETURN_START, 1);

  out.weaponPositionOffset[0] = 0;
  out.weaponPositionOffset[1] = shape * INSPECT_LIFT_MAX;
  out.weaponPositionOffset[2] = 0;
  out.weaponRotationOffset[0] = 0;
  out.weaponRotationOffset[1] = shape * INSPECT_YAW_MAX;
  out.weaponRotationOffset[2] = shape * INSPECT_ROLL_MAX;

  out.rightHandIkWeight = 1;
  // Left hand loosens/slides less than during reload (0.6 peak target
  // weight vs reload's 1.0) — "may loosen, slide or reposition," not a
  // full release.
  out.leftHandIkWeight = MathUtils.lerp(1, 0.9, shape);
  out.rightFingerCurlScale = input.canonicalRightFingerCurl;
  // Slightly LESS curl than canonical during the hold — an open, sliding
  // hand along the handguard, not a tightened grip.
  out.leftFingerCurlScale = MathUtils.lerp(input.canonicalLeftFingerCurl, 0.2, shape);
  out.leftActionTargetWeight = shape * 0.6;
  out.actionPhase = phaseName(p, 'inspect', INSPECT_ANTICIPATE_END, INSPECT_RETURN_START);
  return out;
}

function computeIdle(input: ActionPoseInput, out: FirstPersonActionPose): FirstPersonActionPose {
  out.weaponPositionOffset[0] = 0;
  out.weaponPositionOffset[1] = 0;
  out.weaponPositionOffset[2] = 0;
  out.weaponRotationOffset[0] = 0;
  out.weaponRotationOffset[1] = 0;
  out.weaponRotationOffset[2] = 0;
  out.rightHandIkWeight = 1;
  out.leftHandIkWeight = 1;
  out.rightFingerCurlScale = input.canonicalRightFingerCurl;
  out.leftFingerCurlScale = input.canonicalLeftFingerCurl;
  out.leftActionTargetWeight = 0;
  out.actionPhase = 'idle';
  return out;
}

/**
 * Computes the full action pose for one frame. Deterministic, finite,
 * clamped, allocation-free when `out` is supplied (falls back to a fresh
 * `createActionPose()` for tests/one-off calls only — never the per-frame
 * hot path, matching `runtimeAnchorMath.ts`'s established convention).
 */
export function computeActionPose(input: ActionPoseInput, out?: FirstPersonActionPose): FirstPersonActionPose {
  const target = out ?? createActionPose();
  const canonR = Number.isFinite(input.canonicalRightFingerCurl) ? input.canonicalRightFingerCurl : 0;
  const canonL = Number.isFinite(input.canonicalLeftFingerCurl) ? input.canonicalLeftFingerCurl : 0;
  const safeInput: ActionPoseInput = { kind: input.kind, progress: input.progress, canonicalRightFingerCurl: canonR, canonicalLeftFingerCurl: canonL };
  if (input.kind === 'reload') return computeReload(input.progress, safeInput, target);
  if (input.kind === 'inspect') return computeInspect(input.progress, safeInput, target);
  return computeIdle(safeInput, target);
}
