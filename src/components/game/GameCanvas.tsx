'use client';

import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { useGraphicsStore } from '@/stores/graphicsStore';
import NetworkSync from './multiplayer/NetworkSync';
import RemotePlayers from './multiplayer/RemotePlayers';
import PlayerController from './player/PlayerController';
import DamageNumbers from './weapons/DamageNumbers';
import ExplosionPool from './weapons/ExplosionPool';
import ShellCasingPool from './weapons/ShellCasingPool';
import TracerPool from './weapons/TracerPool';
import WeaponSystem from './weapons/WeaponSystem';
import WeaponViewmodel from './weapons/WeaponViewmodel';
import ArenaEnvironment from './world/ArenaEnvironment';
import GameEffects from './world/GameEffects';
import TestArena from './world/TestArena';

interface GameCanvasProps {
  /** Receives the WebGL canvas element so the shell can request pointer lock on it. */
  onCanvasReady: (element: HTMLCanvasElement) => void;
}

/**
 * Game viewport. Physics steps with a variable timestep synced to the
 * render loop — correct for a kinematic controller whose movement is
 * integrated per-frame. Suspense gates the async Rapier WASM init.
 * Remote players are render-only (no colliders until the combat phase).
 */
export default function GameCanvas({ onCanvasReady }: GameCanvasProps) {
  // Adaptive resolution: drop to 1.0 DPR under sustained load, recover when
  // headroom returns — frame rate beats pixel density in a shooter.
  const [dpr, setDpr] = useState(1.5);
  const quality = useGraphicsStore((state) => state.quality);
  const setQuality = useGraphicsStore((state) => state.setQuality);
  const highQuality = quality === 'high';

  return (
    <Canvas
      dpr={dpr}
      shadows={highQuality ? 'soft' : false}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 75, near: 0.05, far: 150, position: [0, 2, 10] }}
      onCreated={({ gl }) => {
        gl.setClearColor('#050505');
        onCanvasReady(gl.domElement);
      }}
    >
      <PerformanceMonitor
        onDecline={() => {
          setDpr(1);
          setQuality('low');
        }}
        onIncline={() => {
          setDpr(1.5);
          setQuality('high');
        }}
      />
      <Suspense fallback={null}>
        <ArenaEnvironment />
        <Physics gravity={[0, -24, 0]} timeStep="vary">
          <TestArena />
          <PlayerController />
        </Physics>
        <RemotePlayers />
        <NetworkSync />
        <WeaponSystem />
        <WeaponViewmodel />
        <TracerPool />
        <ShellCasingPool />
        <ExplosionPool />
        <DamageNumbers />
        {highQuality ? <GameEffects /> : null}
      </Suspense>
    </Canvas>
  );
}
