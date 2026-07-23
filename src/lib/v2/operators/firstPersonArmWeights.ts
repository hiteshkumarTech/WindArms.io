import * as THREE from 'three';

/**
 * IK weight state machine (Milestone 7, Phase F, Step 11) — reads the
 * EXISTING weapon state (`useVortexWeaponStore`), not a new competing
 * weapon state, per explicit instruction. Pure/stateless target-weight
 * computation plus a small stateful exponential smoother (same
 * frame-rate-independent `1 - exp(-rate*delta)` idiom already used
 * throughout `VortexViewmodel.tsx` for ADS blend/sway — not a new
 * smoothing convention).
 *
 * idle/hip-fire/ADS/firing/recoil: both hands weight 1 (no separate
 * state needed for these — they're simply "not reloading, not inspecting,
 * not frozen," which is the default). Reload/inspect reduce LEFT weight
 * only (temporary/procedural per Step 11 — never fakes real magazine
 * interaction, never changes reload/inspect duration; the reduced weight
 * just lets the support hand visually ease off the handguard during those
 * gestures, matching how a real reload/inspect naturally moves the
 * support hand away). Sprint deliberately does NOT reduce weight — Step
 * 11: "both hands remain attached, shoulder presentation may adjust" —
 * shoulder-presentation adjustment is NOT implemented this pass (documented
 * headroom, not required functionality); sprint currently has zero effect
 * on arm IK, which trivially satisfies "hands remain attached."
 *
 * Death/pause are `/v2/play`-only concepts with no equivalent in
 * `/v2/range` today — this module accepts an optional `frozen` input
 * (satisfied by the grip tuner's own freeze-pose toggle in this pass) so a
 * future `/v2/play` integration can wire in `matchStore`'s paused/death
 * phases without changing this function's shape.
 */

export interface ArmWeightInputs {
  reloading: boolean;
  inspecting: boolean;
  /** True while dev calibration tools hold the pose still (grip tuner's freeze, IK tuner's own freeze) — caller should skip smoothing entirely while true, not just target a frozen value (see KaelFirstPersonArms.tsx). */
  frozen: boolean;
}

export interface ArmWeightTargets {
  readonly right: number;
  readonly left: number;
}

const RELOAD_LEFT_WEIGHT = 0.15;
const INSPECT_LEFT_WEIGHT = 0.3;

export function computeArmWeightTargets(inputs: ArmWeightInputs): ArmWeightTargets {
  if (inputs.reloading) return { right: 1, left: RELOAD_LEFT_WEIGHT };
  if (inputs.inspecting) return { right: 1, left: INSPECT_LEFT_WEIGHT };
  return { right: 1, left: 1 };
}

/** Stateful, preallocated-friendly smoother — mutates `state` in place, zero allocation. */
export interface ArmWeightSmoothState {
  right: number;
  left: number;
}

export function createArmWeightSmoothState(): ArmWeightSmoothState {
  return { right: 1, left: 1 };
}

/** Exponential smoothing toward `target`, same `1 - exp(-rate*delta)` idiom as VortexViewmodel.tsx's ADS blend. Rate 8 reaches ~98% of the way to target in ~0.5s — fast enough to read as responsive, slow enough not to look like a hard cut. */
export function smoothArmWeights(state: ArmWeightSmoothState, target: ArmWeightTargets, deltaSeconds: number, rate = 8): void {
  const t = 1 - Math.exp(-rate * deltaSeconds);
  state.right = THREE.MathUtils.lerp(state.right, target.right, t);
  state.left = THREE.MathUtils.lerp(state.left, target.left, t);
}
