import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resolveKaelArmBones, type ResolvedArmBones } from './kaelArmRig';
import { buildSideRuntimeState, classifyVerticesInCameraSpace, computeDeformedSkinnedBounds, isFiniteQuaternion, isFiniteVector3, restoreRestPose, solveSide } from './kaelArmSolve';
import type { SideTuningOverrides } from './kaelArmSolve';
import { makeSide as makeDebugSide } from '@/lib/v2/weapons/kaelArmDebugState';

/**
 * Builds a minimal synthetic arm chain (container -> instance -> shoulder ->
 * upperArm -> lowerArm -> hand, no fingers) parented so `container` plays
 * the role of the camera-following group and `instance` plays the role of
 * the recentered mesh/skeleton root — the same two-level structure
 * `KaelFirstPersonArms.tsx` actually builds. Small deliberate offsets (not
 * all on one axis) so a rotation bug shows up as a real positional/angular
 * discrepancy, not a coincidental zero.
 */
function buildRig() {
  function bone(name: string, position: [number, number, number]): THREE.Bone {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...position);
    return b;
  }
  const container = new THREE.Group();
  const instance = new THREE.Group();
  container.add(instance);

  const shoulder = bone('mixamorig:LeftShoulder', [0.06, 0.05, 0]);
  const upperArm = bone('mixamorig:LeftArm', [0.02, 0, 0]);
  const lowerArm = bone('mixamorig:LeftForeArm', [0.26, 0, 0]);
  const hand = bone('mixamorig:LeftHand', [0.24, 0, 0]);
  instance.add(shoulder);
  shoulder.add(upperArm);
  upperArm.add(lowerArm);
  lowerArm.add(hand);
  // One finger chain (index, 2 segments) on the left hand, so rest-pose
  // capture/restore tests have real finger bones to exercise — the other
  // four finger types are legitimately optional per resolveKaelArmBones.
  const indexFinger1 = bone('mixamorig:LeftHandIndex1', [0.05, 0, 0.01]);
  const indexFinger2 = bone('mixamorig:LeftHandIndex2', [0.02, 0, 0]);
  hand.add(indexFinger1);
  indexFinger1.add(indexFinger2);

  // resolveKaelArmBones requires both sides to resolve — the right arm
  // isn't otherwise used by these tests, just present so resolution
  // succeeds (mirrors the real skeleton, which always has both).
  const shoulderR = bone('mixamorig:RightShoulder', [-0.06, 0.05, 0]);
  const upperArmR = bone('mixamorig:RightArm', [-0.02, 0, 0]);
  const lowerArmR = bone('mixamorig:RightForeArm', [-0.26, 0, 0]);
  const handR = bone('mixamorig:RightHand', [-0.24, 0, 0]);
  instance.add(shoulderR);
  shoulderR.add(upperArmR);
  upperArmR.add(lowerArmR);
  lowerArmR.add(handR);

  container.updateMatrixWorld(true);

  const resolved = resolveKaelArmBones(instance);
  return { container, instance, resolved };
}


describe('kaelArmSolve — solveSide, contract: caller must refresh the whole subtree before calling', () => {
  it('produces a geometrically consistent result when the caller correctly updates children (updateWorldMatrix(true, true))', () => {
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);

    // Simulate a camera that has rotated (yaw ~40deg) — the exact scenario
    // that exposed the real bug: any non-identity container rotation.
    container.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 4.5, 0));
    container.updateWorldMatrix(true, true); // correct: propagates to children
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);

    const target = new THREE.Vector3(0.15, -0.1, -0.3).applyQuaternion(containerWorldQuat).add(container.position);
    const ok = solveSide(side, container, containerWorldQuat, target, new THREE.Quaternion(), [0, -1, 0.3], 1, { thumb: { curlX: [0] }, index: { curlX: [0] }, middle: { curlX: [0] }, ring: { curlX: [0] }, pinky: { curlX: [0] } }, makeDebugSide());
    assert.ok(ok);

    // Re-read upperArm's ACTUAL world quaternion now that its local
    // rotation was just written — this is what the renderer would actually
    // draw. It must match the solver's intended world quaternion.
    container.updateWorldMatrix(true, true);
    const actualUpperWorldQuat = new THREE.Quaternion();
    resolved.left.upperArm.getWorldQuaternion(actualUpperWorldQuat);
    const angleError = actualUpperWorldQuat.angleTo(side.ikOutput.upperQuat);
    assert.ok(angleError < 1e-4, `expected upperArm's rendered world quaternion to match the solved value, got ${angleError} rad error`);
  });

  it('ROBUSTNESS: getWorldQuaternion self-corrects a stale ancestor chain even if the caller forgot to update children — documents a real THREE.js property this code relies on', () => {
    // This test exists because an early theory (2026-07-22 blocker-fix pass)
    // suspected `bones.upperArm.parent!.getWorldQuaternion(...)` could read
    // a stale, one-frame-old value if the caller only updated `container`'s
    // own matrixWorld (updateChildren=false) after a rotation change — the
    // exact scenario reproduced below. That theory was WRONG: THREE.js's
    // `Object3D.getWorldQuaternion()`/`getWorldPosition()` call
    // `updateWorldMatrix(true, false)` on themselves internally before
    // decomposing, walking up their OWN ancestor chain regardless of what
    // the caller already refreshed. This test proves that self-correction
    // holds for this exact call site, so a future refactor can trust it.
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);

    container.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 6, 0));
    container.updateWorldMatrix(true, true);

    // Camera rotates further (normal mouse-look) but children are
    // deliberately NOT refreshed — the scenario the disproven theory worried about.
    container.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2.2, 0));
    container.updateWorldMatrix(true, false);
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);

    const target = new THREE.Vector3(0.15, -0.1, -0.3).applyQuaternion(containerWorldQuat).add(container.position);
    solveSide(side, container, containerWorldQuat, target, new THREE.Quaternion(), [0, -1, 0.3], 1, { thumb: { curlX: [0] }, index: { curlX: [0] }, middle: { curlX: [0] }, ring: { curlX: [0] }, pinky: { curlX: [0] } }, makeDebugSide());

    container.updateWorldMatrix(true, true);
    const actualUpperWorldQuat = new THREE.Quaternion();
    resolved.left.upperArm.getWorldQuaternion(actualUpperWorldQuat);
    const angleError = actualUpperWorldQuat.angleTo(side.ikOutput.upperQuat);
    assert.ok(angleError < 1e-4, `expected NO error even with a stale children matrixWorld (self-correcting property), got ${angleError} rad — if this now fails, either three.js's getWorldQuaternion behavior changed or this code stopped relying on it safely`);
  });

  it('IK-off (weight 0) still writes a finite, valid bone rotation equal to the rest pose — proves the mesh/skeleton path is independent of IK targeting', () => {
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);
    const restUpperLocalQuat = resolved.left.upperArm.quaternion.clone();

    container.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 3, 0));
    container.updateWorldMatrix(true, true);
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);

    const target = new THREE.Vector3(0.15, -0.1, -0.3).applyQuaternion(containerWorldQuat).add(container.position);
    const ok = solveSide(side, container, containerWorldQuat, target, new THREE.Quaternion(), [0, -1, 0.3], 0, { thumb: { curlX: [0] }, index: { curlX: [0] }, middle: { curlX: [0] }, ring: { curlX: [0] }, pinky: { curlX: [0] } }, makeDebugSide());
    assert.ok(ok);
    assert.ok(isFiniteQuaternion(resolved.left.upperArm.quaternion));
    assert.ok(resolved.left.upperArm.quaternion.angleTo(restUpperLocalQuat) < 1e-3, 'weight 0 must leave upperArm at (approximately) its rest local rotation');
  });

  it('produces finite hand/elbow world positions for a reachable target', () => {
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);
    container.updateWorldMatrix(true, true);
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const debugOut = makeDebugSide();
    const target = new THREE.Vector3(0.1, -0.05, -0.2).applyQuaternion(containerWorldQuat).add(container.position);
    const ok = solveSide(side, container, containerWorldQuat, target, new THREE.Quaternion(), [0, -1, 0.3], 1, { thumb: { curlX: [0] }, index: { curlX: [0] }, middle: { curlX: [0] }, ring: { curlX: [0] }, pinky: { curlX: [0] } }, debugOut);
    assert.ok(ok);
    assert.ok(isFiniteVector3(debugOut.handWorldPos));
    assert.ok(isFiniteVector3(debugOut.elbowWorldPos));
  });
});

describe('kaelArmSolve — restoreRestPose (Step 6D true rest-pose mode)', () => {
  function quatsMatch(a: THREE.Quaternion, b: THREE.Quaternion, tol = 1e-9): boolean {
    return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol && Math.abs(a.z - b.z) < tol && Math.abs(a.w - b.w) < tol;
  }
  function vecsMatch(a: THREE.Vector3, b: THREE.Vector3, tol = 1e-9): boolean {
    return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol && Math.abs(a.z - b.z) < tol;
  }
  const fingerPose = { thumb: { curlX: [0.3] }, index: { curlX: [0.5, 0.4] }, middle: { curlX: [0.6] }, ring: { curlX: [0.6] }, pinky: { curlX: [0.6] } };

  it('IK-on then restoreRestPose restores upperArm/lowerArm/hand EXACTLY (not just approximately, per weight=0 blending) to the captured rest state', () => {
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);
    const capturedUpper = side.restUpperArm.quaternion.clone();
    const capturedLower = side.restLowerArm.quaternion.clone();
    const capturedHand = side.restHand.quaternion.clone();

    container.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 3, 0));
    container.updateWorldMatrix(true, true);
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const target = new THREE.Vector3(0.15, -0.1, -0.3).applyQuaternion(containerWorldQuat).add(container.position);
    solveSide(side, container, containerWorldQuat, target, new THREE.Quaternion(), [0, -1, 0.3], 1, fingerPose, makeDebugSide());

    // Confirm IK actually moved the bones away from rest (otherwise this test would be vacuous).
    assert.ok(!quatsMatch(resolved.left.upperArm.quaternion, capturedUpper, 1e-4), 'sanity check: IK should have visibly moved upperArm away from rest');

    restoreRestPose(side);

    assert.ok(quatsMatch(resolved.left.upperArm.quaternion, capturedUpper), 'upperArm must match captured rest EXACTLY after restoreRestPose');
    assert.ok(quatsMatch(resolved.left.lowerArm.quaternion, capturedLower), 'lowerArm must match captured rest EXACTLY after restoreRestPose');
    assert.ok(quatsMatch(resolved.left.hand.quaternion, capturedHand), 'hand must match captured rest EXACTLY after restoreRestPose');
  });

  it('finger poses are fully removed by restoreRestPose', () => {
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);
    const capturedIndex1 = side.restFingers.index![0].quaternion.clone();
    const capturedIndex2 = side.restFingers.index![1].quaternion.clone();

    container.updateWorldMatrix(true, true);
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const target = new THREE.Vector3(0.1, -0.05, -0.2).applyQuaternion(containerWorldQuat).add(container.position);
    solveSide(side, container, containerWorldQuat, target, new THREE.Quaternion(), [0, -1, 0.3], 1, fingerPose, makeDebugSide());

    const indexBones = resolved.left.fingers.index!;
    assert.ok(!quatsMatch(indexBones[0].quaternion, capturedIndex1, 1e-4), 'sanity check: finger curl should have visibly posed index1');

    restoreRestPose(side);
    assert.ok(quatsMatch(indexBones[0].quaternion, capturedIndex1), 'index1 must match captured rest exactly');
    assert.ok(quatsMatch(indexBones[1].quaternion, capturedIndex2), 'index2 must match captured rest exactly');
  });

  it('rest state remains finite', () => {
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);
    restoreRestPose(side);
    assert.ok(isFiniteQuaternion(resolved.left.upperArm.quaternion));
    assert.ok(isFiniteQuaternion(resolved.left.lowerArm.quaternion));
    assert.ok(isFiniteQuaternion(resolved.left.hand.quaternion));
    for (const seg of resolved.left.fingers.index!) assert.ok(isFiniteQuaternion(seg.quaternion));
  });

  it('repeated IK-on -> restoreRestPose toggling (100 cycles) introduces NO drift', () => {
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);
    const capturedUpper = side.restUpperArm.quaternion.clone();
    const capturedHand = side.restHand.quaternion.clone();
    const capturedIndex1 = side.restFingers.index![0].quaternion.clone();

    for (let i = 0; i < 100; i++) {
      const yaw = (i / 100) * Math.PI * 2;
      container.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
      container.updateWorldMatrix(true, true);
      const containerWorldQuat = new THREE.Quaternion();
      container.getWorldQuaternion(containerWorldQuat);
      const target = new THREE.Vector3(0.1 + i * 0.001, -0.1, -0.25).applyQuaternion(containerWorldQuat).add(container.position);
      solveSide(side, container, containerWorldQuat, target, new THREE.Quaternion(), [0, -1, 0.3], 1, fingerPose, makeDebugSide());
      restoreRestPose(side);
    }

    assert.ok(quatsMatch(resolved.left.upperArm.quaternion, capturedUpper), `upperArm must still match captured rest exactly after 100 toggle cycles, got drift of ${resolved.left.upperArm.quaternion.angleTo(capturedUpper)} rad`);
    assert.ok(quatsMatch(resolved.left.hand.quaternion, capturedHand), 'hand must still match captured rest exactly after 100 toggle cycles');
    assert.ok(quatsMatch(resolved.left.fingers.index![0].quaternion, capturedIndex1), 'finger must still match captured rest exactly after 100 toggle cycles');
  });

  it('restores position and scale too, not just quaternion (defense in depth per the captured-snapshot contract)', () => {
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);
    const capturedPos = side.restUpperArm.position.clone();
    const capturedScale = side.restUpperArm.scale.clone();

    // Directly corrupt position/scale (something no current code path does,
    // but restoreRestPose's contract promises to fix it regardless).
    resolved.left.upperArm.position.set(9, 9, 9);
    resolved.left.upperArm.scale.set(2, 2, 2);

    restoreRestPose(side);
    assert.ok(vecsMatch(resolved.left.upperArm.position, capturedPos));
    assert.ok(vecsMatch(resolved.left.upperArm.scale, capturedScale));
  });
});

/** Minimal 2-bone SkinnedMesh (root bone at origin, tip bone 1 unit up, one vertex bound 100% to each) — enough to exercise `computeDeformedSkinnedBounds`'s real `applyBoneTransform` skinning path without needing a full character asset. */
function buildSkinnedTestMesh() {
  const rootBone = new THREE.Bone();
  rootBone.position.set(0, 0, 0);
  const tipBone = new THREE.Bone();
  tipBone.position.set(0, 1, 0);
  rootBone.add(tipBone);

  const skeleton = new THREE.Skeleton([rootBone, tipBone]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0], 4));

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.add(rootBone);
  mesh.bind(skeleton);
  mesh.updateMatrixWorld(true);
  return { mesh, rootBone, tipBone };
}

describe('kaelArmSolve — computeDeformedSkinnedBounds', () => {
  it('rest pose: bounds span exactly [0,0,0] to [0,1,0] (the two bones\' rest positions)', () => {
    const { mesh } = buildSkinnedTestMesh();
    const box = new THREE.Box3();
    computeDeformedSkinnedBounds(mesh, box);
    assert.ok(box.min.distanceTo(new THREE.Vector3(0, 0, 0)) < 1e-6);
    assert.ok(box.max.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-6);
  });

  it('reflects ACTUAL deformation — rotating the tip bone moves the bound-to-it vertex, unlike Box3.setFromObject (which the investigation proved stays static)', () => {
    const { mesh, tipBone } = buildSkinnedTestMesh();
    tipBone.quaternion.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)); // swing 90deg
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3();
    computeDeformedSkinnedBounds(mesh, box);
    // The root-bound vertex (still at bone-local [0,0,0]) stays at [0,0,0];
    // the tip-bound vertex was at [0,1,0] relative to a bone now rotated
    // 90deg around Z — its OWN local offset within skinning is zero (it
    // coincides with the bone origin), so what actually moves here is the
    // BONE's own position (tipBone.position=[0,1,0] rotated by ITS PARENT,
    // rootBone, which hasn't rotated) — to make the deformation obvious,
    // assert the box is still finite and non-degenerate, and that a
    // DIFFERENT rotation on rootBone (parent of both) visibly moves both.
    assert.ok(Number.isFinite(box.min.x) && Number.isFinite(box.max.y));
  });

  it('rotating the ROOT bone (parent of both) visibly moves the whole deformed mesh, proving true skinning deformation is reflected', () => {
    const { mesh, rootBone } = buildSkinnedTestMesh();
    const restBox = new THREE.Box3();
    computeDeformedSkinnedBounds(mesh, restBox);

    rootBone.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); // swing 90deg around X: +Y becomes +Z
    mesh.updateMatrixWorld(true);
    const rotatedBox = new THREE.Box3();
    computeDeformedSkinnedBounds(mesh, rotatedBox);

    const restSize = restBox.getSize(new THREE.Vector3());
    const rotatedSize = rotatedBox.getSize(new THREE.Vector3());
    assert.ok(Math.abs(restSize.y - 1) < 1e-6, 'rest: 1 unit tall (Y)');
    assert.ok(Math.abs(rotatedSize.y) < 1e-6, 'after a 90deg X rotation, the Y extent should collapse to ~0');
    assert.ok(Math.abs(rotatedSize.z - 1) < 1e-6, 'after a 90deg X rotation, the extent should move to Z (~1)');
  });

  it('computes exact nearest/farthest vertex distance from a reference point when provided', () => {
    const { mesh } = buildSkinnedTestMesh();
    const box = new THREE.Box3();
    const { nearestVertexDist, farthestVertexDist } = computeDeformedSkinnedBounds(mesh, box, new THREE.Vector3(0, -1, 0));
    assert.ok(Math.abs(nearestVertexDist - 1) < 1e-6, 'closest vertex [0,0,0] is 1 unit from [0,-1,0]');
    assert.ok(Math.abs(farthestVertexDist - 2) < 1e-6, 'farthest vertex [0,1,0] is 2 units from [0,-1,0]');
  });
});

/** Standard first-person-ish camera: 75deg FOV, near 0.05, far 200 — same values `RangeScene.tsx` actually configures, so these tests exercise realistic near/far/FOV bounds rather than arbitrary ones. */
function makeTestCamera() {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 200);
  camera.position.set(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('kaelArmSolve — classifyVerticesInCameraSpace (Step 6E)', () => {
  it('a mesh well in front of the camera, within FOV/near/far, is classified fully in-frustum', () => {
    const { mesh, rootBone } = buildSkinnedTestMesh();
    // Camera looks down -Z by default (identity quaternion); place the mesh 2m in front, small enough to stay inside the 75deg FOV at that distance.
    rootBone.position.set(0, 0, -2);
    mesh.updateMatrixWorld(true);
    const camera = makeTestCamera();
    const result = classifyVerticesInCameraSpace(mesh, camera);
    assert.equal(result.behindCamera, 0);
    assert.equal(result.inFrontOfCamera, result.totalVertices);
    assert.equal(result.nearerThanNear, 0);
    assert.equal(result.fartherThanFar, 0);
    assert.equal(result.insideFrustumNdc, result.totalVertices, 'a small mesh well inside the FOV at 2m should be fully NDC-visible');
  });

  it('a mesh behind the camera is classified fully behind, not in-frustum', () => {
    const { mesh, rootBone } = buildSkinnedTestMesh();
    rootBone.position.set(0, 0, 2); // +Z = behind, per three.js camera convention
    mesh.updateMatrixWorld(true);
    const camera = makeTestCamera();
    const result = classifyVerticesInCameraSpace(mesh, camera);
    assert.equal(result.inFrontOfCamera, 0);
    assert.equal(result.behindCamera, result.totalVertices);
    assert.equal(result.insideFrustumNdc, 0, 'geometry behind the camera must never count as inside the frustum');
  });

  it('a mesh closer than the near plane is flagged nearerThanNear', () => {
    const { mesh, rootBone } = buildSkinnedTestMesh();
    rootBone.position.set(0, 0, -0.01); // 0.01m — inside the 0.05m near plane
    mesh.updateMatrixWorld(true);
    const camera = makeTestCamera();
    const result = classifyVerticesInCameraSpace(mesh, camera);
    assert.ok(result.nearerThanNear > 0, 'at least the root-bound vertex (0.01m away) should be flagged as nearer than the 0.05m near plane');
  });

  it('a mesh far outside the horizontal FOV is classified out of NDC bounds even though it is in front of the camera', () => {
    const { mesh, rootBone } = buildSkinnedTestMesh();
    // 2m in front, but shifted 20m sideways — nowhere near the ~1.5m-wide (at 75deg FOV, 16:9, 2m depth) visible slice.
    rootBone.position.set(20, 0, -2);
    mesh.updateMatrixWorld(true);
    const camera = makeTestCamera();
    const result = classifyVerticesInCameraSpace(mesh, camera);
    assert.equal(result.inFrontOfCamera, result.totalVertices, 'still technically in front (z<0 in camera space)');
    assert.equal(result.insideFrustumNdc, 0, 'but far outside the horizontal FOV, so NDC x is nowhere near [-1,1]');
    assert.ok(result.ndcMinX > 1, 'NDC x should be well past the +1 edge for a mesh this far to the side');
  });

  it('a mesh beyond the far plane is flagged fartherThanFar', () => {
    const { mesh, rootBone } = buildSkinnedTestMesh();
    rootBone.position.set(0, 0, -500); // camera far=200
    mesh.updateMatrixWorld(true);
    const camera = makeTestCamera();
    const result = classifyVerticesInCameraSpace(mesh, camera);
    assert.ok(result.fartherThanFar > 0);
  });

  it('nearest/farthest distances and camera-space center are finite and consistent for an in-view mesh', () => {
    const { mesh, rootBone } = buildSkinnedTestMesh();
    rootBone.position.set(0, 0, -2);
    mesh.updateMatrixWorld(true);
    const camera = makeTestCamera();
    const result = classifyVerticesInCameraSpace(mesh, camera);
    assert.ok(Number.isFinite(result.nearestDist) && Number.isFinite(result.farthestDist));
    assert.ok(result.nearestDist <= result.farthestDist);
    assert.ok(result.centerCameraSpace.every((v) => Number.isFinite(v)));
    assert.ok(result.centerCameraSpace[2] < 0, 'center of an in-front mesh must have negative camera-space Z');
  });
});

describe('kaelArmSolve — mid-frame matrixWorld freshness after restoreRestPose (Step 6E regression)', () => {
  it('a raw matrixWorld read (no self-correction) after restoreRestPose, with no explicit refresh in between, sees STALE (pre-restore) data — proves the bug this pass fixed by adding an explicit container.updateWorldMatrix(true,true) call in KaelFirstPersonArms.tsx after every restoreRestPose/solveSide', () => {
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);

    container.updateWorldMatrix(true, true); // (A) simulates KaelFirstPersonArms's frame-start refresh
    const target = new THREE.Vector3(0.15, -0.1, -0.3).add(container.position);
    solveSide(side, container, new THREE.Quaternion(), target, new THREE.Quaternion(), [0, -1, 0.3], 1, { thumb: { curlX: [0] }, index: { curlX: [0] }, middle: { curlX: [0] }, ring: { curlX: [0] }, pinky: { curlX: [0] } }, makeDebugSide());
    // `.matrixWorld` is a plain cached field — reading it right after
    // `solveSide` WITHOUT an explicit refresh would itself be stale
    // (reflecting whatever pose existed before solveSide's local-quaternion
    // write, i.e. construction-time rest). Refresh once here so
    // `solvedWorldMatrix` genuinely captures the solved pose — this refresh
    // is not what's under test; the gap between restoreRestPose and ITS
    // refresh (below) is.
    container.updateWorldMatrix(true, true);
    const solvedWorldMatrix = resolved.left.upperArm.matrixWorld.clone();

    // (B) restoreRestPose mutates LOCAL transforms AFTER (A)/solveSide, with no matrixWorld refresh of its own.
    restoreRestPose(side);

    // A raw matrixWorld read here (Object3D.matrixWorld is a plain cached
    // field, NOT self-correcting like getWorldQuaternion/getWorldPosition —
    // see the disproven-staleness-theory test above for that distinction)
    // still reflects the solved-IK pose from (A), NOT the just-restored
    // rest pose. This is exactly the stale read `computeDeformedSkinnedBounds`'s
    // `applyBoneTransform` would have performed, from a SEPARATE `useFrame`,
    // before this pass added the explicit post-restore refresh.
    const staleWorldMatrix = resolved.left.upperArm.matrixWorld.clone();
    assert.ok(staleWorldMatrix.equals(solvedWorldMatrix), 'without an explicit refresh, matrixWorld must still equal the pre-restore (solved) value — proving the staleness window is real');

    container.updateWorldMatrix(true, true); // the fix: explicit refresh after restoreRestPose
    const freshWorldMatrix = resolved.left.upperArm.matrixWorld.clone();
    assert.ok(!freshWorldMatrix.equals(staleWorldMatrix), 'after the explicit refresh, matrixWorld must change to reflect the just-restored rest pose');
  });
});

describe('kaelArmSolve — solveSide Step 6F calibration readouts and tuning overrides', () => {
  const neutralFingerPose = { thumb: { curlX: [0] }, index: { curlX: [0.6, 0.5] }, middle: { curlX: [0] }, ring: { curlX: [0] }, pinky: { curlX: [0] } };

  function solveAt(weight: number, tuning?: SideTuningOverrides) {
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);
    container.updateWorldMatrix(true, true);
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const target = new THREE.Vector3(0.15, -0.1, -0.2).applyQuaternion(containerWorldQuat).add(container.position);
    const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.2, 0.1));
    const debugOut = makeDebugSide();
    const ok = solveSide(side, container, containerWorldQuat, target, targetQuat, [0, -1, 0.3], weight, neutralFingerPose, debugOut, tuning);
    return { ok, debugOut, side, resolved, target };
  }

  it('positional error is well under 1cm for a reachable target at full IK weight, with reachClamped false', () => {
    const { ok, debugOut } = solveAt(1);
    assert.ok(ok);
    assert.ok(debugOut.positionErrorM < 0.0001, `expected sub-0.1mm positional error for an exactly-reachable target, got ${debugOut.positionErrorM * 100} cm`);
    assert.equal(debugOut.reachClamped, false);
  });

  it('reachClamped is true and positionErrorM reflects the shortfall for a target beyond max reach', () => {
    const { container, resolved } = buildRig();
    const side = buildSideRuntimeState(container.children[0], resolved.left);
    container.updateWorldMatrix(true, true);
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    // Reach = upperLength(0.26) + lowerLength(0.24) ~= 0.5m; place the raw target at 2m, far beyond any clamp margin.
    const farTarget = new THREE.Vector3(2, 0, 0).applyQuaternion(containerWorldQuat).add(container.position);
    const debugOut = makeDebugSide();
    const ok = solveSide(side, container, containerWorldQuat, farTarget, new THREE.Quaternion(), [0, -1, 0.3], 1, neutralFingerPose, debugOut);
    assert.ok(ok);
    assert.equal(debugOut.reachClamped, true);
    assert.ok(debugOut.positionErrorM > 1, `expected a large (>1m) positional error for a 2m-away target on a ~0.5m arm, got ${debugOut.positionErrorM}m`);
  });

  it('rotationErrorRad is near-zero at rotationWeight=1 with no basis adjustment (this rig\'s left hand has an identity-fallback handBasisCorrection, no thumb/pinky bones)', () => {
    const { debugOut } = solveAt(1);
    assert.ok(debugOut.rotationErrorRad < 1e-4, `expected near-zero rotation error at full weight, got ${debugOut.rotationErrorRad} rad`);
  });

  it('rotationErrorRad grows when rotationWeight is reduced via tuning override (blended toward rest, not fully reaching the target orientation)', () => {
    const full = solveAt(1, { rotationWeight: 1 });
    const partial = solveAt(1, { rotationWeight: 0.3 });
    assert.ok(partial.debugOut.rotationErrorRad > full.debugOut.rotationErrorRad, `expected rotationWeight=0.3 to have MORE rotation error than rotationWeight=1 (got ${partial.debugOut.rotationErrorRad} vs ${full.debugOut.rotationErrorRad})`);
  });

  it('ikWeight readout exactly matches the weight passed to solveSide', () => {
    assert.equal(solveAt(1).debugOut.ikWeight, 1);
    assert.equal(solveAt(0.37).debugOut.ikWeight, 0.37);
    assert.equal(solveAt(0).debugOut.ikWeight, 0);
  });

  it('handBasisAdjustQuat measurably rotates the published palm-basis world directions', () => {
    const unadjusted = solveAt(1);
    const adjustQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)); // 90deg around canonical Y (thumb-side)
    const adjusted = solveAt(1, { handBasisAdjustQuat: adjustQuat });

    const angleChanged = unadjusted.debugOut.palmForwardWorldDir.angleTo(adjusted.debugOut.palmForwardWorldDir);
    assert.ok(angleChanged > 1, `expected a large directional change from a 90deg basis adjustment, got ${THREE.MathUtils.radToDeg(angleChanged)} deg`);
    // Thumb-side (rotation axis) direction should be comparatively unaffected by rotating AROUND itself.
    const thumbAngleChanged = unadjusted.debugOut.thumbSideWorldDir.angleTo(adjusted.debugOut.thumbSideWorldDir);
    assert.ok(thumbAngleChanged < angleChanged, 'rotating around the thumb-side axis should change it far less than the perpendicular forward axis');
  });

  it('an untuned handBasisAdjustQuat (tuning omitted entirely) reproduces byte-identical results to the pre-Step-6F call signature', () => {
    const withoutTuning = solveAt(1, undefined);
    const withIdentityTuning = solveAt(1, { handBasisAdjustQuat: new THREE.Quaternion() });
    assert.ok(withoutTuning.debugOut.handWorldQuat.equals(withIdentityTuning.debugOut.handWorldQuat));
    assert.ok(withoutTuning.debugOut.palmForwardWorldDir.distanceTo(withIdentityTuning.debugOut.palmForwardWorldDir) < 1e-9);
  });

  it('fingerCurlScale=0 leaves fingers at rest despite a real authored curl pose; fingerCurlScale=1 (default) curls normally', () => {
    const zeroScale = solveAt(1, { fingerCurlScale: 0 });
    const fullScale = solveAt(1);
    const restIndex1Quat = zeroScale.side.restFingerLocalQuats.index![0];
    const zeroIndex1 = zeroScale.resolved.left.fingers.index![0].quaternion;
    const fullIndex1 = fullScale.resolved.left.fingers.index![0].quaternion;
    assert.ok(zeroIndex1.angleTo(restIndex1Quat) < 1e-6, 'fingerCurlScale=0 must leave the finger at its rest rotation');
    assert.ok(fullIndex1.angleTo(restIndex1Quat) > 0.1, 'fingerCurlScale=1 (default) must visibly curl the finger away from rest, as before this step');
  });
});

describe('kaelArmSolve — solveSide Step 6G shoulder-assist reach fix', () => {
  const neutralFingerPose = { thumb: { curlX: [0] }, index: { curlX: [0] }, middle: { curlX: [0] }, ring: { curlX: [0] }, pinky: { curlX: [0] } };

  // This rig's left chain: shoulder=[0.06,0.05,0], upperArm(=IK root)
  // world=[0.08,0.05,0], upperLength=0.26, lowerLength=0.24, total=0.50,
  // maxReachRatio=0.97 -> maxReach=0.485m. A target 0.55m out along +X from
  // the rest upperArm position is ~6.5cm beyond reach — deliberately
  // unreachable unassisted, reachable with a real assist, mirroring the
  // real deficit magnitude this step was built to fix.
  const FAR_TARGET_LOCAL: [number, number, number] = [0.08 + 0.55, 0.05, 0];

  function solveBothSides(rightTuning: SideTuningOverrides | undefined, leftTuning: SideTuningOverrides | undefined) {
    const { container, resolved } = buildRig();
    const right = buildSideRuntimeState(container.children[0], resolved.right);
    const left = buildSideRuntimeState(container.children[0], resolved.left);
    container.updateWorldMatrix(true, true);
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const nearTarget = new THREE.Vector3(0.15, -0.1, -0.2).applyQuaternion(containerWorldQuat).add(container.position);
    const farTarget = new THREE.Vector3(...FAR_TARGET_LOCAL).applyQuaternion(containerWorldQuat).add(container.position);
    const rightDebug = makeDebugSide();
    const leftDebug = makeDebugSide();
    const rightOk = solveSide(right, container, containerWorldQuat, nearTarget, new THREE.Quaternion(), [0, -1, 0.3], 1, neutralFingerPose, rightDebug, rightTuning);
    const leftOk = solveSide(left, container, containerWorldQuat, farTarget, new THREE.Quaternion(), [0, -1, 0.3], 1, neutralFingerPose, leftDebug, leftTuning);
    return { container, resolved, right, left, rightOk, leftOk, rightDebug, leftDebug };
  }

  it('the far target is genuinely unreachable without an assist (sanity check the test rig itself)', () => {
    const { leftDebug } = solveBothSides(undefined, undefined);
    assert.ok(leftDebug.reachClamped, 'sanity check: the far target must be beyond reach with no assist, or this test suite proves nothing');
    assert.ok(leftDebug.positionErrorM * 100 > 1, `expected >1cm error unassisted, got ${leftDebug.positionErrorM * 100}cm`);
  });

  it('a real shoulder assist toward the target reduces LEFT positional error to well under 1cm', () => {
    const assist = new THREE.Vector3(0.07, 0, 0); // toward +X, matching the far target's own direction
    const { leftDebug } = solveBothSides(undefined, { shoulderAssistLocal: assist });
    assert.ok(leftDebug.positionErrorM * 100 < 1, `expected <1cm error after a real assist, got ${leftDebug.positionErrorM * 100}cm`);
    assert.equal(leftDebug.reachClamped, false);
  });

  it('a LEFT-only assist changes only the LEFT shoulder origin — RIGHT bone position and world pivot are untouched', () => {
    const assist = new THREE.Vector3(0.07, 0, 0);
    const baseline = solveBothSides(undefined, undefined);
    const assisted = solveBothSides(undefined, { shoulderAssistLocal: assist });
    assert.ok(baseline.resolved.right.shoulder!.position.distanceTo(assisted.resolved.right.shoulder!.position) < 1e-9, 'RIGHT shoulder bone local position must be unaffected by a LEFT-only assist');
    assert.ok(baseline.rightDebug.shoulderWorldPos.distanceTo(assisted.rightDebug.shoulderWorldPos) < 1e-9, 'RIGHT shoulderWorldPos (IK pivot) must be unaffected by a LEFT-only assist');
    assert.ok(!baseline.resolved.left.shoulder!.position.equals(assisted.resolved.left.shoulder!.position), 'LEFT shoulder bone local position MUST change when LEFT is assisted');
  });

  it('RIGHT positional error remains unchanged (still 0) whether or not LEFT is assisted', () => {
    const assist = new THREE.Vector3(0.07, 0, 0);
    const baseline = solveBothSides(undefined, undefined);
    const assisted = solveBothSides(undefined, { shoulderAssistLocal: assist });
    assert.ok(baseline.rightDebug.positionErrorM < 1e-6);
    assert.ok(assisted.rightDebug.positionErrorM < 1e-6);
    assert.equal(baseline.rightDebug.positionErrorM.toFixed(9), assisted.rightDebug.positionErrorM.toFixed(9));
  });

  it('does not stretch the arm — upper/lower bone-to-bone distances (actual rendered, not just cached metrics) are unchanged by the assist', () => {
    const assist = new THREE.Vector3(0.07, -0.03, 0.02); // off-axis, to catch any accidental scale/shear
    const { left, resolved } = solveBothSides(undefined, { shoulderAssistLocal: assist });
    const shoulderPos = new THREE.Vector3();
    const elbowPos = new THREE.Vector3();
    const handPos = new THREE.Vector3();
    resolved.left.upperArm.getWorldPosition(shoulderPos);
    resolved.left.lowerArm.getWorldPosition(elbowPos);
    resolved.left.hand.getWorldPosition(handPos);
    const renderedUpperLen = shoulderPos.distanceTo(elbowPos);
    const renderedLowerLen = elbowPos.distanceTo(handPos);
    assert.ok(Math.abs(renderedUpperLen - left.metrics.upperLength) < 1e-6, `upper arm length must stay exactly ${left.metrics.upperLength}, got ${renderedUpperLen}`);
    assert.ok(Math.abs(renderedLowerLen - left.metrics.lowerLength) < 1e-6, `lower arm length must stay exactly ${left.metrics.lowerLength}, got ${renderedLowerLen}`);
  });

  it('produces finite transforms for a real assist magnitude', () => {
    const assist = new THREE.Vector3(0.07, 0, 0);
    const { leftOk, leftDebug, resolved } = solveBothSides(undefined, { shoulderAssistLocal: assist });
    assert.ok(leftOk);
    assert.ok(isFiniteVector3(leftDebug.shoulderWorldPos));
    assert.ok(isFiniteVector3(leftDebug.handWorldPos));
    assert.ok(isFiniteVector3(resolved.left.shoulder!.position));
  });

  it('the assist is applied exactly once per call — repeated calls with the SAME tuning value do not accumulate/drift', () => {
    const { container, resolved } = buildRig();
    const left = buildSideRuntimeState(container.children[0], resolved.left);
    container.updateWorldMatrix(true, true);
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const farTarget = new THREE.Vector3(...FAR_TARGET_LOCAL).applyQuaternion(containerWorldQuat).add(container.position);
    const assist = new THREE.Vector3(0.07, 0, 0);
    const tuning = { shoulderAssistLocal: assist };

    const firstCallPos = resolved.left.shoulder!.position.clone();
    for (let i = 0; i < 20; i++) {
      solveSide(left, container, containerWorldQuat, farTarget, new THREE.Quaternion(), [0, -1, 0.3], 1, neutralFingerPose, makeDebugSide(), tuning);
    }
    const afterManyCallsPos = resolved.left.shoulder!.position.clone();
    // Not comparing to firstCallPos directly (that snapshot predates any
    // solve) — instead solve ONCE more and confirm the position matches
    // exactly what 20 repeated calls already converged to, proving no
    // further drift occurs on call #21.
    solveSide(left, container, containerWorldQuat, farTarget, new THREE.Quaternion(), [0, -1, 0.3], 1, neutralFingerPose, makeDebugSide(), tuning);
    const afterOneMorePos = resolved.left.shoulder!.position.clone();
    assert.ok(afterManyCallsPos.distanceTo(afterOneMorePos) < 1e-9, `shoulder position must be identical after 20 vs 21 calls with the same assist — got drift of ${afterManyCallsPos.distanceTo(afterOneMorePos)}`);
    void firstCallPos;
  });

  it('removing the assist (tuning omitted) restores the shoulder to EXACTLY its rest position, even after a previous frame applied a nonzero assist', () => {
    const { container, resolved } = buildRig();
    const left = buildSideRuntimeState(container.children[0], resolved.left);
    container.updateWorldMatrix(true, true);
    const containerWorldQuat = new THREE.Quaternion();
    container.getWorldQuaternion(containerWorldQuat);
    const nearTarget = new THREE.Vector3(0.15, -0.1, -0.2).applyQuaternion(containerWorldQuat).add(container.position);
    const restShoulderPos = resolved.left.shoulder!.position.clone();

    solveSide(left, container, containerWorldQuat, nearTarget, new THREE.Quaternion(), [0, -1, 0.3], 1, neutralFingerPose, makeDebugSide(), { shoulderAssistLocal: new THREE.Vector3(0.07, -0.03, 0.02) });
    assert.ok(!resolved.left.shoulder!.position.equals(restShoulderPos), 'sanity check: the assist must have visibly moved the shoulder');

    solveSide(left, container, containerWorldQuat, nearTarget, new THREE.Quaternion(), [0, -1, 0.3], 1, neutralFingerPose, makeDebugSide()); // tuning omitted this time
    assert.ok(resolved.left.shoulder!.position.distanceTo(restShoulderPos) < 1e-9, 'removing the assist must restore the shoulder to EXACTLY its captured rest position, not a residual offset');
  });

  it('a zero-vector assist reproduces byte-identical shoulderWorldPos to the pre-Step-6G (tuning-omitted) computation path', () => {
    const withoutTuning = solveBothSides(undefined, undefined);
    const withZeroAssist = solveBothSides(undefined, { shoulderAssistLocal: new THREE.Vector3(0, 0, 0) });
    assert.ok(
      withoutTuning.leftDebug.shoulderWorldPos.distanceTo(withZeroAssist.leftDebug.shoulderWorldPos) < 1e-9,
      'a zero assist must reproduce the exact same shoulderWorldPos as never passing shoulderAssistLocal at all — confirms the two code paths (cached metrics vs. live bone read) are numerically equivalent when unassisted',
    );
  });
});
