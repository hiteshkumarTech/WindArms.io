import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { composeRuntimeAnchorMatrix, resolveRuntimeAnchorWorldPose } from './runtimeAnchorMath';
import type { RuntimeGripAnchor } from './vortexRuntimeAnchors';

function anchor(position: readonly [number, number, number], rotationEuler: readonly [number, number, number] = [0, 0, 0]): RuntimeGripAnchor {
  return { position, rotationEuler, rotationOrder: 'XYZ' };
}

function makeOutput() {
  return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
}

describe('runtimeAnchorMath — composeRuntimeAnchorMatrix', () => {
  it('produces identity for zero position/rotation', () => {
    const m = composeRuntimeAnchorMatrix([0, 0, 0], [0, 0, 0], 'XYZ');
    const identity = new THREE.Matrix4();
    assert.ok(m.equals(identity));
  });

  it('encodes translation correctly', () => {
    const m = composeRuntimeAnchorMatrix([1, 2, 3], [0, 0, 0], 'XYZ');
    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(m);
    assert.ok(pos.equals(new THREE.Vector3(1, 2, 3)));
  });

  it('non-finite position falls back to identity (never throws, never NaN)', () => {
    const m = composeRuntimeAnchorMatrix([NaN, 0, 0], [0, 0, 0], 'XYZ');
    assert.ok(m.equals(new THREE.Matrix4()));
  });

  it('non-finite rotation falls back to identity', () => {
    const m = composeRuntimeAnchorMatrix([1, 1, 1], [Infinity, 0, 0], 'XYZ');
    assert.ok(m.equals(new THREE.Matrix4()));
  });

  it('reuses provided output objects (zero allocation contract)', () => {
    const outMatrix = new THREE.Matrix4();
    const scratchQuat = new THREE.Quaternion();
    const scratchEuler = new THREE.Euler();
    const scratchPos = new THREE.Vector3();
    const result = composeRuntimeAnchorMatrix([1, 0, 0], [0, 0, 0], 'XYZ', outMatrix, scratchQuat, scratchEuler, scratchPos);
    assert.strictEqual(result, outMatrix, 'must return the SAME matrix instance passed in, not a fresh allocation');
  });

  it('does not mutate the input tuple arrays', () => {
    const pos: readonly [number, number, number] = [1, 2, 3];
    const rot: readonly [number, number, number] = [0.1, 0.2, 0.3];
    const posCopy = [...pos];
    const rotCopy = [...rot];
    composeRuntimeAnchorMatrix(pos, rot, 'XYZ');
    assert.deepStrictEqual([...pos], posCopy);
    assert.deepStrictEqual([...rot], rotCopy);
  });
});

describe('runtimeAnchorMath — resolveRuntimeAnchorWorldPose: transform composition', () => {
  it('identity parent transform: world position/quaternion equal the (scaled) local values', () => {
    const groupPos = new THREE.Vector3(0, 0, 0);
    const groupQuat = new THREE.Quaternion();
    const out = makeOutput();
    const ok = resolveRuntimeAnchorWorldPose(anchor([1, 2, 3]), 1, groupPos, groupQuat, out);
    assert.ok(ok);
    assert.ok(out.position.equals(new THREE.Vector3(1, 2, 3)));
    assert.ok(out.quaternion.equals(new THREE.Quaternion()));
  });

  it('translated parent: world position offsets by the parent translation', () => {
    const groupPos = new THREE.Vector3(10, 0, 0);
    const groupQuat = new THREE.Quaternion();
    const out = makeOutput();
    resolveRuntimeAnchorWorldPose(anchor([1, 0, 0]), 1, groupPos, groupQuat, out);
    assert.ok(out.position.equals(new THREE.Vector3(11, 0, 0)));
  });

  it('rotated parent: local offset is rotated into parent world orientation before translation', () => {
    const groupPos = new THREE.Vector3(0, 0, 0);
    // 90 deg around Y: local +X should map to world -Z (three.js convention).
    const groupQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const out = makeOutput();
    resolveRuntimeAnchorWorldPose(anchor([1, 0, 0]), 1, groupPos, groupQuat, out);
    assert.ok(Math.abs(out.position.x) < 1e-9, `expected x~0, got ${out.position.x}`);
    assert.ok(Math.abs(out.position.z - -1) < 1e-9, `expected z~-1, got ${out.position.z}`);
  });

  it('uniformly scaled model: local position scales before parent rotation/translation', () => {
    const groupPos = new THREE.Vector3(0, 0, 0);
    const groupQuat = new THREE.Quaternion();
    const out = makeOutput();
    resolveRuntimeAnchorWorldPose(anchor([1, 0, 0]), 0.42, groupPos, groupQuat, out);
    assert.ok(Math.abs(out.position.x - 0.42) < 1e-9);
  });

  it('composed local rotation: anchor rotation combines with parent rotation, order matters (parent applied after local)', () => {
    const groupQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const localQuat90X = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const expected = groupQuat.clone().multiply(localQuat90X);

    const out = makeOutput();
    resolveRuntimeAnchorWorldPose(anchor([0, 0, 0], [Math.PI / 2, 0, 0]), 1, new THREE.Vector3(), groupQuat, out);
    assert.ok(out.quaternion.angleTo(expected) < 1e-6, `expected composed quaternion to match parent*local order, angle diff ${out.quaternion.angleTo(expected)}`);
  });

  it('non-zero anchor rotation is reflected in output quaternion (not identity)', () => {
    const out = makeOutput();
    resolveRuntimeAnchorWorldPose(anchor([0, 0, 0], [0, 0, Math.PI / 2]), 1, new THREE.Vector3(), new THREE.Quaternion(), out);
    assert.ok(out.quaternion.angleTo(new THREE.Quaternion()) > 0.1, 'expected a real rotation, not identity');
  });

  it('output quaternion is normalized', () => {
    const out = makeOutput();
    resolveRuntimeAnchorWorldPose(anchor([0.3, -0.7, 0.2], [1.1, -0.4, 2.9]), 0.42, new THREE.Vector3(1, 2, 3), new THREE.Quaternion(0.1, 0.2, 0.3, 0.9).normalize(), out);
    const length = Math.sqrt(out.quaternion.x ** 2 + out.quaternion.y ** 2 + out.quaternion.z ** 2 + out.quaternion.w ** 2);
    assert.ok(Math.abs(length - 1) < 1e-6, `expected unit quaternion, length=${length}`);
  });

  it('right and left anchors (different local transforms) produce different world outputs from the same parent frame', () => {
    const groupPos = new THREE.Vector3(0, 1, 0);
    const groupQuat = new THREE.Quaternion();
    const rightOut = makeOutput();
    const leftOut = makeOutput();
    resolveRuntimeAnchorWorldPose(anchor([-0.26, -0.08, 0], [0, 0, -1.3]), 0.42, groupPos, groupQuat, rightOut);
    resolveRuntimeAnchorWorldPose(anchor([0.12, -0.02, 0], [0, 0, -0.3]), 0.42, groupPos, groupQuat, leftOut);
    assert.ok(!rightOut.position.equals(leftOut.position), 'right/left world positions must differ');
    assert.ok(rightOut.quaternion.angleTo(leftOut.quaternion) > 0.01, 'right/left world quaternions must differ');
  });

  it('mirrored left/right basis is NOT assumed — two anchors with negated X position and IDENTICAL rotation produce non-mirrored quaternions (proves the function does no implicit mirroring)', () => {
    const groupQuat = new THREE.Quaternion();
    const a = makeOutput();
    const b = makeOutput();
    resolveRuntimeAnchorWorldPose(anchor([-0.5, 0, 0], [0.2, 0.3, 0.4]), 1, new THREE.Vector3(), groupQuat, a);
    resolveRuntimeAnchorWorldPose(anchor([0.5, 0, 0], [0.2, 0.3, 0.4]), 1, new THREE.Vector3(), groupQuat, b);
    // Same rotation input on both sides -> same output quaternion (the
    // function must NOT silently negate/mirror rotation based on which
    // side of the model the position happens to be on). Tolerance is 1e-6,
    // not exact bit-equality — floating-point trig through Euler->Quaternion
    // conversion can differ by a few ULPs between two calls even with
    // bit-identical inputs (confirmed empirically: ~3e-8 rad in practice),
    // which is noise, not a logic difference.
    assert.ok(a.quaternion.angleTo(b.quaternion) < 1e-6, 'identical rotationEuler input must produce identical output quaternion regardless of position sign — mirroring must be an authored, explicit choice, never implicit');
  });

  it('reuses provided output objects across right/left calls without cross-contamination', () => {
    const rightOut = makeOutput();
    const leftOut = makeOutput();
    const scratch = { pos: new THREE.Vector3(), euler: new THREE.Euler(), localQuat: new THREE.Quaternion() };
    resolveRuntimeAnchorWorldPose(anchor([1, 0, 0]), 1, new THREE.Vector3(), new THREE.Quaternion(), rightOut, scratch);
    resolveRuntimeAnchorWorldPose(anchor([2, 0, 0]), 1, new THREE.Vector3(), new THREE.Quaternion(), leftOut, scratch);
    assert.ok(rightOut.position.equals(new THREE.Vector3(1, 0, 0)), 'right output must retain ITS OWN value after a second call reusing the same scratch');
    assert.ok(leftOut.position.equals(new THREE.Vector3(2, 0, 0)));
  });
});

describe('runtimeAnchorMath — resolveRuntimeAnchorWorldPose: invalid-input safety', () => {
  it('non-finite modelScale rejects and leaves output untouched', () => {
    const out = makeOutput();
    out.position.set(9, 9, 9);
    const ok = resolveRuntimeAnchorWorldPose(anchor([1, 0, 0]), NaN, new THREE.Vector3(), new THREE.Quaternion(), out);
    assert.strictEqual(ok, false);
    assert.ok(out.position.equals(new THREE.Vector3(9, 9, 9)), 'output must be untouched on rejection');
  });

  it('zero or negative modelScale rejects', () => {
    const out = makeOutput();
    assert.strictEqual(resolveRuntimeAnchorWorldPose(anchor([1, 0, 0]), 0, new THREE.Vector3(), new THREE.Quaternion(), out), false);
    assert.strictEqual(resolveRuntimeAnchorWorldPose(anchor([1, 0, 0]), -1, new THREE.Vector3(), new THREE.Quaternion(), out), false);
  });

  it('non-finite anchor position rejects', () => {
    const out = makeOutput();
    const ok = resolveRuntimeAnchorWorldPose(anchor([NaN, 0, 0]), 1, new THREE.Vector3(), new THREE.Quaternion(), out);
    assert.strictEqual(ok, false);
  });

  it('non-finite anchor rotation rejects', () => {
    const out = makeOutput();
    const ok = resolveRuntimeAnchorWorldPose(anchor([0, 0, 0], [Infinity, 0, 0]), 1, new THREE.Vector3(), new THREE.Quaternion(), out);
    assert.strictEqual(ok, false);
  });

  it('non-finite group world position rejects', () => {
    const out = makeOutput();
    const ok = resolveRuntimeAnchorWorldPose(anchor([1, 0, 0]), 1, new THREE.Vector3(NaN, 0, 0), new THREE.Quaternion(), out);
    assert.strictEqual(ok, false);
  });

  it('non-finite group world quaternion rejects', () => {
    const out = makeOutput();
    const badQuat = new THREE.Quaternion(NaN, 0, 0, 1);
    const ok = resolveRuntimeAnchorWorldPose(anchor([1, 0, 0]), 1, new THREE.Vector3(), badQuat, out);
    assert.strictEqual(ok, false);
  });

  it('finite output guarantee: valid inputs never produce NaN/Infinity in position or quaternion', () => {
    const out = makeOutput();
    const ok = resolveRuntimeAnchorWorldPose(anchor([1000, -500, 0.0001], [7.5, -3.2, 12.9]), 0.42, new THREE.Vector3(5, -5, 5), new THREE.Quaternion(0.5, 0.5, 0.5, 0.5).normalize(), out);
    assert.ok(ok);
    for (const v of [out.position.x, out.position.y, out.position.z, out.quaternion.x, out.quaternion.y, out.quaternion.z, out.quaternion.w]) {
      assert.ok(Number.isFinite(v), `expected finite, got ${v}`);
    }
  });
});
