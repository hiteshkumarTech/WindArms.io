import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PLAYER } from '@/lib/game/constants';
import { computeLowerBodyWorldTransform, LOWERBODY_CANONICAL_LOCAL_OFFSET, type LowerBodyTransformOutput } from './lowerBodyTransform';
import { SHADOW_BODY_PHYSICAL_LOCAL_OFFSET } from './shadowBodyTransform';

function out(): LowerBodyTransformOutput {
  return { position: new THREE.Vector3(), yaw: 0 };
}
const scratch = new THREE.Vector3();

describe('shadowBodyTransform — SHADOW_BODY_PHYSICAL_LOCAL_OFFSET (Step 8E-B)', () => {
  it('Y term is exactly the derived capsule-centre-to-feet reconciliation, nothing more', () => {
    const [, y] = SHADOW_BODY_PHYSICAL_LOCAL_OFFSET;
    const derived = -(PLAYER.HALF_HEIGHT + PLAYER.RADIUS);
    assert.strictEqual(y, derived);
    assert.ok(Math.abs(y - -1.0) < 1e-9, `expected exactly -1.0m, got ${y}`);
  });

  it('has no X or Z component — no camera-forward/silhouette offset reused from the visible body', () => {
    const [x, , z] = SHADOW_BODY_PHYSICAL_LOCAL_OFFSET;
    assert.strictEqual(x, 0);
    assert.strictEqual(z, 0);
  });

  it('is genuinely a different, smaller-magnitude offset than the visible body\'s own canonical offset — proves this is not an accidental re-export', () => {
    assert.notDeepStrictEqual([...SHADOW_BODY_PHYSICAL_LOCAL_OFFSET], [...LOWERBODY_CANONICAL_LOCAL_OFFSET]);
    const shadowY = SHADOW_BODY_PHYSICAL_LOCAL_OFFSET[1];
    const visibleY = LOWERBODY_CANONICAL_LOCAL_OFFSET[1];
    assert.ok(Math.abs(shadowY) < Math.abs(visibleY), 'the shadow offset must not carry the visible body\'s extra -0.2m silhouette nudge');
    assert.notStrictEqual(SHADOW_BODY_PHYSICAL_LOCAL_OFFSET[2], LOWERBODY_CANONICAL_LOCAL_OFFSET[2], 'the shadow offset must not carry the visible body\'s -0.5m forward nudge');
  });
});

describe('shadowBodyTransform — computeLowerBodyWorldTransform with the physical offset (Step 8E-B)', () => {
  it('capsule-centre-to-feet placement: with zero world position/yaw, output Y equals exactly -1.0m', () => {
    const o = out();
    computeLowerBodyWorldTransform(new THREE.Vector3(0, 0, 0), 0, SHADOW_BODY_PHYSICAL_LOCAL_OFFSET, 0, scratch, o);
    assert.ok(Math.abs(o.position.y - -1.0) < 1e-9);
    assert.strictEqual(o.position.x, 0);
    assert.strictEqual(o.position.z, 0);
  });

  it('no camera-forward offset: at any yaw, the output position never gains an X/Z component from this offset alone', () => {
    for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -1.3]) {
      const o = out();
      const worldPos = new THREE.Vector3(5, 2, -3);
      computeLowerBodyWorldTransform(worldPos, yaw, SHADOW_BODY_PHYSICAL_LOCAL_OFFSET, 0, scratch, o);
      assert.ok(Math.abs(o.position.x - worldPos.x) < 1e-9, `yaw=${yaw}: X should equal the input world X exactly (no forward offset to rotate)`);
      assert.ok(Math.abs(o.position.z - worldPos.z) < 1e-9, `yaw=${yaw}: Z should equal the input world Z exactly`);
      assert.ok(Math.abs(o.position.y - (worldPos.y - 1.0)) < 1e-9);
    }
  });

  it('yaw-only orientation: output yaw exactly equals the published world yaw, no offset applied', () => {
    const o = out();
    computeLowerBodyWorldTransform(new THREE.Vector3(), 1.234, SHADOW_BODY_PHYSICAL_LOCAL_OFFSET, 0, scratch, o);
    assert.strictEqual(o.yaw, 1.234);
  });

  it('has no pitch parameter at all — camera pitch cannot influence this function\'s output by construction (same guarantee as the visible body\'s own transform)', () => {
    const worldPos = new THREE.Vector3(3, 3, 3);
    const oA = out();
    const oB = out();
    computeLowerBodyWorldTransform(worldPos, 0.6, SHADOW_BODY_PHYSICAL_LOCAL_OFFSET, 0, scratch, oA);
    computeLowerBodyWorldTransform(worldPos, 0.6, SHADOW_BODY_PHYSICAL_LOCAL_OFFSET, 0, scratch, oB);
    assert.ok(oA.position.equals(oB.position));
    assert.strictEqual(oA.yaw, oB.yaw);
  });

  it('respawn snap: a discontinuous world-position jump (teleport) produces an immediate, exact, finite output with no interpolation artifact', () => {
    const oBefore = out();
    computeLowerBodyWorldTransform(new THREE.Vector3(20, 5, 20), 2.5, SHADOW_BODY_PHYSICAL_LOCAL_OFFSET, 0, scratch, oBefore);
    const oAfter = out();
    computeLowerBodyWorldTransform(new THREE.Vector3(0, 3, 10), 0, SHADOW_BODY_PHYSICAL_LOCAL_OFFSET, 0, scratch, oAfter);
    assert.ok(Math.abs(oAfter.position.x - 0) < 1e-9);
    assert.ok(Math.abs(oAfter.position.y - 2.0) < 1e-9);
    assert.ok(Math.abs(oAfter.position.z - 10) < 1e-9);
    assert.strictEqual(oAfter.yaw, 0);
  });

  it('finite transforms for a representative range of yaw/position inputs', () => {
    for (const yaw of [-Math.PI, -1.5, 0, 1.5, Math.PI, Math.PI * 3]) {
      const o = out();
      computeLowerBodyWorldTransform(new THREE.Vector3(1, 1, 1), yaw, SHADOW_BODY_PHYSICAL_LOCAL_OFFSET, 0, scratch, o);
      assert.ok(Number.isFinite(o.position.x) && Number.isFinite(o.position.y) && Number.isFinite(o.position.z));
      assert.ok(Number.isFinite(o.yaw));
    }
  });
});
