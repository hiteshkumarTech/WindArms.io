'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { usePointerLock } from '@/hooks/usePointerLock';
import { useGripDebugEnabled } from '@/lib/v2/weapons/useGripDebugEnabled';
import { useIkDebugEnabled } from '@/lib/v2/weapons/useIkDebugEnabled';
import { useRangeKeyboardInput } from '@/lib/v2/range/useRangeKeyboardInput';
import { unlockVortexAudio } from '@/lib/v2/range/vortexAudio';
import KaelArmIkTunerPanel from './KaelArmIkTunerPanel';
import RangeHud from './RangeHud';
import VortexGripTunerPanel from './VortexGripTunerPanel';

const RangeScene = dynamic(() => import('@/components/three/range/RangeScene'), { ssr: false });

/**
 * `/v2/range` — the Vortex Rifle's first-playable vertical slice. Reuses
 * v1's generic `usePointerLock` hook (no v1-specific coupling in it) for
 * the click-to-capture affordance, same convention as `/play`'s `GameView`.
 * A wholly separate scene tree from both `/play` and the V2 landing page.
 */
export default function RangeView() {
  const { locked, request, setTarget } = usePointerLock();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRangeKeyboardInput();
  const gripDebugEnabled = useGripDebugEnabled();
  const ikDebugEnabled = useIkDebugEnabled();

  useEffect(() => {
    setTarget(containerRef.current);
  }, [setTarget]);

  const handleEnter = () => {
    unlockVortexAudio();
    request();
  };

  return (
    <div ref={containerRef} className="relative h-[100dvh] w-full overflow-hidden bg-storm-abyss">
      <RangeScene inputRef={inputRef} />
      {locked && <RangeHud />}
      {gripDebugEnabled && <VortexGripTunerPanel />}
      {ikDebugEnabled && <KaelArmIkTunerPanel />}
      {!locked && (
        <button
          type="button"
          onClick={handleEnter}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-storm-abyss/80 text-center text-white backdrop-blur-sm"
        >
          <span className="text-xs uppercase tracking-[0.3em] text-storm-energy">WindArms V2 — First Playable Weapon</span>
          <span className="text-3xl font-bold">Click to enter the range</span>
          <span className="max-w-md text-sm text-white/60">
            WASD move · Shift sprint · Space jump · mouse look
            <br />
            LMB fire · RMB aim · R reload · F inspect · Esc to release
          </span>
        </button>
      )}
    </div>
  );
}
