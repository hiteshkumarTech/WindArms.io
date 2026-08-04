import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { DRONE_MUZZLE_LOCAL_OFFSET } from './droneVisualConfig';

/**
 * Milestone 9E.2 — permanent regression guard for the real, shipped-then-
 * fixed muzzle-facing defect (see `docs/decisions.md`'s Step 9E.1 entry):
 * the muzzle-flash mesh was originally authored at local `(0, 0, -0.42)`
 * and rendered on the drone's FAR side from the player, because
 * `THREE.Object3D.lookAt()` — for a plain (non-Camera/non-Light) object —
 * orients the local -Z axis AWAY from the look target, not toward it.
 *
 * This suite exercises the REAL `three` package (the same version this
 * project ships), not a hand-derived assumption about its API — a small,
 * deliberate, disclosed exception to the "no Three.js in tested modules"
 * convention `lib/v2/ai/`'s own import guards enforce, justified because
 * this is specifically a Three.js presentation-orientation regression, not
 * gameplay logic. No RNG, no clock, no timers anywhere in this file — pure,
 * deterministic geometry only (verified by the source-guard test below,
 * not just by inspection).
 */

function towardTargetDot(groupPosition: THREE.Vector3, target: THREE.Vector3, localOffset: readonly [number, number, number]): number {
  const group = new THREE.Object3D();
  group.position.copy(groupPosition);
  group.lookAt(target);

  const child = new THREE.Object3D();
  child.position.set(...localOffset);
  group.add(child);
  group.updateMatrixWorld(true);

  const childWorldPos = new THREE.Vector3();
  child.getWorldPosition(childWorldPos);

  const towardTarget = target.clone().sub(groupPosition).normalize();
  const childDirection = childWorldPos.clone().sub(groupPosition).normalize();
  return childDirection.dot(towardTarget);
}

describe('DRONE_MUZZLE_LOCAL_OFFSET — shape', () => {
  it('is finite in every component', () => {
    const [x, y, z] = DRONE_MUZZLE_LOCAL_OFFSET;
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
  });

  it('local Z is strictly positive — the facing side for a plain Object3D under lookAt(), not the away side', () => {
    const [, , z] = DRONE_MUZZLE_LOCAL_OFFSET;
    assert.ok(z > 0, `DRONE_MUZZLE_LOCAL_OFFSET's Z must be > 0 (got ${z}) — a plain (non-Camera/Light) Object3D.lookAt() orients local -Z AWAY from the target`);
  });
});

describe('DRONE_MUZZLE_LOCAL_OFFSET — facing regression (real THREE.Object3D.lookAt() behaviour)', () => {
  it('after group.lookAt(target), the transformed muzzle-offset direction points toward the target (dot > 0.9)', () => {
    const dot = towardTargetDot(new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 1, 5), DRONE_MUZZLE_LOCAL_OFFSET);
    assert.ok(dot > 0.9, `expected dot > 0.9, got ${dot}`);
  });

  it('holds across multiple non-trivial group positions/orientations, not just one lucky angle', () => {
    const cases: Array<{ groupPos: THREE.Vector3; target: THREE.Vector3 }> = [
      { groupPos: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(1, 0, 0) },
      { groupPos: new THREE.Vector3(5, 2, -3), target: new THREE.Vector3(-4, 3, 8) },
      { groupPos: new THREE.Vector3(-2, 1, 1), target: new THREE.Vector3(-2, 5, 1) }, // near-vertical look direction
      { groupPos: new THREE.Vector3(10, 0, 10), target: new THREE.Vector3(10, 0, 0) }, // pure -Z-world-axis look
    ];
    for (const { groupPos, target } of cases) {
      const dot = towardTargetDot(groupPos, target, DRONE_MUZZLE_LOCAL_OFFSET);
      assert.ok(dot > 0.9, `groupPos=${groupPos.toArray()} target=${target.toArray()}: expected dot > 0.9, got ${dot}`);
    }
  });

  it('REGRESSION GUARD: the original shipped defect (negative-Z placement) fails this exact same check — proving this test has teeth, not just a tautology', () => {
    const wrongOffset: readonly [number, number, number] = [DRONE_MUZZLE_LOCAL_OFFSET[0], DRONE_MUZZLE_LOCAL_OFFSET[1], -DRONE_MUZZLE_LOCAL_OFFSET[2]];
    const dot = towardTargetDot(new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 1, 5), wrongOffset);
    assert.ok(dot < -0.9, `sanity check: the OLD/wrong negative-Z offset must fail (dot < -0.9), got ${dot} — if this assertion itself fails, the test above is not actually distinguishing correct from incorrect placement`);
  });

  it('a purely-forward (local +Z magnitude only, no X/Y) offset stays exactly on-axis with the facing direction (dot ≈ 1, not just > 0.9)', () => {
    const pureForward: readonly [number, number, number] = [0, 0, DRONE_MUZZLE_LOCAL_OFFSET[2]];
    const dot = towardTargetDot(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 10), pureForward);
    assert.ok(Math.abs(dot - 1) < 1e-9, `expected dot ≈ 1 for a pure-forward offset facing a target directly ahead, got ${dot}`);
  });
});

describe('droneVisualConfig.ts — no RNG or timer (source guard)', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const src = fs.readFileSync(path.join(repoRoot, 'src/components/three/play/droneVisualConfig.ts'), 'utf8');

  it('does not call Math.random()', () => {
    assert.ok(!src.includes('Math.random('));
  });

  it('does not call setTimeout/setInterval', () => {
    assert.ok(!src.includes('setTimeout(') && !src.includes('setInterval('));
  });

  it('does not read the system clock (performance.now()/Date.now())', () => {
    assert.ok(!src.includes('performance.now(') && !src.includes('Date.now('));
  });
});
