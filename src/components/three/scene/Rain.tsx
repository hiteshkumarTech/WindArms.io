'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRng } from '@/lib/utils';

const COUNT = 450;
const BOUNDS = { x: 18, yMin: -2, yMax: 12, z: 9 };
const WIND_DRIFT = 0.9;

interface RainProps {
  reducedMotion: boolean;
}

/** Sparse cinematic rain streaking down with a slight wind drift. */
export default function Rain({ reducedMotion }: RainProps) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, speeds } = useMemo(() => {
    const rng = createRng(1337);
    const positionArray = new Float32Array(COUNT * 3);
    const speedArray = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positionArray[i * 3] = (rng() - 0.5) * BOUNDS.x * 2;
      positionArray[i * 3 + 1] = BOUNDS.yMin + rng() * (BOUNDS.yMax - BOUNDS.yMin);
      positionArray[i * 3 + 2] = (rng() - 0.5) * BOUNDS.z * 2;
      speedArray[i] = 7 + rng() * 6;
    }
    return { positions: positionArray, speeds: speedArray };
  }, []);

  useFrame((_, delta) => {
    if (reducedMotion || !pointsRef.current) return;
    const attribute = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      array[i * 3 + 1] -= speeds[i] * delta;
      array[i * 3] -= WIND_DRIFT * delta;
      if (array[i * 3 + 1] < BOUNDS.yMin) {
        array[i * 3 + 1] = BOUNDS.yMax;
      }
      if (array[i * 3] < -BOUNDS.x) {
        array[i * 3] = BOUNDS.x;
      }
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#8fd8ff"
        size={0.03}
        transparent
        opacity={0.32}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}
