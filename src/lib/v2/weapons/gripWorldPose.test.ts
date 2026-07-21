import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { beginGripGeneration, getGripWorldPose, invalidateGripWorldPose, publishGripWorldPose } from './gripWorldPose';

/**
 * gripWorldPose.ts is a MODULE-LEVEL singleton (by design — same convention
 * as muzzleWorldPose.ts, matches how VortexViewmodel actually consumes it).
 * That means state persists across `it()` blocks in the SAME process
 * unless explicitly reset — so every test here starts with its OWN
 * `beginGripGeneration()` call, which is exactly the real mount-time reset
 * behavior anyway (not a test-only workaround), keeping tests independent
 * without needing to reach into the module's private state.
 */

const P1 = new THREE.Vector3(1, 2, 3);
const Q1 = new THREE.Quaternion(0, 0, 0, 1);
const P2 = new THREE.Vector3(4, 5, 6);
const Q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
const WEAPON_POS = new THREE.Vector3(0, 0, 0);
const WEAPON_QUAT = new THREE.Quaternion();

describe('gripWorldPose — lifecycle', () => {
  it('a fresh generation starts not-ready', () => {
    beginGripGeneration('test-model');
    assert.strictEqual(getGripWorldPose().ready, false);
  });

  it('beginGripGeneration increments the generation counter each call', () => {
    const g1 = beginGripGeneration('a');
    const g2 = beginGripGeneration('b');
    assert.ok(g2 > g1, `expected g2 (${g2}) > g1 (${g1})`);
  });

  it('a valid publish under the current generation succeeds and flips ready true', () => {
    const gen = beginGripGeneration('m');
    const ok = publishGripWorldPose(gen, P1, Q1, P2, Q2, WEAPON_POS, WEAPON_QUAT);
    assert.strictEqual(ok, true);
    const snap = getGripWorldPose();
    assert.strictEqual(snap.ready, true);
    assert.ok(snap.rightPosition.equals(P1));
    assert.ok(snap.leftPosition.equals(P2));
  });

  it('a stale generation cannot publish', () => {
    const staleGen = beginGripGeneration('old');
    beginGripGeneration('new'); // supersedes staleGen
    const ok = publishGripWorldPose(staleGen, P1, Q1, P2, Q2, WEAPON_POS, WEAPON_QUAT);
    assert.strictEqual(ok, false);
    assert.strictEqual(getGripWorldPose().ready, false, 'the newer generation should still read not-ready — the stale publish must not have written anything');
  });

  it('a stale generation cannot invalidate a newer, already-valid pose', () => {
    const staleGen = beginGripGeneration('old');
    const newGen = beginGripGeneration('new');
    publishGripWorldPose(newGen, P1, Q1, P2, Q2, WEAPON_POS, WEAPON_QUAT);
    assert.strictEqual(getGripWorldPose().ready, true);

    invalidateGripWorldPose(staleGen); // old instance's unmount firing late
    assert.strictEqual(getGripWorldPose().ready, true, 'a stale unmount must not clear the newer, valid generation');
  });

  it('the current generation CAN invalidate its own pose', () => {
    const gen = beginGripGeneration('m');
    publishGripWorldPose(gen, P1, Q1, P2, Q2, WEAPON_POS, WEAPON_QUAT);
    assert.strictEqual(getGripWorldPose().ready, true);
    invalidateGripWorldPose(gen);
    assert.strictEqual(getGripWorldPose().ready, false);
  });

  it('invalidate with no generation argument always clears ready unconditionally', () => {
    const gen = beginGripGeneration('m');
    publishGripWorldPose(gen, P1, Q1, P2, Q2, WEAPON_POS, WEAPON_QUAT);
    invalidateGripWorldPose();
    assert.strictEqual(getGripWorldPose().ready, false);
  });

  it('beginGripGeneration resets ready to false even mid-way through a previously-valid generation', () => {
    const gen = beginGripGeneration('m');
    publishGripWorldPose(gen, P1, Q1, P2, Q2, WEAPON_POS, WEAPON_QUAT);
    assert.strictEqual(getGripWorldPose().ready, true);
    beginGripGeneration('m2');
    assert.strictEqual(getGripWorldPose().ready, false);
  });

  it('right and left publish atomically — both update together in one call, never independently', () => {
    const gen = beginGripGeneration('m');
    publishGripWorldPose(gen, P1, Q1, P2, Q2, WEAPON_POS, WEAPON_QUAT);
    const snap1 = getGripWorldPose();
    assert.ok(snap1.rightPosition.equals(P1) && snap1.leftPosition.equals(P2));

    // A second publish call changes BOTH hands together — there is no API
    // surface to update only one, which is the actual guarantee under test
    // (attempting to call with only "right" data isn't even expressible).
    const P3 = new THREE.Vector3(7, 8, 9);
    const P4 = new THREE.Vector3(10, 11, 12);
    publishGripWorldPose(gen, P3, Q1, P4, Q2, WEAPON_POS, WEAPON_QUAT);
    const snap2 = getGripWorldPose();
    assert.ok(snap2.rightPosition.equals(P3) && snap2.leftPosition.equals(P4), 'both hands must reflect the same publish call together');
  });

  it('modelId changes with a new generation', () => {
    beginGripGeneration('model-a');
    assert.strictEqual(getGripWorldPose().modelId, 'model-a');
    beginGripGeneration('model-b');
    assert.strictEqual(getGripWorldPose().modelId, 'model-b');
  });

  it('non-finite right position is rejected — no publish occurs', () => {
    const gen = beginGripGeneration('m');
    const badPos = new THREE.Vector3(NaN, 0, 0);
    const ok = publishGripWorldPose(gen, badPos, Q1, P2, Q2, WEAPON_POS, WEAPON_QUAT);
    assert.strictEqual(ok, false);
    assert.strictEqual(getGripWorldPose().ready, false);
  });

  it('non-finite left quaternion is rejected — no publish occurs (right stays untouched from before)', () => {
    const gen = beginGripGeneration('m');
    publishGripWorldPose(gen, P1, Q1, P2, Q2, WEAPON_POS, WEAPON_QUAT);
    const rightBefore = getGripWorldPose().rightPosition.clone();

    const badQuat = new THREE.Quaternion(NaN, 0, 0, 1);
    const ok = publishGripWorldPose(gen, new THREE.Vector3(99, 99, 99), Q1, P2, badQuat, WEAPON_POS, WEAPON_QUAT);
    assert.strictEqual(ok, false);
    assert.ok(getGripWorldPose().rightPosition.equals(rightBefore), 'a rejected publish (bad left data) must not write the right hand either — no partial-invalid-data publish');
  });

  it('non-finite weapon world position is rejected', () => {
    const gen = beginGripGeneration('m');
    const badWeaponPos = new THREE.Vector3(Infinity, 0, 0);
    const ok = publishGripWorldPose(gen, P1, Q1, P2, Q2, badWeaponPos, WEAPON_QUAT);
    assert.strictEqual(ok, false);
  });

  it('getGripWorldPose returns a stable reference across calls (no copy-per-read allocation)', () => {
    beginGripGeneration('m');
    const a = getGripWorldPose();
    const b = getGripWorldPose();
    assert.strictEqual(a, b);
  });
});
