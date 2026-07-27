import * as THREE from 'three';

/**
 * World-space PLAYER-BODY pose bridge (Milestone 8, Step 8C) — same
 * singleton-bridge family as `src/lib/v2/weapons/gripWorldPose.ts` (plain
 * mutable snapshot, written every frame by whichever controller currently
 * owns movement, read anywhere without a subscription), and the SAME
 * generation-counter safety mechanism that file documents in full — read
 * that file's module doc first if this is unfamiliar. Summary: exactly one
 * writer is ever "current" at a time; a call carrying a stale generation
 * number (an old instance's straggler frame under fast remounts, e.g. React
 * Strict Mode or a route change) is silently rejected rather than
 * clobbering whatever a newer writer already published.
 *
 * WHY A NEW BRIDGE, NOT AN ADDITION TO `rangeLocalPose`: `rangeLocalPose`
 * already publishes yaw/pitch/speed/grounded/state and is read by the
 * weapon/viewmodel systems — this bridge exists for a DIFFERENT consumer
 * (the lower-body derivative) that needs WORLD POSITION, which nothing
 * currently publishes, plus a respawn/teleport signal so a future
 * smoothing pass (Step 8D) can distinguish "snap" from "interpolate."
 * Growing `rangeLocalPose` to also carry position would couple two
 * unrelated consumers to one shape; a dedicated bridge keeps the blast
 * radius of a future change to either one contained — same reasoning
 * `gripWorldPose.ts`'s own doc comment gives for staying separate from
 * `muzzleWorldPose.ts`.
 *
 * OWNERSHIP: PlayerController.tsx (/v2/play) and RangeController.tsx
 * (/v2/range) each publish their OWN already-computed kinematic-body
 * translation and look-yaw — this bridge never re-derives position from
 * camera.position (which would silently inherit any future camera-only
 * bob/sway/positional-recoil offset the controllers might add on top of
 * the body's actual world translation) and never carries pitch at all
 * (the lower body must never rotate with view pitch — see
 * `KaelFirstPersonLowerBody.tsx`).
 *
 * STEP 8D ADDITION — movement signals: `horizontalSpeed`/`verticalVelocity`/
 * `movementState`/`windLiftActive` are the SAME values each controller
 * already computes for `rangeLocalPose`/its own Wind Lift check — this
 * bridge only forwards them, never recomputes movement (see
 * `lowerBodyLocomotionPose.ts`'s doc comment, which is the sole consumer).
 * `updateTick` increments on every successful publish and exists so a
 * consumer that needs real elapsed time between AUTHORITATIVE updates
 * (the locomotion pose's per-frame `deltaSeconds`) can detect "the
 * publisher didn't run this browser frame" — e.g. `match.phase ===
 * 'paused'` in PlayerController returns before ever calling
 * `publishBodyWorldPose`, so `updateTick` simply stops incrementing; the
 * consumer sees an unchanged tick and treats elapsed time as 0, which is
 * exactly "pause freezes the last valid pose" for locomotion too, without
 * either controller needing to know or publish an explicit "paused"
 * concept (`/v2/range` has no such concept at all).
 */

export type FirstPersonBodyMovementState = 'idle' | 'walk' | 'sprint' | 'air';

export interface FirstPersonBodyMovementSignals {
  readonly horizontalSpeed: number;
  readonly verticalVelocity: number;
  readonly movementState: FirstPersonBodyMovementState;
  readonly windLiftActive: boolean;
}

export interface FirstPersonBodyWorldPoseSnapshot {
  readonly worldPosition: THREE.Vector3;
  readonly worldYaw: number;
  readonly grounded: boolean;
  /** Increments on every teleport-class event (respawn, recovery-volume/kill-Y reset) — a future smoothing pass reads this to snap instead of interpolate. Also used by `lowerBodyLocomotionPose.ts` to reset its own runtime state so a teleport never reads as a footstep or a landing. */
  readonly respawnNonce: number;
  readonly horizontalSpeed: number;
  readonly verticalVelocity: number;
  readonly movementState: FirstPersonBodyMovementState;
  readonly windLiftActive: boolean;
  /** True once THIS generation has published at least one valid frame. */
  readonly ready: boolean;
  readonly generation: number;
  /** Increments on every successful publish — see this file's Step 8D doc comment above for why this exists (pause/stall detection without either controller needing its own "paused" concept). */
  readonly updateTick: number;
}

const snapshot: {
  worldPosition: THREE.Vector3;
  worldYaw: number;
  grounded: boolean;
  respawnNonce: number;
  horizontalSpeed: number;
  verticalVelocity: number;
  movementState: FirstPersonBodyMovementState;
  windLiftActive: boolean;
  ready: boolean;
  generation: number;
  updateTick: number;
} = {
  worldPosition: new THREE.Vector3(),
  worldYaw: 0,
  grounded: true,
  respawnNonce: 0,
  horizontalSpeed: 0,
  verticalVelocity: 0,
  movementState: 'idle',
  windLiftActive: false,
  ready: false,
  generation: 0,
  updateTick: 0,
};

let currentGeneration = 0;

/** Call once per mount. Returns the new generation the caller must hold onto and pass back to every publish/invalidate call it makes. */
export function beginBodyPoseGeneration(): number {
  currentGeneration += 1;
  snapshot.generation = currentGeneration;
  snapshot.ready = false;
  return currentGeneration;
}

function isFiniteVector3(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** `windLiftActive` defaults to `false` and `movementState` is required — callers with no Wind Lift concept (`/v2/range`) simply never pass `windLiftActive: true`, matching the pre-Step-8D behavior of never having the concept at all. */
const DEFAULT_MOVEMENT_SIGNALS: FirstPersonBodyMovementSignals = { horizontalSpeed: 0, verticalVelocity: 0, movementState: 'idle', windLiftActive: false };

/**
 * Publish this frame's world position/yaw/movement signals. Returns `false`
 * (writes nothing) if `generation` is stale or any input is non-finite.
 * `position` is copied, not retained — the caller's own preallocated
 * Vector3 stays theirs. `movement` is optional (defaults to
 * `DEFAULT_MOVEMENT_SIGNALS`) so existing pre-Step-8D call sites/tests
 * continue to compile — a real controller always passes its own live
 * signals.
 */
export function publishBodyWorldPose(
  generation: number,
  position: THREE.Vector3,
  yaw: number,
  grounded: boolean,
  respawnNonce: number,
  movement: FirstPersonBodyMovementSignals = DEFAULT_MOVEMENT_SIGNALS,
): boolean {
  if (generation !== currentGeneration) return false;
  if (!isFiniteVector3(position) || !Number.isFinite(yaw)) return false;
  if (!Number.isFinite(movement.horizontalSpeed) || !Number.isFinite(movement.verticalVelocity)) return false;

  snapshot.worldPosition.copy(position);
  snapshot.worldYaw = yaw;
  snapshot.grounded = grounded;
  snapshot.respawnNonce = respawnNonce;
  snapshot.horizontalSpeed = movement.horizontalSpeed;
  snapshot.verticalVelocity = movement.verticalVelocity;
  snapshot.movementState = movement.movementState;
  snapshot.windLiftActive = movement.windLiftActive;
  snapshot.ready = true;
  snapshot.updateTick += 1;
  return true;
}

/**
 * Call on unmount. Pass the generation the caller was given by
 * `beginBodyPoseGeneration` — an unmount racing behind a newer mount
 * becomes a safe no-op instead of clobbering the newer instance's valid
 * state. Omit the argument only for an unconditional hard reset.
 */
export function invalidateBodyWorldPose(generation?: number): void {
  if (generation !== undefined && generation !== currentGeneration) return;
  snapshot.ready = false;
}

/** Stable reference to the live snapshot — read fields directly, never mutate. Same zero-copy convention as `getGripWorldPose()`. */
export function getFirstPersonBodyWorldPose(): FirstPersonBodyWorldPoseSnapshot {
  return snapshot;
}
