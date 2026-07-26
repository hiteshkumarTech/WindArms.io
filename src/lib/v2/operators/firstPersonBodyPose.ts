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
 */

export interface FirstPersonBodyWorldPoseSnapshot {
  readonly worldPosition: THREE.Vector3;
  readonly worldYaw: number;
  readonly grounded: boolean;
  /** Increments on every teleport-class event (respawn, recovery-volume/kill-Y reset) — a future smoothing pass reads this to snap instead of interpolate. Unused by this pass's static integration, which never smooths position at all. */
  readonly respawnNonce: number;
  /** True once THIS generation has published at least one valid frame. */
  readonly ready: boolean;
  readonly generation: number;
}

const snapshot: {
  worldPosition: THREE.Vector3;
  worldYaw: number;
  grounded: boolean;
  respawnNonce: number;
  ready: boolean;
  generation: number;
} = {
  worldPosition: new THREE.Vector3(),
  worldYaw: 0,
  grounded: true,
  respawnNonce: 0,
  ready: false,
  generation: 0,
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

/**
 * Publish this frame's world position/yaw. Returns `false` (writes nothing)
 * if `generation` is stale or any input is non-finite. `position` is
 * copied, not retained — the caller's own preallocated Vector3 stays theirs.
 */
export function publishBodyWorldPose(generation: number, position: THREE.Vector3, yaw: number, grounded: boolean, respawnNonce: number): boolean {
  if (generation !== currentGeneration) return false;
  if (!isFiniteVector3(position) || !Number.isFinite(yaw)) return false;

  snapshot.worldPosition.copy(position);
  snapshot.worldYaw = yaw;
  snapshot.grounded = grounded;
  snapshot.respawnNonce = respawnNonce;
  snapshot.ready = true;
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
