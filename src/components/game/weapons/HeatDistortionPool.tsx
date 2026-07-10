'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { effectsBus } from '@/lib/game/effectsBus';

const noRaycast = () => null;

const HEAT_COUNT = 6;
const HEAT_LIFE_MS = 420;

interface HeatState {
  bornAt: number;
}

/**
 * Cheap animated-noise heat-shimmer quads near the muzzle during sustained
 * automatic fire (`WeaponSystem`'s heat accumulator gates the spawn
 * requests — see `effectsBus.spawnHeatShimmer`). Deliberately not a
 * screen-space refraction pass: that needs a render-target pass that fights
 * with `GameEffects`' binary-quality-tier composer for no proportionate
 * payoff. Instead this fakes the read with a soft, upward-animated noise
 * alpha on a camera-facing quad — the same standalone-`ShaderMaterial`-
 * per-slot precedent as `TracerPool`. Mounted only at `'high'` quality by
 * the caller (`GameCanvas`), matching this project's convention for any
 * non-trivial new shader cost.
 */
export default function HeatDistortionPool() {
  const meshRefs = useRef<Array<THREE.Mesh | null>>(Array(HEAT_COUNT).fill(null));
  const states = useRef<HeatState[]>(Array.from({ length: HEAT_COUNT }, () => ({ bornAt: -Infinity })));
  const cursor = useRef(0);

  const geometry = useMemo(() => new THREE.PlaneGeometry(0.09, 0.15), []);
  const materials = useMemo(
    () =>
      Array.from(
        { length: HEAT_COUNT },
        () =>
          new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
            uniforms: {
              uTime: { value: 0 },
              uOpacity: { value: 0 },
              uColor: { value: new THREE.Color('#fff3d6') },
            },
            vertexShader: /* glsl */ `
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
            fragmentShader: /* glsl */ `
              varying vec2 vUv;
              uniform float uTime;
              uniform float uOpacity;
              uniform vec3 uColor;
              void main() {
                // Fade in from the base, fade out toward the tip — a haze column, not a hard-edged quad.
                float band = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
                // Two counter-drifting sine layers approximate rising, wavering heat haze cheaply.
                float n = sin((vUv.y * 16.0 - uTime * 6.0) + sin(vUv.x * 8.0 + uTime * 2.5) * 1.6) * 0.5 + 0.5;
                float n2 = sin((vUv.y * 26.0 - uTime * 9.5) - vUv.x * 7.0) * 0.5 + 0.5;
                float alpha = band * (n * 0.55 + n2 * 0.35) * uOpacity;
                if (alpha < 0.01) discard;
                gl_FragColor = vec4(uColor, alpha);
              }
            `,
          }),
      ),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
    [geometry, materials],
  );

  useFrame(({ camera }) => {
    const now = performance.now();

    for (const request of effectsBus.takeHeatShimmer()) {
      const slot = cursor.current % HEAT_COUNT;
      cursor.current += 1;
      const mesh = meshRefs.current[slot];
      if (!mesh) continue;
      mesh.position.set(request.at[0], request.at[1], request.at[2]);
      mesh.quaternion.copy(camera.quaternion);
      materials[slot].uniforms.uColor.value.set(request.energy ? '#cabaf0' : '#fff3d6');
      states.current[slot] = { bornAt: now };
      mesh.visible = true;
    }

    for (let slot = 0; slot < HEAT_COUNT; slot++) {
      const mesh = meshRefs.current[slot];
      if (!mesh || !mesh.visible) continue;
      const age = now - states.current[slot].bornAt;
      if (age >= HEAT_LIFE_MS) {
        mesh.visible = false;
        materials[slot].uniforms.uOpacity.value = 0;
        continue;
      }
      // Keep the quad facing the camera for its whole lifetime (a cheap manual billboard).
      mesh.quaternion.copy(camera.quaternion);
      const t = age / HEAT_LIFE_MS;
      materials[slot].uniforms.uTime.value = now * 0.001;
      materials[slot].uniforms.uOpacity.value = 0.16 * (1 - t);
    }
  });

  return (
    <group>
      {Array.from({ length: HEAT_COUNT }, (_, slot) => (
        <mesh
          key={slot}
          ref={(node) => {
            meshRefs.current[slot] = node;
          }}
          geometry={geometry}
          material={materials[slot]}
          raycast={noRaycast}
          visible={false}
          frustumCulled={false}
          renderOrder={1003}
        />
      ))}
    </group>
  );
}
