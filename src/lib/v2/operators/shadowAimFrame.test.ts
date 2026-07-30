import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { computeChestAimPitch, convertRangeLocalPitchToAimPitch, createAimPitchScratch, extractAimPitchFromWeaponQuaternion, smoothTowards } from './shadowAimFrame';

/** Builds a quaternion matching this codebase's camera convention: `camera.rotation.x` negative = looking down (see `RangeController.tsx`'s `pitch.current` clamp and every calibration script's `camera pitch: -0.523` reading at "30deg down"). Yaw applied first, then pitch, matching THREE's default Euler order and how `camera.rotation` is actually set (`.x`/`.y` independently) in this codebase. */
function cameraLikeQuat(pitchDownRad: number, yawRad = 0): THREE.Quaternion {
  const euler = new THREE.Euler(-pitchDownRad, yawRad, 0, 'YXZ');
  return new THREE.Quaternion().setFromEuler(euler);
}

describe('shadowAimFrame — extractAimPitchFromWeaponQuaternion', () => {
  it('returns ~0 for a level weapon (camera looking straight ahead), container facing the same way', () => {
    const weaponQuat = cameraLikeQuat(0);
    const containerQuat = new THREE.Quaternion(); // identity — container facing -Z, same as weapon at pitch 0
    const pitch = extractAimPitchFromWeaponQuaternion(weaponQuat, containerQuat);
    assert.ok(Math.abs(pitch) < 1e-3, `expected ~0, got ${pitch}`);
  });

  it('returns a POSITIVE pitch when the weapon looks DOWN by a known angle, matching this codebase\'s "pitchDeg" convention', () => {
    const knownDownRad = THREE.MathUtils.degToRad(30);
    const weaponQuat = cameraLikeQuat(knownDownRad);
    const containerQuat = new THREE.Quaternion();
    const pitch = extractAimPitchFromWeaponQuaternion(weaponQuat, containerQuat);
    assert.ok(pitch > 0, `expected positive pitch for looking down, got ${pitch}`);
    assert.ok(Math.abs(pitch - knownDownRad) < 1e-3, `expected ~${knownDownRad}, got ${pitch}`);
  });

  it('returns a NEGATIVE pitch when the weapon looks UP', () => {
    const knownUpRad = THREE.MathUtils.degToRad(20);
    const weaponQuat = cameraLikeQuat(-knownUpRad);
    const containerQuat = new THREE.Quaternion();
    const pitch = extractAimPitchFromWeaponQuaternion(weaponQuat, containerQuat);
    assert.ok(pitch < 0, `expected negative pitch for looking up, got ${pitch}`);
    assert.ok(Math.abs(pitch + knownUpRad) < 1e-3, `expected ~${-knownUpRad}, got ${pitch}`);
  });

  it('is yaw-invariant: the same downward pitch at different container/weapon yaws (both rotated together) produces the same extracted pitch', () => {
    const knownDownRad = THREE.MathUtils.degToRad(45);
    const scratch = createAimPitchScratch();
    for (const yawDeg of [0, 45, -45, 90, -90, 179]) {
      const yawRad = THREE.MathUtils.degToRad(yawDeg);
      const weaponQuat = cameraLikeQuat(knownDownRad, yawRad);
      const containerQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawRad, 0, 'YXZ'));
      const pitch = extractAimPitchFromWeaponQuaternion(weaponQuat, containerQuat, scratch);
      assert.ok(Math.abs(pitch - knownDownRad) < 1e-3, `yaw=${yawDeg}: expected ~${knownDownRad}, got ${pitch}`);
    }
  });

  it('clamps to ±85° near the vertical singularity rather than producing a wild/NaN value', () => {
    const nearStraightDown = cameraLikeQuat(THREE.MathUtils.degToRad(89.99));
    const containerQuat = new THREE.Quaternion();
    const pitch = extractAimPitchFromWeaponQuaternion(nearStraightDown, containerQuat);
    assert.ok(Number.isFinite(pitch));
    assert.ok(pitch <= THREE.MathUtils.degToRad(85) + 1e-6);
  });

  it('finite output guarantee: a spread of weapon/container quaternion combinations never produces NaN/Infinity', () => {
    const scratch = createAimPitchScratch();
    const pitches = [-80, -45, -10, 0, 10, 45, 80];
    const yaws = [-170, -90, -30, 0, 30, 90, 170];
    for (const pDeg of pitches) {
      for (const yDeg of yaws) {
        const weaponQuat = cameraLikeQuat(THREE.MathUtils.degToRad(pDeg), THREE.MathUtils.degToRad(yDeg));
        const containerQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(yDeg), 0, 'YXZ'));
        const pitch = extractAimPitchFromWeaponQuaternion(weaponQuat, containerQuat, scratch);
        assert.ok(Number.isFinite(pitch), `pDeg=${pDeg} yDeg=${yDeg} produced ${pitch}`);
      }
    }
  });

  it('handles a degenerate (near-zero-length) intermediate gracefully rather than throwing or producing NaN', () => {
    const weaponQuat = new THREE.Quaternion(0, 0, 0, 0); // non-normalized, degenerate
    const containerQuat = new THREE.Quaternion();
    const pitch = extractAimPitchFromWeaponQuaternion(weaponQuat, containerQuat);
    assert.ok(Number.isFinite(pitch));
  });
});

describe('shadowAimFrame — smoothTowards', () => {
  it('moves partway from current to target, never overshooting, for a normal positive dt', () => {
    const result = smoothTowards(0, 10, 5, 1 / 60);
    assert.ok(result > 0 && result < 10);
  });

  it('converges to the target over many repeated small steps', () => {
    let value = 0;
    for (let i = 0; i < 300; i++) value = smoothTowards(value, 10, 5, 1 / 60);
    assert.ok(Math.abs(value - 10) < 0.01, `expected convergence near 10, got ${value}`);
  });

  it('returns the target immediately for a non-finite or non-positive dt (fail-soft, never NaN)', () => {
    assert.strictEqual(smoothTowards(0, 10, 5, 0), 10);
    assert.strictEqual(smoothTowards(0, 10, 5, -1), 10);
    assert.strictEqual(smoothTowards(0, 10, 5, NaN), 10);
  });

  it('finite output guarantee for a spread of rates/dts', () => {
    for (const rate of [0.1, 1, 5, 20]) {
      for (const dt of [1 / 240, 1 / 60, 1 / 10, 1]) {
        const result = smoothTowards(3, -7, rate, dt);
        assert.ok(Number.isFinite(result));
      }
    }
  });
});

describe('shadowAimFrame — convertRangeLocalPitchToAimPitch (Step 8E-C.2)', () => {
  it('negates: rangeLocalPose.pitch is positive=up (camera.rotation.x), this file wants positive=down', () => {
    assert.strictEqual(convertRangeLocalPitchToAimPitch(THREE.MathUtils.degToRad(30)), -THREE.MathUtils.degToRad(30));
    assert.strictEqual(convertRangeLocalPitchToAimPitch(-THREE.MathUtils.degToRad(45)), THREE.MathUtils.degToRad(45));
  });

  it('zero maps to zero', () => {
    assert.ok(convertRangeLocalPitchToAimPitch(0) === 0); // === (not Object.is) — -0 is an acceptable representation of zero here
  });

  it('fail-soft: non-finite input returns 0, never NaN', () => {
    assert.strictEqual(convertRangeLocalPitchToAimPitch(NaN), 0);
    assert.strictEqual(convertRangeLocalPitchToAimPitch(Infinity), 0);
    assert.strictEqual(convertRangeLocalPitchToAimPitch(-Infinity), 0);
  });

  it('round-trips a full realistic pitch-limit sweep exactly (this is the value that replaced the previously-broken weapon-quaternion extraction — see shadowAimFrame.ts doc comment)', () => {
    for (const downDeg of [0, 10, 30, 45, 60, 70, 88.9]) {
      const cameraRotationX = -THREE.MathUtils.degToRad(downDeg); // pitch.current convention: positive=up
      const aimPitch = convertRangeLocalPitchToAimPitch(cameraRotationX);
      assert.ok(Math.abs(THREE.MathUtils.radToDeg(aimPitch) - downDeg) < 1e-6, `expected ~${downDeg}deg, got ${THREE.MathUtils.radToDeg(aimPitch)}`);
    }
  });
});

describe('shadowAimFrame — computeChestAimPitch (Step 8E-C.2)', () => {
  it('returns 0 at 0 aim pitch (level), regardless of follow fraction/cap', () => {
    assert.strictEqual(computeChestAimPitch(0, 0.55, 0.5), 0);
  });

  it('is MONOTONIC with aim pitch — more downward aim pitch produces a larger lean, never smaller (the opposite of the rejected Step 8E-C.1 inverse curve)', () => {
    const cap = THREE.MathUtils.degToRad(60); // generous cap so the monotonic relationship isn't hidden by clamping
    const pitches = [0, 5, 10, 20, 30, 45].map((d) => THREE.MathUtils.degToRad(d));
    let previous = -Infinity;
    for (const pitch of pitches) {
      const lean = computeChestAimPitch(pitch, 0.5, cap);
      assert.ok(lean > previous - 1e-9, `expected non-decreasing lean as pitch increases (pitch=${pitch}, lean=${lean}, previous=${previous})`);
      previous = lean;
    }
  });

  it('is symmetric: a negative (upward) aim pitch produces a negative lean of the same magnitude as the equivalent positive pitch', () => {
    const pitch = THREE.MathUtils.degToRad(25);
    const down = computeChestAimPitch(pitch, 0.6, THREE.MathUtils.degToRad(45));
    const up = computeChestAimPitch(-pitch, 0.6, THREE.MathUtils.degToRad(45));
    assert.ok(Math.abs(down + up) < 1e-9, `expected up (${up}) to be the exact negation of down (${down})`);
  });

  it('clamps to +/- maxPitchRad rather than growing unbounded at extreme aim pitch', () => {
    const cap = THREE.MathUtils.degToRad(30);
    const extremePitch = THREE.MathUtils.degToRad(85);
    assert.ok(Math.abs(computeChestAimPitch(extremePitch, 1, cap)) <= cap + 1e-9);
    assert.ok(Math.abs(computeChestAimPitch(-extremePitch, 1, cap)) <= cap + 1e-9);
  });

  it('follow fraction scales the response — a smaller fraction produces a proportionally smaller lean for the same pitch', () => {
    const pitch = THREE.MathUtils.degToRad(20);
    const cap = THREE.MathUtils.degToRad(60); // well above what either fraction could reach
    const half = computeChestAimPitch(pitch, 0.5, cap);
    const quarter = computeChestAimPitch(pitch, 0.25, cap);
    assert.ok(Math.abs(quarter - half / 2) < 1e-9, `expected quarter (${quarter}) to be half of half (${half})`);
  });

  it('fail-soft: non-finite input never produces a non-finite output', () => {
    assert.strictEqual(computeChestAimPitch(NaN, 0.5, 0.5), 0);
    assert.strictEqual(computeChestAimPitch(0.5, NaN, 0.5), 0);
    assert.strictEqual(computeChestAimPitch(0.5, 0.5, NaN), 0);
    assert.ok(Number.isFinite(computeChestAimPitch(Infinity, 0.5, 0.5)));
  });
});
