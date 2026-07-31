import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFixedLightSpaceBasis, projectWorldToLightSpace, reconstructWorldFromLightSpace } from './playerCenteredShadowFrustumBasis';

const CANONICAL_LIGHT = new THREE.Vector3(12, 22, 8);
const CANONICAL_TARGET = new THREE.Vector3(0, 0, 0);
const CANONICAL_DISTANCE = CANONICAL_LIGHT.distanceTo(CANONICAL_TARGET);

describe('playerCenteredShadowFrustumBasis — buildFixedLightSpaceBasis', () => {
  it('does not mutate its input Vector3 arguments', () => {
    const light = new THREE.Vector3(12, 22, 8);
    const target = new THREE.Vector3(0, 0, 0);
    buildFixedLightSpaceBasis(light, target);
    assert.deepStrictEqual([light.x, light.y, light.z], [12, 22, 8]);
    assert.deepStrictEqual([target.x, target.y, target.z], [0, 0, 0]);
  });

  it('is deterministic — the same inputs produce numerically identical matrices', () => {
    const a = buildFixedLightSpaceBasis(CANONICAL_LIGHT, CANONICAL_TARGET);
    const b = buildFixedLightSpaceBasis(CANONICAL_LIGHT, CANONICAL_TARGET);
    assert.deepStrictEqual(a.worldMatrix.toArray(), b.worldMatrix.toArray());
    assert.deepStrictEqual(a.viewMatrix.toArray(), b.viewMatrix.toArray());
  });

  it('viewMatrix is the exact inverse of worldMatrix (round-trips identity)', () => {
    const basis = buildFixedLightSpaceBasis(CANONICAL_LIGHT, CANONICAL_TARGET);
    const identity = basis.worldMatrix.clone().multiply(basis.viewMatrix);
    const i = identity.toArray();
    const expected = new THREE.Matrix4().toArray();
    for (let k = 0; k < 16; k++) assert.ok(Math.abs(i[k] - expected[k]) < 1e-9, `element ${k} not identity`);
  });

  it('the light position itself projects to light-space origin (it is the eye of its own view space)', () => {
    const basis = buildFixedLightSpaceBasis(CANONICAL_LIGHT, CANONICAL_TARGET);
    const out = new THREE.Vector3();
    projectWorldToLightSpace(CANONICAL_LIGHT, basis, out);
    assert.ok(out.length() < 1e-9, `expected near-zero, got ${out.toArray()}`);
  });

  it('the target position projects to light-space (0, 0, -distance) — straight ahead, -Z forward convention', () => {
    const basis = buildFixedLightSpaceBasis(CANONICAL_LIGHT, CANONICAL_TARGET);
    const out = new THREE.Vector3();
    projectWorldToLightSpace(CANONICAL_TARGET, basis, out);
    assert.ok(Math.abs(out.x) < 1e-9, `expected x≈0, got ${out.x}`);
    assert.ok(Math.abs(out.y) < 1e-9, `expected y≈0, got ${out.y}`);
    assert.ok(Math.abs(out.z - -CANONICAL_DISTANCE) < 1e-9, `expected z≈${-CANONICAL_DISTANCE}, got ${out.z}`);
  });
});

describe('playerCenteredShadowFrustumBasis — project/reconstruct round-trip', () => {
  it('projecting then reconstructing an arbitrary world point returns the original point', () => {
    const basis = buildFixedLightSpaceBasis(CANONICAL_LIGHT, CANONICAL_TARGET);
    const original = new THREE.Vector3(3.7, 0, -12.4);
    const lightSpace = new THREE.Vector3();
    const roundTripped = new THREE.Vector3();
    projectWorldToLightSpace(original, basis, lightSpace);
    reconstructWorldFromLightSpace(lightSpace, basis, roundTripped);
    assert.ok(original.distanceTo(roundTripped) < 1e-9, `round-trip drifted: ${original.toArray()} -> ${roundTripped.toArray()}`);
  });

  it('round-trips correctly for a non-canonical basis too (not hard-coded to one geometry)', () => {
    const light = new THREE.Vector3(-5, 10, 3);
    const target = new THREE.Vector3(1, 0, 1);
    const basis = buildFixedLightSpaceBasis(light, target);
    const original = new THREE.Vector3(-2, 0, 4);
    const lightSpace = new THREE.Vector3();
    const roundTripped = new THREE.Vector3();
    projectWorldToLightSpace(original, basis, lightSpace);
    reconstructWorldFromLightSpace(lightSpace, basis, roundTripped);
    assert.ok(original.distanceTo(roundTripped) < 1e-9);
  });

  it('reuses the provided output Vector3 (zero allocation on the hot path)', () => {
    const basis = buildFixedLightSpaceBasis(CANONICAL_LIGHT, CANONICAL_TARGET);
    const out = new THREE.Vector3(-999, -999, -999);
    const result = projectWorldToLightSpace(new THREE.Vector3(1, 2, 3), basis, out);
    assert.strictEqual(result, out, 'must return the SAME object reference passed in');
  });

  it('translating a world point purely along the light-to-target axis changes only light-space Z, never X/Y', () => {
    // This is the empirically-confirmed fact from Step 8E-D.1A's own
    // measurement pass (see playerCenteredShadowFrustum.ts's doc comment):
    // projecting along a camera's own forward axis cannot change view-space
    // X/Y. A point moved 5 units further from the light (continuing past
    // the target, away from the light) must land at the SAME light-space
    // X/Y as the target itself, with Z exactly 5 MORE NEGATIVE (light-space
    // Z is -distance-from-light under the -Z-forward convention, so moving
    // further away decreases Z).
    const basis = buildFixedLightSpaceBasis(CANONICAL_LIGHT, CANONICAL_TARGET);
    const forward = CANONICAL_TARGET.clone().sub(CANONICAL_LIGHT).normalize();
    const movedPoint = CANONICAL_TARGET.clone().addScaledVector(forward, 5);
    const targetLightSpace = new THREE.Vector3();
    const movedLightSpace = new THREE.Vector3();
    projectWorldToLightSpace(CANONICAL_TARGET, basis, targetLightSpace);
    projectWorldToLightSpace(movedPoint, basis, movedLightSpace);
    assert.ok(Math.abs(targetLightSpace.x - movedLightSpace.x) < 1e-9);
    assert.ok(Math.abs(targetLightSpace.y - movedLightSpace.y) < 1e-9);
    assert.ok(Math.abs(movedLightSpace.z - (targetLightSpace.z - 5)) < 1e-9, 'Z should decrease by exactly the distance moved further from the light along forward');
  });
});
