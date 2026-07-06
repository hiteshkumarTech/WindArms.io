'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface RifleProps {
  reducedMotion: boolean;
}

/**
 * Procedural futuristic assault rifle assembled from primitives.
 * Emissive strips are excluded from tone mapping so the bloom pass
 * picks them up as neon energy accents. Rotates slowly on Y.
 */
export default function Rifle({ reducedMotion }: RifleProps) {
  const groupRef = useRef<THREE.Group>(null);

  const materials = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: '#181c24', metalness: 0.88, roughness: 0.34 }),
      dark: new THREE.MeshStandardMaterial({ color: '#0c0f14', metalness: 0.75, roughness: 0.5 }),
      accentCyan: new THREE.MeshStandardMaterial({
        color: '#021517',
        emissive: new THREE.Color('#00F5FF'),
        emissiveIntensity: 2.4,
        metalness: 0.2,
        roughness: 0.35,
        toneMapped: false,
      }),
      accentOrange: new THREE.MeshStandardMaterial({
        color: '#1a0c02',
        emissive: new THREE.Color('#FF7A00'),
        emissiveIntensity: 2.8,
        metalness: 0.2,
        roughness: 0.4,
        toneMapped: false,
      }),
    }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
    },
    [materials],
  );

  useFrame((_, delta) => {
    if (reducedMotion || !groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.28;
  });

  return (
    <group ref={groupRef} scale={0.72}>
      {/* Receiver */}
      <mesh material={materials.body}>
        <boxGeometry args={[2.2, 0.36, 0.22]} />
      </mesh>
      {/* Top rail */}
      <mesh material={materials.dark} position={[0.1, 0.26, 0]}>
        <boxGeometry args={[1.9, 0.08, 0.16]} />
      </mesh>
      {/* Handguard */}
      <mesh material={materials.dark} position={[1.05, 0.02, 0]}>
        <boxGeometry args={[0.9, 0.24, 0.26]} />
      </mesh>
      {/* Barrel */}
      <mesh material={materials.dark} position={[1.85, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.9, 16]} />
      </mesh>
      {/* Suppressor */}
      <mesh material={materials.body} position={[2.42, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.085, 0.085, 0.42, 16]} />
      </mesh>
      {/* Muzzle energy ring */}
      <mesh material={materials.accentCyan} position={[2.64, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.088, 0.088, 0.03, 16]} />
      </mesh>
      {/* Stock */}
      <mesh material={materials.body} position={[-1.35, -0.02, 0]}>
        <boxGeometry args={[0.55, 0.3, 0.18]} />
      </mesh>
      <mesh material={materials.dark} position={[-1.62, 0.12, 0]}>
        <boxGeometry args={[0.22, 0.1, 0.16]} />
      </mesh>
      {/* Grip */}
      <mesh material={materials.dark} position={[-0.45, -0.36, 0]} rotation={[0, 0, 0.32]}>
        <boxGeometry args={[0.16, 0.42, 0.16]} />
      </mesh>
      {/* Magazine */}
      <mesh material={materials.body} position={[0.18, -0.44, 0]} rotation={[0, 0, -0.16]}>
        <boxGeometry args={[0.2, 0.55, 0.18]} />
      </mesh>
      {/* Scope mount and tube */}
      <mesh material={materials.dark} position={[0.15, 0.36, 0]}>
        <boxGeometry args={[0.14, 0.12, 0.12]} />
      </mesh>
      <mesh material={materials.body} position={[0.15, 0.47, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, 0.55, 16]} />
      </mesh>
      {/* Scope lens */}
      <mesh material={materials.accentCyan} position={[0.44, 0.47, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.075, 0.075, 0.02, 16]} />
      </mesh>
      {/* Side energy strips */}
      <mesh material={materials.accentCyan} position={[0.25, -0.06, 0.115]}>
        <boxGeometry args={[1.5, 0.035, 0.012]} />
      </mesh>
      <mesh material={materials.accentCyan} position={[0.25, -0.06, -0.115]}>
        <boxGeometry args={[1.5, 0.035, 0.012]} />
      </mesh>
      {/* Energy core */}
      <mesh material={materials.accentOrange} position={[-0.15, 0.05, 0]}>
        <sphereGeometry args={[0.085, 20, 20]} />
      </mesh>
      {/* Front sight */}
      <mesh material={materials.dark} position={[1.45, 0.34, 0]}>
        <boxGeometry args={[0.06, 0.12, 0.04]} />
      </mesh>
    </group>
  );
}
