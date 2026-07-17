/**
 * The local player's latest pose/motion state for the V2 range scene —
 * same "plain mutable module object written every frame by the controller,
 * read anywhere without a subscription" convention as v1's
 * `src/lib/game/localPose.ts`. A separate module (not imported from v1) so
 * the two scenes never share state. No networking here — nothing in this
 * range implementation is multiplayer, so there's no correction/replication
 * concern to mirror from v1's version.
 */
export type RangeMovementState = 'idle' | 'walk' | 'sprint' | 'air';

export interface RangeLocalPose {
  yaw: number;
  pitch: number;
  horizontalSpeed: number;
  grounded: boolean;
  state: RangeMovementState;
}

export const rangeLocalPose: RangeLocalPose = {
  yaw: 0,
  pitch: 0,
  horizontalSpeed: 0,
  grounded: true,
  state: 'idle',
};
