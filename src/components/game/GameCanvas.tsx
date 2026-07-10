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
import HeatDistortionPool from './weapons/HeatDistortionPool';
import MuzzleSmokePool from './weapons/MuzzleSmokePool';
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
      onCreated={({ gl, camera }) => {
        gl.setClearColor('#050505');
        // Layer 1 carries the first-person viewmodel (see WeaponViewmodel) —
        // the main camera needs it explicitly enabled since layer 0 alone
        // wouldn't render it, while reflection/mirror cameras elsewhere
        // (Cyber City's floor) stay layer-0-only and never see it.
        camera.layers.enable(1);
        onCanvasReady(gl.domElement);
      }}
    >
      <PerformanceMonitor
        // Default bounds ([40, 60]) leave only a 20fps gap between the
        // decline and incline triggers, but dropping to 'low' quality cuts
        // a large chunk of render cost in one step (shadows, post-fx,
        // weather, reflections) — enough to swing FPS from ~35 straight
        // past 60 in the very next sampling window. That immediately
        // re-triggers onIncline, which re-adds the cost, which drops FPS
        // again: a self-sustaining hunting oscillation, not a transient
        // dip. Widening the gap (must be genuinely struggling to drop,
        // genuinely comfortable to restore) gives the tier room to settle
        // instead of flapping every ~2.5-5s during sustained combat.
        bounds={(refreshrate) => (refreshrate > 100 ? [60, 100] : [30, 58])}
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
        {/* Mounted (and its useFrame subscribed) before PlayerController so the
            viewKick it writes on a shot is drained by the camera the same tick
            it's fired, instead of landing one frame late behind mount order. */}
        <WeaponSystem />
        <Physics gravity={[0, -24, 0]} timeStep="vary">
          <TestArena />
          <PlayerController />
        </Physics>
        <RemotePlayers />
        <NetworkSync />
        <WeaponViewmodel />
        <TracerPool />
        <ShellCasingPool />
        <MuzzleSmokePool />
        <ExplosionPool />
        <DamageNumbers />
        {highQuality ? <HeatDistortionPool /> : null}
        {highQuality ? <GameEffects /> : null}
      </Suspense>
    </Canvas>
  );
}
