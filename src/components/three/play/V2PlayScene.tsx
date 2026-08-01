'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { PLAYER } from '@/lib/game/constants';
import { STORM } from '@/lib/v2/tokens';
import type { RangeInputSnapshot } from '@/lib/v2/range/useRangeKeyboardInput';
import RangeEffectsPools from '@/components/three/range/RangeEffectsPools';
import KaelFirstPersonArms from '@/components/three/weapons/KaelFirstPersonArms';
import VortexFireSystem from '@/components/three/weapons/VortexFireSystem';
import VortexViewmodel from '@/components/three/weapons/VortexViewmodel';
import KaelFirstPersonLowerBody from '@/components/three/operators/KaelFirstPersonLowerBody';
import KaelFirstPersonShadowBody from '@/components/three/operators/KaelFirstPersonShadowBody';
import KaelFirstPersonShadowWeapon from '@/components/three/operators/KaelFirstPersonShadowWeapon';
import KaelPlayerCenteredShadowController, { type ShadowRouteConfiguration } from '@/components/three/operators/KaelPlayerCenteredShadowController';
import { EFFECTIVE_PLAY_SHADOW_CASTER_POLICY, resolveShadowCasterDecision } from '@/lib/v2/operators/shadowCasterPolicy';
import { PLAY_GROUND_ANCHOR_Y, PLAY_PLAYER_CENTERED_SHADOW_CONFIG, PLAY_SHADOW_LIGHT_POSITION, PLAY_SHADOW_LIGHT_TARGET, PLAY_STATIC_SHADOW_CONFIG } from '@/lib/v2/play/playShadowFrustumConfig';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';
import { PLAYER_SPAWN } from '@/lib/v2/play/spawnConfig';
import MatchDirector from './MatchDirector';
import PlayerController from './PlayerController';
import SkyfrontTrialArena from './SkyfrontTrialArena';
import WindLift from './WindLift';
import DroneSquad from './DroneSquad';

/**
 * Step 8F — `/v2/play`'s own `ShadowRouteConfiguration`, module-level for
 * the same stable-reference reason `RangeScene.tsx`'s own
 * `RANGE_SHADOW_ROUTE_CONFIG` documents. Every number here is the Step
 * 8F.0-measured candidate (`playShadowFrustumConfig.ts`'s own doc comment
 * has the full measurement provenance) — deliberately NOT range's `3.5 × 6 /
 * near 20 / far 27`, which was measured against range's own, different
 * light-to-target distance and has no Wind Lift to cover.
 */
const PLAY_SHADOW_ROUTE_CONFIG: ShadowRouteConfiguration = {
  canonicalLightPosition: PLAY_SHADOW_LIGHT_POSITION,
  canonicalTargetPosition: PLAY_SHADOW_LIGHT_TARGET,
  staticFrustum: PLAY_STATIC_SHADOW_CONFIG,
  playerCenteredFrustum: PLAY_PLAYER_CENTERED_SHADOW_CONFIG,
  groundAnchorY: PLAY_GROUND_ANCHOR_Y,
};

/**
 * Canvas contents for `/v2/play` — the Skyfront Trial (Milestone 6). Its
 * own scene tree, wholly separate from `/play` (v1) and `/v2/range`.
 * Reuses, unchanged: the shared VortexFireSystem + VortexViewmodel (real
 * Vortex Rifle LOD1 via the pipeline), RangeEffectsPools (tracers/impacts/
 * casings), the lib/game movement core (through PlayerController). Also
 * reuses, unchanged, `KaelFirstPersonArms` (Milestone 7, Phase F, Step 6) —
 * the same standalone two-bone-IK component `/v2/range` mounts, solving
 * toward VortexViewmodel's published grip targets; no play-specific fork
 * exists or is needed. New: the match director/clock, the Skyfront arena
 * blockout, the Wind Lift, and the drone squad.
 *
 * Physics is paused with the match (`paused`/menus) so drones, bolts and the
 * player all freeze together from one authority. The combat gate ref is
 * created here and threaded to both the director (which sets it) and the
 * fire system (which reads it) so weapon input is match-aware without the
 * fire system knowing anything about the match.
 *
 * STEP 8F — SHADOW CASTER ROLLOUT: mirrors `RangeScene.tsx`'s own Step 8E-E
 * pattern exactly, using the SAME shared, route-agnostic
 * `resolveShadowCasterDecision()` and the SAME shared
 * `KaelFirstPersonShadowBody`/`KaelFirstPersonShadowWeapon`/
 * `KaelPlayerCenteredShadowController` components — no play-specific copy of
 * any of the three. `/v2/play` has no dev shadow-debug or review harness
 * (out of scope for this milestone — see `docs/decisions.md`'s Step 8F
 * entry), so `debugFullBodyRequested`/`debugControllerRequested` are always
 * `false` and `allowDevModeOverride` is always `false`: the decision reduces
 * to a pure function of `EFFECTIVE_PLAY_SHADOW_CASTER_POLICY` alone, with no
 * query-flag path at all. Flipping `PLAY_SHADOW_CASTER_POLICY` to
 * `'fp-arms'` (`shadowCasterPolicy.ts`) is the entire rollback — this file
 * needs no other change, since every conditional below already re-derives
 * from that one constant.
 */
export default function V2PlayScene({ inputRef }: { inputRef: React.MutableRefObject<RangeInputSnapshot> }) {
  const combatGateRef = useRef(false);
  const playShadowCasterDecision = resolveShadowCasterDecision({
    debugFullBodyRequested: false,
    debugControllerRequested: false,
    policy: EFFECTIVE_PLAY_SHADOW_CASTER_POLICY,
  });
  // Map resolution DOES depend on which frustum is active for play (unlike
  // range, where both its static and player-centered configs happen to
  // already share 1024²) — play's static fallback is 2048², its
  // player-centered candidate is 1024² (`playShadowFrustumConfig.ts`). No
  // live A/B toggle exists on this route (no review harness), so this is a
  // per-mount-constant derived from the compile-time policy, not a value
  // that changes while mounted.
  const playShadowMapSize = playShadowCasterDecision.fullBodyCasterActive ? PLAY_PLAYER_CENTERED_SHADOW_CONFIG.mapWidth : PLAY_STATIC_SHADOW_CONFIG.mapWidth;
  // Step 8F — explicit, always-present shadow-camera target (same pattern as
  // RangeScene.tsx's own `lightRef`/`shadowTarget`): byte-identical to
  // THREE's own implicit default (world origin, since PLAY_SHADOW_LIGHT_TARGET
  // is (0,0,0)) while nothing is actively moving it, so this addition alone
  // changes nothing about normal `/v2/play` rendering under the `'fp-arms'`
  // rollback policy.
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const shadowTarget = useMemo(() => new THREE.Object3D(), []);

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ fov: PLAYER.FOV_BASE, near: 0.05, far: 220, position: [PLAYER_SPAWN[0], PLAYER_SPAWN[1] + PLAYER.EYE_STAND, PLAYER_SPAWN[2]] }}
    >
      <SkyGradientBackground />
      <fog attach="fog" args={[STORM.skyHorizon, 55, 150]} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={[STORM.skyMid, STORM.deep, 0.55]} />
      <directionalLight
        ref={lightRef}
        target={shadowTarget}
        position={[PLAY_SHADOW_LIGHT_POSITION[0], PLAY_SHADOW_LIGHT_POSITION[1], PLAY_SHADOW_LIGHT_POSITION[2]]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[playShadowMapSize, playShadowMapSize]}
        shadow-camera-near={PLAY_STATIC_SHADOW_CONFIG.near}
        shadow-camera-far={PLAY_STATIC_SHADOW_CONFIG.far}
        shadow-camera-left={-PLAY_STATIC_SHADOW_CONFIG.width / 2}
        shadow-camera-right={PLAY_STATIC_SHADOW_CONFIG.width / 2}
        shadow-camera-top={PLAY_STATIC_SHADOW_CONFIG.height / 2}
        shadow-camera-bottom={-PLAY_STATIC_SHADOW_CONFIG.height / 2}
      />
      {/* Step 8F — explicit shadow-camera target, always present (see `lightRef`/`shadowTarget`'s own comment above). */}
      <primitive object={shadowTarget} />

      <MatchDirector combatGateRef={combatGateRef} />

      <PausablePhysics>
        <SkyfrontTrialArena />
        <PlayerController inputRef={inputRef} />
      </PausablePhysics>

      <WindLift />
      <DroneSquad />
      <VortexFireSystem inputRef={inputRef} combatGateRef={combatGateRef} />
      <Suspense fallback={null}>
        <VortexViewmodel />
        <KaelFirstPersonArms casterPolicy={EFFECTIVE_PLAY_SHADOW_CASTER_POLICY} />
        <KaelFirstPersonLowerBody />
        {/* Step 8F — the shared full-body shadow body+weapon, the SAME
            components /v2/range's production caster already uses. Mounted
            only when the policy resolves to `'full-body'` — never both this
            and the visible arms' own shadow contribution at once (see
            `playShadowCasterDecision`'s own doc comment / `shadowCasterPolicy.ts`). */}
        {playShadowCasterDecision.fullBodyCasterActive && (
          <>
            <KaelFirstPersonShadowBody />
            <KaelFirstPersonShadowWeapon />
          </>
        )}
        {/* Step 8F — the shared player-centered tracking controller, active
            exactly when the full-body casters are (play has no independent
            review-only activation path — `allowDevModeOverride={false}`
            unconditionally, so a stale dev-session `frustumMode` value left
            in `shadowReviewStore` by a `/v2/range` session in the same tab
            can never leak into `/v2/play`, which never reads that store at all). */}
        {playShadowCasterDecision.playerCenteredControllerActive && (
          <KaelPlayerCenteredShadowController light={lightRef} target={shadowTarget} configuration={PLAY_SHADOW_ROUTE_CONFIG} allowDevModeOverride={false} />
        )}
      </Suspense>
      <RangeEffectsPools />
    </Canvas>
  );
}

/** Pauses the Rapier simulation whenever the match is paused — one authority freezes player + colliders together. Fixed timestep, matching the proven /v2/range Physics setup. */
function PausablePhysics({ children }: { children: React.ReactNode }) {
  const paused = useV2MatchStore((state) => state.phase === 'paused');
  return <Physics paused={paused}>{children}</Physics>;
}

/** Bright Skyfront sky — a vertical gradient dome so the arena reads against open sky, not a flat clear color. */
function SkyGradientBackground() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color(STORM.skyZenith) },
          midColor: { value: new THREE.Color(STORM.skyMid) },
          bottomColor: { value: new THREE.Color(STORM.skyHorizon) },
        },
        vertexShader: `
          varying vec3 vPos;
          void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
          varying vec3 vPos;
          uniform vec3 topColor; uniform vec3 midColor; uniform vec3 bottomColor;
          void main() {
            float h = normalize(vPos).y;
            vec3 c = h > 0.0 ? mix(midColor, topColor, h) : mix(midColor, bottomColor, -h);
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    [],
  );

  // Radius 200 keeps the dome inside the camera far plane (220) so it isn't
  // clipped; the custom ShaderMaterial ignores scene fog by design, and the
  // fog color equals this gradient's horizon stop (STORM.skyHorizon) so
  // fogged geometry blends seamlessly into the sky.
  return (
    <mesh scale={[200, 200, 200]} material={material}>
      <sphereGeometry args={[1, 24, 16]} />
    </mesh>
  );
}
