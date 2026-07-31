/**
 * Step 8E-D.1 — dev-only readout bridge for the player-centered shadow
 * frustum controller. Same "plain mutable singleton, written every frame,
 * polled at a human-perceptible rate by the DOM panel" convention as
 * `shadowBodyDebugReadout.ts`/`shadowArmDebugState.ts` — deliberately NOT a
 * Zustand store or React state, since the controller writes this every
 * frame and neither of those should re-render 60x/second for a value nobody
 * is watching that closely.
 */
export interface PlayerCenteredShadowFrustumDebugState {
  active: boolean;
  groundAnchorWorld: [number, number, number];
  snappedLightSpace: [number, number];
  texelSizeX: number;
  texelSizeY: number;
  activeWidth: number;
  activeHeight: number;
  activeNear: number;
  activeFar: number;
  lightWorldPosition: [number, number, number];
  targetWorldPosition: [number, number, number];
}

export const playerCenteredShadowFrustumDebugState: PlayerCenteredShadowFrustumDebugState = {
  active: false,
  groundAnchorWorld: [0, 0, 0],
  snappedLightSpace: [0, 0],
  texelSizeX: 0,
  texelSizeY: 0,
  activeWidth: 0,
  activeHeight: 0,
  activeNear: 0,
  activeFar: 0,
  lightWorldPosition: [0, 0, 0],
  targetWorldPosition: [0, 0, 0],
};
