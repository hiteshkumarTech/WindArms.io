import * as THREE from 'three';
import { clampTargetToMaxReach, solveTwoBoneIk, type TwoBoneIkOutput } from '@/lib/v2/operators/ik/twoBoneIk';
import { FIRST_PERSON_ARM_IK_CONFIG, type HandFingerPoseConfig } from '@/lib/v2/operators/firstPersonArmIkConfig';
import type { ArmRestMetrics, ResolvedArmBones } from '@/lib/v2/operators/kaelArmRig';
import { measureArmRestMetrics } from '@/lib/v2/operators/kaelArmRig';
import type { KaelArmDebugSide } from '@/lib/v2/weapons/kaelArmDebugState';

/**
 * Per-arm IK solving and bone application (Milestone 7, Phase F, Step 6).
 * Extracted out of `KaelFirstPersonArms.tsx` into its own tested module
 * (2026-07-22) after two real bugs were caught in this exact code path
 * without test coverage — a self-aliasing `Vector3` in the target clamp,
 * and a stale-`matrixWorld` read that corrupted the rendered skeleton the
 * moment the camera moved. No React/scene-mounting dependency — pure
 * THREE.js object manipulation, testable against a synthetic skeleton.
 */

export const isDev = process.env.NODE_ENV !== 'production';
const warnedOnce = new Set<string>();
export function warnOnce(key: string, message: string): void {
  if (!isDev || warnedOnce.has(key)) return;
  warnedOnce.add(key);
  console.warn(`[kael-fp-arms] ${message}`);
}

export function isFiniteVector3(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
export function isFiniteQuaternion(q: THREE.Quaternion): boolean {
  return Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);
}

/**
 * Full local-transform snapshot of one bone (Step 6D true rest-pose mode) —
 * position + quaternion + scale, captured directly from the freshly-cloned,
 * never-yet-touched skeleton. Deliberately captures all three components
 * even though only `.quaternion` is ever written by `solveSide`/
 * `applyFingerPose` today: this is meant to be a hard, unconditional
 * ground-truth restore (`restoreRestPose`) independent of the solver's own
 * weight=0 blend math, not a claim that position/scale currently drift.
 */
export interface BoneTransformSnapshot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

function captureBoneTransform(bone: THREE.Object3D): BoneTransformSnapshot {
  return { position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() };
}

function restoreBoneTransform(bone: THREE.Object3D, snapshot: BoneTransformSnapshot): void {
  bone.position.copy(snapshot.position);
  bone.quaternion.copy(snapshot.quaternion);
  bone.scale.copy(snapshot.scale);
}

export interface SideRuntimeState {
  bones: ResolvedArmBones['left'];
  metrics: ArmRestMetrics;
  restHandLocalQuat: THREE.Quaternion;
  restFingerLocalQuats: Partial<Record<keyof HandFingerPoseConfig, THREE.Quaternion[]>>;
  /** True rest-pose snapshots (Step 6D) — captured once at mount, restored verbatim by `restoreRestPose`, bypassing the IK solver entirely. */
  restUpperArm: BoneTransformSnapshot;
  restLowerArm: BoneTransformSnapshot;
  restHand: BoneTransformSnapshot;
  restFingers: Partial<Record<keyof HandFingerPoseConfig, BoneTransformSnapshot[]>>;
  ikOutput: TwoBoneIkOutput;
  scratch: {
    forward: THREE.Vector3;
    poleVec: THREE.Vector3;
    polePerp: THREE.Vector3;
    bendAxis: THREE.Vector3;
    elbowDir: THREE.Vector3;
    handDir: THREE.Vector3;
    deltaQuat: THREE.Quaternion;
    restWeightQuat: THREE.Quaternion;
    restElbowPos: THREE.Vector3;
    restHandPos: THREE.Vector3;
    /** Step 6F: `metrics.handBasisCorrection` composed with the tuner's optional per-side adjustment (identity when untuned) — kept as its own scratch slot so it's never confused with (or accidentally aliases) the other quaternion scratch above. */
    effectiveBasisCorrection: THREE.Quaternion;
    /** Step 6F: the hand bone's ACTUAL world quaternion, read back AFTER the local rotation has been written and applied — the calibration readouts' "solved" side of the rotation-error comparison. */
    actualHandWorldQuat: THREE.Quaternion;
    /** Step 6G: world-space shoulder-assist offset, converted from container-local into the shoulder bone's PARENT-local space before being added to `restShoulderLocalPos`. */
    assistWorld: THREE.Vector3;
    /** Step 6G: the shoulder bone's PARENT's current world quaternion, read fresh every call (self-correcting via `getWorldQuaternion`) — needed to convert `assistWorld` into that parent's local space. */
    shoulderParentWorldQuat: THREE.Quaternion;
  };
  /** Step 6G: the `shoulder` bone's local position (relative to ITS OWN parent, NOT container-relative — unlike `metrics.shoulderLocalPos`), captured once at mount. `null` when this side has no resolved shoulder bone. The shoulder-assist feature resets to this value every frame before optionally adding an assist, so "remove the assist" always means "back to exactly this," never a residual drift. */
  restShoulderLocalPos: THREE.Vector3 | null;
  shoulderWorldPos: THREE.Vector3;
  restUpperDirWorld: THREE.Vector3;
  restLowerDirWorld: THREE.Vector3;
  restUpperQuatWorld: THREE.Quaternion;
  restLowerQuatWorld: THREE.Quaternion;
  poleWorldDir: THREE.Vector3;
  parentWorldQuat: THREE.Quaternion;
  handWorldQuat: THREE.Quaternion;
  clampedTarget: THREE.Vector3;
}

export function makeIkScratch() {
  return {
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
    effectiveBasisCorrection: new THREE.Quaternion(),
    actualHandWorldQuat: new THREE.Quaternion(),
    assistWorld: new THREE.Vector3(),
    shoulderParentWorldQuat: new THREE.Quaternion(),
  };
}

export function buildSideRuntimeState(container: THREE.Object3D, bones: ResolvedArmBones['left']): SideRuntimeState {
  const metrics = measureArmRestMetrics(container, bones);
  const restFingerLocalQuats: SideRuntimeState['restFingerLocalQuats'] = {};
  const restFingers: SideRuntimeState['restFingers'] = {};
  for (const key of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) {
    const segments = bones.fingers[key];
    if (segments) {
      restFingerLocalQuats[key] = segments.map((b) => b.quaternion.clone());
      restFingers[key] = segments.map((b) => captureBoneTransform(b));
    }
  }
  return {
    bones,
    metrics,
    restHandLocalQuat: bones.hand.quaternion.clone(),
    restFingerLocalQuats,
    restUpperArm: captureBoneTransform(bones.upperArm),
    restLowerArm: captureBoneTransform(bones.lowerArm),
    restHand: captureBoneTransform(bones.hand),
    restFingers,
    ikOutput: { elbowPosition: new THREE.Vector3(), handPosition: new THREE.Vector3(), upperQuat: new THREE.Quaternion(), lowerQuat: new THREE.Quaternion() },
    scratch: makeIkScratch(),
    restShoulderLocalPos: bones.shoulder ? bones.shoulder.position.clone() : null,
    shoulderWorldPos: new THREE.Vector3(),
    restUpperDirWorld: new THREE.Vector3(),
    restLowerDirWorld: new THREE.Vector3(),
    restUpperQuatWorld: new THREE.Quaternion(),
    restLowerQuatWorld: new THREE.Quaternion(),
    poleWorldDir: new THREE.Vector3(),
    parentWorldQuat: new THREE.Quaternion(),
    handWorldQuat: new THREE.Quaternion(),
    clampedTarget: new THREE.Vector3(),
  };
}

// Module-level scratch for finger-pose application — every finger segment
// on every hand, every frame, funnels through these same two preallocated
// objects (sequential use within one synchronous call, never interleaved,
// so reuse is safe — same reasoning as the other per-frame scratch in this
// file). An earlier version of this function allocated a fresh
// Euler+Quaternion PER SEGMENT PER FRAME (10 finger segments x 2 hands x
// 60fps) — a real violation of the "no allocation per frame" requirement,
// caught on re-review before ever running against a live skeleton.
const FINGER_SCRATCH_EULER = new THREE.Euler();
const FINGER_SCRATCH_QUAT = new THREE.Quaternion();
/** Step 6F: reused across all three axis computations at the end of `solveSide` — written and read back immediately each time, never holds state across calls. */
const AXIS_SCRATCH = new THREE.Vector3();

/** Applies additive finger curl (Step 10) — LOCAL rotation.x offset on top of each segment's rest local quaternion, blended by `weight`. Temporary/restrained, never a real grip-contact solve. */
export function applyFingerPose(bones: ResolvedArmBones['left'], restQuats: SideRuntimeState['restFingerLocalQuats'], pose: HandFingerPoseConfig, weight: number) {
  for (const key of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) {
    const segments = bones.fingers[key];
    const rest = restQuats[key];
    const profile = pose[key];
    if (!segments || !rest) continue;
    for (let i = 0; i < segments.length; i++) {
      const curl = (profile.curlX[i] ?? profile.curlX[profile.curlX.length - 1] ?? 0) * weight;
      FINGER_SCRATCH_EULER.set(curl, 0, 0, 'XYZ');
      FINGER_SCRATCH_QUAT.setFromEuler(FINGER_SCRATCH_EULER);
      segments[i].quaternion.copy(rest[i]).multiply(FINGER_SCRATCH_QUAT);
    }
  }
}

/**
 * TRUE rest-pose restore (Step 6D) — a hard, unconditional bypass of the IK
 * solver entirely. Directly overwrites `upperArm`/`lowerArm`/`hand`/every
 * finger segment's local position+quaternion+scale with the snapshot
 * captured once at mount (`buildSideRuntimeState`), and does nothing else:
 * no `solveTwoBoneIk` call, no hand-basis correction, no finger curl, no
 * scene-graph reads. This answers "does IK-disabled genuinely restore the
 * captured rest pose" definitively rather than relying on the solver's own
 * weight=0 blend math (`solveSide` with `weight=0` DOES also converge to a
 * mathematically-equivalent rest pose via `solveTwoBoneIk`'s blend — see
 * that function's weight-blend branch — but going through the solver at
 * all means a bug anywhere in that path could still corrupt the result;
 * this function has no such path to corrupt through by construction).
 */
export function restoreRestPose(side: SideRuntimeState): void {
  restoreBoneTransform(side.bones.upperArm, side.restUpperArm);
  restoreBoneTransform(side.bones.lowerArm, side.restLowerArm);
  restoreBoneTransform(side.bones.hand, side.restHand);
  for (const key of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) {
    const segments = side.bones.fingers[key];
    const rest = side.restFingers[key];
    if (!segments || !rest) continue;
    for (let i = 0; i < segments.length; i++) restoreBoneTransform(segments[i], rest[i]);
  }
}

/** True (`applyBoneTransform`-based) world-space bounding box for a SkinnedMesh — Step 6D's fix for the debug bounding-box helper, which previously used `Box3.setFromObject` (THREE's default, static-bind-pose-geometry-based bounds — confirmed via headless diagnostic to report an IDENTICAL box regardless of IK weight, i.e. it never reflected the actual deformed pose at all). Dev-diagnostic only — this walks every vertex, not something to run unconditionally every frame; the caller gates it behind the debug toggle. */
export interface DeformedSkinnedBoundsResult {
  /** Exact nearest/farthest DEFORMED VERTEX distance from `distanceFrom`, not a box-corner approximation — this is the same metric that originally distinguished "correct-but-close geometry" from "genuinely exploded geometry" earlier in this investigation. */
  nearestVertexDist: number;
  farthestVertexDist: number;
}

export function computeDeformedSkinnedBounds(mesh: THREE.SkinnedMesh, outBox: THREE.Box3, distanceFrom?: THREE.Vector3): DeformedSkinnedBoundsResult {
  mesh.updateMatrixWorld(true);
  const posAttr = mesh.geometry.attributes.position;
  const localVertex = new THREE.Vector3();
  const worldVertex = new THREE.Vector3();
  outBox.makeEmpty();
  let nearestVertexDist = Infinity;
  let farthestVertexDist = 0;
  for (let i = 0; i < posAttr.count; i++) {
    localVertex.fromBufferAttribute(posAttr, i);
    mesh.applyBoneTransform(i, localVertex);
    worldVertex.copy(localVertex).applyMatrix4(mesh.matrixWorld);
    outBox.expandByPoint(worldVertex);
    if (distanceFrom) {
      const d = worldVertex.distanceTo(distanceFrom);
      if (d < nearestVertexDist) nearestVertexDist = d;
      if (d > farthestVertexDist) farthestVertexDist = d;
    }
  }
  return { nearestVertexDist, farthestVertexDist };
}

/**
 * Camera-space classification of every DEFORMED vertex in a SkinnedMesh
 * (Step 6E) — answers "is this geometry actually inside the camera's
 * viewing frustum," independent of any bounding-box math, entirely via the
 * same view/projection matrices the GPU rasterizer uses. Built because a
 * finite, correctly-shaped world-space bounding box (Step 6D's fix) still
 * does not prove the geometry is ON SCREEN — it could be finite and
 * arm-scale while sitting entirely behind the camera, outside the
 * horizontal/vertical FOV, or beyond the far plane, none of which a bounds
 * check alone would catch.
 *
 * Three.js camera convention (documented here because it is easy to get
 * backwards): a camera's own forward-facing direction is LOCAL -Z; a point
 * with camera-space z < 0 is in front of the camera, z > 0 is behind it.
 */
export interface CameraSpaceClassification {
  totalVertices: number;
  inFrontOfCamera: number;
  behindCamera: number;
  /** In front of the camera but closer than `camera.near` — would be near-plane-clipped. */
  nearerThanNear: number;
  /** Farther than `camera.far` — would be far-plane-clipped. */
  fartherThanFar: number;
  /** Vertices whose NDC x/y/z all fall within [-1, 1] — i.e. actually inside the rendered frustum, the definitive "would this pixel draw" test. */
  insideFrustumNdc: number;
  ndcMinX: number;
  ndcMaxX: number;
  ndcMinY: number;
  ndcMaxY: number;
  centerCameraSpace: readonly [number, number, number];
  nearestDist: number;
  farthestDist: number;
}

const CLASSIFY_SCRATCH = {
  localVertex: new THREE.Vector3(),
  worldVertex: new THREE.Vector3(),
  camSpace: new THREE.Vector3(),
  ndc: new THREE.Vector3(),
  viewProjection: new THREE.Matrix4(),
  centerAccum: new THREE.Vector3(),
};

export function classifyVerticesInCameraSpace(mesh: THREE.SkinnedMesh, camera: THREE.PerspectiveCamera): CameraSpaceClassification {
  mesh.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const { localVertex, worldVertex, camSpace, ndc, viewProjection, centerAccum } = CLASSIFY_SCRATCH;
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

  const posAttr = mesh.geometry.attributes.position;
  let inFrontOfCamera = 0;
  let behindCamera = 0;
  let nearerThanNear = 0;
  let fartherThanFar = 0;
  let insideFrustumNdc = 0;
  let ndcMinX = Infinity;
  let ndcMaxX = -Infinity;
  let ndcMinY = Infinity;
  let ndcMaxY = -Infinity;
  let nearestDist = Infinity;
  let farthestDist = 0;
  centerAccum.set(0, 0, 0);

  for (let i = 0; i < posAttr.count; i++) {
    localVertex.fromBufferAttribute(posAttr, i);
    mesh.applyBoneTransform(i, localVertex);
    worldVertex.copy(localVertex).applyMatrix4(mesh.matrixWorld);
    centerAccum.add(worldVertex);

    camSpace.copy(worldVertex).applyMatrix4(camera.matrixWorldInverse);
    const dist = worldVertex.distanceTo(camera.position);
    if (dist < nearestDist) nearestDist = dist;
    if (dist > farthestDist) farthestDist = dist;

    if (camSpace.z < 0) {
      inFrontOfCamera++;
      if (dist < camera.near) nearerThanNear++;
      if (dist > camera.far) fartherThanFar++;
    } else {
      behindCamera++;
    }

    ndc.copy(worldVertex).applyMatrix4(viewProjection);
    if (ndc.x < ndcMinX) ndcMinX = ndc.x;
    if (ndc.x > ndcMaxX) ndcMaxX = ndc.x;
    if (ndc.y < ndcMinY) ndcMinY = ndc.y;
    if (ndc.y > ndcMaxY) ndcMaxY = ndc.y;
    if (ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1 && ndc.z >= -1 && ndc.z <= 1) {
      insideFrustumNdc++;
    }
  }

  centerAccum.divideScalar(Math.max(posAttr.count, 1)).applyMatrix4(camera.matrixWorldInverse);

  return {
    totalVertices: posAttr.count,
    inFrontOfCamera,
    behindCamera,
    nearerThanNear,
    fartherThanFar,
    insideFrustumNdc,
    ndcMinX,
    ndcMaxX,
    ndcMinY,
    ndcMaxY,
    centerCameraSpace: [centerAccum.x, centerAccum.y, centerAccum.z],
    nearestDist,
    farthestDist,
  };
}

/**
 * Step 6F visual-calibration tuning overrides — every field optional,
 * `undefined`/absent means "use the shipped `FIRST_PERSON_ARM_IK_CONFIG`/
 * measured-rig value, exactly as before this step." Lets `KaelArmIkTunerPanel`
 * adjust hand-basis alignment, per-side rotation blend, and finger curl
 * strength live, without touching the canonical config or the solver's own
 * architecture — same "override on top of shipped defaults" convention
 * already established for `rightElbowPoleLocal`/`shoulderRootOffset`.
 */
export interface SideTuningOverrides {
  /**
   * Composed with `metrics.handBasisCorrection` (post-multiplied — i.e.
   * expressed in the CANONICAL grip-anchor frame: X=finger-forward,
   * Y=thumb-side, Z=palm-normal, the same convention `vortexRuntimeAnchors.ts`
   * documents) BEFORE that combined correction is applied. Identity
   * (default, when this field is absent) reproduces the exact
   * pre-Step-6F behavior.
   */
  handBasisAdjustQuat?: THREE.Quaternion;
  /** Overrides `FIRST_PERSON_ARM_IK_CONFIG.rotationWeight` for this side only. */
  rotationWeight?: number;
  /** Multiplies the finger-curl weight passed to `applyFingerPose` (0 = no curl, 1 = full authored curl, same as omitting this field). */
  fingerCurlScale?: number;
  /**
   * Step 6G: rigidly translates THIS SIDE's shoulder-bone attachment point
   * (and therefore the whole upper-arm→lower-arm→hand→finger sub-chain
   * hanging off it), in CONTAINER-LOCAL space (same camera-relative
   * convention as `shoulderRootOffset` — +x right, +y up, -z forward).
   * Absent/undefined (default) leaves the shoulder bone at its captured
   * rest position, byte-identical to pre-Step-6G behavior.
   *
   * WHY A REAL BONE TRANSLATION, NOT JUST A FAKE SOLVE-TIME ROOT: an
   * earlier design considered feeding a shifted root position into the
   * two-bone solver's math WITHOUT actually moving the rendered shoulder
   * bone. That does not work — the solver would compute a rotation
   * assuming a false pivot, but the RENDERED chain still visually
   * originates from the bone's true (unmoved) position (IK here only ever
   * writes bone ROTATIONS, never positions, except for this one deliberate
   * exception). The result is a hand that lands at `target - assist`, not
   * `target` — MOVING the positional error by the assist amount rather
   * than REDUCING it. A real rigid translation of the shoulder bone itself
   * is the only way an assist can actually shorten the shoulder-to-target
   * distance the solver has to cover. Does not stretch the arm — bone
   * LENGTHS (upperArm/lowerArm's own local positions) are never touched,
   * only the chain's ROOT moves, exactly like a shoulder physically
   * shrugging/reaching forward would.
   */
  shoulderAssistLocal?: THREE.Vector3;
}

/**
 * Solves and applies IK for one arm — position weight drives the two-bone
 * solve + finger curl, rotation weight drives hand alignment (Step 9's
 * explicit "blend rotation separately from position").
 *
 * `bones.upperArm.parent!.getWorldQuaternion(...)` reads the parent bone's
 * world rotation directly from the scene graph. Note this is safe even if
 * the caller hasn't freshly updated the subtree: `Object3D.getWorldQuaternion`
 * calls `updateWorldMatrix(true, false)` on itself before reading, so it
 * self-corrects its own ancestor chain regardless (verified by a dedicated
 * test in `kaelArmSolve.test.ts` — an earlier theory that this read could
 * go stale was built, tested, and disproven). Callers should still keep
 * `container`'s subtree matrixWorld reasonably fresh as good practice (any
 * FUTURE direct `.matrixWorld` access added here would not have this
 * self-correcting property), but it is not required for THIS function's
 * correctness today. `lowerArm`/`hand` never read the scene graph a second
 * time at all — they derive from `ikOutput.upperQuat`/`ikOutput.lowerQuat`
 * directly (in-memory values just computed this call).
 */
export function solveSide(
  side: SideRuntimeState,
  container: THREE.Object3D,
  containerWorldQuat: THREE.Quaternion,
  targetWorldPos: THREE.Vector3,
  targetWorldQuat: THREE.Quaternion,
  poleLocalDir: readonly [number, number, number],
  weight: number,
  fingerPose: HandFingerPoseConfig,
  debugOut: KaelArmDebugSide,
  tuning?: SideTuningOverrides,
): boolean {
  const { metrics, bones, ikOutput, scratch } = side;

  // Step 6G shoulder assist — reset EVERY frame to the captured rest
  // position first (idempotent: removing the assist always means "exactly
  // rest," never a residual drift from a previous frame's value), then
  // optionally add the tuned offset. See `SideTuningOverrides.shoulderAssistLocal`'s
  // doc comment for why this must be a REAL bone translation, not just a
  // fake root fed into the solver's math.
  //
  // Translates `bones.shoulder` (the clavicle) — its own PARENT-relative
  // local position — but reads the result back from `bones.upperArm`, NOT
  // `bones.shoulder`. This is deliberate, not a mismatch: `metrics.shoulderLocalPos`
  // (the value `side.shoulderWorldPos` reproduces in the unassisted branch
  // below) is measured from `side.upperArm.getWorldPosition(...)` in
  // `measureArmRestMetrics` — this rig's actual two-bone IK pivot is the
  // UPPER ARM bone's position, not the separate (currently IK-unused)
  // clavicle bone. Since `upperArm` is a direct child of `shoulder` in the
  // real skeleton, translating `shoulder` rigidly carries `upperArm` (and
  // everything below it) along with it — reading `upperArm`'s resulting
  // world position is what correctly reproduces "the IK pivot, now
  // assisted" in the SAME quantity the reach/deficit math already uses
  // everywhere else. Reading `shoulder`'s own position back here would be
  // off by the fixed clavicle→upperArm bone-length offset. `bones.shoulder`
  // is optional in this rig (`resolveKaelArmBones` — many rigs fold
  // clavicle rotation into the upper-arm bone); an assist with no shoulder
  // bone to move is a documented no-op, not a crash.
  if (bones.shoulder && side.restShoulderLocalPos) {
    bones.shoulder.position.copy(side.restShoulderLocalPos);
    if (tuning?.shoulderAssistLocal) {
      scratch.assistWorld.copy(tuning.shoulderAssistLocal).applyQuaternion(containerWorldQuat);
      bones.shoulder.parent!.getWorldQuaternion(scratch.shoulderParentWorldQuat);
      scratch.assistWorld.applyQuaternion(scratch.shoulderParentWorldQuat.invert());
      bones.shoulder.position.add(scratch.assistWorld);
    }
    // Refresh immediately: this write happened AFTER the caller's own
    // per-frame `container.updateWorldMatrix(true, true)` (Step 6E
    // convention), so both `shoulder`'s and `upperArm`'s `matrixWorld` are
    // one step stale relative to the position just written above until
    // this call (force=true recurses into children, which includes
    // `upperArm`).
    bones.shoulder.updateMatrixWorld(true);
    bones.upperArm.getWorldPosition(side.shoulderWorldPos);
  } else {
    if (tuning?.shoulderAssistLocal && !bones.shoulder) {
      warnOnce('shoulder-assist-no-bone', 'shoulderAssistLocal set but this side has no resolved shoulder bone — assist ignored.');
    }
    side.shoulderWorldPos.copy(metrics.shoulderLocalPos).applyMatrix4(container.matrixWorld);
  }
  side.restUpperDirWorld.copy(metrics.restUpperDir).applyQuaternion(containerWorldQuat).normalize();
  side.restLowerDirWorld.copy(metrics.restLowerDir).applyQuaternion(containerWorldQuat).normalize();
  side.restUpperQuatWorld.copy(containerWorldQuat).multiply(metrics.restUpperQuat);
  side.restLowerQuatWorld.copy(containerWorldQuat).multiply(metrics.restLowerQuat);
  side.poleWorldDir.set(poleLocalDir[0], poleLocalDir[1], poleLocalDir[2]).applyQuaternion(containerWorldQuat);

  // maxReachRatio safety margin: pre-clamp the target distance before
  // handing it to the solver, so the arm never reads bone-straight even
  // for a target at the solver's own literal maximum (see
  // FirstPersonArmIkConfig's doc comment).
  const maxLen = (metrics.upperLength + metrics.lowerLength) * FIRST_PERSON_ARM_IK_CONFIG.maxReachRatio;
  clampTargetToMaxReach(side.shoulderWorldPos, targetWorldPos, maxLen, side.clampedTarget);

  // Step 6G live reach diagnostics — published unconditionally (same "cheap,
  // always publish" convention as every other debugOut field in this
  // function), computed from the SAME shoulderWorldPos/targetWorldPos/maxLen
  // values the solve itself just used, so these numbers can never disagree
  // with what actually happened this frame.
  debugOut.shoulderToTargetM = side.shoulderWorldPos.distanceTo(targetWorldPos);
  debugOut.upperLengthM = metrics.upperLength;
  debugOut.lowerLengthM = metrics.lowerLength;
  debugOut.totalChainLengthM = metrics.upperLength + metrics.lowerLength;
  debugOut.maxReachRatio = FIRST_PERSON_ARM_IK_CONFIG.maxReachRatio;
  debugOut.effectiveMaxReachM = maxLen;
  debugOut.reachDeficitM = debugOut.shoulderToTargetM - maxLen;
  debugOut.shoulderBoneName = bones.shoulder ? bones.shoulder.name : null;
  debugOut.upperArmBoneName = bones.upperArm.name;

  solveTwoBoneIk(
    {
      rootPosition: side.shoulderWorldPos,
      targetPosition: side.clampedTarget,
      pole: side.poleWorldDir,
      poleIsDirection: true,
      upperLength: metrics.upperLength,
      lowerLength: metrics.lowerLength,
      restUpperQuat: side.restUpperQuatWorld,
      restLowerQuat: side.restLowerQuatWorld,
      restUpperDir: side.restUpperDirWorld,
      restLowerDir: side.restLowerDirWorld,
      weight: weight * FIRST_PERSON_ARM_IK_CONFIG.positionWeight,
    },
    ikOutput,
    scratch,
  );

  // Non-finite guard (Step 16): the solver documents that it never produces
  // non-finite output FOR FINITE INPUTS — but shoulderWorldPos/poleWorldDir
  // are derived from the live camera transform every frame with no upstream
  // validation (unlike the grip target, which gripWorldPose.ts already
  // finite-checks before publish). If a NaN ever reaches this solve from
  // that side, catch it here, before it's written onto a live bone, rather
  // than letting it propagate into the rendered skeleton.
  if (
    !isFiniteQuaternion(ikOutput.upperQuat) ||
    !isFiniteQuaternion(ikOutput.lowerQuat) ||
    !isFiniteVector3(ikOutput.elbowPosition) ||
    !isFiniteVector3(ikOutput.handPosition)
  ) {
    warnOnce('non-finite-ik', 'IK solve produced a non-finite result — hiding arms this frame.');
    return false;
  }

  // Convert solved WORLD quaternions to LOCAL bone rotations. upperArm's
  // parent world quaternion is read live — CALLER must guarantee this is
  // fresh for the current frame (see this function's doc comment above).
  // lowerArm's parent world quaternion is `ikOutput.upperQuat` directly
  // (the value we are ABOUT to make true by setting upperArm's local
  // rotation this same line), which avoids needing an extra
  // updateMatrixWorld call between the two bones in the same chain.
  bones.upperArm.parent!.getWorldQuaternion(side.parentWorldQuat);
  bones.upperArm.quaternion.copy(side.parentWorldQuat).invert().multiply(ikOutput.upperQuat);
  bones.lowerArm.quaternion.copy(ikOutput.upperQuat).invert().multiply(ikOutput.lowerQuat);

  // Hand alignment (Step 9): target quaternion (weapon-authored basis) ->
  // this hand's ACTUAL basis via the measured correction, then to local
  // space using lowerArm's known world quaternion, then blended toward
  // the hand's own REST local rotation by rotationWeight — never a raw
  // copy of the weapon's quaternion (would misalign against Kael's own
  // bone-local axis convention, which this rig's own two hands don't even
  // share with each other — see kaelArmRig.ts).
  //
  // Step 6F: `tuning?.handBasisAdjustQuat`, when present, is POST-multiplied
  // onto the measured `handBasisCorrection` — i.e. it rotates the CANONICAL
  // grip-anchor axes (finger-forward/thumb-side/palm-normal) before they're
  // mapped into hand-bone-local space. Absent (the default, and every call
  // site before this step), `effectiveBasisCorrection` is byte-identical to
  // `metrics.handBasisCorrection` — zero behavior change when untuned.
  const effectiveBasisCorrection = tuning?.handBasisAdjustQuat
    ? scratch.effectiveBasisCorrection.copy(metrics.handBasisCorrection).multiply(tuning.handBasisAdjustQuat)
    : scratch.effectiveBasisCorrection.copy(metrics.handBasisCorrection);
  side.handWorldQuat.copy(targetWorldQuat).multiply(scratch.deltaQuat.copy(effectiveBasisCorrection).invert());
  const localHandQuat = scratch.deltaQuat.copy(ikOutput.lowerQuat).invert().multiply(side.handWorldQuat);

  const rotationWeight = weight * (tuning?.rotationWeight ?? FIRST_PERSON_ARM_IK_CONFIG.rotationWeight);
  // Same non-finite guard as above, applied to the hand's own derivation
  // (guards a bad `targetWorldQuat` independently of the arm-chain check —
  // gripWorldPose.ts already finite-validates before publish, so this is
  // defense-in-depth, not the primary line of defense). The arm chain
  // above is already known-finite and stays applied; only the hand keeps
  // its previous rotation for this one frame if this specific value is bad.
  if (!isFiniteQuaternion(localHandQuat)) {
    warnOnce('non-finite-hand', 'Hand IK alignment produced a non-finite result — leaving hand rotation unchanged this frame.');
  } else {
    bones.hand.quaternion.copy(side.restHandLocalQuat).slerp(localHandQuat, rotationWeight);
  }

  applyFingerPose(bones, side.restFingerLocalQuats, fingerPose, weight * (tuning?.fingerCurlScale ?? 1));

  // Debug-visualization publish (Step 13) — cheap Vector3 copies, always
  // runs (see kaelArmDebugState.ts's doc comment for why gating this on
  // the write side isn't needed).
  debugOut.shoulderWorldPos.copy(side.shoulderWorldPos);
  debugOut.elbowWorldPos.copy(ikOutput.elbowPosition);
  debugOut.handWorldPos.copy(ikOutput.handPosition);
  debugOut.targetWorldPos.copy(targetWorldPos);
  debugOut.poleWorldDir.copy(side.poleWorldDir);

  // Step 6F calibration readouts — computed AFTER `bones.hand`'s local
  // quaternion has actually been written above (`getWorldQuaternion` reads
  // it fresh via its own self-correcting `updateWorldMatrix` call, per this
  // function's own doc comment on that property), never from an
  // intermediate pre-write value. `positionErrorM` compares against the
  // RAW (pre-reach-clamp) target deliberately — a nonzero value here can
  // mean either a genuine solve problem OR expected reach-clamping
  // (`reachClamped` disambiguates which).
  bones.hand.getWorldQuaternion(scratch.actualHandWorldQuat);
  debugOut.handWorldQuat.copy(scratch.actualHandWorldQuat);
  // World-space canonical grip-basis axes, derived from the ACTUAL solved
  // hand orientation, composed with the FIXED, measured `metrics.handBasisCorrection`
  // — deliberately NOT `effectiveBasisCorrection` (which includes the
  // tunable adjustment). Using the tuned value here would be circular and
  // useless as a diagnostic: since `side.handWorldQuat` was ITSELF solved
  // as `targetWorldQuat * effectiveBasisCorrection^-1`, re-applying the
  // SAME `effectiveBasisCorrection` here would algebraically cancel it out
  // and ALWAYS reproduce `targetWorldQuat` exactly, regardless of the
  // tuning value — showing perfect alignment no matter what, which is
  // exactly the "hides a broken calibration" bug this must NOT have. Using
  // the fixed measured correction instead shows where the mesh's REAL,
  // rigid, geometry-bound axes actually point given the bone's actual
  // (tuning-affected) orientation — the only version that visibly moves
  // when `handBasisAdjustQuat` is tuned, which is the entire point of
  // showing it. Verified by a dedicated test in `kaelArmSolve.test.ts`.
  AXIS_SCRATCH.set(1, 0, 0).applyQuaternion(metrics.handBasisCorrection).applyQuaternion(scratch.actualHandWorldQuat);
  debugOut.palmForwardWorldDir.copy(AXIS_SCRATCH);
  AXIS_SCRATCH.set(0, 1, 0).applyQuaternion(metrics.handBasisCorrection).applyQuaternion(scratch.actualHandWorldQuat);
  debugOut.thumbSideWorldDir.copy(AXIS_SCRATCH);
  AXIS_SCRATCH.set(0, 0, 1).applyQuaternion(metrics.handBasisCorrection).applyQuaternion(scratch.actualHandWorldQuat);
  debugOut.palmNormalWorldDir.copy(AXIS_SCRATCH);
  debugOut.positionErrorM = ikOutput.handPosition.distanceTo(targetWorldPos);
  debugOut.rotationErrorRad = scratch.actualHandWorldQuat.angleTo(side.handWorldQuat);
  debugOut.ikWeight = weight;
  debugOut.reachClamped = side.clampedTarget.distanceTo(targetWorldPos) > 1e-4;

  return true;
}
