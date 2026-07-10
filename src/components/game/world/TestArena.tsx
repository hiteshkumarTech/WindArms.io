'use client';

import { useMemo } from 'react';
import { MeshReflectorMaterial } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { supportBeamsFor } from '@shared/arena';
import { MAPS } from '@shared/maps';
import { createRng } from '@/lib/utils';
import { useVariedBoxGeometries } from '@/lib/three/variedGeometry';
import { useGraphicsStore } from '@/stores/graphicsStore';
import { useMultiplayerStore } from '@/stores/multiplayerStore';

const UNIT_BOX = { size: [1, 1, 1] as [number, number, number] };

/**
 * Physical arena geometry, built from the active map's shared layout data
 * — the exact same boxes the server raycasts for shot occlusion, so cover
 * behaves identically on both sides. Keyed by map id: switching maps
 * remounts every rigid body, letting Rapier rebuild colliders cleanly.
 *
 * Every structural mesh below wears a baked per-face vertex-color jitter
 * (`useVariedBoxGeometries`) instead of one flat MeshStandardMaterial
 * color — breaks up the classic gray-box look at zero shader risk, since
 * it rides `vertexColors`, a first-class MeshStandardMaterial feature.
 */
export default function TestArena() {
  const mapId = useMultiplayerStore((state) => state.mapId);
  const map = MAPS[mapId];
  const { theme } = map;
  const highQuality = useGraphicsStore((state) => state.quality === 'high');
  const reflective = Boolean(theme.reflectiveFloor) && highQuality;

  const wallGeometries = useVariedBoxGeometries(map.walls, 1000);
  const platformGeometries = useVariedBoxGeometries(map.platforms, 2000);
  const rampGeometries = useVariedBoxGeometries(map.ramps, 3000);
  const stairGeometries = useVariedBoxGeometries(map.stairs, 4000);
  const obstacleGeometries = useVariedBoxGeometries(map.obstacles, 5000);
  const crateBoxes = useMemo(() => map.crates.map(() => UNIT_BOX), [map.crates]);
  const crateGeometries = useVariedBoxGeometries(crateBoxes, 6000);

  // Purely cosmetic struts under elevated platforms/ramps so they read as
  // supported rather than levitating — never fed into server occlusion.
  const groundY = map.floor ? map.floor.position[1] + map.floor.size[1] / 2 : (map.killPlaneY ?? -8) + 0.5;
  const beams = useMemo(() => supportBeamsFor([...map.platforms, ...map.ramps], groundY), [map, groundY]);
  const beamGeometries = useVariedBoxGeometries(beams, 7000, 0.05);

  // Per-crate size/rotation variety, seeded — the most repeated prop in
  // every map no longer reads as pixel-identical copies of one box.
  const crateVariants = useMemo(
    () =>
      map.crates.map((_, i) => {
        const rng = createRng(8000 + i * 53);
        return { scale: 0.9 + rng() * 0.25, yRot: rng() * Math.PI * 2 };
      }),
    [map.crates],
  );

  return (
    <group key={mapId}>
      {/* Floor — omitted on floating maps, where a fall means death */}
      {map.floor ? (
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider
            args={[map.floor.size[0] / 2, map.floor.size[1] / 2, map.floor.size[2] / 2]}
            position={map.floor.position}
          />
          <mesh position={map.floor.position} userData={{ surface: theme.surfaceMaterial }} receiveShadow>
            <boxGeometry args={map.floor.size} />
            {reflective ? (
              <MeshReflectorMaterial
                resolution={512}
                mirror={0.35}
                mixBlur={4}
                mixStrength={2.2}
                roughness={0.35}
                metalness={0.5}
                color={theme.floorColor}
                depthScale={0.4}
                minDepthThreshold={0.85}
                maxDepthThreshold={1}
              />
            ) : (
              <meshStandardMaterial color={theme.floorColor} roughness={0.9} metalness={0.2} />
            )}
          </mesh>
        </RigidBody>
      ) : null}

      {/* Perimeter walls */}
      {map.walls.map((wall, index) => (
        <RigidBody key={`wall-${index}`} type="fixed" colliders="cuboid">
          <mesh position={wall.position} userData={{ surface: theme.surfaceMaterial }} castShadow receiveShadow>
            <primitive object={wallGeometries[index]} attach="geometry" />
            <meshStandardMaterial color={theme.structureColor} roughness={0.85} metalness={0.3} vertexColors />
          </mesh>
        </RigidBody>
      ))}

      {/* Platforms */}
      {map.platforms.map((platform, index) => (
        <RigidBody key={`platform-${index}`} type="fixed" colliders="cuboid">
          <mesh position={platform.position} userData={{ surface: theme.surfaceMaterial }} castShadow receiveShadow>
            <primitive object={platformGeometries[index]} attach="geometry" />
            <meshStandardMaterial color={theme.platformColor} roughness={0.7} metalness={0.4} vertexColors />
          </mesh>
        </RigidBody>
      ))}

      {/* Ramps */}
      {map.ramps.map((ramp, index) => (
        <RigidBody
          key={`ramp-${index}`}
          type="fixed"
          colliders="cuboid"
          position={ramp.position}
          rotation={ramp.rotation}
        >
          <mesh userData={{ surface: theme.surfaceMaterial }} castShadow receiveShadow>
            <primitive object={rampGeometries[index]} attach="geometry" />
            <meshStandardMaterial color={theme.platformColor} roughness={0.7} metalness={0.4} vertexColors />
          </mesh>
        </RigidBody>
      ))}

      {/* Stairs */}
      <RigidBody type="fixed" colliders="cuboid">
        {map.stairs.map((step, index) => (
          <mesh
            key={`step-${index}`}
            position={step.position}
            userData={{ surface: theme.surfaceMaterial }}
            castShadow
            receiveShadow
          >
            <primitive object={stairGeometries[index]} attach="geometry" />
            <meshStandardMaterial color={theme.structureColor} roughness={0.75} metalness={0.35} vertexColors />
          </mesh>
        ))}
      </RigidBody>

      {/* Obstacles with themed accent strips */}
      {map.obstacles.map((obstacle, index) => (
        <group key={`obstacle-${index}`}>
          <RigidBody type="fixed" colliders="cuboid">
            <mesh
              position={obstacle.position}
              userData={{ surface: theme.surfaceMaterial }}
              castShadow
              receiveShadow
            >
              <primitive object={obstacleGeometries[index]} attach="geometry" />
              <meshStandardMaterial color={theme.structureColor} roughness={0.8} metalness={0.3} vertexColors />
            </mesh>
          </RigidBody>
          {/* Thin emissive strip — skips shadows, it's paper-thin and self-lit */}
          <mesh position={obstacle.position} userData={{ surface: theme.surfaceMaterial }}>
            <boxGeometry
              args={[obstacle.size[0] + 0.04, Math.min(0.12, obstacle.size[1] * 0.2), obstacle.size[2] + 0.04]}
            />
            <meshStandardMaterial
              color="#020c0d"
              emissive={theme.accents[index % theme.accents.length]}
              emissiveIntensity={2}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* Pushable dynamic crates — always wood, regardless of map material */}
      {map.crates.map((position, index) => {
        const variant = crateVariants[index];
        return (
          <RigidBody
            key={`crate-${index}`}
            type="dynamic"
            colliders="cuboid"
            position={position}
            rotation={[0, variant.yRot, 0]}
          >
            <mesh userData={{ surface: 'wood' }} castShadow receiveShadow scale={variant.scale}>
              <primitive object={crateGeometries[index]} attach="geometry" />
              <meshStandardMaterial color={theme.platformColor} roughness={0.6} metalness={0.5} vertexColors />
            </mesh>
          </RigidBody>
        );
      })}

      {/* Support struts under elevated platforms/ramps — cosmetic only, no collider */}
      {beams.map((beam, index) => (
        <mesh key={`beam-${index}`} position={beam.position} castShadow userData={{ surface: theme.surfaceMaterial }}>
          <primitive object={beamGeometries[index]} attach="geometry" />
          <meshStandardMaterial color={theme.structureColor} roughness={0.6} metalness={0.5} vertexColors />
        </mesh>
      ))}
    </group>
  );
}
