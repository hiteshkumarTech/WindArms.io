import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clampTargetToMaxReach, solveTwoBoneIk, type TwoBoneIkInput, type TwoBoneIkOutput } from './twoBoneIk';

const UPPER = 0.28;
const LOWER = 0.26;

function makeOutput(): TwoBoneIkOutput {
  return {
    elbowPosition: new THREE.Vector3(),
    handPosition: new THREE.Vector3(),
    upperQuat: new THREE.Quaternion(),
    lowerQuat: new THREE.Quaternion(),
  };
}

function baseInput(overrides: Partial<TwoBoneIkInput> = {}): TwoBoneIkInput {
  return {
    rootPosition: new THREE.Vector3(0, 1.5, 0),
    targetPosition: new THREE.Vector3(0, 1.5, -0.3),
    pole: new THREE.Vector3(0, -1, 0),
    poleIsDirection: true,
    upperLength: UPPER,
    lowerLength: LOWER,
    restUpperQuat: new THREE.Quaternion(),
    restLowerQuat: new THREE.Quaternion(),
    restUpperDir: new THREE.Vector3(0, 0, -1),
    restLowerDir: new THREE.Vector3(0, 0, -1),
    weight: 1,
    ...overrides,
  };
}

function isFiniteVec3(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
function isUnitQuat(q: THREE.Quaternion, tol = 1e-5): boolean {
  const len = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2);
  return Number.isFinite(len) && Math.abs(len - 1) < tol;
}

describe('twoBoneIk — reachable target', () => {
  it('solves a target within reach exactly (hand lands on target)', () => {
    const input = baseInput({ targetPosition: new THREE.Vector3(0, 1.5, -(UPPER + LOWER) * 0.7) });
    const output = makeOutput();
    const meta = solveTwoBoneIk(input, output);
    assert.strictEqual(meta.clampedFar, false);
    assert.strictEqual(meta.clampedNear, false);
    assert.ok(output.handPosition.distanceTo(input.targetPosition) < 1e-4, `hand should land on target, got distance ${output.handPosition.distanceTo(input.targetPosition)}`);
  });

  it('elbow sits exactly upperLength from root, hand exactly lowerLength from elbow (arm-length preservation)', () => {
    const input = baseInput({ targetPosition: new THREE.Vector3(0.05, 1.4, -0.35) });
    const output = makeOutput();
    solveTwoBoneIk(input, output);
    assert.ok(Math.abs(output.elbowPosition.distanceTo(input.rootPosition) - UPPER) < 1e-4);
    assert.ok(Math.abs(output.handPosition.distanceTo(output.elbowPosition) - LOWER) < 1e-4);
  });
});

describe('twoBoneIk — reach limits', () => {
  it('maximum reach: target exactly at upper+lower distance solves to a straight arm', () => {
    const input = baseInput({ targetPosition: new THREE.Vector3(0, 1.5, -(UPPER + LOWER)) });
    const output = makeOutput();
    const meta = solveTwoBoneIk(input, output);
    assert.ok(meta.clampedFar || meta.solvedDistance > UPPER + LOWER - 0.01);
    // Straight arm: elbow lies (nearly) on the root-target line.
    const toElbow = output.elbowPosition.clone().sub(input.rootPosition).normalize();
    const toTarget = input.targetPosition.clone().sub(input.rootPosition).normalize();
    assert.ok(toElbow.angleTo(toTarget) < 0.05, `expected near-straight arm, angle=${toElbow.angleTo(toTarget)}`);
  });

  it('unreachable target (beyond max reach): clamps to full extension, does not stretch beyond upper+lower', () => {
    const input = baseInput({ targetPosition: new THREE.Vector3(0, 1.5, -5) }); // way beyond reach
    const output = makeOutput();
    const meta = solveTwoBoneIk(input, output);
    assert.strictEqual(meta.clampedFar, true);
    const totalChainLength = output.elbowPosition.distanceTo(input.rootPosition) + output.handPosition.distanceTo(output.elbowPosition);
    assert.ok(Math.abs(totalChainLength - (UPPER + LOWER)) < 1e-4, 'chain must not stretch beyond its own bone lengths');
    // Hand should be reaching TOWARD the target direction, not overshooting past max length.
    assert.ok(output.handPosition.distanceTo(input.rootPosition) <= UPPER + LOWER + 1e-3);
  });

  it('target too close (inside |upper-lower|): clamps to minimum fold, finite output, no NaN', () => {
    const input = baseInput({ targetPosition: new THREE.Vector3(0, 1.5, -0.001) }); // almost at root
    const output = makeOutput();
    const meta = solveTwoBoneIk(input, output);
    assert.strictEqual(meta.clampedNear, true);
    assert.ok(isFiniteVec3(output.elbowPosition));
    assert.ok(isFiniteVec3(output.handPosition));
  });

  it('target exactly AT the root (zero-length direction safety): finite, no NaN, no throw', () => {
    const input = baseInput({ targetPosition: new THREE.Vector3(0, 1.5, 0) });
    const output = makeOutput();
    assert.doesNotThrow(() => solveTwoBoneIk(input, output));
    assert.ok(isFiniteVec3(output.elbowPosition));
    assert.ok(isFiniteVec3(output.handPosition));
    assert.ok(isUnitQuat(output.upperQuat));
    assert.ok(isUnitQuat(output.lowerQuat));
  });
});

describe('twoBoneIk — pole / degenerate safety', () => {
  it('pole collinear with the root-target direction: still produces a finite, deterministic result (fallback bend axis)', () => {
    const input = baseInput({
      targetPosition: new THREE.Vector3(0, 1.5, -0.4),
      pole: new THREE.Vector3(0, 1.5, -1), // same line as target direction
      poleIsDirection: false,
    });
    const output = makeOutput();
    assert.doesNotThrow(() => solveTwoBoneIk(input, output));
    assert.ok(isFiniteVec3(output.elbowPosition));
    assert.ok(isFiniteVec3(output.handPosition));
  });

  it('zero-vector pole direction: finite fallback, no NaN', () => {
    const input = baseInput({ pole: new THREE.Vector3(0, 0, 0), poleIsDirection: true });
    const output = makeOutput();
    solveTwoBoneIk(input, output);
    assert.ok(isFiniteVec3(output.elbowPosition));
    assert.ok(isFiniteVec3(output.handPosition));
  });

  it('target crossing near the pole plane (pole nearly parallel to forward) stays finite and does not flip discontinuously in position magnitude', () => {
    const results: THREE.Vector3[] = [];
    for (const z of [-0.29, -0.3, -0.31]) {
      const input = baseInput({ targetPosition: new THREE.Vector3(0.001, 1.5, z), pole: new THREE.Vector3(0.0001, -1, 0) });
      const output = makeOutput();
      solveTwoBoneIk(input, output);
      assert.ok(isFiniteVec3(output.elbowPosition));
      results.push(output.elbowPosition.clone());
    }
    // Elbow position should move continuously (small target steps -> small elbow steps), not jump wildly.
    assert.ok(results[0].distanceTo(results[1]) < 0.05);
    assert.ok(results[1].distanceTo(results[2]) < 0.05);
  });
});

describe('twoBoneIk — left/right mirrored pole behavior', () => {
  it('mirrored pole (opposite X) bends the elbow to the opposite side, not the same side', () => {
    const rightInput = baseInput({ pole: new THREE.Vector3(1, -0.3, 0), poleIsDirection: true });
    const leftInput = baseInput({ pole: new THREE.Vector3(-1, -0.3, 0), poleIsDirection: true });
    const rightOut = makeOutput();
    const leftOut = makeOutput();
    solveTwoBoneIk(rightInput, rightOut);
    solveTwoBoneIk(leftInput, leftOut);
    // Elbow X should have opposite sign for mirrored poles.
    assert.ok(rightOut.elbowPosition.x > 0.01, `expected right-pole elbow.x > 0, got ${rightOut.elbowPosition.x}`);
    assert.ok(leftOut.elbowPosition.x < -0.01, `expected left-pole elbow.x < 0, got ${leftOut.elbowPosition.x}`);
  });

  it('no sudden elbow-side change under small target movement (a tiny target shift must not flip the elbow to the opposite side of the pole)', () => {
    const input1 = baseInput({ targetPosition: new THREE.Vector3(0.01, 1.5, -0.3) });
    const input2 = baseInput({ targetPosition: new THREE.Vector3(-0.01, 1.5, -0.3) });
    const out1 = makeOutput();
    const out2 = makeOutput();
    solveTwoBoneIk(input1, out1);
    solveTwoBoneIk(input2, out2);
    assert.ok(out1.elbowPosition.distanceTo(out2.elbowPosition) < 0.05, `tiny target movement should not cause a large elbow jump, got ${out1.elbowPosition.distanceTo(out2.elbowPosition)}`);
  });
});

describe('twoBoneIk — IK weight blending', () => {
  it('weight 0 returns exactly the rest pose (elbow/hand at rest positions, quats at rest)', () => {
    const input = baseInput({ weight: 0 });
    const output = makeOutput();
    solveTwoBoneIk(input, output);
    const restElbow = input.rootPosition.clone().addScaledVector(input.restUpperDir, UPPER);
    const restHand = restElbow.clone().addScaledVector(input.restLowerDir, LOWER);
    assert.ok(output.elbowPosition.distanceTo(restElbow) < 1e-4);
    assert.ok(output.handPosition.distanceTo(restHand) < 1e-4);
    assert.ok(output.upperQuat.angleTo(input.restUpperQuat) < 1e-4);
    assert.ok(output.lowerQuat.angleTo(input.restLowerQuat) < 1e-4);
  });

  it('weight 1 returns the fully solved pose (hand at target, for a reachable target)', () => {
    const input = baseInput({ weight: 1, targetPosition: new THREE.Vector3(0, 1.5, -0.35) });
    const output = makeOutput();
    solveTwoBoneIk(input, output);
    assert.ok(output.handPosition.distanceTo(input.targetPosition) < 1e-4);
  });

  it('weight 0.5 lands strictly between rest and fully-solved positions', () => {
    const target = new THREE.Vector3(0.1, 1.4, -0.4);
    const restInput = baseInput({ weight: 0, targetPosition: target.clone() });
    const fullInput = baseInput({ weight: 1, targetPosition: target.clone() });
    const halfInput = baseInput({ weight: 0.5, targetPosition: target.clone() });
    const restOut = makeOutput();
    const fullOut = makeOutput();
    const halfOut = makeOutput();
    solveTwoBoneIk(restInput, restOut);
    solveTwoBoneIk(fullInput, fullOut);
    solveTwoBoneIk(halfInput, halfOut);
    const distRestToHalf = restOut.handPosition.distanceTo(halfOut.handPosition);
    const distHalfToFull = halfOut.handPosition.distanceTo(fullOut.handPosition);
    const distRestToFull = restOut.handPosition.distanceTo(fullOut.handPosition);
    assert.ok(distRestToHalf > 0 && distHalfToFull > 0, 'half-weight result must be strictly between rest and full, not equal to either');
    assert.ok(Math.abs(distRestToHalf + distHalfToFull - distRestToFull) < 1e-3, 'half-weight hand position should lie on the rest->full line (lerp)');
  });

  it('weight is clamped for out-of-range input (negative or >1) rather than producing an extrapolated/unstable result', () => {
    const overOut = makeOutput();
    const underOut = makeOutput();
    solveTwoBoneIk(baseInput({ weight: 5 }), overOut);
    solveTwoBoneIk(baseInput({ weight: -5 }), underOut);
    assert.ok(isFiniteVec3(overOut.handPosition));
    assert.ok(isFiniteVec3(underOut.handPosition));
  });
});

describe('twoBoneIk — stability and output guarantees', () => {
  it('stable repeated solve: calling with identical inputs multiple times produces identical output (deterministic, no hidden state)', () => {
    const input = baseInput({ targetPosition: new THREE.Vector3(0.08, 1.42, -0.33) });
    const out1 = makeOutput();
    const out2 = makeOutput();
    const out3 = makeOutput();
    solveTwoBoneIk(input, out1);
    solveTwoBoneIk(input, out2);
    solveTwoBoneIk(input, out3);
    assert.ok(out1.handPosition.equals(out2.handPosition) && out2.handPosition.equals(out3.handPosition));
    assert.ok(out1.upperQuat.equals(out2.upperQuat) && out2.upperQuat.equals(out3.upperQuat));
  });

  it('normalized (unit-length) quaternion output across a spread of target positions', () => {
    const targets = [
      new THREE.Vector3(0, 1.5, -0.3),
      new THREE.Vector3(0.2, 1.6, -0.1),
      new THREE.Vector3(-0.15, 1.3, -0.4),
      new THREE.Vector3(0, 1.5, -5),
      new THREE.Vector3(0, 1.5, -0.001),
    ];
    for (const targetPosition of targets) {
      const output = makeOutput();
      solveTwoBoneIk(baseInput({ targetPosition }), output);
      assert.ok(isUnitQuat(output.upperQuat), `upperQuat not unit length for target ${targetPosition.toArray()}`);
      assert.ok(isUnitQuat(output.lowerQuat), `lowerQuat not unit length for target ${targetPosition.toArray()}`);
    }
  });

  it('does not mutate input position/quaternion objects', () => {
    const input = baseInput();
    const rootCopy = input.rootPosition.clone();
    const targetCopy = input.targetPosition.clone();
    const restUpperQuatCopy = input.restUpperQuat.clone();
    const restLowerQuatCopy = input.restLowerQuat.clone();
    solveTwoBoneIk(input, makeOutput());
    assert.ok(input.rootPosition.equals(rootCopy));
    assert.ok(input.targetPosition.equals(targetCopy));
    assert.ok(input.restUpperQuat.equals(restUpperQuatCopy));
    assert.ok(input.restLowerQuat.equals(restLowerQuatCopy));
  });

  it('reuses provided scratch objects (zero-allocation contract) without cross-contaminating a second independent solve', () => {
    const scratch = {
      forward: new THREE.Vector3(),
      poleVec: new THREE.Vector3(),
      polePerp: new THREE.Vector3(),
      bendAxis: new THREE.Vector3(),
      elbowDir: new THREE.Vector3(),
      handDir: new THREE.Vector3(),
      deltaQuat: new THREE.Quaternion(),
      restWeightQuat: new THREE.Quaternion(),
    };
    const rightOut = makeOutput();
    const leftOut = makeOutput();
    solveTwoBoneIk(baseInput({ targetPosition: new THREE.Vector3(0.1, 1.5, -0.3) }), rightOut, scratch);
    solveTwoBoneIk(baseInput({ targetPosition: new THREE.Vector3(-0.1, 1.5, -0.3) }), leftOut, scratch);
    assert.ok(!rightOut.handPosition.equals(leftOut.handPosition), 'reusing scratch across two solves must not make the outputs equal');
  });

  it('reuses provided restElbowPos/restHandPos scratch slots for the weight<1 blend branch without cross-contaminating a second solve', () => {
    const scratch = {
      forward: new THREE.Vector3(),
      poleVec: new THREE.Vector3(),
      polePerp: new THREE.Vector3(),
      bendAxis: new THREE.Vector3(),
      elbowDir: new THREE.Vector3(),
      handDir: new THREE.Vector3(),
      deltaQuat: new THREE.Quaternion(),
      restWeightQuat: new THREE.Quaternion(),
      restElbowPos: new THREE.Vector3(),
      restHandPos: new THREE.Vector3(),
    };
    const rightOut = makeOutput();
    const leftOut = makeOutput();
    solveTwoBoneIk(baseInput({ weight: 0.5, targetPosition: new THREE.Vector3(0.1, 1.5, -0.3) }), rightOut, scratch);
    solveTwoBoneIk(baseInput({ weight: 0.5, targetPosition: new THREE.Vector3(-0.1, 1.5, -0.3) }), leftOut, scratch);
    assert.ok(!rightOut.handPosition.equals(leftOut.handPosition), 'reusing the rest-position scratch slots across two solves must not make the outputs equal');
    assert.ok(isFiniteVec3(rightOut.handPosition) && isFiniteVec3(leftOut.handPosition));
  });
});

describe('twoBoneIk — clampTargetToMaxReach', () => {
  const origin = new THREE.Vector3(0, 1.5, 0);

  it('a target already within reach passes through unchanged', () => {
    // Regression case: this is the exact shoulder/target pair that exposed
    // the original self-aliasing bug — an in-reach target that should be
    // returned untouched was silently doubled to 2x the origin instead.
    const target = new THREE.Vector3(0, 1.5, -0.3);
    const output = new THREE.Vector3();
    clampTargetToMaxReach(origin, target, 10, output);
    assert.ok(output.distanceTo(target) < 1e-6, `expected output ≈ target, got ${output.toArray()}`);
    assert.ok(output.distanceTo(origin.clone().multiplyScalar(2)) > 0.5, 'output must not collapse to 2x origin');
  });

  it('a target beyond maxDistance is clamped to exactly maxDistance from origin, same direction', () => {
    const target = new THREE.Vector3(0, 1.5, -5);
    const output = new THREE.Vector3();
    clampTargetToMaxReach(origin, target, 0.5, output);
    assert.ok(Math.abs(output.distanceTo(origin) - 0.5) < 1e-5);
    const dir = output.clone().sub(origin).normalize();
    assert.ok(dir.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-5);
  });

  it('a target exactly at maxDistance is unchanged (boundary, no over-clamp)', () => {
    const target = new THREE.Vector3(0, 1.5, -1);
    const output = new THREE.Vector3();
    clampTargetToMaxReach(origin, target, 1, output);
    assert.ok(output.distanceTo(target) < 1e-4);
  });

  it('a target coincident with origin stays finite (near-zero-distance safety)', () => {
    const output = new THREE.Vector3();
    clampTargetToMaxReach(origin, origin.clone(), 0.5, output);
    assert.ok(isFiniteVec3(output));
    assert.ok(output.distanceTo(origin) < 1e-4);
  });

  it('output may safely alias the target object', () => {
    const target = new THREE.Vector3(0, 1.5, -5);
    clampTargetToMaxReach(origin, target, 0.5, target);
    assert.ok(Math.abs(target.distanceTo(origin) - 0.5) < 1e-5);
  });

  it('does not mutate origin', () => {
    const originCopy = origin.clone();
    const output = new THREE.Vector3();
    clampTargetToMaxReach(origin, new THREE.Vector3(0, 1.5, -5), 0.5, output);
    assert.ok(origin.equals(originCopy));
  });
});
