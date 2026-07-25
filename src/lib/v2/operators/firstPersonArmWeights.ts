import * as THREE from 'three';

/**
 * Small stateful exponential smoother for right/left IK weight (Milestone
 * 7, Phase F, Step 11; target-weight computation moved to
 * `lib/v2/operators/actionPose.ts` in Phase G Step 7C — this file now only
 * owns the smoothing, not what the targets ARE). Same
 * frame-rate-independent `1 - exp(-rate*delta)` idiom already used
 * throughout `VortexViewmodel.tsx` for ADS blend/sway — not a new
 * smoothing convention.
 */

export interface ArmWeightTargets {
  readonly right: number;
  readonly left: number;
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
