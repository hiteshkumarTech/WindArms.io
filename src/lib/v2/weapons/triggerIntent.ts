/**
 * Pure trigger-gating decision for the Vortex Rifle's fire system
 * (Milestone 7, Phase G, Step 7E). Extracted out of `VortexFireSystem.tsx`'s
 * `useFrame` block so the exact bug this module fixes is deterministically
 * testable without a mounted React/Three.js scene — same convention as
 * `vortexWeaponState.ts`'s `resolveWeaponState` and `actionPose.ts`'s
 * `computeActionPose`.
 *
 * THE BUG THIS FIXES: the original inline gating had four possible exits
 * once `wantsFire` was true — "too soon since the last shot" (RPM gate),
 * "blocked by an active reload," "dry-fire triggers a reload," and "fire
 * normally" — and only the LAST TWO ever reset `triggerQueued`. A single
 * click released WHILE a reload was in progress left `triggerQueued` stuck
 * `true`; the instant the reload completed, the very same stale queued
 * flag satisfied `wantsFire` again and fired one shot with no new input.
 *
 * THE FIX: the reload-blocked exit now ALSO clears `queued` (returned as
 * `nextQueued: false`), exactly like the two exits that already did.
 * Every OTHER exit (no control, not wanting to fire, RPM gate not yet
 * elapsed) still passes `queued` through unchanged — a single click that's
 * merely waiting for the RPM cadence to allow the next shot must survive
 * to fire on a later eligible frame; only "blocked by reload" is a genuine
 * rejection that must not survive.
 */

export interface TriggerQueueState {
  /** True while the mouse button is currently physically held down. */
  readonly held: boolean;
  /** True from the moment of a mousedown until a fire attempt (or a reload-blocked rejection) consumes it. */
  readonly queued: boolean;
}

export interface TriggerGateInputs {
  readonly hasControl: boolean;
  readonly equipping: boolean;
  readonly reloading: boolean;
  /** Pre-computed `now - lastFireAt >= fireIntervalMs` — this module has no timing/frame-rate logic of its own, matching its "pure decision, no clock" scope. */
  readonly fireIntervalElapsed: boolean;
}

export interface TriggerGateResult {
  /** True only when the caller should proceed to the (unchanged) ammo-check/fire logic this frame. */
  readonly shouldAttemptFire: boolean;
  /** The value the caller must persist back into its `triggerQueued` ref for the next frame. */
  readonly nextQueued: boolean;
}

export function resolveTriggerGate(state: TriggerQueueState, gates: TriggerGateInputs): TriggerGateResult {
  if (!gates.hasControl || gates.equipping) {
    return { shouldAttemptFire: false, nextQueued: state.queued };
  }
  const wantsFire = state.held || state.queued;
  if (!wantsFire) {
    return { shouldAttemptFire: false, nextQueued: state.queued };
  }
  if (!gates.fireIntervalElapsed) {
    // Not yet eligible by RPM cadence — NOT a rejection, just "not this
    // frame." A queued click must survive to be re-checked on a later
    // frame once enough time has passed.
    return { shouldAttemptFire: false, nextQueued: state.queued };
  }
  if (gates.reloading) {
    // Genuinely rejected: a reload is in progress. THE FIX — clear the
    // queued flag here too, so a released click can never resurface as a
    // phantom shot once the reload later completes.
    return { shouldAttemptFire: false, nextQueued: false };
  }
  return { shouldAttemptFire: true, nextQueued: false };
}
