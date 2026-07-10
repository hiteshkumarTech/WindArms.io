'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export interface SkyColors {
  horizon: string;
  mid: string;
  zenith: string;
}

/**
 * Procedural sky: a camera-following inverted sphere shaded with a vertical
 * three-stop gradient (horizon → mid → zenith). It stays inside the game
 * camera's far plane and writes no depth, so it always sits behind the arena
 * and never clips. Zero textures — pure shader, matching the project's
 * zero-asset philosophy — and it replaces the old void-black clear color.
 */
export default function SkyDome({ colors }: { colors: SkyColors }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const reducedMotion = usePrefersReducedMotion();

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uHorizon: { value: new THREE.Color(colors.horizon) },
          uMid: { value: new THREE.Color(colors.mid) },
          uZenith: { value: new THREE.Color(colors.zenith) },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vDir;
          uniform vec3 uHorizon;
          uniform vec3 uMid;
          uniform vec3 uZenith;
          uniform float uTime;

          // Cheap layered-sine "clouds" — no texture lookups, stays inside
          // the project's zero-asset shader philosophy.
          float clouds(vec3 dir, float time) {
            float a = sin(dir.x * 3.1 + time * 0.05) * cos(dir.z * 2.3 - time * 0.035);
            float b = sin(dir.x * 6.7 - time * 0.08 + dir.z * 1.8);
            return a * 0.5 + b * 0.25;
          }

          void main() {
            float t = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 lower = mix(uHorizon, uMid, smoothstep(0.0, 0.5, t));
            vec3 color = mix(lower, uZenith, smoothstep(0.5, 1.0, t));

            // Slow drifting cloud bands, faded out near the horizon and
            // zenith so they only read in the mid sky — an "alive
            // atmosphere" cue rather than a literal cloud layer.
            float band = smoothstep(0.15, 0.55, t) * (1.0 - smoothstep(0.75, 1.0, t));
            color += uZenith * clouds(vDir, uTime) * 0.06 * band;

            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    [colors.horizon, colors.mid, colors.zenith],
  );

  useEffect(() => () => material.dispose(), [material]);

  // Keep the dome centred on the camera so it reads as an infinite sky, and
  // drift the cloud bands forward every frame.
  useFrame(({ camera, clock }) => {
    meshRef.current?.position.copy(camera.position);
    if (!reducedMotion) material.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <mesh ref={meshRef} material={material} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[100, 32, 16]} />
    </mesh>
  );
}
