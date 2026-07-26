import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { beginBodyPoseGeneration, getFirstPersonBodyWorldPose, invalidateBodyWorldPose, publishBodyWorldPose } from './firstPersonBodyPose';

/**
 * firstPersonBodyPose.ts is a MODULE-LEVEL singleton (same convention as
 * gripWorldPose.ts) — state persists across `it()` blocks in the same
 * process unless reset, so every test here starts with its OWN
 * `beginBodyPoseGeneration()` call, matching the real mount-time reset
 * behavior rather than working around shared state.
 */

const POS1 = new THREE.Vector3(1, 2, 3);
const POS2 = new THREE.Vector3(4, 5, 6);

describe('firstPersonBodyPose — lifecycle (Step 8C)', () => {
  it('a fresh generation starts not-ready', () => {
    beginBodyPoseGeneration();
    assert.strictEqual(getFirstPersonBodyWorldPose().ready, false);
  });

  it('beginBodyPoseGeneration increments the generation counter each call', () => {
    const g1 = beginBodyPoseGeneration();
    const g2 = beginBodyPoseGeneration();
    assert.ok(g2 > g1, `expected g2 (${g2}) > g1 (${g1})`);
  });

  it('a valid publish under the current generation succeeds and flips ready true', () => {
    const gen = beginBodyPoseGeneration();
    const ok = publishBodyWorldPose(gen, POS1, 1.23, true, 0);
    assert.strictEqual(ok, true);
    const snap = getFirstPersonBodyWorldPose();
    assert.strictEqual(snap.ready, true);
    assert.ok(snap.worldPosition.equals(POS1));
    assert.strictEqual(snap.worldYaw, 1.23);
    assert.strictEqual(snap.grounded, true);
  });

  it('a stale generation cannot publish (route remount / straggler-frame protection)', () => {
    const staleGen = beginBodyPoseGeneration();
    beginBodyPoseGeneration(); // supersedes staleGen — simulates a route remount
    const ok = publishBodyWorldPose(staleGen, POS1, 0, true, 0);
    assert.strictEqual(ok, false);
    assert.strictEqual(getFirstPersonBodyWorldPose().ready, false, 'the newer generation should still read not-ready — the stale publish must not have written anything');
  });

  it('a stale generation cannot invalidate a newer, already-valid pose', () => {
    const staleGen = beginBodyPoseGeneration();
    const newGen = beginBodyPoseGeneration();
    publishBodyWorldPose(newGen, POS1, 0, true, 0);
    assert.strictEqual(getFirstPersonBodyWorldPose().ready, true);

    invalidateBodyWorldPose(staleGen); // old instance's unmount firing late
    assert.strictEqual(getFirstPersonBodyWorldPose().ready, true, 'a stale unmount must not clear the newer, valid generation');
  });

  it('the current generation CAN invalidate its own pose (real unmount)', () => {
    const gen = beginBodyPoseGeneration();
    publishBodyWorldPose(gen, POS1, 0, true, 0);
    assert.strictEqual(getFirstPersonBodyWorldPose().ready, true);
    invalidateBodyWorldPose(gen);
    assert.strictEqual(getFirstPersonBodyWorldPose().ready, false);
  });

  it('invalidate with no generation argument always clears ready unconditionally', () => {
    const gen = beginBodyPoseGeneration();
    publishBodyWorldPose(gen, POS1, 0, true, 0);
    invalidateBodyWorldPose();
    assert.strictEqual(getFirstPersonBodyWorldPose().ready, false);
  });

  it('non-finite position is rejected — no publish occurs', () => {
    const gen = beginBodyPoseGeneration();
    const badPos = new THREE.Vector3(NaN, 0, 0);
    const ok = publishBodyWorldPose(gen, badPos, 0, true, 0);
    assert.strictEqual(ok, false);
    assert.strictEqual(getFirstPersonBodyWorldPose().ready, false);
  });

  it('non-finite yaw is rejected — no publish occurs, position stays untouched from before', () => {
    const gen = beginBodyPoseGeneration();
    publishBodyWorldPose(gen, POS1, 0.5, true, 0);
    const before = getFirstPersonBodyWorldPose().worldPosition.clone();

    const ok = publishBodyWorldPose(gen, POS2, Infinity, true, 0);
    assert.strictEqual(ok, false);
    assert.ok(getFirstPersonBodyWorldPose().worldPosition.equals(before), 'a rejected publish must not write the position either — no partial-invalid publish');
  });

  it('respawnNonce and grounded publish correctly and independently of position/yaw', () => {
    const gen = beginBodyPoseGeneration();
    publishBodyWorldPose(gen, POS1, 0, false, 7);
    const snap = getFirstPersonBodyWorldPose();
    assert.strictEqual(snap.grounded, false);
    assert.strictEqual(snap.respawnNonce, 7);
  });

  it('publish copies the input position — mutating the caller-owned vector afterward does not affect the snapshot', () => {
    const gen = beginBodyPoseGeneration();
    const callerOwned = new THREE.Vector3(10, 10, 10);
    publishBodyWorldPose(gen, callerOwned, 0, true, 0);
    callerOwned.set(999, 999, 999);
    assert.ok(getFirstPersonBodyWorldPose().worldPosition.equals(new THREE.Vector3(10, 10, 10)), 'snapshot must hold its own copy, not a live reference to the caller-owned vector');
  });

  it('getFirstPersonBodyWorldPose returns a stable reference across calls (no copy-per-read allocation)', () => {
    beginBodyPoseGeneration();
    const a = getFirstPersonBodyWorldPose();
    const b = getFirstPersonBodyWorldPose();
    assert.strictEqual(a, b);
  });
});
