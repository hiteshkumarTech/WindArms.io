'use client';

import dynamic from 'next/dynamic';
import BackgroundFallback from '@/components/three/BackgroundFallback';
import Hero from './Hero';
import Navbar from './Navbar';

/**
 * Single-viewport landing shell. The WebGL backdrop is code-split and
 * client-only; a static ambient fallback renders while it streams in.
 */
const CinematicBackground = dynamic(() => import('@/components/three/CinematicBackground'), {
  ssr: false,
  loading: () => <BackgroundFallback />,
});

export default function LandingView() {
  return (
    <main id="home" className="relative h-[100dvh] overflow-hidden bg-void">
      <CinematicBackground />

      {/* Atmosphere overlays */}
      <div
        className="noise-overlay pointer-events-none absolute inset-0 z-[5] opacity-[0.05] mix-blend-overlay"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-56 backdrop-blur-[6px] [mask-image:linear-gradient(to_top,black_20%,transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(120%_90%_at_50%_10%,transparent_55%,rgba(5,5,5,0.55))]"
        aria-hidden
      />

      <Navbar />
      <Hero />
    </main>
  );
}
