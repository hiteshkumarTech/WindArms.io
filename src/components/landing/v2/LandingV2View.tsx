'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { STORM } from '@/lib/v2/tokens';
import Preloader from './Preloader';
import V2Navbar from './V2Navbar';
import { SECTIONS } from './sections';
import { useScrollChoreography } from './hooks/useScrollChoreography';

const StormBackdrop = dynamic(() => import('@/components/three/storm/StormBackdrop'), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="fixed inset-0 z-0"
      style={{
        background: `linear-gradient(180deg, ${STORM.skyZenith} 0%, ${STORM.skyMid} 55%, ${STORM.skyHorizon} 100%)`,
      }}
    />
  ),
});

/**
 * WindArms V2 landing shell. The page is the SECTIONS registry: a fixed
 * storm-sky canvas behind, boot preloader in front, and every section
 * rendered from config — swap an entry, swap the page.
 */
export default function LandingV2View() {
  const navbarRef = useRef<HTMLElement>(null);
  const [bootDone, setBootDone] = useState(false);
  useScrollChoreography(navbarRef);

  return (
    <div className="relative min-h-screen bg-storm-abyss text-storm-marble">
      <StormBackdrop />

      {/* Readability veil: darkens gently toward the lower page */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] bg-[linear-gradient(180deg,rgba(10,21,34,0.18)_0%,rgba(10,21,34,0.05)_30%,rgba(10,21,34,0.42)_100%)]"
      />

      <Preloader onComplete={() => setBootDone(true)} />
      <V2Navbar ref={navbarRef} />

      <main className="relative z-10">
        {SECTIONS.map(({ id, Component }) => (
          <Component key={id} bootDone={bootDone} />
        ))}
      </main>
    </div>
  );
}
