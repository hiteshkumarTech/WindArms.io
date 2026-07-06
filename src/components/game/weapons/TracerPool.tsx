'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { effectsBus } from '@/lib/game/effectsBus';

const noRaycast = () => null;

const TRACER_COUNT = 24;
const TRACER_LIFE_MS = 90;
const IMPACT_COUNT = 16;
const IMPACT_LIFE_MS = 160;

function createGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Fixed-size pools for bullet tracers (stretched additive boxes) and hit
 * sparks (glow sprites). Slots are recycled round-robin; requests arrive
 * through the effects bus and everything updates imperatively in the frame
 * loop — no allocation, no re-renders, regardless of fire rate.
 */
export default function TracerPool() {
  const tracerRefs = useRef<Array<THREE.Mesh | null>>(Array(TRACER_COUNT).fill(null));
  const impactRefs = useRef<Array<THREE.Sprite | null>>(Array(IMPACT_COUNT).fill(null));
  const tracerData = useRef(
    Array.from({ length: TRACER_COUNT }, () => ({ bornAt: -Infinity })),
  );
  const impactData = useRef(
    Array.from({ length: IMPACT_COUNT }, () => ({ bornAt: -Infinity })),
  );
  const tracerCursor = useRef(0);
  const impactCursor = useRef(0);

  const tracerGeometry = useMemo(() => new THREE.BoxGeometry(0.025, 0.025, 1), []);
  const tracerMaterials = useMemo(
    () =>
      Array.from(
        { length: TRACER_COUNT },
        () =>
          new THREE.MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
      ),
    [],
  );
  const glowTexture = useMemo(createGlowTexture, []);
  const impactMaterials = useMemo(
    () =>
      Array.from(
        { length: IMPACT_COUNT },
        () =>
          new THREE.SpriteMaterial({
            map: glowTexture,
            color: '#ffffff',
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
      ),
    [glowTexture],
  );

  useEffect(
    () => () => {
      tracerGeometry.dispose();
      tracerMaterials.forEach((material) => material.dispose());
      impactMaterials.forEach((material) => material.dispose());
      glowTexture.dispose();
    },
    [glowTexture, impactMaterials, tracerGeometry, tracerMaterials],
  );

  useFrame(() => {
    const now = performance.now();

    // Assign new tracers.
    for (const request of effectsBus.takeTracers()) {
      const slot = tracerCursor.current % TRACER_COUNT;
      tracerCursor.current += 1;
      const mesh = tracerRefs.current[slot];
      if (!mesh) continue;

      const from = new THREE.Vector3(...request.from);
      const to = new THREE.Vector3(...request.to);
      const length = Math.max(from.distanceTo(to), 0.1);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.lookAt(to);
      mesh.scale.set(1, 1, length);
      tracerMaterials[slot].color.set(request.color);
      tracerData.current[slot].bornAt = now;
      mesh.visible = true;
    }

    // Assign new impacts.
    for (const request of effectsBus.takeImpacts()) {
      const slot = impactCursor.current % IMPACT_COUNT;
      impactCursor.current += 1;
      const sprite = impactRefs.current[slot];
      if (!sprite) continue;
      sprite.position.set(request.at[0], request.at[1], request.at[2]);
      impactMaterials[slot].color.set(request.color);
      impactData.current[slot].bornAt = now;
      sprite.visible = true;
    }

    // Age out active slots.
    for (let slot = 0; slot < TRACER_COUNT; slot++) {
      const age = now - tracerData.current[slot].bornAt;
      const mesh = tracerRefs.current[slot];
      if (!mesh || !mesh.visible) continue;
      if (age >= TRACER_LIFE_MS) {
        mesh.visible = false;
        tracerMaterials[slot].opacity = 0;
      } else {
        tracerMaterials[slot].opacity = 0.9 * (1 - age / TRACER_LIFE_MS);
      }
    }
    for (let slot = 0; slot < IMPACT_COUNT; slot++) {
      const age = now - impactData.current[slot].bornAt;
      const sprite = impactRefs.current[slot];
      if (!sprite || !sprite.visible) continue;
      if (age >= IMPACT_LIFE_MS) {
        sprite.visible = false;
        impactMaterials[slot].opacity = 0;
      } else {
        const t = age / IMPACT_LIFE_MS;
        const scale = 0.12 + t * 0.45;
        sprite.scale.set(scale, scale, 1);
        impactMaterials[slot].opacity = 0.9 * (1 - t);
      }
    }
  });

  return (
    <group>
      {Array.from({ length: TRACER_COUNT }, (_, slot) => (
        <mesh
          key={`tracer-${slot}`}
          ref={(node) => {
            tracerRefs.current[slot] = node;
          }}
          geometry={tracerGeometry}
          material={tracerMaterials[slot]}
          raycast={noRaycast}
          visible={false}
          frustumCulled={false}
        />
      ))}
      {Array.from({ length: IMPACT_COUNT }, (_, slot) => (
        <sprite
          key={`impact-${slot}`}
          ref={(node) => {
            impactRefs.current[slot] = node;
          }}
          material={impactMaterials[slot]}
          raycast={noRaycast}
          visible={false}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
