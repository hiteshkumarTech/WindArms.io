'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { PLAYER } from '@/lib/game/constants';
import { STORM } from '@/lib/v2/tokens';
import type { RangeInputSnapshot } from '@/lib/v2/range/useRangeKeyboardInput';
import RangeController from './RangeController';
import RangeEffectsPools from './RangeEffectsPools';
import RangeEnvironment from './RangeEnvironment';
import RangeTargets from './RangeTargets';
import VortexFireSystem from './VortexFireSystem';
import VortexViewmodel from '@/components/three/weapons/VortexViewmodel';

/**
 * Canvas contents for the V2 weapon range (`/v2/range`) — the playable
 * vertical slice for the Vortex Rifle. Separate scene tree from v1's
 * `/play` and from the V2 landing page's `StormBackdrop`; nothing here is
 * imported by, or imports from, either.
 */
export default function RangeScene({ inputRef }: { inputRef: React.MutableRefObject<RangeInputSnapshot> }) {
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ fov: PLAYER.FOV_BASE, near: 0.05, far: 200, position: [0, 3 + PLAYER.EYE_STAND, 10] }}>
      <color attach="background" args={[STORM.abyss]} />
      <fog attach="fog" args={[STORM.abyss, 25, 90]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[12, 22, 8]} intensity={1.3} castShadow shadow-mapSize={[1024, 1024]} />
      <hemisphereLight args={[STORM.skyMid, STORM.abyss, 0.4]} />

      <Physics>
        <RangeEnvironment />
        <RangeController inputRef={inputRef} />
      </Physics>

      <RangeTargets />
      <VortexFireSystem inputRef={inputRef} />
      <Suspense fallback={null}>
        <VortexViewmodel />
      </Suspense>
      <RangeEffectsPools />
    </Canvas>
  );
}
