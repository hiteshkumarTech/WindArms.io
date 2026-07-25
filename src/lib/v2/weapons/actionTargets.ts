import type { RuntimeGripAnchor } from './vortexRuntimeAnchors';
import { VORTEX_RUNTIME_ANCHORS } from './vortexRuntimeAnchors';

/**
 * TEMPORARY runtime action targets for the left hand's reload/inspect
 * manipulation gestures (Milestone 7, Phase G, Step 7C). Same status as
 * `VORTEX_RUNTIME_ANCHORS`'s `gripHandLocal`/`gripSupportLocal`: hand-
 * measured/estimated coordinates in the raw Vortex GLB's own local space,
 * NOT authored `socket_*` empties — see `vortexRuntimeAnchors.ts`'s module
 * doc for the full coordinate contract (position/rotation convention,
 * hand-basis axis meaning, why left/right are never mirrored by negation).
 *
 * NOT VISUALLY CALIBRATED — unlike `gripHandLocal`/`gripSupportLocal`
 * (checked live against the running scene with axis/palm-proxy debug
 * markers), these two anchors are reasoned, conservative offsets from the
 * already-calibrated `gripSupportLocal`, chosen because the real Vortex
 * geometry has no modeled magazine well, bolt, or separate manipulable
 * part — moving a large, precise distance to a "magwell" this mesh doesn't
 * actually have would be fabricating contact with geometry that isn't
 * there. Both anchors stay close to the real support-grip surface, reading
 * as "the support hand shifts position on the same general area of the
 * gun," which is honest given what the mesh actually supports. Flagged for
 * human visual re-calibration in a future pass (same convention as every
 * other temporary runtime anchor in this codebase) via `?anim=1`'s "show
 * action target" marker.
 */

/**
 * Reload manipulation area — down and back from the support grip, toward
 * the underside of the receiver (a generic "working the action" area, not
 * a claimed magazine-well location — this mesh has no separate magazine
 * geometry). Step 7D: magnitude increased from the Step 7C first pass
 * (-0.06/-0.05) to -0.09/-0.08 — the smaller offset sat close enough to
 * the grip marker that the two were nearly touching on screen, reading as
 * a barely-perceptible nudge rather than a believable "left the grip and
 * reached elsewhere" gesture. Still conservative relative to the weapon's
 * measured 1.000m length (moves further FROM the muzzle at +0.47, not
 * toward it) and the grip's own already-calibrated position.
 */
export const RELOAD_LEFT_HAND_LOCAL: RuntimeGripAnchor = {
  position: [
    VORTEX_RUNTIME_ANCHORS.gripSupportLocal.position[0] - 0.09,
    VORTEX_RUNTIME_ANCHORS.gripSupportLocal.position[1] - 0.08,
    VORTEX_RUNTIME_ANCHORS.gripSupportLocal.position[2],
  ],
  rotationEuler: [0.0, 0.0, -0.85],
  rotationOrder: 'XYZ',
};

/**
 * Inspect support point — slightly back along the handguard from the
 * normal support grip, an open sliding hand rather than a wrapped grip.
 * Step 7D: a -0.11 back offset (tried first, matching the reload target's
 * magnitude) visually landed the marker on/near the scope/optic bump on
 * top of the receiver during `inspectHold` — moved back to a smaller
 * -0.05 offset that keeps the hand forward on the handguard, clear of the
 * scope, while staying distinguishable from the grip marker (confirmed
 * via `?anim=1` screenshot at progress 0.45).
 */
export const INSPECT_LEFT_HAND_LOCAL: RuntimeGripAnchor = {
  position: [
    VORTEX_RUNTIME_ANCHORS.gripSupportLocal.position[0] - 0.05,
    VORTEX_RUNTIME_ANCHORS.gripSupportLocal.position[1] + 0.02,
    VORTEX_RUNTIME_ANCHORS.gripSupportLocal.position[2],
  ],
  rotationEuler: [0.0, 0.0, -0.4],
  rotationOrder: 'XYZ',
};
