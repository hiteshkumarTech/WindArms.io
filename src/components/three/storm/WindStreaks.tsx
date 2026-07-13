'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRng } from '@/lib/utils';

const COUNT = 110;
const BOUNDS = { x: 45, yMin: -4, yMax: 14, z: 30 };

/** Fast horizontal wind particles — the air itself is alive up here. */
export default function WindStreaks({ reducedMotion }: { reducedMotion: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, speeds } = useMemo(() => {
    const rng = createRng(77);
    const positionArray = new Float32Array(COUNT * 3);
    const speedArray = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positionArray[i * 3] = (rng() - 0.5) * BOUNDS.x * 2;
      positionArray[i * 3 + 1] = BOUNDS.yMin + rng() * (BOUNDS.yMax - BOUNDS.yMin);
      positionArray[i * 3 + 2] = -4 - rng() * BOUNDS.z;
      speedArray[i] = 6 + rng() * 9;
    }
    return { positions: positionArray, speeds: speedArray };
  }, []);

  useFrame((_, delta) => {
    if (reducedMotion || !pointsRef.current) return;
    const attribute = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      array[i * 3] += speeds[i] * delta;
      if (array[i * 3] > BOUNDS.x) array[i * 3] = -BOUNDS.x;
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#eaf4ff"
        size={0.06}
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}
