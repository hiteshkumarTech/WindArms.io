'use client';

import { Grid } from '@react-three/drei';
import CitySkyline from '@/components/three/scene/CitySkyline';

/**
 * Non-physical scene dressing: fog, lighting rig, neon floor grid and the
 * instanced city skyline (reused from the landing scene) behind the walls.
 * Rendered outside <Physics> — nothing here has colliders.
 */
export default function ArenaEnvironment() {
  return (
    <>
      <fog attach="fog" args={['#050505', 30, 110]} />

      <ambientLight intensity={0.45} />
      <directionalLight position={[12, 18, 8]} intensity={1.3} color="#cfeeff" />
      <pointLight position={[0, 8, 0]} intensity={60} distance={40} decay={2} color="#00F5FF" />
      <pointLight position={[-16, 6, -16]} intensity={40} distance={30} decay={2} color="#FF7A00" />
      <pointLight position={[16, 6, 16]} intensity={40} distance={30} decay={2} color="#7C5CFF" />

      <group position={[0, 0, -42]}>
        <CitySkyline />
      </group>
      <group position={[0, 0, 46]} rotation={[0, Math.PI, 0]}>
        <CitySkyline />
      </group>

      <Grid
        position={[0, 0.02, 0]}
        args={[60, 60]}
        cellSize={1}
        sectionSize={5}
        cellThickness={0.5}
        sectionThickness={1}
        cellColor="#0e2f33"
        sectionColor="#00F5FF"
        fadeDistance={70}
        fadeStrength={1.5}
      />
    </>
  );
}
