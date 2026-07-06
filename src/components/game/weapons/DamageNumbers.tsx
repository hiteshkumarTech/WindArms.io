'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { effectsBus } from '@/lib/game/effectsBus';

const noRaycast = () => null;

const POOL_SIZE = 16;
const LIFE_MS = 650;
const RISE_M = 0.8;

interface SlotState {
  bornAt: number;
  baseY: number;
}

/**
 * Pooled floating damage numbers: each slot owns a small canvas redrawn on
 * assignment (number + color), shown as a sprite that rises and fades.
 * Zero allocations per frame; slots recycle round-robin at any fire rate.
 */
export default function DamageNumbers() {
  const spriteRefs = useRef<Array<THREE.Sprite | null>>(Array(POOL_SIZE).fill(null));
  const slots = useRef<SlotState[]>(
    Array.from({ length: POOL_SIZE }, () => ({ bornAt: -Infinity, baseY: 0 })),
  );
  const cursor = useRef(0);

  const { canvases, contexts, textures, materials } = useMemo(() => {
    const canvasList: HTMLCanvasElement[] = [];
    const contextList: Array<CanvasRenderingContext2D | null> = [];
    const textureList: THREE.CanvasTexture[] = [];
    const materialList: THREE.SpriteMaterial[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const texture = new THREE.CanvasTexture(canvas);
      canvasList.push(canvas);
      contextList.push(canvas.getContext('2d'));
      textureList.push(texture);
      materialList.push(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
        }),
      );
    }
    return { canvases: canvasList, contexts: contextList, textures: textureList, materials: materialList };
  }, []);

  useEffect(
    () => () => {
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
    },
    [materials, textures],
  );

  function draw(slot: number, amount: number, headshot: boolean): void {
    const context = contexts[slot];
    if (!context) return;
    const canvas = canvases[slot];
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = `800 ${headshot ? 40 : 32}px Inter, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 6;
    context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    context.fillStyle = headshot ? '#ff5a5a' : '#ffd27f';
    const label = `${amount}`;
    context.strokeText(label, canvas.width / 2, canvas.height / 2);
    context.fillText(label, canvas.width / 2, canvas.height / 2);
    textures[slot].needsUpdate = true;
  }

  useFrame(() => {
    const now = performance.now();

    for (const request of effectsBus.takeDamageNumbers()) {
      const slot = cursor.current % POOL_SIZE;
      cursor.current += 1;
      const sprite = spriteRefs.current[slot];
      if (!sprite) continue;
      draw(slot, request.amount, request.headshot);
      // Slight jitter prevents stacked shots from perfectly overlapping.
      sprite.position.set(
        request.at[0] + (Math.random() - 0.5) * 0.25,
        request.at[1] + 0.25,
        request.at[2] + (Math.random() - 0.5) * 0.25,
      );
      const scale = request.headshot ? 0.85 : 0.65;
      sprite.scale.set(scale, scale / 2, 1);
      slots.current[slot].bornAt = now;
      slots.current[slot].baseY = sprite.position.y;
      sprite.visible = true;
    }

    for (let slot = 0; slot < POOL_SIZE; slot++) {
      const sprite = spriteRefs.current[slot];
      if (!sprite || !sprite.visible) continue;
      const age = now - slots.current[slot].bornAt;
      if (age >= LIFE_MS) {
        sprite.visible = false;
        materials[slot].opacity = 0;
        continue;
      }
      const t = age / LIFE_MS;
      sprite.position.y = slots.current[slot].baseY + t * RISE_M;
      materials[slot].opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    }
  });

  return (
    <group>
      {Array.from({ length: POOL_SIZE }, (_, slot) => (
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
