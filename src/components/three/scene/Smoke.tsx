'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRng } from '@/lib/utils';

const PLANE_COUNT = 6;

interface SmokeProps {
  reducedMotion: boolean;
}

function createSmokeTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.16)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Low-opacity smoke billboards drifting slowly across the lower frame. */
export default function Smoke({ reducedMotion }: SmokeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const texture = useMemo(createSmokeTexture, []);

  useEffect(() => () => texture.dispose(), [texture]);

  const planes = useMemo(() => {
    const rng = createRng(7);
    return Array.from({ length: PLANE_COUNT }, () => ({
      position: [(rng() - 0.5) * 18, -0.4 + rng() * 1.6, -2 - rng() * 6] as [number, number, number],
      scale: 6 + rng() * 6,
      rotation: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 0.1,
      opacity: 0.05 + rng() * 0.05,
    }));
  }, []);

  useFrame((_, delta) => {
    if (reducedMotion || !groupRef.current) return;
    groupRef.current.children.forEach((child, index) => {
      child.rotation.z += planes[index].spin * delta;
      child.position.x += delta * 0.12;
      if (child.position.x > 12) {
        child.position.x = -12;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {planes.map((plane, index) => (
        <mesh key={index} position={plane.position} rotation={[0, 0, plane.rotation]} scale={plane.scale}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={texture}
            color="#9aa7b8"
            transparent
            opacity={plane.opacity}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
