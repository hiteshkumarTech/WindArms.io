/**
 * Dev-only readout bridge for `KaelBodyDebugPanel` (Milestone 8, Step 8C) —
 * plain mutable object written by `KaelFirstPersonLowerBody.tsx` inside the
 * R3F render loop, polled by the DOM debug panel outside the Canvas (same
 * "poll a plain object at a human-perceptible rate" convention
 * `ArmActionDebugPanel.tsx` already uses for `actionPoseState`). Everything
 * else the panel needs (pose ready/generation/world position/yaw/respawn
 * nonce, player yaw/pitch) is already published by `firstPersonBodyPose.ts`
 * and `rangeLocalPose.ts` directly — this bridge only carries the handful
 * of fields that need something the R3F tree alone has access to (camera
 * distance, mesh/triangle/material info).
 */
export interface BodyDebugReadout {
  meshCount: number;
  triangleCount: number;
  materialName: string;
  cameraToBodyRootDistance: number;
  effectiveYaw: number;
}

export const bodyDebugReadout: BodyDebugReadout = {
  meshCount: 0,
  triangleCount: 0,
  materialName: '',
  cameraToBodyRootDistance: 0,
  effectiveYaw: 0,
};
