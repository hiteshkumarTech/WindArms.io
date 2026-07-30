import * as THREE from 'three';

/**
 * Debug-only visualization bridge for the SHADOW arm/spine IK solve
 * (Milestone 8, Steps 8E-C/8E-C.1) — same plain-mutable-singleton
 * convention as `kaelArmDebugState.ts`, but DELIBERATELY SEPARATE from it:
 * this rig solves a different skeleton (the full-body shadow clone) toward
 * the same grip targets the visible rig also reads, and mixing the two
 * debug singletons would make it impossible to tell, from a screenshot,
 * which rig's numbers are being shown. `KaelShadowDebugPanel.tsx`/
 * `KaelShadowArmDebugMarkers.tsx` are this state's only readers;
 * `KaelFirstPersonShadowBody.tsx`'s arm-solve step is its only writer.
 */
export interface ShadowArmDebugSide {
  shoulderWorldPos: THREE.Vector3;
  elbowWorldPos: THREE.Vector3;
  handWorldPos: THREE.Vector3;
  targetWorldPos: THREE.Vector3;
  poleWorldDir: THREE.Vector3;
  handWorldQuat: THREE.Quaternion;
  /** Distance from the RAW (pre-reach-clamp) grip target to the actual solved hand-bone world position, in meters — same "decisive Stage-B number" convention as the visible rig's own `positionErrorM`. */
  positionErrorM: number;
  /** STEP 8E-C.1: a GENUINE angular error (target orientation vs. the actual hand bone's resulting orientation, composed through the FIXED measured hand-basis correction) — see `shadowUpperBodyRig.ts`'s `solveShadowArmSide` for why this replaced a tautological self-comparison that could only ever read ~0°. */
  rotationErrorRad: number;
  ikWeight: number;
  reachClamped: boolean;
  shoulderToTargetM: number;
  upperLengthM: number;
  lowerLengthM: number;
  totalChainLengthM: number;
  maxReachRatio: number;
  effectiveMaxReachM: number;
  reachDeficitM: number;
  shoulderBoneName: string | null;
  upperArmBoneName: string;
  /** STEP 8E-C.1 — shoulder world position BEFORE the dynamic per-frame assist is applied (chest-aim already applied). */
  preAssistShoulderWorldPos: THREE.Vector3;
  /** STEP 8E-C.1 — this frame's actual (smoothed) dynamic assist magnitude, meters, always ≤ the side's configured max. */
  assistMagnitudeM: number;
  /** True only when every position/rotation number this frame was finite — an explicit fail-soft status readout, not inferred from other fields. */
  finite: boolean;
}

export function makeShadowArmDebugSide(): ShadowArmDebugSide {
  return {
    shoulderWorldPos: new THREE.Vector3(),
    elbowWorldPos: new THREE.Vector3(),
    handWorldPos: new THREE.Vector3(),
    targetWorldPos: new THREE.Vector3(),
    poleWorldDir: new THREE.Vector3(),
    handWorldQuat: new THREE.Quaternion(),
    positionErrorM: 0,
    rotationErrorRad: 0,
    ikWeight: 0,
    reachClamped: false,
    shoulderToTargetM: 0,
    upperLengthM: 0,
    lowerLengthM: 0,
    totalChainLengthM: 0,
    maxReachRatio: 0,
    effectiveMaxReachM: 0,
    reachDeficitM: 0,
    shoulderBoneName: null,
    upperArmBoneName: '',
    preAssistShoulderWorldPos: new THREE.Vector3(),
    assistMagnitudeM: 0,
    finite: true,
  };
}

/** STEP 8E-C.1 — the cascading chest-aim frame's own debug readout (replaces the old single-bone `ShadowSpineDebugState`). */
export interface ShadowChestAimDebugState {
  boneResolved: boolean;
  /** How many of Spine/Spine1/Spine2 actually resolved and are part of the cascade. */
  boneCount: number;
  /** Raw aim-pitch extracted this frame from the weapon's world quaternion, before smoothing. */
  aimPitchRawRad: number;
  /** Frame-rate-independently smoothed aim-pitch actually driving the chest response curve. */
  aimPitchSmoothedRad: number;
  /** The total chest pitch actually applied this frame (already the output of the response curve — see `shadowArmIkConfig.ts`'s `chestAimFollowFraction`/`chestAimMaxPitchRad`). */
  appliedChestPitchRad: number;
}

export const shadowArmDebugState: {
  right: ShadowArmDebugSide;
  left: ShadowArmDebugSide;
  ready: boolean;
  boneResolutionFailed: boolean;
  chest: ShadowChestAimDebugState;
  weaponPoseReady: boolean;
  weaponWorldPosition: THREE.Vector3;
  /** STEP 8E-C.2 — the shadow's own locally-smoothed ADS blend (0..1), driving the chest-anchored weapon presentation's hip/ADS lerp. Independent of `VortexViewmodel.tsx`'s own (unpublished) `adsBlend` — same target/rate formula, a separate smoothing pass over the same underlying store boolean. */
  adsBlend: number;
} = {
  right: makeShadowArmDebugSide(),
  left: makeShadowArmDebugSide(),
  ready: false,
  boneResolutionFailed: false,
  chest: { boneResolved: false, boneCount: 0, aimPitchRawRad: 0, aimPitchSmoothedRad: 0, appliedChestPitchRad: 0 },
  weaponPoseReady: false,
  weaponWorldPosition: new THREE.Vector3(),
  adsBlend: 0,
};
