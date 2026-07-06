'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import Scene from './scene/Scene';
import SceneErrorBoundary from './SceneErrorBoundary';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Full-screen real-time cinematic backdrop. Renders the WebGL scene inside
 * an error boundary so devices without WebGL gracefully fall back to a
 * static ambient background.
 */
export default function CinematicBackground() {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="absolute inset-0" aria-hidden>
      <SceneErrorBoundary>
        <Canvas
          dpr={[1, 1.75]}
          gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
          camera={{ fov: 50, near: 0.1, far: 70, position: [0, 1.1, 8.5] }}
          onCreated={({ gl }) => gl.setClearColor('#050505')}
        >
          <Suspense fallback={null}>
            <Scene reducedMotion={reducedMotion} />
          </Suspense>
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
