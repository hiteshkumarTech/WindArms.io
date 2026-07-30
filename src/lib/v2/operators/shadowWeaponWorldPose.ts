import * as THREE from 'three';

/**
 * World-space bridge for the SHADOW weapon's own body-anchored presentation
 * transform (Milestone 8, Step 8E-C.2) — same plain-mutable-singleton family
 * as `muzzleWorldPose.ts`/`gripWorldPose.ts`/`actionPoseState.ts`, written
 * every frame by `KaelFirstPersonShadowBody.tsx` (which already computes the
 * chest bone's live world transform to solve arms against — this is the
 * SAME computation's weapon-anchor output, not a second one), read by
 * `KaelFirstPersonShadowWeapon.tsx`.
 *
 * DELIBERATELY SEPARATE from `gripWorldPose.ts`: that bridge carries the
 * VISIBLE, camera-relative weapon transform `VortexViewmodel.tsx` publishes.
 * This one carries the SHADOW's own body-anchored transform — a different
 * value computed for a different (world-space, reachability-first) purpose.
 * Conflating the two would silently reintroduce the exact "shadow arms
 * solving toward an unreachable camera-relative target" problem Step 8E-C.2
 * exists to fix.
 *
 * Simple `ready` flag lifecycle (reset on mount and unmount), same reasoning
 * `actionPoseState.ts` gives for not needing `gripWorldPose.ts`'s generation
 * counter: there is only ever one shadow-body instance publishing at a time,
 * never two competing writers to reconcile.
 */
export interface ShadowWeaponWorldPoseSnapshot {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly ready: boolean;
}

const snapshot: { position: THREE.Vector3; quaternion: THREE.Quaternion; ready: boolean } = {
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  ready: false,
};

function isFiniteVector3(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
function isFiniteQuaternion(q: THREE.Quaternion): boolean {
  return Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);
}

/** Writes both fields atomically — returns `false` (writes nothing) on any non-finite input, same "never a partially-valid ready state" contract as `gripWorldPose.ts`'s `publishGripWorldPose`. */
export function publishShadowWeaponWorldPose(position: THREE.Vector3, quaternion: THREE.Quaternion): boolean {
  if (!isFiniteVector3(position) || !isFiniteQuaternion(quaternion)) return false;
  snapshot.position.copy(position);
  snapshot.quaternion.copy(quaternion);
  snapshot.ready = true;
  return true;
}

/** Call on unmount, and whenever the shadow body's own pose/arm system is not ready this frame (mirrors `KaelFirstPersonShadowBody.tsx`'s own `armsReady` gate) so the weapon clone hides in lockstep rather than freezing at a stale transform. */
export function invalidateShadowWeaponWorldPose(): void {
  snapshot.ready = false;
}

/** Stable reference to the live snapshot — read fields directly, same zero-copy convention as every other bridge in this family. Never mutate the returned object. */
export function getShadowWeaponWorldPose(): ShadowWeaponWorldPoseSnapshot {
  return snapshot;
}
