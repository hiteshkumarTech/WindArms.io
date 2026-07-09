'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import { MAPS } from '@shared/maps';
import CitySkyline from '@/components/three/scene/CitySkyline';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import AmbientParticles from './AmbientParticles';
import SkyDome from './SkyDome';

/**
 * Non-physical scene dressing driven entirely by the active map's theme:
 * procedural sky dome, fog, lighting rig, ground grid, ambient particles and
 * (for city maps) the instanced skyline. Keyed by map id so switching maps
 * rebuilds the whole rig cleanly. Floating maps drop the ground grid and
 * raise exposure for a brighter, open-air read.
 */
export default function ArenaEnvironment() {
  const mapId = useMultiplayerStore((state) => state.mapId);
  const map = MAPS[mapId];
  const { theme } = map;
  const gl = useThree((state) => state.gl);

  // Per-map tone-mapping exposure — bright maps read hotter. Restored on unmount.
  useEffect(() => {
    const previous = gl.toneMappingExposure;
    gl.toneMappingExposure = theme.exposure ?? 1;
    return () => {
      gl.toneMappingExposure = previous;
    };
  }, [gl, theme.exposure]);

  return (
    <group key={mapId}>
      <SkyDome colors={theme.sky} />
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

      {map.floor ? (
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
      ) : null}

      <AmbientParticles preset={theme.particles} />
    </group>
  );
}
