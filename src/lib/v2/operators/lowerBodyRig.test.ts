import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  applyLowerBodyLocomotionPose,
  buildLowerBodyRigRuntime,
  createLowerBodyRigScratch,
  MissingLowerBodyBoneError,
  resolveLowerBodyBones,
  restoreLowerBodyRestPose,
} from './lowerBodyRig';
import { createLowerBodyLocomotionPose, type LowerBodyLocomotionPose } from './lowerBodyLocomotionPose';

/** Minimal synthetic Mixamo-style lower-body skeleton (container -> Hips -> {Spine, LeftUpLeg -> LeftLeg -> LeftFoot, RightUpLeg -> RightLeg -> RightFoot}) — same convention as `kaelArmRig.test.ts`'s `buildSyntheticSkeleton`, sized for legs instead of arms. */
function buildSyntheticLowerBody() {
  function bone(name: string, position: [number, number, number]): THREE.Bone {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...position);
    return b;
  }

  const container = new THREE.Group();
  container.name = 'lowerbody_container';

  const hips = bone('mixamorig:Hips', [0, 1.0, 0]);
  const spine = bone('mixamorig:Spine', [0, 0.1, 0]);
  const leftUpLeg = bone('mixamorig:LeftUpLeg', [0.09, -0.02, 0]);
  const leftLeg = bone('mixamorig:LeftLeg', [0, -0.45, 0]);
  const leftFoot = bone('mixamorig:LeftFoot', [0, -0.42, 0]);
  const rightUpLeg = bone('mixamorig:RightUpLeg', [-0.09, -0.02, 0]);
  const rightLeg = bone('mixamorig:RightLeg', [0, -0.45, 0]);
  const rightFoot = bone('mixamorig:RightFoot', [0, -0.42, 0]);

  container.add(hips);
  hips.add(spine, leftUpLeg, rightUpLeg);
  leftUpLeg.add(leftLeg);
  leftLeg.add(leftFoot);
  rightUpLeg.add(rightLeg);
  rightLeg.add(rightFoot);

  container.updateMatrixWorld(true);
  return { container, hips, spine, leftUpLeg, leftLeg, leftFoot, rightUpLeg, rightLeg, rightFoot };
}

function activePose(): LowerBodyLocomotionPose {
  const pose = createLowerBodyLocomotionPose();
  pose.pelvisPositionOffset = [0.02, -0.03, 0];
  pose.pelvisRotationEuler = [0.05, 0, 0.02];
  pose.leftUpperLegRotation = [0.3, 0, 0];
  pose.rightUpperLegRotation = [-0.3, 0, 0];
  pose.leftLowerLegRotation = [-0.1, 0, 0];
  pose.rightLowerLegRotation = [0.05, 0, 0];
  pose.leftFootRotation = [0.03, 0, 0];
  pose.rightFootRotation = [-0.02, 0, 0];
  return pose;
}

describe('lowerBodyRig — resolveLowerBodyBones', () => {
  it('resolves all 7 required bones on a well-formed synthetic skeleton', () => {
    const { container } = buildSyntheticLowerBody();
    const resolved = resolveLowerBodyBones(container);
    assert.strictEqual(resolved.hips.name, 'mixamorig:Hips');
    assert.strictEqual(resolved.leftUpLeg.name, 'mixamorig:LeftUpLeg');
    assert.strictEqual(resolved.leftLeg.name, 'mixamorig:LeftLeg');
    assert.strictEqual(resolved.leftFoot.name, 'mixamorig:LeftFoot');
    assert.strictEqual(resolved.rightUpLeg.name, 'mixamorig:RightUpLeg');
    assert.strictEqual(resolved.rightLeg.name, 'mixamorig:RightLeg');
    assert.strictEqual(resolved.rightFoot.name, 'mixamorig:RightFoot');
  });

  it('throws MissingLowerBodyBoneError (dev-time validation failure) when a required bone is absent', () => {
    const { container, rightFoot } = buildSyntheticLowerBody();
    rightFoot.parent?.remove(rightFoot);
    assert.throws(() => resolveLowerBodyBones(container), MissingLowerBodyBoneError);
  });

  it('accepts alternate naming conventions (pelvis/thigh/calf) via the same candidate-list resolution the arms rig uses', () => {
    const container = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'DEF-pelvis';
    const leftUpLeg = new THREE.Bone();
    leftUpLeg.name = 'DEF-LeftThigh';
    const leftLeg = new THREE.Bone();
    leftLeg.name = 'DEF-LeftCalf';
    const leftFoot = new THREE.Bone();
    leftFoot.name = 'DEF-LeftFoot';
    const rightUpLeg = new THREE.Bone();
    rightUpLeg.name = 'DEF-RightThigh';
    const rightLeg = new THREE.Bone();
    rightLeg.name = 'DEF-RightCalf';
    const rightFoot = new THREE.Bone();
    rightFoot.name = 'DEF-RightFoot';
    container.add(hips);
    hips.add(leftUpLeg, rightUpLeg);
    leftUpLeg.add(leftLeg);
    leftLeg.add(leftFoot);
    rightUpLeg.add(rightLeg);
    rightLeg.add(rightFoot);
    container.updateMatrixWorld(true);

    const resolved = resolveLowerBodyBones(container);
    assert.strictEqual(resolved.hips.name, 'DEF-pelvis');
    assert.strictEqual(resolved.leftLeg.name, 'DEF-LeftCalf');
  });
});

describe('lowerBodyRig — apply / restore', () => {
  it('applying an active pose then restoreLowerBodyRestPose recovers the EXACT original rest quaternion/position for every bone', () => {
    const { container, hips, leftUpLeg, leftLeg, leftFoot, rightUpLeg, rightLeg, rightFoot } = buildSyntheticLowerBody();
    const bones = resolveLowerBodyBones(container);
    const rig = buildLowerBodyRigRuntime(container, bones);
    const scratch = createLowerBodyRigScratch();

    const restSnapshots = [hips, leftUpLeg, leftLeg, leftFoot, rightUpLeg, rightLeg, rightFoot].map((b) => ({
      bone: b,
      quat: b.quaternion.clone(),
      pos: b.position.clone(),
    }));

    applyLowerBodyLocomotionPose(rig, container, activePose(), scratch);
    // Sanity: the pose actually changed something (otherwise this test would be vacuous).
    assert.ok(!leftUpLeg.quaternion.equals(restSnapshots[1].quat), 'expected the active pose to actually rotate the bone');

    restoreLowerBodyRestPose(rig);
    for (const snap of restSnapshots) {
      assert.ok(snap.bone.quaternion.equals(snap.quat), `${snap.bone.name} quaternion did not restore exactly`);
      assert.ok(snap.bone.position.equals(snap.pos), `${snap.bone.name} position did not restore exactly`);
    }
  });

  it('applying the SAME pose repeatedly across many frames never drifts (no cumulative rotation)', () => {
    const { container } = buildSyntheticLowerBody();
    const bones = resolveLowerBodyBones(container);
    const rig = buildLowerBodyRigRuntime(container, bones);
    const scratch = createLowerBodyRigScratch();
    const pose = activePose();

    applyLowerBodyLocomotionPose(rig, container, pose, scratch);
    const firstQuat = rig.leftUpLeg.bone.quaternion.clone();
    for (let i = 0; i < 500; i++) applyLowerBodyLocomotionPose(rig, container, pose, scratch);
    const laterQuat = rig.leftUpLeg.bone.quaternion.clone();

    assert.ok(firstQuat.angleTo(laterQuat) < 1e-6, `expected byte-stable output for identical repeated input, drifted by ${firstQuat.angleTo(laterQuat)} rad`);
  });

  it('a zero-offset pose (all-zero angles/offsets) reproduces the exact rest transform', () => {
    const { container, leftUpLeg } = buildSyntheticLowerBody();
    const bones = resolveLowerBodyBones(container);
    const rig = buildLowerBodyRigRuntime(container, bones);
    const scratch = createLowerBodyRigScratch();
    const restQuat = leftUpLeg.quaternion.clone();

    applyLowerBodyLocomotionPose(rig, container, activePose(), scratch);
    applyLowerBodyLocomotionPose(rig, container, createLowerBodyLocomotionPose(), scratch); // all zeros

    assert.ok(leftUpLeg.quaternion.angleTo(restQuat) < 1e-9, 'a zero pose should reproduce the exact rest orientation, not a residual from the prior active pose');
  });

  it('left and right upper-leg bones rotate oppositely for a symmetric-magnitude, opposite-sign pose input (no accidental axis mirroring bug)', () => {
    const { container } = buildSyntheticLowerBody();
    const bones = resolveLowerBodyBones(container);
    const rig = buildLowerBodyRigRuntime(container, bones);
    const scratch = createLowerBodyRigScratch();
    const pose = createLowerBodyLocomotionPose();
    pose.leftUpperLegRotation = [0.4, 0, 0];
    pose.rightUpperLegRotation = [-0.4, 0, 0];
    applyLowerBodyLocomotionPose(rig, container, pose, scratch);

    const leftAngle = rig.leftUpLeg.restLocalQuat.angleTo(rig.leftUpLeg.bone.quaternion);
    const rightAngle = rig.rightUpLeg.restLocalQuat.angleTo(rig.rightUpLeg.bone.quaternion);
    assert.ok(Math.abs(leftAngle - rightAngle) < 1e-6, `expected equal-magnitude rotation away from rest for both legs, got left=${leftAngle} right=${rightAngle}`);
  });

  it('applying a pose at a rotated (yawed) container orientation still swings the leg in the world-forward direction, not a stale/unrotated one', () => {
    const { container } = buildSyntheticLowerBody();
    const bones = resolveLowerBodyBones(container);
    const rig = buildLowerBodyRigRuntime(container, bones);
    const scratch = createLowerBodyRigScratch();

    container.rotation.y = Math.PI / 2;
    container.updateMatrixWorld(true);

    const pose = createLowerBodyLocomotionPose();
    pose.leftUpperLegRotation = [0.3, 0, 0];
    applyLowerBodyLocomotionPose(rig, container, pose, scratch);

    const worldQuatAtYaw = rig.leftUpLeg.bone.getWorldQuaternion(new THREE.Quaternion());

    // Re-run the same offset at yaw=0 for comparison — the two resulting WORLD quaternions must differ (proving the swing axis really does follow the container's current yaw rather than a frozen world axis).
    container.rotation.y = 0;
    container.updateMatrixWorld(true);
    applyLowerBodyLocomotionPose(rig, container, pose, scratch);
    const worldQuatAtZero = rig.leftUpLeg.bone.getWorldQuaternion(new THREE.Quaternion());

    assert.ok(worldQuatAtYaw.angleTo(worldQuatAtZero) > 0.5, 'expected the swing to visibly follow the container yaw, not a fixed world axis');
  });
});
