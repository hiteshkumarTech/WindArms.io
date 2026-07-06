'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRng } from '@/lib/utils';

const COUNT = 320;
const BOUNDS = { x: 16, yMin: -2, yMax: 9, z: 8 };

interface EmbersProps {
  reducedMotion: boolean;
}

/** Floating orange embers drifting upward with a gentle sine sway. */
export default function Embers({ reducedMotion }: EmbersProps) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, speeds, phases } = useMemo(() => {
    const rng = createRng(42);
    const positionArray = new Float32Array(COUNT * 3);
    const speedArray = new Float32Array(COUNT);
    const phaseArray = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positionArray[i * 3] = (rng() - 0.5) * BOUNDS.x * 2;
      positionArray[i * 3 + 1] = BOUNDS.yMin + rng() * (BOUNDS.yMax - BOUNDS.yMin);
      positionArray[i * 3 + 2] = (rng() - 0.5) * BOUNDS.z * 2;
      speedArray[i] = 0.25 + rng() * 0.6;
      phaseArray[i] = rng() * Math.PI * 2;
    }
    return { positions: positionArray, speeds: speedArray, phases: phaseArray };
  }, []);

  useFrame(({ clock }, delta) => {
    if (reducedMotion || !pointsRef.current) return;
    const attribute = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const time = clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      array[i * 3 + 1] += speeds[i] * delta;
      array[i * 3] += Math.sin(time * 0.6 + phases[i]) * delta * 0.18;
      if (array[i * 3 + 1] > BOUNDS.yMax) {
        array[i * 3 + 1] = BOUNDS.yMin;
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
        color="#FF7A00"
        size={0.045}
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}
