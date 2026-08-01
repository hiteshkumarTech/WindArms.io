'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getFirstPersonBodyWorldPose } from '@/lib/v2/operators/firstPersonBodyPose';
import { snapToTexelGrid, type ShadowFrustumConfig, type ShadowFrustumTrackingOutput } from '@/lib/v2/operators/playerCenteredShadowFrustum';
import { buildFixedLightSpaceBasis, projectWorldToLightSpace, reconstructWorldFromLightSpace } from '@/lib/v2/operators/playerCenteredShadowFrustumBasis';
import { useShadowReviewStore, type ShadowFrustumMode } from '@/lib/v2/operators/shadowReviewStore';
import { playerCenteredShadowFrustumDebugState } from '@/lib/v2/operators/playerCenteredShadowFrustumDebugState';

/**
 * Step 8E-D.1 / Step 8F — imperative controller for the player-centered,
 * texel-stabilized shadow frustum. Originally range-only and dev-gated;
 * Step 8E-E additionally mounted this SAME component in range's production
 * path, and Step 8F generalized it to a ROUTE-AGNOSTIC controller — every
 * light-position/target/frustum-size number that used to be a hardcoded
 * range constant is now the caller-supplied `configuration` prop, so
 * `/v2/play` reuses this exact implementation with its OWN measured
 * geometry (Step 8F.0's measurement report) rather than a second component.
 * No route name, no URL parsing, and no range/play conditional branch exists
 * anywhere in this file — `RangeScene.tsx` and `V2PlayScene.tsx` each build
 * their own stable, module-level `ShadowRouteConfiguration` object and pass
 * it in; this controller never knows which route it's running under.
 *
 * Sole owner of the directional light's `position` and its explicit
 * `target`'s `position` while mounted — the caller's own JSX
 * `<directionalLight position={...}>` literal is what's in effect the
 * instant this component is NOT mounted (normal gameplay under the
 * `'fp-arms'` policy), and is exactly what this controller itself restores
 * (frame-by-frame in static mode, and unconditionally on unmount) — so the
 * two can never drift apart, for either route.
 *
 * FIXED LIGHT-SPACE BASIS: `basis` (`playerCenteredShadowFrustumBasis.ts`,
 * unit-tested there) is built ONCE per mount from `configuration`'s
 * canonical light/target geometry. Its world matrix and that matrix's
 * inverse (view matrix) are the FIXED reference frame every frame's
 * tracking math projects into/out of. This is deliberately NOT the live
 * `light.shadow.camera`'s own matrices — those move with the tracked target
 * every frame, which would make the texel grid itself move with the thing
 * it's meant to stabilize.
 *
 * GROUND ANCHOR: `(player.x, configuration.groundAnchorY, player.z)` — world
 * Y is FIXED per route (range: 0; play: 0 — see `playShadowFrustumConfig.ts`
 * for why play also chose its light's own implicit target Y), never the
 * player's live/airborne Y, so a jump/fall/landing arc — or play's much
 * larger Wind Lift rise — never drags the whole light rig vertically. The
 * taller frustum a route supplies (play's `12m` vs range's `6m` height) is
 * what actually absorbs that elevation instead.
 */

export interface ShadowRouteConfiguration {
  /** Canonical (unmoving-reference) light position this route's frustum basis is built from. */
  canonicalLightPosition: readonly [number, number, number];
  /** Canonical (unmoving-reference) target position — what the light looks at. */
  canonicalTargetPosition: readonly [number, number, number];
  /** Frustum applied when tracking mode is `'static-full-floor'` (or on unmount/rollback). */
  staticFrustum: ShadowFrustumConfig;
  /** Frustum applied when tracking mode is `'player-centered'`. */
  playerCenteredFrustum: ShadowFrustumConfig;
  /** Fixed world Y the ground anchor tracks at — never the player's live/airborne Y. */
  groundAnchorY: number;
}

interface KaelPlayerCenteredShadowControllerProps {
  light: React.RefObject<THREE.DirectionalLight>;
  target: THREE.Object3D;
  /** Route-specific light/target/frustum/anchor geometry — see `ShadowRouteConfiguration`. Must be a stable (module-level or memoized) object reference; a fresh literal every render would defeat this controller's own change-detection gating. */
  configuration: ShadowRouteConfiguration;
  /**
   * Step 8E-E — when `true` (range's dev review harness,
   * `shadowReviewEnabled`), this controller reads `shadowReviewStore`'s
   * `frustumMode` every frame, exactly as it always has, so the review
   * panel's static/player-centered A/B toggle keeps working. When `false`
   * (every production activation — range's flag-free production, and
   * `/v2/play` always, which has no review harness in this milestone), the
   * tracking mode is ALWAYS `'player-centered'`, ignoring the store
   * entirely — a stale dev-session value (e.g. left on `'static-full-floor'`
   * after an earlier A/B session in the same browser tab, since the store is
   * a module singleton that survives route navigation) must never leak into
   * a normal production session on EITHER route.
   */
  allowDevModeOverride: boolean;
}

function applyFrustumBounds(camera: THREE.OrthographicCamera, mode: ShadowFrustumMode, configuration: ShadowRouteConfiguration): void {
  const cfg = mode === 'player-centered' ? configuration.playerCenteredFrustum : configuration.staticFrustum;
  camera.left = -cfg.width / 2;
  camera.right = cfg.width / 2;
  camera.top = cfg.height / 2;
  camera.bottom = -cfg.height / 2;
  camera.near = cfg.near;
  camera.far = cfg.far;
  camera.updateProjectionMatrix();
}

function writeStaticDebugState(configuration: ShadowRouteConfiguration): void {
  const debug = playerCenteredShadowFrustumDebugState;
  const cfg = configuration.staticFrustum;
  debug.active = false;
  debug.groundAnchorWorld[0] = 0;
  debug.groundAnchorWorld[1] = 0;
  debug.groundAnchorWorld[2] = 0;
  debug.snappedLightSpace[0] = 0;
  debug.snappedLightSpace[1] = 0;
  debug.texelSizeX = 0;
  debug.texelSizeY = 0;
  debug.activeWidth = cfg.width;
  debug.activeHeight = cfg.height;
  debug.activeNear = cfg.near;
  debug.activeFar = cfg.far;
  debug.lightWorldPosition[0] = configuration.canonicalLightPosition[0];
  debug.lightWorldPosition[1] = configuration.canonicalLightPosition[1];
  debug.lightWorldPosition[2] = configuration.canonicalLightPosition[2];
  debug.targetWorldPosition[0] = configuration.canonicalTargetPosition[0];
  debug.targetWorldPosition[1] = configuration.canonicalTargetPosition[1];
  debug.targetWorldPosition[2] = configuration.canonicalTargetPosition[2];
}

export default function KaelPlayerCenteredShadowController({ light, target, configuration, allowDevModeOverride }: KaelPlayerCenteredShadowControllerProps) {
  // Fixed light-space basis — built ONCE per mount, from the supplied
  // canonical geometry only. See `playerCenteredShadowFrustumBasis.ts`
  // (unit-tested in plain Node — this controller itself has no test harness)
  // for why this stays a truly fixed reference frame for the lifetime of
  // this component instance, never recomputed from the live shadow camera or
  // the external review camera. Depends only on `configuration` (a stable
  // reference per the caller contract above), so this never recomputes
  // across ordinary re-renders.
  const basis = useMemo(
    () => buildFixedLightSpaceBasis(new THREE.Vector3(...configuration.canonicalLightPosition), new THREE.Vector3(...configuration.canonicalTargetPosition)),
    [configuration],
  );
  // `lightPos - targetPos`, preserved EXACTLY every frame in player-centered
  // mode so the light's angle/distance relative to its target never
  // changes — only translates. Computed generically (not assumed to equal
  // the raw light position) so a future route with a non-origin target still
  // gets a correct offset; both range and play use an origin target today.
  const lightTargetOffset = useMemo(
    () => new THREE.Vector3(...configuration.canonicalLightPosition).sub(new THREE.Vector3(...configuration.canonicalTargetPosition)),
    [configuration],
  );

  const lastAppliedModeRef = useRef<ShadowFrustumMode | null>(null);
  const lastAppliedConfigurationRef = useRef<ShadowRouteConfiguration | null>(null);

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
  // component unmounting, regardless of which mode was active at the time,
  // for either route.
  useEffect(() => {
    // Captured at effect-setup time (not re-read from `light.current` inside
    // the cleanup) per the exhaustive-deps rule's own guidance — in practice
    // this is the same instance throughout, since `light` is a SIBLING ref
    // owned by the caller's always-mounted `<directionalLight>`, never this
    // component's own ref, so it's never nulled by this component's own
    // unmount.
    const lightAtMount = light.current;
    return () => {
      target.position.set(...configuration.canonicalTargetPosition);
      if (lightAtMount) {
        lightAtMount.position.set(...configuration.canonicalLightPosition);
        applyFrustumBounds(lightAtMount.shadow.camera, 'static-full-floor', configuration);
      }
      writeStaticDebugState(configuration);
    };
  }, [light, target, configuration]);

  useFrame(() => {
    const lightObj = light.current;
    if (!lightObj) return;

    const mode: ShadowFrustumMode = allowDevModeOverride ? useShadowReviewStore.getState().frustumMode : 'player-centered';
    if (mode !== lastAppliedModeRef.current || configuration !== lastAppliedConfigurationRef.current) {
      applyFrustumBounds(lightObj.shadow.camera, mode, configuration);
      lastAppliedModeRef.current = mode;
      lastAppliedConfigurationRef.current = configuration;
    }

    if (mode !== 'player-centered') {
      target.position.set(...configuration.canonicalTargetPosition);
      lightObj.position.set(...configuration.canonicalLightPosition);
      writeStaticDebugState(configuration);
      return;
    }

    const pose = getFirstPersonBodyWorldPose();
    if (!pose.ready) return;

    const groundAnchor = groundAnchorScratchRef.current.set(pose.worldPosition.x, configuration.groundAnchorY, pose.worldPosition.z);
    const lightSpace = projectWorldToLightSpace(groundAnchor, basis, lightSpaceScratchRef.current);

    const snapOutput = snapToTexelGrid(
      { anchorLightSpaceX: lightSpace.x, anchorLightSpaceY: lightSpace.y, config: configuration.playerCenteredFrustum },
      snapOutputRef.current,
    );

    // Z (light-space depth) is left unsnapped — only X/Y (the shadow map's
    // own texel grid axes) need grid alignment; depth has no texel concept.
    const snappedLightSpace = snappedLightSpaceScratchRef.current.set(snapOutput.snappedLightSpaceX, snapOutput.snappedLightSpaceY, lightSpace.z);
    const newTargetWorld = reconstructWorldFromLightSpace(snappedLightSpace, basis, targetWorldScratchRef.current);

    target.position.copy(newTargetWorld);
    lightObj.position.copy(newTargetWorld).add(lightTargetOffset);

    const debug = playerCenteredShadowFrustumDebugState;
    debug.active = true;
    debug.groundAnchorWorld[0] = groundAnchor.x;
    debug.groundAnchorWorld[1] = groundAnchor.y;
    debug.groundAnchorWorld[2] = groundAnchor.z;
    debug.snappedLightSpace[0] = snapOutput.snappedLightSpaceX;
    debug.snappedLightSpace[1] = snapOutput.snappedLightSpaceY;
    debug.texelSizeX = snapOutput.texelSizeX;
    debug.texelSizeY = snapOutput.texelSizeY;
    debug.activeWidth = configuration.playerCenteredFrustum.width;
    debug.activeHeight = configuration.playerCenteredFrustum.height;
    debug.activeNear = configuration.playerCenteredFrustum.near;
    debug.activeFar = configuration.playerCenteredFrustum.far;
    debug.lightWorldPosition[0] = lightObj.position.x;
    debug.lightWorldPosition[1] = lightObj.position.y;
    debug.lightWorldPosition[2] = lightObj.position.z;
    debug.targetWorldPosition[0] = target.position.x;
    debug.targetWorldPosition[1] = target.position.y;
    debug.targetWorldPosition[2] = target.position.z;
  });

  return null;
}
