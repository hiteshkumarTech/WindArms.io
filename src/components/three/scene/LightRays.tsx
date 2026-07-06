'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface LightRaysProps {
  reducedMotion: boolean;
}

interface RayConfig {
  position: [number, number, number];
  rotation: number;
  color: string;
  opacity: number;
  width: number;
}

const RAYS: RayConfig[] = [
  { position: [-5.5, 4.5, -7], rotation: -0.55, color: '#66e4ff', opacity: 0.07, width: 2.4 },
  { position: [-1.5, 5, -8], rotation: -0.42, color: '#9a8cff', opacity: 0.05, width: 3.2 },
  { position: [3.5, 5.2, -9], rotation: -0.6, color: '#66e4ff', opacity: 0.045, width: 2 },
];

function createRayTexture(): THREE.CanvasTexture {
  const width = 64;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.12)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
  return new THREE.CanvasTexture(canvas);
}

function createFlareTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.25, 'rgba(160, 235, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(160, 235, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Volumetric-style light shafts plus a soft lens flare, gently swaying. */
export default function LightRays({ reducedMotion }: LightRaysProps) {
  const groupRef = useRef<THREE.Group>(null);
  const rayTexture = useMemo(createRayTexture, []);
  const flareTexture = useMemo(createFlareTexture, []);

  useEffect(
    () => () => {
      rayTexture.dispose();
      flareTexture.dispose();
    },
    [flareTexture, rayTexture],
  );

  useFrame(({ clock }) => {
    if (reducedMotion || !groupRef.current) return;
    const time = clock.elapsedTime;
    groupRef.current.children.forEach((child, index) => {
      if (index < RAYS.length) {
        child.rotation.z = RAYS[index].rotation + Math.sin(time * 0.12 + index * 1.7) * 0.035;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {RAYS.map((ray, index) => (
        <mesh key={index} position={ray.position} rotation={[0, 0, ray.rotation]}>
          <planeGeometry args={[ray.width, 16]} />
          <meshBasicMaterial
            map={rayTexture}
            color={ray.color}
            transparent
            opacity={ray.opacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
      <sprite position={[7.5, 5.5, -10]} scale={[7, 7, 1]}>
        <spriteMaterial
          map={flareTexture}
          color="#7fe6ff"
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}
