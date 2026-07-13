'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function createShaftTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(255, 240, 205, 0.55)');
    gradient.addColorStop(0.6, 'rgba(255, 240, 205, 0.14)');
    gradient.addColorStop(1, 'rgba(255, 240, 205, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  return new THREE.CanvasTexture(canvas);
}

function createGlareTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 248, 226, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 236, 190, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 236, 190, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

const SHAFTS = [
  { position: [10, 9, -28] as const, rotation: -0.55, width: 4, opacity: 0.09 },
  { position: [15, 7, -32] as const, rotation: -0.62, width: 6, opacity: 0.06 },
  { position: [6, 11, -30] as const, rotation: -0.48, width: 3, opacity: 0.07 },
];

/** Warm volumetric-style shafts + sun glare from the upper right. */
export default function GodRays({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const shaftTexture = useMemo(createShaftTexture, []);
  const glareTexture = useMemo(createGlareTexture, []);

  useEffect(
    () => () => {
      shaftTexture.dispose();
      glareTexture.dispose();
    },
    [shaftTexture, glareTexture],
  );

  useFrame(({ clock }) => {
    if (reducedMotion || !groupRef.current) return;
    const time = clock.elapsedTime;
    groupRef.current.children.forEach((child, index) => {
      if (index < SHAFTS.length) {
        child.rotation.z = SHAFTS[index].rotation + Math.sin(time * 0.1 + index * 2.1) * 0.025;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {SHAFTS.map((shaft, index) => (
        <mesh key={index} position={[shaft.position[0], shaft.position[1], shaft.position[2]]} rotation={[0, 0, shaft.rotation]}>
          <planeGeometry args={[shaft.width, 26]} />
          <meshBasicMaterial
            map={shaftTexture}
            transparent
            opacity={shaft.opacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            fog={false}
          />
        </mesh>
      ))}
      <sprite position={[22, 15, -44]} scale={[16, 16, 1]}>
        <spriteMaterial
          map={glareTexture}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </sprite>
    </group>
  );
}
