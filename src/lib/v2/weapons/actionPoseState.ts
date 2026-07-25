import * as THREE from 'three';
import type { ActionPhaseName } from '@/lib/v2/operators/actionPose';

/**
 * World-space ACTION POSE bridge — same singleton-bridge family as
 * `muzzleWorldPose.ts`/`gripWorldPose.ts` (plain mutable object, written
 * every frame by `VortexViewmodel.tsx`, read anywhere without a
 * subscription or a scene-graph ref). Kept SEPARATE from `gripWorldPose.ts`
 * for the same reason that file gives for staying separate from
 * `muzzleWorldPose.ts`: a proven, already-shipping bridge shouldn't be
 * risked by generalizing it to carry a second, newer concern.
 *
 * Carries the hand-relevant half of `computeActionPose`'s output (the
 * weapon-offset half is applied directly by `VortexViewmodel` to its own
 * group transform, never published — nothing else needs it) PLUS the
 * left-hand action target already resolved to world space, using the same
 * `resolveRuntimeAnchorWorldPose` chain and the SAME per-frame
 * `groupWorldPosition`/`groupWorldQuaternion`/`poseScale` the grip anchors
 * already use — no duplicate weapon-transform computation.
 *
 * Simpler readiness model than `gripWorldPose.ts`'s generation counter:
 * there is only ever ONE left-hand action target active at a time (never
 * two competing writers to reconcile), so a plain `ready` flag — reset on
 * mount and unmount, same as `muzzleWorldPose.ts` — is sufficient to avoid
 * a remount reading a previous instance's stale target.
 */
export const actionPoseState = {
  leftTargetPosition: new THREE.Vector3(),
  leftTargetQuaternion: new THREE.Quaternion(),
  rightHandIkWeight: 1,
  leftHandIkWeight: 1,
  rightFingerCurlScale: 0,
  leftFingerCurlScale: 0,
  leftActionTargetWeight: 0,
  actionPhase: 'idle' as ActionPhaseName,
  /** True only once the mounted `VortexViewmodel` instance has published at least one frame this mount. */
  ready: false,
};
