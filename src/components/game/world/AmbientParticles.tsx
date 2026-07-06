'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRng } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export type ParticlePreset = 'embers' | 'snow' | 'motes';

interface PresetConfig {
  count: number;
  color: string;
  size: number;
  opacity: number;
  /** Vertical speed range (negative = falling). */
  ySpeed: [number, number];
  /** Horizontal sine-sway amplitude. */
  sway: number;
}

const PRESETS: Record<ParticlePreset, PresetConfig> = {
  embers: { count: 320, color: '#FF7A00', size: 0.045, opacity: 0.85, ySpeed: [0.25, 0.85], sway: 0.18 },
  snow: { count: 500, color: '#eaf6ff', size: 0.06, opacity: 0.7, ySpeed: [-1.5, -0.7], sway: 0.5 },
  motes: { count: 220, color: '#a7f3c9', size: 0.035, opacity: 0.5, ySpeed: [0.05, 0.2], sway: 0.28 },
};

const BOUNDS = { x: 24, yMin: -1, yMax: 11, z: 24 };

interface AmbientParticlesProps {
  preset: ParticlePreset;
}

/**
 * One particle system, three atmospheres: rising embers, falling snow or
 * drifting forest motes — configured per map theme. Single buffer
 * attribute mutated in place, zero allocations per frame.
 */
export default function AmbientParticles({ preset }: AmbientParticlesProps) {
  const config = PRESETS[preset];
  const pointsRef = useRef<THREE.Points>(null);
  const reducedMotion = usePrefersReducedMotion();

  const { positions, speeds, phases } = useMemo(() => {
    const rng = createRng(1234);
    const positionArray = new Float32Array(config.count * 3);
    const speedArray = new Float32Array(config.count);
    const phaseArray = new Float32Array(config.count);
    for (let i = 0; i < config.count; i++) {
      positionArray[i * 3] = (rng() - 0.5) * BOUNDS.x * 2;
      positionArray[i * 3 + 1] = BOUNDS.yMin + rng() * (BOUNDS.yMax - BOUNDS.yMin);
      positionArray[i * 3 + 2] = (rng() - 0.5) * BOUNDS.z * 2;
      speedArray[i] = config.ySpeed[0] + rng() * (config.ySpeed[1] - config.ySpeed[0]);
      phaseArray[i] = rng() * Math.PI * 2;
    }
    return { positions: positionArray, speeds: speedArray, phases: phaseArray };
  }, [config]);

  useFrame(({ clock }, delta) => {
    if (reducedMotion || !pointsRef.current) return;
    const attribute = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const time = clock.elapsedTime;
    for (let i = 0; i < config.count; i++) {
      array[i * 3 + 1] += speeds[i] * delta;
      array[i * 3] += Math.sin(time * 0.6 + phases[i]) * delta * config.sway;
      if (array[i * 3 + 1] > BOUNDS.yMax) array[i * 3 + 1] = BOUNDS.yMin;
      if (array[i * 3 + 1] < BOUNDS.yMin) array[i * 3 + 1] = BOUNDS.yMax;
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={config.color}
        size={config.size}
        transparent
        opacity={config.opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}
