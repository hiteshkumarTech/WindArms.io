'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getFirstPersonBodyWorldPose } from '@/lib/v2/operators/firstPersonBodyPose';
import { RANGE_SHADOW_CAMERA_BOUNDS } from '@/lib/v2/range/rangeEnvironmentBounds';
import { PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG, snapToTexelGrid, type ShadowFrustumTrackingOutput } from '@/lib/v2/operators/playerCenteredShadowFrustum';
import { buildFixedLightSpaceBasis, projectWorldToLightSpace, reconstructWorldFromLightSpace } from '@/lib/v2/operators/playerCenteredShadowFrustumBasis';
import { useShadowReviewStore, type ShadowFrustumMode } from '@/lib/v2/operators/shadowReviewStore';
import { playerCenteredShadowFrustumDebugState } from '@/lib/v2/operators/playerCenteredShadowFrustumDebugState';

/**
 * Step 8E-D.1 — imperative controller for the player-centered, texel-
 * stabilized shadow frustum. Dev-only: mounted by `RangeScene.tsx` ONLY
 * while `shadowReviewEnabled` (`?shadow=1&shadowReview=1`). Sole owner of
 * the directional light's `position` and its explicit `target`'s `position`
 * while mounted — `RangeScene.tsx`'s own JSX `position={[12,22,8]}` literal
 * on `<directionalLight>` is what's in effect the instant this component is
 * NOT mounted (normal gameplay), and is exactly what this controller itself
 * restores (frame-by-frame in static mode, and unconditionally on unmount)
 * — so the two can never drift apart.
 *
 * FIXED LIGHT-SPACE BASIS: `basis` (`playerCenteredShadowFrustumBasis.ts`,
 * unit-tested there — see that module's own doc comment for why it must use
 * a detached `THREE.Camera`, not a plain `Object3D`) is built ONCE from the
 * canonical light/target geometry — `(12,22,8)` looking at `(0,0,0)`, the
 * same values `docs/decisions.md`'s Step 8E-D entry confirmed empirically.
 * Its world matrix and that matrix's inverse (view matrix) are the FIXED
 * reference frame every frame's tracking math projects into/out of. This is
 * deliberately NOT the live `light.shadow.camera`'s own matrices — those
 * move with the tracked target every frame, which would make the texel grid
 * itself move with the thing it's meant to stabilize.
 *
 * GROUND ANCHOR: `(player.x, GROUND_ANCHOR_FIXED_Y, player.z)` — world Y is
 * FIXED at 0 (the canonical target's own original Y), never the player's
 * live/airborne Y, so a jump/fall/landing arc never drags the whole light
 * rig vertically. `GROUND_ANCHOR_FIXED_Y = 0` was chosen specifically
 * because it's the existing original target Y (per this pass's own brief:
 * "prefer the existing original target Y when safe") — it preserves the
 * canonical light-to-target geometry exactly along the vertical axis, only
 * translating horizontally (in light-space X/Y, which are NOT world X/Y —
 * see `playerCenteredShadowFrustum.ts`'s own doc comment) to follow the
 * player.
 */

interface KaelPlayerCenteredShadowControllerProps {
  light: React.RefObject<THREE.DirectionalLight>;
  target: THREE.Object3D;
}

const CANONICAL_LIGHT_POSITION: readonly [number, number, number] = [12, 22, 8];
const CANONICAL_TARGET_POSITION: readonly [number, number, number] = [0, 0, 0];
/** `lightPos - targetPos`, preserved EXACTLY every frame in player-centered mode so the light's angle/distance relative to its target never changes — only translates. */
const LIGHT_TARGET_OFFSET = new THREE.Vector3(...CANONICAL_LIGHT_POSITION);
/** See this file's own doc comment — the canonical target's original Y, deliberately never the player's live/airborne Y. */
const GROUND_ANCHOR_FIXED_Y = 0;

function applyFrustumBounds(camera: THREE.OrthographicCamera, mode: ShadowFrustumMode): void {
  if (mode === 'player-centered') {
    const cfg = PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG;
    camera.left = -cfg.width / 2;
    camera.right = cfg.width / 2;
    camera.top = cfg.height / 2;
    camera.bottom = -cfg.height / 2;
    camera.near = cfg.near;
    camera.far = cfg.far;
  } else {
    camera.left = RANGE_SHADOW_CAMERA_BOUNDS.left;
    camera.right = RANGE_SHADOW_CAMERA_BOUNDS.right;
    camera.top = RANGE_SHADOW_CAMERA_BOUNDS.top;
    camera.bottom = RANGE_SHADOW_CAMERA_BOUNDS.bottom;
    camera.near = RANGE_SHADOW_CAMERA_BOUNDS.near;
    camera.far = RANGE_SHADOW_CAMERA_BOUNDS.far;
  }
  camera.updateProjectionMatrix();
}

function writeStaticDebugState(): void {
  const debug = playerCenteredShadowFrustumDebugState;
  debug.active = false;
  debug.groundAnchorWorld[0] = 0;
  debug.groundAnchorWorld[1] = 0;
  debug.groundAnchorWorld[2] = 0;
  debug.snappedLightSpace[0] = 0;
  debug.snappedLightSpace[1] = 0;
  debug.texelSizeX = 0;
  debug.texelSizeY = 0;
  debug.activeWidth = RANGE_SHADOW_CAMERA_BOUNDS.right - RANGE_SHADOW_CAMERA_BOUNDS.left;
  debug.activeHeight = RANGE_SHADOW_CAMERA_BOUNDS.top - RANGE_SHADOW_CAMERA_BOUNDS.bottom;
  debug.activeNear = RANGE_SHADOW_CAMERA_BOUNDS.near;
  debug.activeFar = RANGE_SHADOW_CAMERA_BOUNDS.far;
  debug.lightWorldPosition[0] = CANONICAL_LIGHT_POSITION[0];
  debug.lightWorldPosition[1] = CANONICAL_LIGHT_POSITION[1];
  debug.lightWorldPosition[2] = CANONICAL_LIGHT_POSITION[2];
  debug.targetWorldPosition[0] = CANONICAL_TARGET_POSITION[0];
  debug.targetWorldPosition[1] = CANONICAL_TARGET_POSITION[1];
  debug.targetWorldPosition[2] = CANONICAL_TARGET_POSITION[2];
}

export default function KaelPlayerCenteredShadowController({ light, target }: KaelPlayerCenteredShadowControllerProps) {
  // Fixed light-space basis — built ONCE, from the canonical geometry only.
  // See `playerCenteredShadowFrustumBasis.ts` (unit-tested in plain Node —
  // this controller itself has no test harness, see that module's own doc
  // comment) for why this stays a truly fixed reference frame for the
  // lifetime of this component instance, never recomputed from the live
  // shadow camera or the external review camera.
  const basis = useMemo(() => buildFixedLightSpaceBasis(new THREE.Vector3(...CANONICAL_LIGHT_POSITION), new THREE.Vector3(...CANONICAL_TARGET_POSITION)), []);

  const lastAppliedModeRef = useRef<ShadowFrustumMode | null>(null);

  // Preallocated scratch — no per-frame Vector3/allocation on the hot path.
  const groundAnchorScratchRef = useRef(new THREE.Vector3());
  const lightSpaceScratchRef = useRef(new THREE.Vector3());
  const snappedLightSpaceScratchRef = useRef(new THREE.Vector3());
  const targetWorldScratchRef = useRef(new THREE.Vector3());
  const snapOutputRef = useRef<ShadowFrustumTrackingOutput>({
    snappedLightSpaceX: 0,
    snappedLightSpaceY: 0,
    texelSizeX: 0,
    texelSizeY: 0,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    near: 0,
    far: 0,
  });

  // Route-leave / flag-disable restoration — unconditional, independent of
  // whatever R3F's own prop diffing does or doesn't reapply. Guarantees no
  // stale light/target translation or stale frustum bounds survive this
  // component unmounting, regardless of which mode was active at the time.
  useEffect(() => {
    // Captured at effect-setup time (not re-read from `light.current` inside
    // the cleanup) per the exhaustive-deps rule's own guidance — in practice
    // this is the same instance throughout, since `light` is a SIBLING ref
    // owned by `RangeScene.tsx`'s always-mounted `<directionalLight>`, never
    // this component's own ref, so it's never nulled by this component's own
    // unmount.
    const lightAtMount = light.current;
    return () => {
      target.position.set(...CANONICAL_TARGET_POSITION);
      if (lightAtMount) {
        lightAtMount.position.set(...CANONICAL_LIGHT_POSITION);
        applyFrustumBounds(lightAtMount.shadow.camera, 'static-full-floor');
      }
      writeStaticDebugState();
    };
  }, [light, target]);

  useFrame(() => {
    const lightObj = light.current;
    if (!lightObj) return;

    const mode = useShadowReviewStore.getState().frustumMode;
    if (mode !== lastAppliedModeRef.current) {
      applyFrustumBounds(lightObj.shadow.camera, mode);
      lastAppliedModeRef.current = mode;
    }

    if (mode !== 'player-centered') {
      target.position.set(...CANONICAL_TARGET_POSITION);
      lightObj.position.set(...CANONICAL_LIGHT_POSITION);
      writeStaticDebugState();
      return;
    }

    const pose = getFirstPersonBodyWorldPose();
    if (!pose.ready) return;

    const groundAnchor = groundAnchorScratchRef.current.set(pose.worldPosition.x, GROUND_ANCHOR_FIXED_Y, pose.worldPosition.z);
    const lightSpace = projectWorldToLightSpace(groundAnchor, basis, lightSpaceScratchRef.current);

    const snapOutput = snapToTexelGrid(
      { anchorLightSpaceX: lightSpace.x, anchorLightSpaceY: lightSpace.y, config: PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG },
      snapOutputRef.current,
    );

    // Z (light-space depth) is left unsnapped — only X/Y (the shadow map's
    // own texel grid axes) need grid alignment; depth has no texel concept.
    const snappedLightSpace = snappedLightSpaceScratchRef.current.set(snapOutput.snappedLightSpaceX, snapOutput.snappedLightSpaceY, lightSpace.z);
    const newTargetWorld = reconstructWorldFromLightSpace(snappedLightSpace, basis, targetWorldScratchRef.current);

    target.position.copy(newTargetWorld);
    lightObj.position.copy(newTargetWorld).add(LIGHT_TARGET_OFFSET);

    const debug = playerCenteredShadowFrustumDebugState;
    debug.active = true;
    debug.groundAnchorWorld[0] = groundAnchor.x;
    debug.groundAnchorWorld[1] = groundAnchor.y;
    debug.groundAnchorWorld[2] = groundAnchor.z;
    debug.snappedLightSpace[0] = snapOutput.snappedLightSpaceX;
    debug.snappedLightSpace[1] = snapOutput.snappedLightSpaceY;
    debug.texelSizeX = snapOutput.texelSizeX;
    debug.texelSizeY = snapOutput.texelSizeY;
    debug.activeWidth = PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG.width;
    debug.activeHeight = PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG.height;
    debug.activeNear = PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG.near;
    debug.activeFar = PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG.far;
    debug.lightWorldPosition[0] = lightObj.position.x;
    debug.lightWorldPosition[1] = lightObj.position.y;
    debug.lightWorldPosition[2] = lightObj.position.z;
    debug.targetWorldPosition[0] = target.position.x;
    debug.targetWorldPosition[1] = target.position.y;
    debug.targetWorldPosition[2] = target.position.z;
  });

  return null;
}
