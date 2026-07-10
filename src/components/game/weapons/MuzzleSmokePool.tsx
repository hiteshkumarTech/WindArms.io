'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { effectsBus } from '@/lib/game/effectsBus';

const noRaycast = () => null;

const PUFF_COUNT = 16;
const PUFF_LIFE_MS = 550;
const RISE_SPEED = 0.35;

function createSmokeTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

interface PuffState {
  bornAt: number;
  driftX: number;
  driftZ: number;
}

/**
 * Pooled muzzle smoke: one puff per trigger pull (not per pellet, mirroring
 * ShellCasingPool's cadence), drifting up and slightly sideways while
 * growing and fading. Grey for kinetic weapons, a cooler violet-white for
 * the energy weapon. Normal-blended (not additive) so it reads as haze
 * rather than another glow on top of the muzzle flash.
 */
export default function MuzzleSmokePool() {
  const spriteRefs = useRef<Array<THREE.Sprite | null>>(Array(PUFF_COUNT).fill(null));
  const states = useRef<PuffState[]>(
    Array.from({ length: PUFF_COUNT }, () => ({ bornAt: -Infinity, driftX: 0, driftZ: 0 })),
  );
  const cursor = useRef(0);

  const texture = useMemo(createSmokeTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const materials = useMemo(
    () =>
      Array.from(
        { length: PUFF_COUNT },
        () =>
          new THREE.SpriteMaterial({
            map: texture,
            color: '#cfd4d8',
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.NormalBlending,
          }),
      ),
    [texture],
  );
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);

  useFrame((_, delta) => {
    const now = performance.now();

    for (const request of effectsBus.takeMuzzleSmoke()) {
      const slot = cursor.current % PUFF_COUNT;
      cursor.current += 1;
      const sprite = spriteRefs.current[slot];
      if (!sprite) continue;

      sprite.position.set(request.at[0], request.at[1], request.at[2]);
      sprite.scale.set(0.06, 0.06, 1);
      materials[slot].color.set(request.energy ? '#cabaf0' : '#cfd4d8');
      materials[slot].opacity = 0.5;
      sprite.visible = true;

      const state = states.current[slot];
      state.bornAt = now;
      state.driftX = (Math.random() - 0.5) * 0.12;
      state.driftZ = (Math.random() - 0.5) * 0.12;
    }

    for (let slot = 0; slot < PUFF_COUNT; slot++) {
      const sprite = spriteRefs.current[slot];
      if (!sprite || !sprite.visible) continue;
      const state = states.current[slot];
      const age = now - state.bornAt;
      if (age >= PUFF_LIFE_MS) {
        sprite.visible = false;
        materials[slot].opacity = 0;
        continue;
      }
      const t = age / PUFF_LIFE_MS;
      sprite.position.x += state.driftX * delta;
      sprite.position.y += RISE_SPEED * delta;
      sprite.position.z += state.driftZ * delta;
      const scale = 0.06 + t * 0.16;
      sprite.scale.set(scale, scale, 1);
      materials[slot].opacity = 0.5 * (1 - t);
    }
  });

  return (
    <group>
      {Array.from({ length: PUFF_COUNT }, (_, slot) => (
        <sprite
          key={slot}
          ref={(node) => {
            spriteRefs.current[slot] = node;
          }}
          material={materials[slot]}
          raycast={noRaycast}
          visible={false}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
