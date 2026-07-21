import * as THREE from 'three';
import type { RuntimeGripAnchor, Vec3Tuple } from './vortexRuntimeAnchors';

/**
 * Pure, React-free transform math for weapon-owned runtime anchors
 * (Milestone 7, Phase F, Step 5). Extracted out of `VortexViewmodel.tsx`
 * on purpose — the muzzle anchor's local-to-world conversion was already
 * inlined there (`scratchAnchor.multiplyScalar(poseScale)` +
 * `group.localToWorld(...)`), and duplicating that pattern by hand for two
 * more anchors (right/left grip) would be exactly the kind of "duplicated
 * transform logic" this step's own review checklist calls out. This module
 * is the single place that logic lives now; `VortexViewmodel.tsx` calls it
 * for the muzzle too where practical, but the muzzle's existing direct
 * `group.localToWorld`/`applyQuaternion` calls are left alone — a proven,
 * already-shipped path, not touched without a proven reason (see this
 * step's explicit instruction not to rewrite the muzzle bridge recklessly).
 *
 * Every function here either takes explicit OUTPUT parameters (mutated in
 * place, zero allocation) or falls back to allocating a fresh THREE object
 * ONLY when no output is supplied — safe and convenient for tests/one-off
 * calls, never exercised by the real per-frame hot path, which always
 * passes its own preallocated scratch (see `VortexViewmodel.tsx`'s
 * `sim.current.grip*` fields).
 */

export interface RuntimeAnchorTransformInput {
  readonly localPosition: Vec3Tuple;
  readonly localRotationEuler: Vec3Tuple;
  readonly rotationOrder: THREE.EulerOrder;
}

function isFiniteVec3(v: Vec3Tuple): boolean {
  return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

/**
 * Composes a LOCAL (weapon-space) transform matrix from an anchor's
 * position + rotation. Position is expected ALREADY SCALED by the caller
 * (same convention `VortexViewmodel.tsx` already uses for `muzzleLocal`:
 * multiply by the model's runtime pose scale BEFORE any local-to-world
 * conversion — scale is never baked into this matrix itself, since
 * rotation is scale-invariant and re-deriving scale here would just be a
 * second place it could drift from the caller's own pose scale).
 *
 * Non-finite input produces an IDENTITY matrix (never NaN/Infinity output,
 * never throws) — the "safely handle invalid matrices" requirement.
 */
export function composeRuntimeAnchorMatrix(
  scaledLocalPosition: Vec3Tuple,
  localRotationEuler: Vec3Tuple,
  rotationOrder: THREE.EulerOrder,
  outMatrix?: THREE.Matrix4,
  scratchQuat?: THREE.Quaternion,
  scratchEuler?: THREE.Euler,
  scratchPos?: THREE.Vector3,
): THREE.Matrix4 {
  const matrix = outMatrix ?? new THREE.Matrix4();
  if (!isFiniteVec3(scaledLocalPosition) || !isFiniteVec3(localRotationEuler)) {
    matrix.identity();
    return matrix;
  }
  const quat = scratchQuat ?? new THREE.Quaternion();
  const euler = scratchEuler ?? new THREE.Euler();
  const pos = scratchPos ?? new THREE.Vector3();
  euler.set(localRotationEuler[0], localRotationEuler[1], localRotationEuler[2], rotationOrder);
  quat.setFromEuler(euler);
  pos.set(scaledLocalPosition[0], scaledLocalPosition[1], scaledLocalPosition[2]);
  matrix.compose(pos, quat, ONE_VECTOR);
  return matrix;
}

/** Shared read-only unit-scale vector — `Matrix4.compose` only reads it, never mutates, so one frozen instance is safe to reuse across every call/module. */
const ONE_VECTOR = new THREE.Vector3(1, 1, 1);

export interface ResolveAnchorWorldPoseOutput {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}

/**
 * Resolves ONE runtime grip anchor to world space, given the weapon
 * group's already-current-this-frame world position/quaternion (caller
 * must have called `group.updateWorldMatrix(true, false)` first — same
 * one-frame-lag pitfall `muzzleWorldPose.ts` already documents) and the
 * model's runtime pose scale (e.g. `VORTEX_VIEWMODEL_POSES.hip.scale`,
 * lerped with ADS same as the muzzle math).
 *
 * Writes into `output.position`/`output.quaternion` in place — zero
 * allocation when `scratch*` are supplied by the caller. Non-finite groupPos/
 * groupQuat/modelScale/anchor values leave `output` UNCHANGED and return
 * `false` (caller decides what "invalid" means for its own ready flag —
 * this function never partially overwrites one of position/quaternion
 * while leaving the other stale, matching the "publish atomically" / "no
 * partially-ready state" requirement one level up in `gripWorldPose.ts`).
 */
export function resolveRuntimeAnchorWorldPose(
  anchor: RuntimeGripAnchor,
  modelScale: number,
  groupWorldPosition: THREE.Vector3,
  groupWorldQuaternion: THREE.Quaternion,
  output: ResolveAnchorWorldPoseOutput,
  scratch?: {
    matrix?: THREE.Matrix4;
    quat?: THREE.Quaternion;
    euler?: THREE.Euler;
    pos?: THREE.Vector3;
    localQuat?: THREE.Quaternion;
  },
): boolean {
  if (!Number.isFinite(modelScale) || modelScale <= 0) return false;
  if (!isFiniteVec3(anchor.position) || !isFiniteVec3(anchor.rotationEuler)) return false;
  if (!Number.isFinite(groupWorldPosition.x) || !Number.isFinite(groupWorldPosition.y) || !Number.isFinite(groupWorldPosition.z)) return false;
  if (!Number.isFinite(groupWorldQuaternion.x) || !Number.isFinite(groupWorldQuaternion.y) || !Number.isFinite(groupWorldQuaternion.z) || !Number.isFinite(groupWorldQuaternion.w)) {
    return false;
  }

  const scaledPos = scratch?.pos ?? new THREE.Vector3();
  scaledPos.set(anchor.position[0] * modelScale, anchor.position[1] * modelScale, anchor.position[2] * modelScale);

  // World position = groupWorldPosition + (scaled local offset rotated into
  // the group's world orientation) — the exact math `Object3D.localToWorld`
  // performs for a point, done here without needing a live Object3D/group
  // (this function only needs the group's already-resolved world position/
  // quaternion, not the group itself — keeps it testable without a scene).
  scaledPos.applyQuaternion(groupWorldQuaternion);
  output.position.copy(groupWorldPosition).add(scaledPos);

  const localEuler = scratch?.euler ?? new THREE.Euler();
  localEuler.set(anchor.rotationEuler[0], anchor.rotationEuler[1], anchor.rotationEuler[2], anchor.rotationOrder);
  const localQuat = scratch?.localQuat ?? new THREE.Quaternion();
  localQuat.setFromEuler(localEuler);

  // World rotation = groupWorldQuaternion * localAnchorQuaternion — parent
  // orientation applied after local, standard scene-graph child-in-parent-
  // space composition (matches three.js's own Object3D world-matrix
  // composition order). NOT commutative — order matters.
  output.quaternion.copy(groupWorldQuaternion).multiply(localQuat);

  if (!Number.isFinite(output.position.x) || !Number.isFinite(output.position.y) || !Number.isFinite(output.position.z)) return false;
  if (!Number.isFinite(output.quaternion.x) || !Number.isFinite(output.quaternion.y) || !Number.isFinite(output.quaternion.z) || !Number.isFinite(output.quaternion.w)) {
    return false;
  }
  return true;
}
