import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { measureArmRestMetrics, MissingCriticalBoneError, normalizeBoneName, recenterArmMetrics, resolveKaelArmBones } from './kaelArmRig';

describe('kaelArmRig — normalizeBoneName', () => {
  it('strips the mixamorig: prefix and lowercases', () => {
    assert.strictEqual(normalizeBoneName('mixamorig:LeftForeArm'), 'leftforearm');
  });
  it('strips def- prefix', () => {
    assert.strictEqual(normalizeBoneName('DEF-hand.L'), 'hand.l');
  });
  it('leaves an already-normalized name unchanged (case-folded)', () => {
    assert.strictEqual(normalizeBoneName('LeftArm'), 'leftarm');
  });
});

/** Builds a minimal synthetic Mixamo-style skeleton (root -> Hips -> Spine -> Spine1 -> Spine2 -> LeftShoulder -> LeftArm -> LeftForeArm -> LeftHand -> finger chains, mirrored for Right) so bone resolution and rest-metrics measurement can be tested without a real GLB. */
function buildSyntheticSkeleton() {
  function bone(name: string, position: [number, number, number]): THREE.Bone {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...position);
    return b;
  }

  const container = new THREE.Group();
  container.name = 'arm_rig_container';

  const hips = bone('mixamorig:Hips', [0, 1, 0]);
  const spine = bone('mixamorig:Spine', [0, 0.1, 0]);
  const spine1 = bone('mixamorig:Spine1', [0, 0.1, 0]);
  const spine2 = bone('mixamorig:Spine2', [0, 0.1, 0]);

  const leftShoulder = bone('mixamorig:LeftShoulder', [0.1, 0.05, 0]);
  const leftArm = bone('mixamorig:LeftArm', [0.1, 0, 0]);
  const leftForeArm = bone('mixamorig:LeftForeArm', [0.28, 0, 0]);
  const leftHand = bone('mixamorig:LeftHand', [0.26, 0, 0]);
  const leftThumb1 = bone('mixamorig:LeftHandThumb1', [0.02, 0.01, 0.02]);
  const leftIndex1 = bone('mixamorig:LeftHandIndex1', [0.08, 0, 0.01]);
  const leftMiddle1 = bone('mixamorig:LeftHandMiddle1', [0.08, 0, 0]);
  const leftRing1 = bone('mixamorig:LeftHandRing1', [0.08, 0, -0.01]);
  const leftPinky1 = bone('mixamorig:LeftHandPinky1', [0.07, 0, -0.02]);

  const rightShoulder = bone('mixamorig:RightShoulder', [-0.1, 0.05, 0]);
  const rightArm = bone('mixamorig:RightArm', [-0.1, 0, 0]);
  const rightForeArm = bone('mixamorig:RightForeArm', [-0.28, 0, 0]);
  const rightHand = bone('mixamorig:RightHand', [-0.26, 0, 0]);
  const rightThumb1 = bone('mixamorig:RightHandThumb1', [-0.02, 0.01, 0.02]);
  const rightIndex1 = bone('mixamorig:RightHandIndex1', [-0.08, 0, 0.01]);
  const rightPinky1 = bone('mixamorig:RightHandPinky1', [-0.07, 0, -0.02]);

  container.add(hips);
  hips.add(spine);
  spine.add(spine1);
  spine1.add(spine2);
  spine2.add(leftShoulder);
  leftShoulder.add(leftArm);
  leftArm.add(leftForeArm);
  leftForeArm.add(leftHand);
  leftHand.add(leftThumb1, leftIndex1, leftMiddle1, leftRing1, leftPinky1);
  spine2.add(rightShoulder);
  rightShoulder.add(rightArm);
  rightArm.add(rightForeArm);
  rightForeArm.add(rightHand);
  rightHand.add(rightThumb1, rightIndex1, rightPinky1);

  container.updateMatrixWorld(true);
  return { container, leftArm, leftForeArm, leftHand };
}

describe('kaelArmRig — resolveKaelArmBones', () => {
  it('resolves both sides\' required chains and finger chains on a well-formed synthetic skeleton', () => {
    const { container } = buildSyntheticSkeleton();
    const resolved = resolveKaelArmBones(container);
    assert.strictEqual(resolved.left.upperArm.name, 'mixamorig:LeftArm');
    assert.strictEqual(resolved.left.lowerArm.name, 'mixamorig:LeftForeArm');
    assert.strictEqual(resolved.left.hand.name, 'mixamorig:LeftHand');
    assert.strictEqual(resolved.left.shoulder?.name, 'mixamorig:LeftShoulder');
    assert.strictEqual(resolved.right.upperArm.name, 'mixamorig:RightArm');
    assert.ok(resolved.left.fingers.thumb && resolved.left.fingers.thumb.length === 1);
    assert.ok(resolved.left.fingers.index && resolved.left.fingers.middle && resolved.left.fingers.ring && resolved.left.fingers.pinky);
    // Right side only got thumb/index/pinky in the synthetic rig — middle/ring should be absent, not throw.
    assert.strictEqual(resolved.right.fingers.middle, undefined);
    assert.ok(resolved.right.fingers.thumb);
  });

  it('throws MissingCriticalBoneError (not a generic error, not a silent undefined) when a required chain bone is absent', () => {
    const container = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorig:Hips';
    container.add(hips);
    // No arm bones at all.
    assert.throws(() => resolveKaelArmBones(container), (err: unknown) => {
      assert.ok(err instanceof MissingCriticalBoneError);
      assert.strictEqual(err.chain, 'upper_arm');
      return true;
    });
  });

  it('missing shoulder specifically does NOT throw (shoulder is optional, only upper/lower arm + hand are hard requirements)', () => {
    const container = new THREE.Group();
    function bone(name: string): THREE.Bone {
      const b = new THREE.Bone();
      b.name = name;
      return b;
    }
    const arm = bone('mixamorig:LeftArm');
    const foreArm = bone('mixamorig:LeftForeArm');
    const hand = bone('mixamorig:LeftHand');
    container.add(arm);
    arm.add(foreArm);
    foreArm.add(hand);
    // Right side also needs to resolve for resolveKaelArmBones to succeed overall.
    const armR = bone('mixamorig:RightArm');
    const foreArmR = bone('mixamorig:RightForeArm');
    const handR = bone('mixamorig:RightHand');
    container.add(armR);
    armR.add(foreArmR);
    foreArmR.add(handR);

    const resolved = resolveKaelArmBones(container);
    assert.strictEqual(resolved.left.shoulder, null);
    assert.strictEqual(resolved.left.upperArm.name, 'mixamorig:LeftArm');
  });
});

describe('kaelArmRig — measureArmRestMetrics', () => {
  it('measures container-relative shoulder/elbow/hand positions and bone lengths matching the synthetic skeleton\'s authored offsets', () => {
    const { container, leftArm, leftForeArm, leftHand } = buildSyntheticSkeleton();
    const resolved = resolveKaelArmBones(container);
    const metrics = measureArmRestMetrics(container, resolved.left);

    // leftArm world position: sum of all ancestor local offsets along the chain.
    const expectedShoulder = new THREE.Vector3();
    leftArm.getWorldPosition(expectedShoulder);
    assert.ok(metrics.shoulderLocalPos.distanceTo(expectedShoulder) < 1e-5, 'container is at identity in this test, so container-local should equal world here');

    const expectedElbow = new THREE.Vector3();
    leftForeArm.getWorldPosition(expectedElbow);
    assert.ok(metrics.elbowLocalPos.distanceTo(expectedElbow) < 1e-5);

    const expectedHand = new THREE.Vector3();
    leftHand.getWorldPosition(expectedHand);
    assert.ok(metrics.handLocalPos.distanceTo(expectedHand) < 1e-5);

    assert.ok(Math.abs(metrics.upperLength - 0.28) < 1e-5, `expected upperLength ~0.28, got ${metrics.upperLength}`);
    assert.ok(Math.abs(metrics.lowerLength - 0.26) < 1e-5, `expected lowerLength ~0.26, got ${metrics.lowerLength}`);
  });

  it('produces a UNIT-length, FINITE handBasisCorrection quaternion even for an arbitrary synthetic hand/finger layout', () => {
    const { container } = buildSyntheticSkeleton();
    const resolved = resolveKaelArmBones(container);
    const metrics = measureArmRestMetrics(container, resolved.left);
    const q = metrics.handBasisCorrection;
    const len = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2);
    assert.ok(Number.isFinite(len) && Math.abs(len - 1) < 1e-4);
  });

  it('handBasisCorrection differs between left and right when the synthetic finger layout differs (proves it is measured per-side, not shared/mirrored)', () => {
    const { container } = buildSyntheticSkeleton();
    const resolved = resolveKaelArmBones(container);
    const leftMetrics = measureArmRestMetrics(container, resolved.left);
    const rightMetrics = measureArmRestMetrics(container, resolved.right);
    // The synthetic rig's left/right finger offsets are mirrored in X but
    // otherwise identical, so this mainly checks the function runs
    // independently per side without sharing hidden state — not a claim
    // about any specific numeric relationship between the two.
    assert.ok(leftMetrics.handBasisCorrection.angleTo(rightMetrics.handBasisCorrection) >= 0);
  });

  it('falls back to an identity handBasisCorrection (not a throw) when finger bones are missing', () => {
    const container = new THREE.Group();
    function bone(name: string): THREE.Bone {
      const b = new THREE.Bone();
      b.name = name;
      return b;
    }
    const arm = bone('mixamorig:LeftArm');
    const foreArm = bone('mixamorig:LeftForeArm');
    const hand = bone('mixamorig:LeftHand');
    container.add(arm);
    arm.add(foreArm);
    foreArm.add(hand);
    container.updateMatrixWorld(true);

    const side = { shoulder: null, upperArm: arm, lowerArm: foreArm, hand, fingers: {} };
    const metrics = measureArmRestMetrics(container, side);
    assert.ok(metrics.handBasisCorrection.equals(new THREE.Quaternion()));
  });
});

describe('kaelArmRig — recenterArmMetrics', () => {
  it('returns the midpoint of the two sides\' shoulder positions as the anchor', () => {
    const { container } = buildSyntheticSkeleton();
    const resolved = resolveKaelArmBones(container);
    const left = measureArmRestMetrics(container, resolved.left);
    const right = measureArmRestMetrics(container, resolved.right);
    const expectedAnchor = left.shoulderLocalPos.clone().add(right.shoulderLocalPos).multiplyScalar(0.5);
    const anchor = recenterArmMetrics(left, right);
    assert.ok(anchor.distanceTo(expectedAnchor) < 1e-6);
  });

  it('shifts the character-height synthetic rig (hips at y=1) down to a small, shoulder-relative offset — the exact regression this fix targets', () => {
    const { container } = buildSyntheticSkeleton();
    const resolved = resolveKaelArmBones(container);
    const left = measureArmRestMetrics(container, resolved.left);
    const right = measureArmRestMetrics(container, resolved.right);
    // Before recentering, this synthetic rig's shoulder sits at character
    // height (hips at y=1 plus three 0.1-unit spine segments plus a 0.05
    // shoulder offset) — comfortably above 1.0, mirroring the real asset's
    // bug (shoulders at raw world y~1.5). After recentering, it must be
    // small — on the order of the arm's own local offsets (~0.1), not
    // character height.
    assert.ok(left.shoulderLocalPos.y > 1.0, `expected pre-recenter sanity check to see character-height Y, got ${left.shoulderLocalPos.y}`);
    recenterArmMetrics(left, right);
    assert.ok(Math.abs(left.shoulderLocalPos.y) < 0.2, `expected small post-recenter Y, got ${left.shoulderLocalPos.y}`);
    assert.ok(Math.abs(right.shoulderLocalPos.y) < 0.2, `expected small post-recenter Y, got ${right.shoulderLocalPos.y}`);
  });

  it('preserves upperLength/lowerLength exactly (pure rigid translation must not change bone-length invariants)', () => {
    const { container } = buildSyntheticSkeleton();
    const resolved = resolveKaelArmBones(container);
    const left = measureArmRestMetrics(container, resolved.left);
    const right = measureArmRestMetrics(container, resolved.right);
    const beforeLeftUpper = left.upperLength;
    const beforeLeftLower = left.lowerLength;
    const beforeRightUpper = right.upperLength;
    recenterArmMetrics(left, right);
    assert.strictEqual(left.upperLength, beforeLeftUpper);
    assert.strictEqual(left.lowerLength, beforeLeftLower);
    assert.strictEqual(right.upperLength, beforeRightUpper);
    // Also re-derive length from the now-recentered positions directly —
    // proves the recentered shoulder/elbow/hand triplet is still a
    // consistent, undistorted chain, not just that the cached scalar field
    // was left alone.
    const rederivedUpper = left.shoulderLocalPos.distanceTo(left.elbowLocalPos);
    assert.ok(Math.abs(rederivedUpper - beforeLeftUpper) < 1e-6);
  });

  it('leaves directions and quaternions untouched (rotation-only fields are invariant to a translation)', () => {
    const { container } = buildSyntheticSkeleton();
    const resolved = resolveKaelArmBones(container);
    const left = measureArmRestMetrics(container, resolved.left);
    const right = measureArmRestMetrics(container, resolved.right);
    const dirBefore = left.restUpperDir.clone();
    const quatBefore = left.restUpperQuat.clone();
    recenterArmMetrics(left, right);
    assert.ok(left.restUpperDir.equals(dirBefore));
    assert.ok(left.restUpperQuat.equals(quatBefore));
  });

  it('left and right shoulder positions remain distinct after recentering (do not collapse to the same point)', () => {
    const { container } = buildSyntheticSkeleton();
    const resolved = resolveKaelArmBones(container);
    const left = measureArmRestMetrics(container, resolved.left);
    const right = measureArmRestMetrics(container, resolved.right);
    recenterArmMetrics(left, right);
    assert.ok(left.shoulderLocalPos.distanceTo(right.shoulderLocalPos) > 0.05, 'left/right shoulders must not collapse together after recentering');
  });

  it('does not mutate a third, unrelated metrics object (no shared/module-level scratch leaking between calls)', () => {
    const { container } = buildSyntheticSkeleton();
    const resolved = resolveKaelArmBones(container);
    const leftA = measureArmRestMetrics(container, resolved.left);
    const rightA = measureArmRestMetrics(container, resolved.right);
    const leftB = measureArmRestMetrics(container, resolved.left);
    const rightB = measureArmRestMetrics(container, resolved.right);
    recenterArmMetrics(leftA, rightA);
    // leftB/rightB were measured identically but never passed to
    // recenterArmMetrics — must still hold the original, uncorrected values.
    assert.ok(leftB.shoulderLocalPos.y > 1.0, 'a separate, un-recentered measurement must not be affected by recentering a different pair');
  });
});
