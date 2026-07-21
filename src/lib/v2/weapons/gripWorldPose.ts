import * as THREE from 'three';

/**
 * World-space GRIP pose bridge — same singleton-bridge family as
 * `src/lib/v2/range/muzzleWorldPose.ts` (plain mutable object, written
 * every frame by `VortexViewmodel.tsx`, read anywhere without a
 * subscription or a scene-graph ref), deliberately kept SEPARATE from it
 * (Milestone 7, Phase F, Step 5, Option A) rather than generalized into one
 * shared service — the muzzle bridge is already proven and shipping;
 * merging it with a new, richer-lifecycle service before that lifecycle is
 * itself proven would risk destabilizing something that works.
 *
 * This service is INTENTIONALLY richer than `muzzleWorldPose.ts`'s plain
 * `{position, direction, ready}` shape, because it has a real problem the
 * muzzle bridge doesn't: TWO targets that must never disagree on which
 * mounted `VortexViewmodel` instance produced them (`ready: true` with the
 * right hand from a fresh mount and the left hand from a stale, about-to-
 * unmount one would hand a future IK consumer physically incoherent
 * targets). A plain mutable object can't enforce that on its own — any
 * caller could set `.ready = true` directly — so this file wraps the
 * mutable state behind a small function API instead of exposing the fields
 * for direct writes. Reads remain zero-cost, direct field access via
 * `getGripWorldPose()`'s returned reference (same "stable reference, no
 * copy" convention `muzzleWorldPose` already uses).
 *
 * GENERATION ALGORITHM — this is the core safety mechanism, read this
 * before changing anything below:
 *
 *   1. `beginGripGeneration(modelId?)` — called once when a `VortexViewmodel`
 *      instance mounts (and again any time ITS OWN model identity changes,
 *      e.g. real GLB resolves after a frame on the procedural fallback).
 *      Increments the module-level `currentGeneration` counter and returns
 *      the NEW value. The calling instance stores that number in ITS OWN
 *      per-instance scratch (never in this module) and must pass it back
 *      on every `publishGripWorldPose`/`invalidateGripWorldPose` call.
 *      Also flips `ready` false immediately — a new generation starts
 *      not-ready even before its first frame runs.
 *   2. `publishGripWorldPose(generation, ...)` — writes BOTH hands' world
 *      position/quaternion in one call (there is no way to publish only one
 *      hand — see "atomic" below) IF AND ONLY IF `generation` still equals
 *      `currentGeneration`. A call carrying an OLDER generation number
 *      (e.g. a React Strict Mode double-invoked effect's straggler frame,
 *      or a just-unmounted instance's in-flight `useFrame` callback firing
 *      once more before React tears it down) is silently rejected — the
 *      snapshot is left exactly as it was. This is what "old generations
 *      cannot publish" means concretely: rejection is by comparison against
 *      the SINGLE authoritative counter, not by any timing/ordering
 *      assumption.
 *   3. `invalidateGripWorldPose(generation?)` — called on unmount. If a
 *      generation number is passed AND it no longer matches
 *      `currentGeneration` (a NEWER instance already mounted and bumped the
 *      counter before this old instance's cleanup ran — genuinely possible
 *      under fast remounts), the call is a no-op: an old instance's
 *      teardown must never clear a newer instance's already-valid `ready`
 *      state. Passing no generation always invalidates unconditionally
 *      (reserved for a hard "something is definitely wrong" reset path).
 *
 * ATOMIC PUBLICATION: `publishGripWorldPose` takes right AND left
 * position/quaternion together and validates ALL FOUR as finite before
 * writing ANY of them — a call with even one non-finite component writes
 * nothing and returns `false`, so a consumer reading `ready: true` can
 * never observe a mix of this frame's right hand and a stale left hand
 * (or vice versa). There is no partial-publish code path.
 */

export interface GripWorldPoseSnapshot {
  readonly rightPosition: THREE.Vector3;
  readonly rightQuaternion: THREE.Quaternion;
  readonly leftPosition: THREE.Vector3;
  readonly leftQuaternion: THREE.Quaternion;
  /**
   * The weapon group's own raw world position/quaternion for this same
   * published frame — NOT combined with either hand's local anchor
   * rotation. Exists so a dev-only consumer (the grip authoring tool, see
   * `VortexGripAnchorDebug.tsx`) can resolve a CANDIDATE local anchor
   * (values the human is actively editing, not yet in
   * `vortexRuntimeAnchors.ts`) into world space using the exact same
   * live weapon transform this frame's real hands used — without needing a
   * scene-graph ref into `VortexViewmodel`'s internal group. This is the
   * "source/model identity when useful" data the grip-anchor system's
   * world-pose output was specified to carry.
   */
  readonly weaponWorldPosition: THREE.Vector3;
  readonly weaponWorldQuaternion: THREE.Quaternion;
  /** True only once THIS generation has published at least one valid atomic frame. */
  readonly ready: boolean;
  readonly generation: number;
  readonly modelId?: string;
}

const snapshot: {
  rightPosition: THREE.Vector3;
  rightQuaternion: THREE.Quaternion;
  leftPosition: THREE.Vector3;
  leftQuaternion: THREE.Quaternion;
  weaponWorldPosition: THREE.Vector3;
  weaponWorldQuaternion: THREE.Quaternion;
  ready: boolean;
  generation: number;
  modelId: string | undefined;
} = {
  rightPosition: new THREE.Vector3(),
  rightQuaternion: new THREE.Quaternion(),
  leftPosition: new THREE.Vector3(),
  leftQuaternion: new THREE.Quaternion(),
  weaponWorldPosition: new THREE.Vector3(),
  weaponWorldQuaternion: new THREE.Quaternion(),
  ready: false,
  generation: 0,
  modelId: undefined,
};

let currentGeneration = 0;

/** Call once per mount (and per real model-identity change). Returns the new generation the caller must hold onto and pass back to every publish/invalidate call it makes. */
export function beginGripGeneration(modelId?: string): number {
  currentGeneration += 1;
  snapshot.generation = currentGeneration;
  snapshot.modelId = modelId;
  snapshot.ready = false;
  return currentGeneration;
}

function isFiniteVector3(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
function isFiniteQuaternion(q: THREE.Quaternion): boolean {
  return Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);
}

/**
 * Publish both hands' world pose atomically. Returns `false` (and writes
 * nothing) if `generation` is stale or any input is non-finite — callers
 * that want to know WHY a publish was rejected should check
 * `generation === getGripWorldPose().generation` themselves; this function
 * deliberately doesn't log (would spam every frame a stale publisher is
 * somehow still running, e.g. mid-HMR).
 */
export function publishGripWorldPose(
  generation: number,
  rightPosition: THREE.Vector3,
  rightQuaternion: THREE.Quaternion,
  leftPosition: THREE.Vector3,
  leftQuaternion: THREE.Quaternion,
  weaponWorldPosition: THREE.Vector3,
  weaponWorldQuaternion: THREE.Quaternion,
): boolean {
  if (generation !== currentGeneration) return false;
  if (!isFiniteVector3(rightPosition) || !isFiniteQuaternion(rightQuaternion)) return false;
  if (!isFiniteVector3(leftPosition) || !isFiniteQuaternion(leftQuaternion)) return false;
  if (!isFiniteVector3(weaponWorldPosition) || !isFiniteQuaternion(weaponWorldQuaternion)) return false;

  snapshot.rightPosition.copy(rightPosition);
  snapshot.rightQuaternion.copy(rightQuaternion);
  snapshot.leftPosition.copy(leftPosition);
  snapshot.leftQuaternion.copy(leftQuaternion);
  snapshot.weaponWorldPosition.copy(weaponWorldPosition);
  snapshot.weaponWorldQuaternion.copy(weaponWorldQuaternion);
  snapshot.ready = true;
  return true;
}

/**
 * Call on unmount (and whenever a mounted instance's model becomes
 * unresolved/invalid, e.g. falls back to the procedural placeholder).
 * Pass the generation the caller was given by `beginGripGeneration` — an
 * unmount racing behind a newer mount becomes a safe no-op instead of
 * clobbering the newer instance's valid state. Omit the argument only for
 * an unconditional hard reset.
 */
export function invalidateGripWorldPose(generation?: number): void {
  if (generation !== undefined && generation !== currentGeneration) return;
  snapshot.ready = false;
}

/** Stable reference to the live snapshot — read fields directly (`getGripWorldPose().rightPosition`), same zero-copy convention as `muzzleWorldPose`. Never mutate the returned object; use the publish/invalidate functions above. */
export function getGripWorldPose(): GripWorldPoseSnapshot {
  return snapshot;
}
