/**
 * Dev-only readout bridge for `KaelBodyDebugPanel` (Milestone 8, Step 8C,
 * extended Step 8D) — plain mutable object written by
 * `KaelFirstPersonLowerBody.tsx` inside the R3F render loop, polled by the
 * DOM debug panel outside the Canvas (same "poll a plain object at a
 * human-perceptible rate" convention `ArmActionDebugPanel.tsx` already uses
 * for `actionPoseState`). Everything else the panel needs (pose ready/
 * generation/world position/yaw/respawn nonce, player yaw/pitch,
 * horizontalSpeed/verticalVelocity/movementState) is already published by
 * `firstPersonBodyPose.ts`/`rangeLocalPose.ts` directly — this bridge only
 * carries the handful of fields that need something the R3F tree alone has
 * access to (camera distance, mesh/triangle/material info, and the
 * locomotion pose's own computed output, which lives entirely inside this
 * component's per-frame closure).
 */
export interface BodyDebugReadout {
  meshCount: number;
  triangleCount: number;
  materialName: string;
  cameraToBodyRootDistance: number;
  effectiveYaw: number;
  /** Step 8D — the locomotion pose module's own classification for this frame ('idle'|'walk'|'sprint'|'airRise'|'airFall'|'landing'|'takeoff'|'windLift'). */
  locomotionState: string;
  /** 0..1, normalized gait cycle position. */
  stridePhase: number;
  /** 0..1 diagnostic overall pose intensity, see `LowerBodyLocomotionPose.blendWeight`'s doc comment. */
  locomotionBlendWeight: number;
  pelvisPositionOffset: [number, number, number];
  pelvisRotationEuler: [number, number, number];
  leftUpperLegPitch: number;
  rightUpperLegPitch: number;
  leftLowerLegPitch: number;
  rightLowerLegPitch: number;
  leftFootPitch: number;
  rightFootPitch: number;
}

export const bodyDebugReadout: BodyDebugReadout = {
  meshCount: 0,
  triangleCount: 0,
  materialName: '',
  cameraToBodyRootDistance: 0,
  effectiveYaw: 0,
  locomotionState: 'idle',
  stridePhase: 0,
  locomotionBlendWeight: 0,
  pelvisPositionOffset: [0, 0, 0],
  pelvisRotationEuler: [0, 0, 0],
  leftUpperLegPitch: 0,
  rightUpperLegPitch: 0,
  leftLowerLegPitch: 0,
  rightLowerLegPitch: 0,
  leftFootPitch: 0,
  rightFootPitch: 0,
};
