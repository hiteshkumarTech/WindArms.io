/**
 * WindArms — deterministic Vortex grip-anchor transform harness (Milestone
 * 7, Phase F, Step 14). A fast regression tool that exercises the REAL
 * production math (`resolveRuntimeAnchorWorldPose` from
 * `src/lib/v2/weapons/runtimeAnchorMath.ts`, the exact function
 * `VortexViewmodel.tsx` calls every frame) against a handful of named,
 * hand-computed weapon poses — no browser, no Canvas, no React, just
 * import-and-call. Deliberately does NOT duplicate the math (that's the
 * whole point of extracting it into a pure module in the first place) —
 * if this harness and the runtime ever disagree, it's because one of them
 * changed, not because two independent implementations drifted apart.
 *
 * Usage:
 *   npx tsx tools/test-vortex-anchor-transforms.ts
 *
 * Exits non-zero if any scenario's assertions fail — safe to wire into CI
 * alongside `npm test`.
 */

import * as THREE from 'three';
import { resolveRuntimeAnchorWorldPose } from '../src/lib/v2/weapons/runtimeAnchorMath';
import { VORTEX_RUNTIME_ANCHORS } from '../src/lib/v2/weapons/vortexRuntimeAnchors';
import { VORTEX_VIEWMODEL_POSES } from '../src/lib/v2/weapons/vortexViewmodelPose';

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`  ✖ FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`  ✔ pass  ${label}`);
  }
}

function isFiniteVec3(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
function isUnitQuat(q: THREE.Quaternion): boolean {
  const len = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2);
  return Math.abs(len - 1) < 1e-6;
}

interface Scenario {
  name: string;
  /** Weapon group world position/quaternion for this scenario — hand-computed to represent a NAMED real pose, not arbitrary numbers. */
  weaponWorldPosition: THREE.Vector3;
  weaponWorldQuaternion: THREE.Quaternion;
  poseScale: number;
}

const scenarios: Scenario[] = [
  {
    name: 'identity weapon (origin, no rotation, unit scale)',
    weaponWorldPosition: new THREE.Vector3(0, 0, 0),
    weaponWorldQuaternion: new THREE.Quaternion(),
    poseScale: 1,
  },
  {
    name: 'hip-fire (camera at eye height, hip pose scale)',
    weaponWorldPosition: new THREE.Vector3(0, 1.7, 0),
    weaponWorldQuaternion: new THREE.Quaternion(), // camera looking down -Z, no additional rotation for this harness's purposes
    poseScale: VORTEX_VIEWMODEL_POSES.hip.scale,
  },
  {
    name: 'ADS (camera at eye height, ads pose scale)',
    weaponWorldPosition: new THREE.Vector3(0, 1.7, 0),
    weaponWorldQuaternion: new THREE.Quaternion(),
    poseScale: VORTEX_VIEWMODEL_POSES.ads.scale,
  },
  {
    name: 'recoil rotation (camera pitched up ~6 degrees, simulating a recoil punch)',
    weaponWorldPosition: new THREE.Vector3(0, 1.7, 0),
    weaponWorldQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(6)),
    poseScale: VORTEX_VIEWMODEL_POSES.hip.scale,
  },
  {
    name: 'inspect rotation (camera-relative weapon tilted ~15 degrees around view axis)',
    weaponWorldPosition: new THREE.Vector3(0, 1.7, 0),
    weaponWorldQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(15)),
    poseScale: VORTEX_VIEWMODEL_POSES.hip.scale,
  },
  {
    name: 'player facing an arbitrary yaw (90 degrees around Y — a real in-game heading, not axis-aligned)',
    weaponWorldPosition: new THREE.Vector3(12.5, 1.7, -4.2),
    weaponWorldQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(90)),
    poseScale: VORTEX_VIEWMODEL_POSES.hip.scale,
  },
];

for (const scenario of scenarios) {
  console.log(`\nScenario: ${scenario.name}`);
  const rightOut = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  const leftOut = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

  const rightOk = resolveRuntimeAnchorWorldPose(
    VORTEX_RUNTIME_ANCHORS.gripHandLocal,
    scenario.poseScale,
    scenario.weaponWorldPosition,
    scenario.weaponWorldQuaternion,
    rightOut,
  );
  const leftOk = resolveRuntimeAnchorWorldPose(
    VORTEX_RUNTIME_ANCHORS.gripSupportLocal,
    scenario.poseScale,
    scenario.weaponWorldPosition,
    scenario.weaponWorldQuaternion,
    leftOut,
  );

  check(`${scenario.name}: right hand resolves`, rightOk);
  check(`${scenario.name}: left hand resolves`, leftOk);
  check(`${scenario.name}: right position finite`, isFiniteVec3(rightOut.position));
  check(`${scenario.name}: left position finite`, isFiniteVec3(leftOut.position));
  check(`${scenario.name}: right quaternion is unit-length`, isUnitQuat(rightOut.quaternion));
  check(`${scenario.name}: left quaternion is unit-length`, isUnitQuat(leftOut.quaternion));
  check(
    `${scenario.name}: right and left world positions are distinct`,
    rightOut.position.distanceTo(leftOut.position) > 0.01,
    `distance=${rightOut.position.distanceTo(leftOut.position).toFixed(4)}`,
  );
  check(
    `${scenario.name}: both hands stay within arm's-reach of the weapon's own world position (sanity bound)`,
    rightOut.position.distanceTo(scenario.weaponWorldPosition) < 1 && leftOut.position.distanceTo(scenario.weaponWorldPosition) < 1,
  );

  console.log(`    right: pos=[${rightOut.position.toArray().map((v) => v.toFixed(4)).join(', ')}] quat=[${rightOut.quaternion.toArray().map((v) => v.toFixed(4)).join(', ')}]`);
  console.log(`    left:  pos=[${leftOut.position.toArray().map((v) => v.toFixed(4)).join(', ')}] quat=[${leftOut.quaternion.toArray().map((v) => v.toFixed(4)).join(', ')}]`);
}

console.log(`\n${checks - failures}/${checks} checks passed across ${scenarios.length} scenarios.`);
if (failures > 0) {
  console.error(`${failures} FAILED.`);
  process.exit(1);
}
console.log('All scenarios passed.');
