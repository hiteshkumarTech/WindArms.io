'use client';

import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { MAPS } from '@shared/maps';
import { useMultiplayerStore } from '@/stores/multiplayerStore';

/**
 * Physical arena geometry, built from the active map's shared layout data
 * — the exact same boxes the server raycasts for shot occlusion, so cover
 * behaves identically on both sides. Keyed by map id: switching maps
 * remounts every rigid body, letting Rapier rebuild colliders cleanly.
 */
export default function TestArena() {
  const mapId = useMultiplayerStore((state) => state.mapId);
  const map = MAPS[mapId];
  const { theme } = map;

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
            <meshStandardMaterial color={theme.floorColor} roughness={0.9} metalness={0.2} />
          </mesh>
        </RigidBody>
      ) : null}

      {/* Perimeter walls */}
      {map.walls.map((wall, index) => (
        <RigidBody key={`wall-${index}`} type="fixed" colliders="cuboid">
          <mesh position={wall.position} userData={{ surface: theme.surfaceMaterial }}>
            <boxGeometry args={wall.size} />
            <meshStandardMaterial color={theme.structureColor} roughness={0.85} metalness={0.3} />
          </mesh>
        </RigidBody>
      ))}

      {/* Platforms */}
      {map.platforms.map((platform, index) => (
        <RigidBody key={`platform-${index}`} type="fixed" colliders="cuboid">
          <mesh position={platform.position} userData={{ surface: theme.surfaceMaterial }}>
            <boxGeometry args={platform.size} />
            <meshStandardMaterial color={theme.platformColor} roughness={0.7} metalness={0.4} />
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
          <mesh userData={{ surface: theme.surfaceMaterial }}>
            <boxGeometry args={ramp.size} />
            <meshStandardMaterial color={theme.platformColor} roughness={0.7} metalness={0.4} />
          </mesh>
        </RigidBody>
      ))}

      {/* Stairs */}
      <RigidBody type="fixed" colliders="cuboid">
        {map.stairs.map((step, index) => (
          <mesh key={`step-${index}`} position={step.position} userData={{ surface: theme.surfaceMaterial }}>
            <boxGeometry args={step.size} />
            <meshStandardMaterial color={theme.structureColor} roughness={0.75} metalness={0.35} />
          </mesh>
        ))}
      </RigidBody>

      {/* Obstacles with themed accent strips */}
      {map.obstacles.map((obstacle, index) => (
        <group key={`obstacle-${index}`}>
          <RigidBody type="fixed" colliders="cuboid">
            <mesh position={obstacle.position} userData={{ surface: theme.surfaceMaterial }}>
              <boxGeometry args={obstacle.size} />
              <meshStandardMaterial color={theme.structureColor} roughness={0.8} metalness={0.3} />
            </mesh>
          </RigidBody>
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
      {map.crates.map((position, index) => (
        <RigidBody key={`crate-${index}`} type="dynamic" colliders="cuboid" position={position}>
          <mesh userData={{ surface: 'wood' }}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={theme.platformColor} roughness={0.6} metalness={0.5} />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}
