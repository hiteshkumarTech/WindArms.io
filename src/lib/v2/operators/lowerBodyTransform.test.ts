import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PLAYER } from '@/lib/game/constants';
import { computeLowerBodyWorldTransform, LOWERBODY_CANONICAL_LOCAL_OFFSET, type LowerBodyTransformOutput } from './lowerBodyTransform';

function out(): LowerBodyTransformOutput {
  return { position: new THREE.Vector3(), yaw: 0 };
}

const scratch = new THREE.Vector3();

describe('computeLowerBodyWorldTransform (Step 8C) — yaw-only body transform', () => {
  it('with zero offsets, output position equals the input world position exactly', () => {
    const worldPos = new THREE.Vector3(3, 0.5, -7);
    const o = out();
    computeLowerBodyWorldTransform(worldPos, 0.7, [0, 0, 0], 0, scratch, o);
    assert.ok(o.position.equals(worldPos));
    assert.strictEqual(o.yaw, 0.7);
  });

  it('yaw offset is additive with the published world yaw', () => {
    const o = out();
    computeLowerBodyWorldTransform(new THREE.Vector3(), 1.0, [0, 0, 0], 0.25, scratch, o);
    assert.ok(Math.abs(o.yaw - 1.25) < 1e-9);
  });

  it('a local +Z offset is rotated by the effective yaw, not applied in world-space raw', () => {
    // At yaw = 0 (three.js YXZ convention: yaw 0 looks down -Z), a
    // local-space offset should map 1:1 onto world space with no rotation.
    const o1 = out();
    computeLowerBodyWorldTransform(new THREE.Vector3(0, 0, 0), 0, [0, 0, 1], 0, scratch, o1);
    assert.ok(o1.position.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-9);

    // At yaw = PI/2, the SAME local offset must land somewhere different —
    // proving it was actually rotated by yaw, not just added verbatim.
    const o2 = out();
    computeLowerBodyWorldTransform(new THREE.Vector3(0, 0, 0), Math.PI / 2, [0, 0, 1], 0, scratch, o2);
    assert.ok(o2.position.distanceTo(o1.position) > 0.5, 'a 90-degree yaw difference must visibly change where a local-space offset lands in world space');
  });

  it('a Y-axis local offset is unaffected by yaw (rotation about Y leaves Y unchanged)', () => {
    const o = out();
    computeLowerBodyWorldTransform(new THREE.Vector3(1, 2, 3), 1.234, [0, 0.5, 0], 0, scratch, o);
    assert.ok(Math.abs(o.position.y - 2.5) < 1e-9);
  });

  it('LOWERBODY_CANONICAL_LOCAL_OFFSET Y term is the derived capsule half-extent PLUS the Step 8C.1 empirical silhouette nudge (-1.2m total)', () => {
    const [, y] = LOWERBODY_CANONICAL_LOCAL_OFFSET;
    const derived = -(PLAYER.HALF_HEIGHT + PLAYER.RADIUS);
    assert.ok(Math.abs(y - (derived - 0.2)) < 1e-9, `expected derived(${derived}) - 0.2 = ${derived - 0.2}, got ${y}`);
  });

  it('LOWERBODY_CANONICAL_LOCAL_OFFSET has no X component and a real (not tiny) forward (-Z) nudge — Step 8C.1 found the Step 8C -0.1m nudge was too small to reveal the leg silhouette', () => {
    const [x, , z] = LOWERBODY_CANONICAL_LOCAL_OFFSET;
    assert.strictEqual(x, 0);
    assert.ok(z <= -0.4 && z > -0.7, `expected a real forward nudge in [-0.7, -0.4], got ${z}`);
  });

  it('has no pitch parameter at all — camera pitch cannot influence this function\'s output by construction', () => {
    // There is no pitch argument in the signature; this test exists to make
    // that guarantee explicit and machine-checked rather than only a
    // convention documented in prose. Calling with the same yaw and
    // different "hypothetical pitch" (which isn't even accepted) always
    // produces the identical result.
    const worldPos = new THREE.Vector3(5, 5, 5);
    const oA = out();
    const oB = out();
    computeLowerBodyWorldTransform(worldPos, 0.4, [0.1, 0.2, 0.3], 0, scratch, oA);
    computeLowerBodyWorldTransform(worldPos, 0.4, [0.1, 0.2, 0.3], 0, scratch, oB);
    assert.ok(oA.position.equals(oB.position));
    assert.strictEqual(oA.yaw, oB.yaw);
  });

  it('output position is finite for a representative range of yaw/offset inputs', () => {
    for (const yaw of [-Math.PI, -1.5, 0, 1.5, Math.PI, Math.PI * 3]) {
      const o = out();
      computeLowerBodyWorldTransform(new THREE.Vector3(1, 1, 1), yaw, [0.2, -0.1, 0.05], 0.1, scratch, o);
      assert.ok(Number.isFinite(o.position.x) && Number.isFinite(o.position.y) && Number.isFinite(o.position.z));
      assert.ok(Number.isFinite(o.yaw));
    }
  });
});
