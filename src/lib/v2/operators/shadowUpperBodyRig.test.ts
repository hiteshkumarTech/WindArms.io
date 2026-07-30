import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  applyChestAimFrame,
  buildShadowArmRuntime,
  buildShadowSpineChainRuntime,
  createChestAimScratch,
  measureShoulderRestWorldPosition,
  MissingCriticalBoneError,
  MissingShadowSpineHipsError,
  resolveKaelArmBones,
  resolveShadowSpineBones,
  restoreChestAimFrame,
  restoreRestPose,
  solveShadowArmSide,
} from './shadowUpperBodyRig';
import { makeShadowArmDebugSide } from './shadowArmDebugState';

/**
 * Full-body synthetic skeleton (Hips -> Spine -> Spine1 -> Spine2 ->
 * {LeftShoulder->LeftArm->LeftForeArm->LeftHand, RightShoulder->RightArm->
 * RightForeArm->RightHand}) — same shape/convention as
 * `kaelArmRig.test.ts`'s `buildSyntheticSkeleton`, but the CONTAINER is
 * given a non-identity world position/rotation (world-anchored, matching
 * `KaelFirstPersonShadowBody.tsx`'s real container — never camera-relative)
 * so tests actually exercise the world-space solve, not just a
 * container-at-origin special case.
 */
function buildSyntheticShadowSkeleton() {
  function bone(name: string, position: [number, number, number]): THREE.Bone {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...position);
    return b;
  }

  const container = new THREE.Group();
  container.name = 'shadow_body_container';
  container.position.set(3, 0, -4);
  container.rotation.y = Math.PI * 0.35;

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
  leftHand.add(leftThumb1, leftIndex1, leftPinky1);
  spine2.add(rightShoulder);
  rightShoulder.add(rightArm);
  rightArm.add(rightForeArm);
  rightForeArm.add(rightHand);
  rightHand.add(rightThumb1, rightIndex1, rightPinky1);

  container.updateMatrixWorld(true);
  return { container, hips, spine, spine1, spine2, leftArm, leftForeArm, leftHand, rightArm, rightForeArm, rightHand };
}

describe('shadowUpperBodyRig — resolveShadowSpineBones', () => {
  it('resolves hips + full spine chain on a well-formed synthetic skeleton', () => {
    const { container } = buildSyntheticShadowSkeleton();
    const resolved = resolveShadowSpineBones(container);
    assert.strictEqual(resolved.hips.name, 'mixamorig:Hips');
    assert.strictEqual(resolved.spine?.name, 'mixamorig:Spine');
    assert.strictEqual(resolved.spine1?.name, 'mixamorig:Spine1');
    assert.strictEqual(resolved.spine2?.name, 'mixamorig:Spine2');
  });

  it('throws MissingShadowSpineHipsError when hips is absent (the one required bone)', () => {
    const container = new THREE.Group();
    const spine = new THREE.Bone();
    spine.name = 'mixamorig:Spine';
    container.add(spine);
    assert.throws(() => resolveShadowSpineBones(container), MissingShadowSpineHipsError);
  });

  it('tolerates a missing spine chain — hips alone still resolves, spine/spine1/spine2 come back null, not thrown', () => {
    const container = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorig:Hips';
    container.add(hips);
    container.updateMatrixWorld(true);
    const resolved = resolveShadowSpineBones(container);
    assert.strictEqual(resolved.spine, null);
    assert.strictEqual(resolved.spine1, null);
    assert.strictEqual(resolved.spine2, null);
  });
});

describe('shadowUpperBodyRig — buildShadowSpineChainRuntime / applyChestAimFrame / restoreChestAimFrame (Step 8E-C.1)', () => {
  it('builds a 3-bone chain (Spine, Spine1, Spine2) in parent-to-child order, with the deepest bone (Spine2) as chestBone', () => {
    const { container } = buildSyntheticShadowSkeleton();
    const bones = resolveShadowSpineBones(container);
    const chain = buildShadowSpineChainRuntime(bones);
    assert.strictEqual(chain?.bones.length, 3);
    assert.strictEqual(chain?.bones[0].bone.name, 'mixamorig:Spine');
    assert.strictEqual(chain?.bones[1].bone.name, 'mixamorig:Spine1');
    assert.strictEqual(chain?.bones[2].bone.name, 'mixamorig:Spine2');
    assert.strictEqual(chain?.chestBone.name, 'mixamorig:Spine2');
    const weightSum = chain!.bones.reduce((s, b) => s + b.weight, 0);
    assert.ok(Math.abs(weightSum - 1) < 1e-9, `weights must sum to 1, got ${weightSum}`);
  });

  it('redistributes weights proportionally when only some spine bones resolve (e.g. Spine + Spine2, Spine1 missing)', () => {
    const container = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorig:Hips';
    const spine = new THREE.Bone();
    spine.name = 'mixamorig:Spine';
    const spine2 = new THREE.Bone();
    spine2.name = 'mixamorig:Spine2';
    container.add(hips);
    hips.add(spine);
    spine.add(spine2);
    container.updateMatrixWorld(true);
    const bones = resolveShadowSpineBones(container);
    const chain = buildShadowSpineChainRuntime(bones);
    assert.strictEqual(chain?.bones.length, 2);
    const weightSum = chain!.bones.reduce((s, b) => s + b.weight, 0);
    assert.ok(Math.abs(weightSum - 1) < 1e-9, `weights must still sum to 1 with a partial chain, got ${weightSum}`);
  });

  it('returns null when no spine bone at all is resolved (hips-only skeleton)', () => {
    const container = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorig:Hips';
    container.add(hips);
    container.updateMatrixWorld(true);
    const bones = resolveShadowSpineBones(container);
    const chain = buildShadowSpineChainRuntime(bones);
    assert.strictEqual(chain, null);
  });

  it('applies a world-axis pitch that changes the chest bone world quaternion, then restores every bone to its EXACT original rest quaternion', () => {
    const { container, spine, spine1, spine2 } = buildSyntheticShadowSkeleton();
    const bones = resolveShadowSpineBones(container);
    const chain = buildShadowSpineChainRuntime(bones)!;
    const restSpine = spine.quaternion.clone();
    const restSpine1 = spine1.quaternion.clone();
    const restSpine2 = spine2.quaternion.clone();
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const scratch = createChestAimScratch();

    applyChestAimFrame(chain, containerWorldQuat, 0.2, scratch);
    assert.ok(!spine.quaternion.equals(restSpine), 'spine must rotate away from rest');
    assert.ok(!spine1.quaternion.equals(restSpine1), 'spine1 must rotate away from rest');
    assert.ok(!spine2.quaternion.equals(restSpine2), 'spine2 must rotate away from rest');

    restoreChestAimFrame(chain);
    assert.ok(spine.quaternion.equals(restSpine));
    assert.ok(spine1.quaternion.equals(restSpine1));
    assert.ok(spine2.quaternion.equals(restSpine2));
  });

  it('CASCADES: spine2 (the chest) genuinely rotates further than it would from its own weight alone, because it rides along with spine1 and spine which are ALSO rotating this same frame — proves this is a connected chain, not three independent twitches', () => {
    const { container, spine2 } = buildSyntheticShadowSkeleton();
    const bones = resolveShadowSpineBones(container);
    const chain = buildShadowSpineChainRuntime(bones)!;
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const scratch = createChestAimScratch();

    const restSpine2WorldQuat = new THREE.Quaternion();
    spine2.getWorldQuaternion(restSpine2WorldQuat);

    applyChestAimFrame(chain, containerWorldQuat, 0.3, scratch);
    const spine2WorldQuatAfterCascade = new THREE.Quaternion();
    spine2.getWorldQuaternion(spine2WorldQuatAfterCascade);
    const cascadedAngle = restSpine2WorldQuat.angleTo(spine2WorldQuatAfterCascade);

    // spine2's OWN weight is only 0.55 of the total 0.3 rad budget = 0.165 rad
    // in isolation. If parent rotations were NOT cascading in, spine2's own
    // world-orientation delta would be capped near that. The actual observed
    // delta must be visibly larger, proving spine1+spine's own contributions
    // are riding along underneath it.
    const spine2OwnWeight = chain.bones[2].weight;
    const isolatedEstimateRad = 0.3 * spine2OwnWeight;
    assert.ok(cascadedAngle > isolatedEstimateRad * 1.5, `expected cascaded angle (${cascadedAngle}) to clearly exceed spine2's own isolated contribution (${isolatedEstimateRad})`);
  });

  it('applying zero total pitch reproduces the rest world orientation (no spurious offset at zero input)', () => {
    const { container, spine2 } = buildSyntheticShadowSkeleton();
    const bones = resolveShadowSpineBones(container);
    const chain = buildShadowSpineChainRuntime(bones)!;
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const restWorldQuat = new THREE.Quaternion();
    spine2.getWorldQuaternion(restWorldQuat);
    const scratch = createChestAimScratch();

    applyChestAimFrame(chain, containerWorldQuat, 0, scratch);
    const afterWorldQuat = new THREE.Quaternion();
    spine2.getWorldQuaternion(afterWorldQuat);
    assert.ok(restWorldQuat.angleTo(afterWorldQuat) < 1e-6, 'zero pitch must reproduce the rest world orientation to floating-point precision');
  });

  it('no cumulative drift: applying the same nonzero pitch 50 times in a row produces the SAME result as applying it once (never accumulates)', () => {
    const { container, spine2 } = buildSyntheticShadowSkeleton();
    const bones = resolveShadowSpineBones(container);
    const chain = buildShadowSpineChainRuntime(bones)!;
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const scratch = createChestAimScratch();

    applyChestAimFrame(chain, containerWorldQuat, 0.15, scratch);
    const once = spine2.quaternion.clone();
    for (let i = 0; i < 49; i++) applyChestAimFrame(chain, containerWorldQuat, 0.15, scratch);
    assert.ok(spine2.quaternion.angleTo(once) < 1e-9, 'repeated application at the same offset must never drift from the single-application result');
  });

  it('SIGN CONVENTION: a POSITIVE totalPitchRad produces a FORWARD/DOWN chest lean, not a backward/up one — numeric regression guard for a real bug caught by real-browser measurement (the shoulder was observed moving AWAY from a low, forward target after applying a "corrective" positive-pitch lean)', () => {
    const { container, spine2 } = buildSyntheticShadowSkeleton();
    const bones = resolveShadowSpineBones(container);
    const chain = buildShadowSpineChainRuntime(bones)!;
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const scratch = createChestAimScratch();

    const forwardWorldBefore = new THREE.Vector3(0, 0, -1).applyQuaternion(containerWorldQuat);
    const chestWorldQuatBefore = new THREE.Quaternion();
    spine2.getWorldQuaternion(chestWorldQuatBefore);
    const localForwardBefore = new THREE.Vector3(0, 0, -1); // spine2's own rest local -Z, approximates chest-forward before any lean

    applyChestAimFrame(chain, containerWorldQuat, 0.3, scratch);
    const chestWorldQuatAfter = new THREE.Quaternion();
    spine2.getWorldQuaternion(chestWorldQuatAfter);

    // Measure how the chest's own local-forward direction's WORLD Y
    // component changed — a forward/DOWN lean must make it MORE negative
    // (tips toward the ground), never more positive (which would mean it
    // tipped backward/up instead).
    const worldForwardBefore = localForwardBefore.clone().applyQuaternion(chestWorldQuatBefore);
    const worldForwardAfter = localForwardBefore.clone().applyQuaternion(chestWorldQuatAfter);
    assert.ok(
      worldForwardAfter.y < worldForwardBefore.y - 1e-4,
      `a positive pitch must tip the chest's forward direction DOWNWARD (Y decreasing) — before.y=${worldForwardBefore.y}, after.y=${worldForwardAfter.y}`,
    );
    void forwardWorldBefore;
  });

  it('the arm rig, when measured relative to the CHEST bone, correctly reflects the chest-aim rotation — the shoulder world position after a chest lean differs from before it', () => {
    const { container, spine2 } = buildSyntheticShadowSkeleton();
    const spineBones = resolveShadowSpineBones(container);
    const chain = buildShadowSpineChainRuntime(spineBones)!;
    const armBones = resolveKaelArmBones(container);
    const armRuntime = buildShadowArmRuntime(chain.chestBone, armBones);

    const shoulderBeforeChestLean = measureShoulderRestWorldPosition(armRuntime.right, chain.chestBone).clone();

    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const scratch = createChestAimScratch();
    applyChestAimFrame(chain, containerWorldQuat, 0.3, scratch);
    container.updateMatrixWorld(true);

    const shoulderAfterChestLean = measureShoulderRestWorldPosition(armRuntime.right, chain.chestBone).clone();
    assert.ok(shoulderBeforeChestLean.distanceTo(shoulderAfterChestLean) > 0.01, 'the shoulder must visibly move once the chest it is attached to has rotated — proves the arm rig reads the LIVE chest frame, not a stale pre-lean one');
    void spine2;
  });
});

describe('shadowUpperBodyRig — arm rest metrics + solveShadowArmSide', () => {
  function buildRuntimeAndTarget() {
    const { container, rightHand } = buildSyntheticShadowSkeleton();
    const bones = resolveKaelArmBones(container);
    const runtime = buildShadowArmRuntime(container, bones);
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    return { container, runtime, containerWorldQuat, rightHand };
  }

  it('resolves both sides via the shared resolveKaelArmBones (no duplicated bone-matching logic)', () => {
    const { container } = buildSyntheticShadowSkeleton();
    const bones = resolveKaelArmBones(container);
    assert.strictEqual(bones.right.upperArm.name, 'mixamorig:RightArm');
    assert.strictEqual(bones.left.upperArm.name, 'mixamorig:LeftArm');
  });

  it('throws MissingCriticalBoneError when a required arm bone is absent — never a silent partial rig', () => {
    const container = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorig:Hips';
    container.add(hips);
    container.updateMatrixWorld(true);
    assert.throws(() => resolveKaelArmBones(container), MissingCriticalBoneError);
  });

  it('reachable target: the solved hand position lands within 1mm of the target at weight=1, position/rotation weight=1', () => {
    const { container, runtime, containerWorldQuat } = buildRuntimeAndTarget();
    // This synthetic rig's rest pose is a fully straight (zero elbow bend)
    // arm — shoulder-to-hand distance AT REST already equals
    // upperLength+lowerLength exactly, i.e. it sits right at the solver's
    // own 100%-extension boundary, past `maxReachRatio` (0.97). Targeting
    // a point NEAR the rest hand position would therefore immediately
    // reach-clamp regardless of the solve being correct — not what this
    // test means to exercise. Instead target a point comfortably INSIDE
    // the reachable sphere (60% of total chain length from the shoulder,
    // well under the 97% cap) in a fixed, arbitrary direction.
    const shoulderWorld = new THREE.Vector3();
    runtime.right.bones.upperArm.getWorldPosition(shoulderWorld);
    const totalLength = runtime.right.metrics.upperLength + runtime.right.metrics.lowerLength;
    const target = shoulderWorld.clone().add(new THREE.Vector3(0.3, 0.2, 0.4).normalize().multiplyScalar(totalLength * 0.6));
    const debugOut = makeShadowArmDebugSide();

    const ok = solveShadowArmSide(runtime.right, container, containerWorldQuat, target, new THREE.Quaternion(), [0.5, -0.7, 0.3], 1, debugOut);
    assert.strictEqual(ok, true);
    assert.ok(debugOut.positionErrorM < 0.001, `expected sub-millimeter position error, got ${debugOut.positionErrorM}m`);
    assert.strictEqual(debugOut.reachClamped, false);
  });

  it('unreachable target: gets clamped to maxReachRatio * chain length — solved hand distance from shoulder never exceeds that bound', () => {
    const { container, runtime, containerWorldQuat } = buildRuntimeAndTarget();
    const farTarget = new THREE.Vector3(100, 100, 100);
    const targetQuat = new THREE.Quaternion();
    const debugOut = makeShadowArmDebugSide();

    const ok = solveShadowArmSide(runtime.right, container, containerWorldQuat, farTarget, targetQuat, [0.5, -0.7, 0.3], 1, debugOut);
    assert.strictEqual(ok, true);
    assert.strictEqual(debugOut.reachClamped, true);
    const handToShoulder = debugOut.handWorldPos.distanceTo(debugOut.shoulderWorldPos);
    assert.ok(handToShoulder <= debugOut.effectiveMaxReachM + 1e-4, `solved hand (${handToShoulder}m from shoulder) must not exceed the effective max reach (${debugOut.effectiveMaxReachM}m)`);
  });

  it('finite output guarantee: a spread of targets around the rig never produces NaN/Infinity in the debug readout', () => {
    const { container, runtime, containerWorldQuat } = buildRuntimeAndTarget();
    const targets = [
      new THREE.Vector3(0.1, 0.9, 0.1),
      new THREE.Vector3(-0.3, 1.2, 0.4),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, -1, 3),
      new THREE.Vector3(-5, 5, -5),
    ];
    for (const target of targets) {
      const debugOut = makeShadowArmDebugSide();
      const ok = solveShadowArmSide(runtime.right, container, containerWorldQuat, target, new THREE.Quaternion(), [0.5, -0.7, 0.3], 1, debugOut);
      assert.strictEqual(ok, true);
      for (const v of [debugOut.shoulderWorldPos, debugOut.elbowWorldPos, debugOut.handWorldPos]) {
        assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
      }
      assert.ok(Number.isFinite(debugOut.positionErrorM) && Number.isFinite(debugOut.rotationErrorRad));
    }
  });

  it('right/left independence: solving the right side does not move the left side\'s bones', () => {
    const { container, runtime, containerWorldQuat } = buildRuntimeAndTarget();
    const leftUpperArmRestQuat = runtime.left.bones.upperArm.quaternion.clone();
    const leftLowerArmRestQuat = runtime.left.bones.lowerArm.quaternion.clone();

    const debugOut = makeShadowArmDebugSide();
    solveShadowArmSide(runtime.right, container, containerWorldQuat, new THREE.Vector3(0.5, 0.5, 0.5), new THREE.Quaternion(), [0.5, -0.7, 0.3], 1, debugOut);

    assert.ok(runtime.left.bones.upperArm.quaternion.equals(leftUpperArmRestQuat), 'left upper arm must be untouched by a right-side solve');
    assert.ok(runtime.left.bones.lowerArm.quaternion.equals(leftLowerArmRestQuat), 'left lower arm must be untouched by a right-side solve');
  });

  it('rest-pose reset: restoreRestPose reproduces the exact captured rest quaternions after a solve has moved the bones', () => {
    const { container, runtime, containerWorldQuat } = buildRuntimeAndTarget();
    const restUpper = runtime.right.bones.upperArm.quaternion.clone();
    const restLower = runtime.right.bones.lowerArm.quaternion.clone();
    const restHand = runtime.right.bones.hand.quaternion.clone();

    const debugOut = makeShadowArmDebugSide();
    solveShadowArmSide(runtime.right, container, containerWorldQuat, new THREE.Vector3(0.3, 0.6, 0.2), new THREE.Quaternion(), [0.5, -0.7, 0.3], 1, debugOut);
    assert.ok(!runtime.right.bones.upperArm.quaternion.equals(restUpper), 'sanity: the solve must have actually moved the bone');

    restoreRestPose(runtime.right);
    assert.ok(runtime.right.bones.upperArm.quaternion.equals(restUpper));
    assert.ok(runtime.right.bones.lowerArm.quaternion.equals(restLower));
    assert.ok(runtime.right.bones.hand.quaternion.equals(restHand));
  });

  it('a non-finite target quaternion is caught and leaves the hand bone unchanged this frame (fail-soft, not a NaN propagated into the render)', () => {
    const { container, runtime, containerWorldQuat, rightHand } = buildRuntimeAndTarget();
    const handQuatBefore = rightHand.quaternion.clone();
    const badQuat = new THREE.Quaternion(NaN, 0, 0, 1);
    const debugOut = makeShadowArmDebugSide();

    const ok = solveShadowArmSide(runtime.right, container, containerWorldQuat, new THREE.Vector3(0.2, 0.5, 0.2), badQuat, [0.5, -0.7, 0.3], 1, debugOut);
    // The arm chain itself (upper/lower) still solves finitely (only the hand's target orientation was bad) — solveShadowArmSide only returns false for a non-finite ARM-CHAIN result, and leaves the hand rotation at its previous value on a bad hand target specifically.
    assert.strictEqual(ok, true);
    assert.ok(rightHand.quaternion.equals(handQuatBefore), 'a non-finite hand target must never write a NaN quaternion onto the bone');
  });

  it('shoulder assist measurably reduces shoulder-to-target distance versus the unassisted case', () => {
    const { container, runtime, containerWorldQuat } = buildRuntimeAndTarget();
    const target = new THREE.Vector3(0.5, 0.8, 0.4);
    const debugUnassisted = makeShadowArmDebugSide();
    solveShadowArmSide(runtime.right, container, containerWorldQuat, target, new THREE.Quaternion(), [0.5, -0.7, 0.3], 1, debugUnassisted);
    const unassistedDist = debugUnassisted.shoulderToTargetM;

    restoreRestPose(runtime.right);
    const debugAssisted = makeShadowArmDebugSide();
    // Compute a WORLD-space direction from the (unassisted) shoulder toward
    // the target, then convert it into CONTAINER-LOCAL space (the space
    // `shoulderAssistLocal` is actually specified in) via the inverse
    // container rotation — guarantees the assist genuinely points toward
    // the target regardless of the container's own world rotation (this
    // synthetic rig's container is yawed ~63°), rather than assuming a
    // world-axis-aligned assist happens to help.
    const worldTowardTarget = target.clone().sub(debugUnassisted.shoulderWorldPos).normalize();
    const containerQuatInverse = containerWorldQuat.clone().invert();
    const assist = worldTowardTarget.clone().applyQuaternion(containerQuatInverse).multiplyScalar(0.15);
    solveShadowArmSide(runtime.right, container, containerWorldQuat, target, new THREE.Quaternion(), [0.5, -0.7, 0.3], 1, debugAssisted, { shoulderAssistLocal: assist });
    const assistedDist = debugAssisted.shoulderToTargetM;

    assert.ok(assistedDist < unassistedDist, `shoulder assist toward the target should shorten shoulder-to-target distance (unassisted=${unassistedDist}, assisted=${assistedDist})`);
  });

  it('STEP 8E-C.1: rotationErrorRad is a GENUINE angular error, not a tautology — it moves when handBasisAdjustQuat is deliberately wrong', () => {
    const { container, runtime, containerWorldQuat } = buildRuntimeAndTarget();
    const target = new THREE.Vector3(0.3, 0.6, 0.2);
    const targetQuat = new THREE.Quaternion(); // identity — some fixed, arbitrary desired grip orientation

    const debugCorrect = makeShadowArmDebugSide();
    solveShadowArmSide(runtime.right, container, containerWorldQuat, target, targetQuat, [0.5, -0.7, 0.3], 1, debugCorrect);
    const correctError = debugCorrect.rotationErrorRad;

    restoreRestPose(runtime.right);
    // Deliberately wrong hand-basis adjustment — a real 90° twist that no
    // legitimate calibration would ever choose.
    const wrongAdjust = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const debugWrong = makeShadowArmDebugSide();
    solveShadowArmSide(runtime.right, container, containerWorldQuat, target, targetQuat, [0.5, -0.7, 0.3], 1, debugWrong, { handBasisAdjustQuat: wrongAdjust });
    const wrongError = debugWrong.rotationErrorRad;

    assert.ok(wrongError > correctError + 0.5, `a deliberately wrong hand-basis adjustment (90°) must produce a MUCH larger reported error than the untuned case (correct=${correctError.toFixed(3)}rad, wrong=${wrongError.toFixed(3)}rad) — if this fails, the metric is tautological again`);
  });
});
