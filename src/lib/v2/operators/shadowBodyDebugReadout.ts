/**
 * Dev-only readout bridge for `KaelShadowDebugPanel` (Milestone 8, Step
 * 8E-B) — same "poll a plain mutable object at a human-perceptible rate"
 * convention as `bodyDebugReadout.ts`. Written by
 * `KaelFirstPersonShadowBody.tsx` inside its own `useFrame`, read by the DOM
 * panel outside the Canvas.
 */
export interface ShadowBodyDebugReadout {
  ready: boolean;
  meshCount: number;
  jointCount: number;
  castShadowMeshCount: number;
  rootWorldPosition: [number, number, number];
  effectiveYaw: number;
  boneResolutionFailed: boolean;
}

export const shadowBodyDebugReadout: ShadowBodyDebugReadout = {
  ready: false,
  meshCount: 0,
  jointCount: 0,
  castShadowMeshCount: 0,
  rootWorldPosition: [0, 0, 0],
  effectiveYaw: 0,
  boneResolutionFailed: false,
};
