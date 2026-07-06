'use client';

import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const LOOK_TARGET = new THREE.Vector3(0.6, 0.9, 0);

interface CameraRigProps {
  reducedMotion: boolean;
}

/**
 * Handheld-style camera: layered sine drift emulates subtle shake while
 * the pointer parallaxes the framing. Fully disabled for reduced motion.
 */
export default function CameraRig({ reducedMotion }: CameraRigProps) {
  useFrame(({ camera, clock, pointer }) => {
    const time = clock.elapsedTime;
    const shakeX = reducedMotion ? 0 : Math.sin(time * 1.6) * 0.03 + Math.sin(time * 3.7) * 0.012;
    const shakeY = reducedMotion ? 0 : Math.cos(time * 1.9) * 0.02 + Math.sin(time * 4.3) * 0.01;
    const targetX = (reducedMotion ? 0 : pointer.x * 0.55) + shakeX;
    const targetY = 1.1 + (reducedMotion ? 0 : pointer.y * 0.3) + shakeY;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.045);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.045);
    camera.lookAt(LOOK_TARGET);
  });

  return null;
}
