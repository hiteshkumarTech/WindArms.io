'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import NetworkSync from './multiplayer/NetworkSync';
import RemotePlayers from './multiplayer/RemotePlayers';
import PlayerController from './player/PlayerController';
import TracerPool from './weapons/TracerPool';
import WeaponSystem from './weapons/WeaponSystem';
import WeaponViewmodel from './weapons/WeaponViewmodel';
import ArenaEnvironment from './world/ArenaEnvironment';
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
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 75, near: 0.05, far: 150, position: [0, 2, 10] }}
      onCreated={({ gl }) => {
        gl.setClearColor('#050505');
        onCanvasReady(gl.domElement);
      }}
    >
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
      </Suspense>
    </Canvas>
  );
}
