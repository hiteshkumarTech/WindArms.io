'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';

function createSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, STORM.skyZenith);
    gradient.addColorStop(0.5, STORM.skyMid);
    gradient.addColorStop(0.82, STORM.skyHorizon);
    gradient.addColorStop(1, STORM.skyHorizon);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  return new THREE.CanvasTexture(canvas);
}

/** The bright storm sky itself: an inverted gradient dome, unaffected by fog. */
export default function SkyGradient() {
  const texture = useMemo(createSkyTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh>
      <sphereGeometry args={[70, 32, 24]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} fog={false} toneMapped={false} />
    </mesh>
  );
}
