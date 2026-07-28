import type { LowerBodyLocomotionPose } from './lowerBodyLocomotionPose';

/**
 * Shared lower-body locomotion pose bridge (Milestone 8, Step 8E-B) — same
 * singleton-bridge family as `firstPersonBodyPose.ts`/`gripWorldPose.ts`
 * (plain mutable snapshot, generation-counter-guarded against stale
 * straggler publishes from an unmounting instance), but for a narrower
 * purpose: making the VISIBLE lower body's already-computed
 * `LowerBodyLocomotionPose` available to a SECOND consumer (the dev-only
 * shadow-body prototype) without that second consumer ever calling
 * `computeLowerBodyLocomotionPose` itself.
 *
 * WHY THIS EXISTS: the whole point of Step 8E-B's "one shared locomotion
 * result" requirement is that the shadow body's legs must never be able to
 * drift out of sync with the visible body's — a different stride phase, a
 * landing envelope that fires at a different instant, a Wind Lift blend
 * that lags behind. The only way to make that drift STRUCTURALLY
 * impossible (not just "unlikely if both call sites happen to stay in
 * sync") is for there to be exactly one call to
 * `computeLowerBodyLocomotionPose` per frame, with its result handed to
 * every consumer. `KaelFirstPersonLowerBody.tsx` (the visible body, always
 * mounted in both routes) is the SOLE writer; `KaelFirstPersonShadowBody.tsx`
 * (dev-only, `/v2/range?shadow=1` only) is a read-only consumer that never
 * advances its own runtime state and never touches this module's write
 * functions.
 *
 * ZERO-COPY BY DESIGN: `publishLowerBodyLocomotionPose` stores the exact
 * object reference the visible body already owns and mutates in place every
 * frame (`locomotionPoseRef.current`, per `lowerBodyLocomotionPose.ts`'s own
 * "output object reuse supported" contract) — never a clone. A reader that
 * captures this reference and reads it again on a LATER frame (or a frame
 * where the writer hasn't run yet, e.g. an R3F sibling-ordering edge case)
 * simply sees whatever the writer's most recent mutation left there — at
 * most one frame stale, never a different runtime's data, since there is
 * only ever one runtime that mutates this object at all.
 */

export interface LowerBodyLocomotionPoseBridgeSnapshot {
  readonly pose: LowerBodyLocomotionPose | null;
  /** True once THIS generation has published at least one valid frame. */
  readonly ready: boolean;
  readonly generation: number;
}

const snapshot: { pose: LowerBodyLocomotionPose | null; ready: boolean; generation: number } = {
  pose: null,
  ready: false,
  generation: 0,
};

let currentGeneration = 0;

/** Call once per mount (the visible lower body only — the shadow body never calls this). Returns the new generation the caller must hold onto and pass back to `publishLowerBodyLocomotionPose`/`invalidateLowerBodyLocomotionPose`. */
export function beginLowerBodyLocomotionPoseGeneration(): number {
  currentGeneration += 1;
  snapshot.generation = currentGeneration;
  snapshot.ready = false;
  snapshot.pose = null;
  return currentGeneration;
}

/** Publish this frame's already-computed pose. Returns `false` (writes nothing) if `generation` is stale — a straggler frame from an instance that already started unmounting (route change, Fast Refresh) can never clobber a newer instance's valid state. */
export function publishLowerBodyLocomotionPose(generation: number, pose: LowerBodyLocomotionPose): boolean {
  if (generation !== currentGeneration) return false;
  snapshot.pose = pose;
  snapshot.ready = true;
  return true;
}

/** Call on unmount. Pass the generation the caller was given by `beginLowerBodyLocomotionPoseGeneration` — an unmount racing behind a newer mount becomes a safe no-op. Omit the argument only for an unconditional hard reset. */
export function invalidateLowerBodyLocomotionPose(generation?: number): void {
  if (generation !== undefined && generation !== currentGeneration) return;
  snapshot.ready = false;
}

/** Stable reference to the live snapshot — read fields directly, never mutate. Same zero-copy convention as `getFirstPersonBodyWorldPose()`/`getGripWorldPose()`. Consumers must check `.ready` before reading `.pose` (which is `null` until the first publish). */
export function getSharedLowerBodyLocomotionPose(): LowerBodyLocomotionPoseBridgeSnapshot {
  return snapshot;
}
