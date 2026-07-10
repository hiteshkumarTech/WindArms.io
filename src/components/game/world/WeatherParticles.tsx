'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRng } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export type WeatherPreset = 'rain' | 'dust';

interface PresetConfig {
  count: number;
  color: string;
  /** Matches PointsMaterial's size-attenuation units (see AmbientParticles). */
  size: number;
  opacity: number;
  /** Fall speed range (m/s, always downward). */
  fallSpeed: [number, number];
  sway: number;
  swayFreq: number;
  /** Elongated streak texture (rain) vs a soft round glow (dust). */
  streak: boolean;
}

const PRESETS: Record<WeatherPreset, PresetConfig> = {
  rain: { count: 550, color: '#bcd7e6', size: 0.22, opacity: 0.5, fallSpeed: [9, 13], sway: 0.15, swayFreq: 0.4, streak: true },
  dust: { count: 240, color: '#d8c9a8', size: 0.05, opacity: 0.32, fallSpeed: [0.15, 0.4], sway: 0.55, swayFreq: 0.3, streak: false },
};

const BOUNDS = { x: 26, yMin: -1, yMax: 14, z: 26 };

function createStreakTexture(): THREE.CanvasTexture {
  const w = 16;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, w, h);
  }
  return new THREE.CanvasTexture(canvas);
}

function createGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

// Mirrors three.js's own PointsMaterial size-attenuation formula
// (gl_PointSize = size * (scale / -viewZ), scale = canvasHeight * 0.5) so
// these `size` values read at the same visual scale as AmbientParticles.
const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uYMin;
  uniform float uYMax;
  uniform float uSize;
  attribute float aSpeed;
  attribute float aPhase;
  attribute float aSway;
  attribute float aSwayFreq;
  void main() {
    vec3 pos = position;
    float span = uYMax - uYMin;
    // mod() wraps each particle back to the top once it falls past uYMin —
    // a fixed-size pool with infinite reuse, same spirit as the pooled
    // combat effects, just running entirely on the GPU.
    pos.y = uYMax - mod((uYMax - position.y) + uTime * aSpeed, span);
    pos.x += sin(uTime * aSwayFreq + aPhase) * aSway;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize * (uScale / -mvPosition.z);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float alpha = tex.a * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

interface WeatherParticlesProps {
  preset: WeatherPreset;
}

/**
 * GPU-driven weather layer, separate from AmbientParticles' CPU-updated
 * decoration: per-particle fall speed/sway/phase are static attributes
 * uploaded once, and a single uTime uniform drives every particle's motion
 * inside the vertex shader every frame. Nothing touches the position buffer
 * after the initial upload — nor does particle count affect CPU frame cost.
 */
export default function WeatherParticles({ preset }: WeatherParticlesProps) {
  const config = PRESETS[preset];
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const reducedMotion = usePrefersReducedMotion();

  const texture = useMemo(() => (config.streak ? createStreakTexture() : createGlowTexture()), [config.streak]);
  useEffect(() => () => texture.dispose(), [texture]);

  const { positions, speeds, phases, sways, swayFreqs } = useMemo(() => {
    const rng = createRng(preset === 'rain' ? 7331 : 4242);
    const n = config.count;
    const positionArray = new Float32Array(n * 3);
    const speedArray = new Float32Array(n);
    const phaseArray = new Float32Array(n);
    const swayArray = new Float32Array(n);
    const swayFreqArray = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      positionArray[i * 3] = (rng() - 0.5) * BOUNDS.x * 2;
      positionArray[i * 3 + 1] = BOUNDS.yMin + rng() * (BOUNDS.yMax - BOUNDS.yMin);
      positionArray[i * 3 + 2] = (rng() - 0.5) * BOUNDS.z * 2;
      speedArray[i] = config.fallSpeed[0] + rng() * (config.fallSpeed[1] - config.fallSpeed[0]);
      phaseArray[i] = rng() * Math.PI * 2;
      swayArray[i] = config.sway * (0.6 + rng() * 0.8);
      swayFreqArray[i] = config.swayFreq * (0.7 + rng() * 0.6);
    }
    return { positions: positionArray, speeds: speedArray, phases: phaseArray, sways: swayArray, swayFreqs: swayFreqArray };
  }, [config, preset]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScale: { value: 300 },
      uYMin: { value: BOUNDS.yMin },
      uYMax: { value: BOUNDS.yMax },
      uSize: { value: config.size },
      uMap: { value: texture },
      uColor: { value: new THREE.Color(config.color) },
      uOpacity: { value: config.opacity },
    }),
    [config, texture],
  );

  useFrame((state) => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uScale.value = state.size.height * 0.5;
    if (reducedMotion) return;
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSpeed" args={[speeds, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        <bufferAttribute attach="attributes-aSway" args={[sways, 1]} />
        <bufferAttribute attach="attributes-aSwayFreq" args={[swayFreqs, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
