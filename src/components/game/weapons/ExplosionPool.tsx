'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { effectsBus } from '@/lib/game/effectsBus';

const noRaycast = () => null;

const RING_COUNT = 6;
const RING_LIFE_MS = 450;
const LIGHT_LIFE_MS = 260;

function createRingTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.58, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.72, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.86, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Pooled shockwave rings layered on top of the existing radial spark burst
 * (`spawnDeathBurst` in useMultiplayer.ts) for eliminations — a dedicated
 * pool rather than borrowing more slots from the shared bullet-impact pool,
 * since a death already spends ten of those on its spark ring. The flash is
 * a single shared PointLight (repositioned per event, like WeaponViewmodel's
 * muzzle light) rather than a pool of them — six always-mounted lights would
 * add six entries to every standard-material shader's lighting loop
 * scene-wide for an effect that's rarely visible more than once at a time.
 */
export default function ExplosionPool() {
  const ringRefs = useRef<Array<THREE.Sprite | null>>(Array(RING_COUNT).fill(null));
  const ringData = useRef(Array.from({ length: RING_COUNT }, () => ({ bornAt: -Infinity })));
  const cursor = useRef(0);
  const lightRef = useRef<THREE.PointLight>(null);
  const lightBornAt = useRef(-Infinity);

  const texture = useMemo(createRingTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const materials = useMemo(
    () =>
      Array.from(
        { length: RING_COUNT },
        () =>
          new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
      ),
    [texture],
  );
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);

  useFrame(() => {
    const now = performance.now();

    for (const request of effectsBus.takeExplosions()) {
      const slot = cursor.current % RING_COUNT;
      cursor.current += 1;
      const ring = ringRefs.current[slot];
      if (ring) {
        ring.position.set(request.at[0], request.at[1], request.at[2]);
        ring.scale.set(0.3, 0.3, 1);
        materials[slot].color.set(request.color);
        materials[slot].opacity = 0.9;
        ring.visible = true;
        ringData.current[slot].bornAt = now;
      }

      if (lightRef.current) {
        lightRef.current.position.set(request.at[0], request.at[1], request.at[2]);
        lightRef.current.color.set(request.color);
        lightRef.current.intensity = 12;
      }
      lightBornAt.current = now;
    }

    for (let slot = 0; slot < RING_COUNT; slot++) {
      const ring = ringRefs.current[slot];
      if (!ring || !ring.visible) continue;
      const age = now - ringData.current[slot].bornAt;
      if (age >= RING_LIFE_MS) {
        ring.visible = false;
        materials[slot].opacity = 0;
      } else {
        const t = age / RING_LIFE_MS;
        const scale = 0.3 + t * 3.4;
        ring.scale.set(scale, scale, 1);
        materials[slot].opacity = 0.9 * (1 - t);
      }
    }

    if (lightRef.current) {
      const age = now - lightBornAt.current;
      lightRef.current.intensity = age >= LIGHT_LIFE_MS ? 0 : 12 * (1 - age / LIGHT_LIFE_MS);
    }
  });

  return (
    <group>
      {Array.from({ length: RING_COUNT }, (_, slot) => (
        <sprite
          key={slot}
          ref={(node) => {
            ringRefs.current[slot] = node;
          }}
          material={materials[slot]}
          raycast={noRaycast}
          visible={false}
          frustumCulled={false}
        />
      ))}
      <pointLight ref={lightRef} intensity={0} distance={7} decay={2} />
    </group>
  );
}
