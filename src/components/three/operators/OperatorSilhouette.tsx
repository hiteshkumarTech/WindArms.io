'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';

/**
 * Procedural fallback mannequin — what an operator slot renders before its
 * GLB exists (Phase 6) or while it streams in. Same role ProceduralAeolus
 * plays for the weapon slots and the hero capsules play in the v1 game:
 * the established resolve-or-fallback pattern, not a fake asset.
 *
 * Deliberately reads as an armory display mannequin, not a low-effort
 * character: dark glass body, marble chest plate, single emissive accent
 * trim in the operator's identity color, subtle breathing. Rounded
 * primitives only — no naked rectangles (2026-07-16 art directive).
 *
 * ~1.8 m tall, feet at local origin, facing -Z (project rig convention —
 * see pipeline/sockets.ts's socketWorldDirection).
 */
interface SilhouetteMaterials {
  body: THREE.MeshStandardMaterial;
  plate: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  visor: THREE.MeshStandardMaterial;
}

function createMaterials(accent: string): SilhouetteMaterials {
  return {
    body: new THREE.MeshStandardMaterial({ color: STORM.slate, metalness: 0.55, roughness: 0.4 }),
    plate: new THREE.MeshStandardMaterial({ color: '#E9E5DB', metalness: 0.3, roughness: 0.42 }),
    trim: new THREE.MeshStandardMaterial({
      color: '#0a1a24',
      emissive: new THREE.Color(accent),
      emissiveIntensity: 1.9,
      toneMapped: false,
    }),
    visor: new THREE.MeshStandardMaterial({
      color: '#0e2330',
      emissive: new THREE.Color(accent),
      emissiveIntensity: 1.1,
      metalness: 0.2,
      roughness: 0.15,
    }),
  };
}

export interface OperatorSilhouetteProps {
  /** Operator identity color (OperatorContent.accent). */
  accent: string;
  /** Disables the breathing motion. */
  reducedMotion?: boolean;
}

export default function OperatorSilhouette({ accent, reducedMotion = false }: OperatorSilhouetteProps) {
  const materials = useMemo(() => createMaterials(accent), [accent]);
  const chestRef = useRef<THREE.Group>(null);

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
    },
    [materials],
  );

  useFrame(({ clock }) => {
    if (reducedMotion || !chestRef.current) return;
    const breathe = Math.sin(clock.elapsedTime * 1.4) * 0.008;
    chestRef.current.position.y = 1.12 + breathe;
  });

  return (
    <group name="operator_silhouette">
      {/* Legs */}
      {[-0.11, 0.11].map((x) => (
        <group key={`leg-${x}`}>
          <mesh material={materials.body} position={[x, 0.72, 0]}>
            <capsuleGeometry args={[0.075, 0.46, 4, 12]} />
          </mesh>
          <mesh material={materials.body} position={[x, 0.28, -0.01]}>
            <capsuleGeometry args={[0.062, 0.38, 4, 12]} />
          </mesh>
          {/* Boot */}
          <mesh material={materials.plate} position={[x, 0.06, -0.04]}>
            <capsuleGeometry args={[0.07, 0.12, 4, 10]} />
          </mesh>
        </group>
      ))}

      {/* Pelvis + belt trim */}
      <mesh material={materials.body} position={[0, 1.0, 0]}>
        <capsuleGeometry args={[0.155, 0.1, 4, 14]} />
      </mesh>
      <mesh material={materials.trim} position={[0, 0.97, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.165, 0.012, 8, 24]} />
      </mesh>

      {/* Torso group (breathes) */}
      <group ref={chestRef} position={[0, 1.12, 0]}>
        <mesh material={materials.body} position={[0, 0.22, 0]}>
          <capsuleGeometry args={[0.175, 0.3, 4, 16]} />
        </mesh>
        {/* Marble chest plate */}
        <mesh material={materials.plate} position={[0, 0.26, -0.09]}>
          <capsuleGeometry args={[0.13, 0.2, 4, 14]} />
        </mesh>
        {/* Accent core line */}
        <mesh material={materials.trim} position={[0, 0.26, -0.155]}>
          <capsuleGeometry args={[0.016, 0.2, 4, 8]} />
        </mesh>

        {/* Shoulders + arms */}
        {[-1, 1].map((side) => (
          <group key={`arm-${side}`} position={[side * 0.24, 0.42, 0]}>
            <mesh material={materials.plate}>
              <sphereGeometry args={[0.085, 14, 12]} />
            </mesh>
            <mesh material={materials.body} position={[side * 0.045, -0.24, 0]} rotation={[0, 0, side * 0.12]}>
              <capsuleGeometry args={[0.055, 0.3, 4, 12]} />
            </mesh>
            <mesh material={materials.body} position={[side * 0.075, -0.52, -0.03]} rotation={[0.1, 0, side * 0.08]}>
              <capsuleGeometry args={[0.047, 0.26, 4, 12]} />
            </mesh>
            {/* Hand */}
            <mesh material={materials.body} position={[side * 0.09, -0.7, -0.05]}>
              <sphereGeometry args={[0.05, 10, 10]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Neck + head */}
      <mesh material={materials.body} position={[0, 1.56, 0]}>
        <capsuleGeometry args={[0.045, 0.05, 4, 10]} />
      </mesh>
      <mesh material={materials.body} position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.105, 18, 16]} />
      </mesh>
      {/* Visor band, facing -Z */}
      <mesh material={materials.visor} position={[0, 1.71, -0.075]} rotation={[0.06, 0, 0]}>
        <capsuleGeometry args={[0.028, 0.09, 4, 10]} />
      </mesh>
    </group>
  );
}
