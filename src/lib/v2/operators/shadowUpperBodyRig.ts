import * as THREE from 'three';
import { clampTargetToMaxReach, solveTwoBoneIk } from '@/lib/v2/operators/ik/twoBoneIk';
import { MissingCriticalBoneError, normalizeBoneName, resolveKaelArmBones, type ArmRestMetrics, type ResolvedArmBones, type ResolvedSideBones } from '@/lib/v2/operators/kaelArmRig';
import { buildSideRuntimeState, isDev, isFiniteQuaternion, isFiniteVector3, restoreRestPose, warnOnce, type SideRuntimeState } from '@/lib/v2/operators/kaelArmSolve';
import { SHADOW_ARM_IK_CONFIG } from '@/lib/v2/operators/shadowArmIkConfig';
import type { ShadowArmDebugSide } from '@/lib/v2/operators/shadowArmDebugState';

/**
 * Shadow upper-body rig — bone resolution, rest-pose measurement, and the
 * per-frame world-space two-bone IK solve for the Step 8E-B/8E-C shadow
 * prototype's arms, PLUS (Step 8E-C.1) a genuine cascading chest-aim frame
 * that the arms now solve AFTER, from the chest's own live (rotated)
 * shoulder positions (Milestone 8).
 *
 * STEP 8E-C.1 CORRECTION: Step 8E-C's own reach-deficit fix (a single fixed
 * per-side shoulder-assist constant) only held to the brief's ≤2cm target
 * from roughly pitch≈30° onward — a real pitch sweep found the deficit
 * actually GROWS as the player looks more level (0° pitch: ~5cm right /
 * ~17cm left), because the shoulder was yaw-only/pitch-invariant by design
 * while the weapon swings through its own full camera-pitch arc. This pass
 * adds two coordinated mechanisms, per the correction brief: (1) a real,
 * cascading Spine->Spine1->Spine2 chest-aim rotation the arms solve AFTER
 * (not a hidden position hack), and (2) a per-side, PITCH-AWARE, BOUNDED,
 * SMOOTHED shoulder assist (replacing the old fixed constant) for whatever
 * residual gap the chest lean doesn't close. See `docs/decisions.md`'s Step
 * 8E-C.1 entries for the measured geometry that determined BOTH mechanisms'
 * response curves are strongest at LOW pitch and relax toward zero as pitch
 * increases — the opposite of a naive "chest tilts down as you look down"
 * assumption, confirmed by measurement rather than assumed.
 *
 * REUSE, NOT REINVENTION: `resolveKaelArmBones`, `measureArmRestMetrics`
 * (via `buildSideRuntimeState`), `SideRuntimeState`, `restoreRestPose`, and
 * the underlying `solveTwoBoneIk` math are all already generic — they take
 * a skeleton root / container / bone-resolution result and have no
 * dependency on the VISIBLE arms rig's specific config or debug state. This
 * module imports and reuses all of them directly rather than duplicating
 * bone-resolution or rest-metrics logic. What genuinely differs — and is
 * therefore new code here — is: (1) the config source
 * (`shadowArmIkConfig.ts`, never `firstPersonArmIkConfig.ts`), (2) the
 * debug-state shape (`ShadowArmDebugSide`, never `KaelArmDebugSide`), (3)
 * no finger posing (the shadow silhouette doesn't need it and the brief's
 * bone list doesn't include finger chains), and (4) the reference frame for
 * arm rest-metrics is now the CHEST BONE (Step 8E-C.1 — see
 * `buildShadowArmRuntime`'s own doc comment), which is itself WORLD-
 * ANCHORED via the yaw-only root container (the shadow body's own root,
 * positioned at the physical player location — see `shadowBodyTransform.ts`),
 * not camera-relative like the visible arms-only rig's container — which is
 * precisely why NONE of `KaelFirstPersonArms.tsx`'s `recenterArmMetrics`
 * anchor-shifting hack is needed here: `operator-kael.lod1.glb` (the
 * full-body GLB this rig measures against) is already authored in the same
 * "feet at origin" character space the shadow container's own convention
 * expects, matching `lowerBodyRig.ts`'s equally hack-free leg rig for the
 * same reason.
 */

// ---------------------------------------------------------------------------
// Spine chain resolution + rest measurement
// ---------------------------------------------------------------------------

export interface ResolvedShadowSpineBones {
  hips: THREE.Bone;
  spine: THREE.Bone | null;
  spine1: THREE.Bone | null;
  spine2: THREE.Bone | null;
}

export class MissingShadowSpineHipsError extends Error {
  constructor() {
    super('Shadow upper-body rig: required "hips" bone not found on the loaded skeleton.');
    this.name = 'MissingShadowSpineHipsError';
  }
}

/**
 * Resolves the spine chain (Hips required as the chain root reference;
 * Spine/Spine1/Spine2 all optional — a rig with only one authored spine
 * bone still gets a (smaller) assist rather than none at all). Independent
 * of `lowerBodyRig.ts`'s own `resolveLowerBodyBones` (which also resolves
 * Hips, for a different purpose — leg posing) — this module does not import
 * or depend on that one's runtime state, only on the shared
 * `normalizeBoneName` convention both already use.
 */
export function resolveShadowSpineBones(root: THREE.Object3D): ResolvedShadowSpineBones {
  const byNormalizedName = new Map<string, THREE.Bone>();
  root.traverse((node) => {
    if ((node as THREE.Bone).isBone) {
      const key = normalizeBoneName(node.name);
      if (!byNormalizedName.has(key)) byNormalizedName.set(key, node as THREE.Bone);
    }
  });
  const hips = byNormalizedName.get('hips') ?? byNormalizedName.get('pelvis');
  if (!hips) throw new MissingShadowSpineHipsError();
  return {
    hips,
    spine: byNormalizedName.get('spine') ?? null,
    spine1: byNormalizedName.get('spine1') ?? null,
    spine2: byNormalizedName.get('spine2') ?? null,
  };
}

/**
 * STEP 8E-C.1 REWORK: the spine chain is now a genuine CASCADING multi-bone
 * chain (Spine -> Spine1 -> Spine2, each carrying a fraction of the total
 * aim-pitch budget) rather than a single bone getting a small, mostly-
 * decorative lean. Each bone's rotation ACCUMULATES on top of its own
 * parent's already-applied rotation this same frame — the opposite of
 * `lowerBodyRig.ts`'s leg-swing technique, which deliberately CANCELS the
 * parent's live rotation (so a leg's world pose is pelvis-sway-independent).
 * Here we want the reverse: spine1 should visibly ride along with spine's
 * lean, and spine2 (the chest, the shoulders' actual parent bone) should
 * ride along with both — a real, connected torso curve, not three
 * independent twitches. See `docs/decisions.md`'s Step 8E-C.1 entry for the
 * full reasoning on why "cascading" (not "cancelling") is the correct
 * choice for THIS chain specifically.
 */

export interface SpineChainBoneRuntime {
  bone: THREE.Bone;
  /** This bone's share (0..1) of the total chest-aim pitch budget — the per-chain weights sum to 1 across whichever spine bones actually resolved. */
  weight: number;
  restLocalQuat: THREE.Quaternion;
  /** `parentWorldQuatInverse(at rest) * boneWorldQuat(at rest)` — recomposed every frame with the parent's CURRENT (possibly just-rotated-this-frame) world quaternion, so this bone's rotation genuinely cascades on top of its parent's. */
  restQuatParentRelative: THREE.Quaternion;
}

export interface SpineChainRuntime {
  /** PARENT-TO-CHILD order (Spine, then Spine1, then Spine2) — application order matters, see `applyChestAimFrame`'s doc comment. */
  bones: SpineChainBoneRuntime[];
  /** The deepest resolved spine bone — the shoulders' actual parent in the real skeleton, and therefore the correct reference frame for `buildShadowArmRuntime` below. */
  chestBone: THREE.Bone;
}

/** Default per-bone pitch-budget distribution when all three spine bones resolve — front-loaded toward the chest (closest to the shoulders) so the visible bend reads as a chest/shoulder lean, not a lower-back kink. Redistributed proportionally (see `buildShadowSpineChainRuntime`) when fewer than three bones are present. */
const DEFAULT_SPINE_WEIGHTS: Readonly<Record<'spine' | 'spine1' | 'spine2', number>> = { spine: 0.15, spine1: 0.3, spine2: 0.55 };

function measureChainBoneRuntime(bone: THREE.Bone, weight: number): SpineChainBoneRuntime {
  const parentWorldQuat = new THREE.Quaternion();
  bone.parent!.getWorldQuaternion(parentWorldQuat);
  const boneWorldQuat = new THREE.Quaternion();
  bone.getWorldQuaternion(boneWorldQuat);
  return {
    bone,
    weight,
    restLocalQuat: bone.quaternion.clone(),
    restQuatParentRelative: parentWorldQuat.clone().invert().multiply(boneWorldQuat),
  };
}

/**
 * Builds the cascading spine-chain runtime from whichever of spine/spine1/
 * spine2 actually resolved (at least one is required — returns `null`
 * otherwise, same graceful-degrade contract as the old single-bone version).
 * Weights are proportionally redistributed among the bones that exist, so a
 * rig with only `spine2` still gets the FULL pitch budget on that one bone
 * rather than only 55% of it.
 */
export function buildShadowSpineChainRuntime(bones: ResolvedShadowSpineBones): SpineChainRuntime | null {
  const present: Array<{ key: 'spine' | 'spine1' | 'spine2'; bone: THREE.Bone }> = [];
  if (bones.spine) present.push({ key: 'spine', bone: bones.spine });
  if (bones.spine1) present.push({ key: 'spine1', bone: bones.spine1 });
  if (bones.spine2) present.push({ key: 'spine2', bone: bones.spine2 });
  if (present.length === 0) return null;

  const weightSum = present.reduce((sum, p) => sum + DEFAULT_SPINE_WEIGHTS[p.key], 0);
  const chainBones = present.map((p) => measureChainBoneRuntime(p.bone, DEFAULT_SPINE_WEIGHTS[p.key] / weightSum));
  return { bones: chainBones, chestBone: present[present.length - 1].bone };
}

const CHEST_RIGHT_AXIS_LOCAL = new THREE.Vector3(1, 0, 0);

export interface ChestAimScratch {
  rightAxisWorld: THREE.Vector3;
  pitchQuat: THREE.Quaternion;
  desiredWorldQuat: THREE.Quaternion;
  parentWorldQuat: THREE.Quaternion;
}

export function createChestAimScratch(): ChestAimScratch {
  return {
    rightAxisWorld: new THREE.Vector3(),
    pitchQuat: new THREE.Quaternion(),
    desiredWorldQuat: new THREE.Quaternion(),
    parentWorldQuat: new THREE.Quaternion(),
  };
}

/**
 * Applies the cascading chest-aim pitch — MUST be called in parent-to-child
 * order (the array is already built that way by `buildShadowSpineChainRuntime`).
 * Each bone reads its ACTUAL LIVE parent world quaternion (self-correcting
 * via `getWorldQuaternion`, same established property this whole codebase
 * already relies on — verified by a dedicated test below), so a bone
 * processed after an earlier sibling's parent has already been rotated
 * this same frame correctly cascades on top of it.
 *
 * `totalPitchRad` is this frame's full chest-aim pitch (already computed by
 * the caller from `extractAimPitchFromWeaponQuaternion` and whatever
 * pitch-response curve applies — see `KaelFirstPersonShadowBody.tsx` and
 * `docs/decisions.md`'s Step 8E-C.1 entry for why the RESPONSE curve is NOT
 * simply "more lean at higher pitch": the measured reach deficit is LARGEST
 * at pitch≈0 and shrinks toward pitch≈45°, so the chest-lean response is
 * strongest at low pitch and relaxes as pitch increases — the opposite of a
 * naive "chest tilts down as you look down" assumption). This function
 * itself has no opinion on that curve — it just applies whatever
 * `totalPitchRad` it's given, distributed by each bone's own weight.
 *
 * SIGN CONVENTION (verified empirically, not just derived — an earlier
 * version of this function had this backwards, caught by a real-browser
 * measurement showing the shoulder moving AWAY from the target after the
 * "corrective" lean, not toward it): POSITIVE `totalPitchRad` produces a
 * FORWARD/DOWN chest lean — matching `shadowAimFrame.ts`'s own "positive
 * aim-pitch = looking down" convention, so a caller can reason about both
 * quantities the same way. Rotating a world-space `-Z` forward vector by a
 * POSITIVE angle around world `+X` (right) actually tips it toward `+Y`
 * (up) by the right-hand rule — the OPPOSITE of a forward lean — so this
 * function negates the angle internally before building the axis-angle
 * quaternion. See `shadowUpperBodyRig.test.ts`'s dedicated sign-convention
 * test for the numeric proof.
 */
export function applyChestAimFrame(chain: SpineChainRuntime, containerWorldQuat: THREE.Quaternion, totalPitchRad: number, scratch: ChestAimScratch): void {
  scratch.rightAxisWorld.copy(CHEST_RIGHT_AXIS_LOCAL).applyQuaternion(containerWorldQuat);
  const correctedTotalPitchRad = -totalPitchRad;
  for (const boneRuntime of chain.bones) {
    const pitchRad = correctedTotalPitchRad * boneRuntime.weight;
    scratch.pitchQuat.setFromAxisAngle(scratch.rightAxisWorld, pitchRad);

    boneRuntime.bone.parent!.getWorldQuaternion(scratch.parentWorldQuat);
    scratch.desiredWorldQuat.copy(scratch.parentWorldQuat).multiply(boneRuntime.restQuatParentRelative);
    scratch.desiredWorldQuat.premultiply(scratch.pitchQuat);

    boneRuntime.bone.quaternion.copy(scratch.parentWorldQuat).invert().multiply(scratch.desiredWorldQuat);
  }
}

/** Hard, unconditional rest-pose restore for the whole chain — same "disabled always means byte-identical to rest" contract as `restoreLowerBodyRestPose`/`restoreRestPose`. */
export function restoreChestAimFrame(chain: SpineChainRuntime): void {
  for (const boneRuntime of chain.bones) boneRuntime.bone.quaternion.copy(boneRuntime.restLocalQuat);
}

// ---------------------------------------------------------------------------
// Arm resolution + rest metrics — thin re-exports for call-site convenience
// ---------------------------------------------------------------------------

export { resolveKaelArmBones, restoreRestPose, MissingCriticalBoneError };
export type { ArmRestMetrics, ResolvedArmBones, ResolvedSideBones, SideRuntimeState };

const preAssistWorldPosScratch = new THREE.Vector3();

/**
 * Reads this side's shoulder world position with NO assist applied (resets
 * `bones.shoulder` to its captured rest position first) — the caller uses
 * this to measure the RAW reach deficit (before deciding how much dynamic
 * assist, if any, to apply this frame) without duplicating
 * `solveShadowArmSide`'s own internal shoulder-positioning logic. Leaves
 * the shoulder bone at this reset (no-assist) position — harmless, since
 * `solveShadowArmSide` unconditionally resets it again to the same rest
 * position before applying whatever assist the caller ultimately computes.
 * Returns a STABLE reference (`preAssistWorldPosScratch`) — copy it if the
 * caller needs to hold the value past the next call.
 */
export function measureShoulderRestWorldPosition(side: SideRuntimeState, chestBone: THREE.Object3D): THREE.Vector3 {
  const { bones } = side;
  if (bones.shoulder && side.restShoulderLocalPos) {
    bones.shoulder.position.copy(side.restShoulderLocalPos);
    bones.shoulder.updateMatrixWorld(true);
    bones.upperArm.getWorldPosition(preAssistWorldPosScratch);
  } else {
    chestBone.updateWorldMatrix(true, false);
    preAssistWorldPosScratch.copy(side.metrics.shoulderLocalPos).applyMatrix4(chestBone.matrixWorld);
  }
  return preAssistWorldPosScratch;
}

/**
 * `chestBone` (NOT the root container — see the module doc comment's point
 * 4, now sharpened by Step 8E-C.1) is the reference frame rest metrics are
 * measured against. This matters now more than it did in Step 8E-C: the
 * chest bone genuinely rotates independently every frame (the new aim-pitch
 * cascade above), so the arm rig's own rest-relative-to-parent math
 * (`measureArmRestMetrics`, already generic — accepts ANY Object3D) must
 * track the chest's LIVE orientation, not the yaw-only root's, or the arms
 * would solve from a stale pre-aim-pitch shoulder frame — precisely the
 * "solving against stale shoulder positions" failure mode this correction
 * pass exists to fix. Call this once, at mount, BEFORE any chest-aim
 * rotation has ever been applied (chest must still be at its authored rest
 * orientation), exactly like every other rest-metrics measurement in this
 * codebase.
 */
export function buildShadowArmRuntime(chestBone: THREE.Object3D, bones: ResolvedArmBones): { left: SideRuntimeState; right: SideRuntimeState } {
  return {
    left: buildSideRuntimeState(chestBone, bones.left),
    right: buildSideRuntimeState(chestBone, bones.right),
  };
}

// ---------------------------------------------------------------------------
// Per-side world-space two-bone IK solve (no finger posing)
// ---------------------------------------------------------------------------

export interface ShadowArmTuning {
  handBasisAdjustQuat?: THREE.Quaternion;
  rotationWeight?: number;
  shoulderAssistLocal?: THREE.Vector3;
}

const shoulderAssistWorldScratch = new THREE.Vector3();
const shoulderParentWorldQuatScratch = new THREE.Quaternion();
const effectiveBasisCorrectionScratch = new THREE.Quaternion();
const deltaQuatScratch = new THREE.Quaternion();
const handWorldQuatScratch = new THREE.Quaternion();
const actualHandWorldQuatScratch = new THREE.Quaternion();
const actualGripWorldQuatScratch = new THREE.Quaternion();

/**
 * Solves and applies world-space two-bone IK for one shadow arm — mirrors
 * `kaelArmSolve.ts`'s `solveSide` structure (measure shoulder world
 * position with optional assist, clamp target to max reach, delegate to
 * `solveTwoBoneIk`, convert world quaternions to local, align the hand via
 * its measured basis correction) but sourced from `SHADOW_ARM_IK_CONFIG`
 * (never `FIRST_PERSON_ARM_IK_CONFIG`), written into a `ShadowArmDebugSide`
 * (never `KaelArmDebugSide`), and with no finger-curl step at all. Returns
 * `false` (and leaves the previous frame's bone rotations in place) on a
 * non-finite result, same fail-soft contract as the visible rig.
 */
export function solveShadowArmSide(
  side: SideRuntimeState,
  container: THREE.Object3D,
  containerWorldQuat: THREE.Quaternion,
  targetWorldPos: THREE.Vector3,
  targetWorldQuat: THREE.Quaternion,
  poleLocalDir: readonly [number, number, number],
  weight: number,
  debugOut: ShadowArmDebugSide,
  tuning?: ShadowArmTuning,
): boolean {
  const { metrics, bones, ikOutput, scratch } = side;
  const config = SHADOW_ARM_IK_CONFIG;

  if (bones.shoulder && side.restShoulderLocalPos) {
    bones.shoulder.position.copy(side.restShoulderLocalPos);
    if (tuning?.shoulderAssistLocal) {
      shoulderAssistWorldScratch.copy(tuning.shoulderAssistLocal).applyQuaternion(containerWorldQuat);
      bones.shoulder.parent!.getWorldQuaternion(shoulderParentWorldQuatScratch);
      shoulderAssistWorldScratch.applyQuaternion(shoulderParentWorldQuatScratch.invert());
      bones.shoulder.position.add(shoulderAssistWorldScratch);
    }
    bones.shoulder.updateMatrixWorld(true);
    bones.upperArm.getWorldPosition(side.shoulderWorldPos);
  } else {
    if (tuning?.shoulderAssistLocal && !bones.shoulder) {
      warnOnce('shadow-shoulder-assist-no-bone', 'shoulderAssistLocal set but this shadow-rig side has no resolved shoulder bone — assist ignored.');
    }
    side.shoulderWorldPos.copy(metrics.shoulderLocalPos).applyMatrix4(container.matrixWorld);
  }
  side.restUpperDirWorld.copy(metrics.restUpperDir).applyQuaternion(containerWorldQuat).normalize();
  side.restLowerDirWorld.copy(metrics.restLowerDir).applyQuaternion(containerWorldQuat).normalize();
  side.restUpperQuatWorld.copy(containerWorldQuat).multiply(metrics.restUpperQuat);
  side.restLowerQuatWorld.copy(containerWorldQuat).multiply(metrics.restLowerQuat);
  side.poleWorldDir.set(poleLocalDir[0], poleLocalDir[1], poleLocalDir[2]).applyQuaternion(containerWorldQuat);

  const maxLen = (metrics.upperLength + metrics.lowerLength) * config.maxReachRatio;
  clampTargetToMaxReach(side.shoulderWorldPos, targetWorldPos, maxLen, side.clampedTarget);

  debugOut.shoulderToTargetM = side.shoulderWorldPos.distanceTo(targetWorldPos);
  debugOut.upperLengthM = metrics.upperLength;
  debugOut.lowerLengthM = metrics.lowerLength;
  debugOut.totalChainLengthM = metrics.upperLength + metrics.lowerLength;
  debugOut.maxReachRatio = config.maxReachRatio;
  debugOut.effectiveMaxReachM = maxLen;
  debugOut.reachDeficitM = debugOut.shoulderToTargetM - maxLen;
  debugOut.shoulderBoneName = bones.shoulder ? bones.shoulder.name : null;
  debugOut.upperArmBoneName = bones.upperArm.name;

  solveTwoBoneIk(
    {
      rootPosition: side.shoulderWorldPos,
      targetPosition: side.clampedTarget,
      pole: side.poleWorldDir,
      poleIsDirection: true,
      upperLength: metrics.upperLength,
      lowerLength: metrics.lowerLength,
      restUpperQuat: side.restUpperQuatWorld,
      restLowerQuat: side.restLowerQuatWorld,
      restUpperDir: side.restUpperDirWorld,
      restLowerDir: side.restLowerDirWorld,
      weight: weight * config.positionWeight,
    },
    ikOutput,
    scratch,
  );

  if (!isFiniteQuaternion(ikOutput.upperQuat) || !isFiniteQuaternion(ikOutput.lowerQuat) || !isFiniteVector3(ikOutput.elbowPosition) || !isFiniteVector3(ikOutput.handPosition)) {
    warnOnce('shadow-non-finite-ik', 'Shadow arm IK solve produced a non-finite result — leaving this arm at its previous pose this frame.');
    debugOut.finite = false;
    return false;
  }
  debugOut.finite = true;

  bones.upperArm.parent!.getWorldQuaternion(side.parentWorldQuat);
  bones.upperArm.quaternion.copy(side.parentWorldQuat).invert().multiply(ikOutput.upperQuat);
  bones.lowerArm.quaternion.copy(ikOutput.upperQuat).invert().multiply(ikOutput.lowerQuat);

  const effectiveBasisCorrection = tuning?.handBasisAdjustQuat
    ? effectiveBasisCorrectionScratch.copy(metrics.handBasisCorrection).multiply(tuning.handBasisAdjustQuat)
    : effectiveBasisCorrectionScratch.copy(metrics.handBasisCorrection);
  handWorldQuatScratch.copy(targetWorldQuat).multiply(deltaQuatScratch.copy(effectiveBasisCorrection).invert());
  const localHandQuat = deltaQuatScratch.copy(ikOutput.lowerQuat).invert().multiply(handWorldQuatScratch);

  const rotationWeight = weight * (tuning?.rotationWeight ?? config.rotationWeight);
  if (!isFiniteQuaternion(localHandQuat)) {
    warnOnce('shadow-non-finite-hand', 'Shadow hand IK alignment produced a non-finite result — leaving hand rotation unchanged this frame.');
  } else {
    bones.hand.quaternion.copy(side.restHandLocalQuat).slerp(localHandQuat, rotationWeight);
  }

  debugOut.shoulderWorldPos.copy(side.shoulderWorldPos);
  debugOut.elbowWorldPos.copy(ikOutput.elbowPosition);
  debugOut.handWorldPos.copy(ikOutput.handPosition);
  debugOut.targetWorldPos.copy(targetWorldPos);
  debugOut.poleWorldDir.copy(side.poleWorldDir);

  bones.hand.getWorldQuaternion(actualHandWorldQuatScratch);
  debugOut.handWorldQuat.copy(actualHandWorldQuatScratch);
  debugOut.positionErrorM = ikOutput.handPosition.distanceTo(targetWorldPos);
  // STEP 8E-C.1 FIX: this is now a GENUINE angular error, not a tautology.
  // The old version compared `actualHandWorldQuat` against
  // `handWorldQuatScratch` — but `handWorldQuatScratch` was ITSELF derived
  // from `targetWorldQuat * effectiveBasisCorrection^-1` earlier in this
  // same function, and `actualHandWorldQuat` is (at rotationWeight=1) the
  // bone actually being set to that same value — so the two were always
  // going to agree, reporting ~0° regardless of whether the hand basis
  // correction or rotation weight were any good. This composes the ACTUAL
  // resulting hand bone orientation with the FIXED, MEASURED (never
  // `tuning`-adjusted) `metrics.handBasisCorrection` to get what the real
  // skeleton's grip-anchor axes actually point at, then compares THAT
  // against the raw intended `targetWorldQuat` directly — the same
  // "use the FIXED correction, not the tunable one, or a bad tuning value
  // can never show up" reasoning `kaelArmSolve.ts`'s own
  // `palmForwardWorldDir`/etc. diagnostics already established for the
  // visible rig. This value moves when `handBasisAdjustDeg` or
  // `rotationWeight` are wrong; the old one structurally could not.
  actualGripWorldQuatScratch.copy(actualHandWorldQuatScratch).multiply(metrics.handBasisCorrection);
  debugOut.rotationErrorRad = targetWorldQuat.angleTo(actualGripWorldQuatScratch);
  debugOut.ikWeight = weight;
  debugOut.reachClamped = side.clampedTarget.distanceTo(targetWorldPos) > 1e-4;

  return true;
}

export { isDev };
