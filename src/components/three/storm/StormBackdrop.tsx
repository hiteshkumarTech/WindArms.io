'use client';

import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { responsiveFovDeg } from '@/lib/v2/responsiveCamera';
import { STORM } from '@/lib/v2/tokens';
import { scrollState } from '@/lib/v2/scrollProgress';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import AeolusShowpiece from './AeolusShowpiece';
import ArsenalShowpiece from './ArsenalShowpiece';
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
  // Hero look-target raised (3 → 3.8) and pushed right (2.4 → 3.2) in the
  // 2026-07-16 cinematic composition pass: the previous target framed the
  // citadel's low, wide plaza — which sits directly behind the headline
  // text — as the visual center. Raising the target brings the Aeon Ring
  // (the temple's actual identity silhouette, see SkyCitadel.tsx) further
  // into frame. Deliberately NOT raised further (an earlier pass tried 4.6):
  // that pulled more of SkyArchipelago's satellites/debris into the
  // headline's screen region than it removed — this is a balance, not a
  // full fix; see HeroSection.tsx's added legibility scrim for the rest.
  // Only this one keyframe changed — segments 1–5 (Arsenal onward) untouched.
  { at: 0.0, pos: [0, 0.6, 9], look: [3.2, 3.8, -18], fog: '#9fc3e0' },

  // Arsenal beat, expanded from a single drift-through keyframe into a
  // small reveal sequence (2026-07-20, ArsenalShowpiece milestone) so the
  // Vortex Rifle gets an actual approach/arrival/hold/departure instead of
  // just being passed by. approach and transition-out are interpolated
  // partway toward the neighboring hero/operators keyframes (not
  // eyeballed); reveal keeps the original, already-tuned 0.2 pose exactly;
  // hold repeats it verbatim at a later `at` so the camera pauses there —
  // two identical keyframes in a row is the existing lerp system's only
  // way to produce a hold, no new interpolation logic added. First pass,
  // not yet screenshot-verified — retune alongside ArsenalShowpiece's
  // world positions once visually checked.
  // Shifted later than a first pass (0.14/0.2/0.27/0.35) after a live
  // screenshot check: the section heading ("Wind-Powered Weaponry") hadn't
  // scrolled clear of the viewport yet at 0.2, so the reveal collided with
  // it. Pushing the whole sequence out gives it room; pos/look values are
  // still exactly the original tuned arsenal pose, untouched.
  { at: 0.16, pos: [1.9, 1.15, 8.18], look: [1.72, 2.7, -18], fog: '#93bcdc' },
  { at: 0.23, pos: [3.4, 1.6, 7.5], look: [0.5, 1.8, -18], fog: '#8db5d8' },
  { at: 0.31, pos: [3.4, 1.6, 7.5], look: [0.5, 1.8, -18], fog: '#8db5d8' },
  { at: 0.38, pos: [0.76, 2.0, 7.3], look: [1.58, 2.04, -18], fog: '#86adc9' },

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

/**
 * Widens vertical FOV as the viewport narrows below 16:9. Added in the
 * 2026-07-16 cinematic composition pass: with a fixed 55° FOV, the same
 * world-space framing that reads correctly on a wide desktop crops the
 * rifle off-frame entirely on tablet/mobile aspect ratios (confirmed via
 * screenshot, not assumed) — a standard "hold horizontal FOV roughly
 * constant" compensation, only recomputed on actual resize, not per-frame.
 * Formula lives in lib/v2/responsiveCamera.ts (Phase A.1) — ArsenalShowpiece
 * reads the same numbers to compensate the apparent size this widening
 * costs it, so there's one definition instead of two drifting copies.
 */
function ResponsiveFov() {
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.fov = responsiveFovDeg(width / height);
    camera.updateProjectionMatrix();
  }, [camera, width, height]);

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
          <ResponsiveFov />
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
            <ArsenalShowpiece reducedMotion={reducedMotion} />
            <WindStreaks reducedMotion={reducedMotion} />
            <StormLightning reducedMotion={reducedMotion} />
            <CameraDirector reducedMotion={reducedMotion} />
          </Suspense>
        </Canvas>
      </BackdropBoundary>
    </div>
  );
}
