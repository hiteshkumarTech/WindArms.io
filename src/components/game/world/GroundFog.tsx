'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRng } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const PUFF_COUNT = 18;
const RING_RADIUS = 16;
const BASE_Y = 0.5;
const Y_JITTER = 0.6;

function createHazeTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

interface Puff {
  angle: number;
  radiusJitter: number;
  yBase: number;
  phase: number;
  scale: number;
}

interface GroundFogProps {
  color: string;
}

/**
 * Cheap "volumetric" ground haze: a camera-following ring of large, soft,
 * additively-blended sprites hugging the floor. Not a raymarched volume —
 * a stylized billboard illusion in the same spirit as the pooled combat
 * sprites — but it reads as low mist without any texture assets or a
 * postprocessing pass. Always follows the camera's XZ so it never runs out
 * at a map's edges regardless of footprint.
 */
export default function GroundFog({ color }: GroundFogProps) {
  const groupRef = useRef<THREE.Group>(null);
  const spriteRefs = useRef<Array<THREE.Sprite | null>>(Array(PUFF_COUNT).fill(null));
  const reducedMotion = usePrefersReducedMotion();

  const texture = useMemo(createHazeTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const material = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    [texture, color],
  );
  useEffect(() => () => material.dispose(), [material]);

  const puffs = useMemo<Puff[]>(() => {
    const rng = createRng(9001);
    return Array.from({ length: PUFF_COUNT }, (_, i) => ({
      angle: (i / PUFF_COUNT) * Math.PI * 2 + rng() * 0.3,
      radiusJitter: RING_RADIUS * (0.7 + rng() * 0.5),
      yBase: BASE_Y + (rng() - 0.5) * Y_JITTER,
      phase: rng() * Math.PI * 2,
      scale: 7 + rng() * 5,
    }));
  }, []);

  useFrame(({ camera, clock }) => {
    const group = groupRef.current;
    if (!group) return;
    group.position.set(camera.position.x, 0, camera.position.z);

    if (reducedMotion) return;
    const time = clock.elapsedTime;
    for (let i = 0; i < PUFF_COUNT; i++) {
      const sprite = spriteRefs.current[i];
      if (!sprite) continue;
      const puff = puffs[i];
      const drift = time * 0.04 + puff.phase;
      sprite.position.set(
        Math.cos(puff.angle + drift * 0.15) * puff.radiusJitter,
        puff.yBase + Math.sin(drift) * 0.15,
        Math.sin(puff.angle + drift * 0.15) * puff.radiusJitter,
      );
    }
  });

  return (
    <group ref={groupRef} renderOrder={-1}>
      {puffs.map((puff, i) => (
        <sprite
          key={i}
          ref={(node) => {
            spriteRefs.current[i] = node;
          }}
          material={material}
          position={[Math.cos(puff.angle) * puff.radiusJitter, puff.yBase, Math.sin(puff.angle) * puff.radiusJitter]}
          scale={[puff.scale, puff.scale * 0.4, 1]}
        />
      ))}
    </group>
  );
}
