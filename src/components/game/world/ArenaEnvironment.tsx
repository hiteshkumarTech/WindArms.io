'use client';

import { Grid } from '@react-three/drei';
import { MAPS } from '@shared/maps';
import CitySkyline from '@/components/three/scene/CitySkyline';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import AmbientParticles from './AmbientParticles';

/**
 * Non-physical scene dressing driven entirely by the active map's theme:
 * fog, lighting rig, floor grid, ambient particles and (for city maps)
 * the instanced skyline. Keyed by map id so switching maps rebuilds the
 * whole rig cleanly.
 */
export default function ArenaEnvironment() {
  const mapId = useMultiplayerStore((state) => state.mapId);
  const { theme } = MAPS[mapId];

  return (
    <group key={mapId}>
      <fog attach="fog" args={[theme.fogColor, theme.fogNear, theme.fogFar]} />

      <ambientLight intensity={theme.ambientIntensity} />
      <directionalLight
        position={theme.directional.position}
        intensity={theme.directional.intensity}
        color={theme.directional.color}
      />
      {theme.pointLights.map((light, index) => (
        <pointLight
          key={index}
          position={light.position}
          intensity={light.intensity}
          distance={light.distance}
          decay={2}
          color={light.color}
        />
      ))}

      {theme.showSkyline ? (
        <>
          <group position={[0, 0, -42]}>
            <CitySkyline />
          </group>
          <group position={[0, 0, 46]} rotation={[0, Math.PI, 0]}>
            <CitySkyline />
          </group>
        </>
      ) : null}

      <Grid
        position={[0, 0.02, 0]}
        args={[60, 60]}
        cellSize={1}
        sectionSize={5}
        cellThickness={0.5}
        sectionThickness={1}
        cellColor={theme.gridCellColor}
        sectionColor={theme.gridSectionColor}
        fadeDistance={70}
        fadeStrength={1.5}
      />

      <AmbientParticles preset={theme.particles} />
    </group>
  );
}
