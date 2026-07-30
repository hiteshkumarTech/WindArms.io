import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { computeShadowRecoilKickMultiplier, resolveDesiredShadowWeaponPose, SHADOW_RECOIL_KICK, SHADOW_WEAPON_PRESENTATION, WEAPON_CHEST_ALIGN_QUAT } from './shadowWeaponPresentationPose';
import { VORTEX_RUNTIME_ANCHORS } from '@/lib/v2/weapons/vortexRuntimeAnchors';
import { RELOAD_LEFT_HAND_LOCAL, INSPECT_LEFT_HAND_LOCAL } from '@/lib/v2/weapons/actionTargets';
import { resolveRuntimeAnchorWorldPose } from '@/lib/v2/weapons/runtimeAnchorMath';
import { VORTEX_VIEWMODEL_POSES } from '@/lib/v2/weapons/vortexViewmodelPose';

describe('shadowWeaponPresentationPose — WEAPON_CHEST_ALIGN_QUAT', () => {
  it('maps weapon-local +X (muzzle direction) to chest-local +Z (re-verified Step 8E-C.3.1 via a direction-sensitive muzzle-tip-vs-pivot-vs-chest check — see the constant\'s own doc comment)', () => {
    const result = new THREE.Vector3(1, 0, 0).applyQuaternion(WEAPON_CHEST_ALIGN_QUAT);
    assert.ok(result.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-9, `expected (0,0,1), got ${result.toArray()}`);
  });

  it('leaves chest-local +Y (up) unchanged', () => {
    const result = new THREE.Vector3(0, 1, 0).applyQuaternion(WEAPON_CHEST_ALIGN_QUAT);
    assert.ok(result.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-9, `expected (0,1,0) unchanged, got ${result.toArray()}`);
  });

  it('is a proper rotation (unit quaternion, determinant-preserving) — right-handed basis intact', () => {
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(WEAPON_CHEST_ALIGN_QUAT);
    const y = new THREE.Vector3(0, 1, 0).applyQuaternion(WEAPON_CHEST_ALIGN_QUAT);
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(WEAPON_CHEST_ALIGN_QUAT);
    const cross = x.clone().cross(y);
    assert.ok(cross.distanceTo(z) < 1e-9, `expected X x Y == Z for a right-handed rotated basis, got cross=${cross.toArray()} z=${z.toArray()}`);
  });
});

describe('shadowWeaponPresentationPose — SHADOW_WEAPON_PRESENTATION config sanity', () => {
  it('hip and ads poses are fully finite', () => {
    for (const pose of [SHADOW_WEAPON_PRESENTATION.hip, SHADOW_WEAPON_PRESENTATION.ads]) {
      for (const v of [...pose.positionLocal, ...pose.rotationEulerOffsetDeg]) {
        assert.ok(Number.isFinite(v), `expected finite config value, got ${v}`);
      }
    }
  });
});

/**
 * REACHABILITY BY CONSTRUCTION — the core architectural claim Step 8E-C.2
 * makes: because the shadow weapon is anchored to the CHEST bone (a small,
 * fixed offset) rather than to the camera, the resolved grip anchors must
 * land close to the chest regardless of the chest's own world position/
 * rotation — unlike Step 8E-C.1's camera-relative target, whose distance
 * from a world-anchored shoulder depended on the player's look direction
 * and could grow to ~0.53-0.64m (see docs/decisions.md's Step 8E-C.1
 * entry). This test proves that bound holds for a spread of chest world
 * transforms using the SAME reusable `resolveRuntimeAnchorWorldPose` the
 * real component calls — no scene, no mounted skeleton required.
 */
describe('shadowWeaponPresentationPose — reachability by construction', () => {
  function resolveWeaponWorldTransform(chestWorldPos: THREE.Vector3, chestWorldQuat: THREE.Quaternion, adsBlend: number) {
    const hipPose = SHADOW_WEAPON_PRESENTATION.hip;
    const adsPose = SHADOW_WEAPON_PRESENTATION.ads;
    const localOffset = new THREE.Vector3(
      THREE.MathUtils.lerp(hipPose.positionLocal[0], adsPose.positionLocal[0], adsBlend),
      THREE.MathUtils.lerp(hipPose.positionLocal[1], adsPose.positionLocal[1], adsBlend),
      THREE.MathUtils.lerp(hipPose.positionLocal[2], adsPose.positionLocal[2], adsBlend),
    );
    const worldPos = localOffset.clone().applyQuaternion(chestWorldQuat).add(chestWorldPos);
    const worldQuat = chestWorldQuat.clone().multiply(WEAPON_CHEST_ALIGN_QUAT);
    return { worldPos, worldQuat };
  }

  const CHEST_TRANSFORMS: Array<{ pos: THREE.Vector3; yawDeg: number }> = [
    { pos: new THREE.Vector3(0, 1.4, 0), yawDeg: 0 },
    { pos: new THREE.Vector3(5, 1.4, -3), yawDeg: 90 },
    { pos: new THREE.Vector3(-2, 1.4, 8), yawDeg: -135 },
    { pos: new THREE.Vector3(0, 1.4, 0), yawDeg: 179 },
  ];

  it('right and left grip anchors resolve within 0.5m of the chest, for every tested chest world position/yaw and both hip/ADS blends', () => {
    const output = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    for (const { pos, yawDeg } of CHEST_TRANSFORMS) {
      const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yawDeg));
      for (const adsBlend of [0, 1]) {
        const { worldPos, worldQuat } = resolveWeaponWorldTransform(pos, quat, adsBlend);
        for (const anchor of [VORTEX_RUNTIME_ANCHORS.gripHandLocal, VORTEX_RUNTIME_ANCHORS.gripSupportLocal]) {
          const ok = resolveRuntimeAnchorWorldPose(anchor, VORTEX_VIEWMODEL_POSES.hip.scale, worldPos, worldQuat, output);
          assert.strictEqual(ok, true);
          const distFromChest = output.position.distanceTo(pos);
          assert.ok(distFromChest < 0.5, `grip anchor landed ${distFromChest.toFixed(3)}m from chest at yaw=${yawDeg} ads=${adsBlend} — expected < 0.5m (reachable by construction)`);
        }
      }
    }
  });

  it('right and left grip anchors stay close to EACH OTHER (bounded hand spread), independent of chest world transform', () => {
    const rightOut = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    const leftOut = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    for (const { pos, yawDeg } of CHEST_TRANSFORMS) {
      const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yawDeg));
      const { worldPos, worldQuat } = resolveWeaponWorldTransform(pos, quat, 0);
      resolveRuntimeAnchorWorldPose(VORTEX_RUNTIME_ANCHORS.gripHandLocal, VORTEX_VIEWMODEL_POSES.hip.scale, worldPos, worldQuat, rightOut);
      resolveRuntimeAnchorWorldPose(VORTEX_RUNTIME_ANCHORS.gripSupportLocal, VORTEX_VIEWMODEL_POSES.hip.scale, worldPos, worldQuat, leftOut);
      const handSpread = rightOut.position.distanceTo(leftOut.position);
      assert.ok(handSpread < 0.4, `hand spread ${handSpread.toFixed(3)}m at yaw=${yawDeg} exceeds a plausible two-handed rifle grip span`);
    }
  });

  it('reload/inspect left-hand action-target anchors also resolve within 0.5m of the chest (same body-anchored transform, no separate reach problem for action gestures)', () => {
    const output = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    const pos = new THREE.Vector3(1, 1.4, 2);
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(37));
    const { worldPos, worldQuat } = resolveWeaponWorldTransform(pos, quat, 0);
    for (const anchor of [RELOAD_LEFT_HAND_LOCAL, INSPECT_LEFT_HAND_LOCAL]) {
      const ok = resolveRuntimeAnchorWorldPose(anchor, VORTEX_VIEWMODEL_POSES.hip.scale, worldPos, worldQuat, output);
      assert.strictEqual(ok, true);
      assert.ok(output.position.distanceTo(pos) < 0.5);
    }
  });
});

describe('shadowWeaponPresentationPose — resolveDesiredShadowWeaponPose (Step 8E-C.3)', () => {
  it('at adsBlend=0, sprintBlend=0, idle phase, returns exactly the hip pose', () => {
    const result = resolveDesiredShadowWeaponPose('idle', 0, 0);
    assert.deepStrictEqual(result, SHADOW_WEAPON_PRESENTATION.hip);
  });

  it('at adsBlend=1, sprintBlend=0, idle phase, returns exactly the ads pose', () => {
    const result = resolveDesiredShadowWeaponPose('idle', 1, 0);
    assert.deepStrictEqual(result, SHADOW_WEAPON_PRESENTATION.ads);
  });

  it('at sprintBlend=1 (ads=0), returns exactly the sprint pose', () => {
    const result = resolveDesiredShadowWeaponPose('idle', 0, 1);
    assert.deepStrictEqual(result, SHADOW_WEAPON_PRESENTATION.sprint);
  });

  it('an active reload/inspect phase returns ITS OWN named pose directly, ignoring adsBlend/sprintBlend entirely (matches vortexWeaponState.ts priority: reload/inspect outrank ads/sprint)', () => {
    for (const phase of ['reloadSettle', 'reloadManipulate', 'reloadReturn', 'inspectAnticipate', 'inspectHold', 'inspectReturn'] as const) {
      const result = resolveDesiredShadowWeaponPose(phase, 1, 1); // deliberately max ads+sprint to prove they're ignored
      assert.deepStrictEqual(result, SHADOW_WEAPON_PRESENTATION[phase], `phase=${phase} must return its own pose regardless of ads/sprint blend`);
    }
  });

  it('an unrecognized phase string falls back to the ads/sprint-blended base (fail-soft, never throws), landing exactly halfway between hip and ads at adsBlend=0.5', () => {
    const result = resolveDesiredShadowWeaponPose('some-unknown-phase', 0.5, 0);
    const hip = SHADOW_WEAPON_PRESENTATION.hip;
    const ads = SHADOW_WEAPON_PRESENTATION.ads;
    for (let i = 0; i < 3; i++) {
      const expected = (hip.positionLocal[i] + ads.positionLocal[i]) / 2;
      assert.ok(Math.abs(result.positionLocal[i] - expected) < 1e-9, `axis ${i}: expected midpoint ${expected}, got ${result.positionLocal[i]}`);
    }
  });

  it('every state (all 9 named poses + every phase key) is currently DIFFERENT from hip — the pre-8E-C.3 audit finding (every action produced the identical hip transform) no longer holds', () => {
    const hip = SHADOW_WEAPON_PRESENTATION.hip;
    const others: Array<keyof typeof SHADOW_WEAPON_PRESENTATION> = ['ads', 'sprint', 'reloadSettle', 'reloadManipulate', 'reloadReturn', 'inspectAnticipate', 'inspectHold', 'inspectReturn'];
    for (const key of others) {
      const pose = SHADOW_WEAPON_PRESENTATION[key];
      const identical = pose.positionLocal.every((v, i) => v === hip.positionLocal[i]) && pose.rotationEulerOffsetDeg.every((v, i) => v === hip.rotationEulerOffsetDeg[i]);
      assert.ok(!identical, `${key} must differ from hip — an identical pose here would reproduce the exact defect this pass fixes`);
    }
  });

  it('adsBlend/sprintBlend clamp out-of-range input rather than extrapolating or producing non-finite output', () => {
    const overOne = resolveDesiredShadowWeaponPose('idle', 5, -5);
    for (const v of [...overOne.positionLocal, ...overOne.rotationEulerOffsetDeg]) assert.ok(Number.isFinite(v));
  });
});

describe('shadowWeaponPresentationPose — computeShadowRecoilKickMultiplier (Step 8E-C.3)', () => {
  it('is exactly 1.0 at t=0 (the instant of a shot)', () => {
    assert.strictEqual(computeShadowRecoilKickMultiplier(0), 1);
  });

  it('decays monotonically toward 0 as time since the shot increases', () => {
    let previous = computeShadowRecoilKickMultiplier(0);
    for (const t of [0.05, 0.1, 0.2, 0.4, 0.8, 1.5]) {
      const current = computeShadowRecoilKickMultiplier(t);
      assert.ok(current < previous, `expected monotonic decay, got ${previous} -> ${current} at t=${t}`);
      previous = current;
    }
  });

  it('is negligible (<1%) within a second, given the configured decay rate', () => {
    const oneSecond = computeShadowRecoilKickMultiplier(1);
    assert.ok(oneSecond < 0.01, `expected <1% remaining after 1s at decayRate=${SHADOW_RECOIL_KICK.decayRate}, got ${oneSecond}`);
  });

  it('fail-soft: negative or non-finite input returns 0, never NaN/negative', () => {
    assert.strictEqual(computeShadowRecoilKickMultiplier(-1), 0);
    assert.strictEqual(computeShadowRecoilKickMultiplier(NaN), 0);
    assert.strictEqual(computeShadowRecoilKickMultiplier(-Infinity), 0);
  });

  it('never exceeds 1.0 for any non-negative input', () => {
    for (const t of [0, 0.001, 10, 1000]) assert.ok(computeShadowRecoilKickMultiplier(t) <= 1);
  });
});
