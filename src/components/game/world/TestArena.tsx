'use client';

import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { FLOOR, PILLARS, PLATFORMS, RAMPS, WALLS, stairBoxes } from '@shared/arena';

const PILLAR_ACCENTS = ['#00F5FF', '#FF7A00', '#7C5CFF'];

const CRATES: Array<[number, number, number]> = [
  [3, 2.5, 2],
  [3.8, 3.6, 2.2],
  [-5, 2.5, 1],
  [10, 3.5, -3],
];

const STAIRS = stairBoxes();

/**
 * Physical movement/combat arena, built from the shared layout data in
 * `shared/arena.ts` — the exact same boxes the server raycasts against
 * for shot occlusion, so cover behaves identically on both sides.
 * Dynamic crates are client-side flavor (excluded from server occlusion).
 */
export default function TestArena() {
  return (
    <group>
      {/* Floor */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[FLOOR.size[0] / 2, FLOOR.size[1] / 2, FLOOR.size[2] / 2]}
          position={FLOOR.position}
        />
        <mesh position={FLOOR.position} receiveShadow>
          <boxGeometry args={FLOOR.size} />
          <meshStandardMaterial color="#0b0f15" roughness={0.9} metalness={0.2} />
        </mesh>
      </RigidBody>

      {/* Perimeter walls */}
      {WALLS.map((wall, index) => (
        <RigidBody key={`wall-${index}`} type="fixed" colliders="cuboid">
          <mesh position={wall.position}>
            <boxGeometry args={wall.size} />
            <meshStandardMaterial color="#0d1118" roughness={0.85} metalness={0.3} />
          </mesh>
        </RigidBody>
      ))}

      {/* Platforms */}
      {PLATFORMS.map((platform, index) => (
        <RigidBody key={`platform-${index}`} type="fixed" colliders="cuboid">
          <mesh position={platform.position}>
            <boxGeometry args={platform.size} />
            <meshStandardMaterial color="#131a24" roughness={0.7} metalness={0.4} />
          </mesh>
        </RigidBody>
      ))}

      {/* Ramps */}
      {RAMPS.map((ramp, index) => (
        <RigidBody
          key={`ramp-${index}`}
          type="fixed"
          colliders="cuboid"
          position={ramp.position}
          rotation={ramp.rotation}
        >
          <mesh>
            <boxGeometry args={ramp.size} />
            <meshStandardMaterial color="#131a24" roughness={0.7} metalness={0.4} />
          </mesh>
        </RigidBody>
      ))}

      {/* Staircase (exercises the controller's autostep) */}
      <RigidBody type="fixed" colliders="cuboid">
        {STAIRS.map((step, index) => (
          <mesh key={`step-${index}`} position={step.position}>
            <boxGeometry args={step.size} />
            <meshStandardMaterial color="#10161f" roughness={0.75} metalness={0.35} />
          </mesh>
        ))}
      </RigidBody>

      {/* Pillars with neon accent strips */}
      {PILLARS.map((pillar, index) => (
        <group key={`pillar-${index}`}>
          <RigidBody type="fixed" colliders="cuboid">
            <mesh position={pillar.position}>
              <boxGeometry args={pillar.size} />
              <meshStandardMaterial color="#0d1118" roughness={0.8} metalness={0.3} />
            </mesh>
          </RigidBody>
          <mesh position={pillar.position}>
            <boxGeometry args={[pillar.size[0] + 0.04, 0.12, pillar.size[2] + 0.04]} />
            <meshStandardMaterial
              color="#020c0d"
              emissive={PILLAR_ACCENTS[index % PILLAR_ACCENTS.length]}
              emissiveIntensity={2}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* Pushable dynamic crates (character controller applies impulses) */}
      {CRATES.map((position, index) => (
        <RigidBody key={`crate-${index}`} type="dynamic" colliders="cuboid" position={position}>
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#1a2230" roughness={0.6} metalness={0.5} />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}
