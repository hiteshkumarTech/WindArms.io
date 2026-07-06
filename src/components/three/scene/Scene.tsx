'use client';

import { Float, Grid } from '@react-three/drei';
import CameraRig from './CameraRig';
import CitySkyline from './CitySkyline';
import Effects from './Effects';
import Embers from './Embers';
import LightRays from './LightRays';
import Rain from './Rain';
import Rifle from './Rifle';
import Smoke from './Smoke';

interface SceneProps {
  reducedMotion: boolean;
}

/**
 * Cinematic arena backdrop: fogged cyber-city skyline, neon grid floor,
 * volumetric light rays, drifting smoke, embers and rain, with the hero
 * assault rifle floating on the right side of frame.
 */
export default function Scene({ reducedMotion }: SceneProps) {
  return (
    <>
      <fog attach="fog" args={['#050505', 9, 38]} />

      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 9, 5]} intensity={1.4} color="#cfeeff" />
      <pointLight position={[4.5, 2.4, 5]} intensity={36} distance={16} decay={2} color="#00F5FF" />
      <pointLight position={[-5, 1.5, 2]} intensity={26} distance={15} decay={2} color="#7C5CFF" />
      <pointLight position={[0.5, -0.5, 4]} intensity={14} distance={10} decay={2} color="#FF7A00" />

      <CitySkyline />
      <Grid
        position={[0, -1.35, 0]}
        infiniteGrid
        cellSize={0.7}
        sectionSize={3.5}
        cellThickness={0.5}
        sectionThickness={1}
        cellColor="#0e2f33"
        sectionColor="#00F5FF"
        fadeDistance={34}
        fadeStrength={2.2}
      />

      <LightRays reducedMotion={reducedMotion} />
      <Smoke reducedMotion={reducedMotion} />
      <Embers reducedMotion={reducedMotion} />
      <Rain reducedMotion={reducedMotion} />

      <group position={[2.7, 0.9, 3]} rotation={[0, -0.5, 0]}>
        <Float
          speed={reducedMotion ? 0 : 1.3}
          rotationIntensity={0.3}
          floatIntensity={0.8}
          floatingRange={[-0.12, 0.12]}
        >
          <Rifle reducedMotion={reducedMotion} />
        </Float>
      </group>

      <CameraRig reducedMotion={reducedMotion} />
      <Effects />
    </>
  );
}
