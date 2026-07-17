'use client';

import { RigidBody } from '@react-three/rapier';
import { STORM } from '@/lib/v2/tokens';

/**
 * Minimal enclosed test range — floor, four boundary walls, nothing else.
 * This is functional test geometry for verifying raycast/movement/collision,
 * not a new content "map" in the project's Skyfront-POI sense (out of this
 * task's explicit scope: "no new maps"). Kept deliberately plain.
 */
export default function RangeEnvironment() {
  const wallMaterialProps = { color: STORM.slate, roughness: 0.85, metalness: 0.1 } as const;

  return (
    <group>
      <RigidBody type="fixed" colliders="cuboid" friction={1}>
        <mesh receiveShadow position={[0, -0.05, -20]}>
          <boxGeometry args={[36, 0.1, 80]} />
          <meshStandardMaterial color={STORM.abyss} roughness={0.95} />
        </mesh>
      </RigidBody>

      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[-18, 4, -20]} castShadow receiveShadow>
          <boxGeometry args={[0.6, 8, 80]} />
          <meshStandardMaterial {...wallMaterialProps} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[18, 4, -20]} castShadow receiveShadow>
          <boxGeometry args={[0.6, 8, 80]} />
          <meshStandardMaterial {...wallMaterialProps} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 4, -59]} castShadow receiveShadow>
          <boxGeometry args={[36, 8, 0.6]} />
          <meshStandardMaterial {...wallMaterialProps} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 4, 19]} castShadow receiveShadow>
          <boxGeometry args={[36, 8, 0.6]} />
          <meshStandardMaterial {...wallMaterialProps} />
        </mesh>
      </RigidBody>
    </group>
  );
}
