'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { scrollState } from '@/lib/v2/scrollProgress';

function createFlashTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.4, 'rgba(210,230,255,0.35)');
    gradient.addColorStop(1, 'rgba(210,230,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Distant storm strikes: a light spike + sheet flash behind the clouds
 * on a randomized timer that grows more frequent deeper in the scroll
 * (the descent toward the storm).
 */
export default function StormLightning({ reducedMotion }: { reducedMotion: boolean }) {
  const lightRef = useRef<THREE.PointLight>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const state = useRef({ flash: 0, nextIn: 3 });
  const texture = useMemo(createFlashTexture, []);
  const material = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [texture],
  );

  useEffect(
    () => () => {
      texture.dispose();
      material.dispose();
    },
    [texture, material],
  );

  useFrame((_, delta) => {
    if (reducedMotion) return;
    const s = state.current;
    s.nextIn -= delta;
    if (s.nextIn <= 0) {
      s.flash = 1;
      // Strikes accelerate as the page descends into the storm.
      const urgency = 1.1 - scrollState.smoothed * 0.75;
      s.nextIn = (2.5 + Math.random() * 6) * Math.max(urgency, 0.3);
      if (spriteRef.current) {
        spriteRef.current.position.set((Math.random() - 0.5) * 60, 8 + Math.random() * 10, -34);
      }
    }
    s.flash = Math.max(0, s.flash - delta * 3.2);
    const eased = s.flash * s.flash;
    if (lightRef.current) lightRef.current.intensity = eased * 90;
    material.opacity = eased * 0.55;
  });

  return (
    <group>
      <pointLight ref={lightRef} position={[0, 14, -26]} intensity={0} distance={80} decay={1.6} color="#dcecff" />
      <sprite ref={spriteRef} material={material} position={[10, 12, -34]} scale={[26, 18, 1]} />
    </group>
  );
}
