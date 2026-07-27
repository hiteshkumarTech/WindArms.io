import * as THREE from 'three';
import { normalizeBoneName } from '@/lib/v2/operators/kaelArmRig';
import type { LowerBodyLocomotionPose } from '@/lib/v2/operators/lowerBodyLocomotionPose';

/**
 * Kael lower-body bone resolution + procedural bone application (Milestone
 * 8, Step 8D). Reuses `normalizeBoneName` from `kaelArmRig.ts` (same
 * prefix-strip/case-fold rule, same skeleton, same exporter — no reason to
 * duplicate it) but is otherwise a separate module: the arm rig solves
 * two-bone IK toward a world-space target; this rig applies small additive
 * SWING offsets on top of a validated rest pose, which is a different
 * enough problem to warrant its own file rather than bolting leg support
 * onto the arm solver.
 *
 * WORLD-AXIS SWING, NOT BONE-LOCAL EULER: every bone here is posed by
 * computing its desired WORLD orientation — the bone's own measured rest
 * orientation (re-expressed at the container's CURRENT yaw), further
 * rotated by a small angle around the CHARACTER's world-space local-right/
 * local-forward axes (computed fresh each frame from the container's live
 * world quaternion) — and only converting to a bone-local quaternion as
 * the very last step. This is deliberate: it sidesteps ever needing to
 * know or guess this asset's own per-bone local axis convention (which
 * Mixamo/Blender-exported rigs do not guarantee is consistent across
 * bones), the exact failure mode that would otherwise risk a knee bending
 * sideways or a leg swinging backward. Same technique
 * `kaelArmRig.ts`/`kaelArmSolve.ts` already use for the arm chain (rest
 * quaternion measured container-relative once, recomposed with the live
 * container orientation every frame) — see `ArmRestMetrics`'s doc comment
 * for the same idea applied to two-bone IK instead of additive swing.
 *
 * `Object3D.getWorldQuaternion` calls `updateWorldMatrix(true, false)` on
 * itself before reading (verified in `kaelArmSolve.ts`'s doc comment for
 * this same skeleton/rig family) — so reading a bone's parent's world
 * quaternion AFTER an earlier sibling bone in the same chain has already
 * had its local quaternion written THIS frame correctly picks up that
 * fresh value, with no manual quaternion-passing needed between bones.
 * Bones are therefore applied in strict parent-to-child order below
 * (Hips -> UpperLeg -> Leg -> Foot) and each step is a plain scene-graph
 * read, not an optimization-driven manual composition.
 */

export interface ResolvedLowerBodyBones {
  hips: THREE.Bone;
  leftUpLeg: THREE.Bone;
  leftLeg: THREE.Bone;
  leftFoot: THREE.Bone;
  rightUpLeg: THREE.Bone;
  rightLeg: THREE.Bone;
  rightFoot: THREE.Bone;
}

const REQUIRED_BONE_CANDIDATES: Record<keyof ResolvedLowerBodyBones, string[]> = {
  hips: ['hips', 'pelvis'],
  leftUpLeg: ['leftupleg', 'leftthigh'],
  leftLeg: ['leftleg', 'leftcalf'],
  leftFoot: ['leftfoot'],
  rightUpLeg: ['rightupleg', 'rightthigh'],
  rightLeg: ['rightleg', 'rightcalf'],
  rightFoot: ['rightfoot'],
};

export class MissingLowerBodyBoneError extends Error {
  constructor(public readonly boneKey: keyof ResolvedLowerBodyBones) {
    super(`Kael FP-lowerbody: required bone "${boneKey}" not found on the loaded skeleton.`);
    this.name = 'MissingLowerBodyBoneError';
  }
}

/** Resolves the 7 required bones against a loaded skeleton root. Throws `MissingLowerBodyBoneError` for ANY missing bone — unlike the arms rig (where a missing shoulder is tolerated), every bone here is load-bearing for this pass's swing math, so there is no partial-success mode. Caller (`KaelFirstPersonLowerBody.tsx`) resolves this inside the same error boundary that already guards asset loading — a resolution failure omits the whole lower body, never crashes the scene. */
export function resolveLowerBodyBones(root: THREE.Object3D): ResolvedLowerBodyBones {
  const byNormalizedName = new Map<string, THREE.Bone>();
  root.traverse((node) => {
    if ((node as THREE.Bone).isBone) {
      const key = normalizeBoneName(node.name);
      if (!byNormalizedName.has(key)) byNormalizedName.set(key, node as THREE.Bone);
    }
  });

  function resolve(key: keyof ResolvedLowerBodyBones): THREE.Bone {
    for (const candidate of REQUIRED_BONE_CANDIDATES[key]) {
      const found = byNormalizedName.get(candidate);
      if (found) return found;
    }
    throw new MissingLowerBodyBoneError(key);
  }

  return {
    hips: resolve('hips'),
    leftUpLeg: resolve('leftUpLeg'),
    leftLeg: resolve('leftLeg'),
    leftFoot: resolve('leftFoot'),
    rightUpLeg: resolve('rightUpLeg'),
    rightLeg: resolve('rightLeg'),
    rightFoot: resolve('rightFoot'),
  };
}

interface LowerBodyBoneRuntime {
  bone: THREE.Bone;
  /** The bone's own ORIGINAL local quaternion at measurement time — restored verbatim (never re-derived) when locomotion is disabled. */
  restLocalQuat: THREE.Quaternion;
  restLocalPosition: THREE.Vector3;
  /** Bone's world quaternion at measurement time, expressed relative to the container's world quaternion AT THAT SAME MOMENT — recomposing with the container's CURRENT world quaternion reproduces this bone's rest world orientation at the container's current yaw, regardless of what that yaw is now. */
  restQuatContainerRelative: THREE.Quaternion;
}

export interface LowerBodyRigRuntime {
  hips: LowerBodyBoneRuntime;
  leftUpLeg: LowerBodyBoneRuntime;
  leftLeg: LowerBodyBoneRuntime;
  leftFoot: LowerBodyBoneRuntime;
  rightUpLeg: LowerBodyBoneRuntime;
  rightLeg: LowerBodyBoneRuntime;
  rightFoot: LowerBodyBoneRuntime;
}

function measureBoneRuntime(bone: THREE.Bone, containerWorldQuatInverse: THREE.Quaternion): LowerBodyBoneRuntime {
  const boneWorldQuat = new THREE.Quaternion();
  bone.getWorldQuaternion(boneWorldQuat);
  return {
    bone,
    restLocalQuat: bone.quaternion.clone(),
    restLocalPosition: bone.position.clone(),
    restQuatContainerRelative: containerWorldQuatInverse.clone().multiply(boneWorldQuat),
  };
}

/**
 * Measures every required bone's rest metrics ONCE — call immediately after
 * the skeleton is parented under `container` and BEFORE any procedural pose
 * has ever been applied (bones must still be in their authored rest pose).
 * Safe regardless of `container`'s current transform (works the same way
 * `measureArmRestMetrics` does — see that function's doc comment).
 */
export function buildLowerBodyRigRuntime(container: THREE.Object3D, bones: ResolvedLowerBodyBones): LowerBodyRigRuntime {
  container.updateWorldMatrix(true, true);
  const containerWorldQuat = new THREE.Quaternion();
  container.getWorldQuaternion(containerWorldQuat);
  const containerWorldQuatInverse = containerWorldQuat.clone().invert();
  return {
    hips: measureBoneRuntime(bones.hips, containerWorldQuatInverse),
    leftUpLeg: measureBoneRuntime(bones.leftUpLeg, containerWorldQuatInverse),
    leftLeg: measureBoneRuntime(bones.leftLeg, containerWorldQuatInverse),
    leftFoot: measureBoneRuntime(bones.leftFoot, containerWorldQuatInverse),
    rightUpLeg: measureBoneRuntime(bones.rightUpLeg, containerWorldQuatInverse),
    rightLeg: measureBoneRuntime(bones.rightLeg, containerWorldQuatInverse),
    rightFoot: measureBoneRuntime(bones.rightFoot, containerWorldQuatInverse),
  };
}

const RIGHT_AXIS_LOCAL = new THREE.Vector3(1, 0, 0);
const FORWARD_AXIS_LOCAL = new THREE.Vector3(0, 0, -1);

interface RigScratch {
  containerWorldQuat: THREE.Quaternion;
  rightAxisWorld: THREE.Vector3;
  forwardAxisWorld: THREE.Vector3;
  pitchQuat: THREE.Quaternion;
  rollQuat: THREE.Quaternion;
  offsetQuat: THREE.Quaternion;
  desiredWorldQuat: THREE.Quaternion;
  parentWorldQuat: THREE.Quaternion;
  localOffset: THREE.Vector3;
}

export function createLowerBodyRigScratch(): RigScratch {
  return {
    containerWorldQuat: new THREE.Quaternion(),
    rightAxisWorld: new THREE.Vector3(),
    forwardAxisWorld: new THREE.Vector3(),
    pitchQuat: new THREE.Quaternion(),
    rollQuat: new THREE.Quaternion(),
    offsetQuat: new THREE.Quaternion(),
    desiredWorldQuat: new THREE.Quaternion(),
    parentWorldQuat: new THREE.Quaternion(),
    localOffset: new THREE.Vector3(),
  };
}

/** Applies one bone's world-axis swing (see this module's doc comment) — no allocation, all scratch preallocated. */
function applyBoneSwing(runtime: LowerBodyBoneRuntime, containerWorldQuat: THREE.Quaternion, pitchRad: number, rollRad: number, scratch: RigScratch): void {
  scratch.rightAxisWorld.copy(RIGHT_AXIS_LOCAL).applyQuaternion(containerWorldQuat);
  scratch.forwardAxisWorld.copy(FORWARD_AXIS_LOCAL).applyQuaternion(containerWorldQuat);
  scratch.pitchQuat.setFromAxisAngle(scratch.rightAxisWorld, pitchRad);
  scratch.rollQuat.setFromAxisAngle(scratch.forwardAxisWorld, rollRad);
  scratch.offsetQuat.copy(scratch.rollQuat).multiply(scratch.pitchQuat);

  scratch.desiredWorldQuat.copy(containerWorldQuat).multiply(runtime.restQuatContainerRelative);
  scratch.desiredWorldQuat.premultiply(scratch.offsetQuat);

  runtime.bone.parent!.getWorldQuaternion(scratch.parentWorldQuat);
  runtime.bone.quaternion.copy(scratch.parentWorldQuat).invert().multiply(scratch.desiredWorldQuat);
}

/**
 * Applies one frame's full locomotion pose to the rig. `container` must be
 * the same object `buildLowerBodyRigRuntime` measured against (its world
 * quaternion is read fresh here, so this is correct even though the
 * container's position/rotation were just set earlier this same frame —
 * see `getWorldQuaternion`'s self-correcting property, this module's doc
 * comment). Every bone is reset to `restLocalQuat`/`restLocalPosition`
 * conceptually EVERY call (never accumulated from a previous frame's
 * already-modified value) — `pose`'s offsets are always applied relative to
 * the cached rest, so there is no cumulative drift by construction.
 */
export function applyLowerBodyLocomotionPose(rig: LowerBodyRigRuntime, container: THREE.Object3D, pose: LowerBodyLocomotionPose, scratch: RigScratch): void {
  container.getWorldQuaternion(scratch.containerWorldQuat);
  const cq = scratch.containerWorldQuat;

  applyBoneSwing(rig.hips, cq, pose.pelvisRotationEuler[0], pose.pelvisRotationEuler[2], scratch);
  scratch.localOffset.set(pose.pelvisPositionOffset[0], pose.pelvisPositionOffset[1], pose.pelvisPositionOffset[2]);
  rig.hips.bone.position.copy(rig.hips.restLocalPosition).add(scratch.localOffset);

  applyBoneSwing(rig.leftUpLeg, cq, pose.leftUpperLegRotation[0], 0, scratch);
  applyBoneSwing(rig.rightUpLeg, cq, pose.rightUpperLegRotation[0], 0, scratch);
  applyBoneSwing(rig.leftLeg, cq, pose.leftLowerLegRotation[0], 0, scratch);
  applyBoneSwing(rig.rightLeg, cq, pose.rightLowerLegRotation[0], 0, scratch);
  applyBoneSwing(rig.leftFoot, cq, pose.leftFootRotation[0], 0, scratch);
  applyBoneSwing(rig.rightFoot, cq, pose.rightFootRotation[0], 0, scratch);
}

/** Hard, unconditional rest-pose restore — bypasses all procedural posing entirely. Used when locomotion is disabled (dev toggle) so "disabled" always means byte-identical to the validated Step 8C/8C.1 static pose, never a residual offset. */
export function restoreLowerBodyRestPose(rig: LowerBodyRigRuntime): void {
  for (const key of ['hips', 'leftUpLeg', 'leftLeg', 'leftFoot', 'rightUpLeg', 'rightLeg', 'rightFoot'] as const) {
    const runtime = rig[key];
    runtime.bone.quaternion.copy(runtime.restLocalQuat);
    runtime.bone.position.copy(runtime.restLocalPosition);
  }
}
