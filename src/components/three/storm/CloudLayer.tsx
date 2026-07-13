'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRng } from '@/lib/utils';
import { scrollState } from '@/lib/v2/scrollProgress';

function createCloudTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    // Three overlapping soft blobs read as one irregular cloud.
    const blobs: Array<[number, number, number, number]> = [
      [0.5, 0.55, 0.4, 0.5],
      [0.34, 0.5, 0.26, 0.38],
      [0.66, 0.48, 0.28, 0.4],
    ];
    for (const [x, y, radius, alpha] of blobs) {
      const gradient = context.createRadialGradient(
        size * x,
        size * y,
        0,
        size * x,
        size * y,
        size * radius,
      );
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    }
  }
  return new THREE.CanvasTexture(canvas);
}

interface CloudLayerProps {
  count: number;
  /** Base altitude of the layer. */
  y: number;
  opacity: number;
  /** How strongly scroll progress sinks this layer (ascent illusion). */
  parallax: number;
  seed: number;
  reducedMotion: boolean;
}

/** One parallax band of billboard clouds sharing a single sprite material. */
export default function CloudLayer({ count, y, opacity, parallax, seed, reducedMotion }: CloudLayerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const texture = useMemo(createCloudTexture, []);
  const material = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity,
        depthWrite: false,
        fog: false,
      }),
    [texture, opacity],
  );

  useEffect(
    () => () => {
      texture.dispose();
      material.dispose();
    },
    [texture, material],
  );

  const sprites = useMemo(() => {
    const rng = createRng(seed);
    return Array.from({ length: count }, () => ({
      x: (rng() - 0.5) * 90,
      yJitter: (rng() - 0.5) * 5,
      z: -8 - rng() * 30,
      scale: 9 + rng() * 14,
      drift: 0.15 + rng() * 0.35,
    }));
  }, [count, seed]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    group.position.y = y - scrollState.smoothed * parallax;
    if (reducedMotion) return;
    group.children.forEach((sprite, index) => {
      sprite.position.x += sprites[index].drift * delta;
      if (sprite.position.x > 50) sprite.position.x = -50;
    });
  });

  return (
    <group ref={groupRef} position={[0, y, 0]}>
      {sprites.map((cloud, index) => (
        <sprite
          key={index}
          material={material}
          position={[cloud.x, cloud.yJitter, cloud.z]}
          scale={[cloud.scale, cloud.scale * 0.42, 1]}
        />
      ))}
    </group>
  );
}
