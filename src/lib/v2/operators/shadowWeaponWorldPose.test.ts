import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getShadowWeaponWorldPose, invalidateShadowWeaponWorldPose, publishShadowWeaponWorldPose } from './shadowWeaponWorldPose';

/**
 * Same module-level-singleton testing convention as `gripWorldPose.test.ts`
 * — every test explicitly re-establishes the state it depends on (publish
 * or invalidate) rather than relying on `it()` block ordering, since the
 * singleton persists across tests in the same process.
 */

const POS = new THREE.Vector3(1, 2, 3);
const QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4);

describe('shadowWeaponWorldPose — lifecycle', () => {
  it('a valid publish succeeds and flips ready true', () => {
    const ok = publishShadowWeaponWorldPose(POS, QUAT);
    assert.strictEqual(ok, true);
    const snap = getShadowWeaponWorldPose();
    assert.strictEqual(snap.ready, true);
    assert.ok(snap.position.equals(POS));
    assert.ok(snap.quaternion.equals(QUAT));
  });

  it('invalidate clears ready without needing to clear the last-published values', () => {
    publishShadowWeaponWorldPose(POS, QUAT);
    assert.strictEqual(getShadowWeaponWorldPose().ready, true);
    invalidateShadowWeaponWorldPose();
    assert.strictEqual(getShadowWeaponWorldPose().ready, false);
  });

  it('a subsequent valid publish after invalidate flips ready true again', () => {
    publishShadowWeaponWorldPose(POS, QUAT);
    invalidateShadowWeaponWorldPose();
    const ok = publishShadowWeaponWorldPose(POS, QUAT);
    assert.strictEqual(ok, true);
    assert.strictEqual(getShadowWeaponWorldPose().ready, true);
  });

  it('non-finite position is rejected — no publish occurs, nothing written', () => {
    publishShadowWeaponWorldPose(POS, QUAT);
    const before = getShadowWeaponWorldPose().position.clone();
    const badPos = new THREE.Vector3(NaN, 0, 0);
    const ok = publishShadowWeaponWorldPose(badPos, QUAT);
    assert.strictEqual(ok, false);
    assert.ok(getShadowWeaponWorldPose().position.equals(before), 'a rejected publish must not write anything, even partially');
  });

  it('non-finite quaternion is rejected atomically — position from the SAME bad call is also not written', () => {
    publishShadowWeaponWorldPose(POS, QUAT);
    const before = getShadowWeaponWorldPose().position.clone();
    const newPos = new THREE.Vector3(99, 99, 99);
    const badQuat = new THREE.Quaternion(NaN, 0, 0, 1);
    const ok = publishShadowWeaponWorldPose(newPos, badQuat);
    assert.strictEqual(ok, false);
    assert.ok(getShadowWeaponWorldPose().position.equals(before), 'no partial write — position must stay at its previous value when the quaternion in the same call is invalid');
  });

  it('getShadowWeaponWorldPose returns a stable reference across calls (no copy-per-read allocation)', () => {
    publishShadowWeaponWorldPose(POS, QUAT);
    const a = getShadowWeaponWorldPose();
    const b = getShadowWeaponWorldPose();
    assert.strictEqual(a, b);
  });
});
