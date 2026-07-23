import * as THREE from 'three';

/**
 * Debug-only visualization bridge for the Kael FP-arm IK solve (Step 13).
 * Same plain-mutable-singleton convention as `muzzleWorldPose.ts` — NOT
 * the generation-gated correctness-critical pattern `gripWorldPose.ts`
 * uses, because this is purely a visual aid (`KaelArmIkDebug.tsx` reading
 * "roughly this frame or last frame's solved chain" is fine; nothing
 * gameplay-relevant reads this). Written by `KaelFirstPersonArms.tsx`
 * (production component, but the write itself costs a few Vector3 copies —
 * negligible, and only matters as "hot path cost" if a debug consumer is
 * even present, which it structurally cannot be in production since
 * `useIkDebugEnabled()` gates the reader, not the writer — the writer
 * always runs, at negligible cost, so there is nothing to gate on the
 * write side).
 */
export interface KaelArmDebugSide {
  shoulderWorldPos: THREE.Vector3;
  elbowWorldPos: THREE.Vector3;
  handWorldPos: THREE.Vector3;
  targetWorldPos: THREE.Vector3;
  poleWorldDir: THREE.Vector3;
  /**
   * Hand-basis calibration readouts (Step 6F) — published by `solveSide`
   * every frame, AFTER the hand bone's world quaternion has actually been
   * applied (never derived from an intermediate/pre-write value), per the
   * brief's explicit "measured after all bone matrices are updated"
   * requirement. `handWorldQuat` is the ACTUAL resulting hand bone world
   * orientation; combined with the canonical basis (X=finger-forward,
   * Y=thumb-side, Z=palm-normal) it lets `KaelArmIkDebug`'s axis markers
   * show exactly which way the solved hand THINKS its grip axes point,
   * independent of whether that happens to look visually correct.
   */
  handWorldQuat: THREE.Quaternion;
  /**
   * World-space canonical grip-basis axes (Step 6F), derived from the
   * ACTUAL solved hand bone orientation combined with this side's
   * (measured + tuner-adjusted) `handBasisCorrection` — i.e. "given where
   * the hand bone really ended up, where does IT think finger-forward/
   * thumb-side/palm-normal point in world space." Unit-length direction
   * vectors, not positions — `KaelArmIkDebug` draws them as short line
   * segments from `handWorldPos`. This is the direct visual answer to
   * "is the wrist just rotated wrong" vs. "is the wrist in the wrong
   * place" that Step 6F's calibration stages need to distinguish.
   */
  palmForwardWorldDir: THREE.Vector3;
  thumbSideWorldDir: THREE.Vector3;
  palmNormalWorldDir: THREE.Vector3;
  /** Distance from the RAW (pre-reach-clamp) grip target to the actual solved hand-bone world position, in meters. The decisive Stage-B number: per the brief's own decision rule, >1cm here means the solve itself needs fixing; ≤1cm means only basis/finger calibration remains. */
  positionErrorM: number;
  /** Angle (radians) between the intended hand world quaternion (grip target re-expressed in this hand's measured+tuned basis) and the ACTUAL resulting hand bone world quaternion. Near-zero at rotationWeight=1 proves the rotation-blend math itself is correct — it does NOT prove the hand LOOKS right, since a wrong `handBasisCorrection` value would make both quaternions equally, consistently wrong together. */
  rotationErrorRad: number;
  /** The raw per-frame IK weight this side was solved with (0..1) — smoothed gameplay weight × tuner override, whichever was actually passed to `solveSide`. */
  ikWeight: number;
  /** True if the raw target was farther than `maxReachRatio * (upperLength+lowerLength)` and had to be pulled in — explains a nonzero `positionErrorM` that is NOT a solver bug. */
  reachClamped: boolean;
  /**
   * Live reach diagnostics (Step 6G) — published every frame so the tuner
   * panel can show exactly why a target is (or isn't) reachable, per the
   * brief's explicit request: shoulder/target world positions, chain
   * lengths, the effective max-reach threshold, and the exact deficit in
   * meters (matches `positionErrorM` whenever `reachClamped` is true and
   * `positionWeight`/`rotationWeight` are both 1 — confirmed by a
   * dedicated test).
   */
  shoulderToTargetM: number;
  upperLengthM: number;
  lowerLengthM: number;
  totalChainLengthM: number;
  maxReachRatio: number;
  effectiveMaxReachM: number;
  /** `shoulderToTargetM - effectiveMaxReachM` — positive means the raw target is beyond reach (matches `reachClamped`), negative means comfortable slack. */
  reachDeficitM: number;
  /** Resolved bone names for this side, for the "confirm the left chain uses the correct bones" diagnostic — `shoulderBoneName` is `null` when this rig has no separate clavicle/shoulder bone (falls back to `upperArm` as the IK root, see `kaelArmRig.ts`). */
  shoulderBoneName: string | null;
  upperArmBoneName: string;
}

/** Exported so tests (`kaelArmSolve.test.ts`) can build a conforming `KaelArmDebugSide` without duplicating this field list — a hand-rolled test literal would silently go stale (TS would only catch missing NEW fields, not celebrate that it caught them). */
export function makeSide(): KaelArmDebugSide {
  return {
    shoulderWorldPos: new THREE.Vector3(),
    elbowWorldPos: new THREE.Vector3(),
    handWorldPos: new THREE.Vector3(),
    targetWorldPos: new THREE.Vector3(),
    poleWorldDir: new THREE.Vector3(),
    handWorldQuat: new THREE.Quaternion(),
    palmForwardWorldDir: new THREE.Vector3(1, 0, 0),
    thumbSideWorldDir: new THREE.Vector3(0, 1, 0),
    palmNormalWorldDir: new THREE.Vector3(0, 0, 1),
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
  };
}

/**
 * True deformed-mesh bounds stats (Step 6D, 2026-07-22) — published by
 * `ArmBoundingBoxHelper` (`KaelArmIkDebug.tsx`) using
 * `computeDeformedSkinnedBounds` (actual `applyBoneTransform`-based
 * vertex bounds, NOT `Box3.setFromObject`'s static bind-pose geometry,
 * which a headless investigation confirmed reports an IDENTICAL box
 * regardless of IK weight — it never reflected the deformed pose at all).
 * `null` when the diagnostic isn't active/no mesh found, per the same
 * plain-mutable-singleton convention as the rest of this file.
 */
export interface KaelArmBoundsDebugStats {
  sizeM: readonly [number, number, number];
  minM: readonly [number, number, number];
  maxM: readonly [number, number, number];
  nearestVertexDistM: number;
  farthestVertexDistM: number;
  meshCount: number;
  finite: boolean;
}

export const kaelArmDebugState: { right: KaelArmDebugSide; left: KaelArmDebugSide; ready: boolean; bounds: KaelArmBoundsDebugStats | null } = {
  right: makeSide(),
  left: makeSide(),
  ready: false,
  bounds: null,
};
