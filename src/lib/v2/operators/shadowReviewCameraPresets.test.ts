import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { computeShadowReviewCameraTransform, SHADOW_REVIEW_CAMERA_PRESETS } from './shadowReviewCameraPresets';
import type { ShadowReviewCameraTransform } from './shadowReviewCameraPresets';

const PLAYER_POS = new THREE.Vector3(3, 0, -4);

describe('shadowReviewCameraPresets — finite output guarantee', () => {
  it('every preset produces a finite position/lookAt, at several player yaws', () => {
    for (const preset of SHADOW_REVIEW_CAMERA_PRESETS) {
      for (const yawDeg of [0, 45, 90, 135, 180, -45, -90, 270]) {
        const t = computeShadowReviewCameraTransform(preset, PLAYER_POS, THREE.MathUtils.degToRad(yawDeg));
        for (const v of [t.position, t.lookAt]) {
          assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), `${preset} at yaw=${yawDeg} produced non-finite output`);
        }
      }
    }
  });
});

const LIGHT_AXIS_PRESETS = ['lightFacing', 'shadowClose', 'shadowWide'] as const;

describe('shadowReviewCameraPresets — player-relative presets', () => {
  it('threeQuarterFront/threeQuarterRear/leftSide/rightSide/highOblique/receiverWide/bodyClose*/handsClose* stay at a roughly constant XZ distance from the player regardless of yaw (rotate WITH the player, do not drift)', () => {
    const relativePresets = SHADOW_REVIEW_CAMERA_PRESETS.filter((p) => !(LIGHT_AXIS_PRESETS as readonly string[]).includes(p));
    for (const preset of relativePresets) {
      const distances: number[] = [];
      for (const yawDeg of [0, 60, 120, 200, 300]) {
        const t = computeShadowReviewCameraTransform(preset, PLAYER_POS, THREE.MathUtils.degToRad(yawDeg));
        const dx = t.position.x - PLAYER_POS.x;
        const dz = t.position.z - PLAYER_POS.z;
        distances.push(Math.hypot(dx, dz));
      }
      const [first, ...rest] = distances;
      for (const d of rest) assert.ok(Math.abs(d - first) < 1e-6, `${preset}: expected constant XZ radius across yaws, got ${JSON.stringify(distances)}`);
    }
  });

  it('the camera is always ABOVE the player root (never below ground level relative to the player)', () => {
    for (const preset of SHADOW_REVIEW_CAMERA_PRESETS) {
      const t = computeShadowReviewCameraTransform(preset, PLAYER_POS, 0);
      assert.ok(t.position.y > PLAYER_POS.y, `${preset}: camera height ${t.position.y} must exceed player root height ${PLAYER_POS.y}`);
    }
  });

  it('lookAt is close to the player position (within a few meters) for every preset', () => {
    for (const preset of SHADOW_REVIEW_CAMERA_PRESETS) {
      const t = computeShadowReviewCameraTransform(preset, PLAYER_POS, THREE.MathUtils.degToRad(37));
      assert.ok(t.lookAt.distanceTo(PLAYER_POS) < 3, `${preset}: lookAt (${t.lookAt.toArray()}) too far from player (${PLAYER_POS.toArray()})`);
    }
  });

  it('leftSide and rightSide are on opposite sides of the player (roughly 180 apart in their offset from player)', () => {
    const left = computeShadowReviewCameraTransform('leftSide', PLAYER_POS, 0);
    const right = computeShadowReviewCameraTransform('rightSide', PLAYER_POS, 0);
    const leftDir = new THREE.Vector3(left.position.x - PLAYER_POS.x, 0, left.position.z - PLAYER_POS.z).normalize();
    const rightDir = new THREE.Vector3(right.position.x - PLAYER_POS.x, 0, right.position.z - PLAYER_POS.z).normalize();
    assert.ok(leftDir.dot(rightDir) < -0.9, `expected left/right to point in roughly opposite directions, got dot=${leftDir.dot(rightDir)}`);
  });
});

/**
 * Step 8E-C.3.2 — regression coverage for the found-and-fixed front/rear
 * naming bug (see docs/known-bugs.md's now-resolved entry and this module's
 * own doc comment on the `dir.z = -dir.z` correction). At player yaw=0 the
 * character faces world -Z (verified via `RangeController.tsx`'s
 * `camera.rotation.y = yaw.current` and, independently, the weapon-muzzle
 * world-position investigation in `shadowWeaponPresentationPose.ts`), and
 * the character's own right side is world +X (verified via the real R/L
 * shoulder world-position readout: R=+0.082, L=-0.271 at yaw=0). These tests
 * pin BOTH facts down numerically so the naming bug cannot silently
 * reappear.
 */
describe('shadowReviewCameraPresets — absolute front/rear/left/right correctness (Step 8E-C.3.2)', () => {
  it('threeQuarterFront/bodyCloseThreeQuarter sit on the -Z (forward-facing) side of the player, not +Z (behind)', () => {
    for (const preset of ['threeQuarterFront', 'bodyCloseThreeQuarter'] as const) {
      const t = computeShadowReviewCameraTransform(preset, PLAYER_POS, 0);
      assert.ok(t.position.z < PLAYER_POS.z, `${preset}: expected camera on the -Z (front) side, got z=${t.position.z} vs player z=${PLAYER_POS.z}`);
    }
  });

  it('threeQuarterRear sits on the +Z (behind) side of the player, not -Z (front)', () => {
    const t = computeShadowReviewCameraTransform('threeQuarterRear', PLAYER_POS, 0);
    assert.ok(t.position.z > PLAYER_POS.z, `threeQuarterRear: expected camera on the +Z (rear) side, got z=${t.position.z} vs player z=${PLAYER_POS.z}`);
  });

  it("rightSide/handsCloseRight sit on the +X side of the player (the character's real right, per the measured shoulder ground truth)", () => {
    for (const preset of ['rightSide', 'handsCloseRight'] as const) {
      const t = computeShadowReviewCameraTransform(preset, PLAYER_POS, 0);
      assert.ok(t.position.x > PLAYER_POS.x, `${preset}: expected camera on the +X (right) side, got x=${t.position.x} vs player x=${PLAYER_POS.x}`);
    }
  });

  it("leftSide/bodyCloseSide/handsCloseLeft sit on the -X side of the player (the character's real left)", () => {
    for (const preset of ['leftSide', 'bodyCloseSide', 'handsCloseLeft'] as const) {
      const t = computeShadowReviewCameraTransform(preset, PLAYER_POS, 0);
      assert.ok(t.position.x < PLAYER_POS.x, `${preset}: expected camera on the -X (left) side, got x=${t.position.x} vs player x=${PLAYER_POS.x}`);
    }
  });
});

describe('shadowReviewCameraPresets — lightFacing (world-fixed direction, not player-yaw-relative)', () => {
  it('the OFFSET from the player is identical regardless of player yaw (world-fixed, unlike the other presets)', () => {
    const offsets: THREE.Vector3[] = [];
    for (const yawDeg of [0, 90, 180, 270]) {
      const t = computeShadowReviewCameraTransform('lightFacing', PLAYER_POS, THREE.MathUtils.degToRad(yawDeg));
      offsets.push(t.position.clone().sub(PLAYER_POS));
    }
    for (let i = 1; i < offsets.length; i++) {
      assert.ok(offsets[i].distanceTo(offsets[0]) < 1e-6, `lightFacing offset must not depend on player yaw — got ${offsets[0].toArray()} vs ${offsets[i].toArray()}`);
    }
  });

  it('looks toward where the shadow actually falls (light at [12,22,8], default target origin -> shadow falls toward -X,-Z) — the lookAt point sits further along -X,-Z than the camera position', () => {
    const t = computeShadowReviewCameraTransform('lightFacing', PLAYER_POS, 0);
    // The camera sits on the +X,+Z side of the player (opposite the shadow), the lookAt sits on the -X,-Z side.
    assert.ok(t.position.x > PLAYER_POS.x, `camera should sit on the light's side (+X) of the player, got x=${t.position.x} vs player x=${PLAYER_POS.x}`);
    assert.ok(t.lookAt.x < PLAYER_POS.x, `lookAt should sit toward the shadow's side (-X) of the player, got x=${t.lookAt.x} vs player x=${PLAYER_POS.x}`);
  });
});

describe('shadowReviewCameraPresets — shadowClose/shadowWide (Step 8E-C.3.1 close marker-free shadow presets)', () => {
  it('share the lightFacing world-fixed-offset invariant (offset from player does not depend on player yaw)', () => {
    for (const preset of ['shadowClose', 'shadowWide'] as const) {
      const offsets: THREE.Vector3[] = [];
      for (const yawDeg of [0, 90, 180, 270]) {
        const t = computeShadowReviewCameraTransform(preset, PLAYER_POS, THREE.MathUtils.degToRad(yawDeg));
        offsets.push(t.position.clone().sub(PLAYER_POS));
      }
      for (let i = 1; i < offsets.length; i++) {
        assert.ok(offsets[i].distanceTo(offsets[0]) < 1e-6, `${preset} offset must not depend on player yaw`);
      }
    }
  });

  it('shadowClose sits closer to the player than lightFacing, and shadowWide sits further than lightFacing (close < medium < wide)', () => {
    const close = computeShadowReviewCameraTransform('shadowClose', PLAYER_POS, 0);
    const medium = computeShadowReviewCameraTransform('lightFacing', PLAYER_POS, 0);
    const wide = computeShadowReviewCameraTransform('shadowWide', PLAYER_POS, 0);
    const d = (t: ShadowReviewCameraTransform) => t.position.distanceTo(PLAYER_POS);
    assert.ok(d(close) < d(medium), `expected shadowClose (${d(close)}) < lightFacing (${d(medium)})`);
    assert.ok(d(medium) < d(wide), `expected lightFacing (${d(medium)}) < shadowWide (${d(wide)})`);
  });

  it('both look toward the shadow side (-X,-Z) of the player, same direction as lightFacing', () => {
    for (const preset of ['shadowClose', 'shadowWide'] as const) {
      const t = computeShadowReviewCameraTransform(preset, PLAYER_POS, 0);
      assert.ok(t.position.x > PLAYER_POS.x, `${preset}: camera should sit on the light's side (+X)`);
      assert.ok(t.lookAt.x < PLAYER_POS.x, `${preset}: lookAt should sit toward the shadow's side (-X)`);
    }
  });
});

describe('shadowReviewCameraPresets — bodyClose*/handsClose* (Step 8E-C.3.1 close review presets)', () => {
  it('bodyCloseThreeQuarter/bodyCloseSide sit at a noticeably tighter radius than their wide counterparts (threeQuarterFront/leftSide), for a bigger in-frame character', () => {
    const bodyClose3q = computeShadowReviewCameraTransform('bodyCloseThreeQuarter', PLAYER_POS, 0);
    const wide3q = computeShadowReviewCameraTransform('threeQuarterFront', PLAYER_POS, 0);
    assert.ok(bodyClose3q.position.distanceTo(PLAYER_POS) < wide3q.position.distanceTo(PLAYER_POS), 'bodyCloseThreeQuarter should be closer than threeQuarterFront');

    const bodyCloseSide = computeShadowReviewCameraTransform('bodyCloseSide', PLAYER_POS, 0);
    const wideSide = computeShadowReviewCameraTransform('leftSide', PLAYER_POS, 0);
    assert.ok(bodyCloseSide.position.distanceTo(PLAYER_POS) < wideSide.position.distanceTo(PLAYER_POS), 'bodyCloseSide should be closer than leftSide');
  });

  it('handsCloseRight/handsCloseLeft are the tightest-radius presets of all (isolating the grip, not the whole body)', () => {
    const allDistances = SHADOW_REVIEW_CAMERA_PRESETS.filter((p) => p !== 'handsCloseRight' && p !== 'handsCloseLeft').map(
      (p) => computeShadowReviewCameraTransform(p, PLAYER_POS, 0).position.distanceTo(PLAYER_POS),
    );
    const right = computeShadowReviewCameraTransform('handsCloseRight', PLAYER_POS, 0).position.distanceTo(PLAYER_POS);
    const left = computeShadowReviewCameraTransform('handsCloseLeft', PLAYER_POS, 0).position.distanceTo(PLAYER_POS);
    for (const d of allDistances) {
      assert.ok(right < d, `handsCloseRight (${right}) should be closer than every other preset (found ${d})`);
      assert.ok(left < d, `handsCloseLeft (${left}) should be closer than every other preset (found ${d})`);
    }
  });

  it('handsCloseRight/handsCloseLeft look at grip height, not mid-torso — a distinct lookAtHeight from the body-framing presets', () => {
    const right = computeShadowReviewCameraTransform('handsCloseRight', PLAYER_POS, 0);
    const bodyClose = computeShadowReviewCameraTransform('bodyCloseThreeQuarter', PLAYER_POS, 0);
    assert.notEqual(right.lookAt.y, bodyClose.lookAt.y, 'expected handsCloseRight to target a different height than bodyCloseThreeQuarter');
  });

  it('handsCloseRight and handsCloseLeft approach from opposite sides (mirrored yaw offset)', () => {
    const right = computeShadowReviewCameraTransform('handsCloseRight', PLAYER_POS, 0);
    const left = computeShadowReviewCameraTransform('handsCloseLeft', PLAYER_POS, 0);
    const rightDir = new THREE.Vector3(right.position.x - PLAYER_POS.x, 0, right.position.z - PLAYER_POS.z).normalize();
    const leftDir = new THREE.Vector3(left.position.x - PLAYER_POS.x, 0, left.position.z - PLAYER_POS.z).normalize();
    assert.ok(rightDir.dot(leftDir) < 0.9, `expected handsCloseRight/handsCloseLeft to approach from different sides, got dot=${rightDir.dot(leftDir)}`);
  });
});
