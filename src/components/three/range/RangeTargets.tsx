'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';
import type { TargetUserData } from '@/lib/v2/combat/targets';

/** Re-exported for existing importers — the contract itself moved to lib/v2/combat/targets.ts (Milestone 6) so drones share it. */
export type { TargetUserData };

const TARGET_DEFS: Array<{ id: string; position: [number, number, number]; maxHp: number }> = [
  { id: 'near', position: [-3, 1.6, -12], maxHp: 30 },
  { id: 'mid-left', position: [-5, 1.6, -20], maxHp: 30 },
  { id: 'mid-right', position: [4, 1.6, -22], maxHp: 30 },
  { id: 'far', position: [1, 1.8, -32], maxHp: 45 },
  { id: 'longshot', position: [-2, 2.1, -42], maxHp: 45 },
];

const RESPAWN_MS = 2600;
const RADIUS = 0.55;

/**
 * The range's hittable targets — real hit/destroy/respawn behavior driven
 * directly by VortexFireSystem's raycast (which mutates `userData` on this
 * exact mesh instance), not a placeholder. This is a functional test
 * harness for damage/raycast/hit-detection, not a new content "map" in the
 * project's Skyfront-POI sense — out of this task's scope per the brief.
 */
export default function RangeTargets() {
  const refs = useRef<Array<THREE.Mesh | null>>([]);

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STORM.slate, emissive: STORM.energy, emissiveIntensity: 0.15, metalness: 0.4, roughness: 0.5 }),
    [],
  );

  useFrame(() => {
    const now = performance.now();
    for (const mesh of refs.current) {
      if (!mesh) continue;
      const data = mesh.userData as TargetUserData;

      if (data.destroyedAt !== 0) {
        if (now - data.destroyedAt >= RESPAWN_MS) {
          data.hp = data.maxHp;
          data.isTarget = true;
          data.destroyedAt = 0;
          mesh.visible = true;
          mesh.scale.setScalar(1);
        } else {
          const t = (now - data.destroyedAt) / 220;
          mesh.scale.setScalar(Math.max(0, 1 - t));
          if (t >= 1) mesh.visible = false;
        }
        continue;
      }

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = now < data.hitFlashUntil ? 1.6 : 0.15;
    }
  });

  return (
    <group>
      {TARGET_DEFS.map((target, index) => (
        <mesh
          key={target.id}
          ref={(mesh) => {
            refs.current[index] = mesh;
          }}
          position={target.position}
          material={material}
          castShadow
          userData={{ isTarget: true, hp: target.maxHp, maxHp: target.maxHp, hitFlashUntil: 0, destroyedAt: 0 } satisfies TargetUserData}
        >
          <icosahedronGeometry args={[RADIUS, 1]} />
        </mesh>
      ))}
    </group>
  );
}
