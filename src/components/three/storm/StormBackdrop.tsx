'use client';

import { Component, Suspense, useMemo, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';
import { scrollState } from '@/lib/v2/scrollProgress';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import AeolusShowpiece from './AeolusShowpiece';
import CloudLayer from './CloudLayer';
import GodRays from './GodRays';
import SkyArchipelago from './SkyArchipelago';
import SkyCitadel from './SkyCitadel';
import SkyGradient from './SkyGradient';
import StormLightning from './StormLightning';
import WindStreaks from './WindStreaks';

/**
 * Scroll choreography: camera keyframes across the page's story beats.
 * Hero (low in the clouds) → arsenal drift → operators pan → skyfront
 * top-down → pillars darkening → CTA golden dive.
 */
const CAMERA_PATH = [
  { at: 0.0, pos: [0, 0.6, 9], look: [2.4, 3, -18], fog: '#9fc3e0' },
  { at: 0.2, pos: [3.4, 1.6, 7.5], look: [0.5, 1.8, -18], fog: '#8db5d8' },
  { at: 0.42, pos: [-3.2, 2.6, 7], look: [3.2, 2.4, -18], fog: '#7fa8cc' },
  { at: 0.62, pos: [0.5, 9.5, 3.5], look: [2.8, -1, -18], fog: '#6c93b8' },
  { at: 0.82, pos: [1.6, 3.2, 6.5], look: [2.8, 2, -18], fog: '#47596e' },
  { at: 1.0, pos: [0, 1.2, 5.5], look: [2.8, 4, -18], fog: '#c99f63' },
] as const;

/** Lerps camera + fog along CAMERA_PATH from the module scroll ref. */
function CameraDirector({ reducedMotion }: { reducedMotion: boolean }) {
  const scratch = useMemo(
    () => ({
      position: new THREE.Vector3(),
      look: new THREE.Vector3(),
      fogA: new THREE.Color(),
      fogB: new THREE.Color(),
      fogColors: CAMERA_PATH.map((key) => new THREE.Color(key.fog)),
    }),
    [],
  );

  useFrame(({ camera, scene }, delta) => {
    // Smooth the raw scroll signal canvas-side (never via React).
    const target = reducedMotion ? 0 : scrollState.progress;
    scrollState.smoothed += (target - scrollState.smoothed) * Math.min(1, delta * 4.5);
    const progress = scrollState.smoothed;

    let segment = 0;
    while (segment < CAMERA_PATH.length - 2 && progress > CAMERA_PATH[segment + 1].at) {
      segment += 1;
    }
    const from = CAMERA_PATH[segment];
    const to = CAMERA_PATH[segment + 1];
    const span = Math.max(to.at - from.at, 1e-5);
    const t = Math.min(Math.max((progress - from.at) / span, 0), 1);
    // Ease within the segment for buttery transitions.
    const eased = t * t * (3 - 2 * t);

    scratch.position.set(
      from.pos[0] + (to.pos[0] - from.pos[0]) * eased,
      from.pos[1] + (to.pos[1] - from.pos[1]) * eased,
      from.pos[2] + (to.pos[2] - from.pos[2]) * eased,
    );
    scratch.look.set(
      from.look[0] + (to.look[0] - from.look[0]) * eased,
      from.look[1] + (to.look[1] - from.look[1]) * eased,
      from.look[2] + (to.look[2] - from.look[2]) * eased,
    );
    camera.position.copy(scratch.position);
    camera.lookAt(scratch.look);

    if (scene.fog instanceof THREE.Fog) {
      scratch.fogA.copy(scratch.fogColors[segment]);
      scratch.fogB.copy(scratch.fogColors[segment + 1]);
      scene.fog.color.copy(scratch.fogA.lerp(scratch.fogB, eased));
    }
  });

  return null;
}

function StormFallback() {
  return (
    <div
      aria-hidden
      className="fixed inset-0"
      style={{
        background: `linear-gradient(180deg, ${STORM.skyZenith} 0%, ${STORM.skyMid} 55%, ${STORM.skyHorizon} 100%)`,
      }}
    />
  );
}

class BackdropBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <StormFallback /> : this.props.children;
  }
}

/**
 * The living storm sky behind the whole V2 landing page. Fixed and
 * pointer-transparent; every animated value flows scroll → module ref →
 * frame loop. React never re-renders on scroll or camera movement.
 */
export default function StormBackdrop() {
  const reducedMotion = usePrefersReducedMotion();
  const [dpr, setDpr] = useState(1.5);

  return (
    <div className="fixed inset-0 z-0" aria-hidden>
      <BackdropBoundary>
        <Canvas
          dpr={dpr}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          camera={{ fov: 55, near: 0.1, far: 140, position: [0, 0.6, 9] }}
          onCreated={({ gl }) => gl.setClearColor(STORM.skyMid)}
        >
          <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
          <Suspense fallback={null}>
            <fog attach="fog" args={['#9fc3e0', 20, 115]} />
            <hemisphereLight args={['#dceeff', '#41556b', 0.85]} />
            <directionalLight position={[14, 18, 4]} intensity={1.9} color="#fff3dc" />

            <SkyGradient />
            <GodRays reducedMotion={reducedMotion} />
            {/* Cloud sea: dense floor, mid band, thin high wisps */}
            <CloudLayer count={18} y={-4.5} opacity={0.55} parallax={9} seed={11} reducedMotion={reducedMotion} />
            <CloudLayer count={12} y={4} opacity={0.28} parallax={14} seed={23} reducedMotion={reducedMotion} />
            <CloudLayer count={8} y={11} opacity={0.16} parallax={18} seed={31} reducedMotion={reducedMotion} />
            <SkyCitadel reducedMotion={reducedMotion} />
            <SkyArchipelago reducedMotion={reducedMotion} />
            <AeolusShowpiece reducedMotion={reducedMotion} />
            <WindStreaks reducedMotion={reducedMotion} />
            <StormLightning reducedMotion={reducedMotion} />
            <CameraDirector reducedMotion={reducedMotion} />
          </Suspense>
        </Canvas>
      </BackdropBoundary>
    </div>
  );
}
