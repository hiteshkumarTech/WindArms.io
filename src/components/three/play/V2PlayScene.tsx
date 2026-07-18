'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { PLAYER } from '@/lib/game/constants';
import { STORM } from '@/lib/v2/tokens';
import type { RangeInputSnapshot } from '@/lib/v2/range/useRangeKeyboardInput';
import RangeEffectsPools from '@/components/three/range/RangeEffectsPools';
import VortexFireSystem from '@/components/three/weapons/VortexFireSystem';
import VortexViewmodel from '@/components/three/weapons/VortexViewmodel';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';
import { PLAYER_SPAWN } from '@/lib/v2/play/spawnConfig';
import MatchDirector from './MatchDirector';
import PlayerController from './PlayerController';
import SkyfrontTrialArena from './SkyfrontTrialArena';
import WindLift from './WindLift';
import DroneSquad from './DroneSquad';

/**
 * Canvas contents for `/v2/play` — the Skyfront Trial (Milestone 6). Its
 * own scene tree, wholly separate from `/play` (v1) and `/v2/range`.
 * Reuses, unchanged: the shared VortexFireSystem + VortexViewmodel (real
 * Vortex Rifle LOD1 via the pipeline), RangeEffectsPools (tracers/impacts/
 * casings), the lib/game movement core (through PlayerController). New: the
 * match director/clock, the Skyfront arena blockout, the Wind Lift, and the
 * drone squad.
 *
 * Physics is paused with the match (`paused`/menus) so drones, bolts and the
 * player all freeze together from one authority. The combat gate ref is
 * created here and threaded to both the director (which sets it) and the
 * fire system (which reads it) so weapon input is match-aware without the
 * fire system knowing anything about the match.
 */
export default function V2PlayScene({ inputRef }: { inputRef: React.MutableRefObject<RangeInputSnapshot> }) {
  const combatGateRef = useRef(false);

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
        position={[16, 26, 10]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

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
